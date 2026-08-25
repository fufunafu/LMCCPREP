import type { Metadata } from "next";
import { SettingsView } from "@/components/settings-view";
import { getProfile } from "@/lib/data";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const profile = await getProfile();
  return <SettingsView profile={profile ?? undefined} />;
}
