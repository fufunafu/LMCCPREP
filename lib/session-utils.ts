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

const EXPLANATION_PREVIEW_LIMIT = 120;

function normalizeExplanationText(value: string) {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function explanationPreview(value: string) {
  if (value.length <= EXPLANATION_PREVIEW_LIMIT) return value;

  const sentenceEnd = value.slice(0, EXPLANATION_PREVIEW_LIMIT + 1).search(/[.!?](?:\s|$)/u);
  if (sentenceEnd >= 40) return value.slice(0, sentenceEnd + 1).trim();

  const candidate = value.slice(0, EXPLANATION_PREVIEW_LIMIT + 1);
  const lastWordBreak = candidate.lastIndexOf(" ");
  const clipped = candidate.slice(0, lastWordBreak > 0 ? lastWordBreak : EXPLANATION_PREVIEW_LIMIT).trimEnd();
  return `${clipped}…`;
}

/**
 * Removes repeated explanation paragraphs and answer-only restatements, then
 * returns a phone-sized preview while preserving unique detail for expansion.
 */
export function prepareExplanation(paragraphs: string[], answerText: string) {
  const seen = new Set<string>();
  const unique = paragraphs
    .map((paragraph) => paragraph.replace(/\s+/gu, " ").trim())
    .filter((paragraph) => {
      if (!paragraph) return false;
      const normalized = normalizeExplanationText(paragraph);
      if (seen.has(normalized)) return false;
      seen.add(normalized);
      return true;
    });

  const normalizedAnswer = normalizeExplanationText(answerText);
  const rationale = unique.filter((paragraph) => {
    const normalized = normalizeExplanationText(paragraph);
    return normalized !== `the correct answer is ${normalizedAnswer}`
      && normalized !== `the correct answer is option ${normalizedAnswer}`
      && normalized !== `correct answer ${normalizedAnswer}`;
  });
  const full = rationale.length ? rationale : unique;
  const preview = explanationPreview(full[0] ?? "Review the correct answer and its key clinical clue.");

  return {
    preview,
    paragraphs: full,
    hasMore: full.length > 1 || preview !== full[0],
  };
}
