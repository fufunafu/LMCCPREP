import "server-only";

import type Stripe from "stripe";
import { bookingIdFromReference } from "@/lib/coaching-core";
import { createAdminClient } from "@/lib/supabase/admin";

export const PAID_AFTER_HOLD_NOTE = "PAID AFTER HOLD EXPIRED — contact customer";

/** True when a Checkout Session is a one-time coaching payment rather than a subscription. */
export function isCoachingCheckout(session: Pick<Stripe.Checkout.Session, "mode" | "client_reference_id">) {
  return session.mode === "payment" && bookingIdFromReference(session.client_reference_id) !== undefined;
}

/**
 * Marks the referenced booking as paid. Idempotent: a booking that is already
 * paid is left untouched. If the hold had expired or the customer cancelled
 * before paying, the booking is still marked paid but flagged for the admin
 * because the slot may have been taken by someone else.
 */
export async function applyCoachingPayment(session: Stripe.Checkout.Session) {
  const bookingId = bookingIdFromReference(session.client_reference_id);
  if (!bookingId) throw new Error("Coaching checkout is missing a booking reference.");
  if (session.payment_status !== "paid") return "unpaid" as const;

  const admin = createAdminClient();
  const { data: booking, error } = await admin.from("coaching_bookings").select("id,status,stripe_checkout_session_id").eq("id", bookingId).maybeSingle();
  if (error) throw new Error("Could not load the coaching booking.");
  if (!booking) throw new Error(`Coaching booking ${bookingId} does not exist.`);
  if (booking.status === "paid" || booking.status === "completed") return "already_paid" as const;

  const paymentIntentId = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id ?? null;
  const update: Record<string, unknown> = {
    status: "paid",
    paid_at: new Date().toISOString(),
    stripe_checkout_session_id: session.id,
    stripe_payment_intent_id: paymentIntentId,
  };
  if (typeof session.amount_total === "number") update.amount_cents = session.amount_total;
  if (session.currency) update.currency = session.currency;
  const late = booking.status !== "pending";
  if (late) {
    update.admin_note = PAID_AFTER_HOLD_NOTE;
    console.error("coaching: payment received for a non-pending booking", { bookingId, previousStatus: booking.status, sessionId: session.id });
  }
  const { error: updateError } = await admin.from("coaching_bookings").update(update).eq("id", bookingId);
  if (updateError) throw new Error("Could not mark the coaching booking as paid.");
  return late ? ("paid_late" as const) : ("paid" as const);
}
