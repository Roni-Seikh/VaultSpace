import { describe, expect, it } from "vitest";
import { cn } from "./utils";

describe("cn", () => {
  it("merges class names and resolves Tailwind conflicts", () => {
    expect(cn("p-2", "p-4")).toBe("p-4");
  });
  it("ignores falsy values", () => {
    expect(cn("a", false && "b", undefined, "c")).toBe("a c");
  });
});
