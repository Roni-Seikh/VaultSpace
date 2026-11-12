"use client";
import { useState, type FormEvent, type ReactNode } from "react";
import { AlertTriangle, Copy, Download, KeyRound, Loader2, LockKeyhole, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/input";
import { Card, ErrorState } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import { CryptoError } from "@/lib/crypto/encoding";
import { assessPassphrase } from "@/lib/passphrase";
import { cn } from "@/lib/utils";
import { useVault } from "./vault-provider";

function Shell({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <div className="mx-auto flex min-h-[70vh] max-w-lg items-center px-4">
      <Card className="w-full space-y-5 p-6 sm:p-8">
        <div className="flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-xl bg-brand/15 text-brand">{icon}</div>
          <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        </div>
        {children}
      </Card>
    </div>
  );
}

export function StrengthMeter({ passphrase }: { passphrase: string }) {
  const s = assessPassphrase(passphrase);
  if (!passphrase) return null;
  const colors = ["bg-danger", "bg-danger", "bg-warn", "bg-ok", "bg-ok"];
  return (
    <div className="space-y-1" aria-live="polite">
      <div className="flex gap-1" aria-hidden>
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className={cn("h-1.5 flex-1 rounded-full", s.score >= i ? colors[s.score] : "bg-surface-2")} />
        ))}
      </div>
      <p className="text-xs text-muted"><span className="font-medium text-fg">{s.label}</span>{s.label && " · "}{s.hint}</p>
    </div>
  );
}

function RecoveryKeyScreen({ recoveryKey, onDone }: { recoveryKey: string; onDone: () => void }) {
  const toast = useToast();
  const [saved, setSaved] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(recoveryKey); toast.success("Recovery key copied."); }
    catch { toast.error("Could not copy. Select the key and copy it manually."); }
  };
  const download = () => {
    const text = `VaultSpace recovery key\n\n${recoveryKey}\n\nKeep this file somewhere safe and private (for example a password manager or a printed copy).\nAnyone with this key can unlock your vault. If you lose BOTH your vault passphrase and this key, your files cannot be recovered by anyone, including VaultSpace.\n`;
    const url = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
    const a = document.createElement("a");
    a.href = url; a.download = "vaultspace-recovery-key.txt"; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  };
  return (
    <Shell icon={<KeyRound className="h-5 w-5" />} title="Save your recovery key">
      <p className="text-sm text-muted">This key is the <strong className="text-fg">only way</strong> to get your files back if you forget your passphrase. It is shown once and is not stored anywhere.</p>
      <div className="select-all break-all rounded-xl border border-border bg-surface-2 p-4 text-center font-mono text-sm tracking-wider" data-testid="recovery-key">{recoveryKey}</div>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={copy}><Copy className="h-4 w-4" />Copy</Button>
        <Button variant="outline" onClick={download}><Download className="h-4 w-4" />Download .txt</Button>
      </div>
      <div className="flex gap-2 rounded-xl border border-warn/40 bg-warn/10 p-3 text-sm">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warn" aria-hidden />
        <p>If you lose both your passphrase <em>and</em> this key, your files are permanently unreadable. We cannot reset it.</p>
      </div>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" className="mt-1 h-4 w-4" checked={saved} onChange={(e) => setSaved(e.target.checked)} />
        I have saved my recovery key in a safe place.
      </label>
      <Button className="w-full" disabled={!saved} onClick={onDone}>Continue to my vault</Button>
    </Shell>
  );
}

function SetupForm({ onCreated }: { onCreated: (key: string) => void }) {
  const { setup } = useVault();
  const [pass, setPass] = useState("");
  const [confirm, setConfirm] = useState("");
  const [ack, setAck] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const strength = assessPassphrase(pass);
  const mismatch = confirm.length > 0 && confirm !== pass;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!strength.ok || pass !== confirm || !ack) return;
    setBusy(true); setError(null);
    try { onCreated(await setup(pass)); }
    catch (err) { setError((err as Error).message); setBusy(false); }
  }

  return (
    <Shell icon={<ShieldCheck className="h-5 w-5" />} title="Create your vault passphrase">
      <p className="text-sm text-muted">Your files are encrypted in this browser with a key protected by this passphrase. It is <strong className="text-fg">separate from your login password</strong> and never leaves your device.</p>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <Field label="Vault passphrase" type="password" autoComplete="new-password" value={pass} onChange={(e) => setPass(e.target.value)} />
        <StrengthMeter passphrase={pass} />
        <Field label="Confirm passphrase" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} error={mismatch ? "Passphrases do not match." : null} />
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" className="mt-1 h-4 w-4" checked={ack} onChange={(e) => setAck(e.target.checked)} />
          I understand VaultSpace cannot reset this passphrase, and I will get a recovery key next.
        </label>
        {error && <p role="alert" className="text-sm text-danger">{error}</p>}
        <Button type="submit" className="w-full" loading={busy} disabled={!strength.ok || pass !== confirm || !ack}>
          {busy ? "Creating vault…" : "Create vault"}
        </Button>
      </form>
    </Shell>
  );
}

function UnlockForm() {
  const { unlock, recover } = useVault();
  const [mode, setMode] = useState<"pass" | "recovery">("pass");
  const [pass, setPass] = useState("");
  const [recoveryKey, setRecoveryKey] = useState("");
  const [newPass, setNewPass] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      if (mode === "pass") await unlock(pass);
      else {
        if (!assessPassphrase(newPass).ok) throw new Error("Choose a stronger new passphrase (12+ characters).");
        await recover(recoveryKey, newPass);
      }
    } catch (err) {
      setError(err instanceof CryptoError ? err.message : (err as Error).message);
      setBusy(false);
    }
  }

  return (
    <Shell icon={<LockKeyhole className="h-5 w-5" />} title={mode === "pass" ? "Unlock your vault" : "Recover your vault"}>
      <p className="text-sm text-muted">{mode === "pass" ? "Enter your vault passphrase to decrypt your files in this browser." : "Enter your recovery key and choose a new passphrase."}</p>
      <form onSubmit={submit} className="space-y-4">
        {mode === "pass" ? (
          <Field label="Vault passphrase" type="password" autoComplete="current-password" autoFocus value={pass} onChange={(e) => setPass(e.target.value)} />
        ) : (
          <>
            <Field label="Recovery key" autoComplete="off" spellCheck={false} placeholder="XXXX-XXXX-XXXX-…" value={recoveryKey} onChange={(e) => setRecoveryKey(e.target.value)} className="font-mono" />
            <Field label="New vault passphrase" type="password" autoComplete="new-password" value={newPass} onChange={(e) => setNewPass(e.target.value)} />
            <StrengthMeter passphrase={newPass} />
          </>
        )}
        {error && <p role="alert" className="text-sm text-danger">{error}</p>}
        <Button type="submit" className="w-full" loading={busy} disabled={mode === "pass" ? !pass : !recoveryKey || !newPass}>
          {busy ? "Deriving key…" : mode === "pass" ? "Unlock" : "Recover and unlock"}
        </Button>
      </form>
      <button className="text-sm text-brand hover:underline" onClick={() => { setMode(mode === "pass" ? "recovery" : "pass"); setError(null); }}>
        {mode === "pass" ? "Forgot your passphrase? Use your recovery key" : "Back to passphrase"}
      </button>
    </Shell>
  );
}

export function VaultGate({ children }: { children: ReactNode }) {
  const { status, error, reload } = useVault();
  const [pendingKey, setPendingKey] = useState<string | null>(null);

  if (pendingKey) return <RecoveryKeyScreen recoveryKey={pendingKey} onDone={() => setPendingKey(null)} />;
  if (status === "loading") {
    return <div className="grid min-h-[60vh] place-items-center text-muted"><Loader2 className="h-6 w-6 animate-spin" aria-label="Loading" /></div>;
  }
  if (status === "error") return <div className="mx-auto max-w-lg p-6"><ErrorState message={error ?? "Could not load your vault."} onRetry={reload} /></div>;
  if (status === "none") return <SetupForm onCreated={setPendingKey} />;
  if (status === "locked") return <UnlockForm />;
  return <>{children}</>;
}
