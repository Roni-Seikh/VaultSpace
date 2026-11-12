"use client";
import { useState, type FormEvent } from "react";
import Link from "next/link";
import { AuthCard, FormMessage } from "@/components/auth/auth-card";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/input";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { isConfigured } from "@/lib/env";

export function ForgotForm() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!isConfigured()) { setError("This VaultSpace server is not configured yet."); return; }
    setBusy(true); setError(null);
    const { error: err } = await supabaseBrowser().auth.resetPasswordForEmail(email.trim().toLowerCase(), {
      redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
    });
    setBusy(false);
    // Always show the same message so the form cannot be used to discover which emails are registered.
    if (err && err.status === 429) { setError("Too many requests. Please wait a few minutes and try again."); return; }
    setDone(true);
  }

  return (
    <AuthCard
      title="Reset your password"
      subtitle="Enter your email and we will send you a reset link."
      footer={<Link href="/login" className="font-medium text-brand hover:underline">Back to sign in</Link>}
    >
      {done ? (
        <FormMessage tone="ok">If an account exists for that email, a reset link is on its way.</FormMessage>
      ) : (
        <form onSubmit={submit} className="space-y-4" noValidate>
          {error && <FormMessage tone="error">{error}</FormMessage>}
          <Field label="Email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          <Button type="submit" className="w-full" size="lg" loading={busy} disabled={!email}>Send reset link</Button>
        </form>
      )}
      <p className="text-xs text-muted">Resetting your account password does <strong>not</strong> reset your vault passphrase. Your files can only be unlocked with that passphrase or your recovery key.</p>
    </AuthCard>
  );
}
