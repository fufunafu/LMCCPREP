import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { QuestionPlayer } from "@/components/question-player";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { getFlaggedQuestionIds, getNotes, getProfile, getQuestionsByIds, getSession, getSessionAttempts, getSubjects, getTopics } from "@/lib/data";

export const metadata: Metadata = { title: "Practice session" };

export default async function SessionPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ review?: string }> }) {
  const [{ id }, { review }] = await Promise.all([params, searchParams]);
  const session = await getSession(id);
  if (!session) notFound();
  const [questions, subjects, topics, flagged, notes, attempts, profile] = await Promise.all([getQuestionsByIds(session.questionIds), getSubjects(), getTopics(), getFlaggedQuestionIds(session.questionIds), getNotes(session.questionIds), getSessionAttempts(id), getProfile()]);
  if (!questions.length) return <div className="mx-auto max-w-xl px-4 py-16"><Card><CardContent className="p-8 text-center"><h1 className="text-xl font-semibold">This session has no available questions</h1><p className="mt-2 text-sm leading-6 text-muted-foreground">The question pool may have changed, or none of the saved questions are currently available.</p><Link href="/create" className={buttonVariants({ className: "mt-6 bg-emerald-800 hover:bg-emerald-900" })}>Build another session</Link></CardContent></Card></div>;
  return <Suspense><QuestionPlayer session={session} questions={questions} subjects={subjects} topics={topics} initialFlags={flagged} initialNotes={notes} initialAttempts={session.id === "demo" && review !== "1" ? [] : attempts} showShortcuts={profile?.showShortcuts ?? true} explanationAutoScroll={profile?.explanationAutoScroll ?? false} /></Suspense>;
}
