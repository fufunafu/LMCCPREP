import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  demo: false,
  rpc: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
  sessionRow: { question_ids: [101, 102, 103] } as { question_ids: number[] } | null,
  questionRow: { answer_index: 1, options: ["A", "B", "C"] } as { answer_index: number; options: string[] } | null,
}));

vi.mock("@/lib/demo-session", () => ({ isDemoSession: async () => mocks.demo }));
vi.mock("@/lib/billing", () => ({ requireEntitledUserId: async () => "00000000-0000-4000-8000-000000000001" }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: async () => ({ set: vi.fn(), delete: vi.fn(), get: vi.fn() }), headers: async () => new Headers() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  },
}));

function table(name: string) {
  const chain = {
    select: () => chain,
    eq: () => chain,
    maybeSingle: async () => ({ data: name === "sessions" ? mocks.sessionRow : mocks.questionRow, error: null }),
    single: async () => ({ data: { id: "session-new" }, error: null }),
    insert: (value: unknown) => {
      mocks.insert(name, value);
      return { ...chain, then: undefined, select: () => chain, error: null } as unknown as typeof chain & PromiseLike<{ error: null }>;
    },
    update: (value: unknown) => {
      mocks.update(name, value);
      return { eq: async () => ({ error: null }) };
    },
  };
  return chain;
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getClaims: async () => ({ data: { claims: { sub: "00000000-0000-4000-8000-000000000001" } }, error: null }) },
    from: (name: string) => table(name),
    rpc: mocks.rpc,
  }),
}));

import { createSession, recordAttempt, setSessionProgress } from "@/lib/actions";

describe("recordAttempt validation", () => {
  beforeEach(() => {
    mocks.demo = false;
    mocks.sessionRow = { question_ids: [101, 102, 103] };
    mocks.questionRow = { answer_index: 1, options: ["A", "B", "C"] };
    mocks.insert.mockReset();
    mocks.update.mockReset();
    mocks.rpc.mockReset();
  });

  it("rejects an out-of-range or non-integer choice", async () => {
    await expect(recordAttempt({ sessionId: "s1", qid: 101, chosenIdx: 3, timeMs: 1000 })).rejects.toThrow("Choose a valid answer.");
    await expect(recordAttempt({ sessionId: "s1", qid: 101, chosenIdx: -1, timeMs: 1000 })).rejects.toThrow("Choose a valid answer.");
    await expect(recordAttempt({ sessionId: "s1", qid: 101, chosenIdx: 1.5, timeMs: 1000 })).rejects.toThrow("Choose a valid answer.");
    await expect(recordAttempt({ sessionId: "s1", qid: 101, chosenIdx: 1, timeMs: Number.NaN })).rejects.toThrow("Choose a valid answer.");
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it("rejects a question that is not part of the session", async () => {
    await expect(recordAttempt({ sessionId: "s1", qid: 999, chosenIdx: 1, timeMs: 1000 })).rejects.toThrow("not part of the session");
    await expect(recordAttempt({ sessionId: "", qid: 101, chosenIdx: 1, timeMs: 1000 })).rejects.toThrow("not part of the session");
    await expect(recordAttempt({ sessionId: "s1", qid: 1.5, chosenIdx: 1, timeMs: 1000 })).rejects.toThrow("no longer available");
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it("stores a clamped time and server-derived correctness", async () => {
    await recordAttempt({ sessionId: "s1", qid: 101, chosenIdx: 1, timeMs: 99_999_999_999 });
    expect(mocks.insert).toHaveBeenCalledWith("attempts", expect.objectContaining({ qid: 101, chosen_index: 1, correct: true, time_ms: 86_400_000 }));
    await recordAttempt({ sessionId: "s1", qid: 101, chosenIdx: null, timeMs: -50 });
    expect(mocks.insert).toHaveBeenLastCalledWith("attempts", expect.objectContaining({ chosen_index: null, correct: false, time_ms: 0 }));
  });

  it("is a no-op in the demo", async () => {
    mocks.demo = true;
    await expect(recordAttempt({ sessionId: "s1", qid: 101, chosenIdx: 9, timeMs: 1 })).resolves.toBeUndefined();
    expect(mocks.insert).not.toHaveBeenCalled();
  });
});

describe("createSession validation", () => {
  beforeEach(() => {
    mocks.demo = false;
    mocks.insert.mockReset();
    mocks.rpc.mockReset().mockResolvedValue({ data: [101, 102], error: null });
  });

  it("rejects an invalid mode or status before touching the database", async () => {
    await expect(createSession({ mode: "exam" as never, subjectIds: [], topicIds: [], status: "all", count: 20 })).rejects.toThrow("Choose a valid session mode.");
    await expect(createSession({ mode: "tutor", subjectIds: [], topicIds: [], status: "starred" as never, count: 20 })).rejects.toThrow("Choose a valid question status.");
    await expect(createSession({ mode: "tutor", subjectIds: [], topicIds: [], status: "all", count: Number.NaN })).rejects.toThrow("Choose a valid number of questions.");
    await expect(createSession({ mode: "tutor", subjectIds: [1 as never], topicIds: [], status: "all", count: 20 })).rejects.toThrow("Choose valid subjects and topics.");
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it("clamps the count and seconds per question and returns the new session location", async () => {
    await expect(createSession({ mode: "timed", subjectIds: ["medicine"], topicIds: [], status: "unused", count: 5000, secondsPerQuestion: 5 })).resolves.toEqual({ redirectTo: "/session/session-new" });
    expect(mocks.rpc).toHaveBeenCalledWith("pick_questions", expect.objectContaining({ p_subjects: ["medicine"], p_topics: null, p_status: "unused", p_limit: 115 }));
    expect(mocks.insert).toHaveBeenCalledWith("sessions", expect.objectContaining({ mode: "timed", question_ids: [101, 102], seconds_per_question: 15 }));
  });

  it("defaults timed sessions to the current 83-second exam pace", async () => {
    await expect(createSession({ mode: "timed", subjectIds: [], topicIds: [], status: "all", count: 10 })).resolves.toEqual({ redirectTo: "/session/session-new" });
    expect(mocks.insert).toHaveBeenCalledWith("sessions", expect.objectContaining({ seconds_per_question: 83 }));
  });

  it("returns an error instead of creating an empty session", async () => {
    mocks.rpc.mockResolvedValue({ data: [], error: null });
    await expect(createSession({ mode: "tutor", subjectIds: [], topicIds: [], status: "flagged", count: 10 })).resolves.toEqual({ error: "No questions match those filters." });
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it("sends demo users to the demo session", async () => {
    mocks.demo = true;
    await expect(createSession({ mode: "timed", subjectIds: [], topicIds: [], status: "all", count: 10 })).resolves.toEqual({ redirectTo: "/session/demo?mode=timed" });
  });
});

describe("setSessionProgress validation", () => {
  beforeEach(() => {
    mocks.demo = false;
    mocks.sessionRow = { question_ids: [101, 102, 103] };
    mocks.update.mockReset();
  });

  it("rejects negative or non-integer positions", async () => {
    await expect(setSessionProgress("s1", -1)).rejects.toThrow("Choose a valid question position.");
    await expect(setSessionProgress("s1", 1.5)).rejects.toThrow("Choose a valid question position.");
    await expect(setSessionProgress("s1", Number.NaN)).rejects.toThrow("Choose a valid question position.");
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("clamps the position to the session length", async () => {
    await setSessionProgress("s1", 50);
    expect(mocks.update).toHaveBeenCalledWith("sessions", { current_index: 2 });
    await setSessionProgress("s1", 1);
    expect(mocks.update).toHaveBeenLastCalledWith("sessions", { current_index: 1 });
  });

  it("fails when the session does not exist", async () => {
    mocks.sessionRow = null;
    await expect(setSessionProgress("missing", 0)).rejects.toThrow("no longer available");
    expect(mocks.update).not.toHaveBeenCalled();
  });
});
