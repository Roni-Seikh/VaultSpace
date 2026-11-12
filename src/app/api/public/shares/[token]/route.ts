import { json, publicRoute } from "@/lib/api/handler";
import { findActiveShare } from "@/lib/api/share-lookup";

/** Public metadata for the share landing page. Reveals nothing secret (no keys, no names). */
export const GET = publicRoute<{ token: string }>({ name: "share-meta", limit: 60, windowMs: 60_000 }, async (_req, { token }) => {
  const s = await findActiveShare(token);
  return json({
    requiresPassword: !!s.pw_salt,
    passwordSalt: s.pw_salt,
    canDownload: s.can_download,
    mimeType: s.mime_type,
    sizeBytes: Number(s.size_bytes),
    expiresAt: s.expires_at,
  });
});
