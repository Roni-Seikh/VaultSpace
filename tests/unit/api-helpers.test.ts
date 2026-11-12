// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest";
import { ApiError, mapDbError, throwDb } from "@/lib/api/errors";
import { rateLimit, resetRateLimits } from "@/lib/api/rate-limit";
import { hashIp } from "@/lib/api/handler";
import { vi } from "vitest";
vi.mock("server-only", () => ({}));
import { copyObject, deleteObjects, headObjectSize, presignDownload, presignUpload, type StorageApi } from "@/lib/r2/client";

describe("DB error mapping", () => {
  it("maps known SQL exceptions to friendly HTTP errors", () => {
    expect(mapDbError("QUOTA_EXCEEDED")).toMatchObject({ status: 413, code: "QUOTA_EXCEEDED" });
    expect(mapDbError("error: GLOBAL_CAP_REACHED blah")).toMatchObject({ status: 503 });
    expect(mapDbError("FILE_NOT_FOUND")).toMatchObject({ status: 404 });
    expect(mapDbError("something else")).toBeNull();
    expect(mapDbError(undefined)).toBeNull();
  });
  it("throwDb hides unknown internals", () => {
    expect(() => throwDb({ message: 'relation "x" does not exist' })).toThrowError(/Something went wrong/);
    expect(() => throwDb({ message: "QUOTA_EXCEEDED" })).toThrow(ApiError);
    expect(() => throwDb(null)).not.toThrow();
  });
});

describe("rate limiter", () => {
  beforeEach(resetRateLimits);
  it("allows up to the limit, then blocks with retry-after, then recovers", () => {
    const t = 1_000_000;
    for (let i = 0; i < 3; i++) expect(rateLimit("k", 3, 1000, t).ok).toBe(true);
    const blocked = rateLimit("k", 3, 1000, t + 10);
    expect(blocked.ok).toBe(false);
    expect(blocked.retryAfter).toBeGreaterThan(0);
    expect(rateLimit("k", 3, 1000, t + 1001).ok).toBe(true);
  });
  it("keys are independent", () => {
    expect(rateLimit("a", 1, 1000, 5).ok).toBe(true);
    expect(rateLimit("b", 1, 1000, 5).ok).toBe(true);
    expect(rateLimit("a", 1, 1000, 6).ok).toBe(false);
  });
});

describe("IP hashing", () => {
  it("is stable, salted and does not contain the address", () => {
    expect(hashIp("203.0.113.9")).toBe(hashIp("203.0.113.9"));
    expect(hashIp("203.0.113.9")).not.toBe(hashIp("203.0.113.10"));
    expect(hashIp("203.0.113.9")).not.toContain("203");
    expect(hashIp("203.0.113.9")).toHaveLength(32);
  });
});

describe("storage client (fake Supabase Storage API, no network)", () => {
  const ok = <T,>(data: T) => Promise.resolve({ data, error: null });
  function fake(over: Partial<StorageApi> = {}): StorageApi & { calls: string[] } {
    const calls: string[] = [];
    return {
      calls,
      createSignedUploadUrl: async (p) => { calls.push(`up:${p}`); return { data: { signedUrl: `https://x.supabase.co/storage/v1/object/upload/sign/b/${p}?token=t` }, error: null }; },
      createSignedUrl: async (p, ttl, o) => { calls.push(`dl:${p}:${ttl}:${o?.download}`); return { data: { signedUrl: "https://x/dl" }, error: null }; },
      info: async () => ok({ size: 1234 }),
      copy: async (a, b) => { calls.push(`cp:${a}>${b}`); return { error: null }; },
      remove: async (k) => { calls.push(`rm:${k.length}`); return { data: null, error: null }; },
      ...over,
    };
  }

  it("upload URL targets the key", async () => {
    const f = fake();
    expect(await presignUpload("u/a/b/v1-x", f)).toContain("/u/a/b/v1-x?token=");
  });
  it("download URL lives 60 s and forces download", async () => {
    const f = fake();
    await presignDownload("k", f);
    expect(f.calls).toContain("dl:k:60:true");
  });
  it("reports object size, and null when the object does not exist", async () => {
    expect(await headObjectSize("k", fake())).toBe(1234);
    const missing = fake({ info: async () => ({ data: null, error: { message: "Object not found", statusCode: "404" } }) });
    expect(await headObjectSize("k", missing)).toBeNull();
    const broken = fake({ info: async () => ({ data: null, error: { message: "boom" } }) });
    await expect(headObjectSize("k", broken)).rejects.toThrow(/boom/);
  });
  it("copies and surfaces errors", async () => {
    const f = fake();
    await copyObject("a", "b", f);
    expect(f.calls).toContain("cp:a>b");
    await expect(copyObject("a", "b", fake({ copy: async () => ({ error: { message: "nope" } }) }))).rejects.toThrow(/nope/);
  });
  it("deletes in batches of 100 and returns keys that failed", async () => {
    const f = fake();
    const keys = Array.from({ length: 250 }, (_, i) => `k${i}`);
    expect(await deleteObjects(keys, f)).toEqual([]);
    expect(f.calls.filter((c) => c.startsWith("rm:"))).toEqual(["rm:100", "rm:100", "rm:50"]);
    const failing = fake({ remove: async () => ({ data: null, error: { message: "x" } }) });
    expect(await deleteObjects(["a", "b"], failing)).toEqual(["a", "b"]);
    expect(await deleteObjects([], f)).toEqual([]);
  });
  it("signing failure throws", async () => {
    const bad = fake({ createSignedUploadUrl: async () => ({ data: null, error: { message: "denied" } }) });
    await expect(presignUpload("k", bad)).rejects.toThrow(/denied/);
  });
});
