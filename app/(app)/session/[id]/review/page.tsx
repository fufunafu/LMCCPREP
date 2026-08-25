import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ReviewView } from "@/components/review-view";
import { getQuestionsByIds, getSession, getSessionAttempts, getTopics } from "@/lib/data";

export const metadata: Metadata = { title: "Session review" };

export default async function ReviewPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ mode?: string }> }) {
  const [{ id }, { mode }] = await Promise.all([params, searchParams]);
  const session = await getSession(id);
  if (!session) notFound();
  const effectiveSession = id === "demo" && mode === "timed" ? { ...session, mode: "timed" as const } : session;
  const [questions, attempts, topics] = await Promise.all([getQuestionsByIds(session.questionIds), getSessionAttempts(id), getTopics()]);
  return <ReviewView session={effectiveSession} questions={questions} attempts={attempts} topics={topics} />;
}
