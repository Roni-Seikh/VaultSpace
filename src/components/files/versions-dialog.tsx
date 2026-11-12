"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Download, RotateCcw, Trash2, Upload } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge, Skeleton } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import { useVault } from "@/components/vault/vault-provider";
import { api, errorMessage } from "@/lib/client/api";
import { downloadDecrypted, saveBlob, uploadEncrypted } from "@/lib/client/transfer";
import { formatBytes, formatDateTime } from "@/lib/format";
import type { FileItem, StorageInfo } from "@/lib/client/types";

interface V { version: number; sizeBytes: number; createdAt: string }

export function VersionsDialog({ file, storage, onClose, onChanged }: { file: FileItem | null; storage: StorageInfo | null; onClose: () => void; onChanged: () => void }) {
  const { vault } = useVault();
  const toast = useToast();
  const [versions, setVersions] = useState<V[] | null>(null);
  const [current, setCurrent] = useState<number | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    if (!file) return;
    try {
      const r = await api<{ currentVersion: number | null; versions: V[] }>(`/api/files/${file.id}/versions`);
      setVersions(r.versions); setCurrent(r.currentVersion);
    } catch (e) { toast.error(errorMessage(e)); }
  }, [file, toast]);

  useEffect(() => { setVersions(null); void load(); }, [load]);

  const run = async (key: string, fn: () => Promise<void>, ok: string) => {
    setBusy(key);
    try { await fn(); toast.success(ok); await load(); onChanged(); }
    catch (e) { toast.error(errorMessage(e)); }
    finally { setBusy(null); }
  };

  return (
    <Dialog open={!!file} onClose={onClose} size="lg" title="Version history" description={file?.name}
      footer={
        <>
          <input ref={input} type="file" className="sr-only" aria-label="Choose a file for the new version"
            onChange={(e) => {
              const f = e.target.files?.[0]; e.target.value = "";
              if (f && file && vault && storage) void run("upload", async () => { await uploadEncrypted({ file: f, vault, folderId: file.folderId, fileId: file.id, maxFileBytes: storage.maxFileBytes }); }, "New version uploaded.");
            }} />
          <Button variant="outline" loading={busy === "upload"} onClick={() => input.current?.click()}><Upload className="h-4 w-4" />Upload new version</Button>
        </>
      }>
      {!versions ? <div className="space-y-2"><Skeleton className="h-12" /><Skeleton className="h-12" /></div> : (
        <ul className="divide-y divide-border rounded-xl border border-border">
          {versions.map((v) => {
            const isCurrent = v.version === current;
            return (
              <li key={v.version} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 text-sm font-medium">Version {v.version}{isCurrent && <Badge tone="brand">Current</Badge>}</div>
                  <div className="text-xs text-muted">{formatDateTime(v.createdAt)} · {formatBytes(v.sizeBytes)} (encrypted)</div>
                </div>
                <Button size="sm" variant="outline" loading={busy === `dl${v.version}`} aria-label={`Download version ${v.version}`}
                  onClick={() => vault && file && run(`dl${v.version}`, async () => { const r = await downloadDecrypted(file.id, vault, { version: v.version }); saveBlob(r.blob, file.name); }, "Downloaded.")}><Download className="h-4 w-4" /></Button>
                {!isCurrent && (
                  <>
                    <Button size="sm" variant="outline" loading={busy === `rs${v.version}`}
                      onClick={() => file && run(`rs${v.version}`, async () => { await api(`/api/files/${file.id}/versions/${v.version}/restore`, { method: "POST", body: {} }); }, `Restored version ${v.version}.`)}><RotateCcw className="h-4 w-4" />Restore</Button>
                    <Button size="sm" variant="ghost" className="text-danger" loading={busy === `rm${v.version}`} aria-label={`Delete version ${v.version}`}
                      onClick={() => file && run(`rm${v.version}`, async () => { await api(`/api/files/${file.id}/versions/${v.version}`, { method: "DELETE" }); }, "Version deleted. Storage freed.")}><Trash2 className="h-4 w-4" /></Button>
                  </>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <p className="mt-3 text-xs text-muted">Every kept version counts toward your storage. Restoring a version does not use extra space.</p>
    </Dialog>
  );
}
