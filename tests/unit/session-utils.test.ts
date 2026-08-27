import { describe, expect, it } from "vitest";
import { prepareExplanation, resolveInitialIndex } from "@/lib/session-utils";

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

describe("prepareExplanation", () => {
  it("keeps only one copy of repeated explanation text", () => {
    const result = prepareExplanation([
      "A rising beta-hCG level supports an early viable pregnancy.",
      "  A rising beta-hCG level supports an early viable pregnancy.  ",
      "A follow-up ultrasound confirms location.",
    ], "Repeat beta-hCG testing");

    expect(result.paragraphs).toEqual([
      "A rising beta-hCG level supports an early viable pregnancy.",
      "A follow-up ultrasound confirms location.",
    ]);
  });

  it("removes an answer-only restatement when a rationale is available", () => {
    const result = prepareExplanation([
      "The correct answer is pulmonary embolism.",
      "Sudden hypoxemia and pleuritic pain after surgery suggest pulmonary embolism.",
    ], "Pulmonary embolism");

    expect(result.paragraphs).toEqual([
      "Sudden hypoxemia and pleuritic pain after surgery suggest pulmonary embolism.",
    ]);
    expect(result.hasMore).toBe(false);
  });

  it("returns a short preview and preserves additional unique detail", () => {
    const longRationale = "This clinical pattern strongly supports the diagnosis because the history, examination findings, laboratory pattern, imaging features, and time course all point to the same underlying mechanism and exclude the closest distractors.";
    const result = prepareExplanation([longRationale, "A second useful point remains available."], "Diagnosis");

    expect(result.preview.length).toBeLessThanOrEqual(121);
    expect(result.preview.endsWith("…")).toBe(true);
    expect(result.paragraphs).toEqual([longRationale, "A second useful point remains available."]);
    expect(result.hasMore).toBe(true);
  });
});
