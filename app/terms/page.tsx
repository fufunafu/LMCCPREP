import type { Metadata } from "next";
import { LegalPage } from "@/components/legal-page";

export const metadata: Metadata = { title: "Terms" };

export default function TermsPage() {
  return <LegalPage title="Terms of use" intro="These terms describe the intended use of Montreal QBank during its private release."><section><h2>Study use only</h2><p>Montreal QBank is an independent educational question bank. It is not medical advice, a clinical decision system, or a guarantee of examination performance.</p></section><section><h2>Independent product</h2><p>Montreal QBank is not affiliated with, endorsed by, or sponsored by the Medical Council of Canada. MCC, MCCQE, and related marks belong to their respective owners.</p></section><section><h2>Accounts</h2><p>Access is personal and may not be shared. Users are responsible for protecting their credentials and for reporting unauthorized access.</p></section><section><h2>Subscriptions</h2><p>When billing is activated, the price, billing interval, tax treatment, renewal timing, and cancellation terms are shown before Checkout. Subscription management is provided through the Stripe customer portal.</p></section><section><h2>Acceptable use</h2><p>Users may not scrape, reproduce, redistribute, resell, reverse engineer, or systematically extract the question bank or private assets.</p></section></LegalPage>;
}
