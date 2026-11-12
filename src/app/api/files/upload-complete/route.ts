import { authed, json, parseBody } from "@/lib/api/handler";
import { ApiError, throwDb } from "@/lib/api/errors";
import { logActivity } from "@/lib/api/audit";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { deleteObjects, headObjectSize } from "@/lib/r2/client";
import { uploadCompleteSchema } from "@/lib/validation/schemas";

/** Step 2: verify the object really exists in R2 with the reserved size, then commit the quota. */
export const POST = authed(async ({ userId, req }) => {
  const { versionId } = await parseBody(req, uploadCompleteSchema);
  const sb = supabaseAdmin();
  const { data: ver, error: verErr } = await sb
    .from("file_versions")
    .select("id,r2_key,size_bytes,status,file_id,version")
    .eq("id", versionId)
    .eq("user_id", userId) // ownership check
    .maybeSingle();
  throwDb(verErr);
  if (!ver || ver.status !== "pending") throw new ApiError(404, "UPLOAD_NOT_FOUND", "Upload not found or already completed.");

  const actual = await headObjectSize(ver.r2_key);
  if (actual === null) throw new ApiError(400, "UPLOAD_MISSING", "The file did not finish uploading. Please try again.");
  if (actual !== Number(ver.size_bytes)) {
    await sb.rpc("cancel_upload", { p_user_id: userId, p_version_id: versionId });
    await deleteObjects([ver.r2_key]);
    throw new ApiError(400, "SIZE_MISMATCH", "The uploaded file size did not match. The upload was discarded.");
  }
  const { data, error } = await sb.rpc("complete_upload", { p_user_id: userId, p_version_id: versionId, p_actual_size: actual });
  throwDb(error);
  const row = Array.isArray(data) ? data[0] : data;
  await logActivity(userId, "file.upload", req, {
    targetType: "file", targetId: ver.file_id, meta: { version: ver.version, size: actual },
  });
  return json({ fileId: row?.out_file_id ?? ver.file_id, version: row?.out_version ?? ver.version });
});
