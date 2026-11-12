"use client";
import { useMemo, useState } from "react";
import { Download, Eye, FileX, History, Search, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge, EmptyState, ErrorState, PageHeader, Skeleton } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import { CategoryIcon, categoryLabel, categoryPlural } from "@/components/files/file-icons";
import { PreviewDialog } from "@/components/files/preview-dialog";
import { ShareDialog } from "@/components/files/share-dialog";
import { VersionsDialog } from "@/components/files/versions-dialog";
import { useLibrary } from "@/components/vault/library-provider";
import { useVault } from "@/components/vault/vault-provider";
import { errorMessage } from "@/lib/client/api";
import { downloadDecrypted, saveBlob } from "@/lib/client/transfer";
import type { FileItem } from "@/lib/client/types";
import { filterFiles, sortFiles } from "@/lib/files/browse";
import type { MimeCategory } from "@/lib/files/types";
import { PREVIEWABLE_MIMES, extensionOf } from "@/lib/files/types";
import { formatBytes, formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

const DOC_CATS: MimeCategory[] = ["document", "spreadsheet", "presentation", "text", "archive"];

export function DocumentsView() {
  const { files, folders, storage, loading, error, refresh } = useLibrary();
  const { vault } = useVault();
  const toast = useToast();
  const [cat, setCat] = useState<MimeCategory | "all">("all");
  const [query, setQuery] = useState("");
  const [preview, setPreview] = useState<FileItem | null>(null);
  const [share, setShare] = useState<FileItem | null>(null);
  const [versions, setVersions] = useState<FileItem | null>(null);

  const docs = useMemo(() => files.filter((f) => DOC_CATS.includes(f.category)), [files]);
  const folderName = useMemo(() => new Map(folders.map((f) => [f.id, f.name])), [folders]);
  const shown = useMemo(() => sortFiles(filterFiles(docs, { category: cat, query }), "date", "desc"), [docs, cat, query]);
  const counts = useMemo(() => Object.fromEntries(DOC_CATS.map((c) => [c, docs.filter((d) => d.category === c).length])), [docs]);

  const download = async (f: FileItem) => {
    if (!vault) return;
    try { const r = await downloadDecrypted(f.id, vault); saveBlob(r.blob, f.name); } catch (e) { toast.error(errorMessage(e)); }
  };

  const header = <PageHeader title="Documents" description="PDFs, Office files, text files and archives. Uploaded files are never executed." />;
  if (loading) return <>{header}<div className="space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-16" />)}</div></>;
  if (error) return <>{header}<ErrorState message={error} onRetry={refresh} /></>;

  return (
    <>
      {header}
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Document category">
          <button aria-pressed={cat === "all"} onClick={() => setCat("all")} className={cn("rounded-full border px-3.5 py-1.5 text-sm", cat === "all" ? "border-brand bg-brand/10 text-brand" : "border-border text-muted hover:text-fg")}>All ({docs.length})</button>
          {DOC_CATS.filter((c) => counts[c] > 0).map((c) => (
            <button key={c} aria-pressed={cat === c} onClick={() => setCat(c)} className={cn("rounded-full border px-3.5 py-1.5 text-sm", cat === c ? "border-brand bg-brand/10 text-brand" : "border-border text-muted hover:text-fg")}>{categoryPlural(c)} ({counts[c]})</button>
          ))}
        </div>
        <div className="relative ml-auto min-w-[10rem] flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
          <input aria-label="Search documents by name" placeholder="Search…" value={query} onChange={(e) => setQuery(e.target.value)} className="h-10 w-full rounded-xl border border-border bg-surface pl-9 pr-3 text-sm" />
        </div>
      </div>

      {shown.length === 0 ? (
        <EmptyState icon={<FileX className="h-6 w-6" />} title={docs.length ? "No documents match" : "No documents yet"}>{docs.length ? "Try another search or category." : "Upload PDFs, Word, Excel or PowerPoint files from My Files."}</EmptyState>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
          {shown.map((f) => (
            <li key={f.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <CategoryIcon category={f.category} />
              <div className="min-w-0 flex-1 basis-48">
                <div className="truncate text-sm font-medium">{f.name}</div>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
                  <Badge>{categoryLabel(f.category)} · .{extensionOf(f.name) || "?"}</Badge>
                  <span>{formatBytes(f.size)}</span><span>Updated {formatDateTime(f.updatedAt)}</span>
                  {f.version > 1 && <Badge tone="brand">v{f.version}</Badge>}
                  <span>{f.folderId ? folderName.get(f.folderId) ?? "Folder" : "My Files"}</span>
                </div>
              </div>
              <div className="flex items-center gap-1">
                {PREVIEWABLE_MIMES.has(f.mimeType) && <Button size="icon" variant="ghost" aria-label={`Preview ${f.name}`} onClick={() => setPreview(f)}><Eye className="h-4 w-4" /></Button>}
                <Button size="icon" variant="ghost" aria-label={`Download ${f.name}`} onClick={() => void download(f)}><Download className="h-4 w-4" /></Button>
                <Button size="icon" variant="ghost" aria-label={`Version history for ${f.name}`} onClick={() => setVersions(f)}><History className="h-4 w-4" /></Button>
                <Button size="icon" variant="ghost" aria-label={`Share ${f.name}`} onClick={() => setShare(f)}><Share2 className="h-4 w-4" /></Button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <PreviewDialog file={preview} onClose={() => setPreview(null)} />
      <ShareDialog file={share} onClose={() => setShare(null)} />
      <VersionsDialog file={versions} storage={storage} onClose={() => setVersions(null)} onChanged={() => void refresh()} />
    </>
  );
}
