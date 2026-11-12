import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { deleteObjects } from "@/lib/r2/client";

function authorised(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 16) return false;
  const given = req.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Called on a schedule (GitHub Actions; see docs/deployment.md):
 *   - abandons stale pending uploads and deletes their R2 objects
 *   - prunes logs older than 90 days (keeps the 500 MB database small)
 *   - the database round-trip doubles as the Supabase keep-alive
 */
async function run(req: NextRequest) {
  if (!authorised(req)) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  const sb = supabaseAdmin();
  const stale = await sb.rpc("cleanup_stale_uploads", { p_older_than: "1 hour" });
  if (stale.error) return NextResponse.json({ error: { code: "DB_ERROR", message: stale.error.message } }, { status: 500 });
  const keys = ((stale.data as { out_r2_key: string }[] | null) ?? []).map((r) => r.out_r2_key);
  const failed = keys.length ? await deleteObjects(keys) : [];
  const prune = await sb.rpc("prune_old_logs", { p_keep_days: 90 });
  return NextResponse.json({ ok: true, abandonedUploads: keys.length, failedObjectDeletes: failed.length, pruned: !prune.error });
}

export const GET = run;
export const POST = run;
