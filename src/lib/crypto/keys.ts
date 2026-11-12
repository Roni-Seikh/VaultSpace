/**
 * Vault key management.
 *
 *   vault passphrase --Argon2id(salt)--> HKDF --> KEK_pass  ─┐
 *                                                             ├─ each AES-256-GCM-wraps the same
 *   recovery key (random 256-bit) --HKDF--> KEK_recovery     ─┘   random 256-bit MASTER KEY
 *
 *   MASTER KEY --HKDF--> file-key wrapping key | name key | dedupe HMAC key
 *
 * The server stores only the wrapped master key (two copies) and the KDF parameters.
 * It never sees the passphrase, the recovery key or the master key.
 * Losing BOTH the passphrase and the recovery key makes the data permanently unreadable.
 */
import { argon2id } from "hash-wasm";
import {
  type Bytes, CryptoError, concat, fromB64, fromBase32, fromUtf8, groupString, randomBytes, toB64,
  toB64Url, toBase32, utf8,
} from "./encoding";

export interface KdfParams {
  memoryKiB: number;
  iterations: number;
  parallelism: number;
}

/** ~64 MiB / 3 passes: a few hundred ms in WASM on a laptop, expensive for GPU attackers. */
export const DEFAULT_KDF: KdfParams = { memoryKiB: 65536, iterations: 3, parallelism: 1 };

export interface VaultMetadata {
  kdf: "argon2id";
  kdfParams: KdfParams;
  /** base64 salt for the passphrase KDF */
  salt: string;
  wrappedMasterKeyPass: string;
  wrappedMasterKeyRecovery: string;
  formatVersion: 1;
}

export interface UnlockedVault {
  /** Wraps/unwraps per-file keys (AES-GCM, non-extractable). */
  wrapKey: CryptoKey;
  /** Encrypts/decrypts file and folder names. */
  nameKey: CryptoKey;
  /** Keyed hash for duplicate detection. */
  hmacKey: CryptoKey;
}

const subtle = (): SubtleCrypto => crypto.subtle;
const EMPTY = new Uint8Array(0) as Bytes;

const INFO = {
  kekPass: "vaultspace/v1/kek/passphrase",
  kekRecovery: "vaultspace/v1/kek/recovery",
  fileWrap: "vaultspace/v1/master/file-wrap",
  name: "vaultspace/v1/master/name",
  dedupe: "vaultspace/v1/master/dedupe",
} as const;

const AAD = {
  master: "vaultspace/v1/aad/master-key",
  fileKey: "vaultspace/v1/aad/file-key",
  name: "vaultspace/v1/aad/name",
} as const;

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------
async function hkdfBits(ikm: Bytes, info: string): Promise<Bytes> {
  const base = await subtle().importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  const bits = await subtle().deriveBits(
    { name: "HKDF", hash: "SHA-256", salt: EMPTY, info: utf8(info) },
    base,
    256,
  );
  return new Uint8Array(bits);
}

async function hkdfAesKey(ikm: Bytes, info: string, usages: KeyUsage[]): Promise<CryptoKey> {
  const base = await subtle().importKey("raw", ikm, "HKDF", false, ["deriveKey"]);
  return subtle().deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: EMPTY, info: utf8(info) },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    usages,
  );
}

async function sealRaw(key: CryptoKey, plaintext: Bytes, aad: string): Promise<string> {
  const iv = randomBytes(12);
  const ct = await subtle().encrypt({ name: "AES-GCM", iv, additionalData: utf8(aad) }, key, plaintext);
  return toB64(concat(iv, new Uint8Array(ct)));
}

async function openRaw(key: CryptoKey, sealed: string, aad: string, onFail: CryptoError): Promise<Bytes> {
  const data = fromB64(sealed);
  if (data.length < 12 + 16) throw new CryptoError("BAD_FORMAT", "Encrypted value is too short.");
  try {
    const pt = await subtle().decrypt(
      { name: "AES-GCM", iv: data.slice(0, 12), additionalData: utf8(aad) },
      key,
      data.slice(12),
    );
    return new Uint8Array(pt);
  } catch {
    throw onFail;
  }
}

export async function deriveFromPassphrase(passphrase: string, salt: Bytes, params: KdfParams): Promise<Bytes> {
  const out = await argon2id({
    password: passphrase.normalize("NFKC"),
    salt,
    parallelism: params.parallelism,
    iterations: params.iterations,
    memorySize: params.memoryKiB,
    hashLength: 32,
    outputType: "binary",
  });
  return new Uint8Array(out);
}

// ---------------------------------------------------------------------------
// Recovery key encoding
// ---------------------------------------------------------------------------
/** 32 random bytes -> "XXXX-XXXX-…" (52 Crockford base32 characters). */
export function formatRecoveryKey(bytes: Uint8Array): string {
  return groupString(toBase32(bytes), 4);
}

export function parseRecoveryKey(text: string): Bytes {
  return fromBase32(text, 32);
}

// ---------------------------------------------------------------------------
// Vault lifecycle
// ---------------------------------------------------------------------------
async function importMaster(masterRaw: Bytes): Promise<UnlockedVault> {
  const [wrapKey, nameKey, hmacRaw] = await Promise.all([
    hkdfAesKey(masterRaw, INFO.fileWrap, ["wrapKey", "unwrapKey"]),
    hkdfAesKey(masterRaw, INFO.name, ["encrypt", "decrypt"]),
    hkdfBits(masterRaw, INFO.dedupe),
  ]);
  const hmacKey = await subtle().importKey("raw", hmacRaw, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return { wrapKey, nameKey, hmacKey };
}

async function kekFromPassphrase(passphrase: string, salt: Bytes, params: KdfParams): Promise<CryptoKey> {
  const derived = await deriveFromPassphrase(passphrase, salt, params);
  return hkdfAesKey(derived, INFO.kekPass, ["encrypt", "decrypt"]);
}

async function kekFromRecovery(recoveryBytes: Bytes): Promise<CryptoKey> {
  return hkdfAesKey(recoveryBytes, INFO.kekRecovery, ["encrypt", "decrypt"]);
}

export interface CreatedVault {
  metadata: VaultMetadata;
  /** Show this to the user ONCE. It is not stored anywhere. */
  recoveryKey: string;
  vault: UnlockedVault;
}

export async function createVault(passphrase: string, params: KdfParams = DEFAULT_KDF): Promise<CreatedVault> {
  const masterRaw = randomBytes(32);
  const recoveryRaw = randomBytes(32);
  const salt = randomBytes(16);

  const [kekPass, kekRecovery] = await Promise.all([
    kekFromPassphrase(passphrase, salt, params),
    kekFromRecovery(recoveryRaw),
  ]);
  const [wrappedMasterKeyPass, wrappedMasterKeyRecovery, vault] = await Promise.all([
    sealRaw(kekPass, masterRaw, AAD.master),
    sealRaw(kekRecovery, masterRaw, AAD.master),
    importMaster(masterRaw),
  ]);
  masterRaw.fill(0);

  return {
    metadata: {
      kdf: "argon2id",
      kdfParams: params,
      salt: toB64(salt),
      wrappedMasterKeyPass,
      wrappedMasterKeyRecovery,
      formatVersion: 1,
    },
    recoveryKey: formatRecoveryKey(recoveryRaw),
    vault,
  };
}

const WRONG_PASSPHRASE = () => new CryptoError("WRONG_SECRET", "Incorrect vault passphrase.");
const WRONG_RECOVERY = () => new CryptoError("WRONG_SECRET", "Incorrect recovery key.");

async function unwrapMasterWithPassphrase(meta: VaultMetadata, passphrase: string): Promise<Bytes> {
  const kek = await kekFromPassphrase(passphrase, fromB64(meta.salt), meta.kdfParams);
  return openRaw(kek, meta.wrappedMasterKeyPass, AAD.master, WRONG_PASSPHRASE());
}

async function unwrapMasterWithRecovery(meta: VaultMetadata, recoveryKey: string): Promise<Bytes> {
  const kek = await kekFromRecovery(parseRecoveryKey(recoveryKey));
  return openRaw(kek, meta.wrappedMasterKeyRecovery, AAD.master, WRONG_RECOVERY());
}

export async function unlockWithPassphrase(meta: VaultMetadata, passphrase: string): Promise<UnlockedVault> {
  const master = await unwrapMasterWithPassphrase(meta, passphrase);
  const vault = await importMaster(master);
  master.fill(0);
  return vault;
}

export async function unlockWithRecoveryKey(meta: VaultMetadata, recoveryKey: string): Promise<UnlockedVault> {
  const master = await unwrapMasterWithRecovery(meta, recoveryKey);
  const vault = await importMaster(master);
  master.fill(0);
  return vault;
}

export type Credential = { type: "passphrase"; value: string } | { type: "recovery"; value: string };

async function unwrapMaster(meta: VaultMetadata, credential: Credential): Promise<Bytes> {
  return credential.type === "passphrase"
    ? unwrapMasterWithPassphrase(meta, credential.value)
    : unwrapMasterWithRecovery(meta, credential.value);
}

/** Change the passphrase. The master key (and therefore every file) stays the same. */
export async function changePassphrase(
  meta: VaultMetadata,
  current: Credential,
  newPassphrase: string,
  params: KdfParams = meta.kdfParams,
): Promise<VaultMetadata> {
  const master = await unwrapMaster(meta, current);
  const salt = randomBytes(16);
  const kek = await kekFromPassphrase(newPassphrase, salt, params);
  const wrappedMasterKeyPass = await sealRaw(kek, master, AAD.master);
  master.fill(0);
  return { ...meta, kdfParams: params, salt: toB64(salt), wrappedMasterKeyPass };
}

/** Replace the recovery key (e.g. if it was exposed). The old recovery key stops working. */
export async function regenerateRecoveryKey(
  meta: VaultMetadata,
  current: Credential,
): Promise<{ metadata: VaultMetadata; recoveryKey: string }> {
  const master = await unwrapMaster(meta, current);
  const recoveryRaw = randomBytes(32);
  const kek = await kekFromRecovery(recoveryRaw);
  const wrappedMasterKeyRecovery = await sealRaw(kek, master, AAD.master);
  master.fill(0);
  return { metadata: { ...meta, wrappedMasterKeyRecovery }, recoveryKey: formatRecoveryKey(recoveryRaw) };
}

// ---------------------------------------------------------------------------
// Per-file keys, names, dedupe hash
// ---------------------------------------------------------------------------
export async function generateFileKey(): Promise<CryptoKey> {
  return subtle().generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
}

export async function wrapFileKey(vault: UnlockedVault, fileKey: CryptoKey): Promise<string> {
  const iv = randomBytes(12);
  const wrapped = await subtle().wrapKey("raw", fileKey, vault.wrapKey, {
    name: "AES-GCM",
    iv,
    additionalData: utf8(AAD.fileKey),
  });
  return toB64(concat(iv, new Uint8Array(wrapped)));
}

export async function unwrapFileKey(
  vault: UnlockedVault,
  wrapped: string,
  extractable = false,
): Promise<CryptoKey> {
  const data = fromB64(wrapped);
  if (data.length < 12 + 32 + 16) throw new CryptoError("BAD_FORMAT", "Wrapped key is malformed.");
  try {
    return await subtle().unwrapKey(
      "raw",
      data.slice(12),
      vault.wrapKey,
      { name: "AES-GCM", iv: data.slice(0, 12), additionalData: utf8(AAD.fileKey) },
      { name: "AES-GCM", length: 256 },
      extractable,
      ["encrypt", "decrypt"],
    );
  } catch {
    throw new CryptoError("DECRYPT_FAILED", "Could not unlock this file's key.");
  }
}

export async function encryptName(vault: UnlockedVault, name: string): Promise<string> {
  return sealRaw(vault.nameKey, utf8(name), AAD.name);
}

export async function decryptName(vault: UnlockedVault, nameEnc: string): Promise<string> {
  const pt = await openRaw(
    vault.nameKey,
    nameEnc,
    AAD.name,
    new CryptoError("DECRYPT_FAILED", "Could not decrypt name."),
  );
  return fromUtf8(pt);
}

/** Keyed hash of the plaintext for duplicate detection (not comparable across users). */
export async function contentHmac(vault: UnlockedVault, data: Blob): Promise<string> {
  const digest = await subtle().digest("SHA-256", await data.arrayBuffer());
  const mac = await subtle().sign("HMAC", vault.hmacKey, digest);
  return toB64Url(new Uint8Array(mac));
}
