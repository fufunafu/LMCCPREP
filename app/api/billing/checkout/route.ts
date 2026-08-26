import type Stripe from "stripe";
import { NextResponse } from "next/server";
import { authenticatedBillingUser, checkoutPrice, trustedMutationOrigin } from "@/lib/billing";
import { automaticTaxEnabled, billingServerConfigured, billingTrialDays } from "@/lib/billing-core";
import { isDemoSession } from "@/lib/demo-session";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStripe } from "@/lib/stripe/server";
import type { BillingPlanKey } from "@/lib/types";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!trustedMutationOrigin(request)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  if (await isDemoSession()) return NextResponse.json({ error: "Billing is not available in the demo." }, { status: 403 });
  if (!billingServerConfigured()) return NextResponse.json({ error: "Billing is not fully configured yet." }, { status: 503 });

  try {
    const body = await request.json() as { plan?: BillingPlanKey };
    if (body.plan !== "monthly" && body.plan !== "annual") {
      return NextResponse.json({ error: "Choose a valid billing plan." }, { status: 400 });
    }

    const { userId, email } = await authenticatedBillingUser();
    const priceId = checkoutPrice(body.plan);
    const admin = createAdminClient();
    const stripe = getStripe();
    const now = new Date().toISOString();
    const [subscriptionResult, grantResult] = await Promise.all([
      admin
        .from("billing_subscriptions")
        .select("stripe_subscription_id")
        .eq("user_id", userId)
        .or(`status.in.(active,trialing,past_due,incomplete,paused),and(status.eq.canceled,access_until.gt.${now})`)
        .limit(1)
        .maybeSingle(),
      admin
        .from("billing_access_grants")
        .select("user_id")
        .eq("user_id", userId)
        .or(`expires_at.is.null,expires_at.gt.${now}`)
        .maybeSingle(),
    ]);
    if (subscriptionResult.error || grantResult.error) throw new Error("Could not check current billing access.");
    const activeSubscription = subscriptionResult.data;
    if (activeSubscription) {
      return NextResponse.json({ error: "A billing subscription already exists. Manage or repair it from Settings." }, { status: 409 });
    }
    if (grantResult.data) {
      return NextResponse.json({ error: "Your account already has complimentary access." }, { status: 409 });
    }

    const price = await stripe.prices.retrieve(priceId);
    const expectedInterval = body.plan === "monthly" ? "month" : "year";
    if (!price.active || price.currency !== "cad" || price.type !== "recurring" || price.recurring?.interval !== expectedInterval) {
      return NextResponse.json({ error: "That billing plan is not configured correctly." }, { status: 503 });
    }

    const { data: customerRow, error: customerReadError } = await admin
      .from("billing_customers")
      .select("stripe_customer_id")
      .eq("user_id", userId)
      .maybeSingle();
    if (customerReadError) throw new Error("Could not load the billing customer.");

    let customerId = customerRow?.stripe_customer_id as string | undefined;
    if (!customerId) {
      const existingCustomers = await stripe.customers.search({
        query: `metadata['supabase_user_id']:'${userId}'`,
        limit: 2,
      });
      if (existingCustomers.data.length > 1) {
        throw new Error("Multiple Stripe customers require billing support.");
      }
      customerId = existingCustomers.data[0]?.id;
      if (!customerId) {
        const customer = await stripe.customers.create({
          email: email || undefined,
          metadata: { supabase_user_id: userId },
        }, { idempotencyKey: `lmcc-customer-${userId}` });
        customerId = customer.id;
      }
      const { error } = await admin.from("billing_customers").upsert({
        user_id: userId,
        stripe_customer_id: customerId,
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id" });
      if (error) throw new Error("Could not save the billing customer.");
    }

    const origin = new URL(request.url).origin;
    const taxEnabled = automaticTaxEnabled();
    const subscriptionData: Stripe.Checkout.SessionCreateParams.SubscriptionData = {
      metadata: { supabase_user_id: userId },
    };
    const configuredTrialDays = billingTrialDays();
    if (configuredTrialDays) subscriptionData.trial_period_days = configuredTrialDays;

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      branding_settings: { display_name: "Montreal QBank" },
      customer: customerId,
      client_reference_id: userId,
      line_items: [{ price: priceId, quantity: 1 }],
      subscription_data: subscriptionData,
      automatic_tax: { enabled: taxEnabled },
      customer_update: taxEnabled ? { address: "auto", name: "auto" } : undefined,
      allow_promotion_codes: true,
      success_url: `${origin}/billing?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/billing?checkout=canceled`,
      metadata: { supabase_user_id: userId, plan: body.plan },
    }, { idempotencyKey: `lmcc-checkout-${userId}-${body.plan}-${Math.floor(Date.now() / 300_000)}` });
    if (!session.url) throw new Error("Stripe did not return a Checkout URL.");
    return NextResponse.json({ url: session.url }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error && error.message.includes("not configured")
      ? error.message
      : "Checkout could not be started. Try again shortly.";
    return NextResponse.json({ error: message }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}
