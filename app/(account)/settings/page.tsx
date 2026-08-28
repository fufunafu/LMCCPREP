import type { Metadata } from "next";
import { SettingsView } from "@/components/settings-view";
import { getExams, getProfile } from "@/lib/data";
import { getBillingSummary } from "@/lib/billing";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const [profile, billing, exams] = await Promise.all([getProfile(), getBillingSummary(), getExams()]);
  return <SettingsView profile={profile ?? undefined} billing={billing} exams={exams} />;
}
