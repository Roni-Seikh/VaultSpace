import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";
// NOTE: the folder is still called "r2" for historical reasons. This module now talks to Supabase Storage (free, no card).

/**
 * Encrypted-object storage on Supabase Storage (free plan, no card required).
 * Objects are ciphertext only. The bucket is PRIVATE: access is only through short-lived signed URLs
 * minted here after the caller has been authenticated and authorised.
 */
export const UPLOAD_URL_TTL_SECONDS = 7200; // Supabase signed upload URLs are valid for 2 hours (fixed by the service).
export const DOWNLOAD_URL_TTL_SECONDS = 60;
export const STORAGE_BUCKET = process.env.STORAGE_BUCKET || "vaultspace-files";
/** Supabase's Free plan rejects objects larger than 50 MB; we create the bucket with the same ceiling. */
export const BUCKET_FILE_SIZE_LIMIT = "50MB";

/** Minimal surface of the Supabase storage API we use (lets tests inject a fake). */
export interface StorageApi {
  createSignedUploadUrl(path: string): Promise<{ data: { signedUrl: string } | null; error: { message: string } | null }>;
  createSignedUrl(path: string, expiresIn: number, opts?: { download?: boolean | string }): Promise<{ data: { signedUrl: string } | null; error: { message: string } | null }>;
  info(path: string): Promise<{ data: { size?: number } | null; error: { message: string; statusCode?: string | number } | null }>;
  copy(from: string, to: string): Promise<{ error: { message: string } | null }>;
  remove(paths: string[]): Promise<{ data: unknown; error: { message: string } | null }>;
}

let bucketReady: Promise<void> | null = null;

/** Creates the private bucket on first use so there is no manual dashboard step. Safe to call repeatedly. */
async function ensureBucket(): Promise<void> {
  bucketReady ??= (async () => {
    const { error } = await supabaseAdmin().storage.createBucket(STORAGE_BUCKET, {
      public: false,
      fileSizeLimit: BUCKET_FILE_SIZE_LIMIT,
    });
    if (error && !/already exists|duplicate/i.test(error.message)) {
      bucketReady = null;
      throw new Error(`Could not prepare the storage bucket: ${error.message}`);
    }
  })();
  return bucketReady;
}

async function api(): Promise<StorageApi> {
  await ensureBucket();
  return supabaseAdmin().storage.from(STORAGE_BUCKET) as unknown as StorageApi;
}

/** Signed URL the browser uploads the ciphertext to (HTTP PUT, raw body). Size is verified afterwards by upload-complete. */
export async function presignUpload(key: string, store?: StorageApi): Promise<string> {
  const s = store ?? (await api());
  const { data, error } = await s.createSignedUploadUrl(key);
  if (error || !data) throw new Error(`Could not create an upload URL: ${error?.message ?? "unknown error"}`);
  return data.signedUrl;
}

export async function presignDownload(key: string, store?: StorageApi): Promise<string> {
  const s = store ?? (await api());
  const { data, error } = await s.createSignedUrl(key, DOWNLOAD_URL_TTL_SECONDS, { download: true });
  if (error || !data) throw new Error(`Could not create a download URL: ${error?.message ?? "unknown error"}`);
  return data.signedUrl;
}

/** Stored object size in bytes, or null if the object does not exist. */
export async function headObjectSize(key: string, store?: StorageApi): Promise<number | null> {
  const s = store ?? (await api());
  const { data, error } = await s.info(key);
  if (error) {
    if (/not found|does not exist|404|object not found/i.test(`${error.message} ${error.statusCode ?? ""}`)) return null;
    throw new Error(`Could not read object info: ${error.message}`);
  }
  return typeof data?.size === "number" ? data.size : null;
}

export async function copyObject(sourceKey: string, destKey: string, store?: StorageApi): Promise<void> {
  const s = store ?? (await api());
  const { error } = await s.copy(sourceKey, destKey);
  if (error) throw new Error(`Could not copy object: ${error.message}`);
}

/** Best-effort bulk delete. Returns the keys that could not be deleted. */
export async function deleteObjects(keys: string[], store?: StorageApi): Promise<string[]> {
  const failed: string[] = [];
  if (keys.length === 0) return failed;
  const s = store ?? (await api());
  for (let i = 0; i < keys.length; i += 100) {
    const batch = keys.slice(i, i + 100);
    try {
      const { error } = await s.remove(batch);
      if (error) failed.push(...batch);
    } catch {
      failed.push(...batch);
    }
  }
  return failed;
}
