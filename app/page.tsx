import { MarketingShell } from "@/components/marketing-shell";
import { AccessSection, FaqSection, FeaturesSection, HeroSection, PricingSection, ProgressSection, SubjectsSection } from "@/components/marketing-sections";
import { marketingShellData } from "@/lib/marketing-shell-data";
import { marketingFaqs } from "@/lib/marketing-content";
import { siteOrigin } from "@/lib/site";

export const revalidate = 3600;

export default async function Home() {
  const origin = siteOrigin();
  const { subjects, showSubjects, showPricing, checkoutAvailable, plans } = await marketingShellData();
  const structuredData = {
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "Organization", "@id": `${origin}/#organization`, name: "Montreal QBank", url: origin, legalName: "15041074 Canada Inc." },
      { "@type": "WebSite", "@id": `${origin}/#website`, url: origin, name: "Montreal QBank", publisher: { "@id": `${origin}/#organization` } },
      { "@type": "SoftwareApplication", name: "Montreal QBank", applicationCategory: "EducationalApplication", operatingSystem: "Web", url: origin, description: "Focused MCCQE and USMLE question bank practice.", offers: showPricing ? plans.filter((plan) => plan.amountCad).map((plan) => ({ "@type": "Offer", priceCurrency: "CAD", price: plan.amountCad, category: plan.cadence, url: `${origin}/pricing` })) : [] },
      { "@type": "FAQPage", mainEntity: marketingFaqs(checkoutAvailable).map(([question, answer]) => ({ "@type": "Question", name: question, acceptedAnswer: { "@type": "Answer", text: answer } })) },
    ],
  };
  return <><script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData).replaceAll("<", "\\u003c") }} /><MarketingShell showSubjects={showSubjects} showPricing={showPricing} checkoutAvailable={checkoutAvailable}><HeroSection checkoutAvailable={checkoutAvailable} /><FeaturesSection /><ProgressSection />{showSubjects ? <SubjectsSection subjects={subjects} /> : null}{showPricing ? <PricingSection plans={plans} checkoutAvailable={checkoutAvailable} /> : null}<FaqSection checkoutAvailable={checkoutAvailable} /><AccessSection checkoutAvailable={checkoutAvailable} /></MarketingShell></>;
}
