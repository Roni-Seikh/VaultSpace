// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  CryptoError, fromB64Url, fromBase32, randomBytes, toB64, toB64Url, toBase32, utf8,
} from "@/lib/crypto/encoding";
import {
  DEFAULT_KDF, type KdfParams, changePassphrase, contentHmac, createVault, decryptName, encryptName,
  formatRecoveryKey, generateFileKey, parseRecoveryKey, regenerateRecoveryKey, unlockWithPassphrase,
  unlockWithRecoveryKey, unwrapFileKey, wrapFileKey,
} from "@/lib/crypto/keys";
import {
  DEFAULT_CHUNK_BYTES, HEADER_BYTES, decryptBlob, encryptBlob, encryptedSize,
} from "@/lib/crypto/chunk-cipher";
import {
  buildShareUrl, decryptShareName, derivePasswordMaterial, deriveShareWrapKey, encryptShareName,
  generatePasswordSalt, generateShareSecret, parseShareFragment, unwrapFileKeyFromShare,
  wrapFileKeyForShare,
} from "@/lib/crypto/share-keys";

// Fast KDF for tests only. Production uses DEFAULT_KDF (asserted below).
const FAST: KdfParams = { memoryKiB: 1024, iterations: 1, parallelism: 1 };

async function blobBytes(b: Blob): Promise<Uint8Array> {
  return new Uint8Array(await b.arrayBuffer());
}

describe("encoding", () => {
  it("base64 / base64url round-trip arbitrary bytes", () => {
    const bytes = randomBytes(1000);
    expect(Array.from(fromB64Url(toB64Url(bytes)))).toEqual(Array.from(bytes));
    expect(toB64Url(new Uint8Array([251, 255, 254]))).not.toMatch(/[+/=]/);
    expect(toB64(utf8("hi"))).toBe("aGk=");
  });

  it("base32 round-trips 32 bytes and tolerates case, dashes and look-alike characters", () => {
    for (let i = 0; i < 50; i++) {
      const b = randomBytes(32);
      const text = toBase32(b);
      expect(text).toHaveLength(52);
      expect(Array.from(fromBase32(text, 32))).toEqual(Array.from(b));
      expect(Array.from(fromBase32(text.toLowerCase().replace(/(.{4})/g, "$1-"), 32))).toEqual(Array.from(b));
    }
  });

  it("base32 rejects wrong length and invalid characters", () => {
    expect(() => fromBase32("ABC", 32)).toThrow(CryptoError);
    expect(() => fromBase32("U".repeat(52), 32)).toThrow(CryptoError); // U is not in the alphabet
    expect(() => fromBase32("Z".repeat(52), 32)).toThrow(CryptoError); // non-zero padding bits
  });
});

describe("vault keys", () => {
  it("production KDF settings are strong", () => {
    expect(DEFAULT_KDF.memoryKiB).toBeGreaterThanOrEqual(65536);
    expect(DEFAULT_KDF.iterations).toBeGreaterThanOrEqual(3);
  });

  it("creates a vault that unlocks with the passphrase and with the recovery key", async () => {
    const { metadata, recoveryKey, vault } = await createVault("correct horse battery staple", FAST);
    expect(recoveryKey).toMatch(/^([0-9A-Z]{4}-){12}[0-9A-Z]{4}$/);

    const key = await generateFileKey();
    const wrapped = await wrapFileKey(vault, key);

    const viaPass = await unlockWithPassphrase(metadata, "correct horse battery staple");
    const viaRecovery = await unlockWithRecoveryKey(metadata, recoveryKey);
    for (const v of [viaPass, viaRecovery]) {
      const unwrapped = await unwrapFileKey(v, wrapped);
      const blob = await encryptBlob(new Blob([utf8("secret")]), key);
      expect(new TextDecoder().decode(await blobBytes(await decryptBlob(blob, unwrapped)))).toBe("secret");
    }
  });

  it("rejects the wrong passphrase and the wrong recovery key", async () => {
    const { metadata, recoveryKey } = await createVault("right-passphrase", FAST);
    await expect(unlockWithPassphrase(metadata, "wrong-passphrase")).rejects.toMatchObject({ code: "WRONG_SECRET" });
    const other = formatRecoveryKey(randomBytes(32));
    expect(other).not.toBe(recoveryKey);
    await expect(unlockWithRecoveryKey(metadata, other)).rejects.toMatchObject({ code: "WRONG_SECRET" });
    await expect(unlockWithRecoveryKey(metadata, "not-a-key")).rejects.toBeInstanceOf(CryptoError);
  });

  it("stores no raw secrets: metadata contains only wrapped keys, salt and params", async () => {
    const { metadata, recoveryKey } = await createVault("my secret passphrase", FAST);
    const json = JSON.stringify(metadata);
    expect(json).not.toContain("my secret passphrase");
    expect(json).not.toContain(recoveryKey.replace(/-/g, ""));
    expect(Object.keys(metadata).sort()).toEqual(
      ["formatVersion", "kdf", "kdfParams", "salt", "wrappedMasterKeyPass", "wrappedMasterKeyRecovery"].sort(),
    );
  });

  it("two vaults with the same passphrase get different salts, wrapped keys and recovery keys", async () => {
    const a = await createVault("same-passphrase", FAST);
    const b = await createVault("same-passphrase", FAST);
    expect(a.metadata.salt).not.toBe(b.metadata.salt);
    expect(a.metadata.wrappedMasterKeyPass).not.toBe(b.metadata.wrappedMasterKeyPass);
    expect(a.recoveryKey).not.toBe(b.recoveryKey);
  });

  it("changing the passphrase keeps existing files readable and invalidates the old passphrase", async () => {
    const { metadata, vault } = await createVault("old-passphrase", FAST);
    const key = await generateFileKey();
    const wrapped = await wrapFileKey(vault, key);
    const nameEnc = await encryptName(vault, "taxes.pdf");

    const next = await changePassphrase(metadata, { type: "passphrase", value: "old-passphrase" }, "new-passphrase", FAST);
    await expect(unlockWithPassphrase(next, "old-passphrase")).rejects.toMatchObject({ code: "WRONG_SECRET" });
    const v2 = await unlockWithPassphrase(next, "new-passphrase");
    expect(await decryptName(v2, nameEnc)).toBe("taxes.pdf");
    await expect(unwrapFileKey(v2, wrapped)).resolves.toBeDefined();
  });

  it("passphrase can be reset using the recovery key", async () => {
    const { metadata, recoveryKey, vault } = await createVault("forgotten", FAST);
    const nameEnc = await encryptName(vault, "photo.jpg");
    const next = await changePassphrase(metadata, { type: "recovery", value: recoveryKey }, "brand-new", FAST);
    const v2 = await unlockWithPassphrase(next, "brand-new");
    expect(await decryptName(v2, nameEnc)).toBe("photo.jpg");
  });

  it("regenerating the recovery key disables the old one", async () => {
    const { metadata, recoveryKey } = await createVault("pass-phrase-1", FAST);
    const regen = await regenerateRecoveryKey(metadata, { type: "passphrase", value: "pass-phrase-1" });
    expect(regen.recoveryKey).not.toBe(recoveryKey);
    await expect(unlockWithRecoveryKey(regen.metadata, recoveryKey)).rejects.toMatchObject({ code: "WRONG_SECRET" });
    await expect(unlockWithRecoveryKey(regen.metadata, regen.recoveryKey)).resolves.toBeDefined();
  });

  it("changing the passphrase requires the current credential", async () => {
    const { metadata } = await createVault("the-real-one", FAST);
    await expect(
      changePassphrase(metadata, { type: "passphrase", value: "guess" }, "x-new-pass", FAST),
    ).rejects.toMatchObject({ code: "WRONG_SECRET" });
  });

  it("normalises Unicode passphrases (NFC vs NFD)", async () => {
    const nfc = "café-pass";
    const nfd = "café-pass";
    const { metadata } = await createVault(nfc, FAST);
    await expect(unlockWithPassphrase(metadata, nfd)).resolves.toBeDefined();
  });

  it("parseRecoveryKey is the inverse of formatRecoveryKey", () => {
    const raw = randomBytes(32);
    expect(Array.from(parseRecoveryKey(formatRecoveryKey(raw)))).toEqual(Array.from(raw));
  });
});

describe("names and dedupe hash", () => {
  it("encrypts names non-deterministically and decrypts them; other vaults cannot", async () => {
    const a = (await createVault("pass-a-long", FAST)).vault;
    const b = (await createVault("pass-b-long", FAST)).vault;
    const e1 = await encryptName(a, "résumé 📄.pdf");
    const e2 = await encryptName(a, "résumé 📄.pdf");
    expect(e1).not.toBe(e2);
    expect(await decryptName(a, e1)).toBe("résumé 📄.pdf");
    await expect(decryptName(b, e1)).rejects.toMatchObject({ code: "DECRYPT_FAILED" });
    expect(e1).not.toContain("pdf");
  });

  it("content HMAC is stable within a vault, differs across vaults and content", async () => {
    const a = (await createVault("pass-a-long", FAST)).vault;
    const b = (await createVault("pass-b-long", FAST)).vault;
    const blob = new Blob([utf8("same bytes")]);
    expect(await contentHmac(a, blob)).toBe(await contentHmac(a, new Blob([utf8("same bytes")])));
    expect(await contentHmac(a, blob)).not.toBe(await contentHmac(b, blob));
    expect(await contentHmac(a, blob)).not.toBe(await contentHmac(a, new Blob([utf8("other bytes")])));
  });
});

describe("chunk cipher", () => {
  const CHUNK = 1024;

  async function roundTrip(size: number) {
    const key = await generateFileKey();
    const plain = randomBytes(size);
    const enc = await encryptBlob(new Blob([plain]), key, { chunkBytes: CHUNK });
    expect(enc.size).toBe(encryptedSize(size, CHUNK));
    const dec = await decryptBlob(enc, key);
    expect(Buffer.from(await blobBytes(dec)).equals(Buffer.from(plain))).toBe(true);
  }

  it.each([0, 1, 15, 1023, 1024, 1025, 2048, 5000, 10 * 1024])("round-trips %i bytes", async (size) => {
    await roundTrip(size);
  });

  it("round-trips with the production chunk size across a chunk boundary", async () => {
    const key = await generateFileKey();
    const plain = randomBytes(DEFAULT_CHUNK_BYTES + 123);
    const enc = await encryptBlob(new Blob([plain]), key);
    expect(enc.size).toBe(encryptedSize(plain.length));
    const dec = await decryptBlob(enc, key);
    expect(Buffer.from(await blobBytes(dec)).equals(Buffer.from(plain))).toBe(true);
  });

  it("ciphertext does not contain the plaintext and differs per encryption", async () => {
    const key = await generateFileKey();
    const marker = "SUPER-SECRET-MARKER-12345";
    const blob = new Blob([utf8(marker.repeat(10))]);
    const e1 = await blobBytes(await encryptBlob(blob, key, { chunkBytes: CHUNK }));
    const e2 = await blobBytes(await encryptBlob(blob, key, { chunkBytes: CHUNK }));
    expect(Buffer.from(e1).includes(Buffer.from(marker))).toBe(false);
    expect(Buffer.from(e1).equals(Buffer.from(e2))).toBe(false);
  });

  it("fails with the wrong key", async () => {
    const enc = await encryptBlob(new Blob([randomBytes(3000)]), await generateFileKey(), { chunkBytes: CHUNK });
    await expect(decryptBlob(enc, await generateFileKey())).rejects.toMatchObject({ code: "DECRYPT_FAILED" });
  });

  it("detects a flipped bit in any region (header, first chunk, last chunk, tag)", async () => {
    const key = await generateFileKey();
    const enc = await blobBytes(await encryptBlob(new Blob([randomBytes(2500)]), key, { chunkBytes: CHUNK }));
    const positions = [5, 9, HEADER_BYTES + 3, 1030, enc.length - 20, enc.length - 1];
    for (const pos of positions) {
      const tampered = new Uint8Array(enc);
      tampered[pos] ^= 0x01;
      await expect(decryptBlob(new Blob([tampered]), key)).rejects.toBeInstanceOf(CryptoError);
    }
  });

  it("detects truncation (removing the final chunk) and appended data", async () => {
    const key = await generateFileKey();
    const enc = await blobBytes(await encryptBlob(new Blob([randomBytes(3 * CHUNK)]), key, { chunkBytes: CHUNK }));
    const stride = CHUNK + 16;
    const truncated = enc.slice(0, HEADER_BYTES + 2 * stride); // drops the last whole chunk
    await expect(decryptBlob(new Blob([truncated]), key)).rejects.toMatchObject({ code: "DECRYPT_FAILED" });
    const appended = new Uint8Array(enc.length + 40);
    appended.set(enc);
    await expect(decryptBlob(new Blob([appended]), key)).rejects.toBeInstanceOf(CryptoError);
  });

  it("detects reordered and duplicated chunks", async () => {
    const key = await generateFileKey();
    const enc = await blobBytes(await encryptBlob(new Blob([randomBytes(3 * CHUNK)]), key, { chunkBytes: CHUNK }));
    const stride = CHUNK + 16;
    const header = enc.slice(0, HEADER_BYTES);
    const c = (i: number) => enc.slice(HEADER_BYTES + i * stride, HEADER_BYTES + (i + 1) * stride);
    const swapped = new Blob([header, c(1), c(0), c(2)]);
    await expect(decryptBlob(swapped, key)).rejects.toBeInstanceOf(CryptoError);
    const duplicated = new Blob([header, c(0), c(0), c(2)]);
    await expect(decryptBlob(duplicated, key)).rejects.toBeInstanceOf(CryptoError);
  });

  it("detects chunks spliced between two different files encrypted with the same key", async () => {
    const key = await generateFileKey();
    const a = await blobBytes(await encryptBlob(new Blob([randomBytes(2 * CHUNK)]), key, { chunkBytes: CHUNK }));
    const b = await blobBytes(await encryptBlob(new Blob([randomBytes(2 * CHUNK)]), key, { chunkBytes: CHUNK }));
    const stride = CHUNK + 16;
    const spliced = new Blob([a.slice(0, HEADER_BYTES + stride), b.slice(HEADER_BYTES + stride)]);
    await expect(decryptBlob(spliced, key)).rejects.toBeInstanceOf(CryptoError);
  });

  it("rejects non-VaultSpace and too-small input", async () => {
    const key = await generateFileKey();
    await expect(decryptBlob(new Blob([randomBytes(200)]), key)).rejects.toMatchObject({ code: "BAD_FORMAT" });
    await expect(decryptBlob(new Blob([randomBytes(5)]), key)).rejects.toMatchObject({ code: "BAD_FORMAT" });
  });

  it("reports progress and returns the requested MIME type", async () => {
    const key = await generateFileKey();
    const seen: number[] = [];
    const enc = await encryptBlob(new Blob([randomBytes(2500)]), key, { chunkBytes: CHUNK, onProgress: (d) => seen.push(d) });
    expect(seen.at(-1)).toBe(2500);
    const dec = await decryptBlob(enc, key, { mimeType: "image/png" });
    expect(dec.type).toBe("image/png");
  });
});

describe("share keys", () => {
  it("a recipient with the link can decrypt name and file; wrong secret cannot", async () => {
    const { vault } = await createVault("sharer-passphrase", FAST);
    const fileKey = await generateFileKey();
    const plainBlob = new Blob([utf8("shared document body")]);
    const enc = await encryptBlob(plainBlob, fileKey);

    const secret = generateShareSecret();
    const wrap = await deriveShareWrapKey(secret);
    const wrappedForShare = await wrapFileKeyForShare(await unwrapFileKey(vault, await wrapFileKey(vault, fileKey), true), wrap);
    const nameEnc = await encryptShareName("contract.pdf", wrap);

    const url = buildShareUrl("https://app.example.com/", "TOKEN", secret);
    expect(url.startsWith("https://app.example.com/s/TOKEN#")).toBe(true);
    const parsed = parseShareFragment(new URL(url).hash)!;
    expect(parsed).not.toBeNull();

    const recipientWrap = await deriveShareWrapKey(parsed);
    expect(await decryptShareName(nameEnc, recipientWrap)).toBe("contract.pdf");
    const recipientKey = await unwrapFileKeyFromShare(wrappedForShare, recipientWrap);
    expect(new TextDecoder().decode(await blobBytes(await decryptBlob(enc, recipientKey)))).toBe("shared document body");

    const wrongWrap = await deriveShareWrapKey(generateShareSecret());
    await expect(unwrapFileKeyFromShare(wrappedForShare, wrongWrap)).rejects.toMatchObject({ code: "WRONG_SECRET" });
    await expect(decryptShareName(nameEnc, wrongWrap)).rejects.toMatchObject({ code: "WRONG_SECRET" });
  });

  it("the stored (server-visible) share record alone cannot decrypt anything", async () => {
    const fileKey = await generateFileKey();
    const secret = generateShareSecret();
    const wrap = await deriveShareWrapKey(secret);
    const stored = await wrapFileKeyForShare(fileKey, wrap);
    expect(stored).not.toContain(toB64Url(secret));
    // Server-side attacker guesses a different secret:
    await expect(unwrapFileKeyFromShare(stored, await deriveShareWrapKey(randomBytes(32)))).rejects.toBeInstanceOf(CryptoError);
  });

  it("password-protected shares need both the link secret and the password", async () => {
    const fileKey = await generateFileKey();
    const secret = generateShareSecret();
    const salt = generatePasswordSalt();
    const good = await derivePasswordMaterial("hunter2-long", salt, FAST);
    const wrap = await deriveShareWrapKey(secret, good.pwKey);
    const stored = await wrapFileKeyForShare(fileKey, wrap);

    // Right link + right password
    const again = await derivePasswordMaterial("hunter2-long", salt, FAST);
    expect(again.gateToken).toBe(good.gateToken);
    await expect(unwrapFileKeyFromShare(stored, await deriveShareWrapKey(secret, again.pwKey))).resolves.toBeDefined();

    // Right link, wrong password -> different key AND different gate token
    const bad = await derivePasswordMaterial("wrong-password", salt, FAST);
    expect(bad.gateToken).not.toBe(good.gateToken);
    await expect(unwrapFileKeyFromShare(stored, await deriveShareWrapKey(secret, bad.pwKey))).rejects.toBeInstanceOf(CryptoError);

    // Right password, link secret missing
    await expect(unwrapFileKeyFromShare(stored, await deriveShareWrapKey(generateShareSecret(), good.pwKey))).rejects.toBeInstanceOf(CryptoError);
  });

  it("gate token reveals neither the password nor the wrapping key material", async () => {
    const salt = generatePasswordSalt();
    const m = await derivePasswordMaterial("some password", salt, FAST);
    expect(m.gateToken).not.toContain("some password");
    expect(m.gateToken).not.toBe(toB64Url(m.pwKey));
  });

  it("parseShareFragment rejects missing, malformed and wrong-length fragments", () => {
    expect(parseShareFragment("")).toBeNull();
    expect(parseShareFragment("#")).toBeNull();
    expect(parseShareFragment("#!!!notbase64!!!")).toBeNull();
    expect(parseShareFragment("#" + toB64Url(randomBytes(16)))).toBeNull();
    expect(parseShareFragment("#" + toB64Url(randomBytes(32)))).not.toBeNull();
  });
});
