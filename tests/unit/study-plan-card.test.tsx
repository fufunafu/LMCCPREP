import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { Profile } from "@/lib/types";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/lib/actions", () => ({ updateProfile: vi.fn() }));

import { StudyPlanCard } from "@/components/study-plan-card";

const profile: Profile = { id: "learner", name: "Learner", email: "learner@example.com", streakDays: 0, medicalSchool: "", targetExamDate: "", examDatePrecision: null, dailyReminder: false, showShortcuts: true, explanationAutoScroll: false, examId: "mccqe" };

describe("exam-date onboarding", () => {
  it("offers exact, approximate, and unknown dates before the first answer", () => {
    const html = renderToStaticMarkup(<StudyPlanCard profile={profile} remainingQuestions={300} />);
    expect(html).toContain("When is your exam?");
    expect(html).toContain("I know my date");
    expect(html).toContain("I have an approximate date");
    expect(html).toContain("I don’t know yet");
  });

  it("does not repeat onboarding when the saved answer is unknown", () => {
    const html = renderToStaticMarkup(<StudyPlanCard profile={{ ...profile, examDatePrecision: "unknown" }} remainingQuestions={300} />);
    expect(html).toContain("Flexible schedule");
    expect(html).toContain("Update exam date");
    expect(html).not.toContain("When is your exam?");
    expect(html).not.toContain('type="date"');
  });

  it("keeps existing dates without prompting learners to answer again", () => {
    const html = renderToStaticMarkup(<StudyPlanCard profile={{ ...profile, examDatePrecision: undefined, targetExamDate: "2099-04-15" }} remainingQuestions={300} />);
    expect(html).toContain("Exam date:");
    expect(html).not.toContain("When is your exam?");
  });
});
