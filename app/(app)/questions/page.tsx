import type { Metadata } from "next";
import { QuestionsBrowser } from "@/components/questions-browser";
import { getQuestionStatuses, getQuestionSummaries, getSubjects, getTopics } from "@/lib/data";

export const metadata: Metadata = { title: "Questions" };

export default async function QuestionsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const [questions, subjects, topics, statuses, { status }] = await Promise.all([getQuestionSummaries(), getSubjects(), getTopics(), getQuestionStatuses(), searchParams]);
  const initialStatus = ["unused", "correct", "incorrect", "flagged"].includes(status ?? "") ? status as "unused" | "correct" | "incorrect" | "flagged" : "all";
  return <QuestionsBrowser questions={questions} subjects={subjects} topics={topics} statuses={statuses} initialStatus={initialStatus} />;
}
