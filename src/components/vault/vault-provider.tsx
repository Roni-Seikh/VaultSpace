"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { api } from "@/lib/client/api";
import {
  changePassphrase as cryptoChangePassphrase, createVault, regenerateRecoveryKey as cryptoRegenerate,
  unlockWithPassphrase, unlockWithRecoveryKey, type Credential, type UnlockedVault, type VaultMetadata,
} from "@/lib/crypto/keys";
import { CryptoError } from "@/lib/crypto/encoding";

export type VaultStatus = "loading" | "none" | "locked" | "unlocked" | "error";
const IDLE_LOCK_MS = 15 * 60 * 1000;

interface VaultApi {
  status: VaultStatus;
  vault: UnlockedVault | null;
  error: string | null;
  /** Creates the vault; resolves to the recovery key which must be shown once. */
  setup(passphrase: string): Promise<string>;
  unlock(passphrase: string): Promise<void>;
  /** Recover access: unlock with the recovery key and set a new passphrase. */
  recover(recoveryKey: string, newPassphrase: string): Promise<void>;
  change(current: Credential, newPassphrase: string): Promise<void>;
  regenerateRecovery(current: Credential): Promise<string>;
  lock(): void;
  reload(): Promise<void>;
}

const Ctx = createContext<VaultApi | null>(null);

export function VaultProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<VaultStatus>("loading");
  const [error, setError] = useState<string | null>(null);
  const [vault, setVault] = useState<UnlockedVault | null>(null);
  const meta = useRef<VaultMetadata | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const lock = useCallback(() => {
    setVault(null);
    setStatus((s) => (s === "unlocked" ? "locked" : s));
  }, []);

  const reload = useCallback(async () => {
    try {
      const r = await api<{ vault: VaultMetadata | null }>("/api/vault");
      meta.current = r.vault;
      setStatus(r.vault ? "locked" : "none");
      setError(null);
    } catch (e) {
      setError((e as Error).message);
      setStatus("error");
    }
  }, []);

  useEffect(() => { void reload(); }, [reload]);

  // Auto-lock after inactivity: keys only ever live in memory.
  useEffect(() => {
    if (status !== "unlocked") return;
    const reset = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(lock, IDLE_LOCK_MS);
    };
    reset();
    const events = ["pointerdown", "keydown", "visibilitychange"] as const;
    events.forEach((e) => window.addEventListener(e, reset));
    return () => {
      events.forEach((e) => window.removeEventListener(e, reset));
      if (timer.current) clearTimeout(timer.current);
    };
  }, [status, lock]);

  const value = useMemo<VaultApi>(() => ({
    status, vault, error, lock, reload,
    async setup(passphrase) {
      const created = await createVault(passphrase);
      await api("/api/vault", { body: created.metadata });
      meta.current = created.metadata;
      setVault(created.vault);
      setStatus("unlocked");
      return created.recoveryKey;
    },
    async unlock(passphrase) {
      if (!meta.current) throw new Error("No vault found.");
      try {
        const v = await unlockWithPassphrase(meta.current, passphrase);
        setVault(v);
        setStatus("unlocked");
      } catch (e) {
        if (e instanceof CryptoError && e.code === "WRONG_SECRET") {
          await api("/api/security/event", { body: { type: "unlock_failed" } }).catch(() => undefined);
        }
        throw e;
      }
    },
    async recover(recoveryKey, newPassphrase) {
      if (!meta.current) throw new Error("No vault found.");
      const v = await unlockWithRecoveryKey(meta.current, recoveryKey); // verifies the key first
      const next = await cryptoChangePassphrase(meta.current, { type: "recovery", value: recoveryKey }, newPassphrase);
      await api("/api/vault", { method: "PUT", body: { vault: next, reason: "passphrase_changed" } });
      meta.current = next;
      setVault(v);
      setStatus("unlocked");
    },
    async change(current, newPassphrase) {
      if (!meta.current) throw new Error("No vault found.");
      const next = await cryptoChangePassphrase(meta.current, current, newPassphrase);
      await api("/api/vault", { method: "PUT", body: { vault: next, reason: "passphrase_changed" } });
      meta.current = next;
    },
    async regenerateRecovery(current) {
      if (!meta.current) throw new Error("No vault found.");
      const r = await cryptoRegenerate(meta.current, current);
      await api("/api/vault", { method: "PUT", body: { vault: r.metadata, reason: "recovery_regenerated" } });
      meta.current = r.metadata;
      return r.recoveryKey;
    },
  }), [status, vault, error, lock, reload]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useVault(): VaultApi {
  const c = useContext(Ctx);
  if (!c) throw new Error("useVault must be used inside <VaultProvider>");
  return c;
}
