import { MarketingPage } from "@/components/marketing-page";
import { getPublicSubjects } from "@/lib/data";

export default async function Home() {
  return <MarketingPage subjects={await getPublicSubjects()} />;
}
