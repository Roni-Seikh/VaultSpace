"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useVault } from "@/components/vault/vault-provider";
import { uploadEncrypted } from "./transfer";
import { errorMessage } from "./api";

export interface QueueItem {
  id: number; name: string; size: number;
  status: "queued" | "running" | "done" | "error";
  phase: "checking" | "encrypting" | "uploading" | "finishing";
  progress: number; error?: string;
}

const CONCURRENCY = 2;

export function useUploader(opts: { maxFileBytes: number; onSettled: () => void }) {
  const { vault } = useVault();
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const nextId = useRef(1);
  const running = useRef(0);
  const pending = useRef<{ id: number; file: File; folderId: string | null; fileId: string | null }[]>([]);
  const controllers = useRef(new Map<number, AbortController>());
  const pumpRef = useRef<() => void>(() => {});

  const patch = useCallback((id: number, p: Partial<QueueItem>) => setQueue((q) => q.map((i) => (i.id === id ? { ...i, ...p } : i))), []);

  const pump = useCallback(() => {
    if (!vault) return;
    while (running.current < CONCURRENCY && pending.current.length) {
      const job = pending.current.shift()!;
      running.current++;
      const ctl = new AbortController();
      controllers.current.set(job.id, ctl);
      patch(job.id, { status: "running" });
      uploadEncrypted({
        file: job.file, vault, folderId: job.folderId, fileId: job.fileId, maxFileBytes: opts.maxFileBytes, signal: ctl.signal,
        onProgress: (f, phase) => patch(job.id, { progress: f, phase }),
      })
        .then(() => patch(job.id, { status: "done", progress: 1 }))
        .catch((e) => patch(job.id, { status: "error", error: (e as Error).name === "AbortError" ? "Cancelled" : errorMessage(e) }))
        .finally(() => {
          controllers.current.delete(job.id);
          running.current--;
          if (!pending.current.length && running.current === 0) opts.onSettled();
          pumpRef.current();
        });
    }
  }, [vault, opts, patch]);
  useEffect(() => { pumpRef.current = pump; }, [pump]);

  const add = useCallback((files: File[], folderId: string | null, fileId: string | null = null) => {
    const items: QueueItem[] = files.map((f) => ({ id: nextId.current++, name: f.name, size: f.size, status: "queued", phase: "checking", progress: 0 }));
    setQueue((q) => [...q, ...items]);
    items.forEach((it, i) => pending.current.push({ id: it.id, file: files[i], folderId, fileId }));
    pump();
  }, [pump]);

  const cancel = useCallback((id: number) => {
    pending.current = pending.current.filter((j) => j.id !== id);
    const ctl = controllers.current.get(id);
    if (ctl) ctl.abort(); else patch(id, { status: "error", error: "Cancelled" });
  }, [patch]);

  const clearFinished = useCallback(() => setQueue((q) => q.filter((i) => i.status === "queued" || i.status === "running")), []);
  return { queue, add, cancel, clearFinished };
}
