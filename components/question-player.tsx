"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { finishSession, recordAttempt, reportTypo, saveNote, setSessionProgress, toggleFlag } from "@/lib/actions";
import { Bookmark, Check, ChevronLeft, ChevronRight, Clock3, FileText, Flag, Keyboard, Lightbulb, MenuSquare, MessageSquareWarning, StickyNote, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { readDemoPractice, writeDemoPractice } from "@/lib/demo-practice";
import type { Attempt, Question, Session, Subject, Topic } from "@/lib/types";

const letters = ["A", "B", "C", "D", "E"];

export function QuestionPlayer({ session, questions, subjects, topics, initialFlags = [], initialNotes = {}, initialAttempts = [], showShortcuts = true, explanationAutoScroll = false }: { session: Session; questions: Question[]; subjects: Subject[]; topics: Topic[]; initialFlags?: string[]; initialNotes?: Record<string, string>; initialAttempts?: Attempt[]; showShortcuts?: boolean; explanationAutoScroll?: boolean }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialIndex = Math.max(0, Math.min(questions.length - 1, Number(searchParams.get("q") ?? (session.currentIndex ?? 0) + 1) - 1));
  const reviewMode = searchParams.get("review") === "1";
  const activeMode = searchParams.get("mode") === "timed" ? "timed" : session.mode;
  const isDemo = session.id === "demo";
  const reviewedChoice = searchParams.get("chosen");
  const [index, setIndex] = useState(initialIndex);
  const [flagged, setFlagged] = useState<number[]>(questions.map((q, i) => (initialFlags.includes(q.id) ? i : -1)).filter((i) => i >= 0));
  const [selections, setSelections] = useState<Record<number, number | null>>(() => {
    const values: Record<number, number | null> = {};
    for (const attempt of initialAttempts) {
      const questionIndex = questions.findIndex((item) => item.id === attempt.questionId);
      if (questionIndex >= 0) values[questionIndex] = attempt.chosenIdx;
    }
    if (reviewMode && reviewedChoice !== null && reviewedChoice !== "") values[initialIndex] = Number(reviewedChoice);
    return values;
  });
  const [answers, setAnswers] = useState<Record<number, "correct" | "incorrect">>(() => {
    const values: Record<number, "correct" | "incorrect"> = {};
    for (const attempt of initialAttempts) {
      const questionIndex = questions.findIndex((item) => item.id === attempt.questionId);
      if (questionIndex >= 0) values[questionIndex] = attempt.correct ? "correct" : "incorrect";
    }
    if (reviewMode && reviewedChoice !== null && reviewedChoice !== "") values[initialIndex] = Number(reviewedChoice) === questions[initialIndex].answerIdx ? "correct" : "incorrect";
    return values;
  });
  const [attemptRecords, setAttemptRecords] = useState<Attempt[]>(initialAttempts);
  const [eliminated, setEliminated] = useState<Record<number, number[]>>({});
  const [notes, setNotes] = useState<Record<number, string>>(Object.fromEntries(questions.map((q, i) => [i, initialNotes[q.id] ?? ""]).filter(([, v]) => v)));
  const [notesOpen, setNotesOpen] = useState(false);
  const [demoHydrated, setDemoHydrated] = useState(!isDemo);
  const [elapsed, setElapsed] = useState(0);
  const startedAt = useRef<number | null>(null);
  const explanationRef = useRef<HTMLDivElement>(null);
  const timedExam = activeMode === "timed" && !reviewMode;
  const question = questions[index];
  const selected = selections[index] ?? null;
  const submitted = reviewMode || answers[index] !== undefined;
  const subject = subjects.find((item) => item.id === question.subjectId);
  const topic = topics.find((item) => item.id === question.topicId);
  const isLast = index === questions.length - 1;
  const eliminatedForQuestion = useMemo(() => eliminated[index] ?? [], [eliminated, index]);

  useEffect(() => {
    startedAt.current = Date.now();
  }, []);

  useEffect(() => {
    if (!isDemo) return;
    const timer = window.setTimeout(() => {
      const saved = readDemoPractice(activeMode);
      if (saved) {
        const nextSelections: Record<number, number | null> = {};
        const nextAnswers: Record<number, "correct" | "incorrect"> = {};
        const nextNotes: Record<number, string> = {};
        for (const attempt of saved.attempts) {
          const questionIndex = questions.findIndex((item) => item.id === attempt.questionId);
          if (questionIndex < 0) continue;
          nextSelections[questionIndex] = attempt.chosenIdx;
          nextAnswers[questionIndex] = attempt.correct ? "correct" : "incorrect";
        }
        for (const [id, body] of Object.entries(saved.notes)) {
          const questionIndex = questions.findIndex((item) => item.id === id);
          if (questionIndex >= 0) nextNotes[questionIndex] = body;
        }
        const savedIndex = questions.findIndex((item) => item.id === saved.currentQuestionId);
        if (!reviewMode && savedIndex >= 0) setIndex(savedIndex);
        setAttemptRecords(saved.attempts);
        setSelections(nextSelections);
        setAnswers(nextAnswers);
        setFlagged(saved.flags.map((id) => questions.findIndex((item) => item.id === id)).filter((questionIndex) => questionIndex >= 0));
        setNotes(nextNotes);
      }
      setDemoHydrated(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [activeMode, isDemo, questions, reviewMode]);

  useEffect(() => {
    if (!isDemo || !demoHydrated) return;
    writeDemoPractice({
      mode: activeMode,
      currentQuestionId: questions[index]?.id ?? questions[0].id,
      attempts: attemptRecords,
      flags: flagged.map((questionIndex) => questions[questionIndex]?.id).filter((id): id is string => Boolean(id)),
      notes: Object.fromEntries(Object.entries(notes).map(([questionIndex, body]) => [questions[Number(questionIndex)]?.id, body]).filter(([id]) => Boolean(id))),
    });
  }, [activeMode, attemptRecords, demoHydrated, flagged, index, isDemo, notes, questions]);

  const goTo = useCallback((nextIndex: number) => {
    setIndex(nextIndex);
    setElapsed(0);
    startedAt.current = Date.now();
    if (!reviewMode && !isDemo) setSessionProgress(session.id, nextIndex).catch(() => toast.error("Could not save your place"));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [isDemo, reviewMode, session.id]);

  const endSession = useCallback(async () => {
    if (!reviewMode && !isDemo) {
      try {
        await finishSession(session.id);
      } catch {
        toast.error("Could not finish the session. Check your connection and try again.");
        return;
      }
    }
    router.push(`/session/${session.id}/review${isDemo ? `?mode=${activeMode}` : ""}`);
  }, [activeMode, isDemo, reviewMode, router, session.id]);

  const next = useCallback(() => {
    if (isLast) endSession();
    else goTo(index + 1);
  }, [endSession, goTo, index, isLast]);

  const submit = useCallback((choice: number | null = selected) => {
    if (submitted || (choice === null && activeMode !== "timed")) return;
    const correct = choice === question.answerIdx;
    setSelections((current) => ({ ...current, [index]: choice }));
    setAnswers((current) => ({ ...current, [index]: correct ? "correct" : "incorrect" }));
    const attempt: Attempt = { sessionId: session.id, questionId: question.id, chosenIdx: choice, correct, timeMs: startedAt.current === null ? 0 : Date.now() - startedAt.current, createdAt: new Date().toISOString() };
    setAttemptRecords((current) => [...current.filter((item) => item.questionId !== question.id), attempt]);
    if (!reviewMode && !isDemo) recordAttempt({ sessionId: session.id, qid: question.qid, chosenIdx: choice, timeMs: attempt.timeMs }).catch(() => toast.error("Could not save your answer"));
    if (explanationAutoScroll && !timedExam) window.setTimeout(() => explanationRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 100);
    if (timedExam) window.setTimeout(next, 250);   // exam style: no feedback until the review
  }, [activeMode, explanationAutoScroll, index, isDemo, next, question.answerIdx, question.id, question.qid, reviewMode, selected, session.id, submitted, timedExam]);

  useEffect(() => {
    if (activeMode !== "timed") return;
    const timer = window.setInterval(() => setElapsed((value) => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, [activeMode]);

  // timed mode: auto-submit (as skipped) when the clock runs out
  useEffect(() => {
    if (activeMode !== "timed" || submitted || reviewMode) return;
    if (elapsed < (session.secondsPerQuestion ?? 90)) return;
    const timer = window.setTimeout(() => submit(selected), 0);
    return () => window.clearTimeout(timer);
  }, [activeMode, elapsed, reviewMode, selected, session.secondsPerQuestion, submit, submitted]);

  const saveDemoSnapshot = (nextFlags = flagged) => {
    if (!isDemo) return;
    writeDemoPractice({
      mode: activeMode,
      currentQuestionId: questions[index]?.id ?? questions[0].id,
      attempts: attemptRecords,
      flags: nextFlags.map((questionIndex) => questions[questionIndex]?.id).filter((id): id is string => Boolean(id)),
      notes: Object.fromEntries(Object.entries(notes).map(([questionIndex, body]) => [questions[Number(questionIndex)]?.id, body]).filter(([id]) => Boolean(id))),
    });
  };

  const flagCurrent = () => {
    const nowFlagged = !flagged.includes(index);
    const nextFlagged = nowFlagged ? [...flagged, index] : flagged.filter((value) => value !== index);
    setFlagged(nextFlagged);
    saveDemoSnapshot(nextFlagged);
    if (!isDemo) toggleFlag(question.qid, nowFlagged).catch(() => {
      setFlagged(flagged);
      toast.error("Could not update flag");
    });
  };
  const toggleEliminated = (optionIndex: number) => {
    setEliminated((current) => {
      const currentOptions = current[index] ?? [];
      const isEliminated = currentOptions.includes(optionIndex);
      return { ...current, [index]: isEliminated ? currentOptions.filter((value) => value !== optionIndex) : [...currentOptions, optionIndex] };
    });
    if (selected === optionIndex) setSelections((current) => ({ ...current, [index]: null }));
  };
  const persistNote = async () => {
    try {
      if (isDemo) saveDemoSnapshot();
      else await saveNote(question.qid, notes[index] ?? "");
      toast.success("Note saved");
      setNotesOpen(false);
    } catch {
      toast.error("Could not save note");
    }
  };
  const submitReport = async (text: string) => {
    if (isDemo) { toast.info("Reports are not sent from the demo"); return; }
    try { await reportTypo(question.qid, "stem", text); toast.success("Thanks. Your report was sent"); } catch { toast.error("Could not send report"); }
  };

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.target as HTMLElement).tagName === "TEXTAREA") return;
      const number = Number(event.key);
      if (!submitted && number >= 1 && number <= question.options.length && !eliminatedForQuestion.includes(number - 1)) setSelections((current) => ({ ...current, [index]: number - 1 }));
      if (event.key === "Enter") { event.preventDefault(); if (submitted) next(); else submit(selected); }
      if (event.key.toLowerCase() === "n" && submitted) next();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [eliminatedForQuestion, index, next, question.options.length, selected, submit, submitted]);

  const timerText = useMemo(() => { const remaining = Math.max(0, (session.secondsPerQuestion ?? 90) - elapsed); return `${String(Math.floor(remaining / 60)).padStart(2, "0")}:${String(remaining % 60).padStart(2, "0")}`; }, [elapsed, session.secondsPerQuestion]);
  const optionClass = (optionIndex: number) => {
    if (submitted && optionIndex === question.answerIdx) return "border-emerald-500 bg-emerald-50 text-emerald-950 dark:bg-emerald-950/40 dark:text-emerald-100";
    if (submitted && optionIndex === selected && optionIndex !== question.answerIdx) return "border-red-500 bg-red-50 text-red-950 dark:bg-red-950/30 dark:text-red-100";
    if (eliminatedForQuestion.includes(optionIndex)) return "border-dashed bg-muted/35 text-muted-foreground";
    if (selected === optionIndex) return "border-emerald-500 bg-emerald-50/70 ring-2 ring-emerald-500/10 dark:bg-emerald-950/30";
    return "hover:border-slate-300 hover:bg-muted/40";
  };

  if (!demoHydrated) {
    return <div className="grid min-h-[calc(100vh-64px)] place-items-center bg-background text-sm text-muted-foreground" role="status">Restoring your demo session…</div>;
  }

  return (
    <div className="min-h-[calc(100vh-64px)] bg-background md:min-h-screen">
      <div className="sticky top-16 z-20 border-b bg-background/95 backdrop-blur md:top-0"><div className="mx-auto flex h-16 max-w-[1450px] items-center justify-between gap-3 px-4 sm:px-6 md:px-8"><div className="flex min-w-0 items-center gap-3"><Badge variant="secondary" className="shrink-0">Q {index + 1} / {questions.length}</Badge><span className="hidden truncate text-sm text-muted-foreground sm:block">{subject?.name} · {topic?.name}</span></div><div className="flex items-center gap-1 sm:gap-2">{activeMode === "timed" && <div className="mr-1 flex items-center gap-2 rounded-lg bg-muted px-2.5 py-1.5 font-mono text-xs"><Clock3 className="size-3.5" />{timerText}</div>}<Button variant={flagged.includes(index) ? "secondary" : "ghost"} size="icon" aria-label="Flag question" aria-pressed={flagged.includes(index)} onClick={flagCurrent}><Flag className={cn(flagged.includes(index) && "fill-amber-400 text-amber-500")} /></Button><Sheet open={notesOpen} onOpenChange={setNotesOpen}><SheetTrigger render={<Button variant="ghost" size="icon" aria-label="Open notes" />}><StickyNote /></SheetTrigger><SheetContent side="right" className="w-full sm:max-w-md"><SheetHeader><SheetTitle>Question notes</SheetTitle><SheetDescription>Keep a short takeaway for your next review.</SheetDescription></SheetHeader><div className="px-4"><Textarea value={notes[index] ?? ""} onChange={(event) => setNotes((current) => ({ ...current, [index]: event.target.value }))} placeholder="Write a clinical pearl, distinction, or follow-up..." className="min-h-48" /></div><SheetFooter><Button className="bg-emerald-800 hover:bg-emerald-900" onClick={persistNote}>Save note</Button></SheetFooter></SheetContent></Sheet><ReportSheet onSubmit={submitReport} qid={question.qid} /><Button variant="ghost" size="sm" className="hidden sm:flex" onClick={endSession}><X />End session</Button></div></div></div>

      <div className="mx-auto grid max-w-[1450px] gap-6 px-4 py-6 sm:px-6 md:px-8 lg:grid-cols-[minmax(0,1fr)_280px] lg:py-8">
        <main className="min-w-0"><div className="mb-5 flex items-center justify-between sm:hidden"><p className="text-xs text-muted-foreground">{subject?.name} · {topic?.name}</p><Button variant="ghost" size="xs" onClick={endSession}>End</Button></div>
          <Card className="border-0 shadow-none sm:border sm:shadow-sm"><CardContent className="p-0 sm:p-7 lg:p-9"><div className="flex items-start justify-between gap-4"><Badge variant="outline">Question ID {question.qid}</Badge>{reviewMode && <Badge className="bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300">Review mode</Badge>}</div><p className="mt-7 whitespace-pre-line text-[17px] font-medium leading-8 tracking-[-0.01em] sm:text-lg">{question.stem}</p><div className="mt-7 space-y-3">{question.options.map((option, optionIndex) => {
                const isEliminated = eliminatedForQuestion.includes(optionIndex);
                return <div key={option} className={cn("flex w-full items-stretch overflow-hidden rounded-xl border text-sm leading-6 transition-all", optionClass(optionIndex))}>
                  <button type="button" disabled={submitted || isEliminated} onClick={() => !submitted && setSelections((current) => ({ ...current, [index]: optionIndex }))} className="flex min-w-0 flex-1 items-start gap-3 p-3.5 text-left disabled:cursor-not-allowed sm:p-4">
                    <span className={cn("mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg border text-xs font-semibold", selected === optionIndex && !submitted && "border-emerald-800 bg-emerald-800 text-white", submitted && optionIndex === question.answerIdx && "border-emerald-800 bg-emerald-800 text-white", submitted && optionIndex === selected && optionIndex !== question.answerIdx && "border-red-700 bg-red-700 text-white")}>{submitted && optionIndex === question.answerIdx ? <Check className="size-4" /> : letters[optionIndex]}</span>
                    <span className={cn("flex-1", isEliminated && "line-through decoration-2")}>{option}</span>
                    {submitted && optionIndex === selected && optionIndex !== question.answerIdx && <X className="mt-1 size-4 text-red-600" />}
                  </button>
                  {!submitted && !reviewMode && <button type="button" aria-label={`${isEliminated ? "Restore" : "Strike out"} answer ${letters[optionIndex]}`} aria-pressed={isEliminated} title={`${isEliminated ? "Restore" : "Strike out"} answer ${letters[optionIndex]}`} onClick={() => toggleEliminated(optionIndex)} className={cn("grid w-12 shrink-0 place-items-center border-l text-muted-foreground transition-colors hover:bg-muted hover:text-foreground sm:w-14", isEliminated && "bg-muted/70 text-destructive hover:text-destructive")}><X className="size-4" /></button>}
                </div>;
              })}</div>
              {timedExam && submitted ? <p className="mt-7 text-sm text-muted-foreground">Answer saved. Moving on…</p> : !submitted ? <div className="mt-7 flex items-center justify-between gap-3">{showShortcuts && <div className="hidden items-center gap-2 text-xs text-muted-foreground sm:flex"><Keyboard className="size-4" />1-5 select · Enter submit</div>}<Button className="ml-auto h-10 min-w-28 bg-emerald-800 hover:bg-emerald-900" disabled={selected === null} onClick={() => submit(selected)}>Submit answer</Button></div> : <div ref={explanationRef} className="mt-7 scroll-mt-24"><div className={cn("rounded-2xl border p-5", selected === question.answerIdx ? "border-emerald-200 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/25" : "border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/20")}><div className="flex items-center gap-2"><div className={cn("grid size-8 place-items-center rounded-lg text-white", selected === question.answerIdx ? "bg-emerald-700" : "bg-amber-600")}><Lightbulb className="size-4" /></div><div><p className="font-semibold">{selected === question.answerIdx ? "Correct" : "Review the reasoning"}</p><p className="text-xs text-muted-foreground">The best answer is {letters[question.answerIdx]}.</p></div></div><div className="mt-4 space-y-3 text-sm leading-6 text-foreground/85">{question.explanation.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}</div></div><div className="mt-5 flex items-center justify-between"><Button variant="outline" disabled={index === 0} onClick={() => goTo(index - 1)}><ChevronLeft />Previous</Button><Button className="bg-emerald-800 hover:bg-emerald-900" onClick={next}>{isLast ? "See results" : "Next question"}<ChevronRight /></Button></div></div>}
            </CardContent></Card>
        </main>

        <aside className="hidden lg:block"><Card className="sticky top-24"><CardContent className="p-5"><div className="flex items-center justify-between"><div><p className="text-sm font-semibold">Question navigator</p><p className="text-xs text-muted-foreground">{Object.keys(answers).length} of {questions.length} answered</p></div><MenuSquare className="size-4 text-muted-foreground" /></div><div className="mt-5 grid grid-cols-5 gap-2">{questions.map((item, itemIndex) => <button key={item.id} onClick={() => goTo(itemIndex)} className={cn("relative grid aspect-square place-items-center rounded-lg border text-xs font-medium", itemIndex === index && "ring-2 ring-emerald-500 ring-offset-2 dark:ring-offset-background", timedExam && answers[itemIndex] && "border-slate-400 bg-slate-100 dark:bg-slate-800", !timedExam && answers[itemIndex] === "correct" && "border-emerald-500 bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300", !timedExam && answers[itemIndex] === "incorrect" && "border-red-400 bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300", !answers[itemIndex] && itemIndex !== index && "bg-muted/40")}>{itemIndex + 1}{flagged.includes(itemIndex) && <Bookmark className="absolute -right-1 -top-1 size-3 fill-amber-400 text-amber-500" />}</button>)}</div><div className="mt-5 grid grid-cols-2 gap-y-2 text-[11px] text-muted-foreground">{[["bg-emerald-500", "Correct"], ["bg-red-500", "Incorrect"], ["bg-muted", "Unanswered"], ["bg-amber-400", "Flagged"]].map(([color, label]) => <span key={label} className="flex items-center gap-2"><i className={`size-2 rounded-full ${color}`} />{label}</span>)}</div><div className="mt-5 rounded-xl bg-muted/60 p-3 text-[11px] leading-5 text-muted-foreground"><FileText className="mb-1 size-4" />Every answer, flag and note is saved to your account as you go.</div></CardContent></Card></aside>
      </div>
      <div className="border-t bg-muted/30 px-4 py-4 lg:hidden"><div className="mx-auto flex max-w-3xl gap-2 overflow-x-auto pb-1">{questions.map((item, itemIndex) => <button key={item.id} onClick={() => goTo(itemIndex)} className={cn("grid size-9 shrink-0 place-items-center rounded-lg border bg-background text-xs font-medium", itemIndex === index && "border-emerald-500 bg-emerald-50 text-emerald-700", answers[itemIndex] === "correct" && "bg-emerald-100", answers[itemIndex] === "incorrect" && "bg-red-100")}>{itemIndex + 1}</button>)}</div></div>
    </div>
  );
}

function ReportSheet({ onSubmit, qid }: { onSubmit: (text: string) => Promise<void>; qid: number }) {
  const [text, setText] = useState("");
  const [open, setOpen] = useState(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger render={<Button variant="ghost" size="icon" aria-label="Report an issue" />}><MessageSquareWarning /></SheetTrigger>
      <SheetContent side="right" className="w-full sm:max-w-md">
        <SheetHeader><SheetTitle>Report an issue</SheetTitle><SheetDescription>Spotted an OCR typo or a wrong answer in question {qid}? Tell us what to fix.</SheetDescription></SheetHeader>
        <div className="px-4"><Textarea value={text} onChange={(event) => setText(event.target.value)} placeholder="e.g. option C is cut off, or the explanation says the wrong answer letter." className="min-h-48" /></div>
        <SheetFooter><Button className="bg-emerald-800 hover:bg-emerald-900" disabled={!text.trim()} onClick={() => { onSubmit(text.trim()); setText(""); setOpen(false); }}>Send report</Button></SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
