"use client";
import { useEffect, useState } from "react";
import { Activity, Database, FileStack, Link2, ShieldAlert, Users } from "lucide-react";
import { Badge, Card, ErrorState, PageHeader, Progress, Skeleton } from "@/components/ui/misc";
import { BarChart } from "@/components/ui/charts";
import { useProfile } from "@/components/layout/app-shell";
import { api, errorMessage } from "@/lib/client/api";
import { formatBytes, formatDateTime, percent } from "@/lib/format";

interface Overview {
  users: number; admins: number; files: number; active_shares: number;
  capacity: { max_bytes: number; used_bytes: number; reserved_bytes: number; max_file_bytes: number };
  signups_by_day: { day: string; count: number }[]; uploads_by_day: { day: string; count: number }[];
}
interface Health { database: "ok" | "error"; databaseLatencyMs: number; objectStorageConfigured: boolean; cronConfigured: boolean }
interface UserRow { id: string; email: string; role: string; quotaBytes: number; usedBytes: number; fileCount: number; createdAt: string }
interface EventRow { id: number; user_id: string | null; type: string; severity: "info" | "warning" | "critical"; created_at: string }

const short = (d: string) => new Date(d).toLocaleDateString(undefined, { month: "short", day: "numeric" });

export function AdminView() {
  const { profile } = useProfile();
  const [ov, setOv] = useState<{ overview: Overview; health: Health } | null>(null);
  const [users, setUsers] = useState<UserRow[] | null>(null);
  const [events, setEvents] = useState<EventRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (profile?.role !== "admin") return;
    Promise.all([api<{ overview: Overview; health: Health }>("/api/admin/overview"), api<{ users: UserRow[] }>("/api/admin/users"), api<{ events: EventRow[] }>("/api/admin/events")])
      .then(([o, u, e]) => { setOv(o); setUsers(u.users); setEvents(e.events); })
      .catch((e) => setError(errorMessage(e)));
  }, [profile]);

  if (!profile) return <><PageHeader title="Admin" /><Skeleton className="h-40" /></>;
  if (profile.role !== "admin") {
    return <><PageHeader title="Admin" /><ErrorState message="You do not have permission to view this page." /></>;
  }
  if (error) return <><PageHeader title="Admin" /><ErrorState message={error} /></>;
  if (!ov) return <><PageHeader title="Admin" /><Skeleton className="h-64" /></>;

  const { overview: o, health } = ov;
  const used = Number(o.capacity.used_bytes) + Number(o.capacity.reserved_bytes);
  const pct = percent(used, Number(o.capacity.max_bytes));
  const stats = [
    { icon: Users, label: "Registered users", value: o.users }, { icon: FileStack, label: "Files stored", value: o.files },
    { icon: Database, label: "Storage used", value: formatBytes(used) }, { icon: Link2, label: "Active share links", value: o.active_shares },
  ];

  return (
    <>
      <PageHeader title="Administration" description="Aggregate, account-level information only. File names and contents are encrypted and not visible here." />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map(({ icon: Icon, label, value }) => <Card key={label}><div className="flex items-center gap-2 text-sm text-muted"><Icon className="h-4 w-4" aria-hidden />{label}</div><div className="mt-2 text-2xl font-semibold tabular-nums">{value}</div></Card>)}
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="mb-3 font-semibold">Storage capacity</h2>
          <Progress value={pct} label="Global storage used" />
          <p className="mt-2 text-sm text-muted">{formatBytes(used)} of {formatBytes(Number(o.capacity.max_bytes))} ({pct.toFixed(1)}%). New uploads pause automatically at 100%.</p>
          <p className="mt-1 text-xs text-muted">Keep this below Cloudflare R2&apos;s free 10 GB allowance. Change it with SQL (see docs/cost-guide.md).</p>
        </Card>
        <Card>
          <h2 className="mb-3 flex items-center gap-2 font-semibold"><Activity className="h-4 w-4" aria-hidden />System health</h2>
          <ul className="space-y-2 text-sm">
            <li className="flex justify-between"><span>Database</span><Badge tone={health.database === "ok" ? "ok" : "danger"}>{health.database === "ok" ? `OK · ${health.databaseLatencyMs} ms` : "Error"}</Badge></li>
            <li className="flex justify-between"><span>Object storage configured</span><Badge tone={health.objectStorageConfigured ? "ok" : "danger"}>{health.objectStorageConfigured ? "Yes" : "No"}</Badge></li>
            <li className="flex justify-between"><span>Scheduled maintenance secret</span><Badge tone={health.cronConfigured ? "ok" : "warn"}>{health.cronConfigured ? "Set" : "Not set"}</Badge></li>
          </ul>
        </Card>
        <Card><h2 className="mb-3 font-semibold">Sign-ups (14 days)</h2><BarChart label="Sign-ups per day" data={o.signups_by_day.map((d) => ({ label: short(d.day), value: d.count }))} /></Card>
        <Card><h2 className="mb-3 font-semibold">Uploads (14 days)</h2><BarChart label="Uploads per day" data={o.uploads_by_day.map((d) => ({ label: short(d.day), value: d.count }))} /></Card>
      </div>

      <Card className="mt-4 overflow-x-auto">
        <h2 className="mb-3 font-semibold">Users</h2>
        <table className="w-full min-w-[34rem] text-left text-sm">
          <thead className="text-xs text-muted"><tr><th className="py-2 pr-3 font-medium">Email</th><th className="py-2 pr-3 font-medium">Role</th><th className="py-2 pr-3 font-medium">Used / quota</th><th className="py-2 pr-3 font-medium">Files</th><th className="py-2 font-medium">Joined</th></tr></thead>
          <tbody className="divide-y divide-border">{(users ?? []).map((u) => (
            <tr key={u.id}><td className="max-w-[16rem] truncate py-2.5 pr-3">{u.email}</td><td className="pr-3"><Badge tone={u.role === "admin" ? "brand" : "neutral"}>{u.role}</Badge></td><td className="pr-3 tabular-nums">{formatBytes(u.usedBytes)} / {formatBytes(u.quotaBytes)}</td><td className="pr-3">{u.fileCount}</td><td className="text-muted">{formatDateTime(u.createdAt)}</td></tr>
          ))}</tbody>
        </table>
      </Card>

      <Card className="mt-4">
        <h2 className="mb-3 flex items-center gap-2 font-semibold"><ShieldAlert className="h-4 w-4" aria-hidden />Recent security events</h2>
        {events && events.length === 0 ? <p className="text-sm text-muted">No events.</p> : (
          <ul className="divide-y divide-border">{(events ?? []).map((e) => (
            <li key={e.id} className="flex items-center justify-between gap-3 py-2.5 text-sm"><span className="flex items-center gap-2"><Badge tone={e.severity === "info" ? "neutral" : e.severity === "warning" ? "warn" : "danger"}>{e.severity}</Badge>{e.type.replace(/[._]/g, " ")}</span><span className="text-xs text-muted">{formatDateTime(e.created_at)}</span></li>
          ))}</ul>
        )}
      </Card>
    </>
  );
}
