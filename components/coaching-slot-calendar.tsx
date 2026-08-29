"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { formatDay, formatTime, type CoachingSlot, type CoachingTutor } from "@/lib/coaching-core";
import { cn } from "@/lib/utils";

const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

/** Calendar date key (YYYY-MM-DD) for an instant, in the learner's time zone. */
function dateKey(iso: string, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(iso));
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function monthKey(key: string) {
  return key.slice(0, 7);
}

function monthLabel(month: string) {
  const [year, monthIndex] = month.split("-").map(Number);
  return new Intl.DateTimeFormat("en-CA", { month: "long", year: "numeric" }).format(new Date(Date.UTC(year, monthIndex - 1, 1)));
}

/** Cells for a month grid: leading blanks, then one entry per day. Uses UTC math on plain dates only. */
function monthCells(month: string) {
  const [year, monthIndex] = month.split("-").map(Number);
  const first = new Date(Date.UTC(year, monthIndex - 1, 1));
  const daysInMonth = new Date(Date.UTC(year, monthIndex, 0)).getUTCDate();
  const cells: Array<string | null> = Array.from({ length: first.getUTCDay() }, () => null);
  for (let day = 1; day <= daysInMonth; day += 1) cells.push(`${month}-${String(day).padStart(2, "0")}`);
  return cells;
}

type Props = {
  slots: CoachingSlot[];
  tutors: CoachingTutor[];
  showTutor: boolean;
  slotId: string;
  onSelect: (slotId: string) => void;
  timeZone: string;
};

/**
 * Month calendar for picking a coaching slot: days with availability are
 * highlighted, one click reveals that day's times, a second picks the slot.
 */
export function CoachingSlotCalendar({ slots, tutors, showTutor, slotId, onSelect, timeZone }: Props) {
  const byDay = useMemo(() => {
    const grouped = new Map<string, CoachingSlot[]>();
    for (const slot of [...slots].sort((a, b) => a.startsAt.localeCompare(b.startsAt))) {
      const key = dateKey(slot.startsAt, timeZone);
      grouped.set(key, [...(grouped.get(key) ?? []), slot]);
    }
    return grouped;
  }, [slots, timeZone]);
  const availableDays = useMemo(() => [...byDay.keys()].sort(), [byDay]);
  const months = useMemo(() => [...new Set(availableDays.map(monthKey))], [availableDays]);
  const todayKey = dateKey(new Date().toISOString(), timeZone);

  const [pickedDay, setSelectedDay] = useState<string>("");
  const [pickedMonth, setMonth] = useState<string>("");
  // Derive the effective selection so a tutor or exam change that removes the
  // picked day falls back to the first available one without an effect.
  const selectedDay = byDay.has(pickedDay) ? pickedDay : availableDays[0] ?? "";
  const month = months.includes(pickedMonth) ? pickedMonth : selectedDay ? monthKey(selectedDay) : monthKey(todayKey);

  const monthIndex = months.indexOf(month);
  const daySlots = byDay.get(selectedDay) ?? [];
  const selectedSlot = slots.find((slot) => slot.id === slotId);

  return (
    <div className="mt-3 grid gap-5 md:grid-cols-[minmax(0,19rem)_1fr]">
      <div className="rounded-xl border p-3">
        <div className="flex items-center justify-between">
          <button type="button" aria-label="Previous month" disabled={monthIndex <= 0} onClick={() => setMonth(months[monthIndex - 1])} className="grid size-8 place-items-center rounded-lg hover:bg-muted disabled:opacity-30"><ChevronLeft className="size-4" /></button>
          <p className="text-sm font-semibold">{monthLabel(month)}</p>
          <button type="button" aria-label="Next month" disabled={monthIndex < 0 || monthIndex >= months.length - 1} onClick={() => setMonth(months[monthIndex + 1])} className="grid size-8 place-items-center rounded-lg hover:bg-muted disabled:opacity-30"><ChevronRight className="size-4" /></button>
        </div>
        <div className="mt-3 grid grid-cols-7 gap-1 text-center text-[11px] font-medium text-muted-foreground">{WEEKDAYS.map((weekday) => <span key={weekday}>{weekday}</span>)}</div>
        <div role="grid" aria-label="Available days" className="mt-1 grid grid-cols-7 gap-1">
          {monthCells(month).map((key, index) => {
            if (!key) return <span key={`blank-${index}`} />;
            const count = byDay.get(key)?.length ?? 0;
            const available = count > 0;
            const selected = key === selectedDay;
            const hasChosenSlot = selectedSlot ? dateKey(selectedSlot.startsAt, timeZone) === key : false;
            return (
              <button
                key={key}
                type="button"
                role="gridcell"
                disabled={!available}
                aria-selected={selected}
                aria-label={`${formatDay(`${key}T12:00:00`, timeZone)}${available ? `, ${count} time${count === 1 ? "" : "s"} available` : ", no availability"}`}
                onClick={() => { setSelectedDay(key); setMonth(monthKey(key)); }}
                className={cn(
                  "relative flex aspect-square flex-col items-center justify-center rounded-lg text-sm transition",
                  !available && "text-muted-foreground/40",
                  available && !selected && "font-medium text-foreground hover:bg-emerald-50 dark:hover:bg-emerald-950/40",
                  selected && "bg-emerald-800 text-white",
                  key === todayKey && !selected && "ring-1 ring-emerald-600",
                )}
              >
                {Number(key.slice(8))}
                {available && <span aria-hidden="true" className={cn("absolute bottom-1 size-1.5 rounded-full", selected ? "bg-emerald-200" : hasChosenSlot ? "bg-emerald-800" : "bg-emerald-600")} />}
              </button>
            );
          })}
        </div>
      </div>
      <div>
        {selectedDay ? (
          <>
            <p className="text-sm font-medium">{formatDay(`${selectedDay}T12:00:00`, timeZone)}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {daySlots.map((entry) => {
                const tutor = tutors.find((candidate) => candidate.id === entry.tutorId);
                const active = slotId === entry.id;
                return (
                  <button key={entry.id} type="button" onClick={() => onSelect(entry.id)} aria-pressed={active} className={cn("rounded-lg border px-3 py-1.5 text-sm transition hover:border-emerald-600", active && "border-emerald-600 bg-emerald-800 text-white hover:border-emerald-800")}>
                    {formatTime(entry.startsAt, timeZone)}
                    {showTutor && tutor ? <span className={cn("ml-1.5 text-xs", active ? "text-emerald-100" : "text-muted-foreground")}>· {tutor.displayName}</span> : null}
                  </button>
                );
              })}
            </div>
          </>
        ) : <p className="text-sm text-muted-foreground">Pick a highlighted day to see times.</p>}
      </div>
    </div>
  );
}
