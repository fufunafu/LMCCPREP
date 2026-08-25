import type { Metadata } from "next";
import { StatsView } from "@/components/stats-view";
import { getDashboardStats, getFlaggedQuestions, getSubjects, getTopics, getTopicStats } from "@/lib/data";

export const metadata: Metadata = { title: "Statistics" };

export default async function StatsPage() {
  const [subjects, topics, stats, dashboard, flagged] = await Promise.all([getSubjects(), getTopics(), getTopicStats(), getDashboardStats(), getFlaggedQuestions()]);
  return <StatsView subjects={subjects} topics={topics} stats={stats} activity={dashboard.activity} flagged={flagged} />;
}
