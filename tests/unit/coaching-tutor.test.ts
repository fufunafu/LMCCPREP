import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  tutor: null as null | { id: string; displayName: string; timezone: string; exams: string[]; headline: string; bio: string; sort: number },
  rpc: vi.fn(),
  upsert: vi.fn(),
  del: vi.fn(),
}));

vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/demo-session", () => ({ isDemoSession: async () => false }));
vi.mock("@/lib/coaching", () => ({ currentUser: async () => null, isCoachingAdmin: async () => false, getMyTutor: async () => mocks.tutor }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({}) }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    rpc: mocks.rpc,
    from: () => ({
      upsert: (rows: unknown[]) => ({ select: async () => { mocks.upsert(rows); return { data: rows, error: null }; } }),
      delete: () => ({ eq: () => ({ eq: async () => mocks.del() }) }),
    }),
  }),
}));

import { tutorAddWeeklyAvailability, tutorDeleteAvailability, tutorSetBooking, tutorUpdateProfile } from "@/lib/coaching-actions";
import { generateWeeklySlots, tutorErrorMessage, validateTutorBookingUpdate } from "@/lib/coaching-core";

const TUTOR = { id: "a0000000-0000-4000-8000-000000000001", displayName: "Tutor 1", timezone: "America/Toronto", exams: ["mccqe1"], headline: "", bio: "", sort: 1 };
const bookingId = "7a1d2c3b-4a5e-4f60-8a7b-9c0d1e2f3a4c";

function form(entries: Record<string, string | string[]>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) for (const item of Array.isArray(value) ? value : [value]) data.append(key, item);
  return data;
}

describe("tutor actions", () => {
  beforeEach(() => {
    mocks.tutor = null;
    mocks.rpc.mockReset().mockResolvedValue({ data: {}, error: null });
    mocks.upsert.mockReset();
    mocks.del.mockReset().mockResolvedValue({ error: null, count: 1 });
  });

  it("rejects every tutor action when the user is not linked to a tutor profile", async () => {
    const notLinked = /not linked to a tutor profile/;
    await expect(tutorAddWeeklyAvailability(form({ weekdays: ["3"], startTime: "19:00", endTime: "20:00" }))).rejects.toThrow(notLinked);
    await expect(tutorDeleteAvailability(form({ id: bookingId }))).rejects.toThrow(notLinked);
    await expect(tutorSetBooking(form({ id: bookingId, status: "completed" }))).rejects.toThrow(notLinked);
    await expect(tutorUpdateProfile(form({ headline: "x", bio: "", timezone: "America/Toronto" }))).rejects.toThrow(notLinked);
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it("generates weekly slots in the tutor's own timezone and inserts them with the tutor id", async () => {
    mocks.tutor = TUTOR;
    const added = await tutorAddWeeklyAvailability(form({ weekdays: ["3", "4"], startTime: "19:00", endTime: "20:00", slotMinutes: "30", weeks: "2" }));
    expect(added).toBe(8); // Wed+Thu × 19:00,19:30 × 2 weeks
    const rows = mocks.upsert.mock.calls[0][0] as Array<{ tutor_id: string; starts_at: string }>;
    expect(rows.every((row) => row.tutor_id === TUTOR.id)).toBe(true);
    const localHours = rows.map((row) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(row.starts_at)));
    expect(new Set(localHours)).toEqual(new Set(["19:00", "19:30"]));
  });

  it("calls the tutor_set_booking RPC with validated arguments and maps RPC errors", async () => {
    mocks.tutor = TUTOR;
    await tutorSetBooking(form({ id: bookingId, meetingUrl: " https://meet.google.com/abc " }));
    expect(mocks.rpc).toHaveBeenCalledWith("tutor_set_booking", { p_booking_id: bookingId, p_meeting_url: "https://meet.google.com/abc", p_status: null });
    await expect(tutorSetBooking(form({ id: bookingId, meetingUrl: "http://insecure" }))).rejects.toThrow(/https:\/\//);
    await expect(tutorSetBooking(form({ id: bookingId, status: "paid" }))).rejects.toThrow(/completed or cancelled/);
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: "booking_not_paid" } });
    await expect(tutorSetBooking(form({ id: bookingId, status: "completed" }))).rejects.toThrow("Only paid bookings can be updated.");
  });

  it("scopes slot deletion to the tutor and surfaces the paid-booking guard", async () => {
    mocks.tutor = TUTOR;
    await expect(tutorDeleteAvailability(form({ id: bookingId }))).resolves.toBeUndefined();
    mocks.del.mockResolvedValueOnce({ error: { message: "slot_has_paid_booking" }, count: null });
    await expect(tutorDeleteAvailability(form({ id: bookingId }))).rejects.toThrow(/paid booking/);
    mocks.del.mockResolvedValueOnce({ error: null, count: 0 });
    await expect(tutorDeleteAvailability(form({ id: bookingId }))).rejects.toThrow("Unknown slot.");
  });
});

describe("validateTutorBookingUpdate", () => {
  it("accepts https links, clears with empty string, restricts statuses", () => {
    expect(validateTutorBookingUpdate({ meetingUrl: "https://zoom.us/j/1" })).toEqual({ meetingUrl: "https://zoom.us/j/1", status: null });
    expect(validateTutorBookingUpdate({ meetingUrl: "" })).toEqual({ meetingUrl: "", status: null });
    expect(validateTutorBookingUpdate({ status: "cancelled" })).toEqual({ meetingUrl: null, status: "cancelled" });
    expect(() => validateTutorBookingUpdate({ meetingUrl: "ftp://x" })).toThrow();
    expect(() => validateTutorBookingUpdate({ meetingUrl: "https://a b" })).toThrow();
    expect(() => validateTutorBookingUpdate({ status: "expired" })).toThrow();
    expect(() => validateTutorBookingUpdate({})).toThrow("Nothing to update.");
  });

  it("maps RPC exception names", () => {
    expect(tutorErrorMessage("P0001: not_a_tutor")).toMatch(/not linked/);
    expect(tutorErrorMessage("timezone_invalid")).toBe("Unknown timezone.");
    expect(tutorErrorMessage(undefined)).toBe("Something went wrong.");
  });
});

describe("generateWeeklySlots default pattern", () => {
  it("produces Wed/Thu 19:00 and 19:30 Toronto slots across a DST change", () => {
    const from = new Date("2026-10-28T12:00:00Z"); // week before DST ends (Nov 1, 2026)
    const slots = generateWeeklySlots({ weekdays: [3, 4], startTime: "19:00", endTime: "20:00", slotMinutes: 30, weeks: 2, timeZone: "America/Toronto", from });
    expect(slots).toHaveLength(8);
    const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto", weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
    const labels = slots.map((slot) => fmt.format(slot.startsAt));
    expect(labels.filter((label) => label.startsWith("Wed"))).toHaveLength(4);
    expect(labels.every((label) => label.endsWith("19:00") || label.endsWith("19:30"))).toBe(true);
    // UTC offsets differ across the DST boundary while local wall time stays fixed.
    expect(new Set(slots.map((slot) => slot.startsAt.getUTCHours())).size).toBe(2);
  });
});
