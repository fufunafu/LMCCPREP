import { describe, expect, it } from "vitest";
import { buildStudyPlan, validateExamDate } from "@/lib/study-plan";

describe("exam date choices", () => {
  const today = "2026-09-14";
  it("retains approximate dates and distinguishes unknown from unanswered", () => {
    expect(validateExamDate("approximate", "2027-04-15", today)).toEqual({ precision: "approximate", date: "2027-04-15" });
    expect(validateExamDate("unknown", "2027-04-15", today)).toEqual({ precision: "unknown", date: null });
  });
  it("rejects missing, impossible, past, or unrecognized choices", () => {
    for (const date of [null, "", "2027-02-29", "2027-04-31", "2026-09-13", "tomorrow"]) {
      expect(() => validateExamDate("exact", date, today)).toThrow();
    }
    expect(() => validateExamDate("maybe", "2027-04-15", today)).toThrow();
    expect(validateExamDate("exact", today, today).date).toBe(today);
    expect(validateExamDate("exact", "2028-02-29", today).date).toBe("2028-02-29");
  });
});

describe("daily study pacing", () => {
  it("reserves review time and rounds up so the remaining bank fits", () => {
    expect(buildStudyPlan("2026-10-14", 601, "2026-09-14")).toEqual({ kind: "scheduled", days: 30, reviewDays: 6, questionsPerDay: 26 });
  });
  it("offers a flexible routine without inventing an exam deadline", () => {
    expect(buildStudyPlan(null, 600, "2026-09-14")).toEqual({ kind: "flexible", questionsPerDay: 20 });
    expect(buildStudyPlan(null, 5, "2026-09-14")).toEqual({ kind: "flexible", questionsPerDay: 5 });
  });
  it("handles dates today, in the past, or close to the exam without division by zero", () => {
    expect(buildStudyPlan("2026-09-14", 600, "2026-09-14").kind).toBe("today");
    expect(buildStudyPlan("2026-09-13", 600, "2026-09-14").kind).toBe("past");
    expect(buildStudyPlan("2026-09-15", 600, "2026-09-14")).toEqual({ kind: "scheduled", days: 1, reviewDays: 0, questionsPerDay: 600 });
    expect(buildStudyPlan("2026-11-02", 80, "2026-10-31")).toEqual({ kind: "scheduled", days: 2, reviewDays: 0, questionsPerDay: 40 });
  });
  it("does not suggest new questions for a completed bank", () => {
    expect(buildStudyPlan("2027-04-15", 0, "2026-09-14").questionsPerDay).toBe(0);
    expect(buildStudyPlan(null, -5, "2026-09-14").questionsPerDay).toBe(0);
  });
});
