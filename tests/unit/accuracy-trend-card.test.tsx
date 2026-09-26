import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AccuracyTrendCard } from "@/components/accuracy-trend-card";
import type { DailyActivity } from "@/lib/types";

describe("dashboard accuracy trend", () => {
  it("distinguishes an inactive day from attempts with no correct answers", () => {
    const html = renderToStaticMarkup(<AccuracyTrendCard activity={[
      { date: "2026-09-23", attempted: 0, correct: 0 },
      { date: "2026-09-24", attempted: 4, correct: 0 },
      { date: "2026-09-25", attempted: 1, correct: 1 },
    ]} />);
    expect(html).toContain("<td>2026-09-23</td><td>0</td><td>No attempts</td>");
    expect(html).toContain("<td>2026-09-24</td><td>4</td><td>0%</td>");
    expect(html).toContain("20% this period");
  });

  it("calculates the summary using only the displayed 28 days", () => {
    const activity: DailyActivity[] = Array.from({ length: 29 }, (_, index) => ({
      date: new Date(Date.UTC(2026, 8, index + 1)).toISOString().slice(0, 10),
      attempted: index === 0 ? 100 : index === 28 ? 4 : 0,
      correct: index === 0 ? 100 : index === 28 ? 1 : 0,
    }));
    const html = renderToStaticMarkup(<AccuracyTrendCard activity={activity} />);
    expect(html).toContain("25% this period");
    expect(html).not.toContain("<td>2026-09-01</td>");
    expect(html).toContain("<td>2026-09-02</td>");
  });

  it("shows an empty state instead of a zero accuracy chart without attempts", () => {
    const html = renderToStaticMarkup(<AccuracyTrendCard activity={[{ date: "2026-09-25", attempted: 0, correct: 0 }]} />);
    expect(html).toContain("No attempts in the last 28 days");
    expect(html).not.toContain("% this period");
    expect(html).not.toContain("recharts-responsive-container");
  });
});
