import type { Metadata } from "next";
import { DashboardView } from "@/components/dashboard-view";
import { getDashboardStats, getProfile, getRecentSessions, getSubjects, getTopics } from "@/lib/data";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const [stats, subjects, topics, recentSessions, profile] = await Promise.all([getDashboardStats(), getSubjects(), getTopics(), getRecentSessions(), getProfile()]);
  return <DashboardView stats={stats} subjects={subjects} topics={topics} recentSessions={recentSessions} userName={profile?.name} />;
}
