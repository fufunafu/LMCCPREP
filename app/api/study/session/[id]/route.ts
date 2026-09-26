import { createClient } from "@/lib/supabase/server";
import { requireEntitledUserId } from "@/lib/billing";
import { getCurrentExam } from "@/lib/data-supabase";
import { readSessionFilters } from "@/lib/study-server";
import { studyReadError } from "@/lib/study-errors";
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const userId = await requireEntitledUserId();
    const { id } = await params;
    const client = await createClient();
    const [exam, row, history] = await Promise.all([
      getCurrentExam(),
      client.from("sessions").select("id,mode,question_ids,seconds_per_question,current_index,created_at,finished_at,filters,deleted_at").eq("id", id).eq("user_id", userId).maybeSingle(),
      client.from("attempts").select("qid,session_id,chosen_index,correct,time_ms,created_at").eq("session_id", id).eq("user_id", userId).order("created_at"),
    ]);
    if (row.error || history.error || !exam) throw new Error("Session could not be loaded.");
    const removedAt = row.data?.deleted_at;
    if ((!row.data || removedAt) && new URL(request.url).searchParams.get("resolve") !== "1") return Response.json({ error: "This session is unavailable for the current account." }, { status: 404 });
    const s = removedAt ? null : row.data;
    const session = s ? { id: s.id, mode: s.mode, questionIds: s.question_ids.map(String), secondsPerQuestion: s.seconds_per_question ?? undefined, currentIndex: s.current_index, cursor: s.current_index ?? 0, createdAt: s.created_at, finishedAt: s.finished_at ?? undefined, starts: {}, eliminated: {}, filters: readSessionFilters(s.filters) } : null;
    const attempts = (history.data ?? []).map((a) => ({ questionId: String(a.qid), sessionId: a.session_id, chosenIdx: a.chosen_index, correct: a.correct, timeMs: a.time_ms, createdAt: a.created_at }));
    return Response.json({ userId, examId: exam.id, session, attempts, removedAt }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return studyReadError(error); }
}
