"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Bookmark, ChevronLeft, ChevronRight, Filter, Search, Plus } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { QuestionStatus } from "@/lib/types";
import { normalizeQuestionFilters, questionFiltersKey, type QuestionLibraryFilters, type QuestionPage } from "@/lib/question-library";

const statusStyle: Record<QuestionStatus, string> = { unused: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300", correct: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300", incorrect: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300", flagged: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300" };

export function QuestionsBrowser({ initialPage, subjects, topics, initialStatus = "all" }: QuestionLibraryFilters & { initialPage: QuestionPage; initialStatus?: QuestionStatus | "all" }) {
  const [query, setQuery] = useState(""); const [subject, setSubject] = useState("all"); const [topic, setTopic] = useState("all"); const [status, setStatus] = useState<QuestionStatus | "all">(initialStatus); const [page, setPage] = useState(initialPage.page);
  const [result, setResult] = useState(initialPage);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const initialKey = questionFiltersKey(normalizeQuestionFilters({ status: initialStatus, page: initialPage.page }));
  const requestKey = questionFiltersKey(normalizeQuestionFilters({ query, subject, topic, status, page }));
  const [settledKey, setSettledKey] = useState(initialKey);
  const lastSettled = useRef(initialKey);
  const [settledRetry, setSettledRetry] = useState(0);
  const pending = requestKey !== settledKey || retry !== settledRetry;

  useEffect(() => {
    // Hydration already has a complete first page. Filter changes fetch only
    // the result page, without rerendering the navigation or loading the bank.
    if (requestKey === lastSettled.current && retry === settledRetry) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/questions?${requestKey}`, { signal: controller.signal, cache: "no-store" });
        if (response.redirected) { window.location.assign(response.url); return; }
        if (!response.ok) throw new Error("Questions could not be loaded. Please try again.");
        const next = await response.json() as QuestionPage;
        if (!controller.signal.aborted) {
          setResult(next);
          setError("");
          lastSettled.current = requestKey;
          setSettledKey(requestKey);
          setSettledRetry(retry);
        }
      } catch {
        if (!controller.signal.aborted) {
          setError("Questions could not be loaded. Please try again.");
          lastSettled.current = requestKey;
          setSettledKey(requestKey);
          setSettledRetry(retry);
        }
      }
    }, new URLSearchParams(requestKey).get("query") !== new URLSearchParams(lastSettled.current).get("query") ? 250 : 0);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [requestKey, retry, settledRetry]);

  const filteredTopics = subject === "all" ? topics : topics.filter((item) => item.subjectId === subject);
  const { questions: visible, statuses } = result;
  const pages = Math.max(1, Math.ceil(result.total / result.pageSize));
  const currentPage = result.page;
  const pageItems = useMemo(() => {
    const current = currentPage;
    const numbers = Array.from(new Set([1, current - 1, current, current + 1, pages])).filter((value) => value >= 1 && value <= pages).sort((a, b) => a - b);
    const items: Array<number | string> = [];
    numbers.forEach((value, index) => {
      if (index > 0 && value - numbers[index - 1] > 1) items.push(`ellipsis-${numbers[index - 1]}`);
      items.push(value);
    });
    return items;
  }, [currentPage, pages]);
  const nameSubject = (id: string) => subjects.find((item) => item.id === id)?.name ?? id;
  const nameTopic = (id: string) => topics.find((item) => item.id === id)?.name ?? id;
  const resetPage = <T,>(setter: (value: T) => void, value: T) => { setter(value); setPage(1); setError(""); };
  const selectClass = "h-10 rounded-lg border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring/40";

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 md:px-8 md:py-8">
      <PageHeader eyebrow="Question library" title="Browse all questions" description="Search every question by clinical keyword, tag, topic or ID, then open any one in tutor mode." action={<Link href="/author" className={buttonVariants({ className: "bg-emerald-800 hover:bg-emerald-900" })}><Plus className="size-4" />Add question</Link>} />
      <Card><CardContent className="p-4 sm:p-5"><div className="relative"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input aria-label="Search questions" maxLength={200} value={query} onChange={(event) => resetPage(setQuery, event.target.value)} placeholder="Search by keyword, tag or question ID" className="h-11 pl-10" /></div><div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4"><label className="sr-only" htmlFor="subject-filter">Subject</label><select id="subject-filter" className={selectClass} value={subject} onChange={(event) => { resetPage(setSubject, event.target.value); setTopic("all"); }}><option value="all">All subjects</option>{subjects.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><label className="sr-only" htmlFor="topic-filter">Topic</label><select id="topic-filter" className={selectClass} value={topic} onChange={(event) => resetPage(setTopic, event.target.value)}><option value="all">All topics</option>{filteredTopics.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><label className="sr-only" htmlFor="status-filter">Status</label><select id="status-filter" className={selectClass} value={status} onChange={(event) => resetPage(setStatus, event.target.value as QuestionStatus | "all")}><option value="all">All statuses</option><option value="unused">Unused</option><option value="correct">Correct</option><option value="incorrect">Incorrect</option><option value="flagged">Flagged</option></select><Button variant="outline" onClick={() => { setQuery(""); setSubject("all"); setTopic("all"); setStatus("all"); setPage(1); setError(""); setRetry((value) => value + 1); }}><Filter />Clear filters</Button></div></CardContent></Card>
      <div className="mt-5 flex items-center justify-between"><p className="text-sm text-muted-foreground"><span className="font-medium text-foreground">{result.total}</span> questions found</p><p className="text-xs text-muted-foreground">Page {currentPage} of {pages}</p></div>
      <div className="mt-2 min-h-5 text-xs text-muted-foreground" role="status" aria-live="polite">{pending ? "Updating questions…" : ""}</div>
      {error && !pending && <div role="alert" className="my-3 flex items-center gap-3 text-sm text-destructive">{error}<Button variant="outline" size="sm" onClick={() => setRetry((value) => value + 1)}>Retry</Button></div>}
      <div aria-busy={pending} className={`mt-1 space-y-3 ${pending ? "opacity-60" : ""}`}>{visible.map((question) => { const currentStatus = statuses[question.id] ?? "unused"; const categoryTags = new Set([nameSubject(question.subjectId).toLowerCase(), nameTopic(question.topicId).toLowerCase()]); const visibleTags = question.tags.filter((tag) => !categoryTags.has(tag)).slice(0, 4); return <Link prefetch={false} href={`/api/practice/${question.qid}`} key={question.id} className="group block rounded-2xl border bg-card p-4 transition-all hover:-translate-y-0.5 hover:border-emerald-300 hover:shadow-md sm:p-5"><div className="flex items-start gap-4"><div className="hidden size-10 shrink-0 place-items-center rounded-xl bg-muted text-xs font-semibold sm:grid">{question.qid}</div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><Badge variant="outline">{nameSubject(question.subjectId)}</Badge><span className="text-xs text-muted-foreground">{nameTopic(question.topicId)}</span><Badge className={statusStyle[currentStatus]}>{currentStatus === "flagged" && <Bookmark className="fill-current" />}{currentStatus}</Badge></div><p className="mt-3 line-clamp-2 text-sm font-medium leading-6 sm:text-[15px]">{question.stem}</p>{visibleTags.length > 0 && <div className="mt-2 flex flex-wrap gap-1.5" aria-label="Question tags">{visibleTags.map((tag) => <span key={tag} className="rounded-md bg-muted px-2 py-0.5 text-[11px] text-slate-600 dark:text-slate-300">{tag}</span>)}</div>}<p className="mt-2 text-xs text-muted-foreground">{question.optionCount} answer options · Detailed explanation</p></div><ChevronRight className="mt-2 size-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-1 group-hover:text-emerald-700" /></div></Link>})}{visible.length === 0 && <div className="rounded-2xl border border-dashed p-12 text-center"><Search className="mx-auto size-8 text-muted-foreground" /><p className="mt-3 font-medium">No questions match those filters</p><p className="mt-1 text-sm text-muted-foreground">Try a broader subject, tag, or keyword.</p></div>}</div>
      <div className="mt-5 flex items-center justify-between"><Button variant="outline" disabled={pending || currentPage <= 1} onClick={() => setPage(currentPage - 1)}><ChevronLeft />Previous</Button><div className="hidden items-center gap-1 sm:flex">{pageItems.map((item) => typeof item === "number" ? <Button key={item} size="icon-sm" aria-label={`Page ${item}`} aria-current={currentPage === item ? "page" : undefined} variant={currentPage === item ? "default" : "ghost"} disabled={pending} onClick={() => setPage(item)}>{item}</Button> : <span key={item} aria-hidden="true" className="px-1 text-muted-foreground">…</span>)}</div><Button variant="outline" disabled={pending || currentPage >= pages} onClick={() => setPage(currentPage + 1)}>Next<ChevronRight /></Button></div>
    </div>
  );
}
