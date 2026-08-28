import type Stripe from "stripe";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  booking: null as null | { id: string; status: string; stripe_checkout_session_id: string | null },
  update: vi.fn(),
  customerUpsert: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      if (table === "coaching_bookings") {
        return {
          select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: mocks.booking, error: null }) }) }),
          update: (value: unknown) => ({ eq: async () => { mocks.update(value); return { error: null }; } }),
        };
      }
      if (table === "billing_customers") {
        return { upsert: async (value: unknown) => { mocks.customerUpsert(value); return { error: null }; } };
      }
      throw new Error(`Unexpected table: ${table}`);
    },
  }),
}));
vi.mock("@/lib/stripe/server", () => ({ getStripe: () => { throw new Error("no api key"); }, getOptionalStripe: () => undefined }));

import { applyCoachingPayment, isCoachingCheckout, PAID_AFTER_HOLD_NOTE } from "@/lib/coaching-payments";
import { processStripeEvent } from "@/lib/stripe/sync";

const bookingId = "6f1d2c3b-4a5e-4f60-8a7b-9c0d1e2f3a4b";

function session(overrides: Partial<Stripe.Checkout.Session> = {}) {
  return {
    id: "cs_test_1",
    object: "checkout.session",
    mode: "payment",
    payment_status: "paid",
    client_reference_id: `booking_${bookingId}`,
    payment_intent: "pi_test_1",
    amount_total: 8900,
    currency: "cad",
    customer: null,
    ...overrides,
  } as unknown as Stripe.Checkout.Session;
}

function event(object: Stripe.Checkout.Session, type = "checkout.session.completed") {
  return { id: "evt_1", type, created: 1_800_000_000, data: { object } } as unknown as Stripe.Event;
}

describe("coaching payments", () => {
  beforeEach(() => {
    mocks.booking = { id: bookingId, status: "pending", stripe_checkout_session_id: null };
    mocks.update.mockReset();
    mocks.customerUpsert.mockReset();
  });

  it("recognises coaching checkouts only in payment mode with a booking reference", () => {
    expect(isCoachingCheckout(session())).toBe(true);
    expect(isCoachingCheckout(session({ mode: "subscription" }))).toBe(false);
    expect(isCoachingCheckout(session({ client_reference_id: "00000000-0000-4000-8000-000000000001" }))).toBe(false);
  });

  it("marks a pending booking paid with the Stripe identifiers", async () => {
    await expect(applyCoachingPayment(session())).resolves.toBe("paid");
    expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ status: "paid", stripe_checkout_session_id: "cs_test_1", stripe_payment_intent_id: "pi_test_1", amount_cents: 8900, currency: "cad" }));
    expect(mocks.update.mock.calls[0][0]).not.toHaveProperty("admin_note");
  });

  it("flags payments that arrive after the hold expired", async () => {
    mocks.booking = { id: bookingId, status: "expired", stripe_checkout_session_id: null };
    await expect(applyCoachingPayment(session())).resolves.toBe("paid_late");
    expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ status: "paid", admin_note: PAID_AFTER_HOLD_NOTE }));
  });

  it("is idempotent for already-paid bookings and ignores unpaid sessions", async () => {
    mocks.booking = { id: bookingId, status: "paid", stripe_checkout_session_id: "cs_old" };
    await expect(applyCoachingPayment(session())).resolves.toBe("already_paid");
    mocks.booking = { id: bookingId, status: "pending", stripe_checkout_session_id: null };
    await expect(applyCoachingPayment(session({ payment_status: "unpaid" }))).resolves.toBe("unpaid");
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("throws for unknown bookings so Stripe retries", async () => {
    mocks.booking = null;
    await expect(applyCoachingPayment(session())).rejects.toThrow(/does not exist/);
  });

  it("routes coaching checkout events away from the subscription path", async () => {
    await processStripeEvent(event(session()));
    expect(mocks.update).toHaveBeenCalledTimes(1);
    expect(mocks.customerUpsert).not.toHaveBeenCalled();
    mocks.update.mockReset();
    await processStripeEvent(event(session(), "checkout.session.async_payment_succeeded"));
    expect(mocks.update).toHaveBeenCalledTimes(1);
  });

  it("still treats subscription checkouts as billing", async () => {
    await expect(processStripeEvent(event(session({ mode: "subscription", client_reference_id: "00000000-0000-4000-8000-000000000001", customer: "cus_1" })))).resolves.toBeUndefined();
    expect(mocks.customerUpsert).toHaveBeenCalledTimes(1);
    expect(mocks.update).not.toHaveBeenCalled();
  });
});
