import "server-only";
import { createClient, currentUserId } from "@/lib/supabase/server";
import type { Attempt, DailyActivity, DashboardStats, Profile, Question, QuestionStatus, QuestionSummary, Session, Subject, SubjectStats, Topic, TopicStats } from "@/lib/types";

// Row shapes (subset of columns we read)
type QuestionRow = { qid: number; subject_id: string; topic_id: string; stem: string; options: string[]; answer_index: number; explanation: string[]; figure_url: string | null };
type SessionRow = { id: string; mode: "tutor" | "timed"; question_ids: number[]; seconds_per_question: number | null; current_index: number; created_at: string; finished_at: string | null };
type AttemptRow = { qid: number; session_id: string | null; chosen_index: number | null; correct: boolean; time_ms: number; created_at: string };

const toQuestion = (r: QuestionRow): Question => ({
  id: String(r.qid), qid: r.qid, subjectId: r.subject_id, topicId: r.topic_id, stem: r.stem,
  options: r.options, answerIdx: r.answer_index, explanation: r.explanation, figureUrl: r.figure_url ?? undefined,
});
const toSession = (r: SessionRow): Session => ({
  id: r.id, mode: r.mode, questionIds: r.question_ids.map(String), createdAt: r.created_at,
  finishedAt: r.finished_at ?? undefined, secondsPerQuestion: r.seconds_per_question ?? undefined, currentIndex: r.current_index,
});
const toAttempt = (r: AttemptRow): Attempt => ({
  questionId: String(r.qid), sessionId: r.session_id ?? "", chosenIdx: r.chosen_index, correct: r.correct, timeMs: r.time_ms, createdAt: r.created_at,
});

// ---------- content ----------
export async function getSubjects(): Promise<Subject[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("subject_counts").select("id,name,question_count");
  return (data ?? []).map((r: { id: string; name: string; question_count: number }) => ({ id: r.id, name: r.name, questionCount: r.question_count }));
}

export async function getPublicSubjects(): Promise<Subject[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_public_subject_counts");
  if (error) throw new Error(error.message);
  return (data ?? []).map((r: { id: string; name: string; question_count: number }) => ({ id: r.id, name: r.name, questionCount: r.question_count }));
}

export async function getTopics(subjectId?: string): Promise<Topic[]> {
  const supabase = await createClient();
  let q = supabase.from("topic_counts").select("id,subject_id,name,question_count").range(0, 4999);
  if (subjectId) q = q.eq("subject_id", subjectId);
  const { data } = await q;
  return (data ?? []).map((r: { id: string; subject_id: string; name: string; question_count: number }) => ({ id: r.id, subjectId: r.subject_id, name: r.name, questionCount: r.question_count }));
}

export async function getQuestions(): Promise<Question[]> {
  const supabase = await createClient();
  const rows: QuestionRow[] = [];
  for (let from = 0; ; from += 1000) {                     // PostgREST caps each response at 1000 rows
    const { data } = await supabase.from("questions").select("qid,subject_id,topic_id,stem,options,answer_index,explanation,figure_url").order("qid").range(from, from + 999);
    rows.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  return rows.map(toQuestion);
}

export async function getQuestionSummaries(): Promise<QuestionSummary[]> {
  const supabase = await createClient();
  const rows: Array<{ qid: number; subject_id: string; topic_id: string; stem: string; options: string[] }> = [];
  for (let from = 0; ; from += 1000) {
    const { data } = await supabase.from("questions").select("qid,subject_id,topic_id,stem,options").order("qid").range(from, from + 999);
    rows.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  return rows.map((row) => ({ id: String(row.qid), qid: row.qid, subjectId: row.subject_id, topicId: row.topic_id, stem: row.stem, optionCount: row.options.length }));
}

export async function getQuestion(id: string): Promise<Question | undefined> {
  const supabase = await createClient();
  const { data } = await supabase.from("questions").select("qid,subject_id,topic_id,stem,options,answer_index,explanation,figure_url").eq("qid", Number(id)).maybeSingle();
  return data ? toQuestion(data) : undefined;
}

export async function getQuestionsByIds(ids: string[]): Promise<Question[]> {
  if (!ids.length) return [];
  const supabase = await createClient();
  const { data } = await supabase.from("questions").select("qid,subject_id,topic_id,stem,options,answer_index,explanation,figure_url").in("qid", ids.map(Number));
  const byId = new Map((data ?? []).map((r) => [String(r.qid), toQuestion(r)]));
  return ids.map((id) => byId.get(id)).filter((q): q is Question => Boolean(q));
}

// ---------- per-user status ----------
export async function getQuestionStatuses(): Promise<Record<string, QuestionStatus>> {
  const supabase = await createClient();
  const [{ data }, { data: flags }] = await Promise.all([
    supabase.from("user_question_status").select("qid,last_correct,flagged"),
    supabase.from("flags").select("qid"),
  ]);
  const out: Record<string, QuestionStatus> = {};
  for (const r of data ?? []) out[String(r.qid)] = r.flagged ? "flagged" : r.last_correct ? "correct" : "incorrect";
  for (const r of flags ?? []) out[String(r.qid)] = "flagged";
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
  const { data } = await supabase.from("flags").select("qid").order("created_at", { ascending: false });
  return getQuestionsByIds((data ?? []).map((r) => String(r.qid)));
}

export async function getFlaggedQuestionIds(questionIds?: string[]): Promise<string[]> {
  const supabase = await createClient();
  let query = supabase.from("flags").select("qid");
  if (questionIds?.length) query = query.in("qid", questionIds.map(Number));
  const { data } = await query;
  return (data ?? []).map((row) => String(row.qid));
}

export async function getNotes(questionIds?: string[]): Promise<Record<string, string>> {
  const supabase = await createClient();
  let query = supabase.from("notes").select("qid,body");
  if (questionIds?.length) query = query.in("qid", questionIds.map(Number));
  const { data } = await query;
  return Object.fromEntries((data ?? []).map((r) => [String(r.qid), r.body]));
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

function streakFrom(activity: DailyActivity[]): number {
  const days = new Set(activity.filter((d) => d.attempted > 0).map((d) => d.date));
  let streak = 0;
  const cursor = new Date();
  // allow today to be empty (streak counts up to yesterday)
  if (!days.has(cursor.toISOString().slice(0, 10))) cursor.setDate(cursor.getDate() - 1);
  while (days.has(cursor.toISOString().slice(0, 10))) { streak++; cursor.setDate(cursor.getDate() - 1); }
  return streak;
}

export async function getDashboardStats(): Promise<DashboardStats> {
  const supabase = await createClient();
  const [{ count: totalQuestions }, subjectsRes, topicsRes, activityRes, uniqueRes] = await Promise.all([
    supabase.from("questions").select("qid", { count: "exact", head: true }),
    supabase.from("subject_stats").select("subject_id,attempted,correct,avg_time_ms"),
    supabase.from("topic_stats").select("topic_id,attempted,correct,avg_time_ms").gte("attempted", 3),
    supabase.from("daily_activity").select("day,attempted,correct").order("day", { ascending: false }).limit(120),
    supabase.from("user_question_status").select("qid,last_correct"),
  ]);
  const subjects: SubjectStats[] = (subjectsRes.data ?? []).map((r) => ({ subjectId: r.subject_id, attempted: r.attempted, correct: r.correct, avgTimeMs: r.avg_time_ms ?? 0 }));
  const weakestTopics: TopicStats[] = (topicsRes.data ?? [])
    .map((r) => ({ topicId: r.topic_id, attempted: r.attempted, correct: r.correct, avgTimeMs: r.avg_time_ms ?? 0 }))
    .sort((a, b) => a.correct / a.attempted - b.correct / b.attempted).slice(0, 5);
  const byDay = new Map((activityRes.data ?? []).map((r) => [r.day as string, { attempted: r.attempted as number, correct: r.correct as number }]));
  const activity: DailyActivity[] = [];
  for (let i = 83; i >= 0; i--) {                                 // full 12-week series, zero-filled
    const d = new Date(); d.setDate(d.getDate() - i);
    const key = d.toLocaleDateString("en-CA", { timeZone: "America/Toronto" });
    activity.push({ date: key, ...(byDay.get(key) ?? { attempted: 0, correct: 0 }) });
  }
  const unique = uniqueRes.data ?? [];
  return {
    totalQuestions: totalQuestions ?? 0,
    attempted: unique.length,
    correct: unique.filter((r) => r.last_correct).length,
    streakDays: streakFrom(activity),
    subjects, weakestTopics, activity,
  };
}

export async function getUserId() { return currentUserId(); }

export async function getProfile(): Promise<Profile | null> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const id = data?.claims?.sub as string | undefined;
  if (!id) return null;
  const [{ data: profile }, { data: activity }] = await Promise.all([
    supabase.from("profiles").select("display_name,medical_school,target_exam_date,daily_reminder,show_shortcuts,explanation_auto_scroll").eq("id", id).maybeSingle(),
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
  };
}
