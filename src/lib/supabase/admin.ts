import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { publicEnv, serverEnv } from "@/lib/env";

let admin: SupabaseClient | null = null;

/**
 * Service-role client. BYPASSES RLS: only use it in API routes, only after authenticating the
 * caller, and always filter by the authenticated user's id. Never import from client components.
 */
export function supabaseAdmin(): SupabaseClient {
  if (!admin) {
    admin = createClient(publicEnv().NEXT_PUBLIC_SUPABASE_URL, serverEnv().SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return admin;
}
