import type { QuestionStatus, QuestionSummary, Subject, Topic } from "@/lib/types";

export const QUESTION_PAGE_SIZE = 8;
export type QuestionFilters = { query: string; subject: string; topic: string; status: QuestionStatus | "all"; page: number };
export type QuestionPage = { questions: QuestionSummary[]; statuses: Record<string, QuestionStatus>; total: number; page: number; pageSize: number };
export type QuestionLibraryFilters = { subjects: Pick<Subject, "id" | "name">[]; topics: Pick<Topic, "id" | "subjectId" | "name">[] };

export function normalizeQuestionFilters(input: Partial<Record<keyof QuestionFilters, unknown>> = {}): QuestionFilters {
  const text = (value: unknown, limit: number) => typeof value === "string" ? value.trim().slice(0, limit) : "";
  const status = text(input.status, 20);
  const page = Number(input.page);
  return {
    query: text(input.query, 200),
    subject: text(input.subject, 100) || "all",
    topic: text(input.topic, 100) || "all",
    status: (["unused", "correct", "incorrect", "flagged"].includes(status) ? status : "all") as QuestionFilters["status"],
    page: Number.isSafeInteger(page) && page > 0 ? Math.min(page, 1_000_000) : 1,
  };
}

export function questionFiltersKey(filters: QuestionFilters) {
  return new URLSearchParams(Object.entries(filters).map(([key, value]) => [key, String(value)])).toString();
}

export function paginateQuestions(questions: QuestionSummary[], statuses: Record<string, QuestionStatus>, input: QuestionFilters): QuestionPage {
  const filters = normalizeQuestionFilters(input);
  const query = filters.query.toLowerCase();
  const matching = questions.filter((question) => (
    (!query || question.stem.toLowerCase().includes(query) || question.tags.some((tag) => tag.toLowerCase().includes(query)) || String(question.qid).includes(query))
    && (filters.subject === "all" || question.subjectId === filters.subject)
    && (filters.topic === "all" || question.topicId === filters.topic)
    && (filters.status === "all" || (statuses[question.id] ?? "unused") === filters.status)
  )).sort((a, b) => a.qid - b.qid);
  const page = Math.min(filters.page, Math.max(1, Math.ceil(matching.length / QUESTION_PAGE_SIZE)));
  const visible = matching.slice((page - 1) * QUESTION_PAGE_SIZE, page * QUESTION_PAGE_SIZE);
  return { questions: visible, statuses: Object.fromEntries(visible.map(({ id }) => [id, statuses[id] ?? "unused"])), total: matching.length, page, pageSize: QUESTION_PAGE_SIZE };
}
