import { describe, expect, it } from "vitest";
import { applyStudyOperation, completedToday, dailyTarget, dueReviews, eligibleReplacement, learningPeriods, makeStudySession, mergeStudySnapshot, nextSyncOperation, resolveSessionConflict, planDays, plannedQuestionIds, questionPool, shiftDay, studyStatistics, uniqueAttempts, validateStudyPlan, type StudyOperation, type StudySnapshot } from "@/lib/study-core";
import { questions, subjects, topics } from "@/lib/mock";
import type { Attempt } from "@/lib/types";

const now = new Date("2026-09-25T12:00:00");
const plan = { examDate: "2026-10-25", minutesPerDay: 60, minutesPerQuestion: 2 };
function fixture(): StudySnapshot {
  return { version: 1, userId: "user-one", examId: "mccqe", demo: false, profile: { id: "user-one", name: "Learner", email: "learner@example.test", medicalSchool: "", targetExamDate: plan.examDate, streakDays: 0, dailyReminder: false, showShortcuts: true, explanationAutoScroll: false, examId: "mccqe" }, exam: { id: "mccqe", name: "MCCQE", shortName: "MCCQE", secondsPerQuestion: 83, sectionSize: 115 }, questions: questions.slice(0, 30), subjects, topics, flags: [], notes: {}, attempts: [], sessions: {}, downloadedAt: now.toISOString(), validUntil: new Date(+now + 72 * 3600_000).toISOString(), outbox: [], plan };
}
const operation = (input: Omit<Extract<StudyOperation, { kind: "replace" }>, "id" | "createdAt">): StudyOperation => ({ id: "replace-one", createdAt: now.toISOString(), ...input });
const answer = (qid: string, sessionId: string, correct: boolean, date = now): Attempt => ({ questionId: qid, sessionId, correct, chosenIdx: correct ? 2 : 0, timeMs: 1000, createdAt: date.toISOString() });

it("retains browser highlights on refresh and isolates them by account and exam", () => {
  const local = fixture();
  local.highlights = { question: [{ id: "one", region: "stem", start: 0, end: 4, quote: "text", prefix: "", suffix: "" }] };
  expect(mergeStudySnapshot(local, fixture()).highlights).toEqual(local.highlights);
  expect(mergeStudySnapshot(local, { ...fixture(), userId: "someone-else" }).highlights).toBeUndefined();
  expect(mergeStudySnapshot(local, { ...fixture(), examId: "usmle" }).highlights).toBeUndefined();
  local.highlights = { question: [] };
  expect(mergeStudySnapshot(local, fixture()).highlights).toEqual({ question: [] });
});

describe("sync conflict recovery", () => {
  function conflict() {
    const s = fixture();
    const session = makeStudySession(s, { mode: "tutor", count: 2, exactIds: s.questions.slice(0, 2).map((q) => q.id), filters: { subjectIds: [], topicIds: [], status: "all" } }, "session", now);
    s.sessions.session = session;
    const op: StudyOperation = { id: "answer", createdAt: now.toISOString(), kind: "attempt", attempt: answer(session.questionIds[0], session.id, false) };
    let local = applyStudyOperation(s, op);
    local = applyStudyOperation(local, { id: "progress", createdAt: now.toISOString(), kind: "progress", sessionId: session.id, index: 1, finished: false });
    local = applyStudyOperation(local, { id: "note", createdAt: now.toISOString(), kind: "note", questionId: session.questionIds[0], body: "Keep this independent note" });
    local.conflicts = { answer: "Answered differently online" };
    return { local, remote: s, session };
  }
  it("uploads independent notes while keeping dependent session updates blocked", () => {
    const { local } = conflict();
    expect(nextSyncOperation(local)?.id).toBe("note");
    local.outbox = local.outbox.filter((op) => op.id !== "note");
    expect(nextSyncOperation(local)).toBeUndefined();
  });
  it("keeps unresolved local answers and their queue through an authoritative refresh", () => {
    const { local, remote, session } = conflict();
    remote.attempts = [answer(session.questionIds[0], session.id, true)];
    const merged = mergeStudySnapshot(local, remote);
    expect(merged.attempts[0].chosenIdx).toBe(0);
    expect(merged.outbox.map((op) => op.id)).toEqual(["answer", "progress", "note"]);
    expect(merged.conflicts).toEqual(local.conflicts);
    expect(merged.notes[session.questionIds[0]]).toBe("Keep this independent note");
  });
  it("resolves one session using online answers and keeps a backup and independent work", () => {
    const { local, session } = conflict();
    const online = [answer(session.questionIds[0], session.id, true)];
    const resolved = resolveSessionConflict(local, session.id, session, online);
    expect(resolved.attempts).toEqual(online);
    expect(resolved.outbox.map((op) => op.id)).toEqual(["note"]);
    expect(resolved.recoveredOperations?.map((op) => op.id)).toEqual(["answer", "progress"]);
    expect(resolved.conflicts).toEqual({});
    expect(local.outbox).toHaveLength(3);
    expect(() => resolveSessionConflict(resolved, session.id, session, online)).toThrow("already been resolved");
  });
  it("can recover a deleted online session without deleting pending notes", () => {
    const { local, session } = conflict();
    const resolved = resolveSessionConflict(local, session.id, null, []);
    expect(resolved.sessions[session.id]).toBeUndefined();
    expect(resolved.attempts).toEqual([]);
    expect(resolved.outbox.map((op) => op.id)).toEqual(["note"]);
    expect(resolved.recoveredOperations).toHaveLength(2);
  });
});

describe("time and pace study plans", () => {
  it("calculates a feasible daily target, caps blocks at 20 and stops at the target", () => {
    const s = fixture(); expect(dailyTarget(plan)).toBe(30); expect(planDays(plan, now)).toBe(30);
    expect(plannedQuestionIds(s, now)).toHaveLength(20);
    s.attempts = Array.from({ length: 26 }, (_, i) => answer(s.questions[i % s.questions.length].id, `session-${i}`, true));
    expect(completedToday(s, now)).toBe(26); expect(plannedQuestionIds(s, now)).toHaveLength(4);
    s.attempts.push(...Array.from({ length: 4 }, (_, i) => answer(s.questions[i].id, `extra-${i}`, true)));
    expect(plannedQuestionIds(s, now)).toEqual([]);
  });
  it("rejects invalid dates, past dates, and unsupported time or pace", () => {
    for (const patch of [{ examDate: "2026-02-30" }, { examDate: "2026-09-25" }, { minutesPerDay: 14 }, { minutesPerDay: 241 }, { minutesPerQuestion: 14 / 60 }, { minutesPerQuestion: 601 / 60 }, { minutesPerQuestion: 90.5 / 60 }, { minutesPerQuestion: NaN }, { minutesPerQuestion: Infinity }]) expect(() => validateStudyPlan({ ...plan, ...patch }, now)).toThrow();
    expect(() => validateStudyPlan(plan, now)).not.toThrow();
  });
  it("accepts whole-second paces and preserves targets for existing minute-based plans", () => {
    expect(dailyTarget(plan)).toBe(30);
    expect(dailyTarget({ ...plan, minutesPerQuestion: 1.5 })).toBe(40);
    expect(dailyTarget({ ...plan, minutesPerQuestion: 83 / 60 })).toBe(43);
    for (let seconds = 15; seconds <= 600; seconds++) {
      const next = { ...plan, minutesPerQuestion: seconds / 60 };
      expect(() => validateStudyPlan(next, now)).not.toThrow();
      expect(dailyTarget(next)).toBe(Math.min(240, Math.floor(3600 / seconds)));
    }
  });
  it("counts calendar days across a daylight saving transition", () => {
    const previous = process.env.TZ; process.env.TZ = "America/Toronto";
    try { const date = new Date("2026-03-08T12:00:00-04:00"); const shifted = shiftDay(date, -1); expect(shifted.getDate()).toBe(7); expect(shifted.getHours()).toBe(0); expect(planDays({ ...plan, examDate: "2026-03-09" }, date)).toBe(1); } finally { process.env.TZ = previous; }
  });
});

describe("saved sessions and skip replacement", () => {
  it("keeps 20 positions, excludes roster and prior skips, resets annotations, and never grades a skip", () => {
    const s = fixture(); const session = makeStudySession(s, { mode: "tutor", count: 20, exactIds: s.questions.slice(0, 20).map((q) => q.id), filters: { subjectIds: [], topicIds: [], status: "all" } }, "session", now);
    s.sessions.session = session; const oldId = session.questionIds[0]; session.eliminated[oldId] = [1];
    const replacement = eligibleReplacement(s, session, 0, () => 0);
    const next = applyStudyOperation(s, operation({ kind: "replace", sessionId: "session", index: 0, oldId, newId: replacement.id }));
    expect(next.sessions.session.questionIds).toHaveLength(20); expect(new Set(next.sessions.session.questionIds).size).toBe(20);
    expect(next.attempts).toEqual([]); expect(next.sessions.session.eliminated[oldId]).toBeUndefined(); expect(next.sessions.session.starts[replacement.id]).toBe(+now);
    expect(next.sessions.session.filters.skippedIds).toEqual([oldId]); expect(s.sessions.session.questionIds[0]).toBe(oldId);
    expect(eligibleReplacement(next, next.sessions.session, 0, () => 0).id).not.toBe(oldId);
  });
  it("keeps the question on exhaustion, respects filters, and cannot replace an answered question", () => {
    const s = fixture(); const session = makeStudySession(s, { mode: "tutor", count: s.questions.length, filters: { subjectIds: [], topicIds: [], status: "all" } }, "session", now); s.sessions.session = session;
    expect(() => eligibleReplacement(s, session, 0)).toThrow("No more replacement");
    s.attempts = [answer(session.questionIds[0], session.id, true)]; expect(() => eligibleReplacement(s, session, 0)).toThrow("unanswered");
    const filtered = questionPool(s, { subjectIds: [s.questions[0].subjectId], topicIds: [], status: "all" }); expect(filtered.every((q) => q.subjectId === s.questions[0].subjectId)).toBe(true);
  });
  it("treats a flag independently of answer correctness", () => {
    const s = fixture(); const q = s.questions[0]; s.flags = [q.id]; s.attempts = [answer(q.id, "s", true)];
    expect(questionPool(s, { subjectIds: [], topicIds: [], status: "correct" }).map((q) => q.id)).toEqual([q.id]);
    expect(questionPool(s, { subjectIds: [], topicIds: [], status: "flagged" }).map((q) => q.id)).toEqual([q.id]);
  });
  it("uses only reviewed groups and excludes an answered alternate from the unused pool", () => {
    const s = fixture(); const [one, two] = s.questions; s.reviewedGroups = [[one.id, two.id]];
    expect(questionPool(s, { subjectIds: [], topicIds: [], status: "all" })).toHaveLength(s.questions.length - 1);
    s.attempts = [answer(two.id, "s", true)];
    const unused = questionPool(s, { subjectIds: [], topicIds: [], status: "unused" }); expect(unused.some((q) => q.id === one.id || q.id === two.id)).toBe(false);
  });
});

describe("review schedules and learning statistics", () => {
  it("separates first and repeat attempts using history before the comparison window", () => {
    const s = fixture(); const q = s.questions[0].id; const second = s.questions[1].id;
    s.attempts = [answer(q, "old", false, shiftDay(now, -50)), answer(q, "prior", true, shiftDay(now, -9)), answer(q, "current", true), answer(second, "new", false)];
    const periods = learningPeriods(s, 7, now);
    expect(periods.current).toEqual({ first: { answered: 1, correct: 0 }, repeated: { answered: 1, correct: 1 } });
    expect(periods.previous.repeated).toEqual({ answered: 1, correct: 1 });
    expect(studyStatistics(s, now).stats.attempted).toBe(2);
  });
  it("deduplicates retries, but keeps answers in different sessions", () => {
    const a = answer(questions[0].id, "a", true); expect(uniqueAttempts([a, { ...a }, { ...a, sessionId: "b" }])).toHaveLength(2);
  });
  it("does not advance a spaced review after an immediate retry", () => {
    const s = fixture(); const q = s.questions[0].id;
    const missed = shiftDay(now, -1); missed.setHours(10);
    s.attempts = [answer(q, "miss", false, missed), answer(q, "retry", true, new Date(+missed + 60_000))];
    expect(dueReviews(s, now)).toEqual([q]);
    s.attempts.push(answer(q, "review", true)); expect(dueReviews(s, now)).toEqual([]);
    expect(dueReviews(s, shiftDay(now, 3))).toEqual([q]);
    expect(plannedQuestionIds({ ...s, attempts: s.attempts.slice(0, 1) }, now)[0]).toBe(q);
  });
});

describe("snapshot merging and replay safety", () => {
  it("retains an answer acknowledged during a slow download without queuing it again", () => {
    const remote = fixture(); const session = makeStudySession(remote, { mode: "tutor", count: 5, filters: { subjectIds: [], topicIds: [], status: "all" } }, "existing", now); remote.sessions.existing = session;
    const q = remote.questions.find((q) => q.id === session.questionIds[0])!;
    const op: StudyOperation = { id: "acknowledged", kind: "attempt", createdAt: now.toISOString(), attempt: { ...answer(q.id, session.id, true), chosenIdx: q.answerIdx } };
    const local = applyStudyOperation(remote, op, false);
    const merged = mergeStudySnapshot(local, remote, [op]);
    expect(merged.attempts).toHaveLength(1); expect(merged.outbox).toEqual([]);
  });
  it("preserves an offline-created session and attempt when refreshing", () => {
    const remote = fixture(); const session = makeStudySession(remote, { mode: "tutor", count: 5, filters: { subjectIds: [], topicIds: [], status: "all" } }, "offline", now);
    const created = applyStudyOperation(remote, { id: "one", createdAt: now.toISOString(), kind: "session", session });
    const q = created.questions.find((q) => q.id === session.questionIds[0])!;
    const local = applyStudyOperation(created, { id: "two", createdAt: now.toISOString(), kind: "attempt", attempt: { ...answer(q.id, session.id, true), chosenIdx: q.answerIdx } });
    const merged = mergeStudySnapshot(local, remote); expect(merged.outbox).toHaveLength(2); expect(merged.attempts).toHaveLength(1); expect(merged.sessions.offline).toBeDefined();
    expect(mergeStudySnapshot(local, { ...remote, userId: "another" }).outbox).toEqual([]);
    expect(mergeStudySnapshot(local, { ...remote, examId: "usmle" }).sessions).toEqual({});
  });
  it("accepts a replay already on the server, even after finish, without duplicating an answer", () => {
    const s = fixture(); const session = makeStudySession(s, { mode: "tutor", count: 5, filters: { subjectIds: [], topicIds: [], status: "all" } }, "s", now); s.sessions.s = session;
    const q = s.questions.find((q) => q.id === session.questionIds[0])!;
    const op: StudyOperation = { id: "a", kind: "attempt", createdAt: now.toISOString(), attempt: { ...answer(q.id, "s", true), chosenIdx: q.answerIdx } };
    const local = applyStudyOperation(s, op); const remote = { ...local, outbox: [], sessions: { s: { ...session, finishedAt: now.toISOString() } } };
    expect(mergeStudySnapshot(local, remote).attempts).toHaveLength(1); expect(mergeStudySnapshot(local, remote).outbox).toHaveLength(0);
    const conflict = { ...remote, attempts: [{ ...remote.attempts[0], chosenIdx: (q.answerIdx + 1) % q.options.length }] };
    expect(() => mergeStudySnapshot(local, conflict)).toThrow("different answer");
  });
});
