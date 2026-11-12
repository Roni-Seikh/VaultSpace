import { authed, json, parseBody } from "@/lib/api/handler";
import { ApiError, throwDb } from "@/lib/api/errors";
import { logActivity } from "@/lib/api/audit";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { copyObject, deleteObjects, headObjectSize } from "@/lib/r2/client";
import { fileCopySchema, uuid } from "@/lib/validation/schemas";

type P = { id: string };

/** Server-side copy inside R2 (no download/re-upload). A copy consumes quota like any other file. */
export const POST = authed<P>(async ({ userId, req }, { id }) => {
  uuid.parse(id);
  const body = await parseBody(req, fileCopySchema);
  const sb = supabaseAdmin();
  const { data: file, error } = await sb
    .from("files").select("id,mime_category,mime_type,current_version,content_hmac,status")
    .eq("id", id).eq("user_id", userId).maybeSingle();
  throwDb(error);
  if (!file || file.status !== "active") throw new ApiError(404, "FILE_NOT_FOUND", "File not found.");
  const { data: ver, error: ve } = await sb
    .from("file_versions").select("r2_key,size_bytes,wrapped_file_key")
    .eq("file_id", id).eq("user_id", userId).eq("version", file.current_version).eq("status", "active").maybeSingle();
  throwDb(ve);
  if (!ver) throw new ApiError(404, "VERSION_NOT_FOUND", "File content not found.");

  const { data, error: be } = await sb.rpc("begin_upload", {
    p_user_id: userId, p_file_id: null, p_folder_id: body.folderId ?? null, p_name_enc: body.nameEnc,
    p_category: file.mime_category, p_mime: file.mime_type, p_size: Number(ver.size_bytes),
    p_wrapped_key: ver.wrapped_file_key, p_content_hmac: file.content_hmac,
  });
  throwDb(be);
  const row = Array.isArray(data) ? data[0] : data;
  try {
    await copyObject(ver.r2_key, row.out_r2_key);
    const size = await headObjectSize(row.out_r2_key);
    if (size !== Number(ver.size_bytes)) throw new ApiError(500, "COPY_FAILED", "Copy failed. Please try again.");
    const { error: ce } = await sb.rpc("complete_upload", { p_user_id: userId, p_version_id: row.out_version_id, p_actual_size: size });
    throwDb(ce);
  } catch (e) {
    await sb.rpc("cancel_upload", { p_user_id: userId, p_version_id: row.out_version_id });
    await deleteObjects([row.out_r2_key]);
    throw e;
  }
  await logActivity(userId, "file.copy", req, { targetType: "file", targetId: row.out_file_id, meta: { from: id } });
  return json({ fileId: row.out_file_id }, { status: 201 });
});
