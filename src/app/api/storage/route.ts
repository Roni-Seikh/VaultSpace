import { authed, json } from "@/lib/api/handler";
import { throwDb } from "@/lib/api/errors";
import { supabaseServer } from "@/lib/supabase/server";

export const GET = authed(async ({ userId }) => {
  const sb = await supabaseServer();
  const [profile, usage, cap] = await Promise.all([
    sb.from("profiles").select("quota_bytes").eq("id", userId).single(),
    sb.from("storage_usage").select("used_bytes,reserved_bytes,file_count").eq("user_id", userId).single(),
    sb.from("app_capacity").select("max_bytes,used_bytes,reserved_bytes,max_file_bytes").eq("id", 1).single(),
  ]);
  throwDb(profile.error); throwDb(usage.error); throwDb(cap.error);
  const quota = Number(profile.data?.quota_bytes ?? 0);
  const used = Number(usage.data?.used_bytes ?? 0);
  const reserved = Number(usage.data?.reserved_bytes ?? 0);
  const capUsed = Number(cap.data?.used_bytes ?? 0) + Number(cap.data?.reserved_bytes ?? 0);
  const capMax = Number(cap.data?.max_bytes ?? 0);
  return json({
    quotaBytes: quota,
    usedBytes: used,
    reservedBytes: reserved,
    remainingBytes: Math.max(0, quota - used - reserved),
    fileCount: usage.data?.file_count ?? 0,
    maxFileBytes: Number(cap.data?.max_file_bytes ?? 0),
    serviceFull: capUsed >= capMax,
  });
});
