import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn(), currentUserId: vi.fn() }));

import { streakFrom } from "@/lib/data-supabase";
import { dateLabel, torontoDateKey } from "@/lib/utils";
import type { DailyActivity } from "@/lib/types";

const day = (date: string, attempted = 1): DailyActivity => ({ date, attempted, correct: attempted });

describe("torontoDateKey", () => {
  it("uses the Toronto calendar date, not UTC", () => {
    // 03:30 UTC on Aug 27 is still 23:30 on Aug 26 in Toronto (EDT, UTC-4).
    expect(torontoDateKey("2026-08-27T03:30:00Z")).toBe("2026-08-26");
    // 04:30 UTC on Jan 2 is 23:30 on Jan 1 in Toronto (EST, UTC-5).
    expect(torontoDateKey("2026-01-02T04:30:00Z")).toBe("2026-01-01");
    expect(torontoDateKey("2026-01-02T05:30:00Z")).toBe("2026-01-02");
    expect(torontoDateKey(Date.UTC(2026, 7, 26, 12))).toBe("2026-08-26");
  });

  it("defaults to now", () => {
    expect(torontoDateKey()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("streakFrom", () => {
  it("counts consecutive days ending today", () => {
    expect(streakFrom([day("2026-08-26"), day("2026-08-25"), day("2026-08-24")], "2026-08-26")).toBe(3);
  });

  it("allows an empty today and counts up to yesterday", () => {
    expect(streakFrom([day("2026-08-25"), day("2026-08-24"), day("2026-08-23")], "2026-08-26")).toBe(3);
    expect(streakFrom([day("2026-08-26", 0), day("2026-08-25")], "2026-08-26")).toBe(1);
  });

  it("stops at the first gap and ignores zero-attempt days", () => {
    expect(streakFrom([day("2026-08-26"), day("2026-08-25", 0), day("2026-08-24")], "2026-08-26")).toBe(1);
    expect(streakFrom([day("2026-08-20")], "2026-08-26")).toBe(0);
    expect(streakFrom([], "2026-08-26")).toBe(0);
  });

  it("keeps the streak for a late-evening Toronto practice that is already tomorrow in UTC", () => {
    // 23:30 Toronto on Aug 26 == 03:30 UTC on Aug 27. The Toronto key is still Aug 26.
    const today = torontoDateKey("2026-08-27T03:30:00Z");
    expect(today).toBe("2026-08-26");
    expect(streakFrom([day("2026-08-26"), day("2026-08-25")], today)).toBe(2);
    // A UTC-based "today" would have looked for Aug 27 and then Aug 26 only.
    expect(streakFrom([day("2026-08-26"), day("2026-08-25")], "2026-08-27")).toBe(2);
    expect(streakFrom([day("2026-08-25"), day("2026-08-24")], "2026-08-27")).toBe(0);
  });

  it("steps across DST and month boundaries without skipping a day", () => {
    // DST starts 2026-03-08 in Toronto.
    expect(streakFrom([day("2026-03-09"), day("2026-03-08"), day("2026-03-07")], "2026-03-09")).toBe(3);
    expect(streakFrom([day("2026-03-01"), day("2026-02-28"), day("2026-02-27")], "2026-03-01")).toBe(3);
  });
});

describe("dateLabel", () => {
  it("formats valid dates and guards against invalid input", () => {
    expect(dateLabel("2026-08-26T12:00:00Z")).toMatch(/2026/);
    expect(dateLabel("not a date")).toBeUndefined();
    expect(dateLabel(undefined)).toBeUndefined();
    expect(dateLabel("")).toBeUndefined();
  });
});
