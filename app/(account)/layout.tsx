import type { Metadata } from "next";
import { AppShell } from "@/components/app-shell";
import { getProfile } from "@/lib/data";

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function AccountLayout({ children }: { children: React.ReactNode }) {
  const user = await getProfile();
  return <AppShell user={user ?? undefined}>{children}</AppShell>;
}
