import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CoachingAdmin } from "@/components/coaching-admin";
import { PageHeader } from "@/components/page-header";
import { adminGetBookings, adminGetServices, adminGetTutors, adminGetUpcomingSlots, getCoachingCatalog, isCoachingAdmin } from "@/lib/coaching";
import { isUuid, type CoachingBookingStatus } from "@/lib/coaching-core";

export const metadata: Metadata = { title: "Coaching admin" };

const STATUSES = new Set<CoachingBookingStatus>(["pending", "paid", "completed", "cancelled", "expired"]);

export default async function CoachingAdminPage({ searchParams }: { searchParams: Promise<{ tutor?: string; status?: string }> }) {
  if (!(await isCoachingAdmin())) notFound();
  const params = await searchParams;
  const tutorId = isUuid(params.tutor) ? params.tutor : undefined;
  const status = STATUSES.has(params.status as CoachingBookingStatus) ? (params.status as CoachingBookingStatus) : undefined;
  const [tutors, services, slots, bookings, exams] = await Promise.all([
    adminGetTutors(),
    adminGetServices(),
    adminGetUpcomingSlots(tutorId),
    adminGetBookings(status),
    getCoachingCatalog().then((catalog) => catalog.exams),
  ]);
  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <PageHeader eyebrow="Coaching" title="Coaching admin" description="Manage tutors, availability, bookings, and Stripe Payment Links." />
      <CoachingAdmin tutors={tutors} exams={exams} services={services} slots={slots} bookings={bookings} selectedTutorId={tutorId} statusFilter={status} adminTimeZone="America/Toronto" />
    </div>
  );
}
