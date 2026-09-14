import { beforeEach, describe, expect, it, vi } from "vitest";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { normalizeQuestionFilters } from "@/lib/question-library";

const state = vi.hoisted(() => ({ client: null as unknown, exam: "mccqe" }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => state.client }));
vi.mock("@/lib/data-supabase", () => ({ getCurrentExamId: async () => state.exam }));
import { getQuestionLibraryFilters, getQuestionPage } from "@/lib/question-library-supabase";

type Row = Record<string, unknown>;
const questionRows: Row[] = Array.from({ length: 4036 }, (_, i) => ({
  qid: i + 1, subject_id: "medicine", topic_id: "cardio", stem: `Clinical scenario ${i + 1}. ${"A patient presents with symptoms for evaluation. ".repeat(20)}`,
  options: ["A", "B", "C", "D"], tags: i === 3000 ? ["RareCardiologyTag"] : [],
}));
questionRows[100].stem = "Literal C++ (test), 100%_* finding";
questionRows.push({ qid: 9001, subject_id: "usmle", topic_id: "other", stem: "Private other exam", options: ["A"], tags: ["RareCardiologyTag"] });
const calls: Array<{ table: string; columns: string; rows: number; url: URL }> = [];
let failTable = "";

function fixtureFetch(input: RequestInfo | URL) {
  const url = new URL(String(input));
  const table = url.pathname.split("/").at(-1)!;
  const columns = url.searchParams.get("select") ?? "*";
  if (table === failTable) return Promise.resolve(new Response(JSON.stringify({ message: "fixture database unavailable", code: "XX000" }), { status: 500 }));
  let rows: Row[] = table === "subjects" ? [
    { id: "medicine", name: "Medicine", exam_id: "mccqe" }, { id: "usmle", name: "USMLE", exam_id: "usmle" },
  ] : table === "topics" ? [{ id: "cardio", subject_id: "medicine", name: "Cardiology" }, { id: "other", subject_id: "usmle", name: "Other" }]
    : table === "questions" ? questionRows
      : table === "flags" ? [{ qid: 2 }, { qid: 3 }]
        : table === "user_question_status" ? [{ qid: 1, last_correct: true, flagged: false }, { qid: 2, last_correct: false, flagged: true }, { qid: 4, last_correct: false, flagged: false }] : [];
  for (const [column, condition] of url.searchParams) {
    if (condition.startsWith("eq.")) rows = rows.filter((row) => String(row[column]) === condition.slice(3));
    if (condition.startsWith("in.(")) {
      const values = condition.slice(4, -1).split(",");
      rows = rows.filter((row) => values.includes(String(row[column])));
    }
    if (condition.startsWith("imatch.")) rows = rows.filter((row) => new RegExp(condition.slice(7), "i").test(String(row[column])));
  }
  const total = rows.length;
  const from = Number(url.searchParams.get("offset") ?? 0);
  const limit = Number(url.searchParams.get("limit") ?? total);
  if (from > 0 && from >= total) return Promise.resolve(new Response(JSON.stringify({ code: "PGRST103", message: "range not satisfiable" }), { status: 416, headers: { "content-range": `*/${total}` } }));
  rows = rows.slice(from, from + limit).map((row) => Object.fromEntries(columns.split(",").map((key) => [key, row[key]])));
  calls.push({ table, columns, rows: rows.length, url });
  return Promise.resolve(new Response(JSON.stringify(rows), { status: 200, headers: { "content-type": "application/json", "content-range": `${from}-${from + rows.length - 1}/${total}` } }));
}

beforeEach(() => {
  calls.length = 0;
  failTable = "";
  state.exam = "mccqe";
  state.client = createSupabaseClient("https://fixture.supabase.co", "fixture-anon-key", { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: fixtureFetch } });
});

describe("bounded Supabase question reads", () => {
  it("loads eight of 4,036 questions and only their statuses", async () => {
    const page = await getQuestionPage(normalizeQuestionFilters());
    expect(page.total).toBe(4036);
    expect(page.questions.map(({ qid }) => qid)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(page.statuses).toMatchObject({ "1": "correct", "2": "flagged", "3": "flagged", "4": "incorrect", "5": "unused" });
    expect(calls.filter(({ table }) => table === "questions").map(({ rows }) => rows)).toEqual([8]);
    for (const call of calls.filter(({ table }) => ["user_question_status", "flags"].includes(table))) expect(call.url.searchParams.get("qid")).toBe("in.(1,2,3,4,5,6,7,8)");
    expect(JSON.stringify(page).length).toBeLessThan(JSON.stringify(questionRows).length / 100);
  });

  it("paginates without duplicate rows and clamps out-of-range pages", async () => {
    const page = await getQuestionPage(normalizeQuestionFilters({ page: 2 }));
    expect(page.questions.map(({ qid }) => qid)).toEqual([9, 10, 11, 12, 13, 14, 15, 16]);
    const last = await getQuestionPage(normalizeQuestionFilters({ page: 1_000_000 }));
    expect(last.page).toBe(505);
    expect(last.questions.map(({ qid }) => qid)).toEqual([4033, 4034, 4035, 4036]);
  });

  it("finds partial tags after the first 1,000 rows without reading their stems", async () => {
    const page = await getQuestionPage(normalizeQuestionFilters({ query: "CARDIOLOGYTAG" }));
    expect(page.questions.map(({ qid }) => qid)).toEqual([3001]);
    const fullReads = calls.filter(({ table, columns }) => table === "questions" && columns.includes("stem"));
    expect(fullReads.map(({ rows }) => rows)).toEqual([1]);
    expect(calls.some(({ url, columns }) => columns === "qid,tags" && url.searchParams.get("offset") === "3000")).toBe(true);
  });

  it("treats search punctuation literally and supports partial question IDs", async () => {
    const literal = await getQuestionPage(normalizeQuestionFilters({ query: "C++ (test), 100%_*" }));
    expect(literal.questions.map(({ qid }) => qid)).toEqual([101]);
    const ids = await getQuestionPage(normalizeQuestionFilters({ query: "403" }));
    expect(ids.questions.some(({ qid }) => qid === 403)).toBe(true);
    expect(ids.total).toBe(11);
  });

  it("keeps absent attempts unused, including on late pages, and lets flags take precedence", async () => {
    const unused = await getQuestionPage(normalizeQuestionFilters({ status: "unused", page: 500 }));
    expect(unused.total).toBe(4032);
    expect(unused.questions).toHaveLength(8);
    expect(Object.values(unused.statuses).every((status) => status === "unused")).toBe(true);
    const incorrect = await getQuestionPage(normalizeQuestionFilters({ status: "incorrect" }));
    expect(incorrect.questions.map(({ qid }) => qid)).toEqual([4]);
    const flagged = await getQuestionPage(normalizeQuestionFilters({ status: "flagged" }));
    expect(flagged.questions.map(({ qid }) => qid)).toEqual([2, 3]);
  });

  it("scopes supplied subjects and topics to the active exam", async () => {
    expect((await getQuestionPage(normalizeQuestionFilters({ subject: "usmle" }))).total).toBe(0);
    expect(calls.some(({ table }) => table === "questions")).toBe(false);
    expect((await getQuestionPage(normalizeQuestionFilters({ topic: "other" }))).total).toBe(0);
    expect((await getQuestionPage(normalizeQuestionFilters({ query: "Private other exam" }))).total).toBe(0);
    state.exam = "usmle";
    expect((await getQuestionPage(normalizeQuestionFilters())).questions.map(({ qid }) => qid)).toEqual([9001]);
  });

  it("loads filter labels without aggregating question counts", async () => {
    expect(await getQuestionLibraryFilters()).toEqual({ subjects: [{ id: "medicine", name: "Medicine" }], topics: [{ id: "cardio", subjectId: "medicine", name: "Cardiology" }] });
    expect(calls.map(({ table }) => table)).toEqual(["subjects", "topics"]);
  });

  it("reports database errors instead of presenting an empty library", async () => {
    failTable = "questions";
    await expect(getQuestionPage(normalizeQuestionFilters())).rejects.toThrow("fixture database unavailable");
  });
});
