import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentExamId } from "@/lib/data-supabase";
import { normalizeQuestionFilters, QUESTION_PAGE_SIZE, type QuestionFilters, type QuestionLibraryFilters, type QuestionPage } from "@/lib/question-library";
import type { QuestionStatus, QuestionSummary } from "@/lib/types";

type Client = Awaited<ReturnType<typeof createClient>>;
type QueryError = { message: string; code?: string };
type ReadQuery<Row> = { range(from: number, to: number): PromiseLike<{ data: Row[] | null; error: QueryError | null; count: number | null }> };
type SummaryRow = { qid: number; subject_id: string; topic_id: string; stem: string; options: string[]; tags: string[] | null };
const SUMMARY_COLUMNS = "qid,subject_id,topic_id,stem,options,tags";

// Counts let independent pages of small ID/tag/status records load concurrently.
// Full stems and options are only read for the eight visible questions.
async function readAll<Row>(build: () => ReadQuery<Row>): Promise<Row[]> {
  const first = await build().range(0, 999);
  if (first.error) throw new Error(first.error.message);
  const rows = [...(first.data ?? [])];
  const pages = Math.ceil((first.count ?? rows.length) / 1000);
  for (let page = 1; page < pages; page += 4) {
    const results = await Promise.all(Array.from({ length: Math.min(4, pages - page) }, (_, index) => build().range((page + index) * 1000, (page + index + 1) * 1000 - 1)));
    for (const result of results) {
      if (result.error) throw new Error(result.error.message);
      rows.push(...(result.data ?? []));
    }
  }
  return rows;
}

const librarySubjects = cache(async () => {
  const supabase = await createClient();
  const examId = await getCurrentExamId();
  const { data, error } = await supabase.from("subjects").select("id,name").eq("exam_id", examId).order("sort").order("name");
  if (error) throw new Error(error.message);
  return (data ?? []) as QuestionLibraryFilters["subjects"];
});

export const getQuestionLibraryFilters = cache(async (): Promise<QuestionLibraryFilters> => {
  const supabase = await createClient();
  const subjects = await librarySubjects();
  if (!subjects.length) return { subjects, topics: [] };
  const rows = await readAll<{ id: string; subject_id: string; name: string }>(() => supabase.from("topics").select("id,subject_id,name", { count: "exact" }).in("subject_id", subjects.map(({ id }) => id)).order("subject_id").order("name").order("id"));
  return { subjects, topics: rows.map((row) => ({ id: row.id, subjectId: row.subject_id, name: row.name })) };
});

async function readStatuses(supabase: Client, qids?: number[]): Promise<Record<string, QuestionStatus>> {
  if (qids && !qids.length) return {};
  const [attempts, flags] = await Promise.all([
    readAll<{ qid: number; last_correct: boolean; flagged: boolean }>(() => {
      const query = supabase.from("user_question_status").select("qid,last_correct,flagged", { count: "exact" });
      return (qids ? query.in("qid", qids) : query).order("qid");
    }),
    readAll<{ qid: number }>(() => {
      const query = supabase.from("flags").select("qid", { count: "exact" });
      return (qids ? query.in("qid", qids) : query).order("qid");
    }),
  ]);
  const statuses: Record<string, QuestionStatus> = {};
  for (const row of attempts) statuses[String(row.qid)] = row.flagged ? "flagged" : row.last_correct ? "correct" : "incorrect";
  for (const row of flags) statuses[String(row.qid)] = "flagged";
  return statuses;
}

const summary = (row: SummaryRow): QuestionSummary => ({ id: String(row.qid), qid: row.qid, subjectId: row.subject_id, topicId: row.topic_id, stem: row.stem, optionCount: row.options.length, tags: row.tags ?? [] });

export async function getQuestionPage(input: QuestionFilters): Promise<QuestionPage> {
  const filters = normalizeQuestionFilters(input);
  const supabase = await createClient();
  const subjects = await librarySubjects();
  const subjectIds = subjects.map(({ id }) => id).filter((id) => filters.subject === "all" || id === filters.subject);
  const empty: QuestionPage = { questions: [], statuses: {}, total: 0, page: 1, pageSize: QUESTION_PAGE_SIZE };
  if (!subjectIds.length) return empty;
  const scoped = (columns: string, head = false) => {
    const query = supabase.from("questions").select(columns, { count: "exact", head }).in("subject_id", subjectIds);
    return filters.topic === "all" ? query : query.eq("topic_id", filters.topic);
  };

  let rows: SummaryRow[];
  let total: number;
  let page: number;
  let statuses: Record<string, QuestionStatus> | undefined;
  if (!filters.query && filters.status === "all") {
    // The common path needs one bounded content read, not the whole exam bank.
    let result = await scoped(SUMMARY_COLUMNS).order("qid").range((filters.page - 1) * QUESTION_PAGE_SIZE, filters.page * QUESTION_PAGE_SIZE - 1);
    if (result.error && result.error.code !== "PGRST103") throw new Error(result.error.message);
    if (result.error) {
      const countResult = await scoped("qid", true);
      if (countResult.error) throw new Error(countResult.error.message);
      total = countResult.count ?? 0;
    } else {
      total = result.count ?? 0;
    }
    page = Math.min(filters.page, Math.max(1, Math.ceil(total / QUESTION_PAGE_SIZE)));
    if (page !== filters.page) {
      result = await scoped(SUMMARY_COLUMNS).order("qid").range((page - 1) * QUESTION_PAGE_SIZE, page * QUESTION_PAGE_SIZE - 1);
      if (result.error) throw new Error(result.error.message);
    }
    rows = (result.data ?? []) as unknown as SummaryRow[];
  } else {
    // PostgREST cannot substring-match text[] tags. Match those and partial IDs
    // against compact metadata; stem matching still happens in the database.
    // Candidate IDs never become an unbounded URL or client-side question bank.
    const query = filters.query.toLowerCase();
    const pattern = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const [metadata, stemMatches, allStatuses] = await Promise.all([
      readAll<{ qid: number; tags?: string[] | null }>(() => scoped(query ? "qid,tags" : "qid").order("qid") as unknown as ReadQuery<{ qid: number; tags?: string[] | null }>),
      query ? readAll<{ qid: number }>(() => scoped("qid").filter("stem", "imatch", pattern).order("qid") as unknown as ReadQuery<{ qid: number }>) : Promise.resolve([]),
      filters.status === "all" ? Promise.resolve(undefined) : readStatuses(supabase),
    ]);
    statuses = allStatuses;
    const stemIds = new Set(stemMatches.map(({ qid }) => qid));
    const matches = metadata.filter(({ qid, tags }) => (
      (!query || stemIds.has(qid) || String(qid).includes(query) || tags?.some((tag) => tag.toLowerCase().includes(query)))
      && (filters.status === "all" || (statuses?.[String(qid)] ?? "unused") === filters.status)
    ));
    total = matches.length;
    page = Math.min(filters.page, Math.max(1, Math.ceil(total / QUESTION_PAGE_SIZE)));
    const qids = matches.slice((page - 1) * QUESTION_PAGE_SIZE, page * QUESTION_PAGE_SIZE).map(({ qid }) => qid);
    if (!qids.length) return empty;
    const { data, error } = await scoped(SUMMARY_COLUMNS).in("qid", qids).order("qid");
    if (error) throw new Error(error.message);
    rows = (data ?? []) as unknown as SummaryRow[];
  }
  statuses ??= await readStatuses(supabase, rows.map(({ qid }) => qid));
  return { questions: rows.map(summary), statuses: Object.fromEntries(rows.map(({ qid }) => [String(qid), statuses[String(qid)] ?? "unused"])), total, page, pageSize: QUESTION_PAGE_SIZE };
}
