"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Activity, FileStack, HardDrive, Upload } from "lucide-react";
import { Card, ErrorState, PageHeader, Progress, Skeleton, EmptyState } from "@/components/ui/misc";
import { LinkButton } from "@/components/ui/button";
import { CATEGORY_COLORS, Donut } from "@/components/ui/charts";
import { CategoryIcon, categoryPlural } from "@/components/files/file-icons";
import { useLibrary } from "@/components/vault/library-provider";
import { useProfile } from "@/components/layout/app-shell";
import { api } from "@/lib/client/api";
import type { ActivityItem } from "@/lib/client/types";
import { MIME_CATEGORIES } from "@/lib/files/types";
import { formatBytes, percent, timeAgo } from "@/lib/format";

const ACTION_LABELS: Record<string, string> = {
  "auth.login": "Signed in", "auth.logout": "Signed out", "auth.password_changed": "Password changed", "auth.mfa_enabled": "Two-factor enabled", "auth.mfa_disabled": "Two-factor disabled",
  "vault.created": "Vault created", "vault.passphrase_changed": "Vault passphrase changed", "vault.recovery_regenerated": "Recovery key regenerated",
  "file.upload": "Uploaded a file", "file.download": "Downloaded a file", "file.delete": "Deleted a file", "file.rename": "Renamed a file", "file.move": "Moved a file", "file.copy": "Copied a file",
  "file.version_restore": "Restored a version", "file.version_delete": "Deleted a version", "folder.create": "Created a folder", "folder.delete": "Deleted a folder", "folder.update": "Updated a folder",
  "share.create": "Created a share link", "share.revoke": "Revoked a share link", "share.access": "Share link opened", "settings.update": "Updated settings", "account.delete": "Account deleted",
};
export const actionLabel = (a: string) => ACTION_LABELS[a] ?? a;

export function DashboardView() {
  const { files, storage, loading, error, refresh } = useLibrary();
  const { profile } = useProfile();
  const [activity, setActivity] = useState<ActivityItem[] | null>(null);

  useEffect(() => { api<{ activity: ActivityItem[] }>("/api/activity?limit=8").then((r) => setActivity(r.activity)).catch(() => setActivity([])); }, []);

  const byCat = useMemo(() => MIME_CATEGORIES.map((c) => ({ c, n: files.filter((f) => f.category === c).length, bytes: files.filter((f) => f.category === c).reduce((s, f) => s + f.size, 0) })), [files]);
  const recent = useMemo(() => [...files].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 5), [files]);

  const header = <PageHeader title={`Welcome${profile?.displayName ? `, ${profile.displayName}` : ""}`} description="Your private storage at a glance." actions={<LinkButton href="/files"><Upload className="h-4 w-4" />Upload files</LinkButton>} />;
  if (loading) return <>{header}<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-28" />)}</div></>;
  if (error || !storage) return <>{header}<ErrorState message={error ?? "Could not load storage information."} onRetry={refresh} /></>;

  const used = storage.usedBytes + storage.reservedBytes;
  const pct = percent(used, storage.quotaBytes);

  return (
    <>
      {header}
      {storage.serviceFull && <p role="alert" className="mb-4 rounded-xl border border-warn/40 bg-warn/10 px-4 py-3 text-sm">VaultSpace is at overall capacity, so new uploads are paused. Your existing files are safe and available.</p>}
      {pct >= 90 && <p role="alert" className="mb-4 rounded-xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">{pct >= 100 ? "Your storage is full." : `You have used ${pct.toFixed(0)}% of your storage.`} Delete files or old versions to free up space.</p>}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { icon: HardDrive, label: "Total storage", value: formatBytes(storage.quotaBytes) },
          { icon: Activity, label: "Used", value: formatBytes(used) },
          { icon: HardDrive, label: "Available", value: formatBytes(storage.remainingBytes) },
          { icon: FileStack, label: "Files", value: String(storage.fileCount) },
        ].map(({ icon: Icon, label, value }) => (
          <Card key={label}><div className="flex items-center gap-3 text-sm text-muted"><Icon className="h-4 w-4" aria-hidden />{label}</div><div className="mt-2 text-2xl font-semibold tabular-nums">{value}</div></Card>
        ))}
      </div>
      <Card className="mt-4">
        <div className="mb-2 flex items-center justify-between text-sm"><span className="font-medium">Storage usage</span><span className="text-muted">{pct.toFixed(1)}%</span></div>
        <Progress value={pct} label="Storage used" />
        <p className="mt-2 text-xs text-muted">Sizes are for encrypted data, which is slightly larger than your original files. Every stored version counts.</p>
      </Card>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="mb-4 font-semibold">File categories</h2>
          {files.length === 0 ? <p className="text-sm text-muted">Upload some files to see a breakdown.</p> : (
            <Donut centerLabel="files" centerValue={String(files.length)} slices={byCat.filter((x) => x.n > 0).map((x) => ({ label: `${categoryPlural(x.c)} · ${formatBytes(x.bytes)}`, value: x.n, color: CATEGORY_COLORS[x.c] }))} />
          )}
        </Card>
        <Card>
          <div className="mb-4 flex items-center justify-between"><h2 className="font-semibold">Recent uploads</h2><Link href="/files" className="text-sm text-brand hover:underline">View all</Link></div>
          {recent.length === 0 ? <EmptyState icon={<Upload className="h-5 w-5" />} title="Nothing uploaded yet" /> : (
            <ul className="space-y-3">
              {recent.map((f) => (
                <li key={f.id} className="flex items-center gap-3"><CategoryIcon category={f.category} className="h-9 w-9" />
                  <div className="min-w-0 flex-1"><div className="truncate text-sm font-medium">{f.name}</div><div className="text-xs text-muted">{formatBytes(f.size)} · {timeAgo(f.createdAt)}</div></div></li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card className="mt-4">
        <div className="mb-4 flex items-center justify-between"><h2 className="font-semibold">Recent activity</h2><Link href="/security" className="text-sm text-brand hover:underline">Security center</Link></div>
        {!activity ? <Skeleton className="h-20" /> : activity.length === 0 ? <p className="text-sm text-muted">No activity yet.</p> : (
          <ul className="divide-y divide-border">
            {activity.map((a) => <li key={a.id} className="flex items-center justify-between gap-3 py-2.5 text-sm"><span>{actionLabel(a.action)}</span><span className="text-xs text-muted">{timeAgo(a.created_at)}</span></li>)}
          </ul>
        )}
      </Card>
    </>
  );
}
