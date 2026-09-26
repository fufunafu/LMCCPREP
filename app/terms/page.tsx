import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage } from "@/components/legal-page";
import { billingTrialDays, publicCheckoutAvailable } from "@/lib/billing-core";

export const metadata: Metadata = { title: "Terms of use", description: "Terms governing Montreal QBank accounts, subscriptions, acceptable use, and educational content.", alternates: { canonical: "/terms" }, openGraph: { title: "Terms of use | Montreal QBank", description: "Terms governing Montreal QBank accounts, subscriptions, and educational use.", url: "/terms" } };

export default function TermsPage() {
  const checkoutAvailable = publicCheckoutAvailable();
  const trialDays = billingTrialDays();
  return (
    <LegalPage title="Terms of use" intro="These terms govern access to and use of Montreal QBank.">
      <section><h2>Status and version</h2><p>Updated September 14, 2026.</p></section>
      <section><h2>Study use only</h2><p>Montreal QBank is an independent educational question bank. It is not medical advice, a clinical decision system, or a guarantee of examination performance.</p></section>
      <section><h2>Content model</h2><p>Paid question-bank access is limited to content marked as rights-approved and editorially reviewed for the selected exam. Unapproved material is withheld from the paid bank. Personal questions are visible only to their author and are not presented as editorially reviewed bank content.</p></section>
      <section><h2>Independent product</h2><p>Montreal QBank is not affiliated with, endorsed by, or sponsored by the Medical Council of Canada, the National Board of Medical Examiners, or the Federation of State Medical Boards. MCC, MCCQE, NBME, FSMB, USMLE, and related marks belong to their respective owners.</p></section>
      <section><h2>Accounts</h2><p>Access is personal and may not be shared. Users are responsible for protecting their credentials and for reporting unauthorized access. Demo progress is temporary and is not linked to a learner account.</p></section>
      <section><h2>Website subscriptions</h2><p>{checkoutAvailable ? "Monthly, three-month, and annual subscriptions are available through our website and are processed by Stripe." : "New question-bank subscriptions are temporarily unavailable. Existing billing and refund obligations remain in effect."} A question-bank subscription covers one exam. Current prices in Canadian dollars are listed on the <Link className="underline" href="/pricing">Pricing page</Link>; applicable taxes and the final total are shown before payment.</p><p>Subscriptions renew automatically until canceled. You may cancel through the Stripe customer portal from your Billing page, and access then continues through the paid period. {trialDays ? `A ${trialDays}-day trial is available where shown at checkout; billing starts after the trial unless canceled.` : "No paid-product free trial is offered; the separate demo is free and requires no card."} Complimentary access does not require a purchase. For subscriptions purchased through Apple In-App Purchase, Apple displays the price and renewal period before confirmation. Manage or cancel those subscriptions in your Apple Account settings.</p></section>
      <section><h2>Refunds and coaching</h2><p>Subscription refund eligibility and coaching cancellation terms are described in the <Link className="underline" href="/refund-policy">Refund and cancellation information</Link>. Coaching is purchased separately and does not require a question-bank subscription. Mandatory consumer rights are not limited by these terms.</p></section>
      <section><h2>Acceptable use</h2><p>Users may not scrape, reproduce, redistribute, resell, reverse engineer, or systematically extract the question bank or private assets.</p></section>
    </LegalPage>
  );
}
