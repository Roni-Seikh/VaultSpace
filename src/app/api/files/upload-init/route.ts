import { authed, json, parseBody } from "@/lib/api/handler";
import { ApiError, throwDb } from "@/lib/api/errors";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { presignUpload, UPLOAD_URL_TTL_SECONDS } from "@/lib/r2/client";
import { categoryOfMime } from "@/lib/files/types";
import { uploadInitSchema } from "@/lib/validation/schemas";

/**
 * Step 1 of an upload: validate, atomically RESERVE quota, and return a short-lived signed upload URL.
 * The browser uploads the already-encrypted bytes straight to storage; they never pass through this server.
 */
export const POST = authed(async ({ userId, req }) => {
  const b = await parseBody(req, uploadInitSchema);
  if (categoryOfMime(b.mimeType) !== b.category) {
    throw new ApiError(400, "TYPE_MISMATCH", "File category does not match its type.");
  }
  const { data, error } = await supabaseAdmin().rpc("begin_upload", {
    p_user_id: userId,
    p_file_id: b.fileId ?? null,
    p_folder_id: b.folderId ?? null,
    p_name_enc: b.nameEnc,
    p_category: b.category,
    p_mime: b.mimeType,
    p_size: b.size,
    p_wrapped_key: b.wrappedKey,
    p_content_hmac: b.contentHmac ?? null,
  });
  throwDb(error);
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new ApiError(500, "DB_ERROR", "Could not start the upload.");

  let uploadUrl: string;
  try {
    uploadUrl = await presignUpload(row.out_r2_key);
  } catch (e) {
    await supabaseAdmin().rpc("cancel_upload", { p_user_id: userId, p_version_id: row.out_version_id });
    throw e;
  }
  return json({
    fileId: row.out_file_id,
    versionId: row.out_version_id,
    version: row.out_version,
    uploadUrl,
    expiresInSeconds: UPLOAD_URL_TTL_SECONDS,
  });
});
