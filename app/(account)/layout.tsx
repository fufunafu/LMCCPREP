import type { Metadata } from "next";
import { AppShell } from "@/components/app-shell";
import { getProfile } from "@/lib/data";
import { isDemoSession } from "@/lib/demo-session";

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function AccountLayout({ children }: { children: React.ReactNode }) {
  const [user, demo] = await Promise.all([getProfile(), isDemoSession()]);
  return <AppShell user={user ?? undefined} demo={demo}>{children}</AppShell>;
}
