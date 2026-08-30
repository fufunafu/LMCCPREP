import { describe, expect, it } from "vitest";
import { buildExplanationContent, cleanVerdict, formatParagraph } from "@/lib/explanation-content";

const base = {
  options: ["Antibiotics", "Trim the nail", "Topical antibiotic", "Partial nail avulsion with matricectomy", "Total avulsion"],
  answerIdx: 3,
  explanation: [
    "Partial nail avulsion with chemical matricectomy is the best answer.",
    "This is recurrent lateral onychocryptosis with granulation tissue. Removing the lateral nail plate addresses the current conflict.",
  ],
  keyPoints: "Use conservative care for mild disease. Recurrent onychocryptosis is treated with partial avulsion plus matricectomy. Phenol lowers recurrence.",
  optionExplanations: {
    "0": "Incorrect. Local inflammation without spreading cellulitis does not require systemic antibiotics.",
    "3": "Correct. Partial avulsion removes the offending edge.",
  },
};

describe("buildExplanationContent", () => {
  it("uses key points for the short summary and explains the learner's wrong choice", () => {
    const content = buildExplanationContent(base, 0);
    expect(content.short).toEqual([
      "Use conservative care for mild disease.",
      "Recurrent onychocryptosis is treated with partial avulsion plus matricectomy.",
      "Phenol lowers recurrence.",
    ]);
    expect(content.yourAnswer).toBe("Local inflammation without spreading cellulitis does not require systemic antibiotics.");
    expect(content.fullBlocks).toEqual([{ type: "paragraph", text: base.explanation[1] }]);
    expect(content.optionVerdicts[3]).toEqual({ index: 3, isCorrect: true, text: "Partial avulsion removes the offending edge." });
    expect(content.optionVerdicts[1].text).toBeUndefined();
  });

  it("omits the wrong-choice note when the answer was right or the bank has no verdict", () => {
    expect(buildExplanationContent(base, 3).yourAnswer).toBeUndefined();
    expect(buildExplanationContent({ ...base, optionExplanations: undefined }, 0).yourAnswer).toBeUndefined();
    expect(buildExplanationContent({ ...base, keyPoints: undefined }, 0).short).toEqual([
      "This is recurrent lateral onychocryptosis with granulation tissue.",
      "Removing the lateral nail plate addresses the current conflict.",
    ]);
  });
});

describe("formatting", () => {
  it("drops answer restatements from verdicts and keeps the reason", () => {
    expect(cleanVerdict("Incorrect. The best answer is Severe depression. ECT is indicated when suicide risk is high.")).toBe("ECT is indicated when suicide risk is high.");
    expect(cleanVerdict("Incorrect.")).toBeUndefined();
  });

  it("turns OCR-flattened bullet runs into a bullet list", () => {
    const blocks = formatParagraph("-- p Acute poststreptococcal glomerulonephritis Clinical features: • Gross hematuria (tea-colored urine) • Edema (periorbital) • Hypertension");
    expect(blocks).toEqual([
      { type: "heading", text: "Acute poststreptococcal glomerulonephritis Clinical features:" },
      { type: "bullets", items: ["Gross hematuria (tea-colored urine)", "Edema (periorbital)", "Hypertension"] },
    ]);
    expect(formatParagraph("Management:")).toEqual([{ type: "heading", text: "Management:" }]);
  });
});
