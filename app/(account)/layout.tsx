import type { Metadata } from "next";
import { AppShell } from "@/components/app-shell";
import { getExams, getProfile } from "@/lib/data";
import { isDemoSession } from "@/lib/demo-session";
import { isAdmin } from "@/lib/admin";
import { getMyTutor } from "@/lib/coaching";

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function AccountLayout({ children }: { children: React.ReactNode }) {
  const [user, demo, admin, tutor, exams] = await Promise.all([getProfile(), isDemoSession(), isAdmin(), getMyTutor(), getExams()]);
  return <AppShell user={user ?? undefined} demo={demo} admin={admin} tutor={Boolean(tutor)} exams={exams} currentExamId={user?.examId ?? ""}>{children}</AppShell>;
}
