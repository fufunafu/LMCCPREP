import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { DailyActivity } from "@/lib/types";

const heat = (count: number) => count === 0
  ? "bg-muted"
  : count < 7 ? "bg-emerald-200 dark:bg-emerald-950"
  : count < 14 ? "bg-emerald-400 dark:bg-emerald-700"
  : count < 21 ? "bg-emerald-500"
  : "bg-emerald-700 dark:bg-emerald-400";
const weekday = (date: string) => (new Date(`${date}T12:00:00Z`).getUTCDay() + 6) % 7;
const dayNames = ["Mondays", "Tuesdays", "Wednesdays", "Thursdays", "Fridays", "Saturdays", "Sundays"];
const monthLabel = new Intl.DateTimeFormat("en", { month: "short", timeZone: "UTC" });

export function StudyActivityCard({ activity }: { activity: DailyActivity[] }) {
  const days = activity.slice(-84);
  const total = days.reduce((sum, day) => sum + day.attempted, 0);
  const activeDays = days.filter((day) => day.attempted > 0).length;
  const byWeekday = days.reduce((totals, day) => {
    totals[weekday(day.date)] += day.attempted;
    return totals;
  }, Array<number>(7).fill(0));
  const bestDay = total ? dayNames[byWeekday.indexOf(Math.max(...byWeekday))] : null;
  // Pad the rolling range so each row always represents the same weekday.
  const cells: (DailyActivity | null)[] = [
    ...Array<null>(days[0] ? weekday(days[0].date) : 0).fill(null),
    ...days,
  ];
  const weeks = Array.from({ length: Math.ceil(cells.length / 7) }, (_, index) =>
    Array.from({ length: 7 }, (_, row) => cells[index * 7 + row] ?? null));

  return (
    <Card className="min-w-0">
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <CardTitle className="text-base">Study activity</CardTitle>
        <span className="rounded-full bg-muted px-2.5 py-1 text-[11px] font-medium text-foreground">Last 12 weeks</span>
      </CardHeader>
      <CardContent>
        <div className="mb-5 flex items-end justify-between gap-4">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span className="text-3xl font-semibold tracking-tight tabular-nums">{total.toLocaleString()}</span>
            <span className="text-xs text-muted-foreground">questions attempted</span>
          </div>
          <p className="shrink-0 text-xs text-muted-foreground"><span className="font-semibold text-foreground">{activeDays}</span> active {activeDays === 1 ? "day" : "days"}</p>
        </div>
        <div aria-hidden="true" className="flex gap-2.5">
          <div className="grid shrink-0 grid-rows-[18px_repeat(7,18px)] gap-1 text-[10px] leading-[18px] text-muted-foreground">
            <span />{["Mon", "", "Wed", "", "Fri", "", "Sun"].map((label, index) => <span key={index}>{label}</span>)}
          </div>
          <div className="grid min-w-0 flex-1 gap-1" style={{ gridTemplateColumns: `repeat(${Math.max(1, weeks.length)}, minmax(0, 1fr))` }}>
            {weeks.map((week, index) => {
              const firstDay = week.find((day) => day !== null);
              const previousDay = weeks[index - 1]?.find((day) => day !== null);
              const nextDay = weeks[index + 1]?.find((day) => day !== null);
              const month = firstDay?.date.slice(0, 7);
              const showMonth = firstDay && (previousDay
                ? month !== previousDay.date.slice(0, 7)
                : !nextDay || month === nextDay.date.slice(0, 7));
              return (
                <div key={firstDay?.date ?? index} className="grid min-w-0 grid-cols-[minmax(0,1fr)] grid-rows-[18px_repeat(7,18px)] gap-1">
                  <span className="text-[10px] leading-[18px] text-muted-foreground">{showMonth ? monthLabel.format(new Date(`${firstDay.date}T12:00:00Z`)) : ""}</span>
                  {week.map((day, row) => <span key={day?.date ?? row} title={day ? `${day.date}: ${day.attempted} questions` : undefined} className={`rounded-[3px] ${day ? heat(day.attempted) : ""}`} />)}
                </div>
              );
            })}
          </div>
        </div>
        <table className="sr-only">
          <caption>Weekly study activity for the last 12 weeks</caption>
          <thead><tr><th>Week</th><th>Attempted</th><th>Correct</th></tr></thead>
          <tbody>{weeks.map((week, index) => {
            const entries = week.filter((day) => day !== null);
            return <tr key={index}><td>{entries[0]?.date} to {entries.at(-1)?.date}</td><td>{entries.reduce((sum, day) => sum + day.attempted, 0)}</td><td>{entries.reduce((sum, day) => sum + day.correct, 0)}</td></tr>;
          })}</tbody>
        </table>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t pt-3 text-[11px] text-muted-foreground">
          <span>{bestDay ? <>Most active on <span className="font-medium text-foreground">{bestDay}</span></> : "Your next session starts the pattern"}</span>
          <div aria-hidden="true" className="flex items-center gap-1">
            <span className="mr-1">Less</span>
            {[0, 1, 7, 14, 21].map((count) => <span key={count} className={`size-2.5 rounded-[2px] ${heat(count)}`} />)}
            <span className="ml-1">More</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
