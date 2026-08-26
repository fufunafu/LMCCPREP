import { describe, expect, it } from "vitest";
import { resolveInitialIndex } from "@/lib/session-utils";

describe("resolveInitialIndex", () => {
  it("parses a 1-based ?q= value", () => {
    expect(resolveInitialIndex("1", {}, 10)).toBe(0);
    expect(resolveInitialIndex("7", { currentIndex: 2 }, 10)).toBe(6);
    expect(resolveInitialIndex("3abc", {}, 10)).toBe(2);
  });

  it("falls back to the session's saved position when q is missing or not a number", () => {
    expect(resolveInitialIndex(null, { currentIndex: 4 }, 10)).toBe(4);
    expect(resolveInitialIndex(undefined, {}, 10)).toBe(0);
    expect(resolveInitialIndex("", { currentIndex: 3 }, 10)).toBe(3);
    expect(resolveInitialIndex("abc", { currentIndex: 3 }, 10)).toBe(3);
    expect(resolveInitialIndex("NaN", { currentIndex: 3 }, 10)).toBe(3);
    expect(resolveInitialIndex("Infinity", { currentIndex: 3 }, 10)).toBe(3);
  });

  it("clamps to the available questions", () => {
    expect(resolveInitialIndex("99", {}, 10)).toBe(9);
    expect(resolveInitialIndex("0", {}, 10)).toBe(0);
    expect(resolveInitialIndex("-5", {}, 10)).toBe(0);
    expect(resolveInitialIndex(null, { currentIndex: 50 }, 10)).toBe(9);
    expect(resolveInitialIndex(null, { currentIndex: -1 }, 10)).toBe(0);
    expect(resolveInitialIndex("3", {}, 0)).toBe(0);
  });
});
