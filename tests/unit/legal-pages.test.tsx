import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import TermsPage from "@/app/terms/page";
import RefundPolicyPage from "@/app/refund-policy/page";
import { marketingShellData } from "@/lib/marketing-shell-data";

vi.mock("@/components/theme-toggle", () => ({ ThemeToggle: () => null }));
vi.mock("@/lib/data", () => ({ getPublicSubjects: async () => [] }));

function configureCheckout(enabled: boolean) {
  for (const [key, value] of Object.entries({
    VERCEL_ENV: "preview", STRIPE_SECRET_KEY: "sk_test_example", STRIPE_WEBHOOK_SECRET: "whsec_example",
    STRIPE_PRICE_MONTHLY: "price_monthly", STRIPE_PRICE_ANNUAL: "price_annual", SUPABASE_SERVICE_ROLE_KEY: "example",
    BILLING_TERMS_READY: String(enabled), NEXT_PUBLIC_BILLING_MONTHLY_CAD: "59", NEXT_PUBLIC_BILLING_ANNUAL_CAD: "159",
    STRIPE_TRIAL_DAYS: "0",
  })) vi.stubEnv(key, value);
}

afterEach(() => vi.unstubAllEnvs());

describe("purchase disclosures", () => {
  it.each([true, false])("matches marketing availability with checkout enabled=%s", async (enabled) => {
    configureCheckout(enabled);
    expect((await marketingShellData()).checkoutAvailable).toBe(enabled);
    const terms = renderToStaticMarkup(<TermsPage />);
    const refunds = renderToStaticMarkup(<RefundPolicyPage />);
    for (const html of [terms, refunds]) {
      expect(html.includes("subscriptions are available through our website")).toBe(enabled);
      expect(html.includes("New question-bank subscriptions are temporarily unavailable")).toBe(!enabled);
      expect(html).not.toContain("does not offer purchases or subscriptions");
      expect(html).not.toContain("There is no active checkout");
      expect(html).toContain("Apple In-App Purchase");
    }
    expect(terms).toContain("Subscriptions renew automatically until canceled");
    expect(terms).toContain('href="/refund-policy"');
    // Existing customers retain their refund terms when new checkout is paused.
    expect(refunds).toContain("within 7 calendar days of your initial purchase");
    expect(refunds).toContain("no more than 25 questions");
    expect(refunds).toContain("within 7 calendar days of the renewal charge");
    expect(refunds).toContain("Cancel at least 24 hours");
  });

  it("does not contradict the configured trial", () => {
    configureCheckout(true);
    expect(renderToStaticMarkup(<TermsPage />)).toContain("No paid-product free trial is offered");
    vi.stubEnv("STRIPE_TRIAL_DAYS", "14");
    const terms = renderToStaticMarkup(<TermsPage />);
    expect(terms).toContain("A 14-day trial");
    expect(terms).not.toContain("No paid-product free trial");
  });
});
