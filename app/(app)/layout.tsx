import type { Metadata } from "next";
import { AppShell } from "@/components/app-shell";
import { getProfile } from "@/lib/data";
import { getBillingSummary, isBillingRequired } from "@/lib/billing";
import { redirect } from "next/navigation";

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function PrivateLayout({ children }: { children: React.ReactNode }) {
  const required = await isBillingRequired();
  const [user, billing] = await Promise.all([
    getProfile(),
    required ? getBillingSummary() : Promise.resolve(null),
  ]);
  if (billing && !billing.hasAccess) redirect("/billing?notice=subscription-required");
  return <AppShell user={user ?? undefined}>{children}</AppShell>;
}
