import type { Metadata } from "next";
import { CreateSession } from "@/components/create-session";
import { getCurrentExam, getSubjects, getTopics } from "@/lib/data";

export const metadata: Metadata = { title: "Create session" };

export default async function CreatePage() {
  const [subjects, topics, exam] = await Promise.all([getSubjects(), getTopics(), getCurrentExam()]);
  return <CreateSession subjects={subjects} topics={topics} exam={exam} />;
}
