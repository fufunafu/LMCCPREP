import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  demo: false,
  user: { userId: "00000000-0000-4000-8000-000000000001", email: "learner@example.com" } as null | { userId: string; email: string },
  admin: false,
  rpc: vi.fn(),
  serviceLink: "https://buy.stripe.com/test_abc" as string | null,
  redirect: vi.fn((url: string) => { throw new Error(`REDIRECT:${url}`); }),
  adminUpsert: vi.fn(),
  tutorTimezone: "America/Toronto",
}));

vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/demo-session", () => ({ isDemoSession: async () => mocks.demo }));
vi.mock("@/lib/coaching", () => ({ currentUser: async () => mocks.user, isCoachingAdmin: async () => mocks.admin }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    rpc: mocks.rpc,
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { stripe_payment_link: mocks.serviceLink }, error: null }) }) }) }),
  }),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (table: string) => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: table === "coaching_tutors" ? { timezone: mocks.tutorTimezone } : null }) }) }),
      upsert: (rows: unknown[]) => ({ select: async () => { mocks.adminUpsert(rows); return { data: rows, error: null }; } }),
    }),
  }),
}));

import { addWeeklyAvailability, cancelMyBooking, createBooking } from "@/lib/coaching-actions";

const slotId = "6f1d2c3b-4a5e-4f60-8a7b-9c0d1e2f3a4b";
const bookingId = "7a1d2c3b-4a5e-4f60-8a7b-9c0d1e2f3a4c";

function form(entries: Record<string, string | string[]>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) {
    for (const item of Array.isArray(value) ? value : [value]) data.append(key, item);
  }
  return data;
}

describe("createBooking", () => {
  beforeEach(() => {
    mocks.demo = false;
    mocks.admin = false;
    mocks.user = { userId: "00000000-0000-4000-8000-000000000001", email: "learner@example.com" };
    mocks.serviceLink = "https://buy.stripe.com/test_abc";
    mocks.rpc.mockReset().mockResolvedValue({ data: { id: bookingId }, error: null });
    mocks.redirect.mockClear();
    mocks.adminUpsert.mockReset();
  });

  it("holds the slot through the RPC and redirects to the Payment Link with the booking reference", async () => {
    await expect(createBooking(form({ slotId, serviceId: "tutor60", examId: "mccqe1", notes: " focus on cardio " }))).rejects.toThrow(`REDIRECT:https://buy.stripe.com/test_abc?client_reference_id=booking_${bookingId}&prefilled_email=learner%40example.com`);
    expect(mocks.rpc).toHaveBeenCalledWith("create_coaching_booking", { p_slot_id: slotId, p_service_id: "tutor60", p_exam_id: "mccqe1", p_notes: "focus on cardio" });
  });

  it("rejects malformed input before calling the database", async () => {
    await expect(createBooking(form({ slotId: "nope", serviceId: "tutor60", examId: "mccqe1" }))).rejects.toThrow("REDIRECT:/coaching/book?service=tutor60&error=Choose%20a%20time.");
    await expect(createBooking(form({ slotId, serviceId: "Bad Service!", examId: "mccqe1" }))).rejects.toThrow(/error=Choose%20a%20session%20type/);
    await expect(createBooking(form({ slotId, serviceId: "tutor60", examId: "" }))).rejects.toThrow(/error=Choose%20an%20exam/);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("maps RPC exceptions to friendly messages", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "slot_taken" } });
    await expect(createBooking(form({ slotId, serviceId: "tutor60", examId: "mccqe1" }))).rejects.toThrow(/Someone%20else%20just%20booked/);
  });

  it("sends the learner to their bookings when the service has no Payment Link yet", async () => {
    mocks.serviceLink = null;
    await expect(createBooking(form({ slotId, serviceId: "tutor60", examId: "mccqe1" }))).rejects.toThrow(`REDIRECT:/coaching/bookings?booking=${bookingId}&error=no_link`);
  });

  it("blocks demo sessions and signed-out users", async () => {
    mocks.demo = true;
    await expect(createBooking(form({ slotId, serviceId: "tutor60", examId: "mccqe1" }))).rejects.toThrow("REDIRECT:/coaching/bookings?error=demo");
    mocks.demo = false;
    mocks.user = null;
    await expect(createBooking(form({ slotId, serviceId: "tutor60", examId: "mccqe1" }))).rejects.toThrow(/REDIRECT:\/login\?next=/);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});

describe("cancelMyBooking", () => {
  it("only cancels through the owner-scoped RPC", async () => {
    mocks.demo = false;
    mocks.rpc.mockReset().mockResolvedValue({ data: true, error: null });
    await expect(cancelMyBooking(form({ bookingId }))).resolves.toEqual({ ok: true });
    expect(mocks.rpc).toHaveBeenCalledWith("cancel_my_coaching_booking", { p_booking_id: bookingId });
    mocks.rpc.mockResolvedValue({ data: false, error: null });
    await expect(cancelMyBooking(form({ bookingId }))).resolves.toMatchObject({ ok: false });
    await expect(cancelMyBooking(form({ bookingId: "x" }))).resolves.toMatchObject({ ok: false });
  });
});

describe("admin actions", () => {
  it("refuses non-admins", async () => {
    mocks.admin = false;
    await expect(addWeeklyAvailability(form({ tutorId: slotId, weekdays: ["1"], startTime: "09:00", endTime: "10:00", slotMinutes: "60", weeks: "1" }))).rejects.toThrow("Not authorized.");
    expect(mocks.adminUpsert).not.toHaveBeenCalled();
  });

  it("generates weekly slots in the tutor's timezone for admins", async () => {
    mocks.admin = true;
    mocks.adminUpsert.mockReset();
    const count = await addWeeklyAvailability(form({ tutorId: slotId, weekdays: ["1", "2", "3", "4", "5"], startTime: "09:00", endTime: "11:00", slotMinutes: "60", weeks: "1" }));
    expect(count).toBe(10);
    const rows = mocks.adminUpsert.mock.calls[0][0] as Array<{ tutor_id: string; starts_at: string; ends_at: string }>;
    expect(rows).toHaveLength(10);
    expect(rows.every((row) => row.tutor_id === slotId)).toBe(true);
    for (const row of rows) {
      const local = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(row.starts_at));
      expect(["09:00", "10:00"]).toContain(local);
    }
  });

  it("validates weekly input", async () => {
    mocks.admin = true;
    await expect(addWeeklyAvailability(form({ tutorId: slotId, weekdays: [], startTime: "09:00", endTime: "10:00" }))).rejects.toThrow("Choose at least one weekday.");
    await expect(addWeeklyAvailability(form({ tutorId: slotId, weekdays: ["1"], startTime: "9am", endTime: "10:00" }))).rejects.toThrow(/HH:MM/);
    await expect(addWeeklyAvailability(form({ tutorId: slotId, weekdays: ["1"], startTime: "09:00", endTime: "10:00", weeks: "20" }))).rejects.toThrow("Weeks must be 1–12.");
  });
});
