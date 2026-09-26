"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { ArrowRight, BookOpen, CheckCircle2, Clock3, Flame, Play, Target, Trash2 } from "lucide-react";
import { AccuracyTrendCard } from "@/components/accuracy-trend-card";
import { PersonalStudyCard } from "@/components/study-tools";
import { useStudy } from "@/components/study-provider";
import { makeStudySession, studyStatistics } from "@/lib/study-core";
import { saveStudy } from "@/lib/study-store";
import { useStudyNavigation } from "@/lib/study-navigation";
import { StudyActivityCard } from "@/components/study-activity-card";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import type { DashboardStats, Profile, Session, Subject, Topic } from "@/lib/types";
import { torontoDateKey } from "@/lib/utils";

const pctOf = (correct: number, attempted: number) => (attempted ? Math.round((correct / attempted) * 100) : 0);
const relativeDay = (iso: string, referenceDate: string) => {
  const days = Math.round((Date.parse(`${referenceDate}T12:00:00Z`) - Date.parse(`${torontoDateKey(iso)}T12:00:00Z`)) / 86400000);
  return days <= 0 ? "Today" : days === 1 ? "Yesterday" : `${days} days ago`;
};
const minutes = (ms?: number) => (ms ? `${Math.max(1, Math.round(ms / 60000))} min` : "Not available");

export function DashboardView({ stats: initialStats, subjects, topics, recentSessions: initialSessions, userName, examName }: { stats: DashboardStats; subjects: Subject[]; topics: Topic[]; recentSessions: Session[]; userName?: string; examName?: string; profile?: Profile }) {
  const { snapshot } = useStudy();
  const navigate = useStudyNavigation();
  const [practicingTopic, setPracticingTopic] = useState<string | null>(null);
  const practiceBusy = useRef(false);
  const [sessionToRemove, setSessionToRemove] = useState<Session | null>(null);
  const [removing, setRemoving] = useState(false);
  const removeBusy = useRef(false);
  const local = snapshot ? studyStatistics(snapshot) : null;
  const stats = local?.stats ?? initialStats;
  const subjectsByAccuracy = [...stats.subjects].sort((a, b) => pctOf(b.correct, b.attempted) - pctOf(a.correct, a.attempted));
  const sessions = local?.sessions ?? initialSessions;
  const recentSessions = sessions.slice(0, 4);
  const availableIds = snapshot ? new Set(snapshot.questions.map((question) => question.id)) : null;
  const unfinishedSessions = sessions.filter((session) => !session.finishedAt && session.questionIds.length > 0 && (!availableIds || session.questionIds.every((id) => availableIds.has(id)))).sort((a, b) => Number((b.attempted ?? 0) > 0) - Number((a.attempted ?? 0) > 0) || b.createdAt.localeCompare(a.createdAt));
  const activeSession = unfinishedSessions[0];
  const sessionPosition = (session: Session) => Math.min(session.questionIds.length, (snapshot?.sessions[session.id]?.cursor ?? session.currentIndex ?? 0) + 1);
  const sessionHref = (session: Session) => `/session/${session.id}?mode=${session.mode}`;
  const accuracy = pctOf(stats.correct, stats.attempted);
  const referenceDate = stats.activity.at(-1)?.date ?? torontoDateKey();
  const today = new Intl.DateTimeFormat("en-CA", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" }).format(new Date(`${referenceDate}T12:00:00Z`));
  const firstName = (userName ?? "").split(" ")[0];
  const topicName = (id: string) => topics.find((topic) => topic.id === id)?.name ?? id;
  const subjectName = (id: string) => subjects.find((subject) => subject.id === id)?.name ?? id;
  const practiceTopic = async (topicId: string) => {
    if (!snapshot || practiceBusy.current) return;
    practiceBusy.current = true; setPracticingTopic(topicId);
    try {
      const session = makeStudySession(snapshot, { mode: "tutor", count: 20, filters: { subjectIds: [], topicIds: [topicId], status: "all" } }, crypto.randomUUID());
      await saveStudy({ kind: "session", session });
      navigate(`/session/${session.id}?mode=tutor`);
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not start topic practice. Please try again."); }
    finally { practiceBusy.current = false; setPracticingTopic(null); }
  };

  const removeSession = async () => {
    if (!sessionToRemove || !snapshot || removeBusy.current) return;
    removeBusy.current = true; setRemoving(true);
    try {
      await saveStudy({ kind: "remove-session", sessionId: sessionToRemove.id });
      setSessionToRemove(null);
      toast.success("Session removed. Your question progress is kept.");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not remove this session. Please try again."); }
    finally { removeBusy.current = false; setRemoving(false); }
  };
  const removeButton = (session: Session) => <Button variant="ghost" size="icon" className="shrink-0 text-muted-foreground hover:text-destructive" aria-label={`Remove session with ${session.attempted ?? 0} of ${session.questionIds.length} answered`} title="Remove session, keep question progress" disabled={!snapshot || removing} onClick={() => setSessionToRemove(session)}><Trash2 aria-hidden="true" className="size-4" /></Button>;

  return (
    <div className="mx-auto max-w-[1500px] px-4 py-6 sm:px-6 md:px-8 md:py-8">
      <Dialog open={sessionToRemove !== null} onOpenChange={(open) => { if (!open && !removeBusy.current) setSessionToRemove(null); }}>
        <DialogContent showCloseButton={!removing}>
          <DialogHeader><DialogTitle>Remove this session?</DialogTitle><DialogDescription>Your answers, question status, statistics, notes, and flags will be kept. Unanswered questions will remain available for new sessions.</DialogDescription></DialogHeader>
          <DialogFooter><Button variant="outline" disabled={removing} onClick={() => setSessionToRemove(null)}>Keep session</Button><Button variant="destructive" disabled={removing} onClick={() => void removeSession()}>{removing ? "Removing…" : "Remove session"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
      <PageHeader eyebrow={examName ? `${today} · ${examName}` : today} title={firstName ? `Welcome back, ${firstName}` : "Welcome back"} description={stats.attempted ? "You are building real momentum. Keep the next session focused and manageable." : "Start with a short tutor session to get your first numbers on the board."} action={<Link href={activeSession ? sessionHref(activeSession) : "/create"} className={buttonVariants({ size: "lg", className: "h-10 bg-emerald-800 px-4 hover:bg-emerald-900" })}><Play className="fill-current" />{activeSession ? "Resume session" : "Start practicing"}</Link>} />
      {activeSession && <Card className="mb-5 border-emerald-300 bg-emerald-50/60 dark:border-emerald-800 dark:bg-emerald-950/30" role="region" aria-labelledby="resume-session-heading">
        <CardContent className="space-y-4 p-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div><h2 id="resume-session-heading" className="text-lg font-semibold">Continue where you left off</h2><p className="mt-1 text-sm text-muted-foreground">{activeSession.mode === "timed" ? "Timed" : "Tutor"} practice · {activeSession.attempted ?? 0} of {activeSession.questionIds.length} answered · Question {sessionPosition(activeSession)}</p><p className="mt-1 text-sm text-muted-foreground">Your saved answers and place in this session are kept.</p></div>
            <div className="flex flex-wrap gap-2"><Link href={sessionHref(activeSession)} className={buttonVariants({ className: "h-10 bg-emerald-800 px-4 text-white hover:bg-emerald-900" })}>Continue session<ArrowRight /></Link><Link href="/create" className={buttonVariants({ variant: "outline", className: "h-10" })}>New session</Link>{removeButton(activeSession)}</div>
          </div>
          {unfinishedSessions.length > 1 && <details className="border-t border-emerald-200 pt-3 dark:border-emerald-800"><summary className="cursor-pointer text-sm font-medium">Other unfinished sessions ({unfinishedSessions.length - 1})</summary><ul className="mt-2 divide-y">{unfinishedSessions.slice(1).map((session) => <li key={session.id} className="flex items-center gap-1"><Link href={sessionHref(session)} className="flex min-w-0 flex-1 flex-wrap items-center justify-between gap-2 rounded-lg px-2 py-3 text-sm hover:bg-emerald-100 dark:hover:bg-emerald-900"><span>{session.mode === "timed" ? "Timed" : "Tutor"} practice · {session.attempted ?? 0} of {session.questionIds.length} answered · {relativeDay(session.createdAt, referenceDate)}</span><span className="inline-flex items-center gap-1 font-medium">Resume<ArrowRight className="size-4" /></span></Link>{removeButton(session)}</li>)}</ul></details>}
        </CardContent>
      </Card>}
      <PersonalStudyCard />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="sm:row-span-2"><CardHeader className="pb-0"><CardTitle className="text-sm font-medium text-muted-foreground">Overall accuracy</CardTitle></CardHeader><CardContent className="flex h-[224px] flex-col items-center justify-center"><div className="relative grid size-36 place-items-center rounded-full" style={{ background: `conic-gradient(#059669 ${accuracy * 3.6}deg, color-mix(in oklch, var(--muted) 90%, transparent) 0)` }}><div className="grid size-[116px] place-items-center rounded-full bg-card text-center"><div><p className="text-3xl font-semibold tracking-tight">{accuracy}%</p><p className="text-xs text-muted-foreground">{stats.correct} correct</p></div></div></div><p className="mt-4 text-xs text-muted-foreground">Across all attempted questions</p></CardContent></Card>
        {[{ icon: CheckCircle2, label: "Questions done", value: stats.attempted.toLocaleString(), detail: `${pctOf(stats.attempted, stats.totalQuestions)}% of the bank`, color: "text-emerald-600" }, { icon: BookOpen, label: "Remaining", value: (stats.totalQuestions - stats.attempted).toLocaleString(), detail: `of ${stats.totalQuestions.toLocaleString()} total`, color: "text-cyan-600" }, { icon: Flame, label: "Current streak", value: `${stats.streakDays} ${stats.streakDays === 1 ? "day" : "days"}`, detail: stats.streakDays ? "Keep it going" : "Practice today to start one", color: "text-orange-500" }].map(({ icon: Icon, label, value, detail, color }) => <Card key={label}><CardContent className="flex items-start justify-between p-5"><div><p className="text-sm text-muted-foreground">{label}</p><p className="mt-2 text-2xl font-semibold tracking-tight">{value}</p><p className="mt-1 text-xs text-muted-foreground">{detail}</p></div><div className={`grid size-9 place-items-center rounded-xl bg-muted ${color}`}><Icon className="size-[18px]" /></div></CardContent></Card>)}
        <AccuracyTrendCard activity={stats.activity} />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[1.35fr_.65fr]">
        <StudyActivityCard activity={stats.activity} />
        <Card><CardHeader><CardTitle className="text-base">Weakest topics</CardTitle><p className="text-xs text-muted-foreground">Prioritize these next</p></CardHeader><CardContent className="space-y-4">{stats.weakestTopics.length === 0 && <p className="text-sm text-muted-foreground">Answer a few questions and your weakest topics will show up here.</p>}{stats.weakestTopics.map((topic, index) => { const pct = pctOf(topic.correct, topic.attempted); return <div key={topic.topicId} className="flex items-center gap-3"><span className="grid size-7 place-items-center rounded-lg bg-amber-50 text-xs font-semibold text-amber-700 dark:bg-amber-950 dark:text-amber-300">{index + 1}</span><div className="min-w-0 flex-1"><div className="flex justify-between gap-2"><p className="truncate text-sm font-medium">{topicName(topic.topicId)}</p><span className="text-sm font-semibold text-amber-700 dark:text-amber-400">{pct}%</span></div><p className="text-xs text-muted-foreground">{topic.attempted} attempted</p></div><Button variant="outline" size="sm" aria-label={`Practice ${topicName(topic.topicId)}`} title="Start up to 20 tutor questions from this topic" disabled={!snapshot || practicingTopic !== null} onClick={() => void practiceTopic(topic.topicId)}>{practicingTopic === topic.topicId ? "Starting…" : "Practice"}<ArrowRight className="size-3.5" /></Button></div>})}<Link href="/stats" className="inline-flex items-center gap-1 text-sm font-medium text-emerald-700 dark:text-emerald-400">View all analytics <ArrowRight className="size-4" /></Link></CardContent></Card>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[.85fr_1.15fr]">
        <Card><CardHeader><CardTitle className="text-base">Subject performance</CardTitle><p className="text-xs text-muted-foreground">Accuracy by major discipline</p></CardHeader><CardContent className="space-y-5">{subjectsByAccuracy.length === 0 && <p className="text-sm text-muted-foreground">No attempts yet.</p>}{subjectsByAccuracy.map((subject) => { const pct = pctOf(subject.correct, subject.attempted); const name = subjectName(subject.subjectId); return <div key={subject.subjectId}><div className="mb-2 flex items-center justify-between"><span className="text-sm font-medium">{name}</span><span className="text-xs text-muted-foreground">{pct}% · {subject.attempted} done</span></div><Progress value={pct} aria-label={`${name} accuracy`} className="h-2" /></div>})}</CardContent></Card>
        <Card><CardHeader className="flex-row items-center justify-between"><div><CardTitle className="text-base">Recent sessions</CardTitle><p className="text-xs text-muted-foreground">Your last four practice blocks</p></div><Clock3 className="size-4 text-muted-foreground" /></CardHeader><CardContent className="p-0"><div className="divide-y">{recentSessions.length === 0 && <p className="px-6 py-6 text-sm text-muted-foreground">Your sessions will appear here.</p>}{recentSessions.map((session) => { const complete = Boolean(session.finishedAt); return <div key={session.id} className="flex items-center pr-4"><Link href={complete ? `/session/${session.id}/review` : `/session/${session.id}`} className="flex min-w-0 flex-1 items-center justify-between gap-3 px-6 py-4 transition-colors hover:bg-muted/60"><div className="flex min-w-0 items-center gap-3"><div className="grid size-9 place-items-center rounded-xl bg-muted"><Target className="size-4 text-emerald-600" /></div><div><div className="flex items-center gap-2"><p className="text-sm font-medium">{session.mode === "timed" ? "Timed" : "Tutor"} practice</p>{!complete && <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200">Resume</Badge>}</div><p className="text-xs text-muted-foreground">{session.questionIds.length} questions · {relativeDay(session.createdAt, referenceDate)}</p></div></div><div className="text-right"><p className="text-sm font-semibold">{session.attempted ? `${pctOf(session.correct ?? 0, session.attempted)}%` : complete ? "Not scored" : `${(session.currentIndex ?? 0) + 1}/${session.questionIds.length}`}</p><p className="text-xs text-muted-foreground">{complete ? minutes(session.durationMs) : "In progress"}</p></div></Link>{removeButton(session)}</div>; })}</div></CardContent></Card>
      </div>
    </div>
  );
}
