/**
 * Chunked AES-256-GCM file encryption.
 *
 * Layout:  [ "VSP1" | chunkSize u32 | noncePrefix 8B ]  (16-byte header)
 *          [ chunk 0 ciphertext + 16B tag ] [ chunk 1 … ] … [ final chunk ]
 *
 * - IV for chunk i  = noncePrefix || u32be(i)            (unique per chunk, 12 bytes)
 * - AAD for chunk i = header || u32be(i) || finalFlag    (binds position, header and "is last")
 *
 * Consequences: reordering, duplicating or dropping chunks, truncating the file, or editing the
 * header all fail authentication. Each file uses its own random key, so the (key, IV) pair never
 * repeats. Chunking keeps browser memory use bounded to roughly one chunk of plaintext at a time.
 */
import { type Bytes, CryptoError, concat, u32be, randomBytes } from "./encoding";

export const MAGIC = new Uint8Array([0x56, 0x53, 0x50, 0x31]); // "VSP1"
export const HEADER_BYTES = 16;
export const TAG_BYTES = 16;
export const DEFAULT_CHUNK_BYTES = 4 * 1024 * 1024;
const MAX_CHUNK_BYTES = 64 * 1024 * 1024;

export type ProgressFn = (done: number, total: number) => void;

/** Exact size of the ciphertext for a given plaintext size. */
export function encryptedSize(plainBytes: number, chunkBytes = DEFAULT_CHUNK_BYTES): number {
  const chunks = Math.max(1, Math.ceil(plainBytes / chunkBytes));
  return HEADER_BYTES + plainBytes + chunks * TAG_BYTES;
}

function makeHeader(chunkBytes: number, noncePrefix: Bytes): Bytes {
  return concat(MAGIC, u32be(chunkBytes), noncePrefix);
}

function chunkIv(noncePrefix: Uint8Array, index: number): Bytes {
  return concat(noncePrefix, u32be(index));
}

function chunkAad(header: Uint8Array, index: number, final: boolean): Bytes {
  return concat(header, u32be(index), new Uint8Array([final ? 1 : 0]));
}

export async function encryptBlob(
  blob: Blob,
  key: CryptoKey,
  opts: { chunkBytes?: number; onProgress?: ProgressFn } = {},
): Promise<Blob> {
  const chunkBytes = opts.chunkBytes ?? DEFAULT_CHUNK_BYTES;
  if (!Number.isInteger(chunkBytes) || chunkBytes < 1 || chunkBytes > MAX_CHUNK_BYTES) {
    throw new CryptoError("BAD_INPUT", "Invalid chunk size.");
  }
  const noncePrefix = randomBytes(8);
  const header = makeHeader(chunkBytes, noncePrefix);
  const parts: BlobPart[] = [header];

  let offset = 0;
  let index = 0;
  do {
    const end = Math.min(offset + chunkBytes, blob.size);
    const final = end >= blob.size;
    const plain = await blob.slice(offset, end).arrayBuffer();
    const cipher = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: chunkIv(noncePrefix, index), additionalData: chunkAad(header, index, final), tagLength: 128 },
      key,
      plain,
    );
    parts.push(cipher);
    offset = end;
    index++;
    opts.onProgress?.(offset, blob.size);
  } while (offset < blob.size);

  return new Blob(parts, { type: "application/octet-stream" });
}

export async function decryptBlob(
  encrypted: Blob,
  key: CryptoKey,
  opts: { mimeType?: string; onProgress?: ProgressFn } = {},
): Promise<Blob> {
  if (encrypted.size < HEADER_BYTES + TAG_BYTES) {
    throw new CryptoError("BAD_FORMAT", "File is too small to be a VaultSpace encrypted file.");
  }
  const header = new Uint8Array(await encrypted.slice(0, HEADER_BYTES).arrayBuffer());
  for (let i = 0; i < MAGIC.length; i++) {
    if (header[i] !== MAGIC[i]) throw new CryptoError("BAD_FORMAT", "Not a VaultSpace encrypted file.");
  }
  const chunkBytes = new DataView(header.buffer).getUint32(4, false);
  if (chunkBytes < 1 || chunkBytes > MAX_CHUNK_BYTES) {
    throw new CryptoError("BAD_FORMAT", "Corrupt encrypted file header.");
  }
  const noncePrefix = header.slice(8, 16);

  const stride = chunkBytes + TAG_BYTES;
  const body = encrypted.size - HEADER_BYTES;
  const chunks = Math.ceil(body / stride);
  const out: BlobPart[] = [];
  let produced = 0;

  for (let index = 0; index < chunks; index++) {
    const start = HEADER_BYTES + index * stride;
    const end = Math.min(start + stride, encrypted.size);
    const final = index === chunks - 1;
    const cipher = await encrypted.slice(start, end).arrayBuffer();
    try {
      const plain = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: chunkIv(noncePrefix, index), additionalData: chunkAad(header, index, final), tagLength: 128 },
        key,
        cipher,
      );
      out.push(plain);
      produced += plain.byteLength;
      opts.onProgress?.(produced, encrypted.size);
    } catch {
      throw new CryptoError("DECRYPT_FAILED", "Decryption failed: the file is corrupted, was modified, or the key is wrong.");
    }
  }
  return new Blob(out, { type: opts.mimeType ?? "application/octet-stream" });
}
