"use client";
import { useCallback, useEffect, useState } from "react";
import { Ban, Link2Off, Lock, ShieldCheck } from "lucide-react";
import { Badge, EmptyState, ErrorState, PageHeader, Skeleton } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { useLibrary } from "@/components/vault/library-provider";
import { api, errorMessage } from "@/lib/client/api";
import { formatBytes, formatDateTime } from "@/lib/format";

interface Share {
  id: string; fileId: string; expiresAt: string; canDownload: boolean; passwordProtected: boolean; revokedAt: string | null;
  accessCount: number; lastAccessedAt: string | null; createdAt: string; sizeBytes: number;
}

export function shareStatus(s: Pick<Share, "revokedAt" | "expiresAt">, now = Date.now()): "revoked" | "expired" | "active" {
  if (s.revokedAt) return "revoked";
  return new Date(s.expiresAt).getTime() <= now ? "expired" : "active";
}

export function SharedView() {
  const { files } = useLibrary();
  const toast = useToast();
  const [shares, setShares] = useState<Share[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [revoke, setRevoke] = useState<Share | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try { setShares((await api<{ shares: Share[] }>("/api/shares")).shares); setError(null); }
    catch (e) { setError(errorMessage(e)); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const nameOf = (id: string) => files.find((f) => f.id === id)?.name ?? "(deleted file)";

  async function doRevoke() {
    if (!revoke) return;
    setBusy(true);
    try { await api(`/api/shares/${revoke.id}`, { method: "DELETE" }); toast.success("Link revoked. It no longer works."); setRevoke(null); await load(); }
    catch (e) { toast.error(errorMessage(e)); }
    finally { setBusy(false); }
  }

  const header = <PageHeader title="Shared links" description="Create links from any file's menu. Revoked and expired links stay listed as your sharing history." />;
  if (error) return <>{header}<ErrorState message={error} onRetry={load} /></>;
  if (!shares) return <>{header}<div className="space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-20" />)}</div></>;
  if (!shares.length) return <>{header}<EmptyState icon={<Link2Off className="h-6 w-6" />} title="No shared links yet">Open the menu on any file in My Files and choose Share.</EmptyState></>;

  return (
    <>
      {header}
      <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
        {shares.map((s) => {
          const st = shareStatus(s);
          return (
            <li key={s.id} className="flex flex-wrap items-center gap-3 px-4 py-3.5">
              <div className="min-w-0 flex-1 basis-56">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="truncate text-sm font-medium">{nameOf(s.fileId)}</span>
                  <Badge tone={st === "active" ? "ok" : st === "expired" ? "warn" : "danger"}>{st === "active" ? "Active" : st === "expired" ? "Expired" : "Revoked"}</Badge>
                  {s.passwordProtected && <Badge tone="brand"><Lock className="mr-1 h-3 w-3" />Password</Badge>}
                  <Badge>{s.canDownload ? "Download allowed" : "View only"}</Badge>
                </div>
                <p className="mt-1 text-xs text-muted">Created {formatDateTime(s.createdAt)} · {st === "expired" ? "expired" : "expires"} {formatDateTime(s.expiresAt)} · {formatBytes(s.sizeBytes)} · opened {s.accessCount}×{s.lastAccessedAt ? `, last ${formatDateTime(s.lastAccessedAt)}` : ""}</p>
              </div>
              {st === "active" ? (
                <Button size="sm" variant="outline" onClick={() => setRevoke(s)}><Ban className="h-4 w-4" />Revoke</Button>
              ) : (
                <span className="inline-flex items-center gap-1 text-xs text-muted"><ShieldCheck className="h-4 w-4" aria-hidden />No access</span>
              )}
            </li>
          );
        })}
      </ul>
      <p className="mt-3 text-xs text-muted">The link itself is only shown once, when it is created, because it contains the decryption key. To share again, create a new link.</p>
      <ConfirmDialog open={!!revoke} onClose={() => setRevoke(null)} onConfirm={doRevoke} loading={busy} danger confirmLabel="Revoke link" title="Revoke this link?"
        message="Anyone using this link will immediately lose access. People who already downloaded the file keep their copy." />
    </>
  );
}
