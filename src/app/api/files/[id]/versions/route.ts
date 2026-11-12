import { authed, json } from "@/lib/api/handler";
import { throwDb } from "@/lib/api/errors";
import { supabaseServer } from "@/lib/supabase/server";
import { uuid } from "@/lib/validation/schemas";

export const GET = authed<{ id: string }>(async ({ userId }, { id }) => {
  uuid.parse(id);
  const sb = await supabaseServer();
  const { data: file, error: fe } = await sb.from("files").select("current_version").eq("id", id).eq("user_id", userId).maybeSingle();
  throwDb(fe);
  const { data, error } = await sb
    .from("file_versions").select("version,size_bytes,created_at")
    .eq("file_id", id).eq("user_id", userId).eq("status", "active").order("version", { ascending: false });
  throwDb(error);
  return json({
    currentVersion: file?.current_version ?? null,
    versions: (data ?? []).map((v) => ({ version: v.version, sizeBytes: Number(v.size_bytes), createdAt: v.created_at })),
  });
});
