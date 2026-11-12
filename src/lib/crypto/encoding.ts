/** Small, dependency-free byte/encoding helpers shared by the crypto modules. */

export type Bytes = Uint8Array<ArrayBuffer>;

export class CryptoError extends Error {
  constructor(
    public readonly code:
      | "WRONG_SECRET"
      | "DECRYPT_FAILED"
      | "BAD_FORMAT"
      | "BAD_INPUT",
    message: string,
  ) {
    super(message);
    this.name = "CryptoError";
  }
}

export function randomBytes(length: number): Bytes {
  const out = new Uint8Array(length);
  // getRandomValues() accepts at most 65,536 bytes per call.
  for (let offset = 0; offset < length; offset += 65536) {
    crypto.getRandomValues(out.subarray(offset, Math.min(offset + 65536, length)));
  }
  return out;
}

export function utf8(text: string): Bytes {
  return new TextEncoder().encode(text) as Bytes;
}

export function fromUtf8(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}

export function concat(...parts: Uint8Array[]): Bytes {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
}

export function u32be(value: number): Bytes {
  const out = new Uint8Array(4);
  new DataView(out.buffer).setUint32(0, value >>> 0, false);
  return out;
}

export function toB64(bytes: Uint8Array): string {
  let binary = "";
  const step = 0x8000;
  for (let i = 0; i < bytes.length; i += step) {
    binary += String.fromCharCode(...bytes.subarray(i, i + step));
  }
  return btoa(binary);
}

export function fromB64(text: string): Bytes {
  let binary: string;
  try {
    binary = atob(text);
  } catch {
    throw new CryptoError("BAD_FORMAT", "Invalid base64 data.");
  }
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

export function toB64Url(bytes: Uint8Array): string {
  return toB64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function fromB64Url(text: string): Bytes {
  if (!/^[A-Za-z0-9_-]*$/.test(text)) throw new CryptoError("BAD_FORMAT", "Invalid base64url data.");
  const padded = text.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (text.length % 4)) % 4);
  return fromB64(padded);
}

// ---------------------------------------------------------------------------
// Crockford base32 (used for the human-friendly recovery key)
// ---------------------------------------------------------------------------
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

export function toBase32(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
    value &= (1 << bits) - 1;
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

export function fromBase32(text: string, expectedBytes: number): Bytes {
  const cleaned = text
    .toUpperCase()
    .replace(/[\s-]/g, "")
    .replace(/O/g, "0")
    .replace(/[IL]/g, "1");
  if (cleaned.length !== Math.ceil((expectedBytes * 8) / 5)) {
    throw new CryptoError("BAD_INPUT", "The key has the wrong length.");
  }
  const out = new Uint8Array(expectedBytes);
  let bits = 0;
  let value = 0;
  let index = 0;
  for (const ch of cleaned) {
    const v = ALPHABET.indexOf(ch);
    if (v < 0) throw new CryptoError("BAD_INPUT", "The key contains an invalid character.");
    value = (value << 5) | v;
    bits += 5;
    if (bits >= 8) {
      out[index++] = (value >>> (bits - 8)) & 0xff;
      bits -= 8;
      value &= (1 << bits) - 1;
    }
  }
  if (index !== expectedBytes || value !== 0) {
    throw new CryptoError("BAD_INPUT", "The key is not valid.");
  }
  return out;
}

export function groupString(text: string, size: number, separator = "-"): string {
  const groups: string[] = [];
  for (let i = 0; i < text.length; i += size) groups.push(text.slice(i, i + size));
  return groups.join(separator);
}
