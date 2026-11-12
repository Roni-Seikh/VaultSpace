import { authed, json } from "@/lib/api/handler";
import { throwDb } from "@/lib/api/errors";
import { logActivity } from "@/lib/api/audit";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { uuid, versionParamSchema } from "@/lib/validation/schemas";

export const POST = authed<{ id: string; version: string }>(async ({ userId, req }, { id, version }) => {
  uuid.parse(id);
  const v = versionParamSchema.parse(version);
  const { error } = await supabaseAdmin().rpc("restore_version", { p_user_id: userId, p_file_id: id, p_version: v });
  throwDb(error);
  await logActivity(userId, "file.version_restore", req, { targetType: "file", targetId: id, meta: { version: v } });
  return json({ ok: true });
});
