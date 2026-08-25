#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const projectDirectory = resolve(scriptDirectory, "..");
const snapshotPath = resolve(projectDirectory, "audit-output", "question-review-snapshot.json");
const reviewStatePath = resolve(projectDirectory, "audit-output", "question-reviews.json");
const batchArgument = process.argv[2];
if (!batchArgument) {
  throw new Error("Usage: node scripts/merge-question-reviews.mjs <review-batch.json>");
}
const batchPath = resolve(process.cwd(), batchArgument);

const [snapshot, reviewState, batch] = await Promise.all([
  readFile(snapshotPath, "utf8").then(JSON.parse),
  readFile(reviewStatePath, "utf8").then(JSON.parse),
  readFile(batchPath, "utf8").then(JSON.parse),
]);
if (!Array.isArray(batch.reviews) || !batch.reviews.length) {
  throw new Error("The review batch must contain a non-empty reviews array.");
}
if (!Array.isArray(reviewState.reviews)) {
  throw new Error("The review state must contain a reviews array.");
}

const questionById = new Map(snapshot.questions.map((question) => [question.qid, question]));
const allowedVerdicts = new Set([
  "pass",
  "corrected",
  "needs_correction",
  "needs_source_review",
  "uncertain",
]);
const resolvedVerdicts = new Set(["pass", "corrected"]);
const sourceRequiredClasses = new Set(["current_guideline", "legal", "epidemiology"]);
const seenQids = new Set();
const normalizedReviews = [];
for (const review of batch.reviews) {
  const question = questionById.get(review.qid);
  if (!question) throw new Error(`Question ${review.qid} is absent from the current snapshot.`);
  if (seenQids.has(review.qid)) throw new Error(`Question ${review.qid} appears twice in the batch.`);
  seenQids.add(review.qid);
  if (!allowedVerdicts.has(review.verdict)) {
    throw new Error(`Question ${review.qid} has invalid verdict ${String(review.verdict)}.`);
  }
  if (review.expected_fingerprint && review.expected_fingerprint !== question.content_fingerprint) {
    throw new Error(`Question ${review.qid} no longer matches the batch fingerprint.`);
  }
  if (!review.rationale || review.rationale.trim().length < 20) {
    throw new Error(`Question ${review.qid} needs a substantive rationale.`);
  }
  if (!["high", "medium", "low"].includes(review.confidence)) {
    throw new Error(`Question ${review.qid} needs a valid confidence value.`);
  }
  if (!review.verification_class) {
    throw new Error(`Question ${review.qid} needs a verification_class.`);
  }
  const sources = Array.isArray(review.sources) ? review.sources : [];
  if (
    resolvedVerdicts.has(review.verdict)
    && sourceRequiredClasses.has(review.verification_class)
    && sources.length === 0
  ) {
    throw new Error(`Question ${review.qid} requires at least one current source.`);
  }
  normalizedReviews.push({
    qid: review.qid,
    content_fingerprint: question.content_fingerprint,
    verdict: review.verdict,
    confidence: review.confidence,
    verification_class: review.verification_class,
    rationale: review.rationale.trim(),
    sources,
    reviewer: batch.reviewer ?? "codex-medical-content-audit",
    reviewed_at: batch.reviewed_at ?? new Date().toISOString(),
    batch_id: batch.batch_id ?? null,
  });
}

const reviewByQuestionId = new Map(reviewState.reviews.map((review) => [review.qid, review]));
for (const review of normalizedReviews) reviewByQuestionId.set(review.qid, review);
const mergedState = {
  schema_version: 2,
  reviews: [...reviewByQuestionId.values()].sort((left, right) => left.qid - right.qid),
};
await writeFile(reviewStatePath, `${JSON.stringify(mergedState, null, 2)}\n`, "utf8");
console.log(JSON.stringify({
  batch: batch.batch_id ?? batchPath,
  merged_review_count: normalizedReviews.length,
  total_review_record_count: mergedState.reviews.length,
  resolved_in_batch: normalizedReviews.filter((review) => resolvedVerdicts.has(review.verdict)).length,
  unresolved_in_batch: normalizedReviews.filter((review) => !resolvedVerdicts.has(review.verdict)).length,
}, null, 2));
