import "server-only";
import { createHash } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import * as data from "@/lib/data-supabase";
import * as mock from "@/lib/data-mock";
import { isDemoSession } from "@/lib/demo-session";
import { requireEntitledUserId, SubscriptionRequiredError } from "@/lib/billing";
import { StudyConflictError } from "@/lib/study-errors";
import { uniqueAttempts, type SavedSession, type StudyFilters, type StudyOperation, type StudySnapshot } from "@/lib/study-core";
import type { Attempt, Session } from "@/lib/types";
import { verifiedQuestionGroups } from "@/lib/reviewed-question-groups";

export function readSessionFilters(raw: unknown): StudyFilters {
  const f = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
  const strings = (value: unknown) => Array.isArray(value) ? value.map(String) : [];
  const status = ["all", "unused", "correct", "incorrect", "flagged", "review"].includes(String(f.status)) ? String(f.status) as StudyFilters["status"] : "all";
  return { subjectIds: strings(f.subjectIds ?? f.subject_ids), topicIds: strings(f.topicIds ?? f.topic_ids), status, skippedIds: strings(f.skippedIds ?? f.skipped_question_ids), bank: f.bank === "full" ? "full" : "condensed" };
}
export function databaseSessionFilters(filters: StudyFilters) {
  return { subject_ids: filters.subjectIds, topic_ids: filters.topicIds, status: filters.status, bank: filters.bank ?? "condensed", skipped_question_ids: (filters.skippedIds ?? []).map(Number) };
}
function savedSession(s: Session, filters?: unknown): SavedSession { return { ...s, cursor: s.currentIndex ?? 0, starts: {}, eliminated: {}, filters: readSessionFilters(filters) }; }

export async function studySnapshot(metadataOnly = false): Promise<StudySnapshot & { download?: { questionIds: string[] } }> {
  const demo = await isDemoSession();
  const client = await createClient();
  const userId = demo ? "demo-user" : await requireEntitledUserId(client);
  const source = demo ? mock : data;
  const [profile, exam, questions, subjects, topics, flags, notes] = await Promise.all([
    source.getProfile(), source.getCurrentExam(), source.getQuestions(), source.getSubjects(), source.getTopics(), source.getFlaggedQuestionIds(), source.getNotes(),
  ]);
  if (!profile || !exam) throw new Error("Choose an exam in Settings before downloading study data.");
  let validUntil = new Date(Date.now() + 72 * 3600_000).toISOString();
  let attempts: Attempt[] = [];
  const sessions: Record<string, SavedSession> = {};
  if (demo) {
    const sample = mock.getSession("demo")!;
    sessions.demo = savedSession({ ...sample, secondsPerQuestion: exam.secondsPerQuestion });
  } else {
    const access = await client.rpc("billing_access_snapshot");
    if (access.error || !access.data || access.data.exam_id !== profile.examId) throw new Error("Study access could not be verified. Try again while online.");
    if (!access.data.allowed) throw new SubscriptionRequiredError();
    validUntil = access.data.valid_until;
    if (!Number.isFinite(Date.parse(validUntil)) || Date.parse(validUntil) <= Date.now()) throw new Error("Offline study access could not be verified.");
    const result = await client.from("sessions").select("id,mode,question_ids,seconds_per_question,current_index,created_at,finished_at,filters").eq("user_id", userId).order("created_at", { ascending: false }).limit(100);
    if (result.error) throw new Error(result.error.message);
    const ids = new Set(questions.map((q) => q.id));
    for (const row of result.data ?? []) {
      if (!row.question_ids.every((id: number) => ids.has(String(id)))) continue;
      sessions[row.id] = savedSession({ id: row.id, mode: row.mode, questionIds: row.question_ids.map(String), currentIndex: row.current_index, createdAt: row.created_at, finishedAt: row.finished_at ?? undefined, secondsPerQuestion: row.seconds_per_question ?? undefined }, row.filters);
    }
    // Keyset pagination avoids row shifts while another device saves an answer.
    let after: string | undefined;
    for (; !metadataOnly;) {
      let query = client.from("attempts").select("id,qid,session_id,chosen_index,correct,time_ms,created_at").eq("user_id", userId).order("id").limit(1000);
      if (after !== undefined) query = query.gt("id", after);
      const page = await query;
      if (page.error) throw new Error(page.error.message);
      for (const row of page.data ?? []) if (ids.has(String(row.qid))) attempts.push({ questionId: String(row.qid), sessionId: row.session_id ?? "", chosenIdx: row.chosen_index, correct: row.correct, timeMs: row.time_ms, createdAt: row.created_at });
      if (!page.data?.length || page.data.length < 1000) break;
      after = String(page.data[page.data.length - 1].id);
    }
    attempts = uniqueAttempts(attempts);
  }
  const paged = metadataOnly && !demo;
  return { version: 1, userId, examId: profile.examId, demo, profile, exam, questions: paged ? [] : questions, subjects, topics, flags, notes: paged ? {} : notes, sessions, attempts,
    ...(paged ? { download: { questionIds: questions.map((q) => q.id) } } : {}), reviewedGroups: verifiedQuestionGroups(questions), downloadedAt: new Date().toISOString(), validUntil, outbox: [] };
}

export async function studyDownloadPage(kind: string, cursor?: string) {
  const client = await createClient();
  const userId = await requireEntitledUserId(client);
  const exam = await data.getCurrentExam();
  if (!exam) throw new Error("Select an exam first.");
  if (kind === "questions") {
    if (cursor && !/^\d+$/.test(cursor)) throw new Error("Invalid question cursor.");
    const questions = await data.getStudyQuestionPage(Number(cursor ?? 0));
    return { userId, examId: exam.id, questions, next: questions.length === 100 ? String(questions.at(-1)!.qid) : null };
  }
  if (kind === "attempts") {
    if (cursor && !/^-?\d+$/.test(cursor)) throw new Error("Invalid history cursor.");
    let query = client.from("attempts").select("id,qid,session_id,chosen_index,correct,time_ms,created_at").eq("user_id", userId).order("id").limit(1000);
    if (cursor) query = query.gt("id", cursor);
    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);
    return { userId, examId: exam.id, attempts: (rows ?? []).map((r) => ({ questionId: String(r.qid), sessionId: r.session_id ?? "", chosenIdx: r.chosen_index, correct: r.correct, timeMs: r.time_ms, createdAt: r.created_at })), next: rows?.length === 1000 ? String(rows.at(-1)!.id) : null };
  }
  if (kind === "notes") {
    if (cursor && !/^\d+$/.test(cursor)) throw new Error("Invalid notes cursor.");
    const { data: rows, error } = await client.from("notes").select("qid,body").eq("user_id", userId).gt("qid", Number(cursor ?? 0)).order("qid").limit(100);
    if (error) throw new Error(error.message);
    return { userId, examId: exam.id, notes: Object.fromEntries((rows ?? []).map((r) => [String(r.qid), r.body])), next: rows?.length === 100 ? String(rows.at(-1)!.qid) : null };
  }
  throw new Error("Invalid download part.");
}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
// Negative IDs occupy a different range from the database's positive sequence.
// The same queued operation always produces the same primary key on retry.
export function operationRowId(operationId: string): number {
  return -Number.parseInt(createHash("sha256").update(operationId).digest("hex").slice(0, 13), 16) - 1;
}
export async function syncStudyOperation(userId: string, examId: string, raw: unknown) {
  if (!raw || typeof raw !== "object") throw new Error("Invalid study operation.");
  const op = raw as StudyOperation;
  if (!uuid.test(op.id ?? "") || !Number.isFinite(Date.parse(op.createdAt)) || Date.parse(op.createdAt) > Date.now() + 60_000) throw new Error("Invalid study timestamp or identifier.");
  const client = await createClient();
  const currentUser = await requireEntitledUserId(client);
  const exam = await data.getCurrentExam();
  if (currentUser !== userId || exam?.id !== examId) throw new Error("The signed-in account or exam changed. Sign in to the original account to sync.");
  const question = async (id: string) => {
    if (!/^\d+$/.test(id)) throw new Error("Invalid question.");
    const q = await data.getQuestion(id);
    if (!q) throw new Error("This question is no longer available for this exam.");
    const subjects = await data.getSubjects();
    if (!subjects.some((s) => s.id === q.subjectId && s.examId === examId)) throw new Error("This question belongs to another exam.");
    return q;
  };
  const session = async (id: string) => {
    if (!uuid.test(id)) throw new Error("Invalid session.");
    const result = await client.from("sessions").select("id,mode,question_ids,filters,current_index,finished_at").eq("id", id).eq("user_id", userId).maybeSingle();
    if (result.error) throw new Error(result.error.message);
    if (!result.data) throw new StudyConflictError("The session no longer exists online. Your saved work remains on this device.");
    const [questions, subjects] = await Promise.all([data.getQuestionsByIds(result.data.question_ids.map(String)), data.getSubjects()]);
    if (questions.length !== result.data.question_ids.length || questions.some((q) => !subjects.some((s) => s.id === q.subjectId && s.examId === examId))) throw new Error("This session belongs to another exam or contains unavailable questions.");
    return result.data;
  };
  const check = (result: { error: { message: string } | null }) => { if (result.error) throw new Error(result.error.message); };
  switch (op.kind) {
    case "session": {
      const s = op.session;
      if (!s || !uuid.test(s.id) || !["tutor", "timed"].includes(s.mode) || !Array.isArray(s.questionIds) || !s.questionIds.length || s.questionIds.length > 200 || new Set(s.questionIds).size !== s.questionIds.length || s.questionIds.some((id) => !/^\d+$/.test(id))) throw new Error("Invalid session.");
      const [available, subjects] = await Promise.all([data.getQuestionsByIds(s.questionIds), data.getSubjects()]);
      if (available.length !== s.questionIds.length || available.some((q) => !subjects.some((subject) => subject.id === q.subjectId && subject.examId === examId))) throw new Error("Some questions are unavailable in this exam.");
      const seconds = s.mode === "timed" ? Math.max(15, Math.min(600, Math.round(s.secondsPerQuestion ?? 90))) : null;
      check(await client.from("sessions").upsert({ id: s.id, user_id: userId, mode: s.mode, question_ids: s.questionIds.map(Number), seconds_per_question: seconds, filters: databaseSessionFilters(readSessionFilters(s.filters)), created_at: op.createdAt }, { onConflict: "id", ignoreDuplicates: true }));
      await session(s.id); break;
    }
    case "attempt": {
      const a = op.attempt;
      if (!a || !Number.isFinite(a.timeMs) || a.createdAt !== op.createdAt) throw new Error("Invalid answer.");
      const [s, q] = await Promise.all([session(a.sessionId), question(a.questionId)]);
      if (!s.question_ids.includes(q.qid) || (a.chosenIdx !== null && (!Number.isInteger(a.chosenIdx) || a.chosenIdx < 0 || a.chosenIdx >= q.options.length))) throw new Error("This answer does not belong to the session.");
      const existing = await client.from("attempts").select("chosen_index").eq("user_id", userId).eq("session_id", s.id).eq("qid", q.qid).limit(1);
      check(existing);
      if (existing.data?.length) {
        if (existing.data[0].chosen_index !== a.chosenIdx) throw new StudyConflictError("This question was answered differently on another device. Your local answer has been kept for review.");
        break;
      }
      if (s.finished_at) throw new StudyConflictError("This session has already finished on another device.");
      const id = operationRowId(op.id);
      const result = await client.from("attempts").insert({ id, user_id: userId, session_id: s.id, qid: q.qid, chosen_index: a.chosenIdx, correct: a.chosenIdx === q.answerIdx, time_ms: Math.max(0, Math.min(3_600_000, Math.round(a.timeMs))), created_at: op.createdAt });
      if (result.error) {
        const retry = await client.from("attempts").select("session_id,qid,chosen_index").eq("id", id).eq("user_id", userId).maybeSingle();
        if (!retry.data || retry.data.session_id !== s.id || retry.data.qid !== q.qid || retry.data.chosen_index !== a.chosenIdx) check(result);
      }
      break;
    }
    case "replace": {
      if (!Number.isInteger(op.index) || op.index < 0) throw new Error("Invalid question position.");
      const [s, q] = await Promise.all([session(op.sessionId), question(op.newId)]);
      const filters = readSessionFilters(s.filters);
      if (s.question_ids[op.index] === q.qid && filters.skippedIds?.includes(op.oldId)) break;
      if (String(s.question_ids[op.index]) !== op.oldId || s.finished_at || s.question_ids.includes(q.qid) || filters.skippedIds?.includes(op.newId)) throw new StudyConflictError("This session changed on another device. Choose which saved session to keep in Settings.");
      const oldAnswer = await client.from("attempts").select("id").eq("session_id", s.id).eq("qid", Number(op.oldId)).limit(1); check(oldAnswer);
      if (oldAnswer.data?.length) throw new StudyConflictError("This question was already answered online and cannot be replaced.");
      const [latest, flag] = await Promise.all([
        client.from("attempts").select("correct").eq("user_id", userId).eq("qid", q.qid).order("created_at", { ascending: false }).limit(1),
        client.from("flags").select("qid").eq("user_id", userId).eq("qid", q.qid).limit(1),
      ]); check(latest); check(flag);
      const statusMatches = filters.status === "unused" ? !latest.data?.length : filters.status === "correct" ? latest.data?.[0]?.correct === true : filters.status === "incorrect" ? latest.data?.[0]?.correct === false : filters.status === "flagged" ? Boolean(flag.data?.length) : true;
      if ((filters.subjectIds.length && !filters.subjectIds.includes(q.subjectId)) || (filters.topicIds.length && !filters.topicIds.includes(q.topicId)) || !statusMatches) throw new StudyConflictError("The replacement no longer matches this session's filters.");
      const ids = [...s.question_ids]; ids[op.index] = q.qid;
      filters.skippedIds = [...(filters.skippedIds ?? []), op.oldId];
      const updated = await client.from("sessions").update({ question_ids: ids, filters: databaseSessionFilters(filters) }).eq("id", s.id).eq("user_id", userId).eq("question_ids", `{${s.question_ids.join(",")}}`).select("id"); check(updated);
      if (!updated.data?.length) throw new Error("The session changed during sync. Try again.");
      break;
    }
    case "progress": {
      const s = await session(op.sessionId);
      if (!Number.isInteger(op.index) || op.index < 0 || op.index >= s.question_ids.length || typeof op.finished !== "boolean") throw new Error("Invalid session progress.");
      check(await client.from("sessions").update({ current_index: Math.max(s.current_index, op.index), ...(op.finished ? { finished_at: s.finished_at ?? op.createdAt } : {}) }).eq("id", s.id).eq("user_id", userId)); break;
    }
    case "flag": {
      const q = await question(op.questionId); if (typeof op.flagged !== "boolean") throw new Error("Invalid flag.");
      check(op.flagged ? await client.from("flags").upsert({ user_id: userId, qid: q.qid }) : await client.from("flags").delete().eq("user_id", userId).eq("qid", q.qid)); break;
    }
    case "note": {
      const q = await question(op.questionId); if (typeof op.body !== "string" || op.body.length > 5000) throw new Error("Keep notes under 5,000 characters.");
      check(op.body.trim() ? await client.from("notes").upsert({ user_id: userId, qid: q.qid, body: op.body.trim(), updated_at: op.createdAt }) : await client.from("notes").delete().eq("user_id", userId).eq("qid", q.qid)); break;
    }
    case "report": {
      const q = await question(op.questionId); if (typeof op.body !== "string" || !op.body.trim() || op.body.length > 2000) throw new Error("Enter a report under 2,000 characters.");
      check(await client.from("question_edits").upsert({ id: operationRowId(op.id), client_id: op.id, user_id: userId, qid: q.qid, field: "stem", suggestion: op.body.trim() }, { onConflict: "id", ignoreDuplicates: true })); break;
    }
    default: throw new Error("Unknown study operation.");
  }
}
