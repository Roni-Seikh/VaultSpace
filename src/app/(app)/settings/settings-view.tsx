"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/input";
import { Card, PageHeader, Progress, Skeleton } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import { DeleteAccount } from "@/components/account/delete-account";
import { useProfile } from "@/components/layout/app-shell";
import { useLibrary } from "@/components/vault/library-provider";
import { api, errorMessage } from "@/lib/client/api";
import { formatBytes, formatDate, percent } from "@/lib/format";
import type { Profile } from "@/lib/client/types";

function Toggle({ label, hint, checked, onChange }: { label: string; hint: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-4 py-3">
      <span><span className="block text-sm font-medium">{label}</span><span className="block text-xs text-muted">{hint}</span></span>
      <input type="checkbox" role="switch" className="mt-1 h-5 w-5 shrink-0" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    </label>
  );
}

export function SettingsView() {
  const { profile, reload } = useProfile();
  const { storage } = useLibrary();
  const { setTheme } = useTheme();
  const toast = useToast();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (profile) setName(profile.displayName); }, [profile]);

  async function save(patch: Record<string, unknown>, message = "Saved.") {
    try { await api<{ profile: Profile }>("/api/settings", { method: "PATCH", body: patch }); await reload(); toast.success(message); }
    catch (e) { toast.error(errorMessage(e)); }
  }

  if (!profile) return <><PageHeader title="Settings" /><Skeleton className="h-64" /></>;
  const pct = storage ? percent(storage.usedBytes + storage.reservedBytes, storage.quotaBytes) : 0;

  return (
    <>
      <PageHeader title="Settings" description="Manage your profile, appearance and notifications." />
      <div className="grid max-w-3xl gap-4">
        <Card>
          <h2 className="mb-4 font-semibold">Profile</h2>
          <form className="space-y-4" onSubmit={async (e) => { e.preventDefault(); setBusy(true); await save({ displayName: name }, "Profile updated."); setBusy(false); }}>
            <Field label="Display name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
            <Field label="Email" value={profile.email} readOnly disabled hint="Your sign-in email. Member since " />
            <p className="-mt-3 text-xs text-muted">Member since {formatDate(profile.createdAt)}</p>
            <Button type="submit" loading={busy} disabled={name === profile.displayName}>Save profile</Button>
          </form>
        </Card>

        <Card>
          <h2 className="mb-3 font-semibold">Appearance</h2>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Theme">
            {(["system", "light", "dark"] as const).map((t) => (
              <button key={t} role="radio" aria-checked={profile.theme === t} onClick={() => { setTheme(t); void save({ theme: t }, "Theme saved."); }}
                className={`rounded-xl border px-4 py-2 text-sm capitalize ${profile.theme === t ? "border-brand bg-brand/10 text-brand" : "border-border text-muted hover:text-fg"}`}>{t}</button>
            ))}
          </div>
        </Card>

        <Card>
          <h2 className="mb-1 font-semibold">Notifications</h2>
          <p className="mb-2 text-xs text-muted">Controls which alerts appear inside VaultSpace.</p>
          <div className="divide-y divide-border">
            <Toggle label="Storage alerts" hint="Warn me when my storage is nearly full." checked={profile.notifyStorage} onChange={(v) => void save({ notifyStorage: v })} />
            <Toggle label="Security alerts" hint="Show important security events." checked={profile.notifySecurity} onChange={(v) => void save({ notifySecurity: v })} />
            <Toggle label="Sharing activity" hint="Show when my shared links are opened." checked={profile.notifySharing} onChange={(v) => void save({ notifySharing: v })} />
          </div>
        </Card>

        <Card>
          <h2 className="mb-3 font-semibold">Storage</h2>
          {storage && (
            <div className="space-y-2">
              <Progress value={pct} label="Storage used" />
              <p className="text-sm text-muted">{formatBytes(storage.usedBytes)} used of {formatBytes(storage.quotaBytes)} · {formatBytes(storage.remainingBytes)} available · {storage.fileCount} files</p>
              <p className="text-xs text-muted">Maximum file size: {formatBytes(storage.maxFileBytes)} (encrypted size).</p>
            </div>
          )}
        </Card>

        <Card>
          <h2 className="mb-2 font-semibold">Security</h2>
          <p className="mb-3 text-sm text-muted">Change your password, enable two-factor authentication, manage your vault passphrase and recovery key, and review sessions.</p>
          <Link href="/security" className="text-sm font-medium text-brand hover:underline">Open the Security center</Link>
        </Card>

        <Card className="border-danger/40">
          <h2 className="mb-2 font-semibold text-danger">Danger zone</h2>
          <p className="mb-4 text-sm text-muted">Permanently delete your account and everything in it.</p>
          <DeleteAccount />
        </Card>
      </div>
    </>
  );
}
