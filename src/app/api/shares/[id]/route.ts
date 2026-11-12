import { authed, json } from "@/lib/api/handler";
import { ApiError, throwDb } from "@/lib/api/errors";
import { logActivity } from "@/lib/api/audit";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { uuid } from "@/lib/validation/schemas";

/** Revoke: access stops immediately because every public request re-checks revoked_at. */
export const DELETE = authed<{ id: string }>(async ({ userId, req }, { id }) => {
  uuid.parse(id);
  const { data, error } = await supabaseAdmin().rpc("revoke_share", { p_user_id: userId, p_share_id: id });
  throwDb(error);
  if (!data) throw new ApiError(404, "SHARE_NOT_FOUND", "Share not found or already revoked.");
  await logActivity(userId, "share.revoke", req, { targetType: "share", targetId: id });
  return json({ ok: true });
});
