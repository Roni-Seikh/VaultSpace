import { authed, json } from "@/lib/api/handler";
import { throwDb } from "@/lib/api/errors";
import { supabaseServer } from "@/lib/supabase/server";

export const GET = authed(async ({ userId }) => {
  const sb = await supabaseServer();
  const [sessions, events, shares] = await Promise.all([
    sb.from("user_sessions").select("id,auth_session_id,device_label,created_at,last_seen_at,revoked_at")
      .eq("user_id", userId).is("revoked_at", null).order("last_seen_at", { ascending: false }).limit(20),
    sb.from("security_events").select("id,type,severity,meta,created_at").eq("user_id", userId).order("created_at", { ascending: false }).limit(30),
    sb.from("activity_logs").select("id,action,target_id,meta,created_at").eq("user_id", userId).like("action", "share.%").order("created_at", { ascending: false }).limit(20),
  ]);
  throwDb(sessions.error); throwDb(events.error); throwDb(shares.error);
  return json({ sessions: sessions.data, events: events.data, sharingActivity: shares.data });
});
