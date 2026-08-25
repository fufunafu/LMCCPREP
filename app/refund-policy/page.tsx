import type { Metadata } from "next";
import { LegalPage } from "@/components/legal-page";

export const metadata: Metadata = { title: "Refund policy" };

export default function RefundPolicyPage() {
  return <LegalPage title="Refund and cancellation policy" intro="Billing will remain disabled until the final commercial terms are approved and published here."><section><h2>Cancellation</h2><p>The planned policy allows cancellation through the Stripe customer portal. Access continues until the end of the paid billing period unless the Checkout terms state otherwise.</p></section><section><h2>Refund requests</h2><p>The final refund eligibility window and review criteria require owner approval before live billing is enabled. Applicable consumer rights continue to apply.</p></section><section><h2>Billing problems</h2><p>Contact support promptly if you see a duplicate or unauthorized charge. Include the account email and invoice identifier, but never send card details.</p></section></LegalPage>;
}
