import { studySnapshot } from "@/lib/study-server";
import { studyReadError } from "@/lib/study-errors";
export async function GET() {
  try { return Response.json(await studySnapshot(true), { headers: { "Cache-Control": "private, no-store" } }); }
  catch (error) { return studyReadError(error); }
}
