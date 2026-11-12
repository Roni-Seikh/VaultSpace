import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(__dirname, "../..");

export const USER_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
export const USER_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
export const WRAPPED = "x".repeat(60); // satisfies the wrapped-key length checks
export const NAME_ENC = "bmFtZQ==";

export async function createDb(): Promise<PGlite> {
  const db = new PGlite();
  await db.exec(fs.readFileSync(path.join(root, "tests/db/stub-supabase.sql"), "utf8"));
  const dir = path.join(root, "supabase/migrations");
  for (const f of fs.readdirSync(dir).filter((n) => n.endsWith(".sql")).sort()) {
    await db.exec(fs.readFileSync(path.join(dir, f), "utf8"));
  }
  return db;
}

export async function addUser(db: PGlite, id: string, email: string): Promise<void> {
  await db.query("insert into auth.users (id, email) values ($1, $2)", [id, email]);
}

/** Run fn with the session acting as a signed-in Supabase user (role authenticated). */
export async function asUser<T>(db: PGlite, uid: string, fn: () => Promise<T>): Promise<T> {
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${uid}', false);`);
  try {
    return await fn();
  } finally {
    await db.exec("reset role; select set_config('request.jwt.claim.sub', '', false);");
  }
}

export async function asAnon<T>(db: PGlite, fn: () => Promise<T>): Promise<T> {
  await db.exec("set role anon;");
  try {
    return await fn();
  } finally {
    await db.exec("reset role;");
  }
}

/** Run fn as the server's service role. */
export async function asService<T>(db: PGlite, fn: () => Promise<T>): Promise<T> {
  await db.exec("set role service_role;");
  try {
    return await fn();
  } finally {
    await db.exec("reset role;");
  }
}

export interface BeginResult {
  out_file_id: string;
  out_version_id: string;
  out_version: number;
  out_r2_key: string;
}

export async function beginUpload(
  db: PGlite,
  userId: string,
  size: number,
  opts: { fileId?: string | null; folderId?: string | null; category?: string; hmac?: string | null } = {},
): Promise<BeginResult> {
  const r = await db.query<BeginResult>(
    `select * from public.begin_upload($1::uuid, $2::uuid, $3::uuid, $4, $5, $6, $7::bigint, $8, $9)`,
    [
      userId,
      opts.fileId ?? null,
      opts.folderId ?? null,
      NAME_ENC,
      opts.category ?? "document",
      "application/pdf",
      size,
      WRAPPED,
      opts.hmac ?? null,
    ],
  );
  return r.rows[0];
}

export async function completeUpload(db: PGlite, userId: string, versionId: string, size: number) {
  return db.query(`select * from public.complete_upload($1::uuid, $2::uuid, $3::bigint)`, [userId, versionId, size]);
}

export async function usage(db: PGlite, userId: string) {
  const r = await db.query<{ used_bytes: string; reserved_bytes: string; file_count: number }>(
    "select used_bytes::text, reserved_bytes::text, file_count from public.storage_usage where user_id = $1",
    [userId],
  );
  return {
    used: Number(r.rows[0].used_bytes),
    reserved: Number(r.rows[0].reserved_bytes),
    files: r.rows[0].file_count,
  };
}

export async function capacity(db: PGlite) {
  const r = await db.query<{ used_bytes: string; reserved_bytes: string }>(
    "select used_bytes::text, reserved_bytes::text from public.app_capacity where id = 1",
  );
  return { used: Number(r.rows[0].used_bytes), reserved: Number(r.rows[0].reserved_bytes) };
}

export async function uploadComplete(db: PGlite, userId: string, size: number, opts: Parameters<typeof beginUpload>[3] = {}) {
  const b = await beginUpload(db, userId, size, opts);
  await completeUpload(db, userId, b.out_version_id, size);
  return b;
}
