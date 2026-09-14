import type { Metadata } from "next";
import { AppShell } from "@/components/app-shell";
import { getExams, getProfile } from "@/lib/data";
import { requireEntitledUserId, SubscriptionRequiredError } from "@/lib/billing";
import { redirect } from "next/navigation";
import { isDemoSession } from "@/lib/demo-session";
import { isAdmin } from "@/lib/admin";
import { getMyTutor } from "@/lib/coaching";

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function PrivateLayout({ children }: { children: React.ReactNode }) {
  const [user, demo, admin, tutor, exams] = await Promise.all([
    getProfile(),
    isDemoSession(),
    isAdmin(),
    getMyTutor(),
    getExams(),
    verifyAccess(),
  ]);
  return <AppShell user={user ?? undefined} demo={demo} admin={admin} tutor={Boolean(tutor)} exams={exams} currentExamId={user?.examId ?? ""}>{children}</AppShell>;
}

async function verifyAccess() {
  if (await isDemoSession()) return;
  try {
    await requireEntitledUserId();
  } catch (error) {
    if (error instanceof SubscriptionRequiredError) redirect("/billing?notice=subscription-required");
    throw error;
  }
}
