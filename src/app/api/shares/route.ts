import { randomBytes } from "node:crypto";
import { sha256Hex } from "@/lib/api/share-lookup";
import { authed, json, parseBody } from "@/lib/api/handler";
import { throwDb } from "@/lib/api/errors";
import { logActivity } from "@/lib/api/audit";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { supabaseServer } from "@/lib/supabase/server";
import { shareCreateSchema } from "@/lib/validation/schemas";


export const GET = authed(async ({ userId }) => {
  const sb = await supabaseServer();
  const { data, error } = await sb
    .from("shares")
    .select("id,file_id,expires_at,can_download,pw_salt,revoked_at,access_count,last_accessed_at,created_at,size_bytes,mime_type")
    .eq("owner_id", userId)
    .order("created_at", { ascending: false })
    .limit(200);
  throwDb(error);
  return json({
    shares: (data ?? []).map((s) => ({
      id: s.id, fileId: s.file_id, expiresAt: s.expires_at, canDownload: s.can_download,
      passwordProtected: !!s.pw_salt, revokedAt: s.revoked_at, accessCount: s.access_count,
      lastAccessedAt: s.last_accessed_at, createdAt: s.created_at, sizeBytes: Number(s.size_bytes), mimeType: s.mime_type,
    })),
  });
});

/**
 * The browser has already wrapped the file key under a key derived from the link secret (which stays
 * in the URL fragment). We generate the public token, store only its hash, and return the token once.
 */
export const POST = authed(async ({ userId, req }) => {
  const b = await parseBody(req, shareCreateSchema);
  const token = randomBytes(32).toString("base64url"); // 43 chars, 256 bits
  const { data, error } = await supabaseAdmin().rpc("create_share", {
    p_user_id: userId,
    p_file_id: b.fileId,
    p_token_hash: sha256Hex(token),
    p_expires_at: b.expiresAt,
    p_can_download: b.canDownload,
    p_pw_salt: b.password?.salt ?? null,
    p_pw_gate_hash: b.password ? sha256Hex(b.password.gateToken) : null,
    p_wrapped_file_key: b.wrappedFileKey,
    p_name_enc: b.nameEnc,
  });
  throwDb(error);
  await logActivity(userId, "share.create", req, {
    targetType: "share", targetId: data as string,
    meta: { fileId: b.fileId, passwordProtected: !!b.password, canDownload: b.canDownload, expiresAt: b.expiresAt },
  });
  return json({ id: data, token }, { status: 201 });
});
