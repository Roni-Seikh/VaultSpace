/** Thin wrappers over the file/folder APIs that handle name encryption. */
import { api } from "./api";
import { encryptName, type UnlockedVault } from "@/lib/crypto/keys";
import { sanitizeFileName, sanitizeFolderName } from "@/lib/files/names";

export async function createFolder(vault: UnlockedVault, name: string, parentId: string | null) {
  return api("/api/folders", { body: { nameEnc: await encryptName(vault, sanitizeFolderName(name)), parentId } });
}
export async function renameFolder(vault: UnlockedVault, id: string, name: string) {
  return api(`/api/folders/${id}`, { method: "PATCH", body: { nameEnc: await encryptName(vault, sanitizeFolderName(name)) } });
}
export const moveFolder = (id: string, parentId: string | null) => api(`/api/folders/${id}`, { method: "PATCH", body: { parentId } });
export const deleteFolder = (id: string) => api(`/api/folders/${id}`, { method: "DELETE" });

export async function renameFile(vault: UnlockedVault, id: string, name: string) {
  return api(`/api/files/${id}`, { method: "PATCH", body: { nameEnc: await encryptName(vault, sanitizeFileName(name)) } });
}
export const moveFile = (id: string, folderId: string | null) => api(`/api/files/${id}`, { method: "PATCH", body: { folderId } });
export const deleteFile = (id: string) => api(`/api/files/${id}`, { method: "DELETE" });
export async function copyFile(vault: UnlockedVault, id: string, newName: string, folderId: string | null) {
  return api(`/api/files/${id}/copy`, { body: { nameEnc: await encryptName(vault, sanitizeFileName(newName)), folderId } });
}
