import { adminOnly, json } from "@/lib/api/handler";
import { throwDb } from "@/lib/api/errors";
import { supabaseAdmin } from "@/lib/supabase/admin";

/** Admins see account-level data only (email, role, quota, usage). Never file names or contents. */
export const GET = adminOnly(async ({ req }) => {
  const page = Math.max(0, Number(req.nextUrl.searchParams.get("page") ?? 0) || 0);
  const size = 25;
  const { data, error } = await supabaseAdmin()
    .from("profiles")
    .select("id,email,role,quota_bytes,created_at,storage_usage(used_bytes,file_count)")
    .order("created_at", { ascending: false })
    .range(page * size, page * size + size - 1);
  throwDb(error);
  return json({
    users: (data ?? []).map((u) => {
      const usage = Array.isArray(u.storage_usage) ? u.storage_usage[0] : u.storage_usage;
      return {
        id: u.id, email: u.email, role: u.role, quotaBytes: Number(u.quota_bytes), createdAt: u.created_at,
        usedBytes: Number(usage?.used_bytes ?? 0), fileCount: usage?.file_count ?? 0,
      };
    }),
    page,
  });
});
