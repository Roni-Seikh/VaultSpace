"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api, errorMessage } from "@/lib/client/api";
import { decryptName } from "@/lib/crypto/keys";
import type { FileItem, FolderItem, RawFile, RawFolder, StorageInfo } from "@/lib/client/types";
import { useVault } from "./vault-provider";

interface LibraryApi {
  loading: boolean;
  error: string | null;
  files: FileItem[];
  folders: FolderItem[];
  storage: StorageInfo | null;
  refresh(): Promise<void>;
}

const Ctx = createContext<LibraryApi | null>(null);

export function LibraryProvider({ children }: { children: ReactNode }) {
  const { vault } = useVault();
  const [files, setFiles] = useState<FileItem[]>([]);
  const [folders, setFolders] = useState<FolderItem[]>([]);
  const [storage, setStorage] = useState<StorageInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!vault) return;
    try {
      const [lib, st] = await Promise.all([
        api<{ files: RawFile[]; folders: RawFolder[] }>("/api/library"),
        api<StorageInfo>("/api/storage"),
      ]);
      const safe = async (enc: string, fallback: string) => decryptName(vault, enc).catch(() => fallback);
      const [f, d] = await Promise.all([
        Promise.all(lib.files.map(async (x): Promise<FileItem> => ({
          id: x.id, folderId: x.folder_id, name: await safe(x.name_enc, "(unreadable name)"), nameEnc: x.name_enc,
          category: x.mime_category, mimeType: x.mime_type, size: Number(x.size_bytes), version: x.current_version,
          hmac: x.content_hmac, createdAt: x.created_at, updatedAt: x.updated_at,
        }))),
        Promise.all(lib.folders.map(async (x): Promise<FolderItem> => ({
          id: x.id, parentId: x.parent_id, name: await safe(x.name_enc, "(unreadable folder)"), createdAt: x.created_at,
        }))),
      ]);
      setFiles(f);
      setFolders(d);
      setStorage(st);
      setError(null);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [vault]);

  useEffect(() => {
    if (!vault) { setFiles([]); setFolders([]); return; }
    setLoading(true);
    void refresh();
  }, [vault, refresh]);

  const value = useMemo(() => ({ loading, error, files, folders, storage, refresh }), [loading, error, files, folders, storage, refresh]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useLibrary(): LibraryApi {
  const c = useContext(Ctx);
  if (!c) throw new Error("useLibrary must be used inside <LibraryProvider>");
  return c;
}
