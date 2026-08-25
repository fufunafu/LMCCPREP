import Stripe from "stripe";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  processStripeEvent: vi.fn(),
  claim: "claimed" as "claimed" | "processed" | "processing" | "invalid" | null,
  claimError: null as null | { code: string },
  rpc: vi.fn(),
  update: vi.fn(),
  adminError: false,
}));

vi.mock("@/lib/stripe/sync", () => ({ processStripeEvent: mocks.processStripeEvent }));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => {
    if (mocks.adminError) throw new Error("missing service role");
    return ({
      rpc: async (name: string, value: unknown) => {
        mocks.rpc(name, value);
        return { data: mocks.claim, error: mocks.claimError };
      },
      from: () => ({
        update: (value: unknown) => ({
          eq: async () => {
            mocks.update(value);
            return { error: null };
          },
        }),
      }),
    });
  },
}));

import { POST } from "@/app/api/stripe/webhook/route";

const secret = "whsec_unit_test";
const stripe = new Stripe("sk_test_unit_test");
const payload = JSON.stringify({
  id: "evt_unit_test",
  object: "event",
  api_version: "2026-07-29.preview",
  created: 1_800_000_000,
  data: { object: { id: "cus_test", object: "customer" } },
  livemode: false,
  pending_webhooks: 1,
  request: null,
  type: "customer.created",
});

function signedRequest(body = payload, signature?: string) {
  const header = signature ?? stripe.webhooks.generateTestHeaderString({ payload: body, secret });
  return new Request("https://lmcc-prep.test/api/stripe/webhook", {
    method: "POST",
    body,
    headers: { "stripe-signature": header },
  });
}

describe("Stripe webhook", () => {
  beforeEach(() => {
    process.env.STRIPE_SECRET_KEY = "sk_test_unit_test";
    process.env.STRIPE_WEBHOOK_SECRET = secret;
    mocks.claim = "claimed";
    mocks.claimError = null;
    mocks.processStripeEvent.mockReset().mockResolvedValue(undefined);
    mocks.rpc.mockReset();
    mocks.update.mockReset();
    mocks.adminError = false;
  });

  it("rejects missing and invalid signatures", async () => {
    const missing = await POST(new Request("https://lmcc-prep.test/api/stripe/webhook", { method: "POST", body: payload }));
    expect(missing.status).toBe(400);
    const invalid = await POST(signedRequest(payload, "bad-signature"));
    expect(invalid.status).toBe(400);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("records and processes a verified event", async () => {
    const response = await POST(signedRequest());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ received: true });
    expect(mocks.rpc).toHaveBeenCalledWith("claim_stripe_webhook_event", expect.objectContaining({
      p_stripe_event_id: "evt_unit_test",
      p_event_type: "customer.created",
    }));
    expect(mocks.processStripeEvent).toHaveBeenCalledWith(expect.objectContaining({ id: "evt_unit_test" }));
    expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ processed_at: expect.any(String), processing_error: null }));
  });

  it("acknowledges an already processed duplicate without reprocessing", async () => {
    mocks.claim = "processed";
    const response = await POST(signedRequest());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ received: true, duplicate: true });
    expect(mocks.processStripeEvent).not.toHaveBeenCalled();
  });

  it("requests another delivery when the original event is still processing", async () => {
    mocks.claim = "processing";
    const response = await POST(signedRequest());
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "Stripe event processing is already in progress." });
    expect(mocks.processStripeEvent).not.toHaveBeenCalled();
  });

  it("processes a failed or abandoned delivery after the database reclaims it", async () => {
    const response = await POST(signedRequest());
    expect(response.status).toBe(200);
    expect(mocks.processStripeEvent).toHaveBeenCalledTimes(1);
  });

  it("fails closed when the event cannot be claimed", async () => {
    mocks.claimError = { code: "fixture_error" };
    const response = await POST(signedRequest());
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "Could not claim the Stripe event." });
    expect(mocks.processStripeEvent).not.toHaveBeenCalled();
  });

  it("records processing errors and requests a Stripe retry", async () => {
    mocks.processStripeEvent.mockRejectedValue(new Error("sync failed"));
    const response = await POST(signedRequest());
    expect(response.status).toBe(500);
    expect(mocks.update).toHaveBeenCalledWith({ processing_error: "sync failed" });
  });

  it("returns clear configuration errors without treating them as bad signatures", async () => {
    delete process.env.STRIPE_WEBHOOK_SECRET;
    let response = await POST(signedRequest());
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "Stripe webhooks are not configured." });

    process.env.STRIPE_WEBHOOK_SECRET = secret;
    mocks.adminError = true;
    response = await POST(signedRequest());
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "The billing database service is not configured." });
  });
});
