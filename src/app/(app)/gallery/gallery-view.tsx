"use client";
import { useMemo, useState } from "react";
import { Download, ImageOff, Search, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState, ErrorState, PageHeader, Skeleton } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import { PreviewDialog } from "@/components/files/preview-dialog";
import { ShareDialog } from "@/components/files/share-dialog";
import { Thumb } from "@/components/files/thumb";
import { useLibrary } from "@/components/vault/library-provider";
import { useVault } from "@/components/vault/vault-provider";
import { errorMessage } from "@/lib/client/api";
import { downloadDecrypted, saveBlob } from "@/lib/client/transfer";
import type { FileItem } from "@/lib/client/types";
import { filterFiles, sortFiles, type SortDir } from "@/lib/files/browse";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

type Filter = "all" | "image" | "video";

export function GalleryView() {
  const { files, loading, error, refresh } = useLibrary();
  const { vault } = useVault();
  const toast = useToast();
  const [filter, setFilter] = useState<Filter>("all");
  const [dir, setDir] = useState<SortDir>("desc");
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<FileItem | null>(null);
  const [share, setShare] = useState<FileItem | null>(null);

  const media = useMemo(() => {
    const only = files.filter((f) => f.category === "image" || f.category === "video");
    return sortFiles(filterFiles(only, { category: filter === "all" ? "all" : filter, query }), "date", dir);
  }, [files, filter, dir, query]);

  const download = async (f: FileItem) => {
    if (!vault) return;
    try { const r = await downloadDecrypted(f.id, vault); saveBlob(r.blob, f.name); } catch (e) { toast.error(errorMessage(e)); }
  };

  const header = <PageHeader title="Photos & Videos" description="Thumbnails are decrypted in your browser only when they scroll into view." />;
  if (loading) return <>{header}<div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">{Array.from({ length: 10 }, (_, i) => <Skeleton key={i} className="aspect-square" />)}</div></>;
  if (error) return <>{header}<ErrorState message={error} onRetry={refresh} /></>;

  return (
    <>
      {header}
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div className="flex overflow-hidden rounded-xl border border-border" role="group" aria-label="Media type">
          {(["all", "image", "video"] as const).map((f) => (
            <button key={f} aria-pressed={filter === f} onClick={() => setFilter(f)} className={cn("px-4 py-2 text-sm", filter === f ? "bg-brand/15 font-medium text-brand" : "bg-surface text-muted hover:text-fg")}>
              {f === "all" ? "All" : f === "image" ? "Photos" : "Videos"}
            </button>
          ))}
        </div>
        <div className="relative min-w-[10rem] flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
          <input aria-label="Search media by name" placeholder="Search…" value={query} onChange={(e) => setQuery(e.target.value)} className="h-10 w-full rounded-xl border border-border bg-surface pl-9 pr-3 text-sm" />
        </div>
        <select aria-label="Sort by date" value={dir} onChange={(e) => setDir(e.target.value as SortDir)} className="h-10 rounded-xl border border-border bg-surface px-3 text-sm">
          <option value="desc">Newest first</option><option value="asc">Oldest first</option>
        </select>
      </div>

      {media.length === 0 ? (
        <EmptyState icon={<ImageOff className="h-6 w-6" />} title={query || filter !== "all" ? "Nothing matches" : "No photos or videos yet"}>
          {query || filter !== "all" ? "Try a different search or filter." : "Upload images or videos from My Files and they will appear here."}
        </EmptyState>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {media.map((f) => (
            <li key={f.id} className="group relative">
              <button className="block w-full text-left" onClick={() => setOpen(f)} aria-label={`Open ${f.name}`}>
                <Thumb file={f} />
                <span className="mt-1.5 block truncate text-xs font-medium">{f.name}</span>
                <span className="block text-[11px] text-muted">{formatDate(f.createdAt)}</span>
              </button>
              <div className="absolute right-2 top-2 flex gap-1 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
                <Button size="icon" variant="secondary" className="h-8 w-8 bg-black/60 text-white hover:bg-black/75" aria-label={`Download ${f.name}`} onClick={() => void download(f)}><Download className="h-4 w-4" /></Button>
                <Button size="icon" variant="secondary" className="h-8 w-8 bg-black/60 text-white hover:bg-black/75" aria-label={`Share ${f.name}`} onClick={() => setShare(f)}><Share2 className="h-4 w-4" /></Button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <PreviewDialog file={open} onClose={() => setOpen(null)} />
      <ShareDialog file={share} onClose={() => setShare(null)} />
    </>
  );
}
