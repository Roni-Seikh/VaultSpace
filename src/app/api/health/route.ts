import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

/** Public liveness check. Touches the database (keeps a free Supabase project awake) and reveals nothing else. */
export async function GET() {
  try {
    const { error } = await supabaseAdmin().from("app_capacity").select("id").eq("id", 1).maybeSingle();
    if (error) throw error;
    return NextResponse.json({ status: "ok" }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ status: "degraded" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
