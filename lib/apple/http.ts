import { ApplePurchaseError } from "./entitlement";
export const privateHeaders = { "Cache-Control": "no-store" };
export async function signedBody(request: Request, field: string) {
  // Bound the stream, including chunked requests without Content-Length.
  const reader = request.body?.getReader();
  if (!reader) throw new ApplePurchaseError("Missing request body.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 40_000) { await reader.cancel(); throw new ApplePurchaseError("Request too large.", 413); }
    chunks.push(value);
  }
  try {
    const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (typeof body[field] !== "string") throw new Error();
    return body[field] as string;
  } catch { throw new ApplePurchaseError("Invalid request body."); }
}
export function appleErrorResponse(error: unknown) {
  const status = error instanceof ApplePurchaseError ? error.status : 503;
  // Never echo signed transactions, bearer tokens or Apple's raw errors.
  return Response.json({ error: error instanceof ApplePurchaseError ? error.message : "Apple purchase verification is temporarily unavailable. Please try again." }, { status, headers: privateHeaders });
}
