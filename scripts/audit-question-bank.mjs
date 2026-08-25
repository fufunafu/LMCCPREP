#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import nextEnvironment from "@next/env";

const { loadEnvConfig } = nextEnvironment;

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const projectDirectory = resolve(scriptDirectory, "..");
const outputPath = resolve(projectDirectory, "audit-output", "question-bank-audit.json");
const reviewStatePath = resolve(projectDirectory, "audit-output", "question-reviews.json");

loadEnvConfig(projectDirectory);

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
}

const apiHeaders = {
  apikey: serviceRoleKey,
  Authorization: `Bearer ${serviceRoleKey}`,
};

const STOP_WORDS = new Set([
  "about", "after", "again", "against", "among", "because", "before", "being",
  "between", "could", "during", "following", "from", "have", "having", "into",
  "most", "other", "patient", "patients", "should", "than", "that", "their",
  "there", "these", "they", "this", "those", "through", "under", "very", "what",
  "when", "where", "which", "while", "with", "would", "year", "years",
]);

const OCR_PATTERNS = [
  ["replacement_character", /�/u],
  ["medicalstudyzone_artifact", /medicalstudyzone/i],
  ["broken_qbank_url", /(?:https?:\/fapp|canacla?qbank|oomtexaml|exam[_ ]ueer|categoty|toplc)/i],
  ["page_counter_artifact", /(?:…|\.{3})\s*\d{1,4}\s*[\/|]\s*\d{2,4}\b/u],
  ["broken_ellipsis_artifact", /…\s*\d{2,}/u],
  ["broken_word_with_dots", /\b[a-z]\.{2,}[a-z]/i],
  ["question_label_artifact", /\b(?:j\s*)?question\s+\d+\b/i],
];

function normalizeCompact(value) {
  return stripSourceArtifacts(value)
    .normalize("NFKC")
    .toLowerCase()
    .replace(/https?:\/\/\S+/gu, " ")
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

function normalizeWords(value) {
  return stripSourceArtifacts(value)
    .normalize("NFKC")
    .toLowerCase()
    .replace(/https?:\/\/\S+/gu, " ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .split(/\s+/u)
    .filter(Boolean);
}

function normalizeOption(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/×/gu, "*")
    .replace(/÷/gu, "/")
    .replace(/[^\p{L}\p{N}.+\-*/%=<>]+/gu, "");
}

function stripSourceArtifacts(value) {
  return String(value ?? "")
    .replace(/https?:\/f?app\.[^\s\n]*[^\n]*/giu, " ")
    .replace(/hupe:l\/app\.[^\s\n]*[^\n]*/giu, " ")
    .replace(/\b(?:medicalstudyzone|canadaqbank)\S*/giu, " ")
    .replace(/(?:…|\.{3})\s*\d{1,4}\s*[\/|]\s*\d{2,4}\b/gu, " ");
}

function distinctiveWords(value) {
  return new Set(
    normalizeWords(value).filter((word) => word.length >= 4 && !STOP_WORDS.has(word)),
  );
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

async function fetchAll(path, pageSize = 1000) {
  const rows = [];
  for (let start = 0; ; start += pageSize) {
    let response;
    for (let attempt = 1; attempt <= 4; attempt += 1) {
      response = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
        headers: {
          ...apiHeaders,
          Range: `${start}-${start + pageSize - 1}`,
          "Range-Unit": "items",
        },
      });
      if (response.ok || ![429, 500, 502, 503, 504].includes(response.status) || attempt === 4) break;
      await new Promise((resolveDelay) => setTimeout(resolveDelay, attempt * 750));
    }
    if (!response.ok) {
      throw new Error(`${path}: ${response.status} ${await response.text()}`);
    }
    const page = await response.json();
    rows.push(...page);
    if (page.length < pageSize) return rows;
  }
}

function addFlag(flags, code, severity, detail) {
  flags.push({ code, severity, detail });
}

function parseAnswerKeyOption(answerKey) {
  if (typeof answerKey !== "string") return null;
  const match = answerKey.match(/correct answer is\s*(?:\*{1,2})?\s*option\s*(\d+)/iu);
  return match ? Number(match[1]) - 1 : null;
}

function explanationText(question) {
  const parts = Array.isArray(question.explanation) ? question.explanation : [];
  const optionParts = question.option_explanations && typeof question.option_explanations === "object"
    ? Object.values(question.option_explanations)
    : [];
  return [...parts, question.answer_key, question.key_points, ...optionParts]
    .filter((value) => typeof value === "string")
    .join("\n");
}

function auditQuestion(question, imageCounts) {
  const flags = [];
  const options = Array.isArray(question.options) ? question.options : [];
  const answerIndex = question.answer_index;
  const explanation = Array.isArray(question.explanation) ? question.explanation : [];
  const tags = Array.isArray(question.tags) ? question.tags : [];

  if (typeof question.stem !== "string" || question.stem.trim().length < 12) {
    addFlag(flags, "invalid_or_short_stem", "error", "Stem is missing or unusually short.");
  }
  if (options.length < 2) {
    addFlag(flags, "too_few_options", "error", `Found ${options.length} answer options.`);
  }
  if (options.some((option) => typeof option !== "string" || !option.trim())) {
    addFlag(flags, "empty_option", "error", "At least one answer option is empty.");
  }
  const normalizedOptions = options.map(normalizeOption);
  if (new Set(normalizedOptions).size !== normalizedOptions.length) {
    addFlag(flags, "duplicate_options", "error", "Two or more answer options normalize to the same text.");
  }
  if (!Number.isInteger(answerIndex) || answerIndex < 0 || answerIndex >= options.length) {
    addFlag(flags, "invalid_answer_index", "error", `Answer index ${String(answerIndex)} is outside the options array.`);
  }
  if (!explanation.length || explanation.every((part) => typeof part !== "string" || !part.trim())) {
    addFlag(flags, "missing_explanation", "error", "No explanation is present.");
  }
  if (tags.length === 0) {
    addFlag(flags, "missing_search_tags", "error", "Question has no searchable tags.");
  }
  const normalizedTags = tags.map((tag) => String(tag).trim().toLowerCase()).filter(Boolean);
  if (normalizedTags.length !== tags.length || new Set(normalizedTags).size !== normalizedTags.length) {
    addFlag(flags, "invalid_or_duplicate_search_tags", "warning", "Tags are blank, duplicated, or not normalized.");
  }
  if (normalizedTags.length < 2) {
    addFlag(flags, "insufficient_search_tags", "warning", "Question has fewer than two searchable tags.");
  }

  const parsedAnswerKeyOption = parseAnswerKeyOption(question.answer_key);
  if (parsedAnswerKeyOption !== null && parsedAnswerKeyOption !== answerIndex) {
    addFlag(
      flags,
      "answer_key_index_mismatch",
      "error",
      `Answer key names option ${parsedAnswerKeyOption + 1}, but answer_index is ${answerIndex + 1}.`,
    );
  }

  if (question.source === "qbankmd") {
    if (!question.answer_key?.trim()) {
      addFlag(flags, "missing_qbank_answer_key", "error", "QBank record has no answer key.");
    }
    if (!question.key_points?.trim()) {
      addFlag(flags, "missing_qbank_key_points", "warning", "QBank record has no key points.");
    }
    const optionExplanationKeys = question.option_explanations && typeof question.option_explanations === "object"
      ? Object.keys(question.option_explanations)
      : [];
    if (optionExplanationKeys.length !== options.length) {
      addFlag(
        flags,
        "incomplete_option_explanations",
        "warning",
        `Found ${optionExplanationKeys.length} option explanations for ${options.length} options.`,
      );
    }
  }

  if (Number.isInteger(answerIndex) && answerIndex >= 0 && answerIndex < options.length) {
    const correctOptionWords = distinctiveWords(options[answerIndex]);
    const rationaleWords = distinctiveWords(explanationText(question));
    const supportedWords = [...correctOptionWords].filter((word) => rationaleWords.has(word));
    if (correctOptionWords.size > 0 && supportedWords.length === 0 && parsedAnswerKeyOption === null) {
      addFlag(
        flags,
        "answer_text_not_echoed_in_rationale",
        "review",
        "The rationale does not reuse any distinctive word from the keyed option.",
      );
    }
  }

  const searchableText = [question.stem, ...options, ...explanation].join("\n");
  for (const [code, pattern] of OCR_PATTERNS) {
    if (pattern.test(searchableText)) {
      addFlag(flags, code, "warning", "Possible OCR or source-page artifact detected.");
    }
  }

  const imageCount = imageCounts.get(question.qid) ?? 0;
  if (question.has_figure && !question.figure_url && imageCount === 0) {
    addFlag(flags, "missing_figure_asset", "error", "Question requires a figure but no figure asset is available.");
  }
  if (!question.has_figure && (question.figure_url || imageCount > 0)) {
    addFlag(flags, "figure_metadata_mismatch", "warning", "Figure asset exists while has_figure is false.");
  }
  if (question.needs_review) {
    addFlag(flags, "source_marked_for_review", "review", question.review_note || "Source record is marked for review.");
  }

  const contentFingerprint = sha256(
    `${normalizeCompact(question.stem)}|${options.map(normalizeCompact).join("|")}`,
  );

  return {
    qid: question.qid,
    source: question.source,
    subject_id: question.subject_id,
    topic_id: question.topic_id,
    qbank_question_id: question.qbank_question_id,
    content_fingerprint: contentFingerprint,
    flags,
  };
}

function trigramSet(value) {
  const normalized = normalizeCompact(value);
  const padded = `  ${normalized}  `;
  const output = new Set();
  for (let index = 0; index <= padded.length - 3; index += 1) {
    output.add(padded.slice(index, index + 3));
  }
  return output;
}

function diceCoefficient(left, right) {
  if (!left.size && !right.size) return 1;
  let common = 0;
  const smaller = left.size <= right.size ? left : right;
  const larger = left.size <= right.size ? right : left;
  for (const value of smaller) {
    if (larger.has(value)) common += 1;
  }
  return (2 * common) / (left.size + right.size);
}

function jaccardCoefficient(left, right) {
  if (!left.size && !right.size) return 1;
  let common = 0;
  for (const value of left) {
    if (right.has(value)) common += 1;
  }
  return common / (left.size + right.size - common);
}

function findNearDuplicates(questions) {
  const tokenSets = new Map();
  const tokenFrequency = new Map();
  const inverted = new Map();
  const questionById = new Map(questions.map((question) => [question.qid, question]));

  for (const question of questions) {
    const tokens = distinctiveWords(question.stem);
    tokenSets.set(question.qid, tokens);
    for (const token of tokens) {
      tokenFrequency.set(token, (tokenFrequency.get(token) ?? 0) + 1);
      const ids = inverted.get(token) ?? [];
      ids.push(question.qid);
      inverted.set(token, ids);
    }
  }

  const trigramCache = new Map();
  const pairs = [];
  const seenPairs = new Set();

  for (const question of questions) {
    const tokens = tokenSets.get(question.qid);
    const rareTokens = [...tokens]
      .filter((token) => tokenFrequency.has(token))
      .sort((left, right) => tokenFrequency.get(left) - tokenFrequency.get(right))
      .slice(0, 20);
    const candidates = new Set(rareTokens.flatMap((token) => inverted.get(token) ?? []));

    for (const candidateId of candidates) {
      if (candidateId <= question.qid) continue;
      const pairKey = `${question.qid}:${candidateId}`;
      if (seenPairs.has(pairKey)) continue;
      seenPairs.add(pairKey);

      const candidate = questionById.get(candidateId);
      const leftTokens = tokens;
      const rightTokens = tokenSets.get(candidateId);
      const tokenSimilarity = jaccardCoefficient(leftTokens, rightTokens);
      if (tokenSimilarity < 0.62) continue;

      if (!trigramCache.has(question.qid)) trigramCache.set(question.qid, trigramSet(question.stem));
      if (!trigramCache.has(candidateId)) trigramCache.set(candidateId, trigramSet(candidate.stem));
      const characterSimilarity = diceCoefficient(
        trigramCache.get(question.qid),
        trigramCache.get(candidateId),
      );
      if (characterSimilarity < 0.72 && tokenSimilarity < 0.76) continue;

      const exactStem = normalizeCompact(question.stem) === normalizeCompact(candidate.stem);
      let classification = "possible";
      if (exactStem) classification = "exact_stem";
      else if (characterSimilarity >= 0.91 && tokenSimilarity >= 0.84) classification = "likely";

      pairs.push({
        left_qid: question.qid,
        right_qid: candidateId,
        left_source: question.source,
        right_source: candidate.source,
        classification,
        character_similarity: Number(characterSimilarity.toFixed(4)),
        token_similarity: Number(tokenSimilarity.toFixed(4)),
        left_stem: question.stem,
        right_stem: candidate.stem,
      });
    }
  }

  return pairs.sort((left, right) => {
    const leftScore = Math.max(left.character_similarity, left.token_similarity);
    const rightScore = Math.max(right.character_similarity, right.token_similarity);
    return rightScore - leftScore;
  });
}

const questionSelect = [
  "qid", "source", "subject_id", "topic_id", "stem", "options", "answer_index",
  "explanation", "has_figure", "figure_url", "source_pages", "needs_review",
  "review_note", "qbank_question_id", "answer_key", "key_points",
  "option_explanations", "references_text", "tags",
].join(",");

const [questions, imageRows] = await Promise.all([
  fetchAll(`questions?select=${questionSelect}&order=qid.asc`, 500),
  fetchAll("qbank_question_images?select=qid,image_index&order=qid.asc,image_index.asc"),
]);

const imageCounts = new Map();
for (const image of imageRows) {
  imageCounts.set(image.qid, (imageCounts.get(image.qid) ?? 0) + 1);
}

const questionAudits = questions.map((question) => auditQuestion(question, imageCounts));
const nearDuplicatePairs = findNearDuplicates(questions);
let reviewState = { schema_version: 1, reviews: [] };
try {
  reviewState = JSON.parse(await readFile(reviewStatePath, "utf8"));
} catch (error) {
  if (error?.code !== "ENOENT") throw error;
}
if (!Array.isArray(reviewState.reviews)) {
  throw new Error("audit-output/question-reviews.json must contain a reviews array.");
}
const auditByQuestionId = new Map(questionAudits.map((audit) => [audit.qid, audit]));
const resolvedReviewVerdicts = new Set(["pass", "corrected"]);
const latestReviewByQuestionId = new Map();
for (const review of reviewState.reviews) {
  const existing = latestReviewByQuestionId.get(review.qid);
  if (!existing || String(review.reviewed_at ?? "") > String(existing.reviewed_at ?? "")) {
    latestReviewByQuestionId.set(review.qid, review);
  }
}
const effectiveReviews = [];
const unresolvedReviews = [];
const staleReviews = [];
for (const review of latestReviewByQuestionId.values()) {
  const audit = auditByQuestionId.get(review.qid);
  if (!audit || review.content_fingerprint !== audit.content_fingerprint) {
    staleReviews.push(review);
  } else if (resolvedReviewVerdicts.has(review.verdict)) {
    effectiveReviews.push(review);
  } else {
    unresolvedReviews.push(review);
  }
}
const sourceCounts = Object.fromEntries(
  [...new Set(questions.map((question) => question.source))]
    .sort()
    .map((source) => [source, questions.filter((question) => question.source === source).length]),
);
const subjectCounts = Object.fromEntries(
  [...new Set(questions.map((question) => question.subject_id))]
    .sort()
    .map((subject) => [subject, questions.filter((question) => question.subject_id === subject).length]),
);
const flagCounts = {};
for (const audit of questionAudits) {
  for (const flag of audit.flags) {
    flagCounts[flag.code] = (flagCounts[flag.code] ?? 0) + 1;
  }
}

const report = {
  schema_version: 1,
  generated_at: new Date().toISOString(),
  database: {
    question_count: questions.length,
    source_counts: sourceCounts,
    subject_counts: subjectCounts,
    image_count: imageRows.length,
    unique_tag_count: new Set(questions.flatMap((question) => Array.isArray(question.tags) ? question.tags : [])).size,
  },
  deterministic_audit: {
    questions_with_flags: questionAudits.filter((audit) => audit.flags.length > 0).length,
    flag_counts: Object.fromEntries(Object.entries(flagCounts).sort()),
    near_duplicate_pair_count: nearDuplicatePairs.length,
    likely_or_exact_duplicate_pair_count: nearDuplicatePairs.filter(
      (pair) => pair.classification !== "possible",
    ).length,
  },
  questions: questionAudits,
  near_duplicate_pairs: nearDuplicatePairs,
  medical_review: {
    reviewed_question_count: effectiveReviews.length,
    pending_question_count: questions.length - effectiveReviews.length,
    unresolved_question_count: unresolvedReviews.length,
    stale_review_count: staleReviews.length,
    status: effectiveReviews.length === questions.length && unresolvedReviews.length === 0
      ? "complete"
      : "pending_full_review",
    effective_reviews: effectiveReviews,
    unresolved_reviews: unresolvedReviews,
    stale_reviews: staleReviews,
  },
};

await mkdir(dirname(outputPath), { recursive: true });
try {
  await readFile(reviewStatePath, "utf8");
} catch (error) {
  if (error?.code !== "ENOENT") throw error;
  await writeFile(reviewStatePath, `${JSON.stringify(reviewState, null, 2)}\n`, "utf8");
}
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

console.log(JSON.stringify({
  output: outputPath,
  database: report.database,
  deterministic_audit: report.deterministic_audit,
}, null, 2));
