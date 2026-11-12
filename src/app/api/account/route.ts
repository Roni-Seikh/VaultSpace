import { authed, json, parseBody } from "@/lib/api/handler";
import { ApiError, throwDb } from "@/lib/api/errors";
import { logSecurityEvent } from "@/lib/api/audit";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { deleteObjects } from "@/lib/r2/client";
import { deleteAccountSchema } from "@/lib/validation/schemas";

/** Permanently delete the account: R2 objects first, then every database row (cascade). */
export const DELETE = authed(async ({ userId, role, req }) => {
  await parseBody(req, deleteAccountSchema);
  const sb = supabaseAdmin();
  if (role === "admin") {
    const { count } = await sb.from("profiles").select("id", { count: "exact", head: true }).eq("role", "admin");
    if ((count ?? 0) <= 1) throw new ApiError(409, "LAST_ADMIN", "You are the only administrator. Promote another admin first.");
  }
  const { data, error } = await sb.rpc("purge_user_storage", { p_user_id: userId });
  throwDb(error);
  const keys = (data as string[] | null) ?? [];
  const failed = keys.length ? await deleteObjects(keys) : [];
  if (failed.length) await logSecurityEvent(null, "storage.orphaned_objects", "warning", req, { count: failed.length, reason: "account_deleted" });
  const del = await sb.auth.admin.deleteUser(userId);
  if (del.error) throw new ApiError(500, "DELETE_FAILED", "Could not delete the account. Please contact support.");
  await logSecurityEvent(null, "account.deleted", "info", req, { objects: keys.length });
  return json({ ok: true });
});
