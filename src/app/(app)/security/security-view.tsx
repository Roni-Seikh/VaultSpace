"use client";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { KeyRound, LogOut, MonitorSmartphone, ShieldCheck, ShieldOff } from "lucide-react";
import { Badge, Card, PageHeader, Skeleton } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { DeleteAccount } from "@/components/account/delete-account";
import { StrengthMeter } from "@/components/vault/vault-gate";
import { useVault } from "@/components/vault/vault-provider";
import { api, errorMessage } from "@/lib/client/api";
import { assessPassphrase } from "@/lib/passphrase";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { formatDateTime, timeAgo } from "@/lib/format";
import { actionLabel } from "../dashboard/dashboard-view";

interface SessionRow { id: string; auth_session_id: string; device_label: string; created_at: string; last_seen_at: string }
interface EventRow { id: number; type: string; severity: "info" | "warning" | "critical"; created_at: string }
interface ShareAct { id: number; action: string; created_at: string }

export function SecurityView() {
  const toast = useToast();
  const vaultApi = useVault();
  const [data, setData] = useState<{ sessions: SessionRow[]; events: EventRow[]; sharingActivity: ShareAct[] } | null>(null);
  const [factor, setFactor] = useState<{ id: string; verified: boolean } | null | undefined>(undefined);

  const load = useCallback(async () => {
    try { setData(await api("/api/security")); } catch (e) { toast.error(errorMessage(e)); }
    const { data: f } = await supabaseBrowser().auth.mfa.listFactors();
    const totp = f?.totp?.[0] ?? f?.all?.find((x: { factor_type: string }) => x.factor_type === "totp");
    setFactor(totp ? { id: totp.id, verified: totp.status === "verified" } : null);
  }, [toast]);
  useEffect(() => { void load(); }, [load]);

  return (
    <>
      <PageHeader title="Security center" description="Review activity on your account and strengthen your protection." />
      <div className="grid gap-4 lg:grid-cols-2">
        <TwoFactorCard factor={factor} reload={load} />
        <PasswordCard />
        <VaultCard vault={vaultApi} />
        <SessionsCard sessions={data?.sessions} reload={load} />
        <Card>
          <h2 className="mb-3 font-semibold">Security events</h2>
          {!data ? <Skeleton className="h-24" /> : data.events.length === 0 ? <p className="text-sm text-muted">No security events recorded.</p> : (
            <ul className="divide-y divide-border">{data.events.map((e) => (
              <li key={e.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                <span className="flex items-center gap-2"><Badge tone={e.severity === "info" ? "neutral" : e.severity === "warning" ? "warn" : "danger"}>{e.severity}</Badge>{e.type.replace(/[._]/g, " ")}</span>
                <span className="text-xs text-muted">{timeAgo(e.created_at)}</span>
              </li>))}</ul>
          )}
        </Card>
        <Card>
          <h2 className="mb-3 font-semibold">Sharing activity</h2>
          {!data ? <Skeleton className="h-24" /> : data.sharingActivity.length === 0 ? <p className="text-sm text-muted">No sharing activity yet.</p> : (
            <ul className="divide-y divide-border">{data.sharingActivity.map((a) => <li key={a.id} className="flex items-center justify-between py-2.5 text-sm"><span>{actionLabel(a.action)}</span><span className="text-xs text-muted">{formatDateTime(a.created_at)}</span></li>)}</ul>
          )}
        </Card>
        <Card className="border-danger/40 lg:col-span-2">
          <h2 className="mb-2 font-semibold text-danger">Delete account</h2>
          <p className="mb-4 text-sm text-muted">Permanently remove your account, files and share links.</p>
          <DeleteAccount />
        </Card>
      </div>
    </>
  );
}

function TwoFactorCard({ factor, reload }: { factor: { id: string; verified: boolean } | null | undefined; reload: () => Promise<void> }) {
  const toast = useToast();
  const [enroll, setEnroll] = useState<{ id: string; qr: string; secret: string } | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    setBusy(true); setError(null);
    const sb = supabaseBrowser();
    // Remove a half-finished enrolment from a previous attempt.
    if (factor && !factor.verified) await sb.auth.mfa.unenroll({ factorId: factor.id });
    const { data, error: err } = await sb.auth.mfa.enroll({ factorType: "totp", friendlyName: `VaultSpace ${new Date().toISOString().slice(0, 10)}` });
    setBusy(false);
    if (err || !data) { setError(err?.message ?? "Could not start setup."); return; }
    setEnroll({ id: data.id, qr: data.totp.qr_code, secret: data.totp.secret });
  }
  async function verify(e: FormEvent) {
    e.preventDefault();
    if (!enroll) return;
    setBusy(true); setError(null);
    const { error: err } = await supabaseBrowser().auth.mfa.challengeAndVerify({ factorId: enroll.id, code });
    setBusy(false);
    if (err) { setError("That code is not valid. Try the newest code from your app."); return; }
    await api("/api/security/event", { body: { type: "mfa_enabled" } }).catch(() => undefined);
    toast.success("Two-factor authentication is on.");
    setEnroll(null); setCode(""); await reload();
  }
  async function disable() {
    if (!factor) return;
    setBusy(true);
    const { error: err } = await supabaseBrowser().auth.mfa.unenroll({ factorId: factor.id });
    setBusy(false);
    if (err) { toast.error(err.message); return; }
    await api("/api/security/event", { body: { type: "mfa_disabled" } }).catch(() => undefined);
    toast.info("Two-factor authentication is off."); await reload();
  }
  const on = factor?.verified;
  return (
    <Card>
      <div className="mb-3 flex items-center justify-between"><h2 className="font-semibold">Two-factor authentication</h2>{factor === undefined ? <Skeleton className="h-5 w-16" /> : <Badge tone={on ? "ok" : "warn"}>{on ? "On" : "Off"}</Badge>}</div>
      <p className="mb-4 text-sm text-muted">Require a code from an authenticator app (Google Authenticator, Authy, 1Password…) when you sign in.</p>
      {on ? <Button variant="outline" loading={busy} onClick={disable}><ShieldOff className="h-4 w-4" />Turn off</Button> : <Button loading={busy} onClick={start} disabled={factor === undefined}><ShieldCheck className="h-4 w-4" />Set up</Button>}
      {error && !enroll && <p role="alert" className="mt-3 text-sm text-danger">{error}</p>}
      <Dialog open={!!enroll} onClose={() => setEnroll(null)} title="Set up authenticator" size="sm">
        {enroll && (
          <form onSubmit={verify} className="space-y-4">
            <p className="text-sm text-muted">Scan this QR code with your authenticator app, then enter the 6-digit code.</p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={enroll.qr} alt="QR code for your authenticator app" className="mx-auto h-44 w-44 rounded-lg bg-white p-2" />
            <p className="break-all text-center font-mono text-xs text-muted">Or enter this key manually: {enroll.secret}</p>
            <Field label="6-digit code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} error={error} />
            <Button type="submit" className="w-full" loading={busy} disabled={code.length !== 6}>Verify and turn on</Button>
          </form>
        )}
      </Dialog>
    </Card>
  );
}

function PasswordCard() {
  const toast = useToast();
  const [pw, setPw] = useState(""); const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false); const [error, setError] = useState<string | null>(null);
  const valid = pw.length >= 10 && pw === confirm;
  async function submit(e: FormEvent) {
    e.preventDefault(); if (!valid) return;
    setBusy(true); setError(null);
    const { error: err } = await supabaseBrowser().auth.updateUser({ password: pw });
    setBusy(false);
    if (err) { setError(err.message); return; }
    await api("/api/security/event", { body: { type: "password_changed" } }).catch(() => undefined);
    toast.success("Account password changed."); setPw(""); setConfirm("");
  }
  return (
    <Card>
      <h2 className="mb-1 font-semibold">Account password</h2>
      <p className="mb-4 text-sm text-muted">The password you sign in with. Separate from your vault passphrase.</p>
      <form onSubmit={submit} className="space-y-3">
        <Field label="New password" type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} error={pw && pw.length < 10 ? "Use at least 10 characters." : null} />
        <Field label="Confirm new password" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} error={confirm && confirm !== pw ? "Passwords do not match." : null} />
        {error && <p role="alert" className="text-sm text-danger">{error}</p>}
        <Button type="submit" loading={busy} disabled={!valid}>Change password</Button>
      </form>
    </Card>
  );
}

function VaultCard({ vault }: { vault: ReturnType<typeof useVault> }) {
  const toast = useToast();
  const [mode, setMode] = useState<"pass" | "recovery" | null>(null);
  const [current, setCurrent] = useState(""); const [next, setNext] = useState("");
  const [busy, setBusy] = useState(false); const [error, setError] = useState<string | null>(null);
  const [newKey, setNewKey] = useState<string | null>(null);
  const close = () => { setMode(null); setCurrent(""); setNext(""); setError(null); setBusy(false); };

  async function submit(e: FormEvent) {
    e.preventDefault(); setBusy(true); setError(null);
    try {
      const cred = { type: "passphrase" as const, value: current };
      if (mode === "pass") {
        if (!assessPassphrase(next).ok) throw new Error("Choose a stronger new passphrase (12+ characters).");
        await vault.change(cred, next); toast.success("Vault passphrase changed."); close();
      } else {
        setNewKey(await vault.regenerateRecovery(cred)); close();
      }
    } catch (err) { setError(errorMessage(err)); setBusy(false); }
  }
  return (
    <Card>
      <div className="mb-1 flex items-center gap-2"><KeyRound className="h-4 w-4 text-brand" aria-hidden /><h2 className="font-semibold">Vault passphrase & recovery key</h2></div>
      <p className="mb-4 text-sm text-muted">Changing the passphrase re-protects your keys without re-encrypting files. A new recovery key replaces the old one immediately.</p>
      <div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => setMode("pass")}>Change passphrase</Button><Button variant="outline" onClick={() => setMode("recovery")}>New recovery key</Button></div>
      <Dialog open={!!mode} onClose={close} size="sm" title={mode === "pass" ? "Change vault passphrase" : "Generate a new recovery key"}>
        <form onSubmit={submit} className="space-y-4">
          <Field label="Current vault passphrase" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
          {mode === "pass" && <><Field label="New vault passphrase" type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} /><StrengthMeter passphrase={next} /></>}
          {error && <p role="alert" className="text-sm text-danger">{error}</p>}
          <Button type="submit" className="w-full" loading={busy} disabled={!current || (mode === "pass" && !next)}>{mode === "pass" ? "Change passphrase" : "Generate"}</Button>
        </form>
      </Dialog>
      <Dialog open={!!newKey} onClose={() => setNewKey(null)} size="sm" title="Your new recovery key" description="Save it now. It is shown only once and the old key no longer works."
        footer={<Button onClick={() => setNewKey(null)}>I have saved it</Button>}>
        <div className="select-all break-all rounded-xl border border-border bg-surface-2 p-4 text-center font-mono text-sm tracking-wider">{newKey}</div>
      </Dialog>
    </Card>
  );
}

function SessionsCard({ sessions, reload }: { sessions?: SessionRow[]; reload: () => Promise<void> }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  async function signOutOthers() {
    setBusy(true);
    const { error } = await supabaseBrowser().auth.signOut({ scope: "others" });
    if (error) toast.error(error.message);
    else { await api("/api/security/event", { body: { type: "sessions_revoked" } }).catch(() => undefined); toast.success("Signed out of all other devices."); await reload(); }
    setBusy(false);
  }
  return (
    <Card>
      <div className="mb-3 flex items-center justify-between gap-3"><h2 className="font-semibold">Active sessions</h2>
        <Button size="sm" variant="outline" loading={busy} onClick={signOutOthers}><LogOut className="h-4 w-4" />Sign out other devices</Button></div>
      {!sessions ? <Skeleton className="h-20" /> : sessions.length === 0 ? <p className="text-sm text-muted">No sessions recorded yet.</p> : (
        <ul className="divide-y divide-border">{sessions.map((s) => (
          <li key={s.id} className="flex items-center gap-3 py-2.5"><MonitorSmartphone className="h-5 w-5 shrink-0 text-muted" aria-hidden />
            <div className="min-w-0 flex-1"><div className="truncate text-sm font-medium">{s.device_label}</div><div className="text-xs text-muted">Signed in {formatDateTime(s.created_at)} · active {timeAgo(s.last_seen_at)}</div></div></li>
        ))}</ul>
      )}
    </Card>
  );
}
