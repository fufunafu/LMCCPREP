import type { Question } from "@/lib/types";

/** A block of the long explanation, formatted for reading. */
export type ExplanationBlock =
  | { type: "heading"; text: string }
  | { type: "paragraph"; text: string }
  | { type: "bullets"; items: string[] };

export type OptionVerdict = { index: number; isCorrect: boolean; text?: string };

export type ExplanationContent = {
  /** Short, always-visible summary (1 to 3 points). */
  short: string[];
  /** Why the learner's own (wrong) choice was wrong, when the bank knows. */
  yourAnswer?: string;
  /** The full explanation, formatted. */
  fullBlocks: ExplanationBlock[];
  /** Per-option verdicts in option order (text absent when the bank has none). */
  optionVerdicts: OptionVerdict[];
};

const ANSWER_RESTATEMENT = /^(the )?(correct|best) answer is\b/iu;
const VERDICT_PREFIX = /^(in)?correct[^.]*\.\s*/iu;
const OCR_MARKERS = /(^|\s)--\s?p(?=\s)/gu;

function squash(value: string) {
  return value.replace(/\s+/gu, " ").trim();
}

export function normalizeExplanationKey(value: string) {
  return value.normalize("NFKC").toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

/** Inline segments for rendering markdown-style **bold** without a markdown engine. */
export type InlineSegment = { bold: boolean; text: string };

export function parseInline(value: string): InlineSegment[] {
  const segments: InlineSegment[] = [];
  const pattern = /\*\*([^*]+)\*\*/gu;
  let cursor = 0;
  for (const match of value.matchAll(pattern)) {
    if (match.index > cursor) segments.push({ bold: false, text: value.slice(cursor, match.index) });
    segments.push({ bold: true, text: match[1] });
    cursor = match.index + match[0].length;
  }
  if (cursor < value.length) segments.push({ bold: false, text: value.slice(cursor) });
  return segments.length ? segments : [{ bold: false, text: value }];
}

const LIST_MARKER = /(?:^|\n|\s)-\s+(?=\S)/gu;

/** Split markdown-style "- item" runs into items; null when the text is not a list. */
export function splitListItems(value: string): string[] | null {
  const markers = [...value.matchAll(LIST_MARKER)];
  if (markers.length < 2 && !(markers.length === 1 && /^\s*-\s/u.test(value))) return null;
  const items = value
    .split(LIST_MARKER)
    .map((item) => squash(item))
    .filter(Boolean);
  return items.length >= 2 ? items : null;
}

/** Split prose into sentences, keeping terminal punctuation. */
export function splitSentences(value: string) {
  return squash(value).split(/(?<=[.!?])\s+(?=[A-Z0-9("])/u).map((part) => part.trim()).filter(Boolean);
}

/** Remove the "Incorrect." style prefix and any sentence that just restates the answer. */
export function cleanVerdict(value: string | undefined) {
  if (!value) return undefined;
  const withoutPrefix = squash(value).replace(VERDICT_PREFIX, "");
  const kept = splitSentences(withoutPrefix).filter((sentence) => !ANSWER_RESTATEMENT.test(sentence));
  const text = kept.join(" ").trim();
  return text.length >= 12 ? text : undefined;
}

/** A one-sentence paragraph that only names the answer adds nothing to the reasoning. */
function isAnswerRestatement(paragraph: string, answerText: string) {
  const sentences = splitSentences(paragraph);
  if (sentences.length !== 1) return false;
  const key = normalizeExplanationKey(paragraph);
  const answer = normalizeExplanationKey(answerText);
  return ANSWER_RESTATEMENT.test(paragraph)
    || /\bis the (best|correct) answer$/u.test(key)
    || key === `correct answer ${answer}`;
}

/** Turn one raw paragraph (possibly OCR-flattened with inline bullet glyphs) into blocks. */
export function formatParagraph(raw: string): ExplanationBlock[] {
  // Markdown-style "- item" runs become a bullet list before any OCR handling.
  const firstMarker = raw.search(LIST_MARKER);
  const listItems = firstMarker >= 0 ? splitListItems(raw.slice(firstMarker)) : null;
  if (listItems) {
    const lead = squash(raw.slice(0, firstMarker));
    const blocks: ExplanationBlock[] = [];
    if (lead) blocks.push(lead.length < 80 && lead.endsWith(":") ? { type: "heading", text: lead } : { type: "paragraph", text: lead });
    blocks.push({ type: "bullets", items: listItems });
    return blocks;
  }
  let text = squash(raw.replace(OCR_MARKERS, " "));
  if (!text) return [];
  const bulletSplit = text.split(/\s*(?:•|•|\s[o●▪]\s(?=[A-Z0-9]))\s*/u).map((part) => part.trim()).filter(Boolean);
  const bulletCount = (text.match(/•|\s[o●▪]\s(?=[A-Z0-9])/gu) ?? []).length;
  if (bulletCount >= 2 && bulletSplit.length >= 3) {
    const [lead, ...items] = text.startsWith("•") || /^\s?[o●▪]\s/u.test(text) ? ["", ...bulletSplit] : bulletSplit;
    const blocks: ExplanationBlock[] = [];
    if (lead) blocks.push(lead.length < 80 && lead.endsWith(":") ? { type: "heading", text: lead } : { type: "paragraph", text: lead });
    blocks.push({ type: "bullets", items: items.map((item) => item.replace(/^\s?e\s(?=[A-Z])/u, "")) });
    return blocks;
  }
  text = text.replace(/^\s?[o●▪]\s/u, "");
  if (text.length < 80 && text.endsWith(":")) return [{ type: "heading", text }];
  return [{ type: "paragraph", text }];
}

export function buildExplanationContent(question: Pick<Question, "options" | "answerIdx" | "explanation" | "keyPoints" | "optionExplanations">, chosenIndex: number | null | undefined): ExplanationContent {
  const answerText = question.options[question.answerIdx] ?? "";
  const seen = new Set<string>();
  const paragraphs = question.explanation
    .map(squash)
    .filter((paragraph) => {
      if (!paragraph || isAnswerRestatement(paragraph, answerText)) return false;
      const key = normalizeExplanationKey(paragraph);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

  const rawKeyPoints = question.keyPoints ?? "";
  const keyPoints = rawKeyPoints
    ? (splitListItems(rawKeyPoints) ?? splitSentences(rawKeyPoints).slice(0, 3)).slice(0, 5)
    : [];
  const short = keyPoints.length
    ? keyPoints
    : splitSentences(paragraphs[0] ?? "").slice(0, 2).filter(Boolean);
  if (!short.length) short.push(answerText ? `The findings in the stem best support ${answerText}.` : "Review the correct answer and its key clinical clue.");

  const verdicts = question.optionExplanations ?? {};
  const wrongChoice = chosenIndex != null && chosenIndex !== question.answerIdx;
  const yourAnswer = wrongChoice ? cleanVerdict(verdicts[String(chosenIndex)]) : undefined;

  return {
    short,
    yourAnswer,
    fullBlocks: paragraphs.flatMap(formatParagraph),
    optionVerdicts: question.options.map((_, index) => ({
      index,
      isCorrect: index === question.answerIdx,
      text: cleanVerdict(verdicts[String(index)]),
    })),
  };
}
