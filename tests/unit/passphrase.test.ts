// @vitest-environment node
import { describe, expect, it } from "vitest";
import { assessPassphrase } from "@/lib/passphrase";

describe("assessPassphrase", () => {
  it("rejects short passphrases", () => {
    expect(assessPassphrase("short").ok).toBe(false);
    expect(assessPassphrase("").label).toBe("");
    expect(assessPassphrase("elevenchars").ok).toBe(false);
  });
  it("rejects common words and repeated characters", () => {
    expect(assessPassphrase("password1234").ok).toBe(false);
    expect(assessPassphrase("aaaaaaaaaaaaaaaa").ok).toBe(false);
    expect(assessPassphrase("0123456789012").ok).toBe(false);
  });
  it("accepts reasonable passphrases and rates longer ones higher", () => {
    const a = assessPassphrase("blue-river-tractor-moon");
    const b = assessPassphrase("correct horse battery staple 7!");
    const c = assessPassphrase("mangoes dance quietly");
    expect(a.ok && b.ok && c.ok).toBe(true);
    expect(b.score).toBeGreaterThanOrEqual(a.score);
    expect(b.score).toBeGreaterThanOrEqual(3);
  });
});
