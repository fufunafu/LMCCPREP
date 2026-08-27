import { describe, expect, it, vi } from "vitest";
import { fetchApprovedPublicSubjects } from "@/lib/public-subjects";

describe("fetchApprovedPublicSubjects", () => {
  it("uses the anonymous aggregate RPC with one-hour fetch caching", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify([
      { id: "medicine", name: "Internal Medicine", question_count: 12 },
    ]), { status: 200 })) as typeof fetch;

    await expect(fetchApprovedPublicSubjects("https://example.supabase.co", "public-key", fetcher)).resolves.toEqual([
      { id: "medicine", name: "Internal Medicine", questionCount: 12 },
    ]);
    expect(fetcher).toHaveBeenCalledWith(
      "https://example.supabase.co/rest/v1/rpc/get_approved_public_subject_counts",
      expect.objectContaining({
        headers: { apikey: "public-key", Authorization: "Bearer public-key" },
        next: { revalidate: 3600, tags: ["public-subject-counts"] },
      }),
    );
  });

  it("reports only an HTTP status when the aggregate request fails", async () => {
    const fetcher = vi.fn(async () => new Response("sensitive database message", { status: 503 })) as typeof fetch;
    await expect(fetchApprovedPublicSubjects("https://example.supabase.co", "public-key", fetcher))
      .rejects.toThrow("Public catalog request failed with status 503.");
    await expect(fetchApprovedPublicSubjects("https://example.supabase.co", "public-key", fetcher))
      .rejects.not.toThrow("sensitive database message");
  });
});
