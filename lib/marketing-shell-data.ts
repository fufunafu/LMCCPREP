import { getPublicSubjects } from "@/lib/data";
import { billingMarketingAvailable, publicBillingPlans } from "@/lib/billing-core";

/** Shared server data for the public marketing shell: which nav items to show. */
export async function marketingShellData() {
  const subjects = await getPublicSubjects();
  const showSubjects = subjects.some((subject) => subject.questionCount > 0);
  const showPricing = billingMarketingAvailable();
  return { subjects, showSubjects, showPricing, plans: showPricing ? publicBillingPlans() : [] };
}
