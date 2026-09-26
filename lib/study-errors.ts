import "server-only";
import { SubscriptionRequiredError } from "@/lib/billing";

export class StudyConflictError extends Error {}

export function studyReadError(error: unknown) {
  const denied = error instanceof SubscriptionRequiredError;
  return Response.json({ error: denied ? "Your study access has ended. Sign in online to check your subscription." : "Study data is temporarily unavailable. Try again; your saved work is kept." }, {
    status: denied ? 403 : 503, headers: { "Cache-Control": "private, no-store" },
  });
}
