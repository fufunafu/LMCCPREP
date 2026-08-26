import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn() },
}));

import { BillingView } from "@/components/billing-view";
import type { BillingPlan, BillingSummary } from "@/lib/types";

const plans: BillingPlan[] = [
  { key: "monthly", name: "Monthly", cadence: "per month", formattedPrice: "$20", amountCad: 20, configured: true },
  { key: "annual", name: "Annual", cadence: "per year", formattedPrice: "$200", amountCad: 200, configured: true },
];

function summary(overrides: Partial<BillingSummary> = {}): BillingSummary {
  return {
    mode: "enabled",
    configured: true,
    required: false,
    hasAccess: true,
    subscriptionHasAccess: false,
    ...overrides,
  };
}

describe("billing rollout UI", () => {
  it("keeps test Checkout available while beta access enforcement is off", () => {
    const html = renderToStaticMarkup(<BillingView plans={plans} summary={summary()} />);
    expect(html).toContain("Choose monthly");
    expect(html).toContain("Choose annual");
    expect(html).toContain("Private beta access");
    expect(html).toContain("Applicable taxes, if any");
    expect(html).toContain("Obstetrics and Gynecology is not yet included");
    expect(html).toContain("Available rights-approved, reviewed questions");
    expect(html).not.toContain("Complete question bank");
    expect(html).toContain('href="/refund-policy"');
  });

  it("waits for subscription entitlement instead of trusting the success redirect", () => {
    const waiting = renderToStaticMarkup(<BillingView plans={plans} summary={summary()} checkout="success" />);
    expect(waiting).toContain("Waiting for the verified Stripe webhook");
    expect(waiting).not.toContain("Continue to dashboard</a><button");

    const confirmed = renderToStaticMarkup(<BillingView
      plans={plans}
      checkout="success"
      summary={summary({
        subscriptionId: "sub_test",
        status: "active",
        accessUntil: "2030-01-01T00:00:00.000Z",
        subscriptionHasAccess: true,
      })}
    />);
    expect(confirmed).not.toContain("Waiting for the verified Stripe webhook");
    expect(confirmed).toContain("Continue to dashboard");
  });

  it("offers a fresh plan only after terminal subscription states", () => {
    const unpaid = renderToStaticMarkup(<BillingView plans={plans} summary={summary({
      subscriptionId: "sub_unpaid",
      status: "unpaid",
      hasAccess: false,
    })} />);
    expect(unpaid).toContain("Choose monthly");

    const pastDue = renderToStaticMarkup(<BillingView plans={plans} summary={summary({
      subscriptionId: "sub_past_due",
      customerId: "cus_test",
      status: "past_due",
      hasAccess: false,
    })} />);
    expect(pastDue).not.toContain("Choose monthly");
    expect(pastDue).toContain("Update payment method");
  });
});
