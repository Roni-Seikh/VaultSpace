import { authed, json, parseBody } from "@/lib/api/handler";
import { throwDb } from "@/lib/api/errors";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { deleteObjects } from "@/lib/r2/client";
import { uploadAbortSchema } from "@/lib/validation/schemas";

/** Release a reservation when an upload fails or is cancelled in the browser. */
export const POST = authed(async ({ userId, req }) => {
  const { versionId } = await parseBody(req, uploadAbortSchema);
  const { data, error } = await supabaseAdmin().rpc("cancel_upload", { p_user_id: userId, p_version_id: versionId });
  throwDb(error);
  if (typeof data === "string") await deleteObjects([data]);
  return json({ ok: true });
});
