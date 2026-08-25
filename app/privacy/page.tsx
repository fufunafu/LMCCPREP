import type { Metadata } from "next";
import { LegalPage } from "@/components/legal-page";

export const metadata: Metadata = { title: "Privacy" };

export default function PrivacyPage() {
  return <LegalPage title="Privacy notice" intro="Montreal QBank collects only the information needed to provide accounts, study progress, support, and billing."><section><h2>Information used</h2><p>Account information may include your email, display name, medical school, target exam date, preferences, study attempts, flags, notes, and support requests.</p></section><section><h2>Service providers</h2><p>Supabase provides authentication and application data storage. Vercel hosts the application. When billing is enabled, Stripe processes payments and stores payment-method details. Montreal QBank does not store complete card numbers.</p></section><section><h2>Purpose and retention</h2><p>Information is used to operate the service, restore progress, secure accounts, provide support, prevent abuse, and maintain subscription access. Records are retained only as needed for those purposes and applicable obligations.</p></section><section><h2>Your choices</h2><p>You may update profile information, reset study progress, cancel a subscription through the billing portal, or contact support about account and privacy requests.</p></section></LegalPage>;
}
