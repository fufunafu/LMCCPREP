import type { Metadata } from "next";
import { BillingView } from "@/components/billing-view";
import { authenticatedBillingUser, getBillingSummary } from "@/lib/billing";
import { publicBillingPlans } from "@/lib/billing-core";
import { reconcileBillingUser } from "@/lib/stripe/sync";

export const metadata: Metadata = { title: "Billing" };

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ checkout?: string; notice?: string }>;
}) {
  const params = await searchParams;
  if (params.checkout === "success") {
    try {
      const { userId } = await authenticatedBillingUser();
      await reconcileBillingUser(userId);
    } catch {
      // The signed webhook remains authoritative. The UI will keep checking briefly.
    }
  }
  const summary = await getBillingSummary();
  return <BillingView plans={publicBillingPlans()} summary={summary} checkout={params.checkout} notice={params.notice} />;
}
