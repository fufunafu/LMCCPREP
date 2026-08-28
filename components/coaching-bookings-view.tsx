"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { CircleAlert, RefreshCw, Video } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { cancelMyBooking } from "@/lib/coaching-actions";
import { useBrowserTimeZone } from "@/lib/use-browser-timezone";
import { bookingStatusLabel, formatCad, formatSlot, holdIsActive, type CoachingBooking } from "@/lib/coaching-core";

type Props = { bookings: CoachingBooking[]; paymentLinks: Record<string, string | undefined>; paid?: boolean; error?: string; highlight?: string };

const statusVariant: Record<CoachingBooking["status"], "default" | "secondary" | "outline" | "destructive"> = { paid: "default", pending: "secondary", completed: "outline", cancelled: "destructive", expired: "destructive" };

export function CoachingBookingsView({ bookings, paymentLinks, paid, error, highlight }: Props) {
  const router = useRouter();
  const timeZone = useBrowserTimeZone();
  const [pollingComplete, setPollingComplete] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const awaitingWebhook = paid && bookings.some((booking) => booking.status === "pending");

  useEffect(() => {
    const tick = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(tick);
  }, []);
  useEffect(() => {
    if (!awaitingWebhook) return;
    let attempts = 0;
    const interval = window.setInterval(() => {
      attempts += 1;
      router.refresh();
      if (attempts >= 10) { window.clearInterval(interval); setPollingComplete(true); }
    }, 3_000);
    return () => window.clearInterval(interval);
  }, [awaitingWebhook, router]);

  const cancel = async (bookingId: string) => {
    const form = new FormData();
    form.set("bookingId", bookingId);
    const result = await cancelMyBooking(form);
    if (result.ok) { toast.success("Booking cancelled"); router.refresh(); } else toast.error(result.message);
  };

  return (
    <div className="space-y-5">
      {awaitingWebhook ? <div role="status" className="flex items-start gap-3 rounded-xl border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-950 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-100">{pollingComplete ? <CircleAlert className="mt-0.5 size-4 shrink-0" /> : <RefreshCw className="mt-0.5 size-4 shrink-0 animate-spin" />}<p>{pollingComplete ? "Payment finished, but confirmation is taking longer than expected. Refresh in a moment; your payment is safe and the booking will be confirmed by the Stripe webhook." : "Payment finished. Waiting for Stripe to confirm your booking…"}</p></div> : null}
      {error === "no_link" ? <div role="alert" className="flex items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100"><CircleAlert className="mt-0.5 size-4 shrink-0" /><p>Your time is held, but online payment for this session type is not set up yet. Contact support to complete payment before the hold expires.</p></div> : null}
      {error === "demo" ? <div role="alert" className="rounded-xl border p-4 text-sm text-muted-foreground">Coaching cannot be booked from the demo.</div> : null}

      {bookings.length ? (
        <ul className="space-y-3">
          {bookings.map((booking) => {
            const payable = holdIsActive(booking, now);
            const minutesLeft = booking.holdExpiresAt ? Math.max(0, Math.ceil((new Date(booking.holdExpiresAt).getTime() - now) / 60_000)) : 0;
            const link = paymentLinks[booking.id];
            return (
              <li key={booking.id} className={`rounded-2xl border bg-background p-5 ${highlight === booking.id ? "border-emerald-500" : ""}`}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div><p className="font-semibold">{booking.serviceName ?? "Coaching session"} <span className="font-normal text-muted-foreground">· {booking.examName}</span></p><p className="mt-1 text-sm text-muted-foreground">{booking.startsAt ? formatSlot(booking.startsAt, timeZone) : "Time to be confirmed"} with {booking.tutorName ?? "your tutor"} · {formatCad(booking.amountCents)}</p></div>
                  <Badge variant={statusVariant[booking.status]}>{bookingStatusLabel(booking.status)}</Badge>
                </div>
                {booking.status === "pending" ? <p className="mt-3 text-xs text-muted-foreground">{payable ? `Complete payment within ${minutesLeft} min to keep this time.` : "The payment hold has expired. Book again to choose a new time."}</p> : null}
                {booking.status === "paid" && !booking.meetingUrl ? <p className="mt-3 text-xs text-muted-foreground">Confirmed. Your meeting link will appear here before the session.</p> : null}
                <div className="mt-4 flex flex-wrap gap-2">
                  {booking.meetingUrl ? <a href={booking.meetingUrl} target="_blank" rel="noreferrer" className={buttonVariants({ className: "bg-emerald-800 hover:bg-emerald-900" })}><Video />Join session</a> : null}
                  {payable && link ? <a href={link} className={buttonVariants({ className: "bg-emerald-800 hover:bg-emerald-900" })}>Pay now</a> : null}
                  {booking.status === "pending" ? <Button variant="outline" onClick={() => cancel(booking.id)}>Cancel</Button> : null}
                </div>
                <p className="mt-3 text-[11px] text-muted-foreground">Reference {booking.id.slice(0, 8)}</p>
              </li>
            );
          })}
        </ul>
      ) : <div className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">No bookings yet. <Link href="/coaching/book" className="font-medium text-emerald-800 underline dark:text-emerald-400">Book a session</Link>.</div>}
      <p className="text-xs leading-5 text-muted-foreground">Times are shown in {timeZone.replaceAll("_", " ")}. To reschedule or cancel a paid session (full refund at least 24 hours before), <Link href="/support" className="underline">contact support</Link> with your reference.</p>
    </div>
  );
}
