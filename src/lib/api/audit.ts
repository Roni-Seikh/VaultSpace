import type { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { clientIp, hashIp } from "./handler";

export type ActivityAction =
  | "auth.login" | "auth.logout" | "auth.password_changed" | "auth.mfa_enabled" | "auth.mfa_disabled"
  | "vault.created" | "vault.passphrase_changed" | "vault.recovery_regenerated" | "vault.unlock_failed"
  | "file.upload" | "file.download" | "file.delete" | "file.rename" | "file.move" | "file.copy"
  | "file.version_restore" | "file.version_delete"
  | "folder.create" | "folder.delete" | "folder.update"
  | "share.create" | "share.revoke" | "share.access"
  | "settings.update" | "account.delete";

/** Never put passwords, keys or file contents in `meta`. Only ids, sizes, categories. */
export async function logActivity(
  userId: string,
  action: ActivityAction,
  req: NextRequest | null,
  extra: { targetType?: string; targetId?: string; meta?: Record<string, unknown> } = {},
): Promise<void> {
  try {
    await supabaseAdmin().from("activity_logs").insert({
      user_id: userId,
      action,
      target_type: extra.targetType ?? null,
      target_id: extra.targetId ?? null,
      meta: extra.meta ?? {},
      ip_hash: req ? hashIp(clientIp(req)) : null,
    });
  } catch (e) {
    console.error("[audit] failed to write activity log", e);
  }
}

export async function logSecurityEvent(
  userId: string | null,
  type: string,
  severity: "info" | "warning" | "critical",
  req: NextRequest | null,
  meta: Record<string, unknown> = {},
): Promise<void> {
  try {
    await supabaseAdmin().from("security_events").insert({
      user_id: userId,
      type,
      severity,
      meta,
      ip_hash: req ? hashIp(clientIp(req)) : null,
    });
  } catch (e) {
    console.error("[audit] failed to write security event", e);
  }
}
