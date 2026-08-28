import type { Metadata } from "next";
import Link from "next/link";
import { CoachingBookingWizard } from "@/components/coaching-booking-wizard";
import { PageHeader } from "@/components/page-header";
import { buttonVariants } from "@/components/ui/button";
import { getCoachingCatalog, getOpenSlots } from "@/lib/coaching";
import { isDemoSession } from "@/lib/demo-session";

export const metadata: Metadata = { title: "Book coaching" };

export default async function BookCoachingPage({ searchParams }: { searchParams: Promise<{ service?: string; error?: string }> }) {
  const params = await searchParams;
  const demo = await isDemoSession();
  const [catalog, slots] = await Promise.all([getCoachingCatalog(), demo ? Promise.resolve([]) : getOpenSlots()]);
  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <PageHeader eyebrow="Coaching" title="Book a session" description="Choose a session type, your exam, and a time. Payment is taken in advance through Stripe." action={<Link href="/coaching/bookings" className={buttonVariants({ variant: "outline" })}>My bookings</Link>} />
      {demo
        ? <div className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">Coaching is not available in the demo. <Link href="/login" className="font-medium text-emerald-800 underline dark:text-emerald-400">Sign in</Link> with an account to book a session.</div>
        : <CoachingBookingWizard services={catalog.services} exams={catalog.exams} tutors={catalog.tutors} slots={slots} initialService={params.service} error={params.error} />}
    </div>
  );
}
