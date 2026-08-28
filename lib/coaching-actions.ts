"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isDemoSession } from "@/lib/demo-session";
import { bookingErrorMessage, generateWeeklySlots, isStripePaymentLink, isUuid, paymentLinkFor, slotsForDay, tutorErrorMessage, validateTutorBookingUpdate, type CoachingBookingStatus } from "@/lib/coaching-core";
import { currentUser, getMyTutor, isCoachingAdmin } from "@/lib/coaching";

const EXAM_IDS = /^[a-z0-9_-]{1,40}$/;
const SERVICE_IDS = /^[a-z0-9_-]{1,40}$/;
const TIME = /^\d{2}:\d{2}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

function text(formData: FormData, key: string, max = 2000) {
  const value = String(formData.get(key) ?? "").trim();
  if (value.length > max) throw new Error(`${key} is too long.`);
  return value;
}

async function requireAdmin() {
  if (!(await isCoachingAdmin())) throw new Error("Not authorized.");
  return createAdminClient();
}

function isValidTimeZone(value: string) {
  try {
    new Intl.DateTimeFormat("en-CA", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

// ---------- learner ----------

/** Holds a slot, then sends the learner to the service's Stripe Payment Link. */
export async function createBooking(formData: FormData) {
  if (await isDemoSession()) redirect("/coaching/bookings?error=demo");
  const slotId = text(formData, "slotId", 64);
  const serviceId = text(formData, "serviceId", 40);
  const examId = text(formData, "examId", 40);
  const notes = text(formData, "notes", 2000);
  const back = (message: string) => redirect(`/coaching/book?service=${encodeURIComponent(serviceId)}&error=${encodeURIComponent(message)}`);
  if (!isUuid(slotId)) back("Choose a time.");
  if (!SERVICE_IDS.test(serviceId)) back("Choose a session type.");
  if (!EXAM_IDS.test(examId)) back("Choose an exam.");

  const supabase = await createClient();
  const user = await currentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/coaching/book?service=${serviceId}`)}`);
  const { data, error } = await supabase.rpc("create_coaching_booking", { p_slot_id: slotId, p_service_id: serviceId, p_exam_id: examId, p_notes: notes || null });
  if (error || !data) back(bookingErrorMessage(error?.message));
  const booking = data as { id: string };

  const { data: service } = await supabase.from("coaching_services").select("stripe_payment_link").eq("id", serviceId).maybeSingle();
  const link = paymentLinkFor(service?.stripe_payment_link, booking.id, user!.email);
  revalidatePath("/coaching/bookings");
  if (!link) redirect(`/coaching/bookings?booking=${booking.id}&error=no_link`);
  redirect(link!);
}

/** Cancels the caller's own pending booking. */
export async function cancelMyBooking(formData: FormData) {
  if (await isDemoSession()) return { ok: false, message: "Demo sessions cannot book coaching." } as const;
  const bookingId = text(formData, "bookingId", 64);
  if (!isUuid(bookingId)) return { ok: false, message: "Unknown booking." } as const;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("cancel_my_coaching_booking", { p_booking_id: bookingId });
  if (error) return { ok: false, message: "Could not cancel that booking." } as const;
  revalidatePath("/coaching/bookings");
  return data ? ({ ok: true } as const) : ({ ok: false, message: "Only unpaid bookings can be cancelled here. Contact support for paid sessions." } as const);
}

// ---------- admin ----------

export async function upsertTutor(formData: FormData) {
  const admin = await requireAdmin();
  const id = text(formData, "id", 64);
  const displayName = text(formData, "displayName", 80);
  const headline = text(formData, "headline", 160);
  const bio = text(formData, "bio", 2000);
  const timezone = text(formData, "timezone", 64) || "America/Toronto";
  const exams = formData.getAll("exams").map(String).filter((exam) => EXAM_IDS.test(exam));
  const active = formData.get("active") === "on";
  const sort = Number.parseInt(String(formData.get("sort") ?? "0"), 10);
  const userEmail = text(formData, "userEmail", 254).toLowerCase();
  if (!displayName) throw new Error("A display name is required.");
  if (!isValidTimeZone(timezone)) throw new Error("Unknown timezone.");
  if (id && !isUuid(id)) throw new Error("Unknown tutor.");

  let userId: string | null | undefined;
  if (userEmail) {
    const { data } = await admin.auth.admin.listUsers({ perPage: 1000 });
    const match = data?.users.find((user) => user.email?.toLowerCase() === userEmail);
    if (!match) throw new Error("No account with that email.");
    userId = match.id;
  } else if (formData.get("clearUser") === "on") {
    userId = null;
  }

  const row: Record<string, unknown> = { display_name: displayName, headline, bio, timezone, exams, active, sort: Number.isFinite(sort) ? sort : 0 };
  if (userId !== undefined) row.user_id = userId;
  const query = id ? admin.from("coaching_tutors").update(row).eq("id", id) : admin.from("coaching_tutors").insert(row);
  const { error } = await query;
  if (error) throw new Error("Could not save the tutor.");
  revalidatePath("/coaching");
  revalidatePath("/coaching/admin");
}

export async function setTutorActive(formData: FormData) {
  const admin = await requireAdmin();
  const id = text(formData, "id", 64);
  if (!isUuid(id)) throw new Error("Unknown tutor.");
  const { error } = await admin.from("coaching_tutors").update({ active: formData.get("active") === "true" }).eq("id", id);
  if (error) throw new Error("Could not update the tutor.");
  revalidatePath("/coaching");
  revalidatePath("/coaching/admin");
}

async function tutorTimezone(admin: ReturnType<typeof createAdminClient>, tutorId: string) {
  const { data } = await admin.from("coaching_tutors").select("timezone").eq("id", tutorId).maybeSingle();
  if (!data) throw new Error("Unknown tutor.");
  return data.timezone as string;
}

async function insertSlots(admin: ReturnType<typeof createAdminClient>, tutorId: string, slots: Array<{ startsAt: Date; endsAt: Date }>) {
  if (!slots.length) return 0;
  if (slots.length > 500) throw new Error("Add at most 500 slots at a time.");
  const rows = slots.map((slot) => ({ tutor_id: tutorId, starts_at: slot.startsAt.toISOString(), ends_at: slot.endsAt.toISOString() }));
  const { error, data } = await admin.from("coaching_availability").upsert(rows, { onConflict: "tutor_id,starts_at", ignoreDuplicates: true }).select("id");
  if (error) throw new Error("Could not save availability.");
  revalidatePath("/coaching/admin");
  return data?.length ?? 0;
}

/** Adds individual slots on one day (times in the tutor's timezone). */
export async function addAvailability(formData: FormData) {
  const admin = await requireAdmin();
  const tutorId = text(formData, "tutorId", 64);
  const date = text(formData, "date", 10);
  const durationMinutes = Number.parseInt(String(formData.get("durationMinutes") ?? "60"), 10);
  const times = text(formData, "times", 500).split(/[\s,]+/).filter(Boolean);
  if (!isUuid(tutorId)) throw new Error("Choose a tutor.");
  if (!DATE.test(date)) throw new Error("Choose a date.");
  if (!Number.isInteger(durationMinutes) || durationMinutes < 15 || durationMinutes > 240) throw new Error("Duration must be 15–240 minutes.");
  if (!times.length || times.some((time) => !TIME.test(time))) throw new Error("Enter times as HH:MM, separated by commas.");
  const timeZone = await tutorTimezone(admin, tutorId);
  return insertSlots(admin, tutorId, slotsForDay(date, times, durationMinutes, timeZone));
}

/** Generates recurring weekly slots for the next N weeks in the tutor's timezone. */
export async function addWeeklyAvailability(formData: FormData) {
  const admin = await requireAdmin();
  const tutorId = text(formData, "tutorId", 64);
  const weekdays = formData.getAll("weekdays").map((value) => Number.parseInt(String(value), 10)).filter((day) => Number.isInteger(day) && day >= 0 && day <= 6);
  const startTime = text(formData, "startTime", 5);
  const endTime = text(formData, "endTime", 5);
  const slotMinutes = Number.parseInt(String(formData.get("slotMinutes") ?? "60"), 10);
  const weeks = Number.parseInt(String(formData.get("weeks") ?? "4"), 10);
  if (!isUuid(tutorId)) throw new Error("Choose a tutor.");
  if (!weekdays.length) throw new Error("Choose at least one weekday.");
  if (!TIME.test(startTime) || !TIME.test(endTime)) throw new Error("Enter start and end times as HH:MM.");
  if (!Number.isInteger(slotMinutes) || slotMinutes < 15 || slotMinutes > 240) throw new Error("Slot length must be 15–240 minutes.");
  if (!Number.isInteger(weeks) || weeks < 1 || weeks > 12) throw new Error("Weeks must be 1–12.");
  const timeZone = await tutorTimezone(admin, tutorId);
  return insertSlots(admin, tutorId, generateWeeklySlots({ weekdays, startTime, endTime, slotMinutes, weeks, timeZone }));
}

export async function deleteAvailability(formData: FormData) {
  const admin = await requireAdmin();
  const id = text(formData, "id", 64);
  if (!isUuid(id)) throw new Error("Unknown slot.");
  const { data: paid } = await admin.from("coaching_bookings").select("id").eq("slot_id", id).in("status", ["paid", "completed"]).limit(1);
  if (paid?.length) throw new Error("That slot has a paid booking. Cancel the booking first.");
  await admin.from("coaching_bookings").update({ status: "cancelled" }).eq("slot_id", id).eq("status", "pending");
  const { error } = await admin.from("coaching_availability").delete().eq("id", id);
  if (error) throw new Error("Could not delete the slot.");
  revalidatePath("/coaching/admin");
}

export async function setBookingMeetingUrl(formData: FormData) {
  const admin = await requireAdmin();
  const id = text(formData, "id", 64);
  const url = text(formData, "meetingUrl", 500);
  if (!isUuid(id)) throw new Error("Unknown booking.");
  if (url && !/^https:\/\/[^\s]+$/.test(url)) throw new Error("Meeting links must start with https://.");
  const { error } = await admin.from("coaching_bookings").update({ meeting_url: url || null }).eq("id", id);
  if (error) throw new Error("Could not save the meeting link.");
  revalidatePath("/coaching/admin");
  revalidatePath("/coaching/bookings");
}

export async function setBookingStatus(formData: FormData) {
  const admin = await requireAdmin();
  const id = text(formData, "id", 64);
  const status = text(formData, "status", 20) as CoachingBookingStatus;
  if (!isUuid(id)) throw new Error("Unknown booking.");
  if (status !== "completed" && status !== "cancelled") throw new Error("Bookings can only be marked completed or cancelled.");
  const { error } = await admin.from("coaching_bookings").update({ status, admin_note: null }).eq("id", id);
  if (error) throw new Error("Could not update the booking.");
  revalidatePath("/coaching/admin");
  revalidatePath("/coaching/bookings");
}

export async function setServiceLink(formData: FormData) {
  const admin = await requireAdmin();
  const id = text(formData, "id", 40);
  const link = text(formData, "paymentLink", 500);
  const active = formData.get("active") === "on";
  if (!SERVICE_IDS.test(id)) throw new Error("Unknown service.");
  if (link && !isStripePaymentLink(link)) throw new Error("Only https://buy.stripe.com/… links are accepted.");
  const { error } = await admin.from("coaching_services").update({ stripe_payment_link: link || null, active }).eq("id", id);
  if (error) throw new Error("Could not save the service.");
  revalidatePath("/coaching");
  revalidatePath("/coaching/admin");
}

// ---------- tutor portal (user-context client; RLS + RPCs enforce ownership) ----------

async function requireTutor() {
  const tutor = await getMyTutor();
  if (!tutor) throw new Error("Your account is not linked to a tutor profile.");
  return { tutor, supabase: await createClient() };
}

async function tutorInsertSlots(supabase: Awaited<ReturnType<typeof createClient>>, tutorId: string, slots: Array<{ startsAt: Date; endsAt: Date }>) {
  if (!slots.length) return 0;
  if (slots.length > 500) throw new Error("Add at most 500 slots at a time.");
  const rows = slots.map((slot) => ({ tutor_id: tutorId, starts_at: slot.startsAt.toISOString(), ends_at: slot.endsAt.toISOString() }));
  const { error, data } = await supabase.from("coaching_availability").upsert(rows, { onConflict: "tutor_id,starts_at", ignoreDuplicates: true }).select("id");
  if (error) throw new Error("Could not save availability.");
  revalidatePath("/coaching/tutor");
  return data?.length ?? 0;
}

/** Tutor adds individual slots on one day (times in their own timezone). */
export async function tutorAddAvailability(formData: FormData) {
  const { tutor, supabase } = await requireTutor();
  const date = text(formData, "date", 10);
  const durationMinutes = Number.parseInt(String(formData.get("durationMinutes") ?? "60"), 10);
  const times = text(formData, "times", 500).split(/[\s,]+/).filter(Boolean);
  if (!DATE.test(date)) throw new Error("Choose a date.");
  if (!Number.isInteger(durationMinutes) || durationMinutes < 15 || durationMinutes > 240) throw new Error("Duration must be 15–240 minutes.");
  if (!times.length || times.some((time) => !TIME.test(time))) throw new Error("Enter times as HH:MM, separated by commas.");
  return tutorInsertSlots(supabase, tutor.id, slotsForDay(date, times, durationMinutes, tutor.timezone));
}

/** Tutor generates recurring weekly slots in their own timezone. */
export async function tutorAddWeeklyAvailability(formData: FormData) {
  const { tutor, supabase } = await requireTutor();
  const weekdays = formData.getAll("weekdays").map((value) => Number.parseInt(String(value), 10)).filter((day) => Number.isInteger(day) && day >= 0 && day <= 6);
  const startTime = text(formData, "startTime", 5);
  const endTime = text(formData, "endTime", 5);
  const slotMinutes = Number.parseInt(String(formData.get("slotMinutes") ?? "60"), 10);
  const weeks = Number.parseInt(String(formData.get("weeks") ?? "4"), 10);
  if (!weekdays.length) throw new Error("Choose at least one weekday.");
  if (!TIME.test(startTime) || !TIME.test(endTime)) throw new Error("Enter start and end times as HH:MM.");
  if (!Number.isInteger(slotMinutes) || slotMinutes < 15 || slotMinutes > 240) throw new Error("Slot length must be 15–240 minutes.");
  if (!Number.isInteger(weeks) || weeks < 1 || weeks > 12) throw new Error("Weeks must be 1–12.");
  return tutorInsertSlots(supabase, tutor.id, generateWeeklySlots({ weekdays, startTime, endTime, slotMinutes, weeks, timeZone: tutor.timezone }));
}

export async function tutorDeleteAvailability(formData: FormData) {
  const { tutor, supabase } = await requireTutor();
  const id = text(formData, "id", 64);
  if (!isUuid(id)) throw new Error("Unknown slot.");
  const { error, count } = await supabase.from("coaching_availability").delete({ count: "exact" }).eq("id", id).eq("tutor_id", tutor.id);
  if (error) throw new Error(tutorErrorMessage(error.message));
  if (!count) throw new Error("Unknown slot.");
  revalidatePath("/coaching/tutor");
}

/** Tutor sets the meeting link and/or marks a paid booking completed or cancelled. */
export async function tutorSetBooking(formData: FormData) {
  const { supabase } = await requireTutor();
  const id = text(formData, "id", 64);
  if (!isUuid(id)) throw new Error("Unknown booking.");
  const update = validateTutorBookingUpdate({ meetingUrl: formData.has("meetingUrl") ? text(formData, "meetingUrl", 500) : undefined, status: text(formData, "status", 20) || undefined });
  const { error } = await supabase.rpc("tutor_set_booking", { p_booking_id: id, p_meeting_url: update.meetingUrl, p_status: update.status });
  if (error) throw new Error(tutorErrorMessage(error.message));
  revalidatePath("/coaching/tutor");
  revalidatePath("/coaching/bookings");
}

export async function tutorUpdateProfile(formData: FormData) {
  const { supabase } = await requireTutor();
  const headline = text(formData, "headline", 160);
  const bio = text(formData, "bio", 2000);
  const timezone = text(formData, "timezone", 64) || "America/Toronto";
  if (!isValidTimeZone(timezone)) throw new Error("Unknown timezone.");
  const { error } = await supabase.rpc("tutor_update_profile", { p_headline: headline, p_bio: bio, p_timezone: timezone });
  if (error) throw new Error(tutorErrorMessage(error.message));
  revalidatePath("/coaching");
  revalidatePath("/coaching/tutor");
}
