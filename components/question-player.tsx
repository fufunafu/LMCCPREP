"use client";

import Image from "next/image";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useStudyNavigation } from "@/lib/study-navigation";
import { studyStore, saveStudy } from "@/lib/study-store";
import { eligibleReplacement, type SavedSession } from "@/lib/study-core";
import { useStudy } from "@/components/study-provider";
import { Bookmark, Check, ChevronDown, ChevronLeft, ChevronRight, Clock3, FileText, Flag, Keyboard, MoreHorizontal, Volume2, Lightbulb, MenuSquare, MessageSquareWarning, StickyNote, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { QuestionContent } from "@/components/question-content";
import { QuestionHighlighter } from "@/components/question-highlighter";
import { readableQuestionText } from "@/lib/question-text";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { cn, DEFAULT_SECONDS_PER_QUESTION } from "@/lib/utils";
import { resolveInitialIndex } from "@/lib/session-utils";
import { buildExplanationContent, parseInline, type ExplanationBlock } from "@/lib/explanation-content";
import type { Attempt, Question, Subject, Topic } from "@/lib/types";

const answerLetter = (index: number) => String.fromCharCode(65 + index);

export function QuestionPlayer({ session, questions, subjects, topics, initialFlags = [], initialNotes = {}, initialAttempts = [], showShortcuts = true, explanationAutoScroll = false, query }: { session: SavedSession; questions: Question[]; subjects: Subject[]; topics: Topic[]; initialFlags?: string[]; initialNotes?: Record<string, string>; initialAttempts?: Attempt[]; showShortcuts?: boolean; explanationAutoScroll?: boolean; query?: string }) {
  const navigate = useStudyNavigation();
  const routeParams = useSearchParams();
  const searchParams = new URLSearchParams(query ?? routeParams.toString());
  const reviewMode = searchParams.get("review") === "1" || Boolean(session.finishedAt);
  const activeMode = searchParams.get("mode") === "timed" ? "timed" : session.mode;
  const index = reviewMode ? resolveInitialIndex(searchParams.get("q"), { currentIndex: session.cursor }, questions.length) : session.cursor;
  const [reviewIndex, setReviewIndex] = useState<number | null>(null);
  return <ActiveQuestionPlayer key={`${session.id}:${reviewMode}`} session={session} questions={questions} subjects={subjects} topics={topics} initialFlags={initialFlags} initialNotes={initialNotes} initialAttempts={initialAttempts} showShortcuts={showShortcuts} explanationAutoScroll={explanationAutoScroll} reviewMode={reviewMode} activeMode={activeMode} index={reviewIndex ?? index} navigate={navigate} onReviewIndex={setReviewIndex} />;
}

function ActiveQuestionPlayer({ session, questions, subjects, topics, initialFlags, initialNotes, initialAttempts, showShortcuts, explanationAutoScroll, reviewMode, activeMode, index, navigate, onReviewIndex }: { session: SavedSession; questions: Question[]; subjects: Subject[]; topics: Topic[]; initialFlags: string[]; initialNotes: Record<string, string>; initialAttempts: Attempt[]; showShortcuts: boolean; explanationAutoScroll: boolean; reviewMode: boolean; activeMode: string; index: number; navigate: (path: string) => void; onReviewIndex: (index: number) => void }) {
  const { snapshot } = useStudy();
  const [notesOpen, setNotesOpen] = useState(false);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [expandedExplanations, setExpandedExplanations] = useState<Set<string>>(() => new Set());
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [clock, setClock] = useState({ id: "", seconds: 0 });
  const explanationRef = useRef<HTMLDivElement>(null);
  const feedbackRef = useRef<HTMLParagraphElement>(null);
  const questionHeadingRef = useRef<HTMLHeadingElement>(null);
  const question = questions[index];
  const elapsed = clock.id === question.id ? clock.seconds : 0;
  const flagged = questions.flatMap((q, i) => initialFlags.includes(q.id) ? [i] : []);
  const selections: Record<number, number | null> = {};
  const answers: Record<number, "correct" | "incorrect"> = {};
  for (const a of initialAttempts) { const i = questions.findIndex((q) => q.id === a.questionId); if (i >= 0) { selections[i] = a.chosenIdx; answers[i] = a.correct ? "correct" : "incorrect"; } }
  const selected = selections[index] ?? null;
  const submitted = reviewMode || answers[index] !== undefined;
  const timedExam = activeMode === "timed" && !reviewMode;
  const secondsPerQuestion = session.secondsPerQuestion ?? DEFAULT_SECONDS_PER_QUESTION;
  const subject = subjects.find((item) => item.id === question.subjectId);
  const topic = topics.find((item) => item.id === question.topicId);
  const isLast = index === questions.length - 1;
  const eliminatedForQuestion = useMemo(() => session.eliminated[question.id] ?? [], [question.id, session.eliminated]);
  const explanationContent = buildExplanationContent(question, selected);
  const explanationExpanded = expandedExplanations.has(question.id);
  const figureUrls = question.figureUrls?.length ? question.figureUrls : question.figureUrl ? [question.figureUrl] : [];
  const run = useCallback(async (action: () => Promise<unknown>) => {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(true);
    try { await action(); } catch (e) { toast.error(e instanceof Error ? e.message : "Could not save. Please try again."); }
    finally { busyRef.current = false; setBusy(false); }
  }, []);
  const goTo = useCallback((nextIndex: number) => run(async () => {
    if ("speechSynthesis" in window) speechSynthesis.cancel();
    if (reviewMode) onReviewIndex(nextIndex);
    else await saveStudy({ kind: "progress", sessionId: session.id, index: nextIndex, finished: false });
    window.scrollTo({ top: 0, behavior: "smooth" });
    window.setTimeout(() => questionHeadingRef.current?.focus(), 0);
  }), [onReviewIndex, reviewMode, run, session.id]);
  const saveAndExit = () => run(async () => {
    if ("speechSynthesis" in window) speechSynthesis.cancel();
    if (!reviewMode) await saveStudy({ kind: "progress", sessionId: session.id, index, finished: false });
    navigate("/dashboard");
  });
  const endSession = useCallback(() => run(async () => {
    if (!reviewMode) await saveStudy({ kind: "progress", sessionId: session.id, index, finished: true });
    navigate(`/session/${session.id}/review?mode=${activeMode}`);
  }), [activeMode, index, navigate, reviewMode, run, session.id]);
  const next = useCallback(() => { if (isLast) void endSession(); else void goTo(index + 1); }, [endSession, goTo, index, isLast]);
  const submit = useCallback((choice: number | null) => run(async () => {
    if (submitted || (choice === null && !timedExam)) return;
    const attempt: Attempt = { sessionId: session.id, questionId: question.id, chosenIdx: choice, correct: choice === question.answerIdx, timeMs: Math.min(3_600_000, Math.max(0, Date.now() - (session.starts[question.id] ?? Date.now()))), createdAt: new Date().toISOString() };
    await saveStudy({ kind: "attempt", attempt });
    if (timedExam) {
      await saveStudy({ kind: "progress", sessionId: session.id, index: isLast ? index : index + 1, finished: isLast });
      if (isLast) navigate(`/session/${session.id}/review?mode=${activeMode}`);
      else window.setTimeout(() => questionHeadingRef.current?.focus(), 0);
    } else {
      if (explanationAutoScroll) window.setTimeout(() => explanationRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 100);
      window.setTimeout(() => feedbackRef.current?.focus(), 0);
    }
  }), [activeMode, explanationAutoScroll, index, isLast, navigate, question, run, session, submitted, timedExam]);
  useEffect(() => {
    if (!timedExam || submitted) return;
    const start = session.starts[question.id] ?? Date.now();
    const timer = window.setInterval(() => setClock({ id: question.id, seconds: Math.floor((Date.now() - start) / 1000) }), 250);
    return () => window.clearInterval(timer);
  }, [question.id, session.starts, submitted, timedExam]);
  useEffect(() => {
    if (timedExam && !submitted && elapsed >= secondsPerQuestion) void submit(null);
  }, [elapsed, secondsPerQuestion, submit, submitted, timedExam]);
  useEffect(() => () => { if ("speechSynthesis" in window) speechSynthesis.cancel(); }, [question.id]);
  const skip = () => run(async () => {
    if (!snapshot) return;
    const replacement = eligibleReplacement(snapshot, session, index);
    await saveStudy({ kind: "replace", sessionId: session.id, index, oldId: question.id, newId: replacement.id });
    window.scrollTo({ top: 0, behavior: "smooth" });
    toast.success("Question replaced. No answer or score recorded.");
  });
  const flagCurrent = () => run(() => saveStudy({ kind: "flag", questionId: question.id, flagged: !initialFlags.includes(question.id) }));
  const toggleEliminated = (optionIndex: number) => run(() => studyStore.local((saved) => {
    const s = saved.sessions[session.id]; const values = s.eliminated[question.id] ?? [];
    return { ...saved, sessions: { ...saved.sessions, [s.id]: { ...s, eliminated: { ...s.eliminated, [question.id]: values.includes(optionIndex) ? values.filter((i) => i !== optionIndex) : [...values, optionIndex] } } } };
  }));
  const updateSidebarNote = (body: string) => {
    const questionId = question.id;
    setNotes((current) => ({ ...current, [questionId]: body }));
    // Persist each edit through the serialized local store, including offline.
    // Do not use the question-action busy guard: rapid edits must all be saved.
    void saveStudy({ kind: "note", questionId, body }).catch((error) => {
      toast.error(error instanceof Error ? error.message : "Could not save your note. Please try again.", { id: "question-note-save" });
    });
  };
  const persistNote = () => run(async () => {
    await saveStudy({ kind: "note", questionId: question.id, body: notes[question.id] ?? initialNotes[question.id] ?? "" });
    toast.success("Note saved"); setNotesOpen(false);
  });
  const submitReport = async (text: string) => {
    if (snapshot?.demo) { toast.info("Reports are not sent from the demo"); return; }
    await saveStudy({ kind: "report", questionId: question.id, body: text }); toast.success("Report saved for sync");
  };
  const readAloud = () => {
    if (!("speechSynthesis" in window)) { toast.error("Read aloud is unavailable in this browser."); return; }
    if (speechSynthesis.speaking) { speechSynthesis.cancel(); return; }
    const words = `${question.stem}. ${question.options.map((o, i) => `${answerLetter(i)}. ${o}`).join(". ")}${submitted && !timedExam ? `. ${question.explanation.join(". ")}` : ""}`;
    speechSynthesis.speak(new SpeechSynthesisUtterance(readableQuestionText(words).replace(/[*#|_]/g, " ")));
  };
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (target.closest('button,input,textarea,select,a,[role="dialog"]') || event.altKey || event.ctrlKey || event.metaKey) return;
      const number = Number(event.key);
      if (!submitted && number >= 1 && number <= question.options.length && !eliminatedForQuestion.includes(number - 1)) void submit(number - 1);
      if ((event.key === "Enter" || event.key === "n") && submitted) { event.preventDefault(); next(); }
    };
    window.addEventListener("keydown", handler); return () => window.removeEventListener("keydown", handler);
  }, [eliminatedForQuestion, next, question.options.length, submit, submitted]);
  const timerText = useMemo(() => { const remaining = Math.max(0, secondsPerQuestion - elapsed); return `${String(Math.floor(remaining / 60)).padStart(2, "0")}:${String(remaining % 60).padStart(2, "0")}`; }, [elapsed, secondsPerQuestion]);
  const optionClass = (optionIndex: number) => {
    if (submitted && !timedExam && optionIndex === question.answerIdx) return "border-emerald-500 bg-emerald-50 text-emerald-950 dark:bg-emerald-950/40 dark:text-emerald-100";
    if (submitted && !timedExam && optionIndex === selected && optionIndex !== question.answerIdx) return "border-red-500 bg-red-50 text-red-950 dark:bg-red-950/30 dark:text-red-100";
    if (eliminatedForQuestion.includes(optionIndex)) return "border-dashed bg-muted/35 text-muted-foreground";
    if (selected === optionIndex) return "border-emerald-500 bg-emerald-50/70 ring-2 ring-emerald-500/10 dark:bg-emerald-950/30";
    return "hover:border-slate-300 hover:bg-muted/40";
  };

  return (
    <div className="min-h-[calc(100vh-64px)] bg-background md:min-h-screen">
      <div className="sticky top-16 z-20 border-b bg-background/95 backdrop-blur md:top-0"><div className="mx-auto flex h-16 max-w-[1200px] items-center justify-between gap-3 px-4 sm:px-6 md:px-8"><div className="flex min-w-0 items-center gap-3"><Badge variant="secondary" className="shrink-0">Q {index + 1} / {questions.length}</Badge><span className="hidden truncate text-sm text-muted-foreground sm:block">{subject?.name} · {topic?.name}</span></div><div className="flex items-center gap-1 sm:gap-2">{timedExam && <div role="timer" aria-label={`${timerText} remaining`} className="mr-1 flex items-center gap-2 rounded-lg bg-muted px-2.5 py-1.5 font-mono text-xs"><Clock3 className="size-3.5" />{timerText}</div>}<Button variant="outline" size="sm" disabled={submitted || busy} onClick={skip}>Skip</Button><details className="relative"><summary aria-label="Question tools" className="grid size-10 cursor-pointer list-none place-items-center rounded-lg border"><MoreHorizontal className="size-5" /></summary><div className="absolute right-0 z-30 mt-2 flex w-56 flex-wrap gap-1 rounded-xl border bg-background p-3 shadow-lg"><Button variant="ghost" size="sm" onClick={readAloud}><Volume2 />Read aloud / stop</Button><Button variant={flagged.includes(index) ? "secondary" : "ghost"} size="icon" aria-label="Flag question" aria-pressed={flagged.includes(index)} onClick={flagCurrent}><Flag className={cn(flagged.includes(index) && "fill-amber-400 text-amber-500")} /></Button><Sheet open={notesOpen} onOpenChange={setNotesOpen}><SheetTrigger render={<Button variant="ghost" size="icon" aria-label="Open notes" />}><StickyNote /></SheetTrigger><SheetContent side="right" className="w-full sm:max-w-md"><SheetHeader><SheetTitle>Question notes</SheetTitle><SheetDescription>Keep a short takeaway for your next review.</SheetDescription></SheetHeader><div className="px-4"><Textarea value={notes[question.id] ?? initialNotes[question.id] ?? ""} onChange={(event) => setNotes((current) => ({ ...current, [question.id]: event.target.value }))} placeholder="Write a clinical pearl, distinction, or follow-up..." className="min-h-48" /></div><SheetFooter><Button className="bg-emerald-800 hover:bg-emerald-900" onClick={persistNote}>Save note</Button></SheetFooter></SheetContent></Sheet><ReportSheet onSubmit={submitReport} qid={question.qid} /><Button variant="ghost" size="sm" disabled={busy} onClick={saveAndExit}>{reviewMode ? "Back to dashboard" : "Save and exit"}</Button><Button variant="ghost" size="sm" className="flex" disabled={busy} onClick={endSession}><X />End session</Button></div></details></div></div></div>

      <div className="mx-auto grid max-w-[1200px] gap-6 px-4 py-6 sm:px-6 md:px-8 lg:grid-cols-[minmax(0,1fr)_280px] lg:py-8">
        <section aria-labelledby="question-heading" className="min-w-0"><h1 ref={questionHeadingRef} id="question-heading" tabIndex={-1} className="sr-only">Question {index + 1} of {questions.length}</h1><div className="mb-5 flex items-center justify-between sm:hidden"><p className="text-xs text-muted-foreground">{subject?.name} · {topic?.name}</p><Button variant="ghost" size="xs" disabled={busy} onClick={saveAndExit}>{reviewMode ? "Dashboard" : "Save and exit"}</Button></div>
          <Card className="border-0 shadow-none sm:border sm:shadow-sm"><CardContent className="p-0 sm:p-7 lg:p-9"><div className="flex flex-wrap items-center justify-between gap-3"><Badge variant="outline">Question ID {question.qid}</Badge><div role="group" className="ml-auto flex shrink-0 gap-2" aria-label="Question navigation"><Button variant="outline" aria-label="Previous question" disabled={index === 0 || busy} onClick={() => void goTo(index - 1)}><ChevronLeft /></Button>{!submitted && <Button variant="outline" disabled={busy} onClick={skip}>Skip question</Button>}<Button className="bg-emerald-800 text-white hover:bg-emerald-900" aria-label={isLast ? "See results" : "Next question"} disabled={busy} onClick={next}>{isLast ? "See results" : "Next"}<ChevronRight /></Button></div>{reviewMode && <Badge className="bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300">Review mode</Badge>}</div><QuestionHighlighter key={`${snapshot?.userId}:${snapshot?.examId}:${question.id}`} questionId={question.id}><QuestionContent highlightRegion="stem" text={question.stem} className="mt-7 text-[17px] font-medium leading-8 tracking-[-0.01em] sm:text-lg" />{figureUrls.map((figureUrl, figureIndex) => <div key={figureUrl} className="mt-6 overflow-hidden rounded-2xl border bg-white p-3 dark:bg-slate-950"><Image src={figureUrl} alt={`Clinical figure ${figureIndex + 1} for question ${question.qid}`} width={1024} height={768} unoptimized className="mx-auto max-h-[34rem] w-auto object-contain" /></div>)}<div role="radiogroup" aria-label="Answer options" className="mt-7 space-y-3">{question.options.map((option, optionIndex) => {
                const isEliminated = eliminatedForQuestion.includes(optionIndex);
                return <div key={optionIndex} className={cn("flex w-full items-stretch overflow-hidden rounded-xl border text-[17px] leading-8 transition-all sm:text-lg", optionClass(optionIndex))}>
                  <button type="button" role="radio" aria-label={`${answerLetter(optionIndex)} ${option}${submitted && !timedExam && optionIndex === question.answerIdx ? ", correct answer" : submitted && !timedExam && optionIndex === selected ? ", selected incorrect answer" : isEliminated ? ", eliminated" : ""}`} aria-checked={selected === optionIndex} disabled={submitted || busy || isEliminated} onClick={() => void submit(optionIndex)} className="flex min-w-0 flex-1 items-start gap-3 p-3.5 text-left disabled:cursor-not-allowed sm:p-4">
                    <span className={cn("mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg border text-xs font-semibold", selected === optionIndex && !submitted && "border-emerald-800 bg-emerald-800 text-white", submitted && !timedExam && optionIndex === question.answerIdx && "border-emerald-800 bg-emerald-800 text-white", submitted && !timedExam && optionIndex === selected && optionIndex !== question.answerIdx && "border-red-700 bg-red-700 text-white")}><span className="sr-only">{answerLetter(optionIndex)}</span>{submitted && !timedExam && optionIndex === question.answerIdx ? <Check aria-hidden="true" className="size-4" /> : <span aria-hidden="true">{answerLetter(optionIndex)}</span>}</span>
                    <span className={cn("flex-1", isEliminated && "line-through decoration-2")}><Inline text={option} /></span>
                    {submitted && !timedExam && optionIndex === selected && optionIndex !== question.answerIdx && <X className="mt-1 size-4 text-red-600" />}
                  </button>
                  {!submitted && !reviewMode && <button type="button" aria-label={`${isEliminated ? "Restore" : "Strike out"} answer ${answerLetter(optionIndex)}`} aria-pressed={isEliminated} title={`${isEliminated ? "Restore" : "Strike out"} answer ${answerLetter(optionIndex)}`} onClick={() => toggleEliminated(optionIndex)} className={cn("grid w-12 shrink-0 place-items-center border-l text-muted-foreground transition-colors hover:bg-muted hover:text-foreground sm:w-14", isEliminated && "bg-muted/70 text-destructive hover:text-destructive")}><X className="size-4" /></button>}
                </div>;
              })}</div>
              {timedExam && submitted ? <div className="mt-7 flex items-center justify-between gap-3"><p role="status" className="text-sm text-muted-foreground">Answer saved.</p><Button disabled={busy} onClick={next}>{isLast ? "See results" : "Next question"}<ChevronRight /></Button></div> : !submitted ? <div className="mt-7 flex flex-wrap items-center justify-between gap-3">{showShortcuts && <span className="text-xs text-muted-foreground"><Keyboard className="mr-1 inline size-4" />Tap an answer or press 1-{Math.min(9, question.options.length)} to submit.</span>}</div> : <div ref={explanationRef} className="mt-7 scroll-mt-24"><p ref={feedbackRef} role="status" aria-live="polite" tabIndex={-1} className="sr-only">{selected === question.answerIdx ? "Correct." : "Incorrect."} The best answer is {answerLetter(question.answerIdx)}.</p><section aria-label="Answer explanation" className={cn("rounded-2xl border p-4 sm:p-5", selected === question.answerIdx ? "border-emerald-200 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/25" : "border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/20")}><div className="flex items-center gap-2"><div className={cn("grid size-8 place-items-center rounded-lg text-white", selected === question.answerIdx ? "bg-emerald-700" : "bg-amber-600")}><Lightbulb className="size-4" /></div><div><p className="font-semibold">{selected === question.answerIdx ? "Correct" : "Review the reasoning"}</p><p className="text-xs text-muted-foreground">The best answer is {answerLetter(question.answerIdx)}.</p></div></div><div className="mt-4"><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">In short</p>{explanationContent.richSummary ? <QuestionContent highlightRegion="summary" text={explanationContent.richSummary} className="mt-2 text-sm leading-6 text-foreground/90" /> : <ul data-highlight-region="summary" className="mt-2 space-y-1.5 text-sm leading-6 text-foreground/90">{explanationContent.short.map((point, pointIndex) => <li key={`${question.id}-short-${pointIndex}`} className="flex gap-2"><span aria-hidden="true" className="mt-2.5 size-1.5 shrink-0 rounded-full bg-emerald-600" /><span><Inline text={point} /></span></li>)}</ul>}</div>{explanationContent.yourAnswer && selected != null && <div className="mt-4 rounded-xl border border-red-200 bg-red-50/70 p-3 text-sm leading-6 dark:border-red-900 dark:bg-red-950/30"><p className="text-xs font-semibold uppercase tracking-wide text-red-800 dark:text-red-300">Why {answerLetter(selected)} was wrong</p><p data-highlight-region={`wrong-${selected}`} className="mt-1 text-foreground/90"><Inline text={explanationContent.yourAnswer} /></p></div>}{(explanationContent.fullBlocks.length > 0 || explanationContent.optionVerdicts.some((verdict) => verdict.text)) && <div className="mt-3"><Button type="button" variant="outline" className="h-11 w-full justify-between gap-3 border-slate-400 bg-background px-4 text-sm font-semibold shadow-sm hover:bg-muted sm:w-auto dark:border-slate-500 dark:bg-slate-900 dark:hover:bg-slate-800" aria-expanded={explanationExpanded} onClick={() => setExpandedExplanations((current) => { const nextExpanded = new Set(current); if (explanationExpanded) nextExpanded.delete(question.id); else nextExpanded.add(question.id); return nextExpanded; })}>{explanationExpanded ? "Hide full explanation" : "Show full explanation"}<ChevronDown aria-hidden="true" className={cn("size-4 transition-transform", explanationExpanded && "rotate-180")} /></Button>{explanationExpanded && <div data-highlight-region="full-explanation" className="mt-2 space-y-4 rounded-xl border bg-background/70 p-4 text-sm leading-6 text-foreground/90 dark:bg-background/40"><ExplanationBlocks blocks={explanationContent.fullBlocks} idPrefix={question.id} />{explanationContent.optionVerdicts.some((verdict) => verdict.text) && <div><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Option by option</p><ul className="mt-2 space-y-2">{explanationContent.optionVerdicts.map((verdict) => <li key={`${question.id}-verdict-${verdict.index}`} className="flex gap-2"><span aria-hidden="true" className={cn("mt-0.5 grid size-5 shrink-0 place-items-center rounded-full text-[11px] font-bold", verdict.isCorrect ? "bg-emerald-600 text-white" : "bg-muted text-muted-foreground")}>{answerLetter(verdict.index)}</span><div><p className={cn("font-medium", verdict.isCorrect && "text-emerald-800 dark:text-emerald-300")}>{question.options[verdict.index]}{verdict.isCorrect ? " (correct)" : ""}</p>{verdict.text && <p className="text-muted-foreground"><Inline text={verdict.text} /></p>}</div></li>)}</ul></div>}</div>}</div>}</section><section aria-labelledby={`references-${question.qid}`} className="mt-4 rounded-2xl border bg-muted/25 p-5"><div className="flex flex-wrap items-center justify-between gap-2"><h2 id={`references-${question.qid}`} className="text-sm font-semibold">References and editorial status</h2><Badge variant="outline">{question.isPersonal ? "Personal question" : question.editorialStatus === "reviewed" ? "Reviewed bank content" : question.editorialStatus === "stale" ? "Review due" : "Editorial review pending"}</Badge></div>{question.references?.length ? <ul className="mt-3 space-y-2 text-xs leading-5 text-muted-foreground">{question.references.map((reference, referenceIndex) => <li key={referenceIndex}>{reference}</li>)}</ul> : <p className="mt-3 text-xs leading-5 text-muted-foreground">{question.referenceException ?? (question.isPersonal ? "Personal questions do not receive Montreal QBank editorial endorsement." : "No approved reference is displayed. This item is pending editorial review and must not be treated as reviewed bank content.")}</p>}{question.lastReviewedAt && <p className="mt-3 text-xs text-muted-foreground">Last reviewed {question.lastReviewedAt}{question.reviewerRole ? ` by ${question.reviewerRole}` : ""}.</p>}</section><div className="mt-5 flex items-center justify-between"><Button variant="outline" aria-label="Previous question" disabled={index === 0 || busy} onClick={() => goTo(index - 1)}><ChevronLeft /></Button><Button className="bg-emerald-800 hover:bg-emerald-900" onClick={next}>{isLast ? "See results" : "Next question"}<ChevronRight /></Button></div></div>}
            </QuestionHighlighter></CardContent></Card>
        </section>

        <aside className="min-w-0 space-y-4"><Card className="hidden py-3 lg:block"><CardContent className="px-3 py-0"><div className="flex items-center justify-between"><div><p className="text-sm font-semibold">Question navigator</p><p className="text-xs text-muted-foreground">{Object.keys(answers).length} of {questions.length} answered</p></div><MenuSquare className="size-4 text-muted-foreground" /></div><div className="mt-3 grid grid-cols-8 gap-1.5">{questions.map((item, itemIndex) => <button type="button" key={item.id} aria-label={`Go to question ${itemIndex + 1}${answers[itemIndex] ? `, ${timedExam ? "answered" : answers[itemIndex]}` : ", unanswered"}${itemIndex === index ? ", current" : ""}${flagged.includes(itemIndex) ? ", flagged" : ""}`} aria-current={itemIndex === index ? "step" : undefined} disabled={busy} onClick={() => goTo(itemIndex)} className={cn("relative grid h-7 place-items-center rounded-lg border text-xs font-medium", itemIndex === index && "ring-2 ring-emerald-500 ring-offset-2 dark:ring-offset-background", timedExam && answers[itemIndex] && "border-slate-400 bg-slate-100 dark:bg-slate-800", !timedExam && answers[itemIndex] === "correct" && "border-emerald-500 bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300", !timedExam && answers[itemIndex] === "incorrect" && "border-red-400 bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300", !answers[itemIndex] && itemIndex !== index && "bg-muted/40")}>{itemIndex + 1}{flagged.includes(itemIndex) && <Bookmark className="absolute -right-1 -top-1 size-3 fill-amber-400 text-amber-500" />}</button>)}</div><div className="mt-3 grid grid-cols-2 gap-y-1 text-[11px] text-muted-foreground">{[["bg-emerald-500", "Correct"], ["bg-red-500", "Incorrect"], ["bg-muted", "Unanswered"], ["bg-amber-400", "Flagged"]].map(([color, label]) => <span key={label} className="flex items-center gap-2"><i aria-hidden="true" className={`size-2 rounded-full ${color}`} />{label}</span>)}</div><div className="mt-3 flex items-start gap-1.5 text-[11px] leading-4 text-muted-foreground"><FileText className="mt-0.5 size-3.5 shrink-0" /><span>Answers, flags and notes save locally and sync when connected.</span></div></CardContent></Card><div><label htmlFor="question-sidebar-notes" className="sr-only">Notes for this question</label><Textarea id="question-sidebar-notes" value={notes[question.id] ?? initialNotes[question.id] ?? ""} maxLength={5000} onChange={(event) => updateSidebarNote(event.target.value)} placeholder="Write your notes here..." aria-description="Notes save automatically on this device and sync when connected." className="min-h-40 resize-y bg-card p-3 text-sm" /></div></aside>
      </div>
      <div className="border-t bg-muted/30 px-4 py-4 lg:hidden"><div className="mx-auto flex max-w-3xl gap-2 overflow-x-auto pb-1">{questions.map((item, itemIndex) => <button type="button" key={item.id} aria-label={`Go to question ${itemIndex + 1}${answers[itemIndex] ? `, ${timedExam ? "answered" : answers[itemIndex]}` : ", unanswered"}${itemIndex === index ? ", current" : ""}${flagged.includes(itemIndex) ? ", flagged" : ""}`} aria-current={itemIndex === index ? "step" : undefined} disabled={busy} onClick={() => goTo(itemIndex)} className={cn("relative grid size-9 shrink-0 place-items-center rounded-lg border bg-background text-xs font-medium", itemIndex === index && "border-emerald-500 bg-emerald-50 text-emerald-700", !timedExam && answers[itemIndex] === "correct" && "bg-emerald-100", !timedExam && answers[itemIndex] === "incorrect" && "bg-red-100")}>{itemIndex + 1}{flagged.includes(itemIndex) && <Bookmark className="absolute -right-1 -top-1 size-3 fill-amber-400 text-amber-500" />}</button>)}</div></div>
    </div>
  );
}

function ReportSheet({ onSubmit, qid }: { onSubmit: (text: string) => Promise<void>; qid: number }) {
  const [text, setText] = useState("");
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger render={<Button variant="ghost" size="icon" aria-label="Report an issue" />}><MessageSquareWarning /></SheetTrigger>
      <SheetContent side="right" className="w-full sm:max-w-md">
        <SheetHeader><SheetTitle>Report an issue</SheetTitle><SheetDescription>Spotted an OCR typo or a wrong answer in question {qid}? Tell us what to fix.</SheetDescription></SheetHeader>
        <div className="px-4"><Textarea value={text} onChange={(event) => setText(event.target.value)} placeholder="e.g. option C is cut off, or the explanation says the wrong answer letter." className="min-h-48" /></div>
        <SheetFooter><Button className="bg-emerald-800 hover:bg-emerald-900" disabled={!text.trim() || saving} onClick={async () => { setSaving(true); try { await onSubmit(text.trim()); setText(""); setOpen(false); } catch (e) { toast.error(e instanceof Error ? e.message : "Could not save the report. Try again."); } finally { setSaving(false); } }}>Send report</Button></SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

function ExplanationBlocks({ blocks, idPrefix }: { blocks: ExplanationBlock[]; idPrefix: string }) {
  if (!blocks.length) return null;
  return (
    <div className="space-y-3">
      {blocks.map((block, blockIndex) => {
        const key = `${idPrefix}-block-${blockIndex}`;
        if (block.type === "markdown") return <QuestionContent key={key} text={block.text} />;
        if (block.type === "heading") return <p key={key} className="font-semibold"><Inline text={block.text} /></p>;
        if (block.type === "bullets") return <ul key={key} className="list-disc space-y-1 pl-5">{block.items.map((item, itemIndex) => <li key={`${key}-${itemIndex}`}><Inline text={item} /></li>)}</ul>;
        return <p key={key}><Inline text={block.text} /></p>;
      })}
    </div>
  );
}

/** Renders markdown-style **bold** runs as real emphasis. */
function Inline({ text }: { text: string }) {
  return <>{parseInline(readableQuestionText(text)).map((segment, segmentIndex) => segment.bold ? <strong key={segmentIndex}>{segment.text}</strong> : <span key={segmentIndex}>{segment.text}</span>)}</>;
}
