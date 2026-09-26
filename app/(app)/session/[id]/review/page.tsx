import type { Metadata } from "next";
import { Suspense } from "react";
import { StudySession } from "@/components/study-session";
export const metadata: Metadata = { title: "Session review" };
export default async function ReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <Suspense><StudySession id={id} review /></Suspense>;
}
