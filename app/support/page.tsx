import type { Metadata } from "next";
import { LegalPage } from "@/components/legal-page";

export const metadata: Metadata = { title: "Support" };

export default function SupportPage() {
  const email = process.env.NEXT_PUBLIC_SUPPORT_EMAIL?.trim() || "fuanne_gm@hotmail.com";
  return <LegalPage title="Support" intro="Get help with access, accounts, study progress, or billing."><section><h2>Contact</h2><p>Email <a className="font-medium text-emerald-700 underline dark:text-emerald-400" href={`mailto:${email}`}>{email}</a>. Do not include passwords or payment-card details.</p></section><section><h2>Billing support</h2><p>Subscription payment methods, invoices, and cancellation are available from Settings through the Stripe customer portal after billing is activated.</p></section></LegalPage>;
}
