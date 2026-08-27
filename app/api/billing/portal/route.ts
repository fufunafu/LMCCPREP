import { NextResponse } from "next/server";
import { authenticatedBillingUser, trustedMutationOrigin } from "@/lib/billing";
import { isDemoSession } from "@/lib/demo-session";
import { createAdminClient } from "@/lib/supabase/admin";
import { billingCheckoutMode, stripePortalLoginUrl } from "@/lib/billing-core";
import { getStripe } from "@/lib/stripe/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!trustedMutationOrigin(request)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  if (await isDemoSession()) return NextResponse.json({ error: "Billing is not available in the demo." }, { status: 403 });
  try {
    const { userId, email } = await authenticatedBillingUser();
    const { data, error } = await createAdminClient()
      .from("billing_customers")
      .select("stripe_customer_id")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw new Error("Could not load the billing customer.");
    if (!data?.stripe_customer_id) {
      return NextResponse.json({ error: "No billing account exists yet." }, { status: 404 });
    }
    if (billingCheckoutMode() !== "api") {
      // Stripe-hosted no-code portal login; Stripe emails a sign-in link.
      const login = stripePortalLoginUrl();
      if (!login) return NextResponse.json({ error: "The billing portal is not configured." }, { status: 503 });
      const url = new URL(login);
      if (email) url.searchParams.set("prefilled_email", email);
      return NextResponse.json({ url: url.toString() }, { headers: { "Cache-Control": "no-store" } });
    }
    const portal = await getStripe().billingPortal.sessions.create({
      customer: data.stripe_customer_id,
      return_url: `${new URL(request.url).origin}/settings`,
    });
    return NextResponse.json({ url: portal.url }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error && error.message.includes("not configured")
      ? error.message
      : "The billing portal could not be opened. Try again shortly.";
    return NextResponse.json({ error: message }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}
