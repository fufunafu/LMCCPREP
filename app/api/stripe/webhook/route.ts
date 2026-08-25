import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStripe, stripeWebhookSecret } from "@/lib/stripe/server";
import { processStripeEvent } from "@/lib/stripe/sync";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const signature = request.headers.get("stripe-signature");
  if (!signature) return NextResponse.json({ error: "Missing Stripe signature." }, { status: 400 });

  let stripe;
  let webhookSecret;
  try {
    stripe = getStripe();
    webhookSecret = stripeWebhookSecret();
  } catch {
    return NextResponse.json({ error: "Stripe webhooks are not configured." }, { status: 503 });
  }

  let event;
  try {
    const payload = await request.text();
    event = stripe.webhooks.constructEvent(payload, signature, webhookSecret);
  } catch {
    return NextResponse.json({ error: "Invalid Stripe signature." }, { status: 400 });
  }

  console.info("Stripe webhook received", { eventId: event.id, eventType: event.type });

  let admin;
  try {
    admin = createAdminClient();
  } catch {
    return NextResponse.json({ error: "The billing database service is not configured." }, { status: 503 });
  }
  const eventCreatedAt = new Date(event.created * 1000).toISOString();
  const { data: claim, error: claimError } = await admin.rpc("claim_stripe_webhook_event", {
    p_stripe_event_id: event.id,
    p_event_type: event.type,
    p_event_created_at: eventCreatedAt,
  });
  if (claimError || !claim) return NextResponse.json({ error: "Could not claim the Stripe event." }, { status: 500 });
  if (claim === "processed") return NextResponse.json({ received: true, duplicate: true });
  if (claim === "processing") {
    return NextResponse.json({ error: "Stripe event processing is already in progress." }, { status: 409 });
  }
  if (claim !== "claimed") return NextResponse.json({ error: "Invalid Stripe event claim state." }, { status: 500 });

  try {
    await processStripeEvent(event);
    const { error } = await admin
      .from("stripe_webhook_events")
      .update({ processed_at: new Date().toISOString(), processing_error: null })
      .eq("stripe_event_id", event.id);
    if (error) throw new Error("Could not mark the Stripe event as processed.");
    return NextResponse.json({ received: true });
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 500) : "Unknown processing error";
    console.error("Stripe webhook processing failed", { eventId: event.id, eventType: event.type, error: message });
    const { error: recordError } = await admin
      .from("stripe_webhook_events")
      .update({ processing_error: message })
      .eq("stripe_event_id", event.id);
    if (recordError) console.error("Stripe webhook error could not be recorded", { eventId: event.id, eventType: event.type });
    return NextResponse.json({ error: "Stripe event processing failed." }, { status: 500 });
  }
}
