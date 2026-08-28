/**
 * Pure helpers for the coaching feature: no I/O, safe to import from client
 * components and unit tests.
 */

export type CoachingBookingStatus = "pending" | "paid" | "cancelled" | "expired" | "completed";

export type CoachingService = { id: string; name: string; description: string; durationMinutes: number; priceCents: number; currency: string; paymentLink: string | null; active: boolean; sort: number };
export type CoachingExam = { id: string; name: string; sort: number };
export type CoachingTutor = { id: string; displayName: string; headline: string; bio: string; exams: string[]; timezone: string; sort: number; active?: boolean; userId?: string | null };
export type CoachingSlot = { id: string; tutorId: string; startsAt: string; endsAt: string; tutorExams: string[] };
export type CoachingBooking = {
  id: string;
  slotId: string;
  tutorId: string;
  serviceId: string;
  examId: string;
  userId: string;
  notes: string | null;
  status: CoachingBookingStatus;
  holdExpiresAt: string | null;
  amountCents: number;
  currency: string;
  paidAt: string | null;
  meetingUrl: string | null;
  adminNote: string | null;
  createdAt: string;
  startsAt?: string;
  endsAt?: string;
  serviceName?: string;
  tutorName?: string;
  examName?: string;
  userEmail?: string;
};

export const COACHING_HOLD_MINUTES = 20;
export const BOOKING_REFERENCE_PREFIX = "booking_";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID.test(value);
}

/** `client_reference_id` sent to Stripe for a coaching booking. */
export function bookingReference(bookingId: string) {
  return `${BOOKING_REFERENCE_PREFIX}${bookingId}`;
}

/** Booking id encoded in a Stripe `client_reference_id`, or undefined for subscription checkouts. */
export function bookingIdFromReference(reference: string | null | undefined) {
  if (!reference?.startsWith(BOOKING_REFERENCE_PREFIX)) return undefined;
  const id = reference.slice(BOOKING_REFERENCE_PREFIX.length);
  return isUuid(id) ? id.toLowerCase() : undefined;
}

/** Only Stripe-hosted Payment Links are accepted as service checkout URLs. */
export function isStripePaymentLink(value: string | null | undefined): value is string {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === "buy.stripe.com" && url.pathname.length > 1;
  } catch {
    return false;
  }
}

/** Payment Link URL for a booking: carries the booking reference and pre-fills the buyer email. */
export function paymentLinkFor(link: string | null | undefined, bookingId: string, email?: string) {
  if (!isStripePaymentLink(link) || !isUuid(bookingId)) return undefined;
  const url = new URL(link);
  url.searchParams.set("client_reference_id", bookingReference(bookingId));
  if (email?.includes("@")) url.searchParams.set("prefilled_email", email);
  return url.toString();
}

export function formatCad(cents: number) {
  return new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD", maximumFractionDigits: cents % 100 === 0 ? 0 : 2 }).format(cents / 100);
}

export function bookingStatusLabel(status: CoachingBookingStatus) {
  return { pending: "Awaiting payment", paid: "Confirmed", cancelled: "Cancelled", expired: "Expired", completed: "Completed" }[status];
}

/** Whether a pending booking can still be paid. */
export function holdIsActive(booking: Pick<CoachingBooking, "status" | "holdExpiresAt">, now = Date.now()) {
  return booking.status === "pending" && Boolean(booking.holdExpiresAt) && new Date(booking.holdExpiresAt as string).getTime() > now;
}

/** Comma-separated admin allowlist → lowercase set. */
export function parseAdminEmails(value: string | undefined) {
  return new Set((value ?? "").split(",").map((entry) => entry.trim().toLowerCase()).filter((entry) => entry.includes("@")));
}

export function isCoachingAdminEmail(email: string | undefined, allowlist: string | undefined) {
  if (!email) return false;
  return parseAdminEmails(allowlist).has(email.trim().toLowerCase());
}

// ---------- timezone-aware slot generation ----------

function tzParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", weekday: "short" }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return { year: Number(get("year")), month: Number(get("month")), day: Number(get("day")), hour: Number(get("hour")) % 24, minute: Number(get("minute")), second: Number(get("second")), weekday: get("weekday") };
}

/** Offset of `timeZone` from UTC at `date`, in minutes (east positive). */
export function timeZoneOffsetMinutes(date: Date, timeZone: string) {
  const p = tzParts(date, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return Math.round((asUtc - date.getTime()) / 60_000);
}

/** UTC instant for a wall-clock time (`YYYY-MM-DD` + `HH:MM`) in `timeZone`; handles DST transitions. */
export function zonedTimeToUtc(dateKey: string, time: string, timeZone: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  if (![year, month, day, hour, minute].every(Number.isFinite)) throw new Error("Invalid date or time.");
  const guess = Date.UTC(year, month - 1, day, hour, minute);
  const first = guess - timeZoneOffsetMinutes(new Date(guess), timeZone) * 60_000;
  const second = guess - timeZoneOffsetMinutes(new Date(first), timeZone) * 60_000;
  return new Date(second);
}

/** `YYYY-MM-DD` for `date` in `timeZone`. */
export function dateKeyIn(date: Date, timeZone: string) {
  const p = tzParts(date, timeZone);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

/** 0 = Sunday … 6 = Saturday for `date` in `timeZone`. */
export function weekdayIn(date: Date, timeZone: string) {
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(tzParts(date, timeZone).weekday);
}

function addDays(dateKey: string, days: number) {
  const [y, m, d] = dateKey.split("-").map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + days, 12));
  return next.toISOString().slice(0, 10);
}

export type WeeklyAvailabilityInput = { weekdays: number[]; startTime: string; endTime: string; slotMinutes: number; weeks: number; timeZone: string; from?: Date };

/**
 * Generates `[startsAt, endsAt]` pairs for every weekday in the window, in
 * the tutor's timezone. Slots start at `startTime` and repeat every
 * `slotMinutes` until they would pass `endTime`.
 */
export function generateWeeklySlots({ weekdays, startTime, endTime, slotMinutes, weeks, timeZone, from = new Date() }: WeeklyAvailabilityInput) {
  if (!weekdays.length || weeks < 1 || weeks > 12 || slotMinutes < 15 || slotMinutes > 240) return [];
  const [sh, sm] = startTime.split(":").map(Number);
  const [eh, em] = endTime.split(":").map(Number);
  const startMinutes = sh * 60 + sm;
  const endMinutes = eh * 60 + em;
  if (!Number.isFinite(startMinutes) || !Number.isFinite(endMinutes) || endMinutes <= startMinutes) return [];
  const slots: Array<{ startsAt: Date; endsAt: Date }> = [];
  const firstDay = addDays(dateKeyIn(from, timeZone), 1);
  for (let offset = 0; offset < weeks * 7; offset += 1) {
    const dateKey = addDays(firstDay, offset);
    const weekday = weekdayIn(zonedTimeToUtc(dateKey, "12:00", timeZone), timeZone);
    if (!weekdays.includes(weekday)) continue;
    for (let minutes = startMinutes; minutes + slotMinutes <= endMinutes; minutes += slotMinutes) {
      const time = `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
      const startsAt = zonedTimeToUtc(dateKey, time, timeZone);
      if (startsAt.getTime() <= from.getTime()) continue;
      slots.push({ startsAt, endsAt: new Date(startsAt.getTime() + slotMinutes * 60_000) });
    }
  }
  return slots;
}

export function slotsForDay(dateKey: string, times: string[], slotMinutes: number, timeZone: string, now = new Date()) {
  return times
    .filter((time) => /^\d{2}:\d{2}$/.test(time))
    .map((time) => zonedTimeToUtc(dateKey, time, timeZone))
    .filter((startsAt) => startsAt.getTime() > now.getTime())
    .map((startsAt) => ({ startsAt, endsAt: new Date(startsAt.getTime() + slotMinutes * 60_000) }));
}

/** Human date + time in a timezone, e.g. "Tue, Sep 8, 2:30 PM". */
export function formatSlot(iso: string, timeZone: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone, weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(iso));
}

export function formatTime(iso: string, timeZone: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone, hour: "numeric", minute: "2-digit" }).format(new Date(iso));
}

export function formatDay(iso: string, timeZone: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone, weekday: "long", month: "long", day: "numeric" }).format(new Date(iso));
}

/** Maps RPC exception names to user-facing messages. */
export function bookingErrorMessage(raw: string | undefined) {
  const message = raw ?? "";
  if (message.includes("slot_taken")) return "Someone else just booked that time. Pick another slot.";
  if (message.includes("slot_unavailable")) return "That time is no longer available.";
  if (message.includes("tutor_unavailable")) return "That tutor does not coach the selected exam.";
  if (message.includes("service_unavailable")) return "That session type is not available right now.";
  if (message.includes("exam_unknown")) return "Choose a valid exam.";
  if (message.includes("notes_too_long")) return "Keep your notes under 2,000 characters.";
  if (message.includes("not_signed_in")) return "Sign in to book a session.";
  return "We could not hold that time. Try again.";
}
