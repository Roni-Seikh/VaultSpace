"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDownAZ, ArrowUpAZ, ChevronRight, Copy, Download, Eye, FolderInput, FolderPlus, History, LayoutGrid, List, Pencil,
  Search, Share2, Trash2, Upload, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, ConfirmDialog } from "@/components/ui/dialog";
import { Field } from "@/components/ui/input";
import { Menu, type MenuItem } from "@/components/ui/menu";
import { EmptyState, ErrorState, PageHeader, Skeleton } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import { CategoryIcon, categoryLabel } from "@/components/files/file-icons";
import { MoveDialog } from "@/components/files/move-dialog";
import { PreviewDialog } from "@/components/files/preview-dialog";
import { ShareDialog } from "@/components/files/share-dialog";
import { UploadPanel } from "@/components/files/upload-panel";
import { VersionsDialog } from "@/components/files/versions-dialog";
import { useLibrary } from "@/components/vault/library-provider";
import { useVault } from "@/components/vault/vault-provider";
import { errorMessage } from "@/lib/client/api";
import * as actions from "@/lib/client/actions";
import type { FileItem, FolderItem } from "@/lib/client/types";
import { downloadDecrypted, saveBlob } from "@/lib/client/transfer";
import { useUploader } from "@/lib/client/use-uploader";
import { breadcrumbs, filterFiles, sortFiles, sortFolders, type SortDir, type SortKey } from "@/lib/files/browse";
import { copyName } from "@/lib/files/names";
import { MIME_CATEGORIES, type MimeCategory } from "@/lib/files/types";
import { formatBytes, formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

type Sel = { kind: "file" | "folder"; id: string };
const key = (s: Sel) => `${s.kind}:${s.id}`;

function readPref<T extends string>(name: string, allowed: readonly T[], fallback: T): T {
  try { const v = localStorage.getItem(name); return allowed.includes(v as T) ? (v as T) : fallback; } catch { return fallback; }
}
function writePref(name: string, value: string) { try { localStorage.setItem(name, value); } catch { /* storage unavailable */ } }

export function FilesBrowser() {
  const { vault } = useVault();
  const { files, folders, storage, loading, error, refresh } = useLibrary();
  const toast = useToast();

  const [folderId, setFolderId] = useState<string | null>(null);
  const [view, setView] = useState<"grid" | "list">(() => (typeof window === "undefined" ? "list" : readPref("vs:view", ["grid", "list"] as const, "list")));
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [category, setCategory] = useState<MimeCategory | "all">("all");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Map<string, Sel>>(new Map());
  const [dragging, setDragging] = useState(false);

  const [preview, setPreview] = useState<FileItem | null>(null);
  const [share, setShare] = useState<FileItem | null>(null);
  const [versions, setVersions] = useState<FileItem | null>(null);
  const [rename, setRename] = useState<{ kind: "file" | "folder"; id: string; name: string } | null>(null);
  const [newFolder, setNewFolder] = useState(false);
  const [moveTargets, setMoveTargets] = useState<Sel[] | null>(null);
  const [deleteTargets, setDeleteTargets] = useState<Sel[] | null>(null);
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const uploader = useUploader({ maxFileBytes: storage?.maxFileBytes ?? 100 * 1024 * 1024, onSettled: () => void refresh() });

  // If the current folder disappears (deleted elsewhere), go back to the root.
  useEffect(() => { if (folderId && !loading && !folders.some((f) => f.id === folderId)) setFolderId(null); }, [folderId, folders, loading]);

  const searching = query.trim().length > 0;
  const crumbs = useMemo(() => breadcrumbs(folders, folderId), [folders, folderId]);
  const shownFolders = useMemo(
    () => (searching || category !== "all" ? [] : sortFolders(folders.filter((f) => f.parentId === folderId), sortKey === "name" ? sortDir : "asc")),
    [folders, folderId, searching, category, sortKey, sortDir],
  );
  const shownFiles = useMemo(() => {
    const scope = searching || category !== "all" ? files : files.filter((f) => f.folderId === folderId);
    return sortFiles(filterFiles(scope, { category, query }), sortKey, sortDir);
  }, [files, folderId, searching, category, query, sortKey, sortDir]);

  const toggle = (s: Sel) => setSelected((m) => { const n = new Map(m); if (n.has(key(s))) n.delete(key(s)); else n.set(key(s), s); return n; });
  const clearSel = () => setSelected(new Map());
  const allSelectable: Sel[] = [...shownFolders.map((f) => ({ kind: "folder" as const, id: f.id })), ...shownFiles.map((f) => ({ kind: "file" as const, id: f.id }))];
  const allSelected = allSelectable.length > 0 && allSelectable.every((s) => selected.has(key(s)));

  const full = storage?.serviceFull;
  const quotaFull = storage ? storage.remainingBytes <= 0 : false;

  const startUpload = useCallback((list: FileList | File[]) => {
    const arr = Array.from(list);
    if (!arr.length) return;
    if (full) { toast.error("VaultSpace has reached its overall storage capacity. Uploads are paused until space frees up."); return; }
    if (quotaFull) { toast.error("Your storage is full. Delete some files to upload more."); return; }
    uploader.add(arr, folderId);
  }, [uploader, folderId, full, quotaFull, toast]);

  async function run(fn: () => Promise<void>, ok: string) {
    setBusy(true);
    try { await fn(); toast.success(ok); await refresh(); }
    catch (e) { toast.error(errorMessage(e)); }
    finally { setBusy(false); }
  }

  const download = async (f: FileItem) => {
    if (!vault) return;
    try { toast.info(`Decrypting ${f.name}…`); const r = await downloadDecrypted(f.id, vault); saveBlob(r.blob, f.name); }
    catch (e) { toast.error(errorMessage(e)); }
  };

  const fileMenu = (f: FileItem): MenuItem[] => [
    { label: "Preview", icon: <Eye className="h-4 w-4" />, onClick: () => setPreview(f) },
    { label: "Download", icon: <Download className="h-4 w-4" />, onClick: () => void download(f) },
    { label: "Share", icon: <Share2 className="h-4 w-4" />, onClick: () => setShare(f) },
    { label: "Rename", icon: <Pencil className="h-4 w-4" />, onClick: () => setRename({ kind: "file", id: f.id, name: f.name }) },
    { label: "Move", icon: <FolderInput className="h-4 w-4" />, onClick: () => setMoveTargets([{ kind: "file", id: f.id }]) },
    { label: "Make a copy", icon: <Copy className="h-4 w-4" />, onClick: () => vault && void run(async () => { await actions.copyFile(vault, f.id, copyName(f.name), f.folderId); }, "Copy created.") },
    { label: "Version history", icon: <History className="h-4 w-4" />, onClick: () => setVersions(f) },
    { label: "Delete", icon: <Trash2 className="h-4 w-4" />, danger: true, onClick: () => setDeleteTargets([{ kind: "file", id: f.id }]) },
  ];
  const folderMenu = (f: FolderItem): MenuItem[] => [
    { label: "Open", icon: <Eye className="h-4 w-4" />, onClick: () => setFolderId(f.id) },
    { label: "Rename", icon: <Pencil className="h-4 w-4" />, onClick: () => setRename({ kind: "folder", id: f.id, name: f.name }) },
    { label: "Move", icon: <FolderInput className="h-4 w-4" />, onClick: () => setMoveTargets([{ kind: "folder", id: f.id }]) },
    { label: "Delete", icon: <Trash2 className="h-4 w-4" />, danger: true, onClick: () => setDeleteTargets([{ kind: "folder", id: f.id }]) },
  ];

  async function doMove(dest: string | null) {
    if (!moveTargets) return;
    await run(async () => {
      for (const t of moveTargets) await (t.kind === "file" ? actions.moveFile(t.id, dest) : actions.moveFolder(t.id, dest));
    }, "Moved.");
    setMoveTargets(null); clearSel();
  }

  async function doDelete() {
    if (!deleteTargets) return;
    await run(async () => {
      for (const t of deleteTargets) await (t.kind === "file" ? actions.deleteFile(t.id) : actions.deleteFolder(t.id));
    }, deleteTargets.length > 1 ? "Items deleted." : "Deleted.");
    setDeleteTargets(null); clearSel();
  }

  const deleteSummary = deleteTargets
    ? `${deleteTargets.filter((t) => t.kind === "file").length} file(s) and ${deleteTargets.filter((t) => t.kind === "folder").length} folder(s)`
    : "";

  const header = (
    <PageHeader
      title="My Files"
      description={full ? "VaultSpace is at capacity: uploads are paused." : "Everything here is encrypted in your browser."}
      actions={
        <>
          <Button variant="outline" onClick={() => setNewFolder(true)}><FolderPlus className="h-4 w-4" />New folder</Button>
          <input ref={fileInput} type="file" multiple className="sr-only" aria-label="Choose files to upload" onChange={(e) => { if (e.target.files) startUpload(e.target.files); e.target.value = ""; }} />
          <Button onClick={() => fileInput.current?.click()} disabled={!!full || quotaFull}><Upload className="h-4 w-4" />Upload</Button>
        </>
      }
    />
  );

  if (loading) return <>{header}<div className="space-y-2">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-14" />)}</div></>;
  if (error) return <>{header}<ErrorState message={error} onRetry={refresh} /></>;

  const empty = shownFolders.length === 0 && shownFiles.length === 0;

  return (
    <div
      onDragOver={(e) => { if (e.dataTransfer.types.includes("Files")) { e.preventDefault(); setDragging(true); } }}
      onDragLeave={(e) => { if (e.currentTarget === e.target) setDragging(false); }}
      onDrop={(e) => { e.preventDefault(); setDragging(false); if (e.dataTransfer.files.length) startUpload(e.dataTransfer.files); }}
      className={cn("relative min-h-[60vh] rounded-2xl", dragging && "outline-2 outline-dashed outline-brand")}
    >
      {header}
      {quotaFull && <p role="alert" className="mb-4 rounded-xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">Your storage is full. Delete files or old versions to make room.</p>}

      <nav aria-label="Folder path" className="mb-4 flex flex-wrap items-center gap-1 text-sm">
        <button className={cn("rounded-lg px-2 py-1 hover:bg-surface-2", !folderId && "font-semibold")} onClick={() => setFolderId(null)}>My Files</button>
        {crumbs.map((c) => (
          <span key={c.id} className="flex items-center gap-1"><ChevronRight className="h-3.5 w-3.5 text-muted" aria-hidden />
            <button className={cn("rounded-lg px-2 py-1 hover:bg-surface-2", c.id === folderId && "font-semibold")} onClick={() => setFolderId(c.id)}>{c.name}</button></span>
        ))}
      </nav>

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div className="relative min-w-[12rem] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
          <input aria-label="Search files by name" placeholder="Search by name…" value={query} onChange={(e) => setQuery(e.target.value)}
            className="h-10 w-full rounded-xl border border-border bg-surface pl-9 pr-9 text-sm" />
          {query && <button aria-label="Clear search" onClick={() => setQuery("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted hover:text-fg"><X className="h-4 w-4" /></button>}
        </div>
        <select aria-label="Filter by type" value={category} onChange={(e) => setCategory(e.target.value as MimeCategory | "all")} className="h-10 rounded-xl border border-border bg-surface px-3 text-sm">
          <option value="all">All types</option>
          {MIME_CATEGORIES.map((c) => <option key={c} value={c}>{categoryLabel(c)}</option>)}
        </select>
        <select aria-label="Sort by" value={sortKey} onChange={(e) => setSortKey(e.target.value as SortKey)} className="h-10 rounded-xl border border-border bg-surface px-3 text-sm">
          <option value="date">Date added</option><option value="name">Name</option><option value="size">Size</option><option value="type">Type</option>
        </select>
        <Button variant="outline" size="icon" aria-label={`Sort direction: ${sortDir === "asc" ? "ascending" : "descending"}`} onClick={() => setSortDir(sortDir === "asc" ? "desc" : "asc")} className="h-10 w-10">
          {sortDir === "asc" ? <ArrowUpAZ className="h-4 w-4" /> : <ArrowDownAZ className="h-4 w-4" />}
        </Button>
        <div className="flex overflow-hidden rounded-xl border border-border" role="group" aria-label="View">
          {(["list", "grid"] as const).map((v) => (
            <button key={v} aria-label={`${v} view`} aria-pressed={view === v} onClick={() => { setView(v); writePref("vs:view", v); }}
              className={cn("grid h-10 w-10 place-items-center", view === v ? "bg-brand/15 text-brand" : "bg-surface text-muted hover:text-fg")}>
              {v === "list" ? <List className="h-4 w-4" /> : <LayoutGrid className="h-4 w-4" />}
            </button>
          ))}
        </div>
      </div>

      {selected.size > 0 && (
        <div role="region" aria-label="Bulk actions" className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-brand/40 bg-brand/10 px-4 py-2.5">
          <span className="text-sm font-medium">{selected.size} selected</span>
          <div className="flex-1" />
          <Button size="sm" variant="outline" onClick={() => setMoveTargets([...selected.values()])}><FolderInput className="h-4 w-4" />Move</Button>
          <Button size="sm" variant="danger" onClick={() => setDeleteTargets([...selected.values()])}><Trash2 className="h-4 w-4" />Delete</Button>
          <Button size="sm" variant="ghost" onClick={clearSel}>Clear</Button>
        </div>
      )}

      {empty ? (
        searching || category !== "all" ? (
          <EmptyState icon={<Search className="h-6 w-6" />} title="No matching files">Try a different search or clear the filters.</EmptyState>
        ) : (
          <EmptyState icon={<Upload className="h-6 w-6" />} title={folderId ? "This folder is empty" : "No files yet"}
            action={<Button onClick={() => fileInput.current?.click()} disabled={!!full || quotaFull}><Upload className="h-4 w-4" />Upload files</Button>}>
            Drag and drop files anywhere on this page, or choose them with the button. They are encrypted before they leave your device.
          </EmptyState>
        )
      ) : view === "list" ? (
        <div className="overflow-hidden rounded-2xl border border-border bg-surface">
          <div className="hidden items-center gap-3 border-b border-border px-4 py-2.5 text-xs font-medium text-muted sm:flex">
            <input type="checkbox" aria-label="Select all" className="h-4 w-4" checked={allSelected} onChange={() => (allSelected ? clearSel() : setSelected(new Map(allSelectable.map((s) => [key(s), s]))))} />
            <span className="flex-1">Name</span><span className="w-24">Type</span><span className="w-20 text-right">Size</span><span className="w-28">Added</span><span className="w-8" />
          </div>
          <ul className="divide-y divide-border">
            {shownFolders.map((f) => (
              <li key={f.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-surface-2/60">
                <input type="checkbox" aria-label={`Select folder ${f.name}`} className="h-4 w-4" checked={selected.has(`folder:${f.id}`)} onChange={() => toggle({ kind: "folder", id: f.id })} />
                <button className="flex min-w-0 flex-1 items-center gap-3 text-left" onClick={() => setFolderId(f.id)}><CategoryIcon category="folder" className="h-9 w-9" /><span className="truncate text-sm font-medium">{f.name}</span></button>
                <span className="hidden w-24 text-sm text-muted sm:block">Folder</span><span className="hidden w-20 sm:block" /><span className="hidden w-28 text-sm text-muted sm:block">{formatDate(f.createdAt)}</span>
                <Menu label={`Actions for folder ${f.name}`} items={folderMenu(f)} />
              </li>
            ))}
            {shownFiles.map((f) => (
              <li key={f.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-surface-2/60">
                <input type="checkbox" aria-label={`Select ${f.name}`} className="h-4 w-4" checked={selected.has(`file:${f.id}`)} onChange={() => toggle({ kind: "file", id: f.id })} />
                <button className="flex min-w-0 flex-1 items-center gap-3 text-left" onClick={() => setPreview(f)}>
                  <CategoryIcon category={f.category} className="h-9 w-9" />
                  <span className="min-w-0"><span className="block truncate text-sm font-medium">{f.name}</span><span className="block text-xs text-muted sm:hidden">{formatBytes(f.size)} · {formatDate(f.createdAt)}</span></span>
                </button>
                <span className="hidden w-24 text-sm text-muted sm:block">{categoryLabel(f.category)}</span>
                <span className="hidden w-20 text-right text-sm text-muted sm:block">{formatBytes(f.size)}</span>
                <span className="hidden w-28 text-sm text-muted sm:block">{formatDate(f.createdAt)}</span>
                <Menu label={`Actions for ${f.name}`} items={fileMenu(f)} />
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {shownFolders.map((f) => (
            <li key={f.id} className={cn("relative rounded-2xl border bg-surface p-4 transition-colors hover:border-brand/50", selected.has(`folder:${f.id}`) ? "border-brand" : "border-border")}>
              <input type="checkbox" aria-label={`Select folder ${f.name}`} className="absolute left-3 top-3 h-4 w-4" checked={selected.has(`folder:${f.id}`)} onChange={() => toggle({ kind: "folder", id: f.id })} />
              <Menu label={`Actions for folder ${f.name}`} items={folderMenu(f)} className="absolute right-2 top-2" />
              <button className="flex w-full flex-col items-center gap-2 pt-5 text-center" onClick={() => setFolderId(f.id)}>
                <CategoryIcon category="folder" className="h-14 w-14" /><span className="w-full truncate text-sm font-medium">{f.name}</span><span className="text-xs text-muted">Folder</span>
              </button>
            </li>
          ))}
          {shownFiles.map((f) => (
            <li key={f.id} className={cn("relative rounded-2xl border bg-surface p-4 transition-colors hover:border-brand/50", selected.has(`file:${f.id}`) ? "border-brand" : "border-border")}>
              <input type="checkbox" aria-label={`Select ${f.name}`} className="absolute left-3 top-3 h-4 w-4" checked={selected.has(`file:${f.id}`)} onChange={() => toggle({ kind: "file", id: f.id })} />
              <Menu label={`Actions for ${f.name}`} items={fileMenu(f)} className="absolute right-2 top-2" />
              <button className="flex w-full flex-col items-center gap-2 pt-5 text-center" onClick={() => setPreview(f)}>
                <CategoryIcon category={f.category} className="h-14 w-14" /><span className="w-full truncate text-sm font-medium" title={f.name}>{f.name}</span><span className="text-xs text-muted">{formatBytes(f.size)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {dragging && <div className="pointer-events-none absolute inset-0 grid place-items-center rounded-2xl bg-brand/10 text-lg font-semibold text-brand">Drop to encrypt and upload</div>}

      <UploadPanel queue={uploader.queue} onCancel={uploader.cancel} onClear={uploader.clearFinished} />
      <PreviewDialog file={preview} onClose={() => setPreview(null)} />
      <ShareDialog file={share} onClose={() => setShare(null)} />
      <VersionsDialog file={versions} storage={storage} onClose={() => setVersions(null)} onChanged={() => void refresh()} />

      <NameDialog open={newFolder} title="New folder" label="Folder name" initial="" confirmLabel="Create" busy={busy} onClose={() => setNewFolder(false)}
        onSubmit={async (name) => { if (vault) await run(async () => { await actions.createFolder(vault, name, folderId); }, "Folder created."); setNewFolder(false); }} />
      <NameDialog open={!!rename} title={rename?.kind === "folder" ? "Rename folder" : "Rename file"} label="Name" initial={rename?.name ?? ""} confirmLabel="Rename" busy={busy} onClose={() => setRename(null)}
        onSubmit={async (name) => { if (vault && rename) await run(async () => { await (rename.kind === "file" ? actions.renameFile(vault, rename.id, name) : actions.renameFolder(vault, rename.id, name)); }, "Renamed."); setRename(null); }} />
      <MoveDialog open={!!moveTargets} onClose={() => setMoveTargets(null)} folders={folders} exclude={moveTargets?.filter((t) => t.kind === "folder").map((t) => t.id)}
        title="Move to…" confirmLabel="Move here" busy={busy} onConfirm={doMove} />
      <ConfirmDialog open={!!deleteTargets} onClose={() => setDeleteTargets(null)} onConfirm={doDelete} danger loading={busy} confirmLabel="Delete permanently" title="Delete permanently?"
        message={<>This will permanently delete {deleteSummary}, including all versions and any contents of folders. Share links to these files will stop working. This cannot be undone.</>} />
    </div>
  );
}

function NameDialog({ open, title, label, initial, confirmLabel, busy, onClose, onSubmit }: {
  open: boolean; title: string; label: string; initial: string; confirmLabel: string; busy: boolean; onClose: () => void; onSubmit: (name: string) => Promise<void>;
}) {
  const [name, setName] = useState(initial);
  useEffect(() => { if (open) setName(initial); }, [open, initial]);
  const ok = name.trim().length > 0 && name.length <= 150;
  return (
    <Dialog open={open} onClose={onClose} title={title} size="sm"
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button loading={busy} disabled={!ok} onClick={() => onSubmit(name)}>{confirmLabel}</Button></>}>
      <form onSubmit={(e) => { e.preventDefault(); if (ok) void onSubmit(name); }}>
        <Field label={label} value={name} autoFocus maxLength={150} onChange={(e) => setName(e.target.value)} />
      </form>
    </Dialog>
  );
}
