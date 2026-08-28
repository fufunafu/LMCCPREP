import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MarketingShell } from "@/components/marketing-shell";
import { AccessSection, PageIntro, SubjectsSection } from "@/components/marketing-sections";
import { marketingShellData } from "@/lib/marketing-shell-data";

export const revalidate = 3600;

export const metadata: Metadata = { title: "Subjects", description: "Reviewed disciplines and approved question counts currently available in Montreal QBank.", alternates: { canonical: "/subjects" }, openGraph: { title: "Subjects | Montreal QBank", description: "Reviewed disciplines and approved question counts currently available.", url: "/subjects" } };

export default async function SubjectsPage() {
  const { subjects, showSubjects, showPricing, checkoutAvailable } = await marketingShellData();
  if (!showSubjects) notFound();
  return <MarketingShell showSubjects={showSubjects} showPricing={showPricing} checkoutAvailable={checkoutAvailable}><PageIntro eyebrow="Subjects" title="Current reviewed scope, by exam." copy="Only questions approved for public distribution and editorially reviewed are counted here. Choose your exam in Settings after signing in." /><SubjectsSection subjects={subjects} /><AccessSection checkoutAvailable={checkoutAvailable} /></MarketingShell>;
}
