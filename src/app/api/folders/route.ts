import { authed, json, parseBody } from "@/lib/api/handler";
import { ApiError, throwDb } from "@/lib/api/errors";
import { logActivity } from "@/lib/api/audit";
import { supabaseServer } from "@/lib/supabase/server";
import { folderCreateSchema } from "@/lib/validation/schemas";

export const POST = authed(async ({ userId, req }) => {
  const b = await parseBody(req, folderCreateSchema);
  const sb = await supabaseServer();
  const { data, error } = await sb
    .from("folders").insert({ user_id: userId, parent_id: b.parentId ?? null, name_enc: b.nameEnc })
    .select("id,parent_id,name_enc,created_at").single();
  throwDb(error);
  if (!data) throw new ApiError(500, "DB_ERROR", "Could not create the folder.");
  await logActivity(userId, "folder.create", req, { targetType: "folder", targetId: data.id });
  return json({ folder: data }, { status: 201 });
});
