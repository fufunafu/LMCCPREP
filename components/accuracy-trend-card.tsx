"use client";

import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { DailyActivity } from "@/lib/types";

const dateLabel = new Intl.DateTimeFormat("en-CA", { month: "short", day: "numeric", timeZone: "UTC" });
const formatDate = (date: string) => dateLabel.format(new Date(`${date}T12:00:00Z`));

export function AccuracyTrendCard({ activity }: { activity: DailyActivity[] }) {
  const days = activity.slice(-28).map((day) => ({
    ...day,
    accuracy: day.attempted ? Math.round((day.correct / day.attempted) * 100) : null,
  }));
  const attempted = days.reduce((sum, day) => sum + day.attempted, 0);
  const correct = days.reduce((sum, day) => sum + day.correct, 0);
  const ticks = days.filter((_, index) => index === 0 || index === Math.floor((days.length - 1) / 2) || index === days.length - 1).map((day) => day.date);

  return (
    <Card className="min-w-0 sm:col-span-2 xl:col-span-3">
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2">
        <div>
          <CardTitle className="text-base">Accuracy trend</CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">Last 28 days · Gaps mean no attempts</p>
        </div>
        {attempted > 0 && <Badge variant="secondary">{Math.round(correct / attempted * 100)}% this period</Badge>}
      </CardHeader>
      <CardContent>
        {attempted > 0 ? (
          <div aria-hidden="true" className="h-[156px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart accessibilityLayer={false} data={days} margin={{ top: 8, right: 18, bottom: 0, left: 0 }}>
                <defs><linearGradient id="accuracyTrendFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#10b981" stopOpacity={0.2} /><stop offset="100%" stopColor="#10b981" stopOpacity={0.02} /></linearGradient></defs>
                <CartesianGrid vertical={false} stroke="var(--muted-foreground)" strokeOpacity={0.15} strokeDasharray="3 4" />
                <XAxis dataKey="date" ticks={ticks} tickFormatter={formatDate} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} tickMargin={10} height={30} interval="preserveStartEnd" padding={{ left: 5, right: 5 }} />
                <YAxis domain={[0, 100]} ticks={[0, 50, 100]} tickFormatter={(value) => `${value}%`} tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} width={36} />
                <Tooltip filterNull={false} content={({ active, payload }) => {
                  const day = payload?.[0]?.payload as (typeof days)[number] | undefined;
                  if (!active || !day) return null;
                  return <div className="rounded-lg border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md"><p className="font-medium">{formatDate(day.date)}</p><p className="mt-1">{day.accuracy === null ? "No attempts" : `${day.accuracy}% accuracy`}</p>{day.attempted > 0 && <p className="mt-0.5 text-muted-foreground">{day.correct} correct of {day.attempted} attempted</p>}</div>;
                }} />
                <Area type="linear" dataKey="accuracy" connectNulls={false} stroke="#059669" fill="url(#accuracyTrendFill)" strokeWidth={2} dot={{ r: 3, fill: "#059669", stroke: "var(--card)", strokeWidth: 1.5 }} activeDot={{ r: 5 }} isAnimationActive={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="flex h-[156px] flex-col items-center justify-center gap-1 rounded-lg bg-muted/40 px-4 text-center">
            <p className="text-sm font-medium">No attempts in the last 28 days</p>
            <p className="text-xs text-muted-foreground">Complete a practice question to start your trend.</p>
          </div>
        )}
        <table className="sr-only">
          <caption>Daily accuracy for the last 28 calendar days</caption>
          <thead><tr><th>Date</th><th>Attempted</th><th>Accuracy</th></tr></thead>
          <tbody>{days.map((day) => <tr key={day.date}><td>{day.date}</td><td>{day.attempted}</td><td>{day.accuracy === null ? "No attempts" : `${day.accuracy}%`}</td></tr>)}</tbody>
        </table>
      </CardContent>
    </Card>
  );
}
