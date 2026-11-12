import type { MimeCategory } from "@/lib/files/types";

export interface RawFolder { id: string; parent_id: string | null; name_enc: string; created_at: string }
export interface RawFile {
  id: string; folder_id: string | null; name_enc: string; mime_category: MimeCategory; mime_type: string;
  size_bytes: number | string; current_version: number; content_hmac: string | null; created_at: string; updated_at: string;
}
export interface FolderItem { id: string; parentId: string | null; name: string; createdAt: string }
export interface FileItem {
  id: string; folderId: string | null; name: string; nameEnc: string; category: MimeCategory; mimeType: string;
  size: number; version: number; hmac: string | null; createdAt: string; updatedAt: string;
}
export interface StorageInfo {
  quotaBytes: number; usedBytes: number; reservedBytes: number; remainingBytes: number; fileCount: number;
  maxFileBytes: number; serviceFull: boolean;
}
export interface ActivityItem { id: number; action: string; target_type: string | null; target_id: string | null; meta: Record<string, unknown>; created_at: string }
export interface Profile {
  email: string; displayName: string; role: "user" | "admin"; theme: "system" | "light" | "dark";
  notifyStorage: boolean; notifySecurity: boolean; notifySharing: boolean; createdAt: string;
}
