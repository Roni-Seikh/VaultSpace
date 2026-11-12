import { authed, json, parseBody } from "@/lib/api/handler";
import { throwDb } from "@/lib/api/errors";
import { logActivity } from "@/lib/api/audit";
import { supabaseServer } from "@/lib/supabase/server";
import { settingsSchema } from "@/lib/validation/schemas";

const COLUMNS = "email,display_name,role,theme,notify_storage,notify_security,notify_sharing,created_at";

function shape(p: Record<string, unknown>) {
  return {
    email: p.email, displayName: p.display_name, role: p.role, theme: p.theme,
    notifyStorage: p.notify_storage, notifySecurity: p.notify_security, notifySharing: p.notify_sharing, createdAt: p.created_at,
  };
}

export const GET = authed(async ({ userId }) => {
  const sb = await supabaseServer();
  const { data, error } = await sb.from("profiles").select(COLUMNS).eq("id", userId).single();
  throwDb(error);
  return json({ profile: shape(data as Record<string, unknown>) });
});

/** Only harmless columns are writable by users (enforced again by column-level grants in the database). */
export const PATCH = authed(async ({ userId, req }) => {
  const b = await parseBody(req, settingsSchema);
  const patch: Record<string, unknown> = {};
  if (b.displayName !== undefined) patch.display_name = b.displayName;
  if (b.theme !== undefined) patch.theme = b.theme;
  if (b.notifyStorage !== undefined) patch.notify_storage = b.notifyStorage;
  if (b.notifySecurity !== undefined) patch.notify_security = b.notifySecurity;
  if (b.notifySharing !== undefined) patch.notify_sharing = b.notifySharing;
  const sb = await supabaseServer();
  const { data, error } = await sb.from("profiles").update(patch).eq("id", userId).select(COLUMNS).single();
  throwDb(error);
  await logActivity(userId, "settings.update", req, { meta: { fields: Object.keys(patch) } });
  return json({ profile: shape(data as Record<string, unknown>) });
});
