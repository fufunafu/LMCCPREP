import { syncStudyOperation } from "@/lib/study-server";
import { StudyConflictError } from "@/lib/study-errors";
export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin || origin !== new URL(request.url).origin) return Response.json({ error: "Invalid origin." }, { status: 403 });
  try {
    const text = await request.text();
    if (text.length > 100_000) return Response.json({ error: "Study update is too large." }, { status: 413 });
    const input = JSON.parse(text);
    if (typeof input.userId !== "string" || typeof input.examId !== "string") throw new Error("Invalid account.");
    await syncStudyOperation(input.userId, input.examId, input.operation);
    return Response.json({ ok: true }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    const conflict = error instanceof StudyConflictError;
    return Response.json({ error: error instanceof Error ? error.message : "Could not sync study data.", ...(conflict ? { code: "study_conflict" } : {}) }, { status: conflict ? 409 : error instanceof SyntaxError ? 400 : 503, headers: { "Cache-Control": "private, no-store" } });
  }
}
