import type { Metadata } from "next";
import { QuestionsBrowser } from "@/components/questions-browser";
import { getQuestionLibraryFilters, getQuestionPage } from "@/lib/data";
import { normalizeQuestionFilters } from "@/lib/question-library";

export const metadata: Metadata = { title: "Questions" };

export default async function QuestionsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const filters = normalizeQuestionFilters(await searchParams);
  const [initialPage, { subjects, topics }] = await Promise.all([getQuestionPage(filters), getQuestionLibraryFilters()]);
  return <QuestionsBrowser initialPage={initialPage} subjects={subjects} topics={topics} initialStatus={filters.status} />;
}
