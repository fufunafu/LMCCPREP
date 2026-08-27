import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  originValid: true,
  demo: false,
  configured: true,
  activeSubscription: null as { stripe_subscription_id: string } | null,
  grant: null as { user_id: string } | null,
  customer: { stripe_customer_id: "cus_existing" } as { stripe_customer_id: string } | null,
  checkoutPrice: vi.fn(),
  checkoutCreate: vi.fn(),
  priceRetrieve: vi.fn(),
  portalCreate: vi.fn(),
  customerCreate: vi.fn(),
  customerSearch: vi.fn(),
  upsert: vi.fn(),
}));

vi.mock("@/lib/billing", () => ({
  authenticatedBillingUser: async () => ({
    userId: "00000000-0000-4000-8000-000000000001",
    email: "learner@example.test",
  }),
  checkoutPrice: mocks.checkoutPrice,
  trustedMutationOrigin: () => mocks.originValid,
}));

vi.mock("@/lib/billing-core", () => ({
  automaticTaxEnabled: () => false,
  billingCheckoutMode: () => (mocks.configured ? "api" : undefined),
  billingPlans: () => [{ key: "monthly" }, { key: "annual" }],
  billingServerConfigured: () => mocks.configured,
  billingTrialDays: () => undefined,
  stripePaymentLinks: () => ({ monthly: undefined, quarterly: undefined, annual: undefined }),
  stripePortalLoginUrl: () => undefined,
}));

vi.mock("@/lib/demo-session", () => ({ isDemoSession: async () => mocks.demo }));

function query(result: () => unknown) {
  const chain = {
    select: () => chain,
    eq: () => chain,
    in: () => chain,
    gt: () => chain,
    or: () => chain,
    limit: () => chain,
    maybeSingle: async () => ({ data: result(), error: null }),
    upsert: async (value: unknown) => {
      mocks.upsert(value);
      return { error: null };
    },
  };
  return chain;
}

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      if (table === "billing_subscriptions") return query(() => mocks.activeSubscription);
      if (table === "billing_access_grants") return query(() => mocks.grant);
      if (table === "billing_customers") return query(() => mocks.customer);
      throw new Error(`Unexpected table: ${table}`);
    },
  }),
}));

vi.mock("@/lib/stripe/server", () => ({
  getStripe: () => ({
    customers: { create: mocks.customerCreate, search: mocks.customerSearch },
    prices: { retrieve: mocks.priceRetrieve },
    checkout: { sessions: { create: mocks.checkoutCreate } },
    billingPortal: { sessions: { create: mocks.portalCreate } },
  }),
}));

import { POST as checkoutPost } from "@/app/api/billing/checkout/route";
import { POST as portalPost } from "@/app/api/billing/portal/route";

function request(path: string, body?: unknown) {
  return new Request(`https://lmcc-prep.test${path}`, {
    method: "POST",
    headers: body === undefined ? undefined : { "Content-Type": "application/json", Origin: "https://lmcc-prep.test" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

describe("billing route security", () => {
  beforeEach(() => {
    mocks.originValid = true;
    mocks.demo = false;
    mocks.configured = true;
    mocks.activeSubscription = null;
    mocks.grant = null;
    mocks.customer = { stripe_customer_id: "cus_existing" };
    mocks.checkoutPrice.mockReset().mockReturnValue("price_trusted_monthly");
    mocks.priceRetrieve.mockReset().mockResolvedValue({
      active: true,
      currency: "cad",
      type: "recurring",
      recurring: { interval: "month" },
    });
    mocks.checkoutCreate.mockReset().mockResolvedValue({ url: "https://checkout.stripe.test/session" });
    mocks.portalCreate.mockReset().mockResolvedValue({ url: "https://billing.stripe.test/session" });
    mocks.customerCreate.mockReset().mockResolvedValue({ id: "cus_new" });
    mocks.customerSearch.mockReset().mockResolvedValue({ data: [] });
    mocks.upsert.mockReset();
  });

  it("rejects cross-origin and demo Checkout requests", async () => {
    mocks.originValid = false;
    expect((await checkoutPost(request("/api/billing/checkout", { plan: "monthly" }))).status).toBe(403);
    mocks.originValid = true;
    mocks.demo = true;
    expect((await checkoutPost(request("/api/billing/checkout", { plan: "monthly" }))).status).toBe(403);
    expect(mocks.checkoutCreate).not.toHaveBeenCalled();
  });

  it("fails safely when billing is not fully configured", async () => {
    mocks.configured = false;
    const response = await checkoutPost(request("/api/billing/checkout", { plan: "monthly" }));
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "Billing is not fully configured yet." });
  });

  it("rejects arbitrary plan and price input", async () => {
    const response = await checkoutPost(request("/api/billing/checkout", {
      plan: "enterprise",
      priceId: "price_attacker",
    }));
    expect(response.status).toBe(400);
    expect(mocks.checkoutPrice).not.toHaveBeenCalled();
    expect(mocks.checkoutCreate).not.toHaveBeenCalled();
  });

  it("creates Checkout with only the server-selected price and trusted user identity", async () => {
    const response = await checkoutPost(request("/api/billing/checkout", {
      plan: "monthly",
      priceId: "price_attacker",
      userId: "attacker",
      successUrl: "https://attacker.test",
    }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ url: "https://checkout.stripe.test/session" });
    expect(mocks.checkoutPrice).toHaveBeenCalledWith("monthly");
    expect(mocks.priceRetrieve).toHaveBeenCalledWith("price_trusted_monthly");
    expect(mocks.checkoutCreate).toHaveBeenCalledWith(expect.objectContaining({
      branding_settings: { display_name: "Montreal QBank" },
      customer: "cus_existing",
      client_reference_id: "00000000-0000-4000-8000-000000000001",
      line_items: [{ price: "price_trusted_monthly", quantity: 1 }],
      success_url: "https://lmcc-prep.test/billing?checkout=success&session_id={CHECKOUT_SESSION_ID}",
      cancel_url: "https://lmcc-prep.test/billing?checkout=canceled",
      metadata: expect.objectContaining({ supabase_user_id: "00000000-0000-4000-8000-000000000001" }),
    }), expect.objectContaining({ idempotencyKey: expect.stringContaining("lmcc-checkout-") }));
  });

  it("rejects a Stripe price with the wrong currency or billing interval", async () => {
    mocks.priceRetrieve.mockResolvedValue({
      active: true,
      currency: "usd",
      type: "recurring",
      recurring: { interval: "year" },
    });
    const response = await checkoutPost(request("/api/billing/checkout", { plan: "monthly" }));
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "That billing plan is not configured correctly." });
    expect(mocks.checkoutCreate).not.toHaveBeenCalled();
  });

  it("prevents a second Checkout for an active subscription", async () => {
    mocks.activeSubscription = { stripe_subscription_id: "sub_active" };
    const response = await checkoutPost(request("/api/billing/checkout", { plan: "annual" }));
    expect(response.status).toBe(409);
    expect(mocks.checkoutCreate).not.toHaveBeenCalled();
  });

  it("prevents overlapping Checkout for retained cancellation access or a complimentary grant", async () => {
    mocks.activeSubscription = { stripe_subscription_id: "sub_canceled" };
    let response = await checkoutPost(request("/api/billing/checkout", { plan: "annual" }));
    expect(response.status).toBe(409);

    mocks.activeSubscription = null;
    mocks.grant = { user_id: "00000000-0000-4000-8000-000000000001" };
    response = await checkoutPost(request("/api/billing/checkout", { plan: "annual" }));
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "Your account already has complimentary access." });
    expect(mocks.checkoutCreate).not.toHaveBeenCalled();
  });

  it("recovers a previously created Stripe customer before creating another", async () => {
    mocks.customer = null;
    mocks.customerSearch.mockResolvedValue({ data: [{ id: "cus_recovered" }] });
    const response = await checkoutPost(request("/api/billing/checkout", { plan: "monthly" }));
    expect(response.status).toBe(200);
    expect(mocks.customerSearch).toHaveBeenCalledWith({
      query: "metadata['supabase_user_id']:'00000000-0000-4000-8000-000000000001'",
      limit: 2,
    });
    expect(mocks.customerCreate).not.toHaveBeenCalled();
    expect(mocks.upsert).toHaveBeenCalledWith(expect.objectContaining({ stripe_customer_id: "cus_recovered" }));
    expect(mocks.checkoutCreate).toHaveBeenCalledWith(expect.objectContaining({ customer: "cus_recovered" }), expect.anything());
  });

  it("fails safely when Stripe already contains multiple customer identities", async () => {
    mocks.customer = null;
    mocks.customerSearch.mockResolvedValue({ data: [{ id: "cus_one" }, { id: "cus_two" }] });
    const response = await checkoutPost(request("/api/billing/checkout", { plan: "monthly" }));
    expect(response.status).toBe(500);
    expect(mocks.customerCreate).not.toHaveBeenCalled();
    expect(mocks.checkoutCreate).not.toHaveBeenCalled();
  });

  it("opens the portal only for the authenticated user's stored customer", async () => {
    const response = await portalPost(request("/api/billing/portal"));
    expect(response.status).toBe(200);
    expect(mocks.portalCreate).toHaveBeenCalledWith({
      customer: "cus_existing",
      return_url: "https://lmcc-prep.test/settings",
    });
  });

  it("does not create a portal session without a stored customer", async () => {
    mocks.customer = null;
    const response = await portalPost(request("/api/billing/portal"));
    expect(response.status).toBe(404);
    expect(mocks.portalCreate).not.toHaveBeenCalled();
  });
});
