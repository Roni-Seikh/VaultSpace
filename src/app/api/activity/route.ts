import { authed, json } from "@/lib/api/handler";
import { throwDb } from "@/lib/api/errors";
import { supabaseServer } from "@/lib/supabase/server";
import { activityQuerySchema } from "@/lib/validation/schemas";

export const GET = authed(async ({ userId, req }) => {
  const q = activityQuerySchema.parse(Object.fromEntries(req.nextUrl.searchParams));
  const sb = await supabaseServer();
  let query = sb.from("activity_logs").select("id,action,target_type,target_id,meta,created_at").eq("user_id", userId);
  if (q.scope === "auth") query = query.like("action", "auth.%");
  if (q.scope === "sharing") query = query.like("action", "share.%");
  const { data, error } = await query.order("created_at", { ascending: false }).limit(q.limit);
  throwDb(error);
  return json({ activity: data });
});
