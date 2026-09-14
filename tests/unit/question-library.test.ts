import { describe, expect, it } from "vitest";
import { normalizeQuestionFilters, paginateQuestions, QUESTION_PAGE_SIZE } from "@/lib/question-library";
import { getQuestionSummaries } from "@/lib/data-mock";

const questions = getQuestionSummaries();

describe("question library pagination", () => {
  it("returns only one page and only its statuses", () => {
    const result = paginateQuestions(questions, { q1: "flagged", q25: "correct" }, normalizeQuestionFilters());
    expect(result.questions).toHaveLength(QUESTION_PAGE_SIZE);
    expect(result.total).toBe(questions.length);
    expect(Object.keys(result.statuses)).toEqual(result.questions.map(({ id }) => id));
    expect(result.statuses.q1).toBe("flagged");
    expect(result.statuses.q25).toBeUndefined();
  });

  it("treats questions without attempts as unused and respects flags", () => {
    const result = paginateQuestions(questions, { q1: "flagged", q2: "correct" }, normalizeQuestionFilters({ status: "unused" }));
    expect(result.total).toBe(questions.length - 2);
    expect(result.questions.some(({ id }) => id === "q1" || id === "q2")).toBe(false);
  });

  it("supports partial tag, clinical keyword, and question ID searches", () => {
    for (const query of ["CARDIO", "murmur", "1001"]) {
      const result = paginateQuestions(questions, {}, normalizeQuestionFilters({ query }));
      expect(result.questions.some(({ id }) => id === "q1")).toBe(true);
    }
  });

  it("clamps pages and returns an empty first page for empty results", () => {
    expect(paginateQuestions(questions, {}, normalizeQuestionFilters({ page: 9999 })).page).toBe(Math.ceil(questions.length / QUESTION_PAGE_SIZE));
    expect(paginateQuestions(questions, {}, normalizeQuestionFilters({ subject: "unknown", page: 9999 }))).toMatchObject({ questions: [], statuses: {}, total: 0, page: 1 });
  });

  it("bounds untrusted inputs and normalizes invalid filters", () => {
    expect(normalizeQuestionFilters({ query: "x".repeat(500), page: "Infinity", subject: ["medicine"], status: "admin" })).toEqual({ query: "x".repeat(200), page: 1, subject: "all", topic: "all", status: "all" });
    expect(normalizeQuestionFilters({ page: "-2" }).page).toBe(1);
  });
});
