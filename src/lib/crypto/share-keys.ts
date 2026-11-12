/**
 * Share-link cryptography.
 *
 *   link:  https://app/s/<token>#<shareSecret>      (the #fragment is never sent to any server)
 *
 *   wrapKey = HKDF( shareSecret [|| pwKey] )        pwKey = Argon2id(password, pwSalt) when protected
 *   DB stores:  wrap(fileKey, wrapKey),  encrypt(fileName, wrapKey),  sha256(token),
 *               and, for protected links, sha256(gateToken) where gateToken = HKDF(pwKey).
 *
 * The server can therefore verify a password attempt (via the gate token) without learning the
 * password, and cannot decrypt anything because it never sees shareSecret.
 *
 * Trade-offs (documented in docs/security-model.md): anyone holding the complete link can decrypt
 * until it is revoked/expired; a "view only" link is a UI restriction, not cryptographic.
 */
import {
  type Bytes, CryptoError, concat, fromB64, fromB64Url, fromUtf8, randomBytes, toB64, toB64Url, utf8,
} from "./encoding";
import { DEFAULT_KDF, type KdfParams, deriveFromPassphrase } from "./keys";

const EMPTY = new Uint8Array(0) as Bytes;
const INFO = {
  wrap: "vaultspace/v1/share/wrap",
  gate: "vaultspace/v1/share/gate",
} as const;
const AAD = {
  fileKey: "vaultspace/v1/aad/share-file-key",
  name: "vaultspace/v1/aad/share-name",
} as const;

export const SHARE_SECRET_BYTES = 32;

export function generateShareSecret(): Bytes {
  return randomBytes(SHARE_SECRET_BYTES);
}

export function generatePasswordSalt(): string {
  return toB64(randomBytes(16));
}

export interface PasswordMaterial {
  pwKey: Bytes;
  /** Sent to the server to prove knowledge of the password (server stores only its SHA-256). */
  gateToken: string;
}

export async function derivePasswordMaterial(
  password: string,
  saltB64: string,
  params: KdfParams = DEFAULT_KDF,
): Promise<PasswordMaterial> {
  const pwKey = await deriveFromPassphrase(password, fromB64(saltB64), params);
  const base = await crypto.subtle.importKey("raw", pwKey, "HKDF", false, ["deriveBits"]);
  const gate = await crypto.subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt: EMPTY, info: utf8(INFO.gate) },
    base,
    256,
  );
  return { pwKey, gateToken: toB64Url(new Uint8Array(gate)) };
}

export async function deriveShareWrapKey(secret: Bytes, pwKey?: Bytes): Promise<CryptoKey> {
  const ikm = pwKey ? concat(secret, pwKey) : secret;
  const base = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: EMPTY, info: utf8(INFO.wrap) },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["wrapKey", "unwrapKey", "encrypt", "decrypt"],
  );
}

export async function wrapFileKeyForShare(fileKey: CryptoKey, shareWrapKey: CryptoKey): Promise<string> {
  const iv = randomBytes(12);
  const wrapped = await crypto.subtle.wrapKey("raw", fileKey, shareWrapKey, {
    name: "AES-GCM",
    iv,
    additionalData: utf8(AAD.fileKey),
  });
  return toB64(concat(iv, new Uint8Array(wrapped)));
}

export async function unwrapFileKeyFromShare(wrapped: string, shareWrapKey: CryptoKey): Promise<CryptoKey> {
  const data = fromB64(wrapped);
  if (data.length < 12 + 32 + 16) throw new CryptoError("BAD_FORMAT", "Share key is malformed.");
  try {
    return await crypto.subtle.unwrapKey(
      "raw",
      data.slice(12),
      shareWrapKey,
      { name: "AES-GCM", iv: data.slice(0, 12), additionalData: utf8(AAD.fileKey) },
      { name: "AES-GCM", length: 256 },
      false,
      ["decrypt"],
    );
  } catch {
    throw new CryptoError("WRONG_SECRET", "This link or password is not valid for this file.");
  }
}

export async function encryptShareName(name: string, shareWrapKey: CryptoKey): Promise<string> {
  const iv = randomBytes(12);
  const ct = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: utf8(AAD.name) },
    shareWrapKey,
    utf8(name),
  );
  return toB64(concat(iv, new Uint8Array(ct)));
}

export async function decryptShareName(nameEnc: string, shareWrapKey: CryptoKey): Promise<string> {
  const data = fromB64(nameEnc);
  try {
    const pt = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: data.slice(0, 12), additionalData: utf8(AAD.name) },
      shareWrapKey,
      data.slice(12),
    );
    return fromUtf8(new Uint8Array(pt));
  } catch {
    throw new CryptoError("WRONG_SECRET", "This link or password is not valid for this file.");
  }
}

export function buildShareUrl(origin: string, token: string, secret: Bytes): string {
  return `${origin.replace(/\/$/, "")}/s/${token}#${toB64Url(secret)}`;
}

/** Parse "#<secret>" from location.hash. Returns null if missing or malformed. */
export function parseShareFragment(hash: string): Bytes | null {
  const raw = hash.startsWith("#") ? hash.slice(1) : hash;
  if (!raw) return null;
  try {
    const bytes = fromB64Url(raw);
    return bytes.length === SHARE_SECRET_BYTES ? bytes : null;
  } catch {
    return null;
  }
}
