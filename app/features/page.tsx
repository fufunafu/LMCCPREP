import type { Metadata } from "next";
import { MarketingShell } from "@/components/marketing-shell";
import { AccessSection, FeaturesSection, PageIntro, ProgressSection } from "@/components/marketing-sections";
import { marketingShellData } from "@/lib/marketing-shell-data";

export const revalidate = 3600;

export const metadata: Metadata = { title: "Features", description: "Tutor mode, timed mode, actionable analytics, flags, and notes for focused MCCQE practice.", alternates: { canonical: "/features" }, openGraph: { title: "Features | Montreal QBank", description: "Tutor mode, timed mode, actionable analytics, flags, and notes for focused MCCQE practice.", url: "/features" } };

export default async function FeaturesPage() {
  const { showSubjects, showPricing, checkoutAvailable } = await marketingShellData();
  return <MarketingShell showSubjects={showSubjects} showPricing={showPricing} checkoutAvailable={checkoutAvailable}><PageIntro eyebrow="Features" title="Tools that make each session count." copy="Every part of Montreal QBank exists to help you test recall, learn from mistakes, and decide what deserves your attention next." /><FeaturesSection /><ProgressSection /><AccessSection checkoutAvailable={checkoutAvailable} /></MarketingShell>;
}
