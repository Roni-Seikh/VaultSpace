import { json, parseBody, publicRoute, clientIp } from "@/lib/api/handler";
import { ApiError } from "@/lib/api/errors";
import { logActivity, logSecurityEvent } from "@/lib/api/audit";
import { rateLimit } from "@/lib/api/rate-limit";
import { findActiveShare, safeEqualHex, sha256Hex } from "@/lib/api/share-lookup";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { presignDownload } from "@/lib/r2/client";
import { shareAccessSchema } from "@/lib/validation/schemas";

/**
 * Returns the encrypted object URL + wrapped key + encrypted name. Without the link's #fragment secret
 * (never sent here) these are useless. For protected links a password "gate token" must match too.
 */
export const POST = publicRoute<{ token: string }>({ name: "share-access", limit: 30, windowMs: 60_000 }, async (req, { token }) => {
  const body = await parseBody(req, shareAccessSchema);
  const share = await findActiveShare(token);

  if (share.pw_gate_hash) {
    const key = `share-fail:${share.id}:${clientIp(req)}`;
    const attempt = rateLimit(key, 8, 15 * 60_000);
    if (!attempt.ok) throw new ApiError(429, "RATE_LIMITED", `Too many attempts. Try again in ${Math.ceil(attempt.retryAfter / 60)} minutes.`);
    if (!body.gateToken || !safeEqualHex(sha256Hex(body.gateToken), share.pw_gate_hash)) {
      await logSecurityEvent(share.owner_id, "share.bad_password", "warning", req, { shareId: share.id });
      throw new ApiError(401, "WRONG_PASSWORD", "Incorrect password.");
    }
  }

  const sb = supabaseAdmin();
  const { data: ver } = await sb.from("file_versions").select("r2_key").eq("id", share.version_id).eq("status", "active").maybeSingle();
  if (!ver) throw new ApiError(404, "SHARE_NOT_FOUND", "This link is invalid, expired or has been revoked.");

  const url = await presignDownload(ver.r2_key);
  await sb.rpc("record_share_access", { p_share_id: share.id });
  await logActivity(share.owner_id, "share.access", req, { targetType: "share", targetId: share.id });
  return json({
    url,
    wrappedFileKey: share.wrapped_file_key,
    nameEnc: share.name_enc,
    mimeType: share.mime_type,
    sizeBytes: Number(share.size_bytes),
    canDownload: share.can_download,
  });
});
