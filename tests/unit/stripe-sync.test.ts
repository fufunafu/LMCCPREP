import type Stripe from "stripe";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  customerUpsert: vi.fn(),
  rpc: vi.fn(),
  retrieve: vi.fn(),
  list: vi.fn(),
  customerUserId: undefined as string | undefined,
  apiKeyConfigured: true,
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      if (table === "billing_customers") {
        return {
          upsert: async (value: unknown) => {
            mocks.customerUpsert(value);
            return { error: null };
          },
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: mocks.customerUserId ? { user_id: mocks.customerUserId, stripe_customer_id: "cus_test" } : null,
                error: null,
              }),
            }),
          }),
        };
      }
      throw new Error(`Unexpected table: ${table}`);
    },
    rpc: mocks.rpc,
  }),
}));

const stripeClient = {
  subscriptions: {
    retrieve: mocks.retrieve,
    list: mocks.list,
  },
};

vi.mock("@/lib/stripe/server", () => ({
  getStripe: () => stripeClient,
  getOptionalStripe: () => (mocks.apiKeyConfigured ? stripeClient : undefined),
}));

import { processStripeEvent, reconcileBillingUser, syncStripeSubscription } from "@/lib/stripe/sync";

function subscription(overrides: Partial<Stripe.Subscription> = {}) {
  return {
    id: "sub_test",
    object: "subscription",
    customer: "cus_test",
    metadata: { supabase_user_id: "00000000-0000-4000-8000-000000000001" },
    status: "active",
    cancel_at: null,
    cancel_at_period_end: false,
    trial_end: null,
    items: {
      data: [{ price: { id: "price_monthly" }, current_period_end: 1_900_000_000 }],
    },
    ...overrides,
  } as unknown as Stripe.Subscription;
}

function stripeEvent(type: string, object: unknown, created = 1_800_000_000) {
  return {
    id: `evt_${type.replaceAll(".", "_")}`,
    object: "event",
    type,
    created,
    data: { object },
  } as Stripe.Event;
}

describe("Stripe subscription synchronization", () => {
  beforeEach(() => {
    vi.useRealTimers();
    process.env.BILLING_GRACE_DAYS = "3";
    process.env.STRIPE_PRICE_MONTHLY = "price_monthly";
    process.env.STRIPE_PRICE_ANNUAL = "price_annual";
    mocks.customerUpsert.mockReset();
    mocks.rpc.mockReset().mockResolvedValue({ data: true, error: null });
    mocks.retrieve.mockReset();
    mocks.list.mockReset();
    mocks.customerUserId = undefined;
  });

  it("normalizes an active subscription into an authoritative database update", async () => {
    const changed = await syncStripeSubscription(subscription(), 1_800_000_000);
    expect(changed).toBe(true);
    expect(mocks.customerUpsert).toHaveBeenCalledWith(expect.objectContaining({
      user_id: "00000000-0000-4000-8000-000000000001",
      stripe_customer_id: "cus_test",
    }));
    expect(mocks.rpc).toHaveBeenCalledWith("sync_billing_subscription", expect.objectContaining({
      p_stripe_subscription_id: "sub_test",
      p_stripe_price_id: "price_monthly",
      p_status: "active",
      p_current_period_end: "2030-03-17T17:46:40.000Z",
      p_access_until: "2030-03-17T17:46:40.000Z",
      p_cancel_at_period_end: false,
      p_event_created_at: "2027-01-15T08:00:00.000Z",
      p_is_reconciliation: false,
    }));
  });

  it("normalizes Stripe's explicit cancel_at timestamp as a scheduled cancellation", async () => {
    await syncStripeSubscription(subscription({
      cancel_at: 1_900_000_000,
      cancel_at_period_end: false,
    }), 1_800_000_000);
    expect(mocks.rpc).toHaveBeenCalledWith("sync_billing_subscription", expect.objectContaining({
      p_cancel_at_period_end: true,
      p_current_period_end: "2030-03-17T17:46:40.000Z",
      p_access_until: "2030-03-17T17:46:40.000Z",
    }));
  });

  it("rejects subscriptions that do not use exactly one configured billing price", async () => {
    await expect(syncStripeSubscription(subscription({
      items: {
        data: [{ price: { id: "price_unrelated" }, current_period_end: 1_900_000_000 }],
      } as Stripe.ApiList<Stripe.SubscriptionItem>,
    }), 1_800_000_000)).rejects.toThrow("not an approved billing plan");

    await expect(syncStripeSubscription(subscription({
      items: {
        data: [
          { price: { id: "price_monthly" }, current_period_end: 1_900_000_000 },
          { price: { id: "price_annual" }, current_period_end: 1_900_000_000 },
        ],
      } as Stripe.ApiList<Stripe.SubscriptionItem>,
    }), 1_800_000_000)).rejects.toThrow("not an approved billing plan");

    expect(mocks.customerUpsert).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("anchors past-due access to the failed event plus the configured grace period", async () => {
    await syncStripeSubscription(subscription({ status: "past_due" }), 1_800_000_000);
    expect(mocks.rpc).toHaveBeenCalledWith("sync_billing_subscription", expect.objectContaining({
      p_status: "past_due",
      p_access_until: "2027-01-18T08:00:00.000Z",
    }));
  });

  it("links Checkout to the trusted Supabase user and retrieves the current subscription", async () => {
    mocks.retrieve.mockResolvedValue(subscription());
    const checkout = {
      client_reference_id: "00000000-0000-4000-8000-000000000001",
      customer: "cus_test",
      subscription: "sub_test",
      metadata: {},
    } as unknown as Stripe.Checkout.Session;
    await processStripeEvent(stripeEvent("checkout.session.completed", checkout));
    expect(mocks.retrieve).toHaveBeenCalledWith("sub_test", { expand: ["items.data.price"] });
    expect(mocks.customerUpsert).toHaveBeenCalledWith(expect.objectContaining({
      user_id: "00000000-0000-4000-8000-000000000001",
      stripe_customer_id: "cus_test",
    }));
  });

  it.each([
    ["invoice.paid", "paid", "2030-03-17T17:46:40.000Z"],
    ["invoice.payment_failed", "failed", "2027-01-18T08:00:00.000Z"],
  ] as const)("reconciles the current subscription for %s", async (type, paymentEvent, accessUntil) => {
    mocks.retrieve.mockResolvedValue(subscription({ status: "active" }));
    const invoice = {
      parent: { subscription_details: { subscription: "sub_test" } },
    } as unknown as Stripe.Invoice;
    await processStripeEvent(stripeEvent(type, invoice));
    expect(mocks.retrieve).toHaveBeenCalledWith("sub_test", { expand: ["items.data.price"] });
    expect(mocks.rpc).toHaveBeenCalledWith("sync_billing_subscription", expect.objectContaining({
      p_payment_event: paymentEvent,
      p_access_until: accessUntil,
    }));
  });

  it("extends a paid invoice through the current period even if Stripe still reports past due", async () => {
    mocks.retrieve.mockResolvedValue(subscription({ status: "past_due" }));
    const invoice = {
      parent: { subscription_details: { subscription: "sub_test" } },
    } as unknown as Stripe.Invoice;
    await processStripeEvent(stripeEvent("invoice.paid", invoice));
    expect(mocks.rpc).toHaveBeenCalledWith("sync_billing_subscription", expect.objectContaining({
      p_status: "past_due",
      p_payment_event: "paid",
      p_access_until: "2030-03-17T17:46:40.000Z",
    }));
  });

  it("retrieves current state for subscription create and update events", async () => {
    mocks.retrieve.mockResolvedValue(subscription());
    await processStripeEvent(stripeEvent("customer.subscription.updated", subscription({ status: "past_due" })));
    expect(mocks.retrieve).toHaveBeenCalledWith("sub_test", { expand: ["items.data.price"] });
    expect(mocks.rpc).toHaveBeenCalledWith("sync_billing_subscription", expect.objectContaining({ p_status: "active" }));
  });

  it("expires a deleted subscription according to its paid period", async () => {
    await processStripeEvent(stripeEvent(
      "customer.subscription.deleted",
      subscription({
        status: "canceled",
        items: { data: [{ price: { id: "price_monthly" }, current_period_end: 1_800_000_100 }] } as Stripe.ApiList<Stripe.SubscriptionItem>,
      }),
    ));
    expect(mocks.rpc).toHaveBeenCalledWith("sync_billing_subscription", expect.objectContaining({
      p_status: "canceled",
      p_access_until: "2027-01-15T08:01:40.000Z",
    }));
  });

  it("processes subscription events from their payload when no API key is configured", async () => {
    mocks.apiKeyConfigured = false;
    mocks.customerUserId = "00000000-0000-4000-8000-000000000001";
    const legacy = { ...subscription({ metadata: {} }), items: { data: [{ price: { id: "price_monthly" } }] }, current_period_end: 1_900_000_000 };
    await processStripeEvent({
      id: "evt_links",
      type: "customer.subscription.updated",
      created: 1_800_000_000,
      data: { object: legacy },
    } as unknown as Stripe.Event);
    expect(mocks.retrieve).not.toHaveBeenCalled();
    expect(mocks.rpc).toHaveBeenCalledWith("sync_billing_subscription", expect.objectContaining({
      p_user_id: "00000000-0000-4000-8000-000000000001",
      p_access_until: new Date(1_900_000_000 * 1000).toISOString(),
    }));
    mocks.apiKeyConfigured = true;
  });

  it("links Checkout to the user without retrieving the subscription when no API key is configured", async () => {
    mocks.apiKeyConfigured = false;
    await processStripeEvent({
      id: "evt_links_checkout",
      type: "checkout.session.completed",
      created: 1_800_000_000,
      data: { object: { client_reference_id: "00000000-0000-4000-8000-000000000001", customer: "cus_test", subscription: "sub_test" } },
    } as unknown as Stripe.Event);
    expect(mocks.customerUpsert).toHaveBeenCalledWith(expect.objectContaining({ stripe_customer_id: "cus_test" }));
    expect(mocks.retrieve).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
    mocks.apiKeyConfigured = true;
  });

  it("ignores unknown event types without touching subscription state", async () => {
    await processStripeEvent(stripeEvent("customer.created", { id: "cus_test" }));
    expect(mocks.retrieve).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("reconciles every subscription returned for a customer", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2027-01-20T08:00:00.000Z"));
    mocks.customerUserId = "00000000-0000-4000-8000-000000000001";
    mocks.list.mockResolvedValue({ data: [subscription(), subscription({ id: "sub_annual" })] });
    await expect(reconcileBillingUser("00000000-0000-4000-8000-000000000001")).resolves.toBe(true);
    expect(mocks.rpc).toHaveBeenCalledTimes(2);
    expect(mocks.rpc).toHaveBeenCalledWith("sync_billing_subscription", expect.objectContaining({
      p_is_reconciliation: true,
      p_event_created_at: "2027-01-20T08:00:00.000Z",
    }));
    expect(mocks.list).toHaveBeenCalledWith(expect.objectContaining({
      expand: ["data.items.data.price", "data.latest_invoice"],
    }));
  });

  it("anchors a past-due reconciliation to the latest invoice instead of extending grace", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2027-01-20T08:00:00.000Z"));
    mocks.customerUserId = "00000000-0000-4000-8000-000000000001";
    mocks.list.mockResolvedValue({
      data: [subscription({
        status: "past_due",
        latest_invoice: { created: 1_800_000_000 } as Stripe.Invoice,
      })],
    });
    await reconcileBillingUser("00000000-0000-4000-8000-000000000001");
    expect(mocks.rpc).toHaveBeenCalledWith("sync_billing_subscription", expect.objectContaining({
      p_status: "past_due",
      p_access_until: "2027-01-18T08:00:00.000Z",
      p_event_created_at: "2027-01-20T08:00:00.000Z",
      p_is_reconciliation: true,
    }));
  });
});
