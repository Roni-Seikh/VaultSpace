import { authed, json, parseBody } from "@/lib/api/handler";
import { ApiError, throwDb } from "@/lib/api/errors";
import { logActivity, logSecurityEvent } from "@/lib/api/audit";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { supabaseServer } from "@/lib/supabase/server";
import { deleteObjects } from "@/lib/r2/client";
import { folderUpdateSchema, uuid } from "@/lib/validation/schemas";

type P = { id: string };

export const PATCH = authed<P>(async ({ userId, req }, { id }) => {
  uuid.parse(id);
  const b = await parseBody(req, folderUpdateSchema);
  const patch: Record<string, unknown> = {};
  if (b.nameEnc !== undefined) patch.name_enc = b.nameEnc;
  if (b.parentId !== undefined) patch.parent_id = b.parentId;
  const sb = await supabaseServer();
  const { data, error } = await sb.from("folders").update(patch).eq("id", id).eq("user_id", userId).select("id");
  throwDb(error);
  if (!data?.length) throw new ApiError(404, "FOLDER_NOT_FOUND", "Folder not found.");
  await logActivity(userId, "folder.update", req, { targetType: "folder", targetId: id });
  return json({ ok: true });
});

export const DELETE = authed<P>(async ({ userId, req }, { id }) => {
  uuid.parse(id);
  const { data, error } = await supabaseAdmin().rpc("delete_folder", { p_user_id: userId, p_folder_id: id });
  throwDb(error);
  const keys = (data as string[] | null) ?? [];
  const failed = keys.length ? await deleteObjects(keys) : [];
  if (failed.length) await logSecurityEvent(userId, "storage.orphaned_objects", "warning", req, { count: failed.length });
  await logActivity(userId, "folder.delete", req, { targetType: "folder", targetId: id, meta: { files: keys.length } });
  return json({ ok: true });
});
