import { MarketingPage } from "@/components/marketing-page";
import { getPublicSubjects } from "@/lib/data";
import { publicBillingPlans } from "@/lib/billing-core";

export default async function Home() {
  return <MarketingPage subjects={await getPublicSubjects()} plans={publicBillingPlans()} />;
}
