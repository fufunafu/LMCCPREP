import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CoachingTutorPortal } from "@/components/coaching-tutor-portal";
import { PageHeader } from "@/components/page-header";
import { getCoachingCatalog, getMyTutor, getMyTutorBookings, getMyTutorSlots } from "@/lib/coaching";

export const metadata: Metadata = { title: "Tutor portal" };

export default async function CoachingTutorPage() {
  const tutor = await getMyTutor();
  if (!tutor) notFound();
  const [slots, bookings, catalog] = await Promise.all([getMyTutorSlots(), getMyTutorBookings(), getCoachingCatalog()]);
  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <PageHeader eyebrow="Coaching" title="Tutor portal" description="Set your availability, add meeting links for paid sessions, and keep your public profile current." />
      <CoachingTutorPortal tutor={tutor} exams={catalog.exams} slots={slots} bookings={bookings} />
    </div>
  );
}
