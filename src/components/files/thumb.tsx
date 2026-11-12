"use client";
import { useEffect, useRef, useState } from "react";
import { Play } from "lucide-react";
import { useVault } from "@/components/vault/vault-provider";
import { downloadDecrypted } from "@/lib/client/transfer";
import type { FileItem } from "@/lib/client/types";
import { CategoryIcon } from "./file-icons";

const MAX_THUMB_BYTES = 12 * 1024 * 1024;
const cache = new Map<string, string>(); // fileId:version -> object URL (small LRU)
let active = 0;
const waiters: (() => void)[] = [];

async function slot<T>(fn: () => Promise<T>): Promise<T> {
  if (active >= 3) await new Promise<void>((r) => waiters.push(r));
  active++;
  try { return await fn(); } finally { active--; waiters.shift()?.(); }
}

function remember(k: string, url: string) {
  cache.set(k, url);
  if (cache.size > 40) { const [oldK, oldU] = cache.entries().next().value as [string, string]; cache.delete(oldK); URL.revokeObjectURL(oldU); }
}

/** Decrypts an image only when it scrolls into view. Videos and large files show an icon instead. */
export function Thumb({ file }: { file: FileItem }) {
  const { vault } = useVault();
  const ref = useRef<HTMLDivElement>(null);
  const ck = `${file.id}:${file.version}`;
  const [url, setUrl] = useState<string | null>(() => cache.get(ck) ?? null);
  const [failed, setFailed] = useState(false);
  const eligible = file.category === "image" && file.size <= MAX_THUMB_BYTES;

  useEffect(() => {
    if (!eligible || !vault || url || !ref.current) return;
    let cancelled = false;
    const io = new IntersectionObserver((entries) => {
      if (!entries[0].isIntersecting) return;
      io.disconnect();
      slot(() => downloadDecrypted(file.id, vault))
        .then(({ blob }) => { if (cancelled) return; const u = URL.createObjectURL(blob); remember(ck, u); setUrl(u); })
        .catch(() => { if (!cancelled) setFailed(true); });
    }, { rootMargin: "200px" });
    io.observe(ref.current);
    return () => { cancelled = true; io.disconnect(); };
  }, [eligible, vault, url, file.id, ck]);

  return (
    <div ref={ref} className="relative grid aspect-square w-full place-items-center overflow-hidden rounded-xl bg-surface-2">
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt={file.name} loading="lazy" className="h-full w-full object-cover" />
      ) : (
        <CategoryIcon category={file.category} className={`h-14 w-14 ${eligible && !failed ? "animate-pulse" : ""}`} />
      )}
      {file.category === "video" && <span className="absolute inset-0 grid place-items-center"><span className="grid h-10 w-10 place-items-center rounded-full bg-black/55 text-white"><Play className="h-4 w-4" aria-hidden /></span></span>}
    </div>
  );
}
