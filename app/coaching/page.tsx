import type { Metadata } from "next";
import { MarketingShell } from "@/components/marketing-shell";
import { AccessSection, PageIntro } from "@/components/marketing-sections";
import { CoachingFaqSection, CoachingHowItWorksSection, CoachingServicesSection, CoachingTutorsSection } from "@/components/coaching-sections";
import { getCoachingCatalog } from "@/lib/coaching";
import { marketingShellData } from "@/lib/marketing-shell-data";

export const revalidate = 3600;

export const metadata: Metadata = { title: "Coaching", description: "Book a prepaid 1:1 consultation, tutoring hour, or exam-strategy session with someone who has already passed the MCCQE Part I, USMLE Step 1, or USMLE Step 2 CK.", alternates: { canonical: "/coaching" }, openGraph: { title: "Coaching | Montreal QBank", description: "Prepaid 1:1 tutoring, consultations, and exam strategy with people who have passed your exam.", url: "/coaching" } };

export default async function CoachingPage() {
  const [{ showSubjects, showPricing, checkoutAvailable }, catalog] = await Promise.all([marketingShellData(), getCoachingCatalog()]);
  return (
    <MarketingShell showSubjects={showSubjects} showPricing={showPricing} checkoutAvailable={checkoutAvailable}>
      <PageIntro eyebrow="Coaching" title="Learn from someone who has already passed." copy="Book a one-on-one consultation, a tutoring hour, or a tips-and-strategy session with a tutor who has sat your exam. Pick a time that suits you, pay securely in advance, and get a meeting link in your account." />
      <CoachingServicesSection services={catalog.services} exams={catalog.exams} />
      <CoachingHowItWorksSection />
      <CoachingTutorsSection tutors={catalog.tutors} exams={catalog.exams} />
      <CoachingFaqSection />
      <AccessSection checkoutAvailable={checkoutAvailable} />
    </MarketingShell>
  );
}
