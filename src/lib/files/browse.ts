import type { FileItem, FolderItem } from "@/lib/client/types";
import type { MimeCategory } from "@/lib/files/types";

export type SortKey = "name" | "date" | "size" | "type";
export type SortDir = "asc" | "desc";

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

export function sortFiles(files: FileItem[], key: SortKey, dir: SortDir): FileItem[] {
  const m = dir === "asc" ? 1 : -1;
  const cmp: Record<SortKey, (a: FileItem, b: FileItem) => number> = {
    name: (a, b) => collator.compare(a.name, b.name),
    date: (a, b) => a.createdAt.localeCompare(b.createdAt),
    size: (a, b) => a.size - b.size,
    type: (a, b) => a.category.localeCompare(b.category) || collator.compare(a.name, b.name),
  };
  return [...files].sort((a, b) => cmp[key](a, b) * m || collator.compare(a.name, b.name));
}

export function sortFolders(folders: FolderItem[], dir: SortDir): FolderItem[] {
  return [...folders].sort((a, b) => collator.compare(a.name, b.name) * (dir === "asc" ? 1 : -1));
}

export function filterFiles(files: FileItem[], opts: { category?: MimeCategory | "all"; query?: string }): FileItem[] {
  const q = opts.query?.trim().toLowerCase();
  return files.filter((f) => (!opts.category || opts.category === "all" || f.category === opts.category) && (!q || f.name.toLowerCase().includes(q)));
}

export function breadcrumbs(folders: FolderItem[], folderId: string | null): FolderItem[] {
  const byId = new Map(folders.map((f) => [f.id, f]));
  const path: FolderItem[] = [];
  const seen = new Set<string>();
  let cur = folderId ? byId.get(folderId) : undefined;
  while (cur && !seen.has(cur.id)) { path.unshift(cur); seen.add(cur.id); cur = cur.parentId ? byId.get(cur.parentId) : undefined; }
  return path;
}

export function findDuplicateGroups(files: FileItem[]): FileItem[][] {
  const groups = new Map<string, FileItem[]>();
  for (const f of files) {
    if (!f.hmac) continue;
    const list = groups.get(f.hmac) ?? [];
    list.push(f);
    groups.set(f.hmac, list);
  }
  return [...groups.values()].filter((g) => g.length > 1);
}
