import { describe, expect, it } from "vitest";
import { getDashboardStats, getQuestionSummaries, getQuestions, getSubjects, getTopicStats } from "@/lib/data-mock";
import { torontoDateKey } from "@/lib/utils";

describe("canonical demo data", () => {
  it("reconciles dashboard, analytics, and library totals", () => {
    const dashboard = getDashboardStats();
    const topicTotals = getTopicStats().reduce((totals, topic) => ({ attempted: totals.attempted + topic.attempted, correct: totals.correct + topic.correct }), { attempted: 0, correct: 0 });
    expect(dashboard.totalQuestions).toBe(getQuestions().length);
    expect(dashboard.totalQuestions).toBe(getSubjects().reduce((sum, subject) => sum + subject.questionCount, 0));
    expect(dashboard.attempted).toBe(topicTotals.attempted);
    expect(dashboard.correct).toBe(topicTotals.correct);
    expect(dashboard.totalQuestions - dashboard.attempted).toBe(10);
  });

  it("ends its activity series on the current Toronto date", () => {
    expect(getDashboardStats().activity.at(-1)?.date).toBe(torontoDateKey());
  });

  it("never puts the correct answer text in learner-visible summary tags", () => {
    const questions = getQuestions();
    const summaries = getQuestionSummaries();
    for (const question of questions) {
      const summary = summaries.find((item) => item.id === question.id);
      expect(summary?.tags).not.toContain(question.options[question.answerIdx].toLowerCase());
    }
  });
});
