import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage } from "@/components/legal-page";
import { publicCheckoutAvailable } from "@/lib/billing-core";

export const metadata: Metadata = { title: "Refund and cancellation information", description: "Current purchase and refund information for Montreal QBank.", alternates: { canonical: "/refund-policy" }, openGraph: { title: "Refund and cancellation information | Montreal QBank", description: "Current purchase and refund information for Montreal QBank.", url: "/refund-policy" } };

export default function RefundPolicyPage() {
  const checkoutAvailable = publicCheckoutAvailable();
  return (
    <LegalPage title="Refund and cancellation information" intro="These terms apply to Montreal QBank website subscriptions. Coaching cancellations are covered separately below.">
      <section><h2>Current availability</h2><p>{checkoutAvailable ? "Monthly, three-month, and annual question-bank subscriptions are available through our website. Payments are processed by Stripe." : "New question-bank subscriptions are temporarily unavailable. Existing subscribers can still contact support for billing, cancellation, or refund requests."} The free demo and complimentary access do not require a purchase. For subscriptions purchased through Apple In-App Purchase, request a refund through Apple at reportaproblem.apple.com. Apple determines refund eligibility. Manage or cancel the subscription in your Apple Account settings. The website refund criteria below apply only to purchases billed by Stripe.</p></section>
      <section><h2>Cancellation</h2><p>You may cancel at any time through the Stripe customer portal, available from your <Link className="underline" href="/billing">Billing page</Link>. Cancellation stops the next renewal. Access continues through the end of the paid billing period, and routine prorated refunds are not provided. If you cannot access the portal, contact support.</p></section>
      <section><h2>Initial-purchase refunds</h2><p>You may request a refund within 7 calendar days of your initial purchase if no more than 25 questions have been answered on the account. Refund eligibility is limited to one initial purchase per person and is subject to applicable consumer rights.</p></section>
      <section><h2>Renewal refunds</h2><p>You may request a renewal refund within 7 calendar days of the renewal charge only if the account has not been used after renewal.</p></section>
      <section><h2>Coaching cancellations</h2><p>Cancel at least 24 hours before your coaching session for a full refund by emailing support with your booking reference. Later cancellations and no-shows are not refunded, but we will do our best to reschedule if the tutor can accommodate it.</p></section>
      <section><h2>Requesting a refund or reporting a billing problem</h2><p><Link className="underline" href="/support">Contact support</Link> promptly about a refund request, duplicate charge, or unauthorized charge. Include the account email and invoice identifier, but never send passwords or payment-card details. These terms do not limit mandatory consumer rights.</p></section>
    </LegalPage>
  );
}
