import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ demo: false, entitled: vi.fn(), summary: vi.fn(), redirect: vi.fn() }));
vi.mock("@/components/app-shell", () => ({ AppShell: () => null }));
vi.mock("@/lib/data", () => ({ getProfile: async () => ({ id: "user", examId: "mccqe" }), getExams: async () => [] }));
vi.mock("@/lib/demo-session", () => ({ isDemoSession: async () => mocks.demo }));
vi.mock("@/lib/admin", () => ({ isAdmin: async () => false }));
vi.mock("@/lib/coaching", () => ({ getMyTutor: async () => null }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/lib/billing", () => ({
  requireEntitledUserId: mocks.entitled,
  getBillingSummary: mocks.summary,
  SubscriptionRequiredError: class SubscriptionRequiredError extends Error {},
}));
import PrivateLayout from "@/app/(app)/layout";
import { SubscriptionRequiredError } from "@/lib/billing";

beforeEach(() => {
  vi.stubGlobal("React", React);
  mocks.demo = false;
  mocks.entitled.mockReset().mockResolvedValue("user");
  mocks.summary.mockReset();
  mocks.redirect.mockReset().mockImplementation(() => { throw new Error("redirected"); });
});

describe("private navigation access", () => {
  it("checks entitlement without fetching subscription details", async () => {
    const result = await PrivateLayout({ children: "Private page" });
    expect(result.props.children).toBe("Private page");
    expect(mocks.entitled).toHaveBeenCalledOnce();
    expect(mocks.summary).not.toHaveBeenCalled();
  });

  it("keeps demo navigation isolated from billing", async () => {
    mocks.demo = true;
    await PrivateLayout({ children: "Demo page" });
    expect(mocks.entitled).not.toHaveBeenCalled();
    expect(mocks.summary).not.toHaveBeenCalled();
  });

  it("redirects learners without an entitlement", async () => {
    mocks.entitled.mockRejectedValue(new SubscriptionRequiredError());
    await expect(PrivateLayout({ children: "Private page" })).rejects.toThrow("redirected");
    expect(mocks.redirect).toHaveBeenCalledWith("/billing?notice=subscription-required");
  });

  it("does not render protected content when verification fails", async () => {
    mocks.entitled.mockRejectedValue(new Error("Access verification unavailable"));
    await expect(PrivateLayout({ children: "Private page" })).rejects.toThrow("Access verification unavailable");
  });
});
