import { describe, expect, it } from "vitest";
import { readableQuestionText } from "@/lib/question-text";
describe("clinical text normalization", () => {
  it("converts math while retaining units, symbols and readable fractions", () => {
    expect(readableQuestionText(String.raw`$38^{\circ}\mathrm{C}$, $10^9/\mathrm{L}$, $\mu mol/L$, $\geq 3$, $\frac{a}{b}$`)).toBe("38°C, 10⁹/L, μ mol/L, ≥ 3, (a)/(b)");
    expect(readableQuestionText(String.raw`\(\mathrm{H}_2\mathrm{O}\) and \[\sqrt{4}\]`)).toBe("H₂O and √(4)");
  });
  it("preserves currency and ordinary clinical comparisons", () => {
    const text = "The cost is $20 and $30. pH < 7.2; mL/min; 5 mg/dL.";
    expect(readableQuestionText(text)).toBe(text);
    expect(readableQuestionText("First<br />Second")).toBe("First\nSecond");
  });
});
