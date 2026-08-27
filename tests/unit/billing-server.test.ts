import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  adminFrom: vi.fn(),
  createClient: vi.fn(),
}));

vi.mock("@/lib/demo-session", () => ({ isDemoSession: async () => true }));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ from: mocks.adminFrom }),
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("@/lib/billing-core", () => ({
  billingPlan: vi.fn(),
  billingRequired: () => false,
  billingConfigured: () => false,
  billingServerConfigured: () => false,
  hasCurrentEntitlement: () => false,
  planForPrice: vi.fn(),
}));

import { getBillingSummary, isBillingRequired } from "@/lib/billing";

describe("demo billing isolation", () => {
  beforeEach(() => {
    mocks.adminFrom.mockReset();
    mocks.createClient.mockReset();
  });

  it("does not read billing settings from Supabase", async () => {
    await expect(isBillingRequired()).resolves.toBe(false);
    expect(mocks.adminFrom).not.toHaveBeenCalled();
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it("returns a free demo summary without a billing query", async () => {
    await expect(getBillingSummary()).resolves.toMatchObject({
      mode: "demo",
      required: false,
      hasAccess: true,
      subscriptionHasAccess: false,
    });
    expect(mocks.adminFrom).not.toHaveBeenCalled();
    expect(mocks.createClient).not.toHaveBeenCalled();
  });
});
