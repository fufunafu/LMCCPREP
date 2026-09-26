import { describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ snapshot: vi.fn(), page: vi.fn() }));
vi.mock("@/lib/study-server", () => ({ studySnapshot: mocks.snapshot, studyDownloadPage: mocks.page }));
import { SubscriptionRequiredError } from "@/lib/billing";
import { GET as snapshot } from "@/app/api/study/snapshot/route";
import { GET as download } from "@/app/api/study/download/route";

describe("study read failures", () => {
  it("reports backend outages as retryable without revoking offline authorization", async () => {
    mocks.snapshot.mockRejectedValue(new Error("Database connection failed"));
    mocks.page.mockRejectedValue(new Error("Database connection failed"));
    for (const response of [await snapshot(), await download(new Request("https://example.test/api/study/download?kind=questions"))]) {
      expect(response.status).toBe(503);
      expect(response.headers.get("cache-control")).toContain("no-store");
      expect((await response.json()).error).toContain("temporarily unavailable");
    }
  });
  it("still revokes access for a confirmed entitlement denial", async () => {
    mocks.snapshot.mockRejectedValue(new SubscriptionRequiredError());
    mocks.page.mockRejectedValue(new SubscriptionRequiredError());
    expect((await snapshot()).status).toBe(403);
    const response = await download(new Request("https://example.test/api/study/download?kind=questions"));
    expect(response.status).toBe(403);
  });
});
