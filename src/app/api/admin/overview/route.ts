import { adminOnly, json } from "@/lib/api/handler";
import { throwDb } from "@/lib/api/errors";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { supabaseServer } from "@/lib/supabase/server";

export const GET = adminOnly(async () => {
  const { data, error } = await supabaseAdmin().rpc("admin_overview");
  throwDb(error);
  // System health: can the app reach the database (via the user's session) and R2 config exist?
  const sb = await supabaseServer();
  const t0 = Date.now();
  const ping = await sb.from("app_capacity").select("id").eq("id", 1).maybeSingle();
  const health = {
    database: ping.error ? "error" : "ok",
    databaseLatencyMs: Date.now() - t0,
    objectStorageConfigured: Boolean(process.env.R2_ACCOUNT_ID && process.env.R2_ACCESS_KEY_ID && process.env.R2_SECRET_ACCESS_KEY && process.env.R2_BUCKET_NAME),
    cronConfigured: Boolean(process.env.CRON_SECRET),
  };
  return json({ overview: data, health });
});
