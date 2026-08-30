import "server-only";
import { cache } from "react";
import { createClient, currentUserId } from "@/lib/supabase/server";
import { fetchApprovedPublicSubjects } from "@/lib/public-subjects";
import { torontoDateKey } from "@/lib/utils";
import type { Attempt, DailyActivity, DashboardStats, Profile, Question, QuestionStatus, QuestionSummary, Session, Subject, SubjectStats, Topic, TopicStats, Exam } from "@/lib/types";

// Row shapes (subset of columns we read)
type QuestionRow = { qid: number; subject_id: string; topic_id: string; stem: string; options: string[]; answer_index: number; explanation: string[]; tags: string[] | null; figure_url: string | null; references_text: string | null; key_points: string | null; answer_key: string | null; option_explanations: Record<string, string> | null; editorial_status: "pending" | "reviewed" | "stale" | "personal"; last_reviewed_at: string | null; reviewer_role: string | null; reference_exception: string | null; source: string };
type QuestionImageRow = { qid: number; image_index: number };
type SessionRow = { id: string; mode: "tutor" | "timed"; question_ids: number[]; seconds_per_question: number | null; current_index: number; created_at: string; finished_at: string | null };
type AttemptRow = { qid: number; session_id: string | null; chosen_index: number | null; correct: boolean; time_ms: number; created_at: string };

const toQuestion = (r: QuestionRow, imageIndexes: number[] = []): Question => ({
  id: String(r.qid), qid: r.qid, subjectId: r.subject_id, topicId: r.topic_id, stem: r.stem,
  options: r.options, answerIdx: r.answer_index, explanation: r.explanation, tags: r.tags ?? [],
  references: (r.references_text ?? "").split(/\r?\n/).map((value) => value.trim()).filter(Boolean),
  keyPoints: r.key_points ?? undefined,
  answerKey: r.answer_key ?? undefined,
  optionExplanations: r.option_explanations ?? undefined,
  editorialStatus: r.editorial_status,
  lastReviewedAt: r.last_reviewed_at ?? undefined,
  reviewerRole: r.reviewer_role ?? undefined,
  referenceException: r.reference_exception ?? undefined,
  isPersonal: r.source === "user",
  figureUrl: imageIndexes.length ? `/api/qbank-images/${r.qid}/${imageIndexes[0]}` : r.figure_url ?? undefined,
  figureUrls: imageIndexes.map((imageIndex) => `/api/qbank-images/${r.qid}/${imageIndex}`),
});
const toSession = (r: SessionRow): Session => ({
  id: r.id, mode: r.mode, questionIds: r.question_ids.map(String), createdAt: r.created_at,
  finishedAt: r.finished_at ?? undefined, secondsPerQuestion: r.seconds_per_question ?? undefined, currentIndex: r.current_index,
});
const toAttempt = (r: AttemptRow): Attempt => ({
  questionId: String(r.qid), sessionId: r.session_id ?? "", chosenIdx: r.chosen_index, correct: r.correct, timeMs: r.time_ms, createdAt: r.created_at,
});

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;
type PageQuery<Row> = { range(from: number, to: number): PromiseLike<{ data: Row[] | null; error: { message: string } | null }> };

/** Reads every row of a PostgREST query in 1000-row pages (PostgREST caps each response at 1000 rows). */
async function fetchAll<Row>(build: () => PageQuery<Row>, pageSize = 1000): Promise<Row[]> {
  const rows: Row[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await build().range(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    rows.push(...(data ?? []));
    if (!data || data.length < pageSize) break;
  }
  return rows;
}

async function getQuestionImageIndexes(
  supabase: SupabaseServerClient,
  qids?: number[],
): Promise<Map<number, number[]>> {
  if (qids && !qids.length) return new Map();
  const rows = await fetchAll<QuestionImageRow>(() => {
    const query = supabase.from("qbank_question_images").select("qid,image_index");
    return (qids ? query.in("qid", qids) : query).order("qid").order("image_index");
  });
  const byQid = new Map<number, number[]>();
  for (const row of rows) {
    const indexes = byQid.get(row.qid) ?? [];
    indexes.push(row.image_index);
    byQid.set(row.qid, indexes);
  }
  return byQid;
}

// ---------- content ----------
export const DEFAULT_EXAM_ID = "mccqe";

export async function getExams(): Promise<Exam[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("exams").select("id,name,short_name,seconds_per_question,section_size").order("sort");
  return (data ?? []).map((r: { id: string; name: string; short_name: string; seconds_per_question: number; section_size: number }) => ({ id: r.id, name: r.name, shortName: r.short_name, secondsPerQuestion: r.seconds_per_question, sectionSize: r.section_size }));
}

/** The signed-in learner's active exam; content queries are scoped to it. */
export const getCurrentExamId = cache(async (): Promise<string> => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const id = data?.claims?.sub as string | undefined;
  if (!id) return DEFAULT_EXAM_ID;
  const { data: profile } = await supabase.from("profiles").select("exam_id").eq("id", id).maybeSingle();
  if (profile?.exam_id) return profile.exam_id;
  // New accounts have no profile row yet; honour the exam chosen at signup.
  const metadataExam = (data?.claims?.user_metadata as { exam_id?: string } | undefined)?.exam_id;
  return typeof metadataExam === "string" && /^[a-z0-9-]{2,32}$/.test(metadataExam) ? metadataExam : DEFAULT_EXAM_ID;
});

export async function getCurrentExam(): Promise<Exam | undefined> {
  const examId = await getCurrentExamId();
  return (await getExams()).find((exam) => exam.id === examId);
}

export async function getSubjects(): Promise<Subject[]> {
  const supabase = await createClient();
  const examId = await getCurrentExamId();
  const { data } = await supabase.from("subject_counts").select("id,name,question_count,exam_id").eq("exam_id", examId);
  return (data ?? []).map((r: { id: string; name: string; question_count: number; exam_id: string }) => ({ id: r.id, name: r.name, questionCount: r.question_count, examId: r.exam_id }));
}

const getSubjectIds = cache(async (): Promise<string[]> => (await getSubjects()).map((subject) => subject.id));

export async function getPublicSubjects(): Promise<Subject[]> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !key) throw new Error("Public catalog configuration is unavailable.");
  return fetchApprovedPublicSubjects(url, key);
}

export async function getTopics(subjectId?: string): Promise<Topic[]> {
  const supabase = await createClient();
  let q = supabase.from("topic_counts").select("id,subject_id,name,question_count").range(0, 4999);
  q = subjectId ? q.eq("subject_id", subjectId) : q.in("subject_id", await getSubjectIds());
  const { data } = await q;
  return (data ?? []).map((r: { id: string; subject_id: string; name: string; question_count: number }) => ({ id: r.id, subjectId: r.subject_id, name: r.name, questionCount: r.question_count }));
}

const QUESTION_SELECT = "qid,subject_id,topic_id,stem,options,answer_index,explanation,tags,figure_url,references_text,key_points,answer_key,option_explanations,editorial_status,last_reviewed_at,reviewer_role,reference_exception,source";

export async function getQuestions(): Promise<Question[]> {
  const supabase = await createClient();
  const subjectIds = await getSubjectIds();
  const rows = await fetchAll<QuestionRow>(() => supabase.from("questions").select(QUESTION_SELECT).in("subject_id", subjectIds).order("qid"));
  const images = await getQuestionImageIndexes(supabase);
  return rows.map((row) => toQuestion(row, images.get(row.qid)));
}

export async function getQuestionSummaries(): Promise<QuestionSummary[]> {
  const supabase = await createClient();
  const subjectIds = await getSubjectIds();
  // `options` is read only to derive optionCount; the option text never reaches the client.
  const rows = await fetchAll<{ qid: number; subject_id: string; topic_id: string; stem: string; options: string[]; tags: string[] | null }>(() => supabase.from("questions").select("qid,subject_id,topic_id,stem,options,tags").in("subject_id", subjectIds).order("qid"));
  return rows.map((row) => ({ id: String(row.qid), qid: row.qid, subjectId: row.subject_id, topicId: row.topic_id, stem: row.stem, optionCount: row.options.length, tags: row.tags ?? [] }));
}

export async function getQuestion(id: string): Promise<Question | undefined> {
  const supabase = await createClient();
  const { data } = await supabase.from("questions").select(QUESTION_SELECT).eq("qid", Number(id)).maybeSingle();
  if (!data) return undefined;
  const images = await getQuestionImageIndexes(supabase, [data.qid]);
  return toQuestion(data, images.get(data.qid));
}

export async function getQuestionsByIds(ids: string[]): Promise<Question[]> {
  if (!ids.length) return [];
  const supabase = await createClient();
  const { data } = await supabase.from("questions").select(QUESTION_SELECT).in("qid", ids.map(Number));
  const rows = (data ?? []) as QuestionRow[];
  const images = await getQuestionImageIndexes(supabase, rows.map((row) => row.qid));
  const byId = new Map(rows.map((r) => [String(r.qid), toQuestion(r, images.get(r.qid))]));
  return ids.map((id) => byId.get(id)).filter((q): q is Question => Boolean(q));
}

// ---------- per-user status ----------
export async function getQuestionStatuses(): Promise<Record<string, QuestionStatus>> {
  const supabase = await createClient();
  const [data, flags] = await Promise.all([
    fetchAll<{ qid: number; last_correct: boolean; flagged: boolean }>(() => supabase.from("user_question_status").select("qid,last_correct,flagged").order("qid")),
    fetchAll<{ qid: number }>(() => supabase.from("flags").select("qid").order("qid")),
  ]);
  const out: Record<string, QuestionStatus> = {};
  for (const r of data) out[String(r.qid)] = r.flagged ? "flagged" : r.last_correct ? "correct" : "incorrect";
  for (const r of flags) out[String(r.qid)] = "flagged";
  return out;
}

export async function getQuestionStatus(id: string): Promise<QuestionStatus> {
  const supabase = await createClient();
  const [{ data }, { data: flag }] = await Promise.all([
    supabase.from("user_question_status").select("last_correct,flagged").eq("qid", Number(id)).maybeSingle(),
    supabase.from("flags").select("qid").eq("qid", Number(id)).maybeSingle(),
  ]);
  return flag ? "flagged" : !data ? "unused" : data.flagged ? "flagged" : data.last_correct ? "correct" : "incorrect";
}

export async function getFlaggedQuestions(): Promise<Question[]> {
  const supabase = await createClient();
  const data = await fetchAll<{ qid: number }>(() => supabase.from("flags").select("qid").order("created_at", { ascending: false }));
  return getQuestionsByIds(data.map((r) => String(r.qid)));
}

export async function getFlaggedQuestionIds(questionIds?: string[]): Promise<string[]> {
  const supabase = await createClient();
  const data = await fetchAll<{ qid: number }>(() => {
    const query = supabase.from("flags").select("qid");
    return (questionIds?.length ? query.in("qid", questionIds.map(Number)) : query).order("qid");
  });
  return data.map((row) => String(row.qid));
}

export async function getNotes(questionIds?: string[]): Promise<Record<string, string>> {
  const supabase = await createClient();
  const data = await fetchAll<{ qid: number; body: string }>(() => {
    const query = supabase.from("notes").select("qid,body");
    return (questionIds?.length ? query.in("qid", questionIds.map(Number)) : query).order("qid");
  });
  return Object.fromEntries(data.map((r) => [String(r.qid), r.body]));
}

// ---------- sessions ----------
export async function getSession(id: string): Promise<Session | undefined> {
  const supabase = await createClient();
  const { data } = await supabase.from("sessions").select("id,mode,question_ids,seconds_per_question,current_index,created_at,finished_at").eq("id", id).maybeSingle();
  return data ? toSession(data) : undefined;
}

export async function getSessionQuestions(id: string): Promise<Question[]> {
  const session = await getSession(id);
  return session ? getQuestionsByIds(session.questionIds) : [];
}

export async function getSessionAttempts(id: string): Promise<Attempt[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("attempts").select("qid,session_id,chosen_index,correct,time_ms,created_at").eq("session_id", id).order("created_at");
  return (data ?? []).map(toAttempt);
}

export async function getRecentSessions(limit = 8): Promise<Session[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("sessions").select("id,mode,question_ids,seconds_per_question,current_index,created_at,finished_at").order("created_at", { ascending: false }).limit(limit);
  const sessions = (data ?? []).map(toSession);
  if (!sessions.length) return sessions;
  const { data: attempts } = await supabase.from("attempts").select("session_id,correct,time_ms").in("session_id", sessions.map((s) => s.id));
  for (const s of sessions) {
    const mine = (attempts ?? []).filter((a) => a.session_id === s.id);
    s.attempted = mine.length; s.correct = mine.filter((a) => a.correct).length; s.durationMs = mine.reduce((sum, a) => sum + a.time_ms, 0);
  }
  return sessions;
}

// ---------- stats ----------
export async function getTopicStats(): Promise<TopicStats[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("topic_stats").select("topic_id,attempted,correct,avg_time_ms");
  return (data ?? []).map((r) => ({ topicId: r.topic_id, attempted: r.attempted, correct: r.correct, avgTimeMs: r.avg_time_ms ?? 0 }));
}

/**
 * Consecutive days with at least one attempt, ending today or yesterday.
 * `today` is a YYYY-MM-DD key in America/Toronto (injectable for tests); days are
 * stepped with UTC-noon arithmetic so DST changes never skip or repeat a date.
 */
export function streakFrom(activity: DailyActivity[], today = torontoDateKey()): number {
  const days = new Set(activity.filter((d) => d.attempted > 0).map((d) => d.date));
  const previousDay = (key: string) => new Date(Date.parse(`${key}T12:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
  let streak = 0;
  let cursor = today;
  // allow today to be empty (streak counts up to yesterday)
  if (!days.has(cursor)) cursor = previousDay(cursor);
  while (days.has(cursor)) { streak++; cursor = previousDay(cursor); }
  return streak;
}

export async function getDashboardStats(): Promise<DashboardStats> {
  const supabase = await createClient();
  const subjectIds = await getSubjectIds();
  const [{ count: totalQuestions }, subjectsRes, topicsRes, activityRes, { count: attemptedCount }, { count: correctCount }] = await Promise.all([
    supabase.from("questions").select("qid", { count: "exact", head: true }).in("subject_id", subjectIds),
    supabase.from("subject_stats").select("subject_id,attempted,correct,avg_time_ms"),
    supabase.from("topic_stats").select("topic_id,attempted,correct,avg_time_ms").gte("attempted", 3),
    supabase.from("daily_activity").select("day,attempted,correct").order("day", { ascending: false }).limit(120),
    supabase.from("user_question_status").select("qid", { count: "exact", head: true }),
    supabase.from("user_question_status").select("qid", { count: "exact", head: true }).eq("last_correct", true),
  ]);
  const subjects: SubjectStats[] = (subjectsRes.data ?? []).filter((r) => subjectIds.includes(r.subject_id)).map((r) => ({ subjectId: r.subject_id, attempted: r.attempted, correct: r.correct, avgTimeMs: r.avg_time_ms ?? 0 }));
  const weakestTopics: TopicStats[] = (topicsRes.data ?? [])
    .map((r) => ({ topicId: r.topic_id, attempted: r.attempted, correct: r.correct, avgTimeMs: r.avg_time_ms ?? 0 }))
    .sort((a, b) => a.correct / a.attempted - b.correct / b.attempted).slice(0, 5);
  const byDay = new Map((activityRes.data ?? []).map((r) => [r.day as string, { attempted: r.attempted as number, correct: r.correct as number }]));
  const activity: DailyActivity[] = [];
  const today = torontoDateKey();
  const todayNoon = Date.parse(`${today}T12:00:00Z`);
  for (let i = 83; i >= 0; i--) {                                 // full 12-week series, zero-filled
    const key = new Date(todayNoon - i * 86_400_000).toISOString().slice(0, 10);
    activity.push({ date: key, ...(byDay.get(key) ?? { attempted: 0, correct: 0 }) });
  }
  return {
    totalQuestions: totalQuestions ?? 0,
    attempted: attemptedCount ?? 0,
    correct: correctCount ?? 0,
    streakDays: streakFrom(activity, today),
    subjects, weakestTopics, activity,
  };
}

export async function getUserId() { return currentUserId(); }

export const getProfile = cache(async (): Promise<Profile | null> => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const id = data?.claims?.sub as string | undefined;
  if (!id) return null;
  const [{ data: profile }, { data: activity }] = await Promise.all([
    supabase.from("profiles").select("display_name,medical_school,target_exam_date,daily_reminder,show_shortcuts,explanation_auto_scroll,exam_id").eq("id", id).maybeSingle(),
    supabase.from("daily_activity").select("day,attempted,correct").order("day", { ascending: false }).limit(400),
  ]);
  const email = (data?.claims?.email as string | undefined) ?? "";
  const streakDays = streakFrom((activity ?? []).map((r) => ({ date: r.day, attempted: r.attempted, correct: r.correct })));
  return {
    id,
    name: profile?.display_name || email.split("@")[0],
    email,
    streakDays,
    medicalSchool: profile?.medical_school ?? "",
    targetExamDate: profile?.target_exam_date ?? "",
    dailyReminder: profile?.daily_reminder ?? true,
    showShortcuts: profile?.show_shortcuts ?? true,
    explanationAutoScroll: profile?.explanation_auto_scroll ?? false,
    examId: profile?.exam_id ?? DEFAULT_EXAM_ID,
  };
});
