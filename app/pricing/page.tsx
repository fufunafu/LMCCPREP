import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MarketingShell } from "@/components/marketing-shell";
import { AccessSection, PricingSection } from "@/components/marketing-sections";
import { marketingShellData } from "@/lib/marketing-shell-data";

export const revalidate = 3600;

export const metadata: Metadata = { title: "Pricing", description: "Monthly, three-month, and annual subscription options for Montreal QBank learners, billed in CAD through Stripe.", alternates: { canonical: "/pricing" }, openGraph: { title: "Pricing | Montreal QBank", description: "Monthly, three-month, and annual subscription options, billed in CAD through Stripe.", url: "/pricing" } };

export default async function PricingPage() {
  const { showSubjects, showPricing, checkoutAvailable, plans } = await marketingShellData();
  if (!showPricing) notFound();
  return <MarketingShell showSubjects={showSubjects} showPricing={showPricing} checkoutAvailable={checkoutAvailable}><PricingSection plans={plans} standalone checkoutAvailable={checkoutAvailable} /><AccessSection checkoutAvailable={checkoutAvailable} /></MarketingShell>;
}
