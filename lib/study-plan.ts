export type ExamDatePrecision = "exact" | "approximate" | "unknown";

export function validateExamDate(precision: string, date: string | null | undefined, today: string): { precision: ExamDatePrecision; date: string | null } {
  if (precision === "unknown") return { precision, date: null } as const;
  if (precision !== "exact" && precision !== "approximate") throw new Error("Choose how certain you are about your exam date.");
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("Enter a date for your study plan.");
  const timestamp = Date.parse(`${date}T12:00:00Z`);
  if (!Number.isFinite(timestamp) || new Date(timestamp).toISOString().slice(0, 10) !== date) throw new Error("Enter a valid exam date.");
  if (date < today) throw new Error("Choose today or a future date, or select ‘I don’t know yet’.");
  return { precision, date };
}

export function buildStudyPlan(date: string | null | undefined, remainingQuestions: number, today: string) {
  const remaining = Math.max(0, Math.ceil(remainingQuestions));
  const days = date ? Math.ceil((Date.parse(`${date}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) / 86_400_000) : null;
  if (days === null || !Number.isFinite(days)) return { kind: "flexible", questionsPerDay: Math.min(20, remaining) } as const;
  if (days < 0) return { kind: "past" } as const;
  if (days === 0) return { kind: "today" } as const;
  // Reserve roughly the final fifth of the schedule for reviewing missed questions.
  const reviewDays = days >= 7 ? Math.max(1, Math.floor(days * 0.2)) : 0;
  const practiceDays = days - reviewDays;
  return { kind: "scheduled", days, reviewDays, questionsPerDay: Math.ceil(remaining / practiceDays) } as const;
}
