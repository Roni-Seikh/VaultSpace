/** Browser-side upload/download pipeline: validate -> encrypt -> presigned PUT; presigned GET -> decrypt. */
import { api, ApiClientError } from "./api";
import { publicEnv } from "@/lib/env";
import { detectFileType } from "@/lib/files/types";
import { sanitizeFileName } from "@/lib/files/names";
import { decryptBlob, encryptBlob, encryptedSize } from "@/lib/crypto/chunk-cipher";
import { contentHmac, encryptName, generateFileKey, unwrapFileKey, wrapFileKey, type UnlockedVault } from "@/lib/crypto/keys";
import type { DownloadResponse } from "@/app/api/files/[id]/download/route";

export interface UploadOptions {
  file: File;
  vault: UnlockedVault;
  folderId: string | null;
  /** Set to upload a new version of an existing file. */
  fileId?: string | null;
  maxFileBytes: number;
  onProgress?: (fraction: number, phase: "checking" | "encrypting" | "uploading" | "finishing") => void;
  signal?: AbortSignal;
}

export function putWithProgress(url: string, body: Blob, onProgress: (f: number) => void, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", "application/octet-stream");
    xhr.setRequestHeader("x-upsert", "false");
    // Supabase's gateway expects the public anon key on storage calls; the signed URL token authorises the write.
    const anon = publicEnv().NEXT_PUBLIC_SUPABASE_ANON_KEY;
    xhr.setRequestHeader("apikey", anon);
    xhr.setRequestHeader("Authorization", `Bearer ${anon}`);
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress(e.loaded / e.total); };
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new ApiClientError(xhr.status, "UPLOAD_FAILED", `Storage rejected the upload (HTTP ${xhr.status}).`)));
    xhr.onerror = () => reject(new ApiClientError(0, "NETWORK", "Upload failed: network error. Check your connection and try again."));
    xhr.onabort = () => reject(new DOMException("Aborted", "AbortError"));
    signal?.addEventListener("abort", () => xhr.abort(), { once: true });
    xhr.send(body);
  });
}

export async function uploadEncrypted(opts: UploadOptions): Promise<{ fileId: string; version: number }> {
  const { file, vault, folderId, fileId, maxFileBytes, onProgress, signal } = opts;

  onProgress?.(0, "checking");
  const detected = await detectFileType(file);
  if (!detected.ok) throw new Error(detected.reason);
  const { category, mime } = detected.type;

  const cipherSize = encryptedSize(file.size);
  if (cipherSize > maxFileBytes) {
    throw new Error(`This file is too large. The maximum is ${Math.floor(maxFileBytes / 1024 / 1024)} MB per file.`);
  }

  const fileKey = await generateFileKey();
  const [wrappedKey, nameEnc, hmac] = await Promise.all([
    wrapFileKey(vault, fileKey),
    encryptName(vault, sanitizeFileName(file.name)),
    contentHmac(vault, file),
  ]);

  onProgress?.(0, "encrypting");
  const encrypted = await encryptBlob(file, fileKey, { onProgress: (d, t) => onProgress?.(d / t, "encrypting") });
  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");

  const init = await api<{ fileId: string; versionId: string; version: number; uploadUrl: string }>("/api/files/upload-init", {
    body: { fileId: fileId ?? null, folderId, nameEnc, category, mimeType: mime, size: encrypted.size, wrappedKey, contentHmac: hmac },
    signal,
  });

  try {
    onProgress?.(0, "uploading");
    await putWithProgress(init.uploadUrl, encrypted, (f) => onProgress?.(f, "uploading"), signal);
    onProgress?.(1, "finishing");
    return await api<{ fileId: string; version: number }>("/api/files/upload-complete", { body: { versionId: init.versionId } });
  } catch (e) {
    // Release the reserved quota so a failed upload never "uses up" space.
    await api("/api/files/upload-abort", { body: { versionId: init.versionId } }).catch(() => undefined);
    throw e;
  }
}

/** Download the encrypted object and decrypt it in the browser. */
export async function downloadDecrypted(
  fileId: string, vault: UnlockedVault, opts: { version?: number; onProgress?: (f: number) => void } = {},
): Promise<{ blob: Blob; mimeType: string; version: number }> {
  const q = opts.version ? `?version=${opts.version}` : "";
  const info = await api<DownloadResponse>(`/api/files/${fileId}/download${q}`);
  const res = await fetch(info.url);
  if (!res.ok) throw new ApiClientError(res.status, "DOWNLOAD_FAILED", "Could not download the file from storage. Please try again.");
  const encrypted = await res.blob();
  const key = await unwrapFileKey(vault, info.wrappedFileKey);
  const blob = await decryptBlob(encrypted, key, { mimeType: info.mimeType, onProgress: (d, t) => opts.onProgress?.(d / t) });
  return { blob, mimeType: info.mimeType, version: info.version };
}

/** Save a decrypted blob under a (sanitised) name. Never navigates to the blob, so nothing executes. */
export function saveBlob(blob: Blob, name: string): void {
  const url = URL.createObjectURL(new Blob([blob], { type: "application/octet-stream" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
