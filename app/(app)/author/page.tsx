import type { Metadata } from "next";
import { AuthorQuestion } from "@/components/author-question";
import { getSubjects } from "@/lib/data";

export const metadata: Metadata = { title: "Add a question" };

export default async function AuthorPage() {
  const subjects = await getSubjects();
  return <AuthorQuestion subjects={subjects} />;
}
