"use client";
import { useState } from "react";
import { toast } from "sonner";
import { useStudy } from "@/components/study-provider";
import { useStudyNavigation } from "@/lib/study-navigation";
import { saveStudy, studyStore } from "@/lib/study-store";
import { completedToday, dailyTarget, dayKey, dueReviews, learningPeriods, makeStudySession, planDays, plannedQuestionIds, questionPool, type SavedSession, type Score, type StudyPlan } from "@/lib/study-core";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";

export function PersonalStudyCard() {
  const { snapshot } = useStudy();
  const navigate = useStudyNavigation();
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  if (!snapshot) return <p role="status" className="mb-5 text-sm text-muted-foreground">Loading your study plan…</p>;
  const plan = snapshot.plan;
  const days = plan ? planDays(plan) : 0;
  const done = completedToday(snapshot);
  const target = plan ? dailyTarget(plan) : 0;
  const unused = questionPool(snapshot, { subjectIds: [], topicIds: [], status: "unused" }).length;
  const due = dueReviews(snapshot);
  const start = async (ids: string[], status: "unused" | "review") => {
    if (!ids.length) return;
    setBusy(true); setError("");
    try {
      const session = makeStudySession(snapshot, { mode: "tutor", count: 20, exactIds: ids, filters: { subjectIds: [], topicIds: [], status } }, crypto.randomUUID());
      await saveStudy({ kind: "session", session }); navigate(`/session/${session.id}`);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not start your session."); }
    finally { setBusy(false); }
  };
  return <Card className="mb-5 border-emerald-200 dark:border-emerald-900"><CardHeader><CardTitle>Your personal study plan</CardTitle></CardHeader><CardContent className="space-y-4">
    {!plan || editing ? <form className="space-y-4" onSubmit={async (event) => {
      event.preventDefault(); setError(""); setBusy(true);
      const form = new FormData(event.currentTarget);
      const next: StudyPlan = { examDate: String(form.get("date")), minutesPerDay: Number(form.get("minutes")), minutesPerQuestion: Number(form.get("pace")) / 60 };
      try { await studyStore.plan(next); setEditing(false); } catch (e) { setError(e instanceof Error ? e.message : "Could not save your plan."); } finally { setBusy(false); }
    }}><p className="text-sm text-muted-foreground">Choose your daily study time and pace. Your target includes new questions and scheduled review.</p><div className="grid gap-4 sm:grid-cols-3">
      <div className="space-y-2"><Label htmlFor="personal-date">Target exam date</Label><Input id="personal-date" name="date" type="date" min={dayKey()} required defaultValue={plan?.examDate ?? snapshot.profile.targetExamDate} /></div>
      <div className="space-y-2"><Label htmlFor="personal-minutes">Minutes per day</Label><Input id="personal-minutes" name="minutes" type="number" min={15} max={240} step={1} required defaultValue={plan?.minutesPerDay ?? 40} /></div>
      <div className="space-y-2"><Label htmlFor="personal-pace">Seconds per question</Label><Input id="personal-pace" name="pace" type="number" min={15} max={600} step={1} required defaultValue={Math.round((plan?.minutesPerQuestion ?? 2) * 60)} /></div>
    </div><div className="flex flex-wrap gap-2"><Button disabled={busy} type="submit">Save study plan</Button>{plan && <Button variant="ghost" type="button" onClick={() => setEditing(false)}>Cancel</Button>}</div></form> : <>
      <div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-3xl font-semibold">{Math.min(done, target)} / {target}</p><p className="mt-1 text-sm text-muted-foreground">questions toward today’s target · {plan.minutesPerDay} minutes at {Math.round(plan.minutesPerQuestion * 60)} seconds per question</p></div><Button variant="outline" size="sm" onClick={() => setEditing(true)}>Edit study plan</Button></div>
      <Progress aria-label="Daily study target" value={Math.min(100, done / target * 100)} />
      <p className="text-sm text-muted-foreground">{days > 0 ? `${days} days to your exam. ${unused} new questions remain; about ${Math.ceil(unused / days)} new questions per day would cover them.` : "Your target exam date has arrived. Edit your plan to set a future date."}</p>
      {days > 0 && Math.ceil(unused / days) > target && <p className="text-sm text-amber-800 dark:text-amber-300">Your current study time may not cover the remaining bank before this date. Adjust your time or prioritize your weakest topics.</p>}
      <Button disabled={busy || done >= target || days <= 0 || !unused} onClick={() => { try { void start(plannedQuestionIds(snapshot), "unused"); } catch (e) { setError((e as Error).message); } }}>{done >= target ? "Daily target complete" : !unused ? "No new questions remaining" : `Start today’s ${Math.min(20, target - done, unused)} new questions`}</Button>
    </>}
    <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4"><div><p className="text-sm font-medium">{due.length} questions due for review</p><p className="text-xs text-muted-foreground">Missed questions return after 1 day. Successful spaced reviews extend the interval to 3, 7, 14 and 30 days.</p></div><Button variant="outline" disabled={!due.length || busy} onClick={() => void start(due, "review")}>Start due review</Button></div>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}<p className="text-xs text-muted-foreground">This plan is saved for this account and exam in this browser. Synced answers from your other devices count toward your progress.</p>
  </CardContent></Card>;
}

const accuracy = (s: Score) => s.answered ? `${Math.round(s.correct / s.answered * 100)}%` : "No attempts";
export function LearningProgress() {
  const { snapshot } = useStudy();
  const [days, setDays] = useState<7 | 30>(7);
  if (!snapshot) return null;
  const periods = learningPeriods(snapshot, days);
  return <Card className="mb-5"><CardHeader><div className="flex flex-wrap items-center justify-between gap-3"><CardTitle>Learning progress</CardTitle><div className="flex gap-2">{([7, 30] as const).map((n) => <Button size="sm" variant={days === n ? "default" : "outline"} aria-pressed={days === n} key={n} onClick={() => setDays(n)}>{n} days</Button>)}</div></div></CardHeader><CardContent><div className="grid gap-4 sm:grid-cols-2">{([['first', 'First attempts'], ['repeated', 'Repeat practice']] as const).map(([key, title]) => <div key={key} className="rounded-xl border p-4"><h3 className="font-medium">{title}</h3><p className="mt-2 text-2xl font-semibold">{accuracy(periods.current[key])}</p><p className="text-sm text-muted-foreground">{periods.current[key].correct} correct of {periods.current[key].answered} attempts</p><p className="mt-2 text-xs text-muted-foreground">Previous {days} days: {accuracy(periods.previous[key])} · {periods.previous[key].answered} attempts</p></div>)}</div><p className="mt-3 text-xs text-muted-foreground">First attempts measure new learning. Repeated questions are counted separately, using your full saved history and local calendar days.</p></CardContent></Card>;
}

export function StudyFollowUp({ session }: { session: SavedSession }) {
  const { snapshot } = useStudy();
  const navigate = useStudyNavigation();
  const [busy, setBusy] = useState(false);
  if (!snapshot) return null;
  const missed = snapshot.attempts.filter((a) => a.sessionId === session.id && !a.correct).map((a) => a.questionId);
  const topics = new Set(snapshot.questions.filter((q) => missed.includes(q.id)).map((q) => q.topicId));
  const followUp = snapshot.questions.filter((q) => topics.has(q.topicId) && !session.questionIds.includes(q.id)).map((q) => q.id);
  const start = async (ids: string[]) => {
    setBusy(true);
    try { const next = makeStudySession(snapshot, { mode: "tutor", count: 20, exactIds: ids, filters: { subjectIds: [], topicIds: [], status: "review" } }, crypto.randomUUID()); await saveStudy({ kind: "session", session: next }); navigate(`/session/${next.id}`); }
    catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  };
  return <div className="flex flex-wrap gap-3"><Button disabled={busy || !missed.length} onClick={() => void start(missed)}>Retry missed questions</Button><Button variant="outline" disabled={busy || !followUp.length} onClick={() => void start(followUp)}>Practice these topics</Button></div>;
}

export function StudyTutorial() {
  const [open, setOpen] = useState(false);
  return <Card><CardHeader><CardTitle>Study walkthrough</CardTitle></CardHeader><CardContent><Button variant="outline" onClick={() => setOpen(!open)} aria-expanded={open}>{open ? "Close walkthrough" : "Show study walkthrough"}</Button>{open && <ol className="mt-4 list-decimal space-y-3 pl-5 text-sm leading-6"><li>Set your daily time, pace and target exam date. Start a short block from your personal plan.</li><li>Tap an answer to submit it immediately. Cross out choices with the adjacent X. Skip replaces an unanswered question without grading it.</li><li>Use the three-dot question menu for flags, notes, read aloud and reports. Open the full explanation when you want more detail.</li><li>Use Previous, Next or the numbered navigator to revisit questions. Finished sessions offer missed-question retries and related topics.</li><li>Download offline study below while connected. Answers save in this browser and sync when you reconnect. Keep this browser’s site data until pending work has synced.</li></ol>}</CardContent></Card>;
}
