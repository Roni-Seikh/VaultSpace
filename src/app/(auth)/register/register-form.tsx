"use client";
import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MailCheck } from "lucide-react";
import { AuthCard, FormMessage } from "@/components/auth/auth-card";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/input";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { isConfigured } from "@/lib/env";
import { api } from "@/lib/client/api";

export const MIN_ACCOUNT_PASSWORD = 10;

export function RegisterForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  const pwError = password && password.length < MIN_ACCOUNT_PASSWORD ? `Use at least ${MIN_ACCOUNT_PASSWORD} characters.` : null;
  const matchError = confirm && confirm !== password ? "Passwords do not match." : null;
  const valid = !!email && password.length >= MIN_ACCOUNT_PASSWORD && password === confirm;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!valid) return;
    if (!isConfigured()) { setError("This VaultSpace server is not configured yet. Add your Supabase keys to .env.local."); return; }
    setBusy(true); setError(null);
    const { data, error: err } = await supabaseBrowser().auth.signUp({
      email: email.trim().toLowerCase(),
      password,
      options: { data: { display_name: name.trim().slice(0, 80) }, emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    if (err) { setError(err.message); setBusy(false); return; }
    if (data.session) {
      // Email confirmation is disabled on this project: signed in immediately.
      await api("/api/security/event", { body: { type: "login" } }).catch(() => undefined);
      router.push("/dashboard");
      router.refresh();
      return;
    }
    setSent(true);
    setBusy(false);
  }

  if (sent) {
    return (
      <AuthCard title="Check your email" footer={<Link href="/login" className="font-medium text-brand hover:underline">Back to sign in</Link>}>
        <div className="flex flex-col items-center gap-3 py-2 text-center">
          <div className="grid h-14 w-14 place-items-center rounded-2xl bg-brand/15 text-brand"><MailCheck className="h-7 w-7" /></div>
          <p className="text-sm text-muted">We sent a confirmation link to <strong className="text-fg">{email}</strong>. Click it to activate your account, then sign in.</p>
        </div>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title="Create your account"
      subtitle="1 GB of private storage, encrypted in your browser."
      footer={<>Already have an account? <Link href="/login" className="font-medium text-brand hover:underline">Sign in</Link></>}
    >
      <form onSubmit={submit} className="space-y-4" noValidate>
        {error && <FormMessage tone="error">{error}</FormMessage>}
        <Field label="Name (optional)" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
        <Field label="Email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        <Field label="Account password" type="password" autoComplete="new-password" required value={password} onChange={(e) => setPassword(e.target.value)} error={pwError} hint="This signs you in. You will create a separate vault passphrase after signing in." />
        <Field label="Confirm password" type="password" autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} error={matchError} />
        <Button type="submit" className="w-full" size="lg" loading={busy} disabled={!valid}>Create account</Button>
        <p className="text-center text-xs text-muted">By creating an account you agree to use VaultSpace lawfully. Storage is limited and not guaranteed.</p>
      </form>
    </AuthCard>
  );
}
