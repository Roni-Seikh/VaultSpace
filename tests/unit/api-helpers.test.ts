// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest";
import { ApiError, mapDbError, throwDb } from "@/lib/api/errors";
import { rateLimit, resetRateLimits } from "@/lib/api/rate-limit";
import { hashIp } from "@/lib/api/handler";
import { presignDownload, presignUpload } from "@/lib/r2/client";
import { S3Client } from "@aws-sdk/client-s3";

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

describe("R2 presigned URLs (signed locally, no network)", () => {
  const client = new S3Client({
    region: "auto",
    forcePathStyle: true,
    endpoint: "https://acct.r2.cloudflarestorage.com",
    credentials: { accessKeyId: "AKIATESTTESTTEST", secretAccessKey: "secret" },
    requestChecksumCalculation: "WHEN_REQUIRED",
  });

  it("upload URL is short-lived, targets the key, and signs content-length", async () => {
    const url = new URL(await presignUpload("u/abc/def/v1-xyz", 1234, client, "my-bucket"));
    expect(url.host).toBe("acct.r2.cloudflarestorage.com");
    expect(url.pathname).toBe("/my-bucket/u/abc/def/v1-xyz");
    expect(url.searchParams.get("X-Amz-Expires")).toBe("300");
    expect(url.searchParams.get("X-Amz-SignedHeaders")).toContain("content-length");
    expect(url.searchParams.get("X-Amz-Signature")).toMatch(/^[0-9a-f]{64}$/);
    expect(url.toString()).not.toContain("secret");
  });

  it("download URL expires in 60s and forces attachment + opaque content type", async () => {
    const url = new URL(await presignDownload("u/abc/def/v1-xyz", client, "my-bucket"));
    expect(url.searchParams.get("X-Amz-Expires")).toBe("60");
    expect(url.searchParams.get("response-content-disposition")).toBe("attachment");
    expect(url.searchParams.get("response-content-type")).toBe("application/octet-stream");
  });
});
