import type { Metadata } from "next";
import { StatsView } from "@/components/stats-view";
import { normalizeQuestionFilters } from "@/lib/question-library";
import { getDashboardStats, getQuestionPage, getSubjects, getTopics, getTopicStats } from "@/lib/data";

export const metadata: Metadata = { title: "Statistics" };

export default async function StatsPage() {
  const [subjects, topics, stats, dashboard, flagged] = await Promise.all([getSubjects(), getTopics(), getTopicStats(), getDashboardStats(), getQuestionPage(normalizeQuestionFilters({ status: "flagged" }))]);
  return <StatsView subjects={subjects} topics={topics} stats={stats} activity={dashboard.activity} flagged={flagged.questions.map(({ id, qid, stem, topicId }) => ({ id, qid, stem, topicId }))} flaggedTotal={flagged.total} />;
}
