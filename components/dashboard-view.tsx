"use client";

import Link from "next/link";
import { ArrowRight, BookOpen, CheckCircle2, Clock3, Flame, Play, Target } from "lucide-react";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis } from "recharts";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import type { DashboardStats, Session, Subject, Topic } from "@/lib/types";

const pctOf = (correct: number, attempted: number) => (attempted ? Math.round((correct / attempted) * 100) : 0);
const torontoDateKey = (iso: string) => {
  const parts = new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: "America/Toronto" }).formatToParts(new Date(iso));
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
};
const relativeDay = (iso: string, referenceDate: string) => {
  const days = Math.round((Date.parse(`${referenceDate}T12:00:00Z`) - Date.parse(`${torontoDateKey(iso)}T12:00:00Z`)) / 86400000);
  return days <= 0 ? "Today" : days === 1 ? "Yesterday" : `${days} days ago`;
};
const minutes = (ms?: number) => (ms ? `${Math.max(1, Math.round(ms / 60000))} min` : "Not available");

export function DashboardView({ stats, subjects, topics, recentSessions, userName }: { stats: DashboardStats; subjects: Subject[]; topics: Topic[]; recentSessions: Session[]; userName?: string }) {
  const accuracy = pctOf(stats.correct, stats.attempted);
  const last12Weeks = stats.activity.slice(-84);
  const recentTotal = last12Weeks.reduce((sum, day) => sum + day.attempted, 0);
  const byWeekday = last12Weeks.reduce((acc, day) => { const d = new Date(day.date + "T12:00:00").getDay(); acc[d] = (acc[d] ?? 0) + day.attempted; return acc; }, {} as Record<number, number>);
  const bestDay = recentTotal ? ["Sundays", "Mondays", "Tuesdays", "Wednesdays", "Thursdays", "Fridays", "Saturdays"][Number(Object.entries(byWeekday).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 0)] : null;
  const referenceDate = stats.activity.at(-1)?.date ?? "2026-01-01";
  const today = new Intl.DateTimeFormat("en-CA", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" }).format(new Date(`${referenceDate}T12:00:00Z`));
  const firstName = (userName ?? "").split(" ")[0];
  const topicName = (id: string) => topics.find((topic) => topic.id === id)?.name ?? id;
  const subjectName = (id: string) => subjects.find((subject) => subject.id === id)?.name ?? id;
  const activityLine = stats.activity.slice(-28).map((day) => ({ ...day, accuracy: day.attempted ? Math.round((day.correct / day.attempted) * 100) : 0 }));
  const heat = (count: number) => count === 0 ? "bg-muted" : count < 7 ? "bg-emerald-200 dark:bg-emerald-950" : count < 14 ? "bg-emerald-400 dark:bg-emerald-700" : count < 21 ? "bg-emerald-500" : "bg-emerald-700 dark:bg-emerald-400";

  return (
    <div className="mx-auto max-w-[1500px] px-4 py-6 sm:px-6 md:px-8 md:py-8">
      <PageHeader eyebrow={today} title={firstName ? `Welcome back, ${firstName}` : "Welcome back"} description={stats.attempted ? "You are building real momentum. Keep the next session focused and manageable." : "Start with a short tutor session to get your first numbers on the board."} action={<Link href="/create" className={buttonVariants({ size: "lg", className: "h-10 bg-emerald-800 px-4 hover:bg-emerald-900" })}><Play className="fill-current" />Start practicing</Link>} />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="sm:row-span-2"><CardHeader className="pb-0"><CardTitle className="text-sm font-medium text-muted-foreground">Overall accuracy</CardTitle></CardHeader><CardContent className="flex h-[224px] flex-col items-center justify-center"><div className="relative grid size-36 place-items-center rounded-full" style={{ background: `conic-gradient(#059669 ${accuracy * 3.6}deg, color-mix(in oklch, var(--muted) 90%, transparent) 0)` }}><div className="grid size-[116px] place-items-center rounded-full bg-card text-center"><div><p className="text-3xl font-semibold tracking-tight">{accuracy}%</p><p className="text-xs text-muted-foreground">{stats.correct} correct</p></div></div></div><p className="mt-4 text-xs text-muted-foreground">Across all attempted questions</p></CardContent></Card>
        {[{ icon: CheckCircle2, label: "Questions done", value: stats.attempted.toLocaleString(), detail: `${pctOf(stats.attempted, stats.totalQuestions)}% of the bank`, color: "text-emerald-600" }, { icon: BookOpen, label: "Remaining", value: (stats.totalQuestions - stats.attempted).toLocaleString(), detail: `of ${stats.totalQuestions.toLocaleString()} total`, color: "text-cyan-600" }, { icon: Flame, label: "Current streak", value: `${stats.streakDays} ${stats.streakDays === 1 ? "day" : "days"}`, detail: stats.streakDays ? "Keep it going" : "Practice today to start one", color: "text-orange-500" }].map(({ icon: Icon, label, value, detail, color }) => <Card key={label}><CardContent className="flex items-start justify-between p-5"><div><p className="text-sm text-muted-foreground">{label}</p><p className="mt-2 text-2xl font-semibold tracking-tight">{value}</p><p className="mt-1 text-xs text-muted-foreground">{detail}</p></div><div className={`grid size-9 place-items-center rounded-xl bg-muted ${color}`}><Icon className="size-[18px]" /></div></CardContent></Card>)}
        <Card className="sm:col-span-2 xl:col-span-3"><CardHeader className="flex-row items-center justify-between pb-2"><div><CardTitle className="text-base">Accuracy trend</CardTitle><p className="mt-1 text-xs text-muted-foreground">Last 28 study days</p></div><Badge variant="secondary">{accuracy}% overall</Badge></CardHeader><CardContent className="h-[130px] pt-1"><ResponsiveContainer width="100%" height="100%"><AreaChart data={activityLine}><defs><linearGradient id="dashboardFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#10b981" stopOpacity={0.35} /><stop offset="100%" stopColor="#10b981" stopOpacity={0} /></linearGradient></defs><XAxis dataKey="date" hide /><Tooltip contentStyle={{ borderRadius: 12, fontSize: 12 }} formatter={(value) => [`${value}%`, "Accuracy"]} /><Area type="monotone" dataKey="accuracy" stroke="#059669" fill="url(#dashboardFill)" strokeWidth={2.5} dot={false} /></AreaChart></ResponsiveContainer></CardContent></Card>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[1.35fr_.65fr]">
        <Card><CardHeader className="flex-row items-center justify-between"><div><CardTitle className="text-base">Study activity</CardTitle><p className="mt-1 text-xs text-muted-foreground">Questions attempted over the last 12 weeks</p></div><div className="hidden items-center gap-1.5 text-[10px] text-muted-foreground sm:flex"><span>Less</span>{["bg-muted", "bg-emerald-200", "bg-emerald-400", "bg-emerald-600"].map((color) => <span key={color} className={`size-3 rounded-[3px] ${color}`} />)}<span>More</span></div></CardHeader><CardContent><div className="overflow-x-auto pb-1"><div className="grid min-w-[620px] grid-flow-col grid-rows-7 gap-1.5">{stats.activity.map((day) => <span key={day.date} title={`${day.date}: ${day.attempted} questions`} className={`aspect-square rounded-[4px] ${heat(day.attempted)}`} />)}</div></div><div className="mt-4 flex items-center justify-between text-xs text-muted-foreground"><span>{recentTotal.toLocaleString()} questions in the last 12 weeks</span><span className="font-medium text-foreground">{bestDay ? `Most active on ${bestDay}` : "No activity yet"}</span></div></CardContent></Card>
        <Card><CardHeader><CardTitle className="text-base">Weakest topics</CardTitle><p className="text-xs text-muted-foreground">Prioritize these next</p></CardHeader><CardContent className="space-y-4">{stats.weakestTopics.length === 0 && <p className="text-sm text-muted-foreground">Answer a few questions and your weakest topics will show up here.</p>}{stats.weakestTopics.map((topic, index) => { const pct = pctOf(topic.correct, topic.attempted); return <div key={topic.topicId} className="flex items-center gap-3"><span className="grid size-7 place-items-center rounded-lg bg-amber-50 text-xs font-semibold text-amber-700 dark:bg-amber-950 dark:text-amber-300">{index + 1}</span><div className="min-w-0 flex-1"><div className="flex justify-between gap-2"><p className="truncate text-sm font-medium">{topicName(topic.topicId)}</p><span className="text-sm font-semibold text-amber-700 dark:text-amber-400">{pct}%</span></div><p className="text-xs text-muted-foreground">{topic.attempted} attempted</p></div></div>})}<Link href="/stats" className="inline-flex items-center gap-1 text-sm font-medium text-emerald-700 dark:text-emerald-400">View all analytics <ArrowRight className="size-4" /></Link></CardContent></Card>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[.85fr_1.15fr]">
        <Card><CardHeader><CardTitle className="text-base">Subject performance</CardTitle><p className="text-xs text-muted-foreground">Accuracy by major discipline</p></CardHeader><CardContent className="space-y-5">{stats.subjects.length === 0 && <p className="text-sm text-muted-foreground">No attempts yet.</p>}{stats.subjects.map((subject) => { const pct = pctOf(subject.correct, subject.attempted); const name = subjectName(subject.subjectId); return <div key={subject.subjectId}><div className="mb-2 flex items-center justify-between"><span className="text-sm font-medium">{name}</span><span className="text-xs text-muted-foreground">{pct}% · {subject.attempted} done</span></div><Progress value={pct} aria-label={`${name} accuracy`} className="h-2" /></div>})}</CardContent></Card>
        <Card><CardHeader className="flex-row items-center justify-between"><div><CardTitle className="text-base">Recent sessions</CardTitle><p className="text-xs text-muted-foreground">Your last four practice blocks</p></div><Clock3 className="size-4 text-muted-foreground" /></CardHeader><CardContent className="p-0"><div className="divide-y">{recentSessions.length === 0 && <p className="px-6 py-6 text-sm text-muted-foreground">Your sessions will appear here.</p>}{recentSessions.map((session) => { const complete = Boolean(session.finishedAt); return <Link href={complete ? `/session/${session.id}/review` : `/session/${session.id}`} key={session.id} className="flex items-center justify-between gap-3 px-6 py-4 transition-colors hover:bg-muted/60"><div className="flex min-w-0 items-center gap-3"><div className="grid size-9 place-items-center rounded-xl bg-muted"><Target className="size-4 text-emerald-600" /></div><div><div className="flex items-center gap-2"><p className="text-sm font-medium">{session.mode === "timed" ? "Timed" : "Tutor"} practice</p>{!complete && <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200">Resume</Badge>}</div><p className="text-xs text-muted-foreground">{session.questionIds.length} questions · {relativeDay(session.createdAt, referenceDate)}</p></div></div><div className="text-right"><p className="text-sm font-semibold">{session.attempted ? `${pctOf(session.correct ?? 0, session.attempted)}%` : complete ? "Not scored" : `${(session.currentIndex ?? 0) + 1}/${session.questionIds.length}`}</p><p className="text-xs text-muted-foreground">{complete ? minutes(session.durationMs) : "In progress"}</p></div></Link>; })}</div></CardContent></Card>
      </div>
    </div>
  );
}
