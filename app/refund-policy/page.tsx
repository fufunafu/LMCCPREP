import type { Metadata } from "next";
import { LegalPage } from "@/components/legal-page";

export const metadata: Metadata = { title: "Refund policy" };

export default function RefundPolicyPage() {
  return <LegalPage title="Refund and cancellation policy" intro="These terms apply to Montreal QBank monthly and annual subscriptions."><section><h2>Cancellation</h2><p>You may cancel at any time through the Stripe customer portal. Cancellation stops the next renewal. Access continues through the end of the paid billing period, and routine prorated refunds are not provided.</p></section><section><h2>Initial-purchase refunds</h2><p>You may request a refund within 7 calendar days of your initial purchase if no more than 25 questions have been answered on the account. Refund eligibility is limited to one initial purchase per person and is subject to applicable consumer rights.</p></section><section><h2>Renewal refunds</h2><p>You may request a renewal refund within 7 calendar days of the renewal charge only if the account has not been used after renewal. Annual subscribers receive an upcoming-renewal reminder before renewal.</p></section><section><h2>Billing problems</h2><p>Contact support promptly about a duplicate or unauthorized charge. Include the account email and invoice identifier, but never send passwords or payment-card details.</p></section></LegalPage>;
}
