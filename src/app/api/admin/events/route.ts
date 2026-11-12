import { adminOnly, json } from "@/lib/api/handler";
import { throwDb } from "@/lib/api/errors";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const GET = adminOnly(async () => {
  const { data, error } = await supabaseAdmin()
    .from("security_events").select("id,user_id,type,severity,meta,created_at").order("created_at", { ascending: false }).limit(50);
  throwDb(error);
  return json({ events: data });
});
