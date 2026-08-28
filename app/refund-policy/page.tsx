import type { Metadata } from "next";
import { LegalPage } from "@/components/legal-page";

export const metadata: Metadata = { title: "Refund and cancellation information", description: "Current purchase and refund information for Montreal QBank.", alternates: { canonical: "/refund-policy" }, openGraph: { title: "Refund and cancellation information | Montreal QBank", description: "Current purchase and refund information for Montreal QBank.", url: "/refund-policy" } };

export default function RefundPolicyPage() {
  return <LegalPage title="Refund and cancellation information" intro="The current Montreal QBank iOS and web rollout does not offer purchases or subscriptions."><section><h2>Current availability</h2><p>There is no active checkout, paid subscription, renewal, or cancellation flow in the current rollout. Complimentary access granted by Montreal QBank does not require a purchase.</p></section><section><h2>Future purchases</h2><p>If a paid service is offered in the future, the price, renewal terms, cancellation method, refund rules, and applicable consumer rights will be disclosed before purchase.</p></section><section><h2>Billing questions</h2><p>Contact support if you believe a charge is associated with Montreal QBank. Include the account email and any invoice identifier, but never send passwords or payment-card details.</p></section></LegalPage>;
}
