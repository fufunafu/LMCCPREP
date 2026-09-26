import type { Metadata } from "next";
import { Suspense } from "react";
import { OfflineStudyWorkspace } from "@/components/offline-study-workspace";
export const metadata: Metadata = { title: "Saved study workspace", robots: { index: false, follow: false } };
export default function OfflinePage() { return <Suspense><OfflineStudyWorkspace /></Suspense>; }
