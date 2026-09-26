import type { Attempt, DashboardStats, Exam, Profile, Question, Session, SessionMode, Subject, Topic, TopicStats } from "@/lib/types";
import type { TextHighlight } from "@/lib/text-highlights";

export type StudyFilters = { subjectIds: string[]; topicIds: string[]; status: "all" | "unused" | "correct" | "incorrect" | "flagged" | "review"; skippedIds?: string[]; bank?: "condensed" | "full" };
export type StudyPlan = { examDate: string; minutesPerDay: number; minutesPerQuestion: number };
export type SavedSession = Session & { filters: StudyFilters; cursor: number; starts: Record<string, number>; eliminated: Record<string, number[]> };
export type StudyOperation = { id: string; createdAt: string } & (
  | { kind: "session"; session: SavedSession }
  | { kind: "attempt"; attempt: Attempt }
  | { kind: "replace"; sessionId: string; index: number; oldId: string; newId: string }
  | { kind: "progress"; sessionId: string; index: number; finished: boolean }
  | { kind: "flag"; questionId: string; flagged: boolean }
  | { kind: "note"; questionId: string; body: string }
  | { kind: "report"; questionId: string; body: string }
);
export type StudySnapshot = {
  version: 1; userId: string; examId: string; demo: boolean; profile: Profile; exam: Exam;
  subjects: Subject[]; topics: Topic[]; questions: Question[]; attempts: Attempt[];
  sessions: Record<string, SavedSession>; flags: string[]; notes: Record<string, string>;
  highlights?: Record<string, TextHighlight[]>;
  reviewedGroups?: string[][];
  plan?: StudyPlan; tutorialSeen?: boolean; downloadedAt: string; validUntil: string;
  outbox: StudyOperation[];
  conflicts?: Record<string, string>;
  recoveredOperations?: StudyOperation[];
  profileRevision?: string;
};

export function operationSessionId(operation: StudyOperation): string | undefined {
  if (operation.kind === "session") return operation.session.id;
  if (operation.kind === "attempt") return operation.attempt.sessionId;
  if (operation.kind === "progress" || operation.kind === "replace") return operation.sessionId;
}
export function conflictedSessions(snapshot: StudySnapshot): Map<string, string> {
  const sessions = new Map<string, string>();
  for (const op of snapshot.outbox) {
    const id = operationSessionId(op);
    if (id && snapshot.conflicts?.[op.id]) sessions.set(id, snapshot.conflicts[op.id]);
  }
  return sessions;
}
export function nextSyncOperation(snapshot: StudySnapshot): StudyOperation | undefined {
  const blocked = conflictedSessions(snapshot);
  return snapshot.outbox.find((op) => !snapshot.conflicts?.[op.id] && !blocked.has(operationSessionId(op) ?? ""));
}

export function resolveSessionConflict(snapshot: StudySnapshot, id: string, session: SavedSession | null, attempts: Attempt[]): StudySnapshot {
  if (!conflictedSessions(snapshot).has(id)) throw new Error("This conflict has already been resolved. Refresh your progress.");
  const removed = snapshot.outbox.filter((op) => operationSessionId(op) === id);
  const sessions = { ...snapshot.sessions };
  if (session) sessions[id] = session;
  else delete sessions[id];
  const removedIds = new Set(removed.map((op) => op.id));
  return { ...snapshot, sessions, attempts: [...snapshot.attempts.filter((a) => a.sessionId !== id), ...attempts],
    outbox: snapshot.outbox.filter((op) => !removedIds.has(op.id)),
    conflicts: Object.fromEntries(Object.entries(snapshot.conflicts ?? {}).filter(([opId]) => !removedIds.has(opId))),
    recoveredOperations: [...(snapshot.recoveredOperations ?? []), ...removed] };
}

export function dayKey(value = new Date()): string {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}
export function dayNumber(value: string): number { return Date.parse(`${value}T12:00:00Z`) / 86_400_000; }
export function shiftDay(value: Date, days: number): Date { const next = new Date(value); next.setHours(0, 0, 0, 0); next.setDate(next.getDate() + days); return next; }
export function dailyTarget(plan: StudyPlan): number { return Math.min(240, Math.max(1, Math.floor(plan.minutesPerDay * 60 / Math.round(plan.minutesPerQuestion * 60)))); }
export function planDays(plan: StudyPlan, now = new Date()): number { return Math.max(0, dayNumber(plan.examDate) - dayNumber(dayKey(now))); }
export function validateStudyPlan(plan: StudyPlan, now = new Date()): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(plan.examDate) || !Number.isFinite(dayNumber(plan.examDate)) || new Date(`${plan.examDate}T12:00:00Z`).toISOString().slice(0, 10) !== plan.examDate || planDays(plan, now) <= 0)
    throw new Error("Choose a future exam date.");
  // Keep existing saved plans in minutes while accepting whole-second input.
  const seconds = plan.minutesPerQuestion * 60;
  if (!Number.isInteger(plan.minutesPerDay) || plan.minutesPerDay < 15 || plan.minutesPerDay > 240 || !Number.isFinite(seconds) || seconds < 15 || seconds > 600 || Math.abs(seconds - Math.round(seconds)) > 1e-9)
    throw new Error("Choose 15 to 240 minutes per day and 15 to 600 whole seconds per question.");
}
export function uniqueAttempts(attempts: Attempt[]): Attempt[] {
  const seen = new Set<string>();
  return [...attempts].sort((a, b) => a.createdAt.localeCompare(b.createdAt)).filter((a) => {
    const key = a.sessionId ? `${a.sessionId}:${a.questionId}` : `${a.questionId}:${a.createdAt}:${a.chosenIdx}:${a.timeMs}`;
    if (seen.has(key)) return false;
    seen.add(key); return true;
  });
}
export function scopedAttempts(snapshot: StudySnapshot): Attempt[] {
  const ids = new Set(snapshot.questions.map((q) => q.id));
  return uniqueAttempts(snapshot.attempts).filter((a) => ids.has(a.questionId));
}
export function completedToday(snapshot: StudySnapshot, now = new Date()): number {
  return scopedAttempts(snapshot).filter((a) => new Date(a.createdAt) <= now && dayKey(new Date(a.createdAt)) === dayKey(now)).length;
}
export function questionPool(snapshot: StudySnapshot, filters: StudyFilters): Question[] {
  const latest = new Map(scopedAttempts(snapshot).map((a) => [a.questionId, a.correct]));
  const flags = new Set(snapshot.flags);
  const matches = (q: Question) => (!filters.subjectIds.length || filters.subjectIds.includes(q.subjectId))
    && (!filters.topicIds.length || filters.topicIds.includes(q.topicId))
    && (filters.status === "unused" ? !latest.has(q.id) : filters.status === "correct" ? latest.get(q.id) === true : filters.status === "incorrect" ? latest.get(q.id) === false : filters.status === "flagged" ? flags.has(q.id) : true);
  const bank = new Map(snapshot.questions.map((q) => [q.id, q]));
  if (filters.bank === "full") return snapshot.questions.filter(matches);
  const grouped = new Set(snapshot.reviewedGroups?.flat());
  const selected = snapshot.questions.filter((q) => !grouped.has(q.id) && matches(q));
  for (const members of snapshot.reviewedGroups ?? []) {
    if (filters.status === "unused" && members.some((id) => latest.has(id))) continue;
    const q = members.map((id) => bank.get(id)).find((q) => q && matches(q));
    if (q) selected.push(q);
  }
  return selected.sort((a, b) => a.qid - b.qid);
}
export function dueReviews(snapshot: StudySnapshot, now = new Date()): string[] {
  const schedule = new Map<string, { due: Date; stage: number }>();
  for (const a of scopedAttempts(snapshot)) {
    const at = new Date(a.createdAt);
    if (at > now) continue;
    const prior = schedule.get(a.questionId);
    if (!a.correct) schedule.set(a.questionId, { due: shiftDay(at, 1), stage: 0 });
    else if (prior && at >= prior.due) {
      const stage = Math.min(4, prior.stage + 1);
      schedule.set(a.questionId, { due: shiftDay(at, [1, 3, 7, 14, 30][stage]), stage });
    }
  }
  return [...schedule].filter(([, entry]) => entry.due <= now).sort((a, b) => +a[1].due - +b[1].due || a[0].localeCompare(b[0])).map(([id]) => id);
}
export type Score = { answered: number; correct: number };
export function learningPeriods(snapshot: StudySnapshot, days: 7 | 30, now = new Date()) {
  const current = { first: { answered: 0, correct: 0 }, repeated: { answered: 0, correct: 0 } };
  const previous = structuredClone(current);
  const seen = new Set<string>();
  const start = shiftDay(now, -(days - 1)); const before = shiftDay(start, -days);
  for (const a of scopedAttempts(snapshot)) {
    const at = new Date(a.createdAt);
    if (at > now) continue;
    const repeat = seen.has(a.questionId); seen.add(a.questionId);
    const period = at >= start ? current : at >= before ? previous : null;
    if (period) { const score = repeat ? period.repeated : period.first; score.answered++; score.correct += Number(a.correct); }
  }
  return { current, previous };
}
export function eligibleReplacement(snapshot: StudySnapshot, session: SavedSession, index: number, random = Math.random): Question {
  const oldId = session.questionIds[index];
  if (!oldId || session.finishedAt || snapshot.attempts.some((a) => a.sessionId === session.id && a.questionId === oldId)) throw new Error("Only an unanswered question can be skipped.");
  const excluded = new Set([...session.questionIds, ...(session.filters.skippedIds ?? [])]);
  for (const group of snapshot.reviewedGroups ?? []) if (group.some((id) => excluded.has(id))) for (const id of group) excluded.add(id);
  const pool = questionPool(snapshot, session.filters).filter((q) => !excluded.has(q.id));
  if (!pool.length) throw new Error("No more replacement questions match your filters. Your current question and session size have been kept.");
  return pool[Math.min(pool.length - 1, Math.floor(random() * pool.length))];
}
export function makeStudySession(snapshot: StudySnapshot, input: { mode: SessionMode; count: number; filters: StudyFilters; exactIds?: string[] }, id: string, now = new Date()): SavedSession {
  const count = Math.min(200, Math.max(1, Math.floor(input.count)));
  let ids: string[];
  if (input.exactIds) {
    const allowed = new Set(snapshot.questions.map((q) => q.id));
    ids = [...new Set(input.exactIds)].filter((qid) => allowed.has(qid)).slice(0, count);
  } else {
    const pool = questionPool(snapshot, input.filters).map((q) => q.id);
    for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
    ids = pool.slice(0, count);
  }
  if (!ids.length) throw new Error("No saved questions match these filters.");
  return { id, mode: input.mode, questionIds: ids, createdAt: now.toISOString(), secondsPerQuestion: input.mode === "timed" ? snapshot.exam.secondsPerQuestion : undefined,
    currentIndex: 0, cursor: 0, filters: { ...input.filters, skippedIds: [] }, starts: { [ids[0]]: +now }, eliminated: {} };
}
export function plannedQuestionIds(snapshot: StudySnapshot, now = new Date()): string[] {
  if (!snapshot.plan || planDays(snapshot.plan, now) <= 0) throw new Error("Set a future exam date before starting your plan.");
  const remaining = Math.max(0, dailyTarget(snapshot.plan) - completedToday(snapshot, now));
  const all = questionPool(snapshot, { subjectIds: [], topicIds: [], status: "all" }).map((q) => q.id);
  const unused = questionPool(snapshot, { subjectIds: [], topicIds: [], status: "unused" }).map((q) => q.id);
  return [...new Set([...dueReviews(snapshot, now), ...unused, ...all])].slice(0, Math.min(20, remaining));
}
export function applyStudyOperation(snapshot: StudySnapshot, operation: StudyOperation, enqueue = true): StudySnapshot {
  const next = { ...snapshot, sessions: structuredClone(snapshot.sessions), attempts: [...snapshot.attempts], flags: [...snapshot.flags], notes: { ...snapshot.notes }, outbox: [...snapshot.outbox] };
  const question = (id: string) => { const q = next.questions.find((item) => item.id === id); if (!q) throw new Error("This question is unavailable in the current exam."); return q; };
  const session = (id: string) => { const s = next.sessions[id]; if (!s) throw new Error("This session is unavailable."); return s; };
  switch (operation.kind) {
    case "session": next.sessions[operation.session.id] ??= operation.session; break;
    case "attempt": {
      const a = operation.attempt; const s = session(a.sessionId); const q = question(a.questionId);
      const prior = next.attempts.find((prior) => prior.sessionId === a.sessionId && prior.questionId === a.questionId);
      if (prior) { if (prior.chosenIdx !== a.chosenIdx) throw new Error("A different answer was saved on another device. Your pending work remains on this device."); return snapshot; }
      if (!s.questionIds.includes(q.id) || s.finishedAt) throw new Error("This question cannot be answered in this session.");
      if (a.chosenIdx !== null && (!Number.isInteger(a.chosenIdx) || a.chosenIdx < 0 || a.chosenIdx >= q.options.length)) throw new Error("Choose a valid answer.");
      next.attempts.push({ ...a, correct: a.chosenIdx === q.answerIdx }); break;
    }
    case "replace": {
      const s = session(operation.sessionId); const q = question(operation.newId);
      if (s.questionIds[operation.index] === q.id && s.filters.skippedIds?.includes(operation.oldId)) return snapshot;
      if (s.questionIds[operation.index] !== operation.oldId || s.finishedAt || s.questionIds.includes(q.id) || s.filters.skippedIds?.includes(q.id)
        || next.attempts.some((a) => a.sessionId === s.id && a.questionId === operation.oldId)
        || !questionPool(next, s.filters).some((item) => item.id === q.id)) throw new Error("The session changed. Reopen it before skipping.");
      s.questionIds[operation.index] = q.id;
      s.filters.skippedIds = [...(s.filters.skippedIds ?? []), operation.oldId];
      delete s.starts[operation.oldId]; delete s.eliminated[operation.oldId]; s.starts[q.id] = Date.parse(operation.createdAt); break;
    }
    case "progress": {
      const s = session(operation.sessionId); s.cursor = Math.max(0, Math.min(s.questionIds.length - 1, operation.index));
      s.currentIndex = Math.max(s.currentIndex ?? 0, s.cursor);
      s.starts[s.questionIds[s.cursor]] ??= Date.parse(operation.createdAt);
      if (operation.finished) s.finishedAt = operation.createdAt;
      break;
    }
    case "flag": question(operation.questionId); next.flags = operation.flagged ? [...new Set([...next.flags, operation.questionId])] : next.flags.filter((id) => id !== operation.questionId); break;
    case "note": question(operation.questionId); if (operation.body.length > 5000) throw new Error("Keep notes under 5,000 characters."); next.notes[operation.questionId] = operation.body.trim(); break;
    case "report": question(operation.questionId); if (!operation.body.trim() || operation.body.length > 2000) throw new Error("Enter a report under 2,000 characters."); break;
  }
  if (enqueue && !snapshot.demo && !next.outbox.some((op) => op.id === operation.id)) next.outbox.push(operation);
  return next;
}

export function mergeStudySnapshot(local: StudySnapshot | null, remote: StudySnapshot, acknowledged: StudyOperation[] = []): StudySnapshot {
  if (!local || local.userId !== remote.userId || local.examId !== remote.examId) return remote;
  if (remote.demo) return { ...local, validUntil: remote.validUntil };
  const next: StudySnapshot = { ...remote, sessions: { ...remote.sessions }, highlights: local.highlights, plan: local.plan, tutorialSeen: local.tutorialSeen, conflicts: local.conflicts, recoveredOperations: local.recoveredOperations, profileRevision: local.profileRevision, outbox: [] };
  const blocked = conflictedSessions(local);
  // Preserve local navigation and crossed-out choices without overwriting a server roster.
  for (const [id, saved] of Object.entries(local.sessions)) {
    if (blocked.has(id)) next.sessions[id] = saved;
    else if (next.sessions[id]) next.sessions[id] = { ...next.sessions[id], cursor: Math.min(saved.cursor, next.sessions[id].questionIds.length - 1), starts: saved.starts, eliminated: saved.eliminated };
    else if (!local.outbox.some((op) => op.kind === "session" && op.session.id === id) && saved.questionIds.every((qid) => next.questions.some((q) => q.id === qid))) next.sessions[id] = saved;
  }
  const replay = [...new Map([...acknowledged, ...local.outbox].map((op) => [op.id, op])).values()];
  next.attempts = [...next.attempts.filter((a) => !blocked.has(a.sessionId)), ...local.attempts.filter((a) => blocked.has(a.sessionId))];
  const merged = replay.reduce((state, op) => blocked.has(operationSessionId(op) ?? "") ? { ...state, outbox: [...state.outbox, op] } : applyStudyOperation(state, op), next);
  // An answer may finish syncing while the download is in flight. Keep it locally
  // if the server snapshot predates it, without putting it back in the upload queue.
  const pending = new Set(local.outbox.map((op) => op.id));
  return { ...merged, outbox: merged.outbox.filter((op) => pending.has(op.id)) };
}

export function studyStatistics(snapshot: StudySnapshot, now = new Date()) {
  const attempts = scopedAttempts(snapshot);
  const bank = new Map(snapshot.questions.map((q) => [q.id, q]));
  const topics = new Map<string, TopicStats>();
  const days = new Map<string, { date: string; attempted: number; correct: number }>();
  for (let i = 83; i >= 0; i--) { const date = dayKey(shiftDay(now, -i)); days.set(date, { date, attempted: 0, correct: 0 }); }
  for (const a of attempts) {
    if (new Date(a.createdAt) > now) continue;
    const q = bank.get(a.questionId)!;
    const t = topics.get(q.topicId) ?? { topicId: q.topicId, attempted: 0, correct: 0, avgTimeMs: 0 };
    t.avgTimeMs = (t.avgTimeMs * t.attempted + a.timeMs) / (t.attempted + 1); t.attempted++; t.correct += Number(a.correct); topics.set(q.topicId, t);
    const day = days.get(dayKey(new Date(a.createdAt))); if (day) { day.attempted++; day.correct += Number(a.correct); }
  }
  const latest = new Map(attempts.map((a) => [a.questionId, a]));
  let streakDays = 0;
  let cursor = days.get(dayKey(now))?.attempted ? now : shiftDay(now, -1);
  while (days.get(dayKey(cursor))?.attempted) { streakDays++; cursor = shiftDay(cursor, -1); }
  const topicStats = [...topics.values()];
  const stats: DashboardStats = { totalQuestions: snapshot.questions.length, remainingQuestions: snapshot.questions.length - latest.size, attempted: latest.size, correct: [...latest.values()].filter((a) => a.correct).length, streakDays,
    activity: [...days.values()], weakestTopics: [...topicStats].sort((a, b) => a.correct / a.attempted - b.correct / b.attempted).slice(0, 4),
    subjects: snapshot.subjects.flatMap((s) => { const rows = topicStats.filter((t) => snapshot.topics.some((topic) => topic.id === t.topicId && topic.subjectId === s.id)); const attempted = rows.reduce((n, r) => n + r.attempted, 0); return attempted ? [{ subjectId: s.id, attempted, correct: rows.reduce((n, r) => n + r.correct, 0), avgTimeMs: rows.reduce((n, r) => n + r.avgTimeMs * r.attempted, 0) / attempted }] : []; }) };
  const sessions = Object.values(snapshot.sessions).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((s) => { const rows = attempts.filter((a) => a.sessionId === s.id); return { ...s, attempted: rows.length, correct: rows.filter((a) => a.correct).length, durationMs: rows.reduce((n, a) => n + a.timeMs, 0) }; });
  return { stats, topicStats, sessions };
}
