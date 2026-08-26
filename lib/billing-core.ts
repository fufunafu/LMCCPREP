import "server-only";

import type { BillingPlan, BillingPlanKey, BillingSubscriptionStatus } from "@/lib/types";

const ENTITLED_STATUSES = new Set<BillingSubscriptionStatus>(["active", "trialing", "past_due", "canceled"]);

type BillingEnvironment = Readonly<Record<string, string | undefined>>;

/**
 * Environment override for billing enforcement. The database row
 * `billing_settings.billing_required` is the single authority (see
 * `isBillingRequired()` in lib/billing.ts); `BILLING_REQUIRED=true` can only
 * force enforcement ON (never off), and is also the fallback when the database
 * read fails, so a misconfigured environment cannot silently unlock paid content.
 */
export function billingRequired(env: BillingEnvironment = process.env) {
  return env.BILLING_REQUIRED?.trim().toLowerCase() === "true";
}

export function automaticTaxEnabled(env: BillingEnvironment = process.env) {
  return env.STRIPE_AUTOMATIC_TAX?.trim().toLowerCase() === "true";
}

export function billingGraceDays(env: BillingEnvironment = process.env) {
  const value = Number(env.BILLING_GRACE_DAYS ?? 3);
  return Number.isFinite(value) ? Math.max(0, Math.min(30, Math.round(value))) : 3;
}

export function billingTrialDays(env: BillingEnvironment = process.env) {
  const value = Number(env.STRIPE_TRIAL_DAYS ?? 0);
  return Number.isFinite(value) && value >= 1 && value <= 365 ? Math.round(value) : undefined;
}

function optionalCadAmount(value: string | undefined) {
  if (!value?.trim()) return undefined;
  const amount = Number(value);
  return Number.isFinite(amount) && amount >= 0 ? amount : undefined;
}

export function formatCad(amount: number) {
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
    minimumFractionDigits: amount % 1 === 0 ? 0 : 2,
  }).format(amount);
}

export function billingPlans(env: BillingEnvironment = process.env): BillingPlan[] {
  const monthlyAmount = optionalCadAmount(env.NEXT_PUBLIC_BILLING_MONTHLY_CAD);
  const annualAmount = optionalCadAmount(env.NEXT_PUBLIC_BILLING_ANNUAL_CAD);
  const trialDays = billingTrialDays(env);
  const plans: Array<Omit<BillingPlan, "configured">> = [
    {
      key: "monthly",
      name: "Monthly",
      cadence: "per month",
      priceId: env.STRIPE_PRICE_MONTHLY?.trim() || undefined,
      amountCad: monthlyAmount,
      formattedPrice: monthlyAmount === undefined ? undefined : formatCad(monthlyAmount),
      trialDays,
    },
    {
      key: "annual",
      name: "Annual",
      cadence: "per year",
      priceId: env.STRIPE_PRICE_ANNUAL?.trim() || undefined,
      amountCad: annualAmount,
      formattedPrice: annualAmount === undefined ? undefined : formatCad(annualAmount),
      trialDays,
    },
  ];
  return plans.map((plan) => ({ ...plan, configured: Boolean(plan.priceId) }));
}

export function billingPlan(plan: BillingPlanKey, env: BillingEnvironment = process.env) {
  return billingPlans(env).find((candidate) => candidate.key === plan);
}

export function stripeSecretMatchesEnvironment(env: BillingEnvironment = process.env) {
  const key = env.STRIPE_SECRET_KEY?.trim();
  if (!key) return false;
  const isTest = key.startsWith("sk_test_") || key.startsWith("rk_test_");
  const isLive = key.startsWith("sk_live_") || key.startsWith("rk_live_");
  if (env.VERCEL_ENV === "production") return isLive;
  return isTest;
}

export function publicBillingPlans(env: BillingEnvironment = process.env) {
  return billingPlans(env).map((plan) => ({
    key: plan.key,
    name: plan.name,
    cadence: plan.cadence,
    amountCad: plan.amountCad,
    formattedPrice: plan.formattedPrice,
    trialDays: plan.trialDays,
    configured: plan.configured,
  }));
}

export function planForPrice(priceId: string | undefined, env: BillingEnvironment = process.env): BillingPlanKey | undefined {
  if (!priceId) return undefined;
  return billingPlans(env).find((plan) => plan.priceId === priceId)?.key;
}

export function billingServerConfigured(env: BillingEnvironment = process.env) {
  const monthlyPrice = env.STRIPE_PRICE_MONTHLY?.trim();
  const annualPrice = env.STRIPE_PRICE_ANNUAL?.trim();
  return Boolean(
    stripeSecretMatchesEnvironment(env)
    && env.STRIPE_WEBHOOK_SECRET?.trim().startsWith("whsec_")
    && monthlyPrice?.startsWith("price_")
    && annualPrice?.startsWith("price_")
    && monthlyPrice !== annualPrice
    && env.SUPABASE_SERVICE_ROLE_KEY?.trim()
    && env.BILLING_TERMS_READY?.trim().toLowerCase() === "true",
  );
}

export function isoFromUnix(value: number | null | undefined) {
  return value == null ? null : new Date(value * 1000).toISOString();
}

export function subscriptionPeriodEnd(items: Array<{ current_period_end: number }>) {
  if (!items.length) return null;
  return Math.max(...items.map((item) => item.current_period_end));
}

export function deriveAccessUntil(input: {
  status: BillingSubscriptionStatus;
  currentPeriodEnd: number | null;
  trialEnd: number | null;
  eventCreated: number;
  graceDays: number;
}) {
  const { status, currentPeriodEnd, trialEnd, eventCreated, graceDays } = input;
  if (status === "trialing") return trialEnd ?? currentPeriodEnd;
  if (status === "active") return currentPeriodEnd;
  if (status === "past_due") return eventCreated + graceDays * 86_400;
  if (status === "canceled") return currentPeriodEnd && currentPeriodEnd > eventCreated ? currentPeriodEnd : eventCreated;
  return null;
}

export function hasCurrentEntitlement(input: {
  status?: BillingSubscriptionStatus;
  accessUntil?: string;
  granted?: boolean;
  grantExpiresAt?: string;
}, now = new Date()) {
  if (input.granted && (!input.grantExpiresAt || new Date(input.grantExpiresAt) > now)) return true;
  return Boolean(input.status && ENTITLED_STATUSES.has(input.status) && input.accessUntil && new Date(input.accessUntil) > now);
}
