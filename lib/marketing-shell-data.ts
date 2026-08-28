import { getPublicSubjects } from "@/lib/data";
import { billingConfigured, billingMarketingAvailable, publicBillingPlans } from "@/lib/billing-core";

/** Shared server data for the public marketing shell: which nav items to show. */
export async function marketingShellData() {
  const subjects = await getPublicSubjects();
  const showSubjects = subjects.some((subject) => subject.questionCount > 0);
  const showPricing = billingMarketingAvailable();
  // Checkout is live once a Stripe integration (API or hosted links) is configured.
  const checkoutAvailable = showPricing && billingConfigured();
  return { subjects, showSubjects, showPricing, checkoutAvailable, plans: showPricing ? publicBillingPlans() : [] };
}
