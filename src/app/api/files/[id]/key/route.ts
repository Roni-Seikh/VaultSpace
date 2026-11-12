import { authed, json } from "@/lib/api/handler";
import { ApiError, throwDb } from "@/lib/api/errors";
import { supabaseServer } from "@/lib/supabase/server";
import { uuid } from "@/lib/validation/schemas";

/** The wrapped (encrypted) per-file key of the current version, used when creating a share. */
export const GET = authed<{ id: string }>(async ({ userId }, { id }) => {
  uuid.parse(id);
  const sb = await supabaseServer();
  const { data: file, error } = await sb.from("files").select("current_version,status").eq("id", id).eq("user_id", userId).maybeSingle();
  throwDb(error);
  if (!file || file.status !== "active") throw new ApiError(404, "FILE_NOT_FOUND", "File not found.");
  const { data: ver, error: ve } = await sb.from("file_versions").select("wrapped_file_key,version")
    .eq("file_id", id).eq("user_id", userId).eq("version", file.current_version).eq("status", "active").maybeSingle();
  throwDb(ve);
  if (!ver) throw new ApiError(404, "VERSION_NOT_FOUND", "File content not found.");
  return json({ wrappedFileKey: ver.wrapped_file_key, version: ver.version });
});
