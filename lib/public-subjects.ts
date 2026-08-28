import type { Subject } from "@/lib/types";

type PublicSubjectRow = { id: string; name: string; question_count: number };
type ExamRow = { id: string; sort: number };
type Fetch = typeof fetch;

/** Public exam labels for marketing surfaces (the exams table is anon-readable, but labels stay stable here). */
export const PUBLIC_EXAM_LABELS: Record<string, string> = {
  mccqe: "MCCQE Part I",
  usmle: "USMLE Step 1 and Step 2 CK",
};

/**
 * Approved public subject counts for every exam, via anonymous aggregate RPCs.
 * Each exam is fetched separately so one failing exam cannot leak partial data
 * as if it were complete: any failure rejects the whole call (fail closed).
 */
export async function fetchApprovedPublicSubjects(
  supabaseUrl: string,
  anonymousKey: string,
  fetcher: Fetch = fetch,
): Promise<Subject[]> {
  const headers = { apikey: anonymousKey, Authorization: `Bearer ${anonymousKey}` };
  const cache = { next: { revalidate: 3600, tags: ["public-subject-counts"] } };
  const examsResponse = await fetcher(`${supabaseUrl}/rest/v1/exams?select=id,sort&order=sort.asc`, { headers, ...cache });
  if (!examsResponse.ok) throw new Error(`Public catalog request failed with status ${examsResponse.status}.`);
  const exams = await examsResponse.json() as ExamRow[];
  const subjects: Subject[] = [];
  for (const exam of exams) {
    const response = await fetcher(`${supabaseUrl}/rest/v1/rpc/get_approved_public_subject_counts_for_exam`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ p_exam: exam.id }),
      ...cache,
    });
    if (!response.ok) throw new Error(`Public catalog request failed with status ${response.status}.`);
    const rows = await response.json() as PublicSubjectRow[];
    subjects.push(...rows.map((row) => ({ id: row.id, name: row.name, questionCount: row.question_count, examId: exam.id })));
  }
  return subjects;
}
