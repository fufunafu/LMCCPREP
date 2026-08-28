import type { Metadata } from "next";
import { AppShell } from "@/components/app-shell";
import { getProfile } from "@/lib/data";
import { getBillingSummary, isBillingRequired } from "@/lib/billing";
import { redirect } from "next/navigation";
import { isDemoSession } from "@/lib/demo-session";
import { isAdmin } from "@/lib/admin";
import { getMyTutor } from "@/lib/coaching";

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function PrivateLayout({ children }: { children: React.ReactNode }) {
  const required = await isBillingRequired();
  const [user, billing, demo, admin, tutor] = await Promise.all([
    getProfile(),
    required ? getBillingSummary() : Promise.resolve(null),
    isDemoSession(),
    isAdmin(),
    getMyTutor(),
  ]);
  if (billing && !billing.hasAccess) redirect("/billing?notice=subscription-required");
  return <AppShell user={user ?? undefined} demo={demo} admin={admin} tutor={Boolean(tutor)}>{children}</AppShell>;
}
