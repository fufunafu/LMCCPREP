import { createAdminClient } from "@/lib/supabase/admin";
import { synchronizePurchase } from "@/lib/apple/server";
import { appleErrorResponse, privateHeaders, signedBody } from "@/lib/apple/http";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    const bearer = request.headers.get("authorization")?.match(/^Bearer (\S+)$/i)?.[1];
    if (!bearer) return Response.json({ error: "Sign in to restore this purchase." }, { status: 401, headers: privateHeaders });
    const { data, error } = await createAdminClient().auth.getUser(bearer);
    if (error || !data.user) return Response.json({ error: "Your session expired. Sign in again." }, { status: 401, headers: privateHeaders });
    await synchronizePurchase(await signedBody(request, "signedTransaction"), data.user.id);
    return Response.json({ verified: true }, { headers: privateHeaders });
  } catch (error) { return appleErrorResponse(error); }
}
