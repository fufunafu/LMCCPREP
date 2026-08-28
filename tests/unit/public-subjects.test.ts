import { describe, expect, it, vi } from "vitest";
import { fetchApprovedPublicSubjects } from "@/lib/public-subjects";

function fetcherFor(responses: Record<string, () => Response>) {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    const key = Object.keys(responses).find((candidate) => url.includes(candidate));
    return key ? responses[key]() : new Response("not found", { status: 404 });
  }) as unknown as typeof fetch;
}

describe("fetchApprovedPublicSubjects", () => {
  it("lists every exam's approved counts through anonymous aggregate RPCs with one-hour caching", async () => {
    const fetcher = fetcherFor({
      "/rest/v1/exams": () => new Response(JSON.stringify([{ id: "mccqe", sort: 0 }, { id: "usmle", sort: 1 }]), { status: 200 }),
      "get_approved_public_subject_counts_for_exam": () => new Response(JSON.stringify([{ id: "s", name: "Subject", question_count: 12 }]), { status: 200 }),
    });
    await expect(fetchApprovedPublicSubjects("https://example.supabase.co", "public-key", fetcher)).resolves.toEqual([
      { id: "s", name: "Subject", questionCount: 12, examId: "mccqe" },
      { id: "s", name: "Subject", questionCount: 12, examId: "usmle" },
    ]);
    expect(fetcher).toHaveBeenCalledWith(
      "https://example.supabase.co/rest/v1/rpc/get_approved_public_subject_counts_for_exam",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ p_exam: "usmle" }),
        next: { revalidate: 3600, tags: ["public-subject-counts"] },
      }),
    );
    expect((fetcher as unknown as { mock: { calls: unknown[][] } }).mock.calls[0][1]).toMatchObject({ headers: { apikey: "public-key", Authorization: "Bearer public-key" } });
  });

  it("fails closed and reports only an HTTP status when any request fails", async () => {
    const fetcher = fetcherFor({
      "/rest/v1/exams": () => new Response(JSON.stringify([{ id: "mccqe", sort: 0 }]), { status: 200 }),
      "get_approved_public_subject_counts_for_exam": () => new Response("sensitive database message", { status: 503 }),
    });
    await expect(fetchApprovedPublicSubjects("https://example.supabase.co", "public-key", fetcher))
      .rejects.toThrow("Public catalog request failed with status 503.");
    await expect(fetchApprovedPublicSubjects("https://example.supabase.co", "public-key", fetcher))
      .rejects.not.toThrow("sensitive database message");
  });
});
