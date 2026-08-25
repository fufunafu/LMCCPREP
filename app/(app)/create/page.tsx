import type { Metadata } from "next";
import { CreateSession } from "@/components/create-session";
import { getSubjects, getTopics } from "@/lib/data";

export const metadata: Metadata = { title: "Create session" };

export default async function CreatePage() {
  const [subjects, topics] = await Promise.all([getSubjects(), getTopics()]);
  return <CreateSession subjects={subjects} topics={topics} />;
}
