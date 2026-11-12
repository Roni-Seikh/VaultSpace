"use client";
import { useMemo, useState } from "react";
import { Folder, Home } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { FolderItem } from "@/lib/client/types";
import { cn } from "@/lib/utils";

function descendants(folders: FolderItem[], id: string): Set<string> {
  const out = new Set<string>([id]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const f of folders) if (f.parentId && out.has(f.parentId) && !out.has(f.id)) { out.add(f.id); grew = true; }
  }
  return out;
}

/** Pick a destination folder. `exclude` hides a folder and everything inside it (can't move into itself). */
export function MoveDialog({
  open, onClose, folders, exclude, title, confirmLabel, onConfirm, busy,
}: {
  open: boolean; onClose: () => void; folders: FolderItem[]; exclude?: string[]; title: string; confirmLabel: string;
  onConfirm: (folderId: string | null) => void; busy?: boolean;
}) {
  const [target, setTarget] = useState<string | null>(null);
  const rows = useMemo(() => {
    const hidden = new Set<string>();
    for (const e of exclude ?? []) descendants(folders, e).forEach((x) => hidden.add(x));
    const out: { folder: FolderItem; depth: number }[] = [];
    const walk = (parent: string | null, depth: number) => {
      folders.filter((f) => f.parentId === parent && !hidden.has(f.id)).sort((a, b) => a.name.localeCompare(b.name))
        .forEach((f) => { out.push({ folder: f, depth }); walk(f.id, depth + 1); });
    };
    walk(null, 0);
    return out;
  }, [folders, exclude]);

  return (
    <Dialog open={open} onClose={onClose} title={title} size="sm"
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button loading={busy} onClick={() => onConfirm(target)}>{confirmLabel}</Button></>}>
      <div role="radiogroup" aria-label="Destination folder" className="space-y-1">
        <button role="radio" aria-checked={target === null} onClick={() => setTarget(null)}
          className={cn("flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-surface-2", target === null && "bg-brand/15 text-brand")}>
          <Home className="h-4 w-4" />My Files (top level)
        </button>
        {rows.map(({ folder, depth }) => (
          <button key={folder.id} role="radio" aria-checked={target === folder.id} onClick={() => setTarget(folder.id)} style={{ paddingLeft: 12 + depth * 18 }}
            className={cn("flex w-full items-center gap-2 rounded-lg py-2 pr-3 text-left text-sm hover:bg-surface-2", target === folder.id && "bg-brand/15 text-brand")}>
            <Folder className="h-4 w-4 shrink-0" /><span className="truncate">{folder.name}</span>
          </button>
        ))}
      </div>
    </Dialog>
  );
}
