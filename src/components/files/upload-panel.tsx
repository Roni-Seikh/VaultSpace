"use client";
import { AlertCircle, CheckCircle2, Loader2, X } from "lucide-react";
import { Progress } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { formatBytes } from "@/lib/format";
import type { QueueItem } from "@/lib/client/use-uploader";

const PHASE = { checking: "Checking file…", encrypting: "Encrypting…", uploading: "Uploading…", finishing: "Finishing…" } as const;

export function UploadPanel({ queue, onCancel, onClear }: { queue: QueueItem[]; onCancel: (id: number) => void; onClear: () => void }) {
  if (!queue.length) return null;
  const busy = queue.some((q) => q.status === "queued" || q.status === "running");
  return (
    <section aria-label="Uploads" className="fixed bottom-4 right-4 z-40 w-[calc(100%-2rem)] max-w-sm rounded-2xl border border-border bg-surface shadow-2xl">
      <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
        <h2 className="text-sm font-semibold">{busy ? "Uploading…" : "Uploads finished"}</h2>
        {!busy && <Button size="sm" variant="ghost" onClick={onClear}>Clear</Button>}
      </div>
      <ul className="max-h-72 divide-y divide-border overflow-y-auto">
        {queue.map((q) => (
          <li key={q.id} className="space-y-1.5 px-4 py-3">
            <div className="flex items-center gap-2">
              {q.status === "done" ? <CheckCircle2 className="h-4 w-4 shrink-0 text-ok" aria-label="Done" />
                : q.status === "error" ? <AlertCircle className="h-4 w-4 shrink-0 text-danger" aria-label="Failed" />
                : <Loader2 className="h-4 w-4 shrink-0 animate-spin text-brand" aria-label="In progress" />}
              <span className="min-w-0 flex-1 truncate text-sm font-medium" title={q.name}>{q.name}</span>
              <span className="text-xs text-muted">{formatBytes(q.size)}</span>
              {(q.status === "queued" || q.status === "running") && (
                <button aria-label={`Cancel upload of ${q.name}`} onClick={() => onCancel(q.id)} className="text-muted hover:text-fg"><X className="h-4 w-4" /></button>
              )}
            </div>
            {q.status === "running" && (<><Progress value={q.progress * 100} label={`Upload progress for ${q.name}`} tone="brand" /><p className="text-xs text-muted">{PHASE[q.phase]}</p></>)}
            {q.status === "queued" && <p className="text-xs text-muted">Waiting…</p>}
            {q.status === "error" && <p role="alert" className="text-xs text-danger">{q.error}</p>}
          </li>
        ))}
      </ul>
    </section>
  );
}
