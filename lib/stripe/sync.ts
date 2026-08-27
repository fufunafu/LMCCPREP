import "server-only";

import type Stripe from "stripe";
import { billingGraceDays, deriveAccessUntil, isoFromUnix, planForPrice, subscriptionPeriodEnd } from "@/lib/billing-core";
import { createAdminClient } from "@/lib/supabase/admin";
import { getOptionalStripe, getStripe } from "@/lib/stripe/server";
import type { BillingSubscriptionStatus } from "@/lib/types";

function objectId(value: string | { id: string } | null | undefined) {
  return typeof value === "string" ? value : value?.id;
}

export async function syncStripeCustomer(userId: string, stripeCustomerId: string) {
  const admin = createAdminClient();
  const { error } = await admin.from("billing_customers").upsert({
    user_id: userId,
    stripe_customer_id: stripeCustomerId,
    updated_at: new Date().toISOString(),
  }, { onConflict: "user_id" });
  if (error) throw new Error("Could not synchronize the billing customer.");
}

async function userIdForSubscription(subscription: Stripe.Subscription) {
  const metadataUserId = subscription.metadata?.supabase_user_id;
  if (metadataUserId) return metadataUserId;
  const stripeCustomerId = objectId(subscription.customer);
  if (!stripeCustomerId) return undefined;
  const admin = createAdminClient();
  const { data } = await admin
    .from("billing_customers")
    .select("user_id")
    .eq("stripe_customer_id", stripeCustomerId)
    .maybeSingle();
  return data?.user_id as string | undefined;
}

export async function syncStripeSubscription(
  subscription: Stripe.Subscription,
  eventCreated: number,
  paymentEvent?: "paid" | "failed",
  reconciliation = false,
) {
  const userId = await userIdForSubscription(subscription);
  const stripeCustomerId = objectId(subscription.customer);
  const firstItem = subscription.items.data[0];
  if (!userId || !stripeCustomerId || !firstItem?.price?.id) {
    // In hosted "links" mode the customer mapping is written by
    // checkout.session.completed; a subscription event that arrives first
    // fails here so Stripe redelivers it once the mapping exists.
    throw new Error("Stripe subscription identity is incomplete.");
  }
  if (subscription.items.data.length !== 1 || !planForPrice(firstItem.price.id)) {
    throw new Error("Stripe subscription price is not an approved billing plan.");
  }

  await syncStripeCustomer(userId, stripeCustomerId);
  const legacyPeriodEnd = (subscription as Stripe.Subscription & { current_period_end?: number }).current_period_end;
  const currentPeriodEnd = subscriptionPeriodEnd(subscription.items.data, legacyPeriodEnd);
  const trialEnd = subscription.trial_end;
  const cancellationScheduled = subscription.cancel_at_period_end || Boolean(subscription.cancel_at);
  const status = subscription.status as BillingSubscriptionStatus;
  const entitlementStatus = paymentEvent === "failed"
    ? "past_due"
    : paymentEvent === "paid"
      ? "active"
      : status;
  const accessUntil = deriveAccessUntil({
    status: entitlementStatus,
    currentPeriodEnd,
    trialEnd,
    eventCreated,
    graceDays: billingGraceDays(),
  });
  const stateObservedAt = reconciliation ? Math.floor(Date.now() / 1000) : eventCreated;
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("sync_billing_subscription", {
    p_stripe_subscription_id: subscription.id,
    p_user_id: userId,
    p_stripe_customer_id: stripeCustomerId,
    p_stripe_price_id: firstItem.price.id,
    p_status: status,
    p_current_period_end: isoFromUnix(currentPeriodEnd),
    p_access_until: isoFromUnix(accessUntil),
    p_cancel_at_period_end: cancellationScheduled,
    p_trial_end: isoFromUnix(trialEnd),
    p_event_created_at: isoFromUnix(stateObservedAt),
    p_payment_event: paymentEvent ?? null,
    p_is_reconciliation: reconciliation,
  });
  if (error) throw new Error("Could not synchronize the Stripe subscription.");
  return Boolean(data);
}

function invoiceSubscriptionId(invoice: Stripe.Invoice) {
  return objectId(invoice.parent?.subscription_details?.subscription);
}

function pastDueAnchorTimestamp(subscription: Stripe.Subscription, fallback: number) {
  if (subscription.status !== "past_due") return fallback;
  const latestInvoice = subscription.latest_invoice;
  return typeof latestInvoice === "object" && latestInvoice?.created
    ? latestInvoice.created
    : fallback;
}

export async function processStripeEvent(event: Stripe.Event) {
  // Without an API key (hosted "links" mode) events are processed from their
  // own payloads only; subscription lifecycle events carry everything needed.
  const stripe = getOptionalStripe();
  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object;
      const userId = session.client_reference_id ?? session.metadata?.supabase_user_id;
      const customerId = objectId(session.customer);
      if (!userId || !customerId) throw new Error("Checkout session identity is incomplete.");
      await syncStripeCustomer(userId, customerId);
      const subscriptionId = objectId(session.subscription);
      if (subscriptionId && stripe) {
        const subscription = await stripe.subscriptions.retrieve(subscriptionId, { expand: ["items.data.price"] });
        await syncStripeSubscription(subscription, event.created);
      }
      return;
    }
    case "customer.subscription.created":
    case "customer.subscription.updated": {
      const subscription = stripe
        ? await stripe.subscriptions.retrieve(event.data.object.id, { expand: ["items.data.price"] })
        : event.data.object;
      await syncStripeSubscription(subscription, event.created);
      return;
    }
    case "customer.subscription.deleted":
      await syncStripeSubscription(event.data.object, event.created);
      return;
    case "invoice.paid":
    case "invoice.payment_failed": {
      // Without an API key the subscription cannot be retrieved here; the
      // matching customer.subscription.updated event carries the new status.
      if (!stripe) return;
      const subscriptionId = invoiceSubscriptionId(event.data.object);
      if (!subscriptionId) return;
      const subscription = await stripe.subscriptions.retrieve(subscriptionId, { expand: ["items.data.price"] });
      await syncStripeSubscription(subscription, event.created, event.type === "invoice.paid" ? "paid" : "failed");
      return;
    }
    default:
      return;
  }
}

export async function reconcileBillingUser(userId: string) {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("billing_customers")
    .select("stripe_customer_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (error || !data?.stripe_customer_id) return false;
  const subscriptions = await getStripe().subscriptions.list({
    customer: data.stripe_customer_id,
    status: "all",
    limit: 10,
    expand: ["data.items.data.price", "data.latest_invoice"],
  });
  if (!subscriptions.data.length) return false;
  const reconciledAt = Math.floor(Date.now() / 1000);
  await Promise.all(subscriptions.data.map((subscription) => syncStripeSubscription(
    subscription,
    pastDueAnchorTimestamp(subscription, reconciledAt),
    undefined,
    true,
  )));
  return true;
}
