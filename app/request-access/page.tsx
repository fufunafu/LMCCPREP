import type { Metadata } from "next";
import { MarketingShell } from "@/components/marketing-shell";
import { AccessSection, PageIntro } from "@/components/marketing-sections";
import { marketingShellData } from "@/lib/marketing-shell-data";

export const revalidate = 3600;

export const metadata: Metadata = { title: "Request access", description: "Request an invitation to Montreal QBank for saved account access, or start the free no-card demo right away.", alternates: { canonical: "/request-access" }, openGraph: { title: "Request access | Montreal QBank", description: "Request an invitation for saved account access, or start the free demo.", url: "/request-access" } };

export default async function RequestAccessPage() {
  const { showSubjects, showPricing } = await marketingShellData();
  return <MarketingShell showSubjects={showSubjects} showPricing={showPricing}><PageIntro eyebrow="Request access" title="Get an invitation." copy="Montreal QBank is invite-only. Leave your university email and we will be in touch when an invitation is available. The demo is free and needs no card." /><AccessSection /></MarketingShell>;
}
