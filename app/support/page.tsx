import type { Metadata } from "next";
import { LegalPage } from "@/components/legal-page";

export const metadata: Metadata = { title: "Support", description: "Contact Montreal QBank about access, accounts, study progress, privacy, or billing.", alternates: { canonical: "/support" }, openGraph: { title: "Support | Montreal QBank", description: "Help with access, accounts, study progress, privacy, or billing.", url: "/support" } };

export default function SupportPage() {
  const email = process.env.NEXT_PUBLIC_SUPPORT_EMAIL?.trim() || "Support email pending branded-domain setup";
  const hasEmail = email.includes("@");
  return <LegalPage title="Support" intro="Get help with access, accounts, study progress, privacy, or billing."><section><h2>Contact</h2>{hasEmail ? <p>Email <a className="font-medium text-emerald-700 underline dark:text-emerald-400" href={`mailto:${email}`}>{email}</a>. Do not include passwords or payment-card details.</p> : <p>{email}. Paid launch remains blocked until a monitored branded support address is published.</p>}</section><section><h2>Account and privacy requests</h2><p>Contact support to request account access, correction, or deletion. Identity verification may be required before a request is completed.</p></section><section><h2>Response expectations</h2><p>Support requests are reviewed through the email address above. Montreal QBank is an educational service and must not be used for urgent clinical questions.</p></section><section><h2>Billing support</h2><p>The current iOS and web rollout does not offer purchases. If web billing is enabled in the future, billing support and cancellation instructions will be available through the web account portal.</p></section></LegalPage>;
}
