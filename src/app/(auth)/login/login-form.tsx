"use client";
import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AuthCard, FormMessage } from "@/components/auth/auth-card";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/input";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { api } from "@/lib/client/api";
import { isConfigured } from "@/lib/env";

const PAGE_ERRORS: Record<string, string> = {
  not_configured: "This VaultSpace server is not configured yet. Add your Supabase keys to .env.local (see the README).",
  link_invalid: "That link is invalid or has expired. Please request a new one.",
};

export function safeNext(next: string | null): string {
  return next && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\") ? next : "/dashboard";
}

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params.get("next"));
  const pageError = params.get("error");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [factorId, setFactorId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(pageError ? (PAGE_ERRORS[pageError] ?? null) : null);
  const [busy, setBusy] = useState(false);

  async function finish() {
    await api("/api/security/event", { body: { type: "login" } }).catch(() => undefined);
    router.push(next);
    router.refresh();
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!isConfigured()) { setError(PAGE_ERRORS.not_configured); return; }
    setBusy(true);
    try {
      const sb = supabaseBrowser();
      if (factorId) {
        const { error: err } = await sb.auth.mfa.challengeAndVerify({ factorId, code: code.trim() });
        if (err) throw new Error("That code is not valid. Check your authenticator app and try again.");
        await finish();
        return;
      }
      const { error: err } = await sb.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
      if (err) {
        throw new Error(/confirm/i.test(err.message) ? "Please verify your email address first. Check your inbox for the confirmation link." : "Incorrect email or password.");
      }
      const { data } = await sb.auth.mfa.getAuthenticatorAssuranceLevel();
      if (data?.nextLevel === "aal2" && data.currentLevel !== "aal2") {
        const { data: factors } = await sb.auth.mfa.listFactors();
        const totp = factors?.totp?.[0];
        if (!totp) throw new Error("Two-factor authentication is required but no authenticator was found.");
        setFactorId(totp.id);
        setBusy(false);
        return;
      }
      await finish();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <AuthCard
      title={factorId ? "Two-factor verification" : "Welcome back"}
      subtitle={factorId ? "Enter the 6-digit code from your authenticator app." : "Sign in to your private space."}
      footer={<>New to VaultSpace? <Link href="/register" className="font-medium text-brand hover:underline">Create an account</Link></>}
    >
      <form onSubmit={submit} className="space-y-4" noValidate>
        {error && <FormMessage tone="error">{error}</FormMessage>}
        {factorId ? (
          <Field label="Authentication code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} autoFocus value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} />
        ) : (
          <>
            <Field label="Email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            <Field label="Password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
            <div className="text-right"><Link href="/forgot-password" className="text-sm text-brand hover:underline">Forgot password?</Link></div>
          </>
        )}
        <Button type="submit" className="w-full" size="lg" loading={busy} disabled={factorId ? code.length !== 6 : !email || !password}>
          {factorId ? "Verify" : "Sign in"}
        </Button>
      </form>
    </AuthCard>
  );
}
