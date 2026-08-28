import "server-only";

import { cache } from "react";
import { createClient as createAnonymousClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isDemoSession } from "@/lib/demo-session";
import { isCoachingAdminEmail, type CoachingBooking, type CoachingBookingStatus, type CoachingExam, type CoachingService, type CoachingSlot, type CoachingTutor } from "@/lib/coaching-core";

type ServiceRow = { id: string; name: string; description: string; duration_minutes: number; price_cents: number; currency: string; stripe_payment_link: string | null; active: boolean; sort: number };
type TutorRow = { id: string; display_name: string; headline: string; bio: string; exams: string[]; timezone: string; sort: number; active?: boolean; user_id?: string | null };
type SlotRow = { id: string; tutor_id: string; starts_at: string; ends_at: string; tutor_exams: string[] };
type BookingRow = {
  id: string; slot_id: string; tutor_id: string; service_id: string; exam_id: string; user_id: string; notes: string | null; status: CoachingBookingStatus;
  hold_expires_at: string | null; amount_cents: number; currency: string; paid_at: string | null; meeting_url: string | null; admin_note: string | null; created_at: string;
  coaching_availability?: { starts_at: string; ends_at: string } | null;
  coaching_services?: { name: string } | null;
  coaching_tutors?: { display_name: string } | null;
  coaching_exams?: { name: string } | null;
};

const BOOKING_SELECT = "id,slot_id,tutor_id,service_id,exam_id,user_id,notes,status,hold_expires_at,amount_cents,currency,paid_at,meeting_url,admin_note,created_at,coaching_availability(starts_at,ends_at),coaching_services(name),coaching_tutors(display_name),coaching_exams(name)";

function mapService(row: ServiceRow): CoachingService {
  return { id: row.id, name: row.name, description: row.description, durationMinutes: row.duration_minutes, priceCents: row.price_cents, currency: row.currency, paymentLink: row.stripe_payment_link, active: row.active, sort: row.sort };
}
function mapTutor(row: TutorRow): CoachingTutor {
  return { id: row.id, displayName: row.display_name, headline: row.headline, bio: row.bio, exams: row.exams ?? [], timezone: row.timezone, sort: row.sort, active: row.active, userId: row.user_id };
}
function mapBooking(row: BookingRow): CoachingBooking {
  return {
    id: row.id, slotId: row.slot_id, tutorId: row.tutor_id, serviceId: row.service_id, examId: row.exam_id, userId: row.user_id, notes: row.notes, status: row.status,
    holdExpiresAt: row.hold_expires_at, amountCents: row.amount_cents, currency: row.currency, paidAt: row.paid_at, meetingUrl: row.meeting_url, adminNote: row.admin_note, createdAt: row.created_at,
    startsAt: row.coaching_availability?.starts_at, endsAt: row.coaching_availability?.ends_at, serviceName: row.coaching_services?.name, tutorName: row.coaching_tutors?.display_name, examName: row.coaching_exams?.name,
  };
}

/** Anonymous client for the public, statically revalidated /coaching page (no cookies, so ISR stays possible). */
function anonymousClient() {
  return createAnonymousClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
}

/** Public catalogue: active services, exams, and active tutors (no user ids). Works signed out. */
export const getCoachingCatalog = cache(async (): Promise<{ services: CoachingService[]; exams: CoachingExam[]; tutors: CoachingTutor[] }> => {
  const supabase = anonymousClient();
  const [services, exams, tutors] = await Promise.all([
    supabase.from("coaching_services").select("id,name,description,duration_minutes,price_cents,currency,stripe_payment_link,active,sort").eq("active", true).order("sort"),
    supabase.from("coaching_exams").select("id,name,sort").order("sort"),
    supabase.from("coaching_public_tutors").select("id,display_name,headline,bio,exams,timezone,sort").order("sort"),
  ]);
  if (services.error || exams.error || tutors.error) {
    // Fail closed (empty catalogue) so the public page and build survive a missing migration or outage.
    console.warn("coaching: catalogue unavailable", services.error?.message ?? exams.error?.message ?? tutors.error?.message);
    return { services: [], exams: [], tutors: [] };
  }
  return {
    services: ((services.data ?? []) as ServiceRow[]).map(mapService),
    exams: (exams.data ?? []) as CoachingExam[],
    tutors: ((tutors.data ?? []) as TutorRow[]).map(mapTutor),
  };
});

/** Open slots for the next `days` days (default 21), optionally filtered by tutor/exam. */
export async function getOpenSlots({ tutorId, examId, days = 21 }: { tutorId?: string; examId?: string; days?: number } = {}): Promise<CoachingSlot[]> {
  const supabase = await createClient();
  const to = new Date(Date.now() + days * 86_400_000).toISOString();
  let query = supabase.from("coaching_open_slots").select("id,tutor_id,starts_at,ends_at,tutor_exams").lte("starts_at", to).order("starts_at").limit(1000);
  if (tutorId) query = query.eq("tutor_id", tutorId);
  if (examId) query = query.contains("tutor_exams", [examId]);
  const { data, error } = await query;
  if (error) throw new Error("Could not load availability.");
  return ((data ?? []) as SlotRow[]).map((row) => ({ id: row.id, tutorId: row.tutor_id, startsAt: row.starts_at, endsAt: row.ends_at, tutorExams: row.tutor_exams ?? [] }));
}

export async function currentUser() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub as string | undefined;
  const email = (data?.claims?.email as string | undefined) ?? "";
  return userId ? { userId, email } : null;
}

export const getMyBookings = cache(async (): Promise<CoachingBooking[]> => {
  if (await isDemoSession()) return [];
  const supabase = await createClient();
  const { data, error } = await supabase.from("coaching_bookings").select(BOOKING_SELECT).order("created_at", { ascending: false }).limit(200);
  if (error) throw new Error("Could not load your bookings.");
  return ((data ?? []) as unknown as BookingRow[]).map(mapBooking);
});

export async function getMyBooking(id: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.from("coaching_bookings").select(BOOKING_SELECT).eq("id", id).maybeSingle();
  if (error || !data) return null;
  return mapBooking(data as unknown as BookingRow);
}

/** Whether the signed-in user is listed in COACHING_ADMIN_EMAILS. */
export const isCoachingAdmin = cache(async () => {
  if (await isDemoSession()) return false;
  const user = await currentUser();
  return isCoachingAdminEmail(user?.email, process.env.COACHING_ADMIN_EMAILS);
});

// ---------- admin readers (service role; callers must check isCoachingAdmin) ----------

export async function adminGetTutors(): Promise<CoachingTutor[]> {
  const { data, error } = await createAdminClient().from("coaching_tutors").select("id,user_id,display_name,headline,bio,exams,timezone,active,sort").order("sort");
  if (error) throw new Error("Could not load tutors.");
  return ((data ?? []) as TutorRow[]).map(mapTutor);
}

export async function adminGetServices(): Promise<CoachingService[]> {
  const { data, error } = await createAdminClient().from("coaching_services").select("id,name,description,duration_minutes,price_cents,currency,stripe_payment_link,active,sort").order("sort");
  if (error) throw new Error("Could not load services.");
  return ((data ?? []) as ServiceRow[]).map(mapService);
}

export type AdminSlot = { id: string; tutorId: string; startsAt: string; endsAt: string; booking?: { id: string; status: CoachingBookingStatus } };

export async function adminGetUpcomingSlots(tutorId?: string): Promise<AdminSlot[]> {
  const admin = createAdminClient();
  let query = admin.from("coaching_availability").select("id,tutor_id,starts_at,ends_at").gte("starts_at", new Date().toISOString()).order("starts_at").limit(1000);
  if (tutorId) query = query.eq("tutor_id", tutorId);
  const { data, error } = await query;
  if (error) throw new Error("Could not load availability.");
  const slots = (data ?? []) as Array<{ id: string; tutor_id: string; starts_at: string; ends_at: string }>;
  if (!slots.length) return [];
  const { data: bookings } = await admin.from("coaching_bookings").select("id,slot_id,status,hold_expires_at").in("slot_id", slots.map((slot) => slot.id)).in("status", ["pending", "paid"]);
  const live = new Map<string, { id: string; status: CoachingBookingStatus }>();
  for (const booking of (bookings ?? []) as Array<{ id: string; slot_id: string; status: CoachingBookingStatus; hold_expires_at: string | null }>) {
    if (booking.status === "pending" && booking.hold_expires_at && new Date(booking.hold_expires_at).getTime() < Date.now()) continue;
    live.set(booking.slot_id, { id: booking.id, status: booking.status });
  }
  return slots.map((slot) => ({ id: slot.id, tutorId: slot.tutor_id, startsAt: slot.starts_at, endsAt: slot.ends_at, booking: live.get(slot.id) }));
}

export async function adminGetBookings(status?: CoachingBookingStatus): Promise<CoachingBooking[]> {
  const admin = createAdminClient();
  let query = admin.from("coaching_bookings").select(BOOKING_SELECT).order("created_at", { ascending: false }).limit(500);
  if (status) query = query.eq("status", status);
  const { data, error } = await query;
  if (error) throw new Error("Could not load bookings.");
  const bookings = ((data ?? []) as unknown as BookingRow[]).map(mapBooking);
  const userIds = [...new Set(bookings.map((booking) => booking.userId))];
  const emails = new Map<string, string>();
  await Promise.all(userIds.map(async (userId) => {
    const { data: user } = await admin.auth.admin.getUserById(userId);
    if (user?.user?.email) emails.set(userId, user.user.email);
  }));
  return bookings.map((booking) => ({ ...booking, userEmail: emails.get(booking.userId) }));
}

// ---------- tutor portal (user-context client; RLS enforced) ----------

type TutorBookingRow = {
  id: string; slot_id: string; tutor_id: string; service_id: string; exam_id: string; user_id: string; notes: string | null; status: CoachingBookingStatus;
  hold_expires_at: string | null; amount_cents: number; currency: string; paid_at: string | null; meeting_url: string | null; created_at: string;
  starts_at: string; ends_at: string; service_name: string; exam_name: string; learner_email: string | null;
};

/** The tutor profile linked to the signed-in user, or null. Includes inactive profiles so tutors can prepare before publishing. */
export const getMyTutor = cache(async (): Promise<CoachingTutor | null> => {
  if (await isDemoSession()) return null;
  const supabase = await createClient();
  const { data: tutorId, error: idError } = await supabase.rpc("coaching_my_tutor_id");
  if (idError || !tutorId) return null;
  const { data, error } = await supabase.from("coaching_tutors").select("id,display_name,headline,bio,exams,timezone,sort,active").eq("id", tutorId as string).maybeSingle();
  if (error || !data) return null;
  return mapTutor(data as TutorRow);
});

/** Upcoming slots for the signed-in tutor with live booking state. */
export async function getMyTutorSlots(): Promise<AdminSlot[]> {
  const tutor = await getMyTutor();
  if (!tutor) return [];
  const supabase = await createClient();
  const [{ data: slotRows, error }, { data: bookingRows }] = await Promise.all([
    supabase.from("coaching_availability").select("id,tutor_id,starts_at,ends_at").eq("tutor_id", tutor.id).gte("starts_at", new Date().toISOString()).order("starts_at").limit(1000),
    supabase.from("coaching_bookings").select("id,slot_id,status,hold_expires_at").eq("tutor_id", tutor.id).in("status", ["pending", "paid"]),
  ]);
  if (error) throw new Error("Could not load your availability.");
  const live = new Map<string, { id: string; status: CoachingBookingStatus }>();
  for (const booking of (bookingRows ?? []) as Array<{ id: string; slot_id: string; status: CoachingBookingStatus; hold_expires_at: string | null }>) {
    if (booking.status === "pending" && booking.hold_expires_at && new Date(booking.hold_expires_at).getTime() < Date.now()) continue;
    live.set(booking.slot_id, { id: booking.id, status: booking.status });
  }
  return ((slotRows ?? []) as Array<{ id: string; tutor_id: string; starts_at: string; ends_at: string }>).map((slot) => ({ id: slot.id, tutorId: slot.tutor_id, startsAt: slot.starts_at, endsAt: slot.ends_at, booking: live.get(slot.id) }));
}

/** Bookings for the signed-in tutor, newest first, with learner emails. */
export async function getMyTutorBookings(): Promise<CoachingBooking[]> {
  const tutor = await getMyTutor();
  if (!tutor) return [];
  const supabase = await createClient();
  const { data, error } = await supabase.from("coaching_tutor_bookings").select("*").order("starts_at", { ascending: false }).limit(500);
  if (error) throw new Error("Could not load your bookings.");
  return ((data ?? []) as TutorBookingRow[]).map((row) => ({
    id: row.id, slotId: row.slot_id, tutorId: row.tutor_id, serviceId: row.service_id, examId: row.exam_id, userId: row.user_id, notes: row.notes, status: row.status,
    holdExpiresAt: row.hold_expires_at, amountCents: row.amount_cents, currency: row.currency, paidAt: row.paid_at, meetingUrl: row.meeting_url, adminNote: null, createdAt: row.created_at,
    startsAt: row.starts_at, endsAt: row.ends_at, serviceName: row.service_name, examName: row.exam_name, tutorName: tutor.displayName, userEmail: row.learner_email ?? undefined,
  }));
}
