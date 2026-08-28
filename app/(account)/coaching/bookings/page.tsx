import type { Metadata } from "next";
import Link from "next/link";
import { CoachingBookingsView } from "@/components/coaching-bookings-view";
import { PageHeader } from "@/components/page-header";
import { buttonVariants } from "@/components/ui/button";
import { currentUser, getCoachingCatalog, getMyBookings, isCoachingAdmin } from "@/lib/coaching";
import { holdIsActive, paymentLinkFor } from "@/lib/coaching-core";

export const metadata: Metadata = { title: "My coaching" };

export default async function CoachingBookingsPage({ searchParams }: { searchParams: Promise<{ paid?: string; error?: string; booking?: string }> }) {
  const params = await searchParams;
  const [bookings, catalog, user, admin] = await Promise.all([getMyBookings(), getCoachingCatalog(), currentUser(), isCoachingAdmin()]);
  const paymentLinks: Record<string, string | undefined> = {};
  for (const booking of bookings) {
    if (!holdIsActive(booking)) continue;
    const service = catalog.services.find((entry) => entry.id === booking.serviceId);
    paymentLinks[booking.id] = paymentLinkFor(service?.paymentLink, booking.id, user?.email);
  }
  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <PageHeader eyebrow="Coaching" title="My sessions" description="Upcoming and past coaching bookings." action={<div className="flex gap-2">{admin ? <Link href="/coaching/admin" className={buttonVariants({ variant: "outline" })}>Admin</Link> : null}<Link href="/coaching/book" className={buttonVariants({ className: "bg-emerald-800 hover:bg-emerald-900" })}>Book a session</Link></div>} />
      <CoachingBookingsView bookings={bookings} paymentLinks={paymentLinks} paid={params.paid === "1"} error={params.error} highlight={params.booking} />
    </div>
  );
}
