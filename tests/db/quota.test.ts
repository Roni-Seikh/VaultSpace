// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import {
  addUser, asService, beginUpload, capacity, completeUpload, createDb, NAME_ENC, uploadComplete, usage,
  USER_A, USER_B,
} from "./helpers";

let db: PGlite;

beforeAll(async () => {
  db = await createDb();
  await addUser(db, USER_A, "a@example.com");
  await addUser(db, USER_B, "b@example.com");
});

afterAll(async () => {
  await db.close();
});

/** Reset to a clean slate with small limits so tests stay readable. */
beforeEach(async () => {
  await db.exec("delete from public.shares; delete from public.file_versions; delete from public.files; delete from public.folders;");
  await db.exec("update public.storage_usage set used_bytes = 0, reserved_bytes = 0, file_count = 0;");
  await db.exec("update public.app_capacity set used_bytes = 0, reserved_bytes = 0, max_bytes = 1000000, max_file_bytes = 5000;");
  await db.exec("update public.profiles set quota_bytes = 10000;");
});

const svc = <T,>(fn: () => Promise<T>) => asService(db, fn);

describe("upload reservation and completion", () => {
  it("reserves on begin, moves to used on complete, and counts the file once", async () => {
    const b = await svc(() => beginUpload(db, USER_A, 3000));
    expect(await usage(db, USER_A)).toEqual({ used: 0, reserved: 3000, files: 0 });
    expect(b.out_version).toBe(1);
    expect(b.out_r2_key).toContain(`u/${USER_A}/${b.out_file_id}/v1-`);

    await svc(() => completeUpload(db, USER_A, b.out_version_id, 3000));
    expect(await usage(db, USER_A)).toEqual({ used: 3000, reserved: 0, files: 1 });
    expect(await capacity(db)).toEqual({ used: 3000, reserved: 0 });
  });

  it("rejects a completion whose real size differs from the reservation", async () => {
    const b = await svc(() => beginUpload(db, USER_A, 3000));
    await expect(svc(() => completeUpload(db, USER_A, b.out_version_id, 2999))).rejects.toThrow(/SIZE_MISMATCH/);
    expect(await usage(db, USER_A)).toEqual({ used: 0, reserved: 3000, files: 0 });
  });

  it("another user cannot complete or cancel my upload", async () => {
    const b = await svc(() => beginUpload(db, USER_A, 1000));
    await expect(svc(() => completeUpload(db, USER_B, b.out_version_id, 1000))).rejects.toThrow(/UPLOAD_NOT_FOUND/);
    const cancelled = await svc(() => db.query("select public.cancel_upload($1::uuid, $2::uuid) as k", [USER_B, b.out_version_id]));
    expect((cancelled.rows[0] as { k: string | null }).k).toBeNull();
    expect(await usage(db, USER_A)).toEqual({ used: 0, reserved: 1000, files: 0 });
  });

  it("cannot complete the same upload twice", async () => {
    const b = await svc(() => beginUpload(db, USER_A, 1000));
    await svc(() => completeUpload(db, USER_A, b.out_version_id, 1000));
    await expect(svc(() => completeUpload(db, USER_A, b.out_version_id, 1000))).rejects.toThrow(/UPLOAD_NOT_FOUND/);
    expect(await usage(db, USER_A)).toEqual({ used: 1000, reserved: 0, files: 1 });
  });

  it("cancel releases the reservation and removes the orphan file row", async () => {
    const b = await svc(() => beginUpload(db, USER_A, 4000));
    const r = await svc(() => db.query("select public.cancel_upload($1::uuid, $2::uuid) as k", [USER_A, b.out_version_id]));
    expect((r.rows[0] as { k: string }).k).toBe(b.out_r2_key);
    expect(await usage(db, USER_A)).toEqual({ used: 0, reserved: 0, files: 0 });
    expect((await db.query("select 1 from public.files")).rows).toHaveLength(0);
  });
});

describe("per-user quota", () => {
  it("blocks the upload that would exceed the quota", async () => {
    await svc(() => uploadComplete(db, USER_A, 4000));
    await svc(() => uploadComplete(db, USER_A, 4000));
    await expect(svc(() => beginUpload(db, USER_A, 2001))).rejects.toThrow(/QUOTA_EXCEEDED/);
    await expect(svc(() => beginUpload(db, USER_A, 2000))).resolves.toBeDefined(); // exactly fits
  });

  it("counts in-flight reservations against the quota", async () => {
    await svc(() => beginUpload(db, USER_A, 5000));
    await svc(() => beginUpload(db, USER_A, 5000));
    await expect(svc(() => beginUpload(db, USER_A, 1))).rejects.toThrow(/QUOTA_EXCEEDED/);
  });

  it("quota is per user: B is unaffected by A being full", async () => {
    await svc(() => beginUpload(db, USER_A, 5000));
    await svc(() => beginUpload(db, USER_A, 5000));
    await expect(svc(() => beginUpload(db, USER_B, 5000))).resolves.toBeDefined();
  });

  it("deleting a file frees quota so uploading works again", async () => {
    const a = await svc(() => uploadComplete(db, USER_A, 5000));
    await svc(() => uploadComplete(db, USER_A, 5000));
    await expect(svc(() => beginUpload(db, USER_A, 1))).rejects.toThrow(/QUOTA_EXCEEDED/);
    const keys = await svc(() => db.query("select public.delete_file($1::uuid, $2::uuid) as k", [USER_A, a.out_file_id]));
    expect((keys.rows[0] as { k: string[] }).k).toEqual([a.out_r2_key]);
    expect(await usage(db, USER_A)).toEqual({ used: 5000, reserved: 0, files: 1 });
    await expect(svc(() => beginUpload(db, USER_A, 5000))).resolves.toBeDefined();
  });

  it("A cannot delete B's file", async () => {
    const b = await svc(() => uploadComplete(db, USER_B, 1000));
    await expect(svc(() => db.query("select public.delete_file($1::uuid, $2::uuid)", [USER_A, b.out_file_id]))).rejects.toThrow(/FILE_NOT_FOUND/);
    expect(await usage(db, USER_B)).toEqual({ used: 1000, reserved: 0, files: 1 });
  });
});

describe("size limits", () => {
  it("rejects files above max_file_bytes and invalid sizes", async () => {
    await expect(svc(() => beginUpload(db, USER_A, 5001))).rejects.toThrow(/FILE_TOO_LARGE/);
    await expect(svc(() => beginUpload(db, USER_A, 0))).rejects.toThrow(/INVALID_SIZE/);
    await expect(svc(() => beginUpload(db, USER_A, -5))).rejects.toThrow(/INVALID_SIZE/);
  });
});

describe("global capacity", () => {
  it("stops all uploads when the app-wide cap is reached, even for users with quota left", async () => {
    await db.exec("update public.app_capacity set max_bytes = 6000;");
    await svc(() => uploadComplete(db, USER_A, 4000));
    await expect(svc(() => beginUpload(db, USER_B, 2001))).rejects.toThrow(/GLOBAL_CAP_REACHED/);
    await expect(svc(() => beginUpload(db, USER_B, 2000))).resolves.toBeDefined();
  });

  it("deletes give capacity back", async () => {
    await db.exec("update public.app_capacity set max_bytes = 5000;");
    const a = await svc(() => uploadComplete(db, USER_A, 5000));
    await expect(svc(() => beginUpload(db, USER_B, 1))).rejects.toThrow(/GLOBAL_CAP_REACHED/);
    await svc(() => db.query("select public.delete_file($1::uuid, $2::uuid)", [USER_A, a.out_file_id]));
    await expect(svc(() => beginUpload(db, USER_B, 5000))).resolves.toBeDefined();
  });
});

describe("versions", () => {
  it("new versions count toward quota; deleting an old version frees it; the current one is protected", async () => {
    const v1 = await svc(() => uploadComplete(db, USER_A, 3000));
    const v2 = await svc(() => uploadComplete(db, USER_A, 2000, { fileId: v1.out_file_id }));
    expect(v2.out_version).toBe(2);
    expect(await usage(db, USER_A)).toEqual({ used: 5000, reserved: 0, files: 1 });

    const f = await db.query<{ current_version: number; size_bytes: string }>("select current_version, size_bytes::text from public.files where id = $1", [v1.out_file_id]);
    expect(f.rows[0]).toEqual({ current_version: 2, size_bytes: "2000" });

    await expect(svc(() => db.query("select public.delete_version($1::uuid, $2::uuid, 2)", [USER_A, v1.out_file_id]))).rejects.toThrow(/CANNOT_DELETE_CURRENT/);

    await svc(() => db.query("select public.restore_version($1::uuid, $2::uuid, 1)", [USER_A, v1.out_file_id]));
    expect(await usage(db, USER_A)).toEqual({ used: 5000, reserved: 0, files: 1 }); // restore is free
    const after = await db.query<{ current_version: number; size_bytes: string }>("select current_version, size_bytes::text from public.files where id = $1", [v1.out_file_id]);
    expect(after.rows[0]).toEqual({ current_version: 1, size_bytes: "3000" });

    const del = await svc(() => db.query("select public.delete_version($1::uuid, $2::uuid, 2) as k", [USER_A, v1.out_file_id]));
    expect((del.rows[0] as { k: string }).k).toBe(v2.out_r2_key);
    expect(await usage(db, USER_A)).toEqual({ used: 3000, reserved: 0, files: 1 });
  });

  it("a new version is blocked by the quota", async () => {
    const v1 = await svc(() => uploadComplete(db, USER_A, 5000));
    await svc(() => uploadComplete(db, USER_A, 4000));
    await expect(svc(() => beginUpload(db, USER_A, 2000, { fileId: v1.out_file_id }))).rejects.toThrow(/QUOTA_EXCEEDED/);
  });

  it("cannot add a version to someone else's file or change its category", async () => {
    const b = await svc(() => uploadComplete(db, USER_B, 1000));
    await expect(svc(() => beginUpload(db, USER_A, 100, { fileId: b.out_file_id }))).rejects.toThrow(/FILE_NOT_FOUND/);
    const a = await svc(() => uploadComplete(db, USER_A, 1000, { category: "document" }));
    await expect(svc(() => beginUpload(db, USER_A, 100, { fileId: a.out_file_id, category: "image" }))).rejects.toThrow(/TYPE_MISMATCH/);
  });

  it("deleting a file deletes all versions and frees all of them", async () => {
    const v1 = await svc(() => uploadComplete(db, USER_A, 1000));
    await svc(() => uploadComplete(db, USER_A, 1500, { fileId: v1.out_file_id }));
    const r = await svc(() => db.query("select public.delete_file($1::uuid, $2::uuid) as k", [USER_A, v1.out_file_id]));
    expect((r.rows[0] as { k: string[] }).k).toHaveLength(2);
    expect(await usage(db, USER_A)).toEqual({ used: 0, reserved: 0, files: 0 });
  });
});

describe("folders", () => {
  it("deleting a folder removes the subtree, returns every key and frees quota", async () => {
    const root = (await db.query<{ id: string }>("insert into public.folders (user_id, name_enc) values ($1, $2) returning id", [USER_A, NAME_ENC])).rows[0].id;
    const sub = (await db.query<{ id: string }>("insert into public.folders (user_id, parent_id, name_enc) values ($1, $2, $3) returning id", [USER_A, root, NAME_ENC])).rows[0].id;
    const f1 = await svc(() => uploadComplete(db, USER_A, 1000, { folderId: root }));
    const f2 = await svc(() => uploadComplete(db, USER_A, 2000, { folderId: sub }));
    await svc(() => uploadComplete(db, USER_A, 500)); // outside the folder, must survive
    const r = await svc(() => db.query("select public.delete_folder($1::uuid, $2::uuid) as k", [USER_A, root]));
    expect((r.rows[0] as { k: string[] }).k.sort()).toEqual([f1.out_r2_key, f2.out_r2_key].sort());
    expect(await usage(db, USER_A)).toEqual({ used: 500, reserved: 0, files: 1 });
    expect((await db.query("select 1 from public.files")).rows).toHaveLength(1);
  });

  it("cannot upload into another user's folder, or delete it", async () => {
    const folderB = (await db.query<{ id: string }>("insert into public.folders (user_id, name_enc) values ($1, $2) returning id", [USER_B, NAME_ENC])).rows[0].id;
    await expect(svc(() => beginUpload(db, USER_A, 100, { folderId: folderB }))).rejects.toThrow(/FOLDER_NOT_FOUND/);
    await expect(svc(() => db.query("select public.delete_folder($1::uuid, $2::uuid)", [USER_A, folderB]))).rejects.toThrow(/FOLDER_NOT_FOUND/);
  });
});

describe("maintenance", () => {
  it("cleanup_stale_uploads abandons only old pending uploads", async () => {
    const stale = await svc(() => beginUpload(db, USER_A, 1000));
    const fresh = await svc(() => beginUpload(db, USER_A, 2000));
    await db.query("update public.file_versions set created_at = now() - interval '2 hours' where id = $1", [stale.out_version_id]);
    const r = await svc(() => db.query<{ out_r2_key: string }>("select * from public.cleanup_stale_uploads(interval '1 hour')"));
    expect(r.rows.map((x) => x.out_r2_key)).toEqual([stale.out_r2_key]);
    expect(await usage(db, USER_A)).toEqual({ used: 0, reserved: 2000, files: 0 });
    expect((await db.query("select 1 from public.file_versions where id = $1", [fresh.out_version_id])).rows).toHaveLength(1);
  });

  it("recompute_usage repairs drifted counters", async () => {
    await svc(() => uploadComplete(db, USER_A, 3000));
    await svc(() => beginUpload(db, USER_B, 1000));
    await db.exec("update public.storage_usage set used_bytes = 999999, reserved_bytes = 5, file_count = 42;");
    await db.exec("update public.app_capacity set used_bytes = 7, reserved_bytes = 7;");
    await svc(() => db.query("select public.recompute_usage(null)"));
    expect(await usage(db, USER_A)).toEqual({ used: 3000, reserved: 0, files: 1 });
    expect(await usage(db, USER_B)).toEqual({ used: 0, reserved: 1000, files: 0 });
    expect(await capacity(db)).toEqual({ used: 3000, reserved: 1000 });
  });

  it("purge_user_storage returns all keys and fixes global capacity", async () => {
    const a1 = await svc(() => uploadComplete(db, USER_A, 1000));
    const a2 = await svc(() => beginUpload(db, USER_A, 500));
    await svc(() => uploadComplete(db, USER_B, 2000));
    const r = await svc(() => db.query("select public.purge_user_storage($1::uuid) as k", [USER_A]));
    expect((r.rows[0] as { k: string[] }).k.sort()).toEqual([a1.out_r2_key, a2.out_r2_key].sort());
    expect(await usage(db, USER_A)).toEqual({ used: 0, reserved: 0, files: 0 });
    expect(await capacity(db)).toEqual({ used: 2000, reserved: 0 });
  });

  it("prune_old_logs deletes only old rows", async () => {
    await db.query("insert into public.activity_logs (user_id, action, created_at) values ($1, 'old', now() - interval '200 days'), ($1, 'new', now())", [USER_A]);
    await svc(() => db.query("select public.prune_old_logs(90)"));
    const r = await db.query<{ action: string }>("select action from public.activity_logs where user_id = $1", [USER_A]);
    expect(r.rows.map((x) => x.action)).toEqual(["new"]);
  });
});

describe("sharing", () => {
  const hash = "h".repeat(64);
  const wrapped = "w".repeat(60);

  it("creates a share pinned to the current version and revokes only for the owner", async () => {
    const f = await svc(() => uploadComplete(db, USER_A, 1000));
    const id = (await svc(() => db.query<{ s: string }>(
      "select public.create_share($1::uuid, $2::uuid, $3, now() + interval '1 day', true, null, null, $4, $5) as s",
      [USER_A, f.out_file_id, hash, wrapped, NAME_ENC]))).rows[0].s;
    expect(id).toBeTruthy();

    const notMine = await svc(() => db.query<{ r: boolean }>("select public.revoke_share($1::uuid, $2::uuid) as r", [USER_B, id]));
    expect(notMine.rows[0].r).toBe(false);
    const mine = await svc(() => db.query<{ r: boolean }>("select public.revoke_share($1::uuid, $2::uuid) as r", [USER_A, id]));
    expect(mine.rows[0].r).toBe(true);
  });

  it("refuses to share someone else's file and bad expiry dates", async () => {
    const f = await svc(() => uploadComplete(db, USER_B, 1000));
    await expect(svc(() => db.query(
      "select public.create_share($1::uuid, $2::uuid, $3, now() + interval '1 day', true, null, null, $4, $5)",
      [USER_A, f.out_file_id, hash, wrapped, NAME_ENC]))).rejects.toThrow(/FILE_NOT_FOUND/);
    const mine = await svc(() => uploadComplete(db, USER_A, 1000));
    await expect(svc(() => db.query(
      "select public.create_share($1::uuid, $2::uuid, $3, now() - interval '1 day', true, null, null, $4, $5)",
      [USER_A, mine.out_file_id, "i".repeat(64), wrapped, NAME_ENC]))).rejects.toThrow(/INVALID_EXPIRY/);
    await expect(svc(() => db.query(
      "select public.create_share($1::uuid, $2::uuid, $3, now() + interval '400 days', true, null, null, $4, $5)",
      [USER_A, mine.out_file_id, "j".repeat(64), wrapped, NAME_ENC]))).rejects.toThrow(/INVALID_EXPIRY/);
  });

  it("record_share_access increments atomically", async () => {
    const f = await svc(() => uploadComplete(db, USER_A, 1000));
    const id = (await svc(() => db.query<{ s: string }>(
      "select public.create_share($1::uuid, $2::uuid, $3, now() + interval '1 day', true, null, null, $4, $5) as s",
      [USER_A, f.out_file_id, "m".repeat(64), wrapped, NAME_ENC]))).rows[0].s;
    await svc(() => db.query("select public.record_share_access($1::uuid)", [id]));
    await svc(() => db.query("select public.record_share_access($1::uuid)", [id]));
    const r = await db.query<{ access_count: number }>("select access_count from public.shares where id = $1", [id]);
    expect(r.rows[0].access_count).toBe(2);
  });

  it("deleting the file removes its shares", async () => {
    const f = await svc(() => uploadComplete(db, USER_A, 1000));
    await svc(() => db.query(
      "select public.create_share($1::uuid, $2::uuid, $3, now() + interval '1 day', false, null, null, $4, $5)",
      [USER_A, f.out_file_id, "k".repeat(64), wrapped, NAME_ENC]));
    await svc(() => db.query("select public.delete_file($1::uuid, $2::uuid)", [USER_A, f.out_file_id]));
    expect((await db.query("select 1 from public.shares")).rows).toHaveLength(0);
  });
});
