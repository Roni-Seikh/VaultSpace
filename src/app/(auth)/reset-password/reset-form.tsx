"use client";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { AuthCard, FormMessage } from "@/components/auth/auth-card";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/input";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { api } from "@/lib/client/api";

export function ResetForm() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const valid = password.length >= 10 && password === confirm;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!valid) return;
    setBusy(true); setError(null);
    const { error: err } = await supabaseBrowser().auth.updateUser({ password });
    if (err) { setError(/session/i.test(err.message) ? "Your reset link has expired. Please request a new one." : err.message); setBusy(false); return; }
    await api("/api/security/event", { body: { type: "password_changed" } }).catch(() => undefined);
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <AuthCard title="Choose a new password" subtitle="Use at least 10 characters.">
      <form onSubmit={submit} className="space-y-4" noValidate>
        {error && <FormMessage tone="error">{error}</FormMessage>}
        <Field label="New password" type="password" autoComplete="new-password" required value={password} onChange={(e) => setPassword(e.target.value)} error={password && password.length < 10 ? "Use at least 10 characters." : null} />
        <Field label="Confirm new password" type="password" autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} error={confirm && confirm !== password ? "Passwords do not match." : null} />
        <Button type="submit" className="w-full" size="lg" loading={busy} disabled={!valid}>Update password</Button>
      </form>
    </AuthCard>
  );
}
