"use client";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useStudy, useStudyTime } from "@/components/study-provider";
import { QuestionPlayer } from "@/components/question-player";
import { ReviewView } from "@/components/review-view";
import { studyStore } from "@/lib/study-store";
import { StudyFollowUp } from "@/components/study-tools";
import { makeStudySession } from "@/lib/study-core";

export function StudySession({ id, review = false, query }: { id: string; review?: boolean; query?: string }) {
  const { snapshot, ready, error } = useStudy();
  const now = useStudyTime();
  const params = useSearchParams();
  const mode = new URLSearchParams(query ?? params.toString()).get("mode");
  const [loadError, setLoadError] = useState<string>();
  const saved = snapshot?.sessions[id];
  useEffect(() => {
    if (!ready || !snapshot || saved) return;
    if (snapshot.demo && /^demo-question-\d+$/.test(id)) {
      const q = snapshot.questions.find((q) => `demo-question-${q.qid}` === id);
      if (q) void studyStore.local((s) => ({ ...s, sessions: { ...s.sessions, [id]: s.sessions[id] ?? makeStudySession(s, { mode: "tutor", count: 1, exactIds: [q.id], filters: { subjectIds: [], topicIds: [], status: "all" } }, id) } })).catch((e) => setLoadError(e.message));
      return;
    }
    if (!navigator.onLine) return;
    let cancelled = false;
    void studyStore.loadSession(id).catch((e) => { if (!cancelled) setLoadError(e.message); });
    return () => { cancelled = true; };
  }, [id, ready, saved, snapshot?.userId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!saved || saved.starts[saved.questionIds[saved.cursor]]) return;
    void studyStore.local((s) => ({ ...s, sessions: { ...s.sessions, [id]: { ...s.sessions[id], starts: { ...s.sessions[id].starts, [s.sessions[id].questionIds[s.sessions[id].cursor]]: Date.now() } } } })).catch(() => undefined);
  }, [id, saved]);
  if (!ready || !snapshot) return <p role="status" className="p-8">{error ?? "Loading your saved study data…"}</p>;
  if (Date.parse(snapshot.validUntil) <= now) return <p role="alert" className="p-8">Reconnect to refresh your study access. Your saved answers are kept.</p>;
  if (!saved) return <p role="status" className="p-8">{loadError ?? "This session is not saved yet. Connect to load it, or create a new session from your downloaded bank."}</p>;
  const session = id === "demo" && mode === "timed" ? { ...saved, mode: "timed" as const } : saved;
  const bank = new Map(snapshot.questions.map((q) => [q.id, q]));
  const questions = session.questionIds.flatMap((id) => bank.has(id) ? [bank.get(id)!] : []);
  if (!questions.length || questions.length !== session.questionIds.length) return <p role="alert" className="p-8">Some questions in this session are no longer available. Create a new session with the current bank.</p>;
  const attempts = snapshot.attempts.filter((a) => a.sessionId === id);
  if (review) return <><ReviewView session={session} questions={questions} attempts={attempts} topics={snapshot.topics} /><div className="mx-auto max-w-6xl px-6 pb-8"><StudyFollowUp session={session} /></div></>;
  return <QuestionPlayer session={session} questions={questions} subjects={snapshot.subjects} topics={snapshot.topics} initialAttempts={attempts} initialFlags={snapshot.flags} initialNotes={snapshot.notes} showShortcuts={snapshot.profile.showShortcuts} explanationAutoScroll={snapshot.profile.explanationAutoScroll} query={query} />;
}
