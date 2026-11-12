import { authed, json } from "@/lib/api/handler";
import { ApiError, throwDb } from "@/lib/api/errors";
import { logActivity } from "@/lib/api/audit";
import { supabaseServer } from "@/lib/supabase/server";
import { presignDownload, DOWNLOAD_URL_TTL_SECONDS } from "@/lib/r2/client";
import { uuid, versionParamSchema } from "@/lib/validation/schemas";

type P = { id: string };

/**
 * Returns a 60-second presigned GET for the (encrypted) object plus the wrapped file key.
 * Ownership is enforced twice: the query is RLS-scoped to the caller and filtered by user_id.
 */
export const GET = authed<P>(async ({ userId, req }, { id }) => {
  uuid.parse(id);
  const v = req.nextUrl.searchParams.get("version");
  const version = v ? versionParamSchema.parse(v) : null;
  const sb = await supabaseServer();

  const { data: file, error: fe } = await sb
    .from("files").select("id,mime_type,current_version,status").eq("id", id).eq("user_id", userId).maybeSingle();
  throwDb(fe);
  if (!file || file.status !== "active") throw new ApiError(404, "FILE_NOT_FOUND", "File not found.");

  const { data: ver, error: ve } = await sb
    .from("file_versions")
    .select("version,r2_key,size_bytes,wrapped_file_key")
    .eq("file_id", id).eq("user_id", userId).eq("version", version ?? file.current_version).eq("status", "active")
    .maybeSingle();
  throwDb(ve);
  if (!ver) throw new ApiError(404, "VERSION_NOT_FOUND", "Version not found.");

  const url = await presignDownload(ver.r2_key);
  await logActivity(userId, "file.download", req, { targetType: "file", targetId: id, meta: { version: ver.version } });
  return json({
    url,
    expiresInSeconds: DOWNLOAD_URL_TTL_SECONDS,
    wrappedFileKey: ver.wrapped_file_key,
    mimeType: file.mime_type,
    size: Number(ver.size_bytes),
    version: ver.version,
  });
});

export type DownloadResponse = {
  url: string; expiresInSeconds: number; wrappedFileKey: string; mimeType: string; size: number; version: number;
};
