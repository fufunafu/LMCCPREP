import { describe, expect, it } from "vitest";
import {
  billingGraceDays,
  billingPlans,
  billingRequired,
  billingServerConfigured,
  billingTrialDays,
  deriveAccessUntil,
  hasCurrentEntitlement,
  planForPrice,
  stripeSecretMatchesEnvironment,
  subscriptionPeriodEnd,
} from "@/lib/billing-core";
import { safeReturnPath } from "@/lib/urls";

describe("billing configuration", () => {
  it("defaults to disabled and clamps grace days", () => {
    expect(billingRequired({})).toBe(false);
    expect(billingRequired({ BILLING_REQUIRED: "true" })).toBe(true);
    expect(billingGraceDays({ BILLING_GRACE_DAYS: "99" })).toBe(30);
    expect(billingGraceDays({ BILLING_GRACE_DAYS: "invalid" })).toBe(3);
    expect(billingTrialDays({ STRIPE_TRIAL_DAYS: "14" })).toBe(14);
    expect(billingTrialDays({ STRIPE_TRIAL_DAYS: "0" })).toBeUndefined();
  });

  it("maps only configured plan keys to trusted price IDs", () => {
    const env = {
      STRIPE_PRICE_MONTHLY: "price_monthly",
      STRIPE_PRICE_ANNUAL: "price_annual",
      NEXT_PUBLIC_BILLING_MONTHLY_CAD: "19.5",
    };
    const plans = billingPlans(env);
    expect(plans[0]).toMatchObject({ key: "monthly", priceId: "price_monthly", amountCad: 19.5, configured: true });
    expect(planForPrice("price_annual", env)).toBe("annual");
    expect(planForPrice("price_attacker", env)).toBeUndefined();
  });

  it("requires Stripe key mode to match the Vercel environment", () => {
    expect(stripeSecretMatchesEnvironment({ VERCEL_ENV: "preview", STRIPE_SECRET_KEY: "sk_test_example" })).toBe(true);
    expect(stripeSecretMatchesEnvironment({ VERCEL_ENV: "preview", STRIPE_SECRET_KEY: "sk_live_example" })).toBe(false);
    expect(stripeSecretMatchesEnvironment({ VERCEL_ENV: "production", STRIPE_SECRET_KEY: "sk_live_example" })).toBe(true);
    expect(stripeSecretMatchesEnvironment({ VERCEL_ENV: "production", STRIPE_SECRET_KEY: "sk_test_example" })).toBe(false);
    expect(stripeSecretMatchesEnvironment({ STRIPE_SECRET_KEY: "sk_test_example" })).toBe(true);
    expect(stripeSecretMatchesEnvironment({ STRIPE_SECRET_KEY: "sk_live_example" })).toBe(false);
  });

  it("requires complete, distinct, approved server configuration", () => {
    const configured = {
      VERCEL_ENV: "preview",
      STRIPE_SECRET_KEY: "sk_test_example",
      STRIPE_WEBHOOK_SECRET: "whsec_example",
      STRIPE_PRICE_MONTHLY: "price_monthly",
      STRIPE_PRICE_ANNUAL: "price_annual",
      SUPABASE_SERVICE_ROLE_KEY: "service-role-example",
      BILLING_TERMS_READY: "true",
    };
    expect(billingServerConfigured(configured)).toBe(true);
    expect(billingServerConfigured({ ...configured, STRIPE_SECRET_KEY: "sk_live_example" })).toBe(false);
    expect(billingServerConfigured({ ...configured, STRIPE_PRICE_ANNUAL: "price_monthly" })).toBe(false);
    expect(billingServerConfigured({ ...configured, BILLING_TERMS_READY: "false" })).toBe(false);
  });
});

describe("subscription entitlement", () => {
  const eventCreated = 1_800_000_000;

  it("uses the subscription item period and trial end", () => {
    expect(subscriptionPeriodEnd([{ current_period_end: 10 }, { current_period_end: 20 }])).toBe(20);
    expect(deriveAccessUntil({ status: "active", currentPeriodEnd: 20, trialEnd: null, eventCreated, graceDays: 3 })).toBe(20);
    expect(deriveAccessUntil({ status: "trialing", currentPeriodEnd: 20, trialEnd: 15, eventCreated, graceDays: 3 })).toBe(15);
  });

  it("applies the configured failed-payment grace period", () => {
    expect(deriveAccessUntil({ status: "past_due", currentPeriodEnd: 2_000_000_000, trialEnd: null, eventCreated, graceDays: 3 })).toBe(eventCreated + 259_200);
    expect(deriveAccessUntil({ status: "unpaid", currentPeriodEnd: 2_000_000_000, trialEnd: null, eventCreated, graceDays: 3 })).toBeNull();
  });

  it("keeps cancellation access only through the paid period", () => {
    expect(deriveAccessUntil({ status: "canceled", currentPeriodEnd: eventCreated + 10, trialEnd: null, eventCreated, graceDays: 3 })).toBe(eventCreated + 10);
    expect(deriveAccessUntil({ status: "canceled", currentPeriodEnd: eventCreated - 10, trialEnd: null, eventCreated, graceDays: 3 })).toBe(eventCreated);
  });

  it("recognizes active subscriptions and unexpired grants", () => {
    const now = new Date("2026-08-25T12:00:00Z");
    expect(hasCurrentEntitlement({ status: "active", accessUntil: "2026-09-25T12:00:00Z" }, now)).toBe(true);
    expect(hasCurrentEntitlement({ status: "trialing", accessUntil: "2026-09-25T12:00:00Z" }, now)).toBe(true);
    expect(hasCurrentEntitlement({ status: "past_due", accessUntil: "2026-08-28T12:00:00Z" }, now)).toBe(true);
    expect(hasCurrentEntitlement({ status: "canceled", accessUntil: "2026-09-25T12:00:00Z" }, now)).toBe(true);
    expect(hasCurrentEntitlement({ status: "active", accessUntil: "2026-07-25T12:00:00Z" }, now)).toBe(false);
    expect(hasCurrentEntitlement({ status: "past_due", accessUntil: "2026-08-25T12:00:00Z" }, now)).toBe(false);
    expect(hasCurrentEntitlement({ status: "incomplete", accessUntil: "2026-09-25T12:00:00Z" }, now)).toBe(false);
    expect(hasCurrentEntitlement({ status: "incomplete_expired", accessUntil: "2026-09-25T12:00:00Z" }, now)).toBe(false);
    expect(hasCurrentEntitlement({ status: "unpaid", accessUntil: "2026-09-25T12:00:00Z" }, now)).toBe(false);
    expect(hasCurrentEntitlement({ status: "paused", accessUntil: "2026-09-25T12:00:00Z" }, now)).toBe(false);
    expect(hasCurrentEntitlement({ status: "active" }, now)).toBe(false);
    expect(hasCurrentEntitlement({ status: "past_due", accessUntil: "invalid" }, now)).toBe(false);
    expect(hasCurrentEntitlement({ granted: true }, now)).toBe(true);
    expect(hasCurrentEntitlement({ granted: true, grantExpiresAt: "2026-08-25T12:00:01Z" }, now)).toBe(true);
    expect(hasCurrentEntitlement({ granted: true, grantExpiresAt: "2026-08-25T12:00:00Z" }, now)).toBe(false);
    expect(hasCurrentEntitlement({ granted: true, grantExpiresAt: "2026-07-25T12:00:00Z" }, now)).toBe(false);
  });

  it("uses an exact grace-period boundary", () => {
    const accessUntil = deriveAccessUntil({
      status: "past_due",
      currentPeriodEnd: null,
      trialEnd: null,
      eventCreated,
      graceDays: 3,
    });
    expect(accessUntil).toBe(eventCreated + 3 * 86_400);
    const accessUntilIso = new Date(accessUntil! * 1000).toISOString();
    expect(hasCurrentEntitlement({ status: "past_due", accessUntil: accessUntilIso }, new Date((accessUntil! - 1) * 1000))).toBe(true);
    expect(hasCurrentEntitlement({ status: "past_due", accessUntil: accessUntilIso }, new Date(accessUntil! * 1000))).toBe(false);
  });
});

describe("trusted return paths", () => {
  it("rejects absolute, protocol-relative, and backslash paths", () => {
    expect(safeReturnPath("/billing?checkout=success")).toBe("/billing?checkout=success");
    expect(safeReturnPath("https://attacker.test")).toBe("/dashboard");
    expect(safeReturnPath("//attacker.test")).toBe("/dashboard");
    expect(safeReturnPath("/\\attacker.test")).toBe("/dashboard");
  });
});
