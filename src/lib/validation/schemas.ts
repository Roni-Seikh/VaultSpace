/** Request schemas shared by API route handlers and the browser client (single source of truth). */
import { z } from "zod";
import { ALLOWED_MIMES, MIME_CATEGORIES } from "@/lib/files/types";

const B64_RE = /^[A-Za-z0-9+/]+={0,2}$/;
const B64URL_RE = /^[A-Za-z0-9_-]+$/;

export const uuid = z.string().uuid();
export const b64 = (min: number, max: number) =>
  z.string().min(min).max(max).regex(B64_RE, "must be base64");
export const b64url = (min: number, max: number) =>
  z.string().min(min).max(max).regex(B64URL_RE, "must be base64url");

/** Encrypted name blob (base64 of iv||ciphertext). */
export const nameEnc = b64(24, 2048);
/** Wrapped AES key blob (iv + 32-byte key + tag). */
export const wrappedKey = b64(40, 512);

export const mimeCategory = z.enum(MIME_CATEGORIES as [string, ...string[]]);
export const mimeType = z.string().refine((m) => ALLOWED_MIMES.has(m), "unsupported file type");

export const credentialsSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  password: z.string().min(1).max(256),
});

export const kdfParamsSchema = z.object({
  memoryKiB: z.number().int().min(19456).max(1048576), // at least 19 MiB (OWASP minimum), at most 1 GiB
  iterations: z.number().int().min(2).max(10),
  parallelism: z.number().int().min(1).max(4),
});

export const vaultSchema = z.object({
  kdf: z.literal("argon2id"),
  kdfParams: kdfParamsSchema,
  salt: b64(16, 128),
  wrappedMasterKeyPass: b64(40, 512),
  wrappedMasterKeyRecovery: b64(40, 512),
  formatVersion: z.literal(1),
});
export type VaultPayload = z.infer<typeof vaultSchema>;

export const uploadInitSchema = z.object({
  fileId: uuid.nullable().optional(), // set => upload a new version of this file
  folderId: uuid.nullable().optional(),
  nameEnc,
  category: mimeCategory,
  mimeType,
  size: z.number().int().positive().max(2 * 1024 * 1024 * 1024),
  wrappedKey,
  contentHmac: b64url(16, 128).nullable().optional(),
});

export const uploadCompleteSchema = z.object({ versionId: uuid });
export const uploadAbortSchema = z.object({ versionId: uuid });

export const fileUpdateSchema = z
  .object({ nameEnc: nameEnc.optional(), folderId: uuid.nullable().optional() })
  .refine((v) => v.nameEnc !== undefined || v.folderId !== undefined, "nothing to update");

export const fileCopySchema = z.object({ nameEnc, folderId: uuid.nullable().optional() });

export const folderCreateSchema = z.object({ nameEnc, parentId: uuid.nullable().optional() });
export const folderUpdateSchema = z
  .object({ nameEnc: nameEnc.optional(), parentId: uuid.nullable().optional() })
  .refine((v) => v.nameEnc !== undefined || v.parentId !== undefined, "nothing to update");

export const shareCreateSchema = z
  .object({
    fileId: uuid,
    expiresAt: z.string().datetime(),
    canDownload: z.boolean(),
    wrappedFileKey: wrappedKey,
    nameEnc,
    password: z
      .object({ salt: b64(16, 64), gateToken: b64url(32, 64) })
      .nullable()
      .optional(),
  })
  .strict();

export const shareTokenSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
export const shareAccessSchema = z.object({ gateToken: b64url(32, 64).optional() });

export const settingsSchema = z
  .object({
    displayName: z.string().trim().max(80).optional(),
    theme: z.enum(["system", "light", "dark"]).optional(),
    notifyStorage: z.boolean().optional(),
    notifySecurity: z.boolean().optional(),
    notifySharing: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, "nothing to update");

export const deleteAccountSchema = z.object({ confirm: z.literal("DELETE") });

export const versionParamSchema = z.coerce.number().int().min(1).max(100000);

export const activityQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(30),
  scope: z.enum(["all", "auth", "sharing"]).default("all"),
});
