import { z } from "zod";
import { authed, json, parseBody } from "@/lib/api/handler";
import { ApiError, throwDb } from "@/lib/api/errors";
import { logActivity } from "@/lib/api/audit";
import { supabaseServer } from "@/lib/supabase/server";
import { vaultSchema } from "@/lib/validation/schemas";

function toRow(v: z.infer<typeof vaultSchema>) {
  return {
    kdf: v.kdf,
    kdf_params: v.kdfParams,
    salt: v.salt,
    wrapped_master_key_pass: v.wrappedMasterKeyPass,
    wrapped_master_key_recovery: v.wrappedMasterKeyRecovery,
    format_version: v.formatVersion,
  };
}

export const GET = authed(async ({ userId }) => {
  const sb = await supabaseServer();
  const { data, error } = await sb.from("encryption_metadata").select("*").eq("user_id", userId).maybeSingle();
  throwDb(error);
  if (!data) return json({ vault: null });
  return json({
    vault: {
      kdf: data.kdf,
      kdfParams: data.kdf_params,
      salt: data.salt,
      wrappedMasterKeyPass: data.wrapped_master_key_pass,
      wrappedMasterKeyRecovery: data.wrapped_master_key_recovery,
      formatVersion: data.format_version,
    },
  });
});

export const POST = authed(async ({ userId, req }) => {
  const body = await parseBody(req, vaultSchema);
  const sb = await supabaseServer();
  const { error } = await sb.from("encryption_metadata").insert({ user_id: userId, ...toRow(body) });
  if (error?.code === "23505") throw new ApiError(409, "VAULT_EXISTS", "A vault already exists for this account.");
  throwDb(error);
  await logActivity(userId, "vault.created", req);
  return json({ ok: true }, { status: 201 });
});

const updateSchema = z.object({
  vault: vaultSchema,
  reason: z.enum(["passphrase_changed", "recovery_regenerated"]),
});

export const PUT = authed(async ({ userId, req }) => {
  const { vault, reason } = await parseBody(req, updateSchema);
  const sb = await supabaseServer();
  const { data, error } = await sb.from("encryption_metadata").update(toRow(vault)).eq("user_id", userId).select("user_id");
  throwDb(error);
  if (!data?.length) throw new ApiError(404, "NO_VAULT", "No vault found.");
  await logActivity(userId, reason === "passphrase_changed" ? "vault.passphrase_changed" : "vault.recovery_regenerated", req);
  return json({ ok: true });
});
