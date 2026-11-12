import { NextResponse, type NextRequest } from "next/server";
import { createHash } from "node:crypto";
import { ZodError, type ZodType } from "zod";
import { ApiError } from "./errors";
import { rateLimit } from "./rate-limit";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export interface AuthedContext {
  userId: string;
  email: string;
  role: "user" | "admin";
  req: NextRequest;
}

export function json(data: unknown, init?: ResponseInit): NextResponse {
  return NextResponse.json(data, { ...init, headers: { "Cache-Control": "no-store", ...init?.headers } });
}

export function errorResponse(e: unknown): NextResponse {
  if (e instanceof ApiError) {
    return json({ error: { code: e.code, message: e.message } }, { status: e.status });
  }
  if (e instanceof ZodError) {
    return json(
      { error: { code: "VALIDATION", message: "Invalid request.", details: e.issues.map((i) => ({ path: i.path.join("."), message: i.message })) } },
      { status: 400 },
    );
  }
  console.error("[api]", e);
  return json({ error: { code: "INTERNAL", message: "Something went wrong. Please try again." } }, { status: 500 });
}

export function clientIp(req: NextRequest): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";
}

/** Hash IPs before storing them: useful for spotting patterns without keeping raw addresses. */
export function hashIp(ip: string): string {
  const salt = process.env.IP_HASH_SALT ?? "vaultspace-dev-salt";
  return createHash("sha256").update(`${salt}:${ip}`).digest("hex").slice(0, 32);
}

export async function parseBody<T>(req: NextRequest, schema: ZodType<T>): Promise<T> {
  const text = await req.text();
  if (text.length > 64 * 1024) throw new ApiError(413, "BODY_TOO_LARGE", "Request body is too large.");
  let raw: unknown;
  try {
    raw = text ? JSON.parse(text) : {};
  } catch {
    throw new ApiError(400, "BAD_JSON", "Request body must be valid JSON.");
  }
  return schema.parse(raw);
}

/** Same-origin check for state-changing requests (defence in depth on top of SameSite cookies). */
export function assertSameOrigin(req: NextRequest): void {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return;
  const origin = req.headers.get("origin");
  if (!origin) return; // non-browser clients; auth cookie/JWT still required
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (!host || new URL(origin).host !== host) throw new ApiError(403, "BAD_ORIGIN", "Cross-origin request blocked.");
}

/** Reads the `aal` claim from an access token that Supabase Auth has already validated. */
export function aalFromToken(token: string | undefined): string | null {
  if (!token) return null;
  try {
    const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8"));
    return typeof payload.aal === "string" ? payload.aal : null;
  } catch {
    return null;
  }
}

export async function requireUser(req: NextRequest): Promise<AuthedContext> {
  assertSameOrigin(req);
  const supabase = await supabaseServer();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new ApiError(401, "UNAUTHENTICATED", "Please sign in.");
  // If the account has two-factor authentication, the session must have completed it (aal2).
  const hasMfa = (data.user.factors ?? []).some((f) => f.status === "verified");
  if (hasMfa) {
    const { data: sess } = await supabase.auth.getSession();
    if (aalFromToken(sess.session?.access_token) !== "aal2") {
      throw new ApiError(401, "MFA_REQUIRED", "Two-factor verification required. Please sign in again.");
    }
  }
  const profile = await supabaseAdmin().from("profiles").select("role").eq("id", data.user.id).maybeSingle();
  if (profile.error || !profile.data) throw new ApiError(401, "UNAUTHENTICATED", "Account not found.");
  const ctx = { userId: data.user.id, email: data.user.email ?? "", role: profile.data.role as "user" | "admin", req };
  const rl = rateLimit(`u:${ctx.userId}`, 300, 60_000);
  if (!rl.ok) throw new ApiError(429, "RATE_LIMITED", `Too many requests. Try again in ${rl.retryAfter}s.`);
  return ctx;
}

export async function requireAdmin(req: NextRequest): Promise<AuthedContext> {
  const ctx = await requireUser(req);
  if (ctx.role !== "admin") throw new ApiError(403, "FORBIDDEN", "Administrator access required.");
  return ctx;
}

type Routed<P> = { params: Promise<P> };

/** Wrap an authenticated route handler. */
export function authed<P = Record<string, never>>(fn: (ctx: AuthedContext, params: P) => Promise<Response>) {
  return async (req: NextRequest, route: Routed<P>): Promise<Response> => {
    try {
      const ctx = await requireUser(req);
      return await fn(ctx, await route.params);
    } catch (e) {
      return errorResponse(e);
    }
  };
}

export function adminOnly<P = Record<string, never>>(fn: (ctx: AuthedContext, params: P) => Promise<Response>) {
  return async (req: NextRequest, route: Routed<P>): Promise<Response> => {
    try {
      const ctx = await requireAdmin(req);
      return await fn(ctx, await route.params);
    } catch (e) {
      return errorResponse(e);
    }
  };
}

/** Wrap a public (unauthenticated) route handler with an IP rate limit. */
export function publicRoute<P = Record<string, never>>(
  opts: { name: string; limit: number; windowMs: number },
  fn: (req: NextRequest, params: P) => Promise<Response>,
) {
  return async (req: NextRequest, route: Routed<P>): Promise<Response> => {
    try {
      assertSameOrigin(req);
      const rl = rateLimit(`${opts.name}:${clientIp(req)}`, opts.limit, opts.windowMs);
      if (!rl.ok) throw new ApiError(429, "RATE_LIMITED", `Too many requests. Try again in ${rl.retryAfter}s.`);
      return await fn(req, await route.params);
    } catch (e) {
      return errorResponse(e);
    }
  };
}
