"use client";
import { useState } from "react";
import { AlertTriangle, Check, Copy } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { useVault } from "@/components/vault/vault-provider";
import { api, errorMessage } from "@/lib/client/api";
import { unwrapFileKey } from "@/lib/crypto/keys";
import {
  buildShareUrl, derivePasswordMaterial, deriveShareWrapKey, encryptShareName, generatePasswordSalt, generateShareSecret,
  wrapFileKeyForShare,
} from "@/lib/crypto/share-keys";
import type { FileItem } from "@/lib/client/types";

const EXPIRIES = [
  { label: "1 hour", ms: 3_600_000 }, { label: "1 day", ms: 86_400_000 }, { label: "7 days", ms: 7 * 86_400_000 },
  { label: "30 days", ms: 30 * 86_400_000 },
] as const;

export function ShareDialog({ file, onClose, onCreated }: { file: FileItem | null; onClose: () => void; onCreated?: () => void }) {
  const { vault } = useVault();
  const toast = useToast();
  const [expiry, setExpiry] = useState<number>(86_400_000 * 7);
  const [canDownload, setCanDownload] = useState(true);
  const [usePassword, setUsePassword] = useState(false);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const reset = () => { setLink(null); setPassword(""); setUsePassword(false); setError(null); setCopied(false); setBusy(false); };
  const close = () => { reset(); onClose(); };

  async function create() {
    if (!file || !vault) return;
    if (usePassword && password.length < 8) { setError("Use a password of at least 8 characters."); return; }
    setBusy(true); setError(null);
    try {
      const { wrappedFileKey } = await api<{ wrappedFileKey: string }>(`/api/files/${file.id}/key`);
      const fileKey = await unwrapFileKey(vault, wrappedFileKey, true);
      const secret = generateShareSecret();
      let pw: { salt: string; gateToken: string } | null = null;
      let pwKey: Uint8Array<ArrayBuffer> | undefined;
      if (usePassword) {
        const salt = generatePasswordSalt();
        const m = await derivePasswordMaterial(password, salt);
        pw = { salt, gateToken: m.gateToken };
        pwKey = m.pwKey;
      }
      const wrap = await deriveShareWrapKey(secret, pwKey);
      const res = await api<{ id: string; token: string }>("/api/shares", {
        body: {
          fileId: file.id,
          expiresAt: new Date(Date.now() + expiry).toISOString(),
          canDownload,
          wrappedFileKey: await wrapFileKeyForShare(fileKey, wrap),
          nameEnc: await encryptShareName(file.name, wrap),
          password: pw,
        },
      });
      setLink(buildShareUrl(window.location.origin, res.token, secret));
      onCreated?.();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    if (!link) return;
    try { await navigator.clipboard.writeText(link); setCopied(true); toast.success("Link copied."); }
    catch { toast.error("Could not copy automatically. Select the link and copy it."); }
  }

  return (
    <Dialog open={!!file} onClose={close} title="Share securely" description={file?.name}
      footer={link ? <Button onClick={close}>Done</Button> : <><Button variant="ghost" onClick={close}>Cancel</Button><Button loading={busy} onClick={create}>Create link</Button></>}>
      {link ? (
        <div className="space-y-4">
          <p className="text-sm text-muted">Anyone with this <strong className="text-fg">complete</strong> link can open the file{usePassword ? " (they will also need the password)" : ""}. It is shown only now. The key is inside the link and is never stored on our servers.</p>
          <div className="select-all break-all rounded-xl border border-border bg-surface-2 p-3 font-mono text-xs" data-testid="share-link">{link}</div>
          <Button variant="outline" onClick={copy}>{copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}{copied ? "Copied" : "Copy link"}</Button>
        </div>
      ) : (
        <div className="space-y-5">
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Link expires after</legend>
            <div className="flex flex-wrap gap-2">
              {EXPIRIES.map((e) => (
                <label key={e.label} className={`cursor-pointer rounded-lg border px-3 py-1.5 text-sm ${expiry === e.ms ? "border-brand bg-brand/10 text-brand" : "border-border"}`}>
                  <input type="radio" name="expiry" className="sr-only" checked={expiry === e.ms} onChange={() => setExpiry(e.ms)} />{e.label}
                </label>
              ))}
            </div>
          </fieldset>
          <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1 h-4 w-4" checked={canDownload} onChange={(e) => setCanDownload(e.target.checked)} />
            <span>Allow download<span className="block text-xs text-muted">If off, the page only displays the file. This is an interface restriction: a determined recipient could still save what their browser displays.</span></span>
          </label>
          <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1 h-4 w-4" checked={usePassword} onChange={(e) => setUsePassword(e.target.checked)} />
            <span>Require a password<span className="block text-xs text-muted">Share the password separately. It also strengthens the encryption of the link.</span></span>
          </label>
          {usePassword && <Field label="Link password" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />}
          <div className="flex gap-2 rounded-xl border border-warn/40 bg-warn/10 p-3 text-xs">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warn" aria-hidden />
            <p>Revoking a link stops new access, but cannot un-share a file someone already downloaded.</p>
          </div>
          {error && <p role="alert" className="text-sm text-danger">{error}</p>}
        </div>
      )}
    </Dialog>
  );
}
