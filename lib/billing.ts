import "server-only";

import { cache } from "react";
import { isDemoSession } from "@/lib/demo-session";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { billingConfigured, billingPlan, billingRequired, hasCurrentEntitlement, planForPrice } from "@/lib/billing-core";
import type { BillingPlanKey, BillingSubscriptionStatus, BillingSummary } from "@/lib/types";

type ServerSupabaseClient = Awaited<ReturnType<typeof createClient>>;

type SubscriptionRow = {
  stripe_subscription_id: string;
  stripe_customer_id: string;
  stripe_price_id: string;
  status: BillingSubscriptionStatus;
  current_period_end: string | null;
  access_until: string | null;
  cancel_at_period_end: boolean;
  trial_end: string | null;
  payment_failed_at: string | null;
};

export class SubscriptionRequiredError extends Error {
  constructor() {
    super("An active Montreal QBank subscription is required.");
    this.name = "SubscriptionRequiredError";
  }
}

/**
 * Whether paid access is enforced. Reads `billing_settings.billing_required`
 * once per request (React cache) with the service-role client. The
 * `BILLING_REQUIRED` env var only forces enforcement ON, and is the fallback
 * when the database cannot be read.
 */
export const isBillingRequired = cache(async (): Promise<boolean> => {
  // Demo mode must stay completely isolated from live billing services.
  if (await isDemoSession()) return false;
  if (billingRequired()) return true;
  try {
    const { data, error } = await createAdminClient()
      .from("billing_settings")
      .select("billing_required")
      .eq("id", true)
      .maybeSingle();
    if (error) throw error;
    return Boolean(data?.billing_required);
  } catch (error) {
    console.error("billing: could not read billing_settings; falling back to BILLING_REQUIRED", error);
    return billingRequired();
  }
});

export async function authenticatedBillingUser(supabase?: ServerSupabaseClient) {
  const client = supabase ?? await createClient();
  const { data, error } = await client.auth.getClaims();
  const userId = data?.claims?.sub as string | undefined;
  const email = data?.claims?.email as string | undefined;
  if (error || !userId) throw new Error("Your session has expired. Sign in again to continue.");
  return { userId, email: email ?? "", supabase: client };
}

export async function requireEntitledUserId(supabase?: ServerSupabaseClient) {
  const client = supabase ?? await createClient();
  const { userId } = await authenticatedBillingUser(client);
  if (!(await isBillingRequired())) return userId;
  const { data, error } = await client.rpc("has_billing_access");
  if (error) throw new Error("Billing access could not be verified. Try again shortly.");
  if (!data) throw new SubscriptionRequiredError();
  return userId;
}

export const getBillingSummary = cache(async (): Promise<BillingSummary> => {
  const configured = billingConfigured();
  if (await isDemoSession()) {
    return { mode: "demo", configured, required: false, hasAccess: true, subscriptionHasAccess: false };
  }
  const required = await isBillingRequired();

  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub as string | undefined;
  if (!userId) {
    return { mode: "configuration_error", configured, required, hasAccess: false, subscriptionHasAccess: false, error: "Sign in to view billing." };
  }

  const [customerResult, subscriptionResult, grantResult, accessResult] = await Promise.all([
    supabase.from("billing_customers").select("stripe_customer_id").eq("user_id", userId).maybeSingle(),
    supabase
      .from("billing_subscriptions")
      .select("stripe_subscription_id,stripe_customer_id,stripe_price_id,status,current_period_end,access_until,cancel_at_period_end,trial_end,payment_failed_at")
      .eq("user_id", userId)
      .order("access_until", { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle(),
    supabase.from("billing_access_grants").select("expires_at").eq("user_id", userId).maybeSingle(),
    required ? supabase.rpc("has_billing_access") : Promise.resolve({ data: true, error: null }),
  ]);

  const queryError = customerResult.error ?? subscriptionResult.error ?? grantResult.error ?? accessResult.error;
  if (queryError) {
    if (!required) return { mode: "disabled", configured, required: false, hasAccess: true, subscriptionHasAccess: false };
    return {
      mode: "configuration_error",
      configured,
      required,
      hasAccess: false,
      subscriptionHasAccess: false,
      error: "Billing access could not be verified. Try again shortly.",
    };
  }

  const subscription = subscriptionResult.data as SubscriptionRow | null;
  const subscriptionHasAccess = hasCurrentEntitlement({
    status: subscription?.status,
    accessUntil: subscription?.access_until ?? undefined,
  });
  const grantExpiresAt = grantResult.data?.expires_at ?? undefined;
  const granted = hasCurrentEntitlement({
    granted: Boolean(grantResult.data),
    grantExpiresAt,
  });
  return {
    mode: configured ? "enabled" : required ? "configuration_error" : "disabled",
    configured,
    required,
    hasAccess: Boolean(accessResult.data),
    subscriptionHasAccess,
    customerId: customerResult.data?.stripe_customer_id,
    subscriptionId: subscription?.stripe_subscription_id,
    priceId: subscription?.stripe_price_id,
    plan: planForPrice(subscription?.stripe_price_id),
    status: subscription?.status,
    currentPeriodEnd: subscription?.current_period_end ?? undefined,
    accessUntil: subscription?.access_until ?? undefined,
    trialEnd: subscription?.trial_end ?? undefined,
    paymentFailedAt: subscription?.payment_failed_at ?? undefined,
    cancelAtPeriodEnd: subscription?.cancel_at_period_end,
    granted,
    grantExpiresAt,
    error: !configured && required ? "Stripe billing is not fully configured." : undefined,
  };
});

export function checkoutPrice(plan: BillingPlanKey) {
  const selected = billingPlan(plan);
  if (!selected?.priceId) throw new Error("That billing plan is not configured.");
  return selected.priceId;
}

export function trustedMutationOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}
