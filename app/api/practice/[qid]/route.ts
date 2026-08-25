import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getQuestions } from "@/lib/data";
import { isDemoSession } from "@/lib/demo-session";

/** GET /api/practice/:qid?review=1 opens a single question in a one-question tutor session. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ qid: string }> }) {
  const { qid } = await params;
  if (await isDemoSession()) {
    const questions = await getQuestions();
    const index = Math.max(0, questions.findIndex((question) => String(question.qid) === qid));
    return NextResponse.redirect(new URL(`/session/demo?q=${index + 1}`, request.url));
  }
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims.sub;
  if (!userId) return NextResponse.redirect(new URL("/login", request.url));

  const { data: session, error } = await supabase
    .from("sessions")
    .insert({ user_id: userId, mode: "tutor", question_ids: [Number(qid)], filters: { single: true } })
    .select("id")
    .single();
  if (error || !session) return NextResponse.redirect(new URL("/questions", request.url));

  const url = new URL(`/session/${session.id}`, request.url);
  if (request.nextUrl.searchParams.get("review") === "1") url.searchParams.set("review", "1");
  return NextResponse.redirect(url);
}
