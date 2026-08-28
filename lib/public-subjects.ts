import type { Subject } from "@/lib/types";

type PublicSubjectRow = { id: string; name: string; question_count: number };
type Fetch = typeof fetch;

export async function fetchApprovedPublicSubjects(
  supabaseUrl: string,
  anonymousKey: string,
  fetcher: Fetch = fetch,
): Promise<Subject[]> {
  const response = await fetcher(`${supabaseUrl}/rest/v1/rpc/get_approved_public_subject_counts`, {
    headers: { apikey: anonymousKey, Authorization: `Bearer ${anonymousKey}` },
    next: { revalidate: 3600, tags: ["public-subject-counts"] },
  });
  if (!response.ok) throw new Error(`Public catalog request failed with status ${response.status}.`);
  const data = await response.json() as PublicSubjectRow[];
  return data.map((row) => ({ id: row.id, name: row.name, questionCount: row.question_count, examId: "mccqe" }));
}
