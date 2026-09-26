import { describe, expect, it } from "vitest";
import { addHighlight, anchorHighlight, resolveHighlight } from "@/lib/text-highlights";

describe("saved text highlights", () => {
  it("uses UTF-16 offsets for emoji, accents and clinical symbols", () => {
    const text = "🫀 Café: Na⁺ 135 mmol/L";
    const start = text.indexOf("Na⁺");
    const saved = anchorHighlight(text, "stem", start, text.length, "one");
    expect(saved.quote).toBe("Na⁺ 135 mmol/L");
    expect(resolveHighlight(text, saved)).toEqual({ start, end: text.length });
    expect(resolveHighlight(`New introduction. ${text}`, saved)).toEqual({ start: start + 18, end: text.length + 18 });
  });
  it("distinguishes repeated quotes using nearby context, without guessing on ambiguous edits", () => {
    const text = "Morning: observe. Evening: observe.";
    const start = text.lastIndexOf("observe");
    const saved = anchorHighlight(text, "stem", start, start + 7, "one");
    expect(resolveHighlight(text, saved)).toEqual({ start, end: start + 7 });
    expect(resolveHighlight("observe, then observe", saved)).toBeNull();
    expect(resolveHighlight("The wording was replaced.", saved)).toBeNull();
  });
  it("merges overlapping ranges without losing separate regions or unrelated highlights", () => {
    const text = "abcdefghijklmno";
    const saved = [anchorHighlight(text, "stem", 0, 4, "one"), anchorHighlight(text, "stem", 5, 8, "two"), anchorHighlight(text, "summary", 3, 7, "three"), anchorHighlight(text, "stem", 12, 14, "four")];
    const next = addHighlight(saved, anchorHighlight(text, "stem", 3, 6, "new"), text);
    expect(next.map((h) => [h.id, h.quote])).toEqual([["three", "defg"], ["four", "mn"], ["new", "abcdefgh"]]);
    expect(saved).toHaveLength(4);
  });
});
