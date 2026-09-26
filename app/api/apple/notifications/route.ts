import { processNotification } from "@/lib/apple/server";
import { appleErrorResponse, privateHeaders, signedBody } from "@/lib/apple/http";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    await processNotification(await signedBody(request, "signedPayload"));
    return Response.json({ received: true }, { headers: privateHeaders });
  } catch (error) { return appleErrorResponse(error); }
}
