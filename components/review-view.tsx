"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowLeft, CheckCircle2, Clock3, RotateCcw, Target, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { Attempt, Question, Session, Topic } from "@/lib/types";
import { readDemoPractice } from "@/lib/demo-practice";

export function ReviewView({ session, questions, attempts, topics }: { session: Session; questions: Question[]; attempts: Attempt[]; topics: Topic[] }) {
  const [effectiveAttempts, setEffectiveAttempts] = useState(attempts);
  useEffect(() => {
    if (session.id !== "demo") return;
    const timer = window.setTimeout(() => {
      const saved = readDemoPractice(session.mode);
      if (saved) setEffectiveAttempts(saved.attempts);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [session.id, session.mode]);
  const byQuestion = new Map(effectiveAttempts.map((attempt) => [attempt.questionId, attempt]));
  const results = questions.map((question) => byQuestion.get(question.id)).filter((attempt): attempt is Attempt => Boolean(attempt));
  const answered = results.filter((attempt) => attempt.chosenIdx !== null);
  const correct = results.filter((attempt) => attempt.correct).length;
  const incorrect = results.length - correct;
  const score = questions.length ? Math.round(correct / questions.length * 100) : 0;
  const avgTime = Math.round(results.reduce((sum, attempt) => sum + attempt.timeMs, 0) / Math.max(1, results.length) / 1000);
  const totalMinutes = Math.round(results.reduce((sum, attempt) => sum + attempt.timeMs, 0) / 60000);
  const topicName = (id: string) => topics.find((topic) => topic.id === id)?.name ?? id;
  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 md:px-8 md:py-8">
      <Link href="/dashboard" className="mb-6 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" />Back to dashboard</Link>
      <div className="overflow-hidden rounded-3xl bg-slate-950 p-6 text-white sm:p-8"><div className="grid items-center gap-8 md:grid-cols-[1fr_auto]"><div><Badge className="bg-emerald-400/15 text-emerald-300">Session complete</Badge><h1 className="mt-4 text-3xl font-semibold tracking-[-0.04em] sm:text-4xl">Strong work. Review what moved the needle.</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400">Your results are organized below so you can revisit missed and flagged questions while the session is fresh.</p></div><div className="relative grid size-40 place-items-center rounded-full" style={{ background: `conic-gradient(#34d399 ${score * 3.6}deg, rgba(255,255,255,.1) 0)` }}><div className="grid size-[130px] place-items-center rounded-full bg-slate-950 text-center"><div><p className="text-4xl font-semibold">{score}%</p><p className="text-xs text-slate-400">{correct} of {questions.length}</p></div></div></div></div></div>
      <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{[{ icon: CheckCircle2, label: "Correct", value: correct, color: "text-emerald-600" }, { icon: XCircle, label: "Incorrect", value: incorrect, color: "text-red-500" }, { icon: Clock3, label: "Average time", value: `${avgTime} sec`, color: "text-cyan-600" }, { icon: Target, label: "Total time", value: `${totalMinutes} min`, color: "text-violet-600" }].map(({ icon: Icon, label, value, color }) => <Card key={label}><CardContent className="flex items-center gap-4 p-5"><div className={`grid size-10 place-items-center rounded-xl bg-muted ${color}`}><Icon className="size-5" /></div><div><p className="text-sm text-muted-foreground">{label}</p><p className="text-xl font-semibold">{value}</p></div></CardContent></Card>)}</div>
      <Card className="mt-5"><CardHeader className="flex-row items-center justify-between"><div><CardTitle className="text-lg">Question breakdown</CardTitle><p className="mt-1 text-xs text-muted-foreground">{answered.length} answered · {questions.length - answered.length} unanswered</p></div><Link href={`/session/${session.id}?${session.id === "demo" ? `mode=${session.mode}&` : ""}q=1&review=1`} className={buttonVariants({ variant: "outline" })}><RotateCcw />Review all</Link></CardHeader><CardContent className="p-0"><div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead className="w-16 pl-6">#</TableHead><TableHead>Topic</TableHead><TableHead>Your answer</TableHead><TableHead>Correct</TableHead><TableHead>Time</TableHead><TableHead className="pr-6 text-right">Result</TableHead></TableRow></TableHeader><TableBody>{questions.map((question, index) => { const attempt = byQuestion.get(question.id); const chosen = attempt?.chosenIdx; return <TableRow key={question.id} className="hover:bg-muted/50"><TableCell className="pl-6"><Link href={`/session/${session.id}?${session.id === "demo" ? `mode=${session.mode}&` : ""}q=${index + 1}&review=1${chosen === null || chosen === undefined ? "" : `&chosen=${chosen}`}`} className="font-medium text-emerald-700 hover:underline dark:text-emerald-400">{index + 1}</Link></TableCell><TableCell><p className="min-w-32 text-sm font-medium">{topicName(question.topicId)}</p></TableCell><TableCell className="text-sm">{chosen === null || chosen === undefined ? <span className="text-muted-foreground">Skipped</span> : `${String.fromCharCode(65 + chosen)}. ${question.options[chosen]?.slice(0, 28)}`}</TableCell><TableCell className="text-sm">{String.fromCharCode(65 + question.answerIdx)}. {question.options[question.answerIdx].slice(0, 28)}</TableCell><TableCell className="text-sm text-muted-foreground">{Math.round((attempt?.timeMs ?? 0) / 1000)} sec</TableCell><TableCell className="pr-6 text-right">{attempt?.correct ? <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"><CheckCircle2 />Correct</Badge> : attempt ? <Badge className="bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300"><XCircle />{chosen === null ? "Skipped" : "Incorrect"}</Badge> : <Badge variant="secondary">Unanswered</Badge>}</TableCell></TableRow>})}</TableBody></Table></div></CardContent></Card>
      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:justify-end"><Link href="/create" className={buttonVariants({ variant: "outline", size: "lg" })}>Build another session</Link><Link href="/dashboard" className={buttonVariants({ size: "lg", className: "bg-emerald-800 hover:bg-emerald-900" })}>Return to dashboard</Link></div>
    </div>
  );
}
