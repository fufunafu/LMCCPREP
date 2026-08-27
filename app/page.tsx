import { MarketingShell } from "@/components/marketing-shell";
import { AccessSection, ExploreSection, HeroSection } from "@/components/marketing-sections";
import { marketingShellData } from "@/lib/marketing-shell-data";
import { marketingFaqs } from "@/lib/marketing-content";
import { siteOrigin } from "@/lib/site";

export const revalidate = 3600;

export default async function Home() {
  const origin = siteOrigin();
  const { showSubjects, showPricing, plans } = await marketingShellData();
  const structuredData = {
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "Organization", "@id": `${origin}/#organization`, name: "Montreal QBank", url: origin, legalName: "15041074 Canada Inc." },
      { "@type": "WebSite", "@id": `${origin}/#website`, url: origin, name: "Montreal QBank", publisher: { "@id": `${origin}/#organization` } },
      { "@type": "SoftwareApplication", name: "Montreal QBank", applicationCategory: "EducationalApplication", operatingSystem: "Web", url: origin, description: "Focused MCCQE question bank practice.", offers: showPricing ? plans.filter((plan) => plan.amountCad).map((plan) => ({ "@type": "Offer", priceCurrency: "CAD", price: plan.amountCad, category: plan.cadence })) : [] },
      { "@type": "FAQPage", mainEntity: marketingFaqs.map(([question, answer]) => ({ "@type": "Question", name: question, acceptedAnswer: { "@type": "Answer", text: answer } })) },
    ],
  };
  return <><script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData).replaceAll("<", "\\u003c") }} /><MarketingShell showSubjects={showSubjects} showPricing={showPricing}><HeroSection /><ExploreSection showSubjects={showSubjects} showPricing={showPricing} /><AccessSection /></MarketingShell></>;
}
