import { NextResponse } from "next/server";
import { unstable_rethrow } from "next/navigation";
import { getQuestionPage } from "@/lib/data";
import { normalizeQuestionFilters } from "@/lib/question-library";

export async function GET(request: Request) {
  try {
    const filters = normalizeQuestionFilters(Object.fromEntries(new URL(request.url).searchParams));
    return NextResponse.json(await getQuestionPage(filters), { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    unstable_rethrow(error);
    console.error("Question library could not be loaded", error);
    return NextResponse.json({ error: "Questions could not be loaded. Please try again." }, { status: 503, headers: { "Cache-Control": "private, no-store" } });
  }
}
