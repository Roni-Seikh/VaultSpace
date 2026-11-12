// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import {
  addUser, asAnon, asService, asUser, createDb, NAME_ENC, uploadComplete, USER_A, USER_B, WRAPPED,
} from "./helpers";

let db: PGlite;
let fileA: string;
let fileB: string;
let folderA: string;
let folderB: string;

beforeAll(async () => {
  db = await createDb();
  await addUser(db, USER_A, "a@example.com");
  await addUser(db, USER_B, "b@example.com");
  const fa = await asService(db, () => uploadComplete(db, USER_A, 1000));
  const fb = await asService(db, () => uploadComplete(db, USER_B, 2000));
  fileA = fa.out_file_id;
  fileB = fb.out_file_id;
  folderA = (await db.query<{ id: string }>(
    "insert into public.folders (user_id, name_enc) values ($1, $2) returning id", [USER_A, NAME_ENC])).rows[0].id;
  folderB = (await db.query<{ id: string }>(
    "insert into public.folders (user_id, name_enc) values ($1, $2) returning id", [USER_B, NAME_ENC])).rows[0].id;
  await db.query(
    "insert into public.encryption_metadata (user_id, kdf_params, salt, wrapped_master_key_pass, wrapped_master_key_recovery) values ($1, '{}'::jsonb, $2, $3, $3)",
    [USER_B, "s".repeat(24), WRAPPED],
  );
  await db.query("insert into public.activity_logs (user_id, action) values ($1, 'test.b')", [USER_B]);
  await db.query("insert into public.security_events (user_id, type) values ($1, 'test.b')", [USER_B]);
});

afterAll(async () => {
  await db.close();
});

describe("signup trigger", () => {
  it("creates a profile with safe defaults and a usage row", async () => {
    const p = await db.query<{ role: string; quota_bytes: string }>(
      "select role, quota_bytes::text from public.profiles where id = $1", [USER_A]);
    expect(p.rows[0].role).toBe("user");
    expect(p.rows[0].quota_bytes).toBe("1073741824");
    const u = await db.query("select 1 from public.storage_usage where user_id = $1", [USER_A]);
    expect(u.rows).toHaveLength(1);
  });
});

describe("cross-user read isolation (RLS)", () => {
  const tables = ["files", "file_versions", "folders", "storage_usage", "activity_logs", "security_events", "encryption_metadata"];

  for (const t of tables) {
    it(`user A sees none of B's rows in ${t}`, async () => {
      const rows = await asUser(db, USER_A, async () => (await db.query(`select * from public.${t}`)).rows);
      for (const r of rows as Array<Record<string, unknown>>) {
        expect(r.user_id).toBe(USER_A);
      }
    });
  }

  it("user A sees exactly their own file and not B's", async () => {
    const ids = await asUser(db, USER_A, async () => (await db.query<{ id: string }>("select id from public.files")).rows.map((r) => r.id));
    expect(ids).toEqual([fileA]);
    expect(ids).not.toContain(fileB);
  });

  it("user A cannot see B's profile", async () => {
    const rows = await asUser(db, USER_A, async () => (await db.query("select id from public.profiles")).rows);
    expect(rows).toEqual([{ id: USER_A }]);
  });

  it("A cannot read B's wrapped vault keys", async () => {
    const rows = await asUser(db, USER_A, async () => (await db.query("select * from public.encryption_metadata")).rows);
    expect(rows).toHaveLength(0);
  });

  it("anonymous role cannot read any table", async () => {
    for (const t of ["profiles", "files", "shares", "storage_usage", "app_capacity", "encryption_metadata"]) {
      await expect(asAnon(db, () => db.query(`select * from public.${t}`))).rejects.toThrow(/permission denied/i);
    }
  });
});

describe("cross-user write protection", () => {
  it("A cannot rename B's file (0 rows updated)", async () => {
    const r = await asUser(db, USER_A, () => db.query("update public.files set name_enc = 'hacked' where id = $1", [fileB]));
    expect(r.affectedRows).toBe(0);
    const row = await db.query<{ name_enc: string }>("select name_enc from public.files where id = $1", [fileB]);
    expect(row.rows[0].name_enc).toBe(NAME_ENC);
  });

  it("A can rename their own file", async () => {
    const r = await asUser(db, USER_A, () => db.query("update public.files set name_enc = 'bmV3' where id = $1", [fileA]));
    expect(r.affectedRows).toBe(1);
  });

  it("A cannot move their file into B's folder", async () => {
    await expect(
      asUser(db, USER_A, () => db.query("update public.files set folder_id = $1 where id = $2", [folderB, fileA])),
    ).rejects.toThrow(/FOLDER_NOT_FOUND/);
  });

  it("A cannot create a folder under B's folder", async () => {
    await expect(
      asUser(db, USER_A, () => db.query("insert into public.folders (user_id, parent_id, name_enc) values ($1, $2, $3)", [USER_A, folderB, NAME_ENC])),
    ).rejects.toThrow(/PARENT_FOLDER_NOT_FOUND/);
  });

  it("A cannot create a folder as B (RLS with-check)", async () => {
    await expect(
      asUser(db, USER_A, () => db.query("insert into public.folders (user_id, name_enc) values ($1, $2)", [USER_B, NAME_ENC])),
    ).rejects.toThrow(/row-level security/i);
  });

  it("A cannot escalate to admin or raise their own quota", async () => {
    await expect(asUser(db, USER_A, () => db.query("update public.profiles set role = 'admin' where id = $1", [USER_A]))).rejects.toThrow(/permission denied/i);
    await expect(asUser(db, USER_A, () => db.query("update public.profiles set quota_bytes = 999999999999 where id = $1", [USER_A]))).rejects.toThrow(/permission denied/i);
    const p = await db.query<{ role: string }>("select role from public.profiles where id = $1", [USER_A]);
    expect(p.rows[0].role).toBe("user");
  });

  it("A may change harmless profile fields", async () => {
    const r = await asUser(db, USER_A, () => db.query("update public.profiles set display_name = 'Alice', theme = 'dark' where id = $1", [USER_A]));
    expect(r.affectedRows).toBe(1);
  });

  it("A cannot edit usage counters, capacity, versions or logs", async () => {
    await expect(asUser(db, USER_A, () => db.query("update public.storage_usage set used_bytes = 0 where user_id = $1", [USER_A]))).rejects.toThrow(/permission denied/i);
    await expect(asUser(db, USER_A, () => db.query("update public.app_capacity set max_bytes = 1e15"))).rejects.toThrow(/permission denied/i);
    await expect(asUser(db, USER_A, () => db.query("update public.file_versions set size_bytes = 1"))).rejects.toThrow(/permission denied/i);
    await expect(asUser(db, USER_A, () => db.query("delete from public.activity_logs"))).rejects.toThrow(/permission denied/i);
    await expect(asUser(db, USER_A, () => db.query("insert into public.activity_logs (user_id, action) values ($1, 'forged')", [USER_A]))).rejects.toThrow(/permission denied/i);
  });

  it("A cannot insert or delete file rows directly (quota bypass)", async () => {
    await expect(
      asUser(db, USER_A, () => db.query("insert into public.files (user_id, name_enc, mime_category, mime_type) values ($1, 'x', 'image', 'image/png')", [USER_A])),
    ).rejects.toThrow(/permission denied/i);
    await expect(asUser(db, USER_A, () => db.query("delete from public.files where id = $1", [fileA]))).rejects.toThrow(/permission denied/i);
  });

  it("users cannot call quota functions directly through the API role", async () => {
    await expect(
      asUser(db, USER_A, () => db.query("select * from public.begin_upload($1::uuid, null, null, 'x', 'image', 'image/png', 10, $2, null)", [USER_A, WRAPPED])),
    ).rejects.toThrow(/permission denied/i);
    await expect(asUser(db, USER_A, () => db.query("select public.delete_file($1::uuid, $2::uuid)", [USER_A, fileA]))).rejects.toThrow(/permission denied/i);
    await expect(asUser(db, USER_A, () => db.query("select public.admin_overview()"))).rejects.toThrow(/permission denied/i);
    await expect(asAnon(db, () => db.query("select public.admin_overview()"))).rejects.toThrow(/permission denied/i);
  });

  it("A cannot overwrite B's vault key material", async () => {
    const r = await asUser(db, USER_A, () => db.query("update public.encryption_metadata set salt = 'evilevilevilevilevil' where user_id = $1", [USER_B]));
    expect(r.affectedRows).toBe(0);
    await expect(
      asUser(db, USER_A, () => db.query(
        "insert into public.encryption_metadata (user_id, kdf_params, salt, wrapped_master_key_pass, wrapped_master_key_recovery) values ($1, '{}'::jsonb, $2, $3, $3)",
        [USER_B, "s".repeat(24), WRAPPED])),
    ).rejects.toThrow();
  });
});

describe("folder integrity", () => {
  it("rejects cycles", async () => {
    const parent = (await db.query<{ id: string }>("insert into public.folders (user_id, name_enc) values ($1, $2) returning id", [USER_A, NAME_ENC])).rows[0].id;
    const child = (await db.query<{ id: string }>("insert into public.folders (user_id, parent_id, name_enc) values ($1, $2, $3) returning id", [USER_A, parent, NAME_ENC])).rows[0].id;
    await expect(
      asUser(db, USER_A, () => db.query("update public.folders set parent_id = $1 where id = $2", [child, parent])),
    ).rejects.toThrow(/FOLDER_CYCLE/);
    await expect(
      asUser(db, USER_A, () => db.query("update public.folders set parent_id = id where id = $1", [parent])),
    ).rejects.toThrow();
  });

  it("A's folder is not visible to B", async () => {
    const rows = await asUser(db, USER_B, async () => (await db.query<{ id: string }>("select id from public.folders")).rows);
    expect(rows.map((r) => r.id)).not.toContain(folderA);
  });
});
