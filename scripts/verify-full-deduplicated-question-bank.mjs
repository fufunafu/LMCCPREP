#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { isDeepStrictEqual } from "node:util";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const projectDirectory = resolve(scriptDirectory, "..");
const outputDirectory = resolve(projectDirectory, "audit-output");
const bankPath = resolve(outputDirectory, "full-deduplicated-question-bank.json");
const reportPath = resolve(outputDirectory, "full-deduplicated-question-bank-report.json");

const artifactPaths = {
  question_review_snapshot: resolve(outputDirectory, "question-review-snapshot.json"),
  deterministic_rationale_corrections: resolve(outputDirectory, "deterministic-rationale-corrections-v1.json"),
  full_bank_medical_corrections: resolve(outputDirectory, "full-bank-medical-corrections-v1.json"),
  semantic_duplicate_resolutions: resolve(outputDirectory, "semantic-duplicate-resolutions-v1.json"),
  targeted_medical_corrections: resolve(outputDirectory, "targeted-medical-corrections-v2.json"),
  rapid_model_corrections: resolve(outputDirectory, "rapid-model-corrections-v1.json"),
  question_semantic_audit_preview: resolve(outputDirectory, "question-semantic-audit-preview.json"),
  full_corpus_review: resolve(outputDirectory, "full-corpus-review-v1.json"),
};
const artifactEntries = await Promise.all(Object.entries(artifactPaths).map(async ([name, path]) => {
  const text = await readFile(path, "utf8");
  return [name, { text, value: JSON.parse(text) }];
}));
const artifacts = Object.fromEntries(artifactEntries);
const bankText = await readFile(bankPath, "utf8");
const reportText = await readFile(reportPath, "utf8");
const bank = JSON.parse(bankText);
const report = JSON.parse(reportText);
const snapshot = artifacts.question_review_snapshot.value;
const semantic = artifacts.semantic_duplicate_resolutions.value;
const semanticAudit = artifacts.question_semantic_audit_preview.value;
const review = artifacts.full_corpus_review.value;
const correctionBatches = [
  artifacts.deterministic_rationale_corrections.value,
  artifacts.full_bank_medical_corrections.value,
  semantic,
  artifacts.targeted_medical_corrections.value,
  artifacts.rapid_model_corrections.value,
];

const failures = [];
const assert = (condition, message) => { if (!condition) failures.push(message); };
const allowIncomplete = process.argv.includes("--allow-incomplete");
const sha256 = (value) => createHash("sha256").update(value).digest("hex");

function normalizeCompact(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/https?:\/\/\S+/gu, " ")
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

function normalizeOption(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/×/gu, "*")
    .replace(/÷/gu, "/")
    .replace(/[^\p{L}\p{N}.+\-*/%=<>]+/gu, "");
}

function contentFingerprint(question) {
  return sha256(`${normalizeCompact(question.stem)}|${question.options.map(normalizeCompact).join("|")}`);
}

function parseAnswerKeyIndex(answerKey) {
  const numeric = String(answerKey ?? "").match(/correct answer(?:\s+is|:)?\s*(?:\*{1,2})?\s*option\s*(\d+)/iu);
  if (numeric) return Number(numeric[1]) - 1;
  const letter = String(answerKey ?? "").match(/correct answer(?:\s+is|:)?\s*(?:\*{1,2})?\s*option\s*([a-j])/iu);
  return letter ? letter[1].toLowerCase().charCodeAt(0) - 97 : null;
}

function validateQuestion(question) {
  const questionFailures = [];
  if (!Number.isInteger(question.qid)) questionFailures.push("invalid_qid");
  if (typeof question.stem !== "string" || question.stem.trim().length < 12) questionFailures.push("short_or_empty_stem");
  if (!Array.isArray(question.options) || question.options.length < 2 || question.options.some((option) => !String(option ?? "").trim())) questionFailures.push("invalid_options");
  if (Array.isArray(question.options) && new Set(question.options.map(normalizeOption)).size !== question.options.length) questionFailures.push("duplicate_options");
  if (!Number.isInteger(question.answer_index) || question.answer_index < 0 || question.answer_index >= (question.options?.length ?? 0)) questionFailures.push("invalid_answer_index");
  if (!Array.isArray(question.explanation) || question.explanation.every((part) => !String(part ?? "").trim())) questionFailures.push("missing_explanation");
  const answerKeyIndex = parseAnswerKeyIndex(question.answer_key);
  if (answerKeyIndex !== null && answerKeyIndex !== question.answer_index) questionFailures.push("answer_key_index_mismatch");
  if (question.has_figure && !question.figure_url && !(question.image_assets?.length > 0)) questionFailures.push("missing_required_figure");
  return questionFailures;
}

function countBy(items, key) {
  const counts = {};
  for (const item of items) counts[item[key]] = (counts[item[key]] ?? 0) + 1;
  return counts;
}

function sameNumberSet(left, right) {
  if (left.length !== right.length) return false;
  const rightSet = new Set(right);
  return left.every((value) => rightSet.has(value));
}

function replayBatches() {
  const byQid = new Map(snapshot.questions.map((question) => [question.qid, { ...question }]));
  const updates = new Map();
  const deletions = new Map();
  for (const batch of correctionBatches) {
    for (const update of batch.updates ?? []) {
      const current = byQid.get(update.qid);
      assert(Boolean(current), `Correction ${batch.batch_id} targets missing Q${update.qid}.`);
      if (!current) continue;
      assert(current.content_fingerprint === update.expected_fingerprint, `Correction ${batch.batch_id} has a stale fingerprint for Q${update.qid}.`);
      assert(!deletions.has(update.qid), `Q${update.qid} is corrected after deletion.`);
      const next = { ...current, ...(update.patch ?? {}) };
      next.content_fingerprint = contentFingerprint(next);
      byQid.set(update.qid, next);
      updates.set(update.qid, { batch_id: batch.batch_id, update });
    }
    for (const deletion of batch.deletions ?? []) {
      const current = byQid.get(deletion.remove_qid);
      assert(Boolean(current), `Deletion ${batch.batch_id} targets missing Q${deletion.remove_qid}.`);
      if (!current) continue;
      assert(current.content_fingerprint === deletion.expected_fingerprint, `Deletion ${batch.batch_id} has a stale fingerprint for Q${deletion.remove_qid}.`);
      assert(!updates.has(deletion.remove_qid), `Q${deletion.remove_qid} is both corrected and deleted.`);
      byQid.delete(deletion.remove_qid);
      deletions.set(deletion.remove_qid, { batch_id: batch.batch_id, deletion });
    }
  }
  return { byQid, updates, deletions };
}

const sourceQids = snapshot.questions.map((question) => question.qid);
const sourceQidSet = new Set(sourceQids);
const snapshotByQid = new Map(snapshot.questions.map((question) => [question.qid, question]));
assert(snapshot.question_count === 4972 && snapshot.questions.length === 4972, "Source snapshot is not the requested 4,972-question corpus.");
assert(sourceQidSet.size === sourceQids.length, "Source snapshot contains duplicate qids.");
assert(snapshot.questions.every((question) => contentFingerprint(question) === question.content_fingerprint), "A source snapshot content fingerprint is invalid.");

const replayed = replayBatches();
const expectedQids = [...replayed.byQid.keys()].sort((left, right) => left - right);
const bankQids = bank.questions.map((question) => question.qid);
const bankQidSet = new Set(bankQids);
const removedQids = [...replayed.deletions.keys()].sort((left, right) => left - right);
assert(bank.question_count === expectedQids.length, "Final count does not equal source count minus confirmed duplicates.");
assert(bank.questions.length === bank.question_count, "Bank question_count does not match its questions array.");
assert(bankQidSet.size === bankQids.length, "Final bank contains duplicate qids.");
assert(sameNumberSet(bankQids, expectedQids), "Final qids do not exactly equal source qids minus confirmed duplicate removals.");
assert(report.retained_count === bank.question_count, "Report retained count does not match the bank.");
assert(report.confirmed_duplicate_removal_count === replayed.deletions.size, "Report deletion count does not match replayed semantic decisions.");
assert(report.correction_count === replayed.updates.size && bank.correction_count === replayed.updates.size, "Correction count does not match replayed correction batches.");

for (const question of bank.questions) {
  const bankRecord = { ...question };
  delete bankRecord.audit;
  assert(isDeepStrictEqual(bankRecord, replayed.byQid.get(question.qid)), `Final Q${question.qid} does not match the replayed source and correction batches.`);
}

const exactStemMap = new Map();
const exactStemDuplicates = [];
const structuralFailures = [];
for (const question of bank.questions) {
  const normalized = normalizeCompact(question.stem);
  if (exactStemMap.has(normalized)) exactStemDuplicates.push([exactStemMap.get(normalized), question.qid]);
  else exactStemMap.set(normalized, question.qid);
  const questionFailures = validateQuestion(question);
  if (questionFailures.length) structuralFailures.push({ qid: question.qid, failures: questionFailures });
}
assert(exactStemDuplicates.length === 0, "Exact normalized stem duplicates remain.");
assert(structuralFailures.length === 0, "Structural or parseable answer-key validation failures remain.");
assert(isDeepStrictEqual(report.exact_normalized_stem_duplicates, exactStemDuplicates), "Report exact-duplicate details do not match independent recomputation.");
assert(isDeepStrictEqual(report.structural_failures, structuralFailures), "Report structural-failure details do not match independent recomputation.");

const reviewQids = review.reviews.map((item) => item.qid);
const reviewByQid = new Map(review.reviews.map((item) => [item.qid, item]));
const allowedClassifications = new Set(["pass", "needs_correction", "ambiguous", "possible_duplicate"]);
const allowedConfidence = new Set(["high", "medium", "low"]);
assert(review.reviews.length === snapshot.questions.length, "Review artifact does not contain 4,972 records.");
assert(new Set(reviewQids).size === reviewQids.length, "Review artifact contains duplicate qids.");
assert(sameNumberSet(reviewQids, sourceQids), "Review artifact qids do not exactly equal the source qids.");
assert(review.reviews.every((item) => allowedClassifications.has(item.classification)), "Review artifact contains an invalid classification.");
assert(review.reviews.every((item) => allowedConfidence.has(item.confidence)), "Review artifact contains an invalid confidence value.");
assert(review.reviews.every((item) => typeof item.issue === "string" && item.issue.trim()), "Review artifact contains a missing issue explanation.");
assert(review.reviews.every((item) => snapshotByQid.get(item.qid)?.content_fingerprint === item.content_fingerprint), "Review artifact contains a stale or invalid source fingerprint.");
assert(isDeepStrictEqual(countBy(review.reviews, "classification"), review.classification_counts), "Review classification counts do not match the review records.");
assert(isDeepStrictEqual(countBy(review.reviews, "review_tier"), review.review_tier_counts), "Review tier counts do not match the review records.");
assert(review.missing_model_batches.length === 0, "A model-review batch is missing.");
assert(review.reviews.every((item) => item.review_tier !== "pending_model_review"), "A source question still has pending model review.");
assert(review.model_review_execution?.target_count === 1772 && review.model_review_execution?.result_count === 1772, "External model-review result coverage is incomplete.");
assert(review.model_review_execution?.batch_count === 23 && review.model_review_execution?.batch_size === 80, "External model-review batch metadata is invalid.");
assert(review.model_review_execution?.per_question_time_limit_ms === 10_000, "The rapid-review time limit is not 10 seconds per question.");
assert(review.model_review_execution?.timeout_policy === "batch_question_count_times_per_question_limit", "The rapid-review timeout policy is invalid.");
assert(Object.values(review.model_review_execution?.classification_counts ?? {}).reduce((sum, count) => sum + count, 0) === 1772, "External model-review classification counts are incomplete.");
if (!allowIncomplete) assert(review.review_complete, "Rapid model review is incomplete.");

for (const [removeQid, item] of replayed.deletions) {
  const deletion = item.deletion;
  const source = snapshotByQid.get(removeQid);
  const deletionReview = reviewByQid.get(removeQid);
  assert(Boolean(source), `Deleted Q${removeQid} is absent from the source snapshot.`);
  assert(source?.content_fingerprint === deletion.expected_fingerprint, `Deletion fingerprint does not match source Q${removeQid}.`);
  assert(typeof deletion.reason === "string" && deletion.reason.trim(), `Deletion Q${removeQid} has no reason.`);
  assert(Number.isInteger(deletion.keep_qid) && deletion.keep_qid !== removeQid, `Deletion Q${removeQid} has an invalid keep_qid.`);
  assert(deletionReview?.classification === "possible_duplicate" && deletionReview.confirmed_duplicate === true, `Deletion Q${removeQid} lacks a confirmed-duplicate review.`);
  assert(deletionReview?.keep_qid === deletion.keep_qid, `Deletion Q${removeQid} review has the wrong keep_qid.`);
  assert(deletionReview?.issue === deletion.reason, `Deletion Q${removeQid} review does not preserve the adjudicated reason.`);
  const visited = new Set([removeQid]);
  let terminalQid = deletion.keep_qid;
  while (replayed.deletions.has(terminalQid) && !visited.has(terminalQid)) {
    visited.add(terminalQid);
    terminalQid = replayed.deletions.get(terminalQid).deletion.keep_qid;
  }
  assert(!visited.has(terminalQid), `Deletion keep chain for Q${removeQid} contains a cycle.`);
  assert(bankQidSet.has(terminalQid), `Deletion keep chain for Q${removeQid} does not end at a retained question.`);
}

const retainedNeedsCorrection = bankQids.filter((qid) => reviewByQid.get(qid)?.classification === "needs_correction");
const missingAppliedCorrections = retainedNeedsCorrection.filter((qid) => !replayed.updates.has(qid));
assert(missingAppliedCorrections.length === 0, `Retained needs-correction reviews lack applied patches: ${missingAppliedCorrections.map((qid) => `Q${qid}`).join(", ")}.`);
for (const question of bank.questions) {
  const sourceReview = reviewByQid.get(question.qid);
  assert(question.audit?.classification === sourceReview?.classification, `Embedded audit classification is stale for Q${question.qid}.`);
  assert(question.audit?.issue === sourceReview?.issue, `Embedded audit issue is stale for Q${question.qid}.`);
}

const unresolvedPairs = semanticAudit.unresolved_semantic_candidates.filter((candidate) => bankQidSet.has(candidate.left_qid) && bankQidSet.has(candidate.right_qid));
const likelyOrExactPairs = unresolvedPairs.filter((candidate) => candidate.classification !== "semantic_review");
assert(semanticAudit.question_count === bank.question_count, "Semantic audit question count does not match the final survivor count.");
assert(semanticAudit.structural_candidate_count === 0, "Semantic audit reports structural candidates.");
assert(semanticAudit.likely_or_exact_count === 0 && likelyOrExactPairs.length === 0, "A likely or exact semantic duplicate remains unresolved.");
assert(report.unresolved_possible_duplicate_pair_count === unresolvedPairs.length, "Report unresolved semantic-pair count does not match the current audit.");
assert(isDeepStrictEqual(report.unresolved_possible_duplicate_pairs, unresolvedPairs), "Report unresolved semantic-pair details do not match the current audit.");
assert(report.likely_or_exact_unresolved_pair_count === likelyOrExactPairs.length, "Report likely-or-exact count does not match retained unresolved pairs.");

const unresolvedQuestions = bankQids
  .map((qid) => reviewByQid.get(qid))
  .filter((item) => ["ambiguous", "possible_duplicate"].includes(item.classification));
assert(report.unresolved_question_count === unresolvedQuestions.length, "Report unresolved-question count does not match retained review flags.");
assert(sameNumberSet(report.unresolved_questions.map((item) => item.qid), unresolvedQuestions.map((item) => item.qid)), "Report unresolved-question qids do not match retained review flags.");
assert(report.duplicate_removals.length === replayed.deletions.size, "Report does not list every duplicate removal.");
assert(report.corrections.length === replayed.updates.size, "Report does not list every applied correction.");
assert(sameNumberSet(report.removed_qids, removedQids), "Report removed qids do not match replayed deletions.");
assert(sameNumberSet(report.retained_qids, expectedQids), "Report retained qids do not match the final bank.");

for (const [name, artifact] of Object.entries(artifacts)) {
  assert(report.artifact_sha256?.[name] === sha256(artifact.text), `Report hash does not match ${name}.`);
}
assert(report.input_sha256 === sha256(artifacts.question_review_snapshot.text), "Legacy input hash does not match the source snapshot.");
assert(report.bank_sha256 === sha256(bankText), "Bank hash does not match report.");

const result = {
  passed: failures.length === 0,
  failure_count: failures.length,
  failures,
  source_questions: snapshot.questions.length,
  retained_questions: bank.question_count,
  confirmed_duplicate_removals: replayed.deletions.size,
  corrections: replayed.updates.size,
  full_review_complete: review.review_complete,
  classification_counts: review.classification_counts,
  unresolved_questions: unresolvedQuestions.length,
  unresolved_possible_duplicate_pairs: unresolvedPairs.length,
  likely_or_exact_unresolved_pairs: likelyOrExactPairs.length,
  bank_sha256: sha256(bankText),
};
console.log(JSON.stringify(result, null, 2));
if (failures.length) process.exitCode = 1;
