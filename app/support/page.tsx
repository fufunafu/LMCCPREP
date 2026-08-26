import type { Metadata } from "next";
import { LegalPage } from "@/components/legal-page";

export const metadata: Metadata = { title: "Support", description: "Contact Montreal QBank about access, accounts, study progress, privacy, or billing.", alternates: { canonical: "/support" }, openGraph: { title: "Support | Montreal QBank", description: "Help with access, accounts, study progress, privacy, or billing.", url: "/support" } };

export default function SupportPage() {
  const email = process.env.NEXT_PUBLIC_SUPPORT_EMAIL?.trim() || "Support email pending branded-domain setup";
  const hasEmail = email.includes("@");
  return <LegalPage title="Support" intro="Get help with access, accounts, study progress, privacy, or billing."><section><h2>Contact</h2>{hasEmail ? <p>Email <a className="font-medium text-emerald-700 underline dark:text-emerald-400" href={`mailto:${email}`}>{email}</a>. Do not include passwords or payment-card details.</p> : <p>{email}. Paid launch remains blocked until a monitored branded support address and response-time commitment are published.</p>}</section><section><h2>Response expectations</h2><p>Support response times have not yet been approved for paid launch. Urgent clinical questions should never be sent to this service.</p></section><section><h2>Billing support</h2><p>Subscription payment methods, invoices, and cancellation are available from Settings through the Stripe customer portal after billing is activated.</p></section></LegalPage>;
}
