import { createHash, timingSafeEqual } from "node:crypto";
import { ApiError } from "./errors";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { shareTokenSchema } from "@/lib/validation/schemas";

export const sha256Hex = (s: string) => createHash("sha256").update(s).digest("hex");

export function safeEqualHex(a: string, b: string): boolean {
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

export interface ActiveShare {
  id: string; owner_id: string; file_id: string; version_id: string; expires_at: string;
  can_download: boolean; pw_salt: string | null; pw_gate_hash: string | null;
  wrapped_file_key: string; name_enc: string; mime_type: string; size_bytes: number | string;
}

const NOT_FOUND = () => new ApiError(404, "SHARE_NOT_FOUND", "This link is invalid, expired or has been revoked.");

/** Same error for unknown / revoked / expired so attackers learn nothing about which it was. */
export async function findActiveShare(token: string): Promise<ActiveShare> {
  if (!shareTokenSchema.safeParse(token).success) throw NOT_FOUND();
  const { data, error } = await supabaseAdmin()
    .from("shares")
    .select("id,owner_id,file_id,version_id,expires_at,can_download,pw_salt,pw_gate_hash,wrapped_file_key,name_enc,mime_type,size_bytes,revoked_at")
    .eq("token_hash", sha256Hex(token))
    .maybeSingle();
  if (error) throw new ApiError(500, "DB_ERROR", "Something went wrong. Please try again.");
  if (!data || data.revoked_at || new Date(data.expires_at).getTime() <= Date.now()) throw NOT_FOUND();
  return data as ActiveShare;
}
