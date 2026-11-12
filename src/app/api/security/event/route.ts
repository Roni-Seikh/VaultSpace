import { z } from "zod";
import { authed, json, parseBody } from "@/lib/api/handler";
import { throwDb } from "@/lib/api/errors";
import { logActivity, logSecurityEvent } from "@/lib/api/audit";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { supabaseServer } from "@/lib/supabase/server";
import { clientIp, hashIp } from "@/lib/api/handler";
import { rateLimit } from "@/lib/api/rate-limit";

const schema = z.object({
  type: z.enum(["login", "logout", "password_changed", "mfa_enabled", "mfa_disabled", "unlock_failed", "sessions_revoked"]),
});

function deviceLabel(ua: string | null): string {
  if (!ua) return "Unknown device";
  const os = /Windows/i.test(ua) ? "Windows" : /Android/i.test(ua) ? "Android" : /iPhone|iPad/i.test(ua) ? "iOS" : /Mac OS/i.test(ua) ? "macOS" : /Linux/i.test(ua) ? "Linux" : "Unknown OS";
  const br = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "Browser";
  return `${br} on ${os}`;
}

/** The session id lives in the (already verified) access-token claims. */
function sessionIdFromToken(token: string | undefined): string | null {
  if (!token) return null;
  try {
    const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8"));
    return typeof payload.session_id === "string" ? payload.session_id : null;
  } catch {
    return null;
  }
}

/** Client-reported security-relevant events (login, logout, etc.). Never accepts secrets. */
export const POST = authed(async ({ userId, req }) => {
  const { type } = await parseBody(req, schema);
  const rl = rateLimit(`sec-event:${userId}`, 60, 60_000);
  if (!rl.ok) return json({ ok: true }); // silently drop floods
  const sb = supabaseAdmin();

  if (type === "login") {
    const server = await supabaseServer();
    const { data } = await server.auth.getSession();
    const sid = sessionIdFromToken(data.session?.access_token);
    if (sid) {
      const ua = req.headers.get("user-agent");
      const { error } = await sb.from("user_sessions").upsert(
        { user_id: userId, auth_session_id: sid, device_label: deviceLabel(ua), user_agent: ua?.slice(0, 400) ?? null, ip_hash: hashIp(clientIp(req)), last_seen_at: new Date().toISOString(), revoked_at: null },
        { onConflict: "user_id,auth_session_id" },
      );
      throwDb(error);
    }
    await logActivity(userId, "auth.login", req);
  } else if (type === "logout") {
    await logActivity(userId, "auth.logout", req);
  } else if (type === "password_changed") {
    await logActivity(userId, "auth.password_changed", req);
    await logSecurityEvent(userId, "password_changed", "info", req);
  } else if (type === "mfa_enabled") {
    await logActivity(userId, "auth.mfa_enabled", req);
    await logSecurityEvent(userId, "mfa_enabled", "info", req);
  } else if (type === "mfa_disabled") {
    await logActivity(userId, "auth.mfa_disabled", req);
    await logSecurityEvent(userId, "mfa_disabled", "warning", req);
  } else if (type === "unlock_failed") {
    await logSecurityEvent(userId, "vault.unlock_failed", "warning", req);
  } else if (type === "sessions_revoked") {
    const server = await supabaseServer();
    const { data } = await server.auth.getSession();
    const sid = sessionIdFromToken(data.session?.access_token);
    let q = sb.from("user_sessions").update({ revoked_at: new Date().toISOString() }).eq("user_id", userId).is("revoked_at", null);
    if (sid) q = q.neq("auth_session_id", sid);
    await q;
    await logSecurityEvent(userId, "sessions_revoked", "info", req);
  }
  return json({ ok: true });
});
