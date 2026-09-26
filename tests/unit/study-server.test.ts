import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ userId: "user-one", examId: "mccqe", entitled: true, query: vi.fn(), question: vi.fn(), questions: vi.fn(), subjects: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ from: mocks.query }) }));
vi.mock("@/lib/billing", () => ({ requireEntitledUserId: async () => { if (!mocks.entitled) throw new Error("Subscription required"); return mocks.userId; } }));
vi.mock("@/lib/data-supabase", () => ({ getCurrentExam: async () => ({ id: mocks.examId }), getQuestion: mocks.question, getQuestionsByIds: mocks.questions, getSubjects: mocks.subjects }));
import { databaseSessionFilters, operationRowId, readSessionFilters, syncStudyOperation } from "@/lib/study-server";
import { POST } from "@/app/api/study/sync/route";
import type { StudyOperation } from "@/lib/study-core";

const sessionId = "00000000-0000-4000-8000-000000000001";
const opId = "00000000-0000-4000-8000-000000000002";
const q = { id: "101", qid: 101, subjectId: "medicine", topicId: "cardiology", stem: "Question", options: ["One", "Two"], answerIdx: 1, explanation: [] };
type Row = Record<string, unknown>;
let sessions: Row[];
let attempts: Row[];
let flags: Row[];
let writes: { table: string; action: string; value: Row }[];
function query(table: string) {
  let action = "select"; let value: Row = {}; let single = false;
  const filters: Record<string, unknown> = {};
  const chain = {
    select: () => chain, eq: (key: string, value: unknown) => { filters[key] = value; return chain; },
    order: () => chain, limit: () => chain,
    maybeSingle: () => { single = true; return chain; },
    insert: (row: Row) => { action = "insert"; value = row; return chain; },
    upsert: (row: Row) => { action = "upsert"; value = row; return chain; },
    update: (row: Row) => { action = "update"; value = row; return chain; },
    delete: () => { action = "delete"; return chain; },
    then: (resolve: (result: { data: Row[] | Row | null; error: null }) => unknown) => {
      const source = table === "sessions" ? sessions : table === "attempts" ? attempts : table === "flags" ? flags : [];
      if (action !== "select") {
        writes.push({ table, action, value });
        if (action === "insert" || action === "upsert") source.push(value);
      }
      const rows = source.filter((row) => Object.entries(filters).every(([key, value]) => key === "question_ids" || row[key] === value));
      return Promise.resolve(resolve({ data: single ? rows[0] ?? null : rows, error: null }));
    },
  };
  return chain;
}
const answerOp = (): StudyOperation => ({ id: opId, createdAt: new Date().toISOString(), kind: "attempt", attempt: { sessionId, questionId: q.id, chosenIdx: 1, correct: false, timeMs: 8_000_000, createdAt: "" } });
function attemptOperation() { const op = answerOp(); if (op.kind === "attempt") op.attempt.createdAt = op.createdAt; return op; }
beforeEach(() => {
  mocks.userId = "user-one"; mocks.examId = "mccqe"; mocks.entitled = true;
  sessions = [{ id: sessionId, user_id: "user-one", mode: "tutor", question_ids: [101], filters: {}, current_index: 0, finished_at: null }]; attempts = []; flags = []; writes = [];
  mocks.query.mockImplementation(query); mocks.question.mockResolvedValue(q); mocks.questions.mockResolvedValue([q]); mocks.subjects.mockResolvedValue([{ id: "medicine", examId: "mccqe" }]);
});
describe("study sync authorization and validation", () => {
  it("requires the original account, exam and current entitlement", async () => {
    await expect(syncStudyOperation("other", "mccqe", attemptOperation())).rejects.toThrow("account or exam");
    await expect(syncStudyOperation("user-one", "usmle", attemptOperation())).rejects.toThrow("account or exam");
    mocks.entitled = false; await expect(syncStudyOperation("user-one", "mccqe", attemptOperation())).rejects.toThrow("Subscription"); expect(writes).toEqual([]);
  });
  it("rejects foreign sessions and a question from another exam", async () => {
    sessions[0].user_id = "other"; await expect(syncStudyOperation("user-one", "mccqe", attemptOperation())).rejects.toThrow("session no longer exists");
    sessions[0].user_id = "user-one"; mocks.subjects.mockResolvedValue([{ id: "medicine", examId: "usmle" }]);
    await expect(syncStudyOperation("user-one", "mccqe", attemptOperation())).rejects.toThrow(/another exam/); expect(writes).toEqual([]);
  });
  it("uses the authoritative answer and database duration bound", async () => {
    await syncStudyOperation("user-one", "mccqe", attemptOperation());
    expect(writes).toHaveLength(1); expect(writes[0].value).toMatchObject({ correct: true, time_ms: 3_600_000, user_id: "user-one", qid: 101, id: operationRowId(opId) });
    expect(Number.isSafeInteger(operationRowId(opId))).toBe(true); expect(operationRowId(opId)).toBeLessThan(0);
  });
  it("recognizes a lost-response retry and refuses a conflicting answer", async () => {
    const op = attemptOperation(); await syncStudyOperation("user-one", "mccqe", op); await syncStudyOperation("user-one", "mccqe", op); expect(writes).toHaveLength(1);
    if (op.kind === "attempt") op.attempt.chosenIdx = 0;
    await expect(syncStudyOperation("user-one", "mccqe", op)).rejects.toThrow("answered differently"); expect(writes).toHaveLength(1);
  });
  it("rejects out-of-roster, finished, and invalid option submissions", async () => {
    sessions[0].question_ids = [202]; await expect(syncStudyOperation("user-one", "mccqe", attemptOperation())).rejects.toThrow("does not belong");
    sessions[0].question_ids = [101]; sessions[0].finished_at = new Date().toISOString(); await expect(syncStudyOperation("user-one", "mccqe", attemptOperation())).rejects.toThrow("finished");
    sessions[0].finished_at = null; const op = attemptOperation(); if (op.kind === "attempt") op.attempt.chosenIdx = 9; await expect(syncStudyOperation("user-one", "mccqe", op)).rejects.toThrow("does not belong"); expect(writes).toEqual([]);
  });
  it("rejects cross-site writes, malformed data and oversized payloads at the route", async () => {
    const url = "https://example.test/api/study/sync";
    expect((await POST(new Request(url, { method: "POST", headers: { origin: "https://other.test" }, body: "{}" }))).status).toBe(403);
    expect((await POST(new Request(url, { method: "POST", headers: { origin: "https://example.test" }, body: "invalid" }))).status).toBe(400);
    expect((await POST(new Request(url, { method: "POST", headers: { origin: "https://example.test" }, body: "x".repeat(100001) }))).status).toBe(413);
    expect(writes).toEqual([]);
  });
  it("encodes filters and skipped question IDs for native session resume", () => {
    const filters = readSessionFilters({ subjectIds: ["medicine"], topicIds: ["cardiology"], status: "unused", skipped_question_ids: [101, 102], bank: "full" });
    expect(databaseSessionFilters(filters)).toEqual({ subject_ids: ["medicine"], topic_ids: ["cardiology"], status: "unused", skipped_question_ids: [101, 102], bank: "full" });
    expect(readSessionFilters(databaseSessionFilters(filters))).toEqual(filters);
  });
});
