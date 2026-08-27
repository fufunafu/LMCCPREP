import { describe, expect, it } from "vitest";
import { completeRedundantSupportFields } from "../../lib/question-review-corrections.mjs";

const snapshotQuestion = {
  stem: "Which diagnosis best fits?",
  options: ["Diagnosis A", "Diagnosis B", "Diagnosis C"],
  answer_index: 1,
  explanation: ["Diagnosis B is correct.", "The clinical pattern supports Diagnosis B."],
};

describe("completeRedundantSupportFields", () => {
  it("keeps answer support synchronized after a reviewed content correction", () => {
    const result = completeRedundantSupportFields(snapshotQuestion, {
      answer_index: 2,
      explanation: [
        "Diagnosis C is correct.",
        "The corrected clinical pattern supports Diagnosis C.",
        "Diagnosis A and Diagnosis B do not explain the key finding.",
      ],
    });

    expect(result.answer_key).toBe(
      "The correct answer is Option 3: Diagnosis C. The corrected clinical pattern supports Diagnosis C.",
    );
    expect(result.key_points).toBe(
      "The corrected clinical pattern supports Diagnosis C.\n\nDiagnosis A and Diagnosis B do not explain the key finding.",
    );
    expect(result.option_explanations).toEqual({
      0: "Incorrect. The best answer is Diagnosis C. Diagnosis A and Diagnosis B do not explain the key finding.",
      1: "Incorrect. The best answer is Diagnosis C. Diagnosis A and Diagnosis B do not explain the key finding.",
      2: "Correct. The corrected clinical pattern supports Diagnosis C.",
    });
  });

  it("does not rewrite support fields for a metadata-only patch", () => {
    const patch = { needs_review: true, review_note: "Check guideline currency." };
    expect(completeRedundantSupportFields(snapshotQuestion, patch)).toBe(patch);
  });

  it("preserves an explicitly reviewed support field", () => {
    const result = completeRedundantSupportFields(snapshotQuestion, {
      stem: "Which diagnosis is now most likely?",
      answer_key: "Reviewer-approved answer key.",
    });

    expect(result.answer_key).toBe("Reviewer-approved answer key.");
    expect(result.key_points).toBe("The clinical pattern supports Diagnosis B.");
  });
});
