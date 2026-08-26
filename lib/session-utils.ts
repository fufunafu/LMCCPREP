/**
 * Resolves the zero-based question index a session should open on.
 * `q` is the 1-based `?q=` search param; when it is missing or not a finite
 * integer, the session's saved `currentIndex` wins. The result is always clamped
 * to `[0, questionCount - 1]`.
 */
export function resolveInitialIndex(q: string | null | undefined, session: { currentIndex?: number }, questionCount: number) {
  const last = Math.max(0, questionCount - 1);
  const parsed = q == null ? Number.NaN : Number.parseInt(q, 10);
  const fromQuery = Number.isFinite(parsed) ? parsed - 1 : Number.NaN;
  const fallback = Number.isInteger(session.currentIndex) ? (session.currentIndex as number) : 0;
  const candidate = Number.isFinite(fromQuery) ? fromQuery : fallback;
  return Math.max(0, Math.min(last, candidate));
}
