import { describe, expect, it } from "vitest";
import { bookingIdFromReference, bookingReference, dateKeyIn, generateWeeklySlots, holdIsActive, isCoachingAdminEmail, isStripePaymentLink, paymentLinkFor, timeZoneOffsetMinutes, zonedTimeToUtc } from "@/lib/coaching-core";

const id = "6f1d2c3b-4a5e-4f60-8a7b-9c0d1e2f3a4b";

describe("booking references", () => {
  it("round-trips a booking id", () => {
    expect(bookingReference(id)).toBe(`booking_${id}`);
    expect(bookingIdFromReference(`booking_${id}`)).toBe(id);
  });
  it("ignores subscription references and malformed ids", () => {
    expect(bookingIdFromReference("00000000-0000-4000-8000-000000000001")).toBeUndefined();
    expect(bookingIdFromReference("booking_not-a-uuid")).toBeUndefined();
    expect(bookingIdFromReference(null)).toBeUndefined();
  });
});

describe("paymentLinkFor", () => {
  it("builds a Payment Link URL with the reference and email", () => {
    const url = paymentLinkFor("https://buy.stripe.com/abc123", id, "learner@example.com");
    expect(url).toBe(`https://buy.stripe.com/abc123?client_reference_id=booking_${id}&prefilled_email=learner%40example.com`);
  });
  it("rejects non-Stripe hosts and bad ids", () => {
    expect(paymentLinkFor("https://evil.example/abc", id)).toBeUndefined();
    expect(paymentLinkFor("http://buy.stripe.com/abc", id)).toBeUndefined();
    expect(paymentLinkFor("https://buy.stripe.com/abc", "nope")).toBeUndefined();
    expect(isStripePaymentLink("https://buy.stripe.com/")).toBe(false);
    expect(isStripePaymentLink("https://buy.stripe.com.evil.example/x")).toBe(false);
  });
});

describe("isCoachingAdminEmail", () => {
  it("matches case-insensitively against the comma-separated allowlist", () => {
    expect(isCoachingAdminEmail("Owner@Example.com", " owner@example.com, other@example.com ")).toBe(true);
    expect(isCoachingAdminEmail("someone@example.com", "owner@example.com")).toBe(false);
    expect(isCoachingAdminEmail(undefined, "owner@example.com")).toBe(false);
    expect(isCoachingAdminEmail("owner@example.com", undefined)).toBe(false);
  });
});

describe("holdIsActive", () => {
  const now = Date.parse("2026-09-01T12:00:00Z");
  it("is true only for pending bookings whose hold is in the future", () => {
    expect(holdIsActive({ status: "pending", holdExpiresAt: "2026-09-01T12:10:00Z" }, now)).toBe(true);
    expect(holdIsActive({ status: "pending", holdExpiresAt: "2026-09-01T11:59:00Z" }, now)).toBe(false);
    expect(holdIsActive({ status: "paid", holdExpiresAt: "2026-09-01T12:10:00Z" }, now)).toBe(false);
    expect(holdIsActive({ status: "pending", holdExpiresAt: null }, now)).toBe(false);
  });
});

describe("timezone helpers", () => {
  it("resolves Toronto wall-clock times before and after the DST fall-back", () => {
    // 2026-11-01 is the first Sunday of November: clocks fall back at 02:00 EDT.
    expect(zonedTimeToUtc("2026-10-31", "09:00", "America/Toronto").toISOString()).toBe("2026-10-31T13:00:00.000Z"); // EDT, UTC-4
    expect(zonedTimeToUtc("2026-11-02", "09:00", "America/Toronto").toISOString()).toBe("2026-11-02T14:00:00.000Z"); // EST, UTC-5
    expect(timeZoneOffsetMinutes(new Date("2026-07-01T12:00:00Z"), "America/Toronto")).toBe(-240);
    expect(timeZoneOffsetMinutes(new Date("2026-12-01T12:00:00Z"), "America/Toronto")).toBe(-300);
    expect(dateKeyIn(new Date("2026-11-02T03:30:00Z"), "America/Toronto")).toBe("2026-11-01");
  });
});

describe("generateWeeklySlots", () => {
  it("keeps 9:00 local across the DST transition week", () => {
    const from = new Date("2026-10-28T15:00:00Z"); // Wed Oct 28, first day generated is Thu Oct 29
    const slots = generateWeeklySlots({ weekdays: [1, 2, 3, 4, 5, 6, 0], startTime: "09:00", endTime: "11:00", slotMinutes: 60, weeks: 1, timeZone: "America/Toronto", from });
    expect(slots).toHaveLength(14); // 7 days × 2 slots
    const byDay: Record<string, { startsAt: Date }> = {};
    for (const slot of slots) byDay[dateKeyIn(slot.startsAt, "America/Toronto")] ??= slot; // first (09:00) slot per day
    expect(byDay["2026-10-31"].startsAt.toISOString()).toBe("2026-10-31T13:00:00.000Z");
    expect(byDay["2026-11-02"].startsAt.toISOString()).toBe("2026-11-02T14:00:00.000Z");
    for (const slot of slots) {
      const local = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(slot.startsAt);
      expect(["09:00", "10:00"]).toContain(local);
      expect(slot.endsAt.getTime() - slot.startsAt.getTime()).toBe(3_600_000);
    }
  });
  it("only emits the requested weekdays and never the current day", () => {
    const from = new Date("2026-09-07T20:00:00Z"); // Monday
    const slots = generateWeeklySlots({ weekdays: [2, 4], startTime: "18:00", endTime: "19:00", slotMinutes: 30, weeks: 2, timeZone: "America/Toronto", from });
    expect(slots).toHaveLength(8);
    expect(new Set(slots.map((slot) => dateKeyIn(slot.startsAt, "America/Toronto")))).toEqual(new Set(["2026-09-08", "2026-09-10", "2026-09-15", "2026-09-17"]));
    expect(slots.every((slot) => slot.startsAt.getTime() > from.getTime())).toBe(true);
  });
  it("returns nothing for invalid ranges", () => {
    expect(generateWeeklySlots({ weekdays: [], startTime: "09:00", endTime: "10:00", slotMinutes: 60, weeks: 1, timeZone: "America/Toronto" })).toEqual([]);
    expect(generateWeeklySlots({ weekdays: [1], startTime: "10:00", endTime: "09:00", slotMinutes: 60, weeks: 1, timeZone: "America/Toronto" })).toEqual([]);
    expect(generateWeeklySlots({ weekdays: [1], startTime: "09:00", endTime: "10:00", slotMinutes: 60, weeks: 13, timeZone: "America/Toronto" })).toEqual([]);
  });
});
