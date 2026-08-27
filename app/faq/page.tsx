import type { Metadata } from "next";
import { MarketingShell } from "@/components/marketing-shell";
import { AccessSection, ExtendedFaqSection, PageIntro } from "@/components/marketing-sections";
import { marketingShellData } from "@/lib/marketing-shell-data";

export const revalidate = 3600;

export const metadata: Metadata = { title: "FAQ", description: "Answers about who Montreal QBank is for, how to get access, what is included, and how the demo and billing work.", alternates: { canonical: "/faq" }, openGraph: { title: "FAQ | Montreal QBank", description: "Answers about access, scope, the demo, and billing.", url: "/faq" } };

export default async function FaqPage() {
  const { showSubjects, showPricing } = await marketingShellData();
  return <MarketingShell showSubjects={showSubjects} showPricing={showPricing}><PageIntro eyebrow="FAQ" title="Frequently asked questions." copy="Everything you need to know about the demo, practice sessions, content quality, progress tracking, accounts, and billing." /><ExtendedFaqSection /><AccessSection /></MarketingShell>;
}
