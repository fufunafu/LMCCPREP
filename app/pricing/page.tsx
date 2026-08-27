import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MarketingShell } from "@/components/marketing-shell";
import { AccessSection, PageIntro, PricingSection } from "@/components/marketing-sections";
import { marketingShellData } from "@/lib/marketing-shell-data";

export const revalidate = 3600;

export const metadata: Metadata = { title: "Pricing", description: "Monthly and annual subscription options for invited Montreal QBank learners, billed in CAD through Stripe.", alternates: { canonical: "/pricing" }, openGraph: { title: "Pricing | Montreal QBank", description: "Monthly and annual subscription options for invited learners, billed in CAD through Stripe.", url: "/pricing" } };

export default async function PricingPage() {
  const { showSubjects, showPricing, plans } = await marketingShellData();
  if (!showPricing) notFound();
  return <MarketingShell showSubjects={showSubjects} showPricing={showPricing}><PageIntro eyebrow="Pricing" title="Straightforward subscription access." copy="Choose monthly or annual access once you are invited. The free demo needs no card and is always available first." /><PricingSection plans={plans} /><AccessSection /></MarketingShell>;
}
