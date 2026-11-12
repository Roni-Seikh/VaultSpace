import { authed, json } from "@/lib/api/handler";
import { throwDb } from "@/lib/api/errors";
import { supabaseServer } from "@/lib/supabase/server";

/** Everything the UI needs to render the user's library. Names are still encrypted. */
export const GET = authed(async ({ userId }) => {
  const sb = await supabaseServer(); // RLS-scoped
  const [folders, files] = await Promise.all([
    sb.from("folders").select("id,parent_id,name_enc,created_at").eq("user_id", userId).order("created_at"),
    sb
      .from("files")
      .select("id,folder_id,name_enc,mime_category,mime_type,size_bytes,current_version,content_hmac,created_at,updated_at")
      .eq("user_id", userId)
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(5000),
  ]);
  throwDb(folders.error);
  throwDb(files.error);
  return json({ folders: folders.data, files: files.data });
});
