import { studyDownloadPage } from "@/lib/study-server";
import { studyReadError } from "@/lib/study-errors";
export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    return Response.json(await studyDownloadPage(params.get("kind") ?? "", params.get("cursor") ?? undefined), { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return studyReadError(error); }
}
