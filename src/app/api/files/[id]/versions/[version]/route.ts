import { authed, json } from "@/lib/api/handler";
import { throwDb } from "@/lib/api/errors";
import { logActivity } from "@/lib/api/audit";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { deleteObjects } from "@/lib/r2/client";
import { uuid, versionParamSchema } from "@/lib/validation/schemas";

export const DELETE = authed<{ id: string; version: string }>(async ({ userId, req }, { id, version }) => {
  uuid.parse(id);
  const v = versionParamSchema.parse(version);
  const { data, error } = await supabaseAdmin().rpc("delete_version", { p_user_id: userId, p_file_id: id, p_version: v });
  throwDb(error);
  if (typeof data === "string") await deleteObjects([data]);
  await logActivity(userId, "file.version_delete", req, { targetType: "file", targetId: id, meta: { version: v } });
  return json({ ok: true });
});
