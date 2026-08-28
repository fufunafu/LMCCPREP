"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createSession } from "@/lib/actions";
import { ChevronDown, ChevronRight, Clock3, Info, Play, Sparkles } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Slider } from "@/components/ui/slider";
import { cn, DEFAULT_SECONDS_PER_QUESTION } from "@/lib/utils";
import type { Exam, QuestionStatus, SessionMode, Subject, Topic } from "@/lib/types";

const statusOptions: { value: QuestionStatus | "all"; label: string; detail: string }[] = [
  { value: "unused", label: "Unused", detail: "Questions you have not seen" },
  { value: "incorrect", label: "Incorrect", detail: "Revisit missed questions" },
  { value: "flagged", label: "Flagged", detail: "Your saved questions" },
  { value: "all", label: "All", detail: "Mix every question status" },
];

export function CreateSession({ subjects: allSubjects, topics, exam }: { subjects: Subject[]; topics: Topic[]; exam?: Exam }) {
  const router = useRouter();
  const pace = exam?.secondsPerQuestion ?? DEFAULT_SECONDS_PER_QUESTION;
  const maxCount = exam?.sectionSize ?? 115;
  const subjects = allSubjects.filter((subject) => subject.questionCount > 0);
  const [pending, startTransition] = useTransition();
  const [mode, setMode] = useState<SessionMode>("tutor");
  const [selected, setSelected] = useState<string[]>(subjects.map((subject) => subject.id));
  const [expanded, setExpanded] = useState<string[]>([]);
  const [selectedTopics, setSelectedTopics] = useState<string[]>(topics.map((topic) => topic.id));
  const [status, setStatus] = useState<QuestionStatus | "all">("unused");
  const [count, setCount] = useState(20);
  const topicsInScope = useMemo(() => topics.filter((topic) => selected.includes(topic.subjectId)), [selected, topics]);
  const selectedTopicsInScope = useMemo(() => topicsInScope.filter((topic) => selectedTopics.includes(topic.id)), [selectedTopics, topicsInScope]);
  const available = useMemo(() => selectedTopicsInScope.reduce((sum, topic) => sum + topic.questionCount, 0), [selectedTopicsInScope]);

  const toggleSubject = (id: string) => {
    const add = !selected.includes(id);
    setSelected((current) => add ? [...current, id] : current.filter((value) => value !== id));
    const childIds = topics.filter((topic) => topic.subjectId === id).map((topic) => topic.id);
    setSelectedTopics((current) => add ? Array.from(new Set([...current, ...childIds])) : current.filter((value) => !childIds.includes(value)));
  };

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 md:px-8 md:py-8">
      <PageHeader eyebrow="Session builder" title="Create a practice session" description="Choose what to study, how you want feedback, and the length that fits your day." />
      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        <div className="space-y-5">
          <Card><CardHeader><CardTitle className="flex items-center gap-2 text-base"><span className="grid size-7 place-items-center rounded-lg bg-emerald-50 text-xs font-semibold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">1</span>Choose your mode</CardTitle></CardHeader><CardContent className="grid gap-3 sm:grid-cols-2">{[{ value: "tutor" as const, icon: Sparkles, title: "Tutor mode", copy: "See the answer and explanation after every question." }, { value: "timed" as const, icon: Clock3, title: "Timed mode", copy: `Use the current exam pace of ${pace} seconds per question.` }].map(({ value, icon: Icon, title, copy }) => <button type="button" key={value} aria-pressed={mode === value} onClick={() => setMode(value)} className={cn("rounded-2xl border p-4 text-left transition-all", mode === value ? "border-emerald-500 bg-emerald-50/70 ring-2 ring-emerald-500/15 dark:bg-emerald-950/30" : "hover:border-slate-300 hover:bg-muted/40")}><div className="flex items-center justify-between"><div className={cn("grid size-9 place-items-center rounded-xl", mode === value ? "bg-emerald-800 text-white" : "bg-muted text-muted-foreground")}><Icon className="size-[18px]" /></div><span aria-hidden="true" className={cn("size-4 rounded-full border-2", mode === value && "border-[5px] border-emerald-700")} /></div><p className="mt-4 text-sm font-semibold">{title}</p><p className="mt-1 text-xs leading-5 text-muted-foreground">{copy}</p></button>)}</CardContent></Card>

          <Card><CardHeader><CardTitle className="flex items-center gap-2 text-base"><span className="grid size-7 place-items-center rounded-lg bg-emerald-50 text-xs font-semibold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">2</span>Select subjects and topics</CardTitle></CardHeader><CardContent className="space-y-2">{subjects.map((subject) => { const isExpanded = expanded.includes(subject.id); const childTopics = topics.filter((topic) => topic.subjectId === subject.id); return <div key={subject.id} className="overflow-hidden rounded-xl border"><div className="flex items-center gap-3 p-3.5"><Checkbox id={`subject-${subject.id}`} aria-label={`Include ${subject.name}`} checked={selected.includes(subject.id)} onCheckedChange={() => toggleSubject(subject.id)} /><button type="button" aria-expanded={isExpanded} aria-controls={`topics-${subject.id}`} className="flex min-w-0 flex-1 items-center justify-between text-left" onClick={() => setExpanded((current) => isExpanded ? current.filter((value) => value !== subject.id) : [...current, subject.id])}><span><span className="block text-sm font-medium">{subject.name}</span><span className="text-xs text-muted-foreground">{subject.questionCount} questions</span></span>{isExpanded ? <ChevronDown className="size-4 text-muted-foreground" /> : <ChevronRight className="size-4 text-muted-foreground" />}</button></div>{isExpanded && <div id={`topics-${subject.id}`} className="border-t bg-muted/30 px-4 py-2 pl-11">{childTopics.map((topic) => <label key={topic.id} className="flex cursor-pointer items-center gap-3 py-2.5 text-sm"><Checkbox aria-label={`Include ${topic.name}`} checked={selectedTopics.includes(topic.id)} onCheckedChange={() => setSelectedTopics((current) => current.includes(topic.id) ? current.filter((value) => value !== topic.id) : [...current, topic.id])} /><span className="flex-1">{topic.name}</span><span className="text-xs text-muted-foreground">{topic.questionCount}</span></label>)}</div>}</div>})}</CardContent></Card>

          <Card><CardHeader><CardTitle className="flex items-center gap-2 text-base"><span className="grid size-7 place-items-center rounded-lg bg-emerald-50 text-xs font-semibold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">3</span>Filter by question status</CardTitle></CardHeader><CardContent className="grid gap-2 sm:grid-cols-2">{statusOptions.map((option) => <button type="button" key={option.value} aria-pressed={status === option.value} onClick={() => setStatus(option.value)} className={cn("flex items-center gap-3 rounded-xl border p-3 text-left", status === option.value && "border-emerald-500 bg-emerald-50/70 dark:bg-emerald-950/30")}><span aria-hidden="true" className={cn("size-4 shrink-0 rounded-full border-2", status === option.value && "border-[5px] border-emerald-700")} /><span><span className="block text-sm font-medium">{option.label}</span><span className="text-xs text-muted-foreground">{option.detail}</span></span></button>)}</CardContent></Card>

          <Card><CardHeader><CardTitle className="flex items-center gap-2 text-base"><span className="grid size-7 place-items-center rounded-lg bg-emerald-50 text-xs font-semibold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">4</span>Set session length</CardTitle></CardHeader><CardContent><div className="mb-6 flex items-end justify-between"><div><p className="text-3xl font-semibold">{count}</p><p className="text-xs text-muted-foreground">questions</p></div><p className="text-sm text-muted-foreground">About {Math.round(count * (mode === "timed" ? pace / 60 : 2))} minutes</p></div><Slider aria-label="Number of questions" min={5} max={maxCount} step={5} value={[count]} onValueChange={(value) => setCount(Array.isArray(value) ? value[0] : value)} /><div className="mt-3 flex justify-between text-[11px] text-muted-foreground"><span>5</span><button type="button" className="font-medium text-emerald-700 hover:underline dark:text-emerald-400" onClick={() => setCount(115)}>115-question section simulation</button></div></CardContent></Card>
        </div>

        <aside className="lg:sticky lg:top-8 lg:self-start"><Card className="overflow-hidden"><div className="bg-slate-950 p-5 text-white"><p className="text-xs font-medium uppercase tracking-[0.14em] text-emerald-400">Session summary</p><p className="mt-3 text-2xl font-semibold">{count} questions</p><p className="mt-1 text-sm text-slate-400">{mode === "tutor" ? "Learn as you go" : `${pace} seconds per question, matching current exam pace`}</p></div><CardContent className="space-y-4 p-5"><div className="flex justify-between text-sm"><span className="text-muted-foreground">Mode</span><Badge variant="secondary" className="capitalize">{mode}</Badge></div><div className="flex justify-between text-sm"><span className="text-muted-foreground">Subjects</span><span className="font-medium">{selected.length} selected</span></div><div className="flex justify-between text-sm"><span className="text-muted-foreground">Topics</span><span className="font-medium">{selectedTopicsInScope.length} selected</span></div><div className="flex justify-between text-sm"><span className="text-muted-foreground">Question pool</span><span className="font-medium">{status === "all" ? available.toLocaleString() : `up to ${available.toLocaleString()}`}</span></div><div className="rounded-xl bg-muted p-3 text-xs leading-5 text-slate-700 dark:text-slate-300"><Info className="mb-2 size-4 text-emerald-700 dark:text-emerald-400" />Questions will be sampled from your selected topics using the <span className="font-medium text-foreground">{status}</span> filter.</div>{!available && <p role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">Select at least one topic with available questions.</p>}<Button className="h-11 w-full bg-emerald-800 text-base hover:bg-emerald-900" disabled={!selected.length || !available || pending} onClick={() => startTransition(async () => { const allTopics = topicsInScope.every((topic) => selectedTopics.includes(topic.id)); try { const result = await createSession({ mode, subjectIds: selected, topicIds: allTopics ? [] : selectedTopicsInScope.map((topic) => topic.id), status, count, secondsPerQuestion: pace }); if ("error" in result) toast.error(result.error); else router.push(result.redirectTo); } catch { toast.error("Could not create the session. Check your connection and try again."); } })}>{pending ? "Building session…" : "Start session"} <Play className="fill-current" /></Button></CardContent></Card></aside>
      </div>
    </div>
  );
}
