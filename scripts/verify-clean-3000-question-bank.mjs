#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const projectDirectory = resolve(scriptDirectory, "..");
const outputDirectory = resolve(projectDirectory, "audit-output");

const paths = {
  bank: resolve(outputDirectory, "clean-3000-question-bank.json"),
  report: resolve(outputDirectory, "clean-3000-selection-v2-report.json"),
  selection: resolve(outputDirectory, "clean-3000-selection-v2.json"),
  semanticAudit: resolve(outputDirectory, "question-semantic-audit-preview.json"),
  targetedBatch: resolve(outputDirectory, "targeted-medical-corrections-v2.json"),
  reviews: resolve(outputDirectory, "question-reviews.json"),
};

const [bankText, reportText, selectionText, semanticText, targetedText, reviewsText] = await Promise.all(
  Object.values(paths).map((path) => readFile(path, "utf8")),
);
const bank = JSON.parse(bankText);
const report = JSON.parse(reportText);
const selection = JSON.parse(selectionText);
const semanticAudit = JSON.parse(semanticText);
const targetedBatch = JSON.parse(targetedText);
const reviews = JSON.parse(reviewsText);

const failures = [];
const fail = (message) => failures.push(message);
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const normalize = (value) => String(value ?? "")
  .normalize("NFKC")
  .toLowerCase()
  .replace(/https?:\/\/\S+/gu, " ")
  .replace(/[^\p{L}\p{N}]+/gu, "")
  .trim();
const normalizeOption = (value) => String(value ?? "")
  .normalize("NFKC")
  .toLowerCase()
  .replace(/×/gu, "*")
  .replace(/÷/gu, "/")
  .replace(/[^\p{L}\p{N}.+\-*/%=<>]+/gu, "");

if (bank.question_count !== 3000 || bank.questions?.length !== 3000) {
  fail(`Bank count is ${bank.question_count}/${bank.questions?.length}, expected 3000/3000.`);
}
if (report.target_count !== 3000 || report.retained_count !== 3000) {
  fail(`Selection report count is ${report.target_count}/${report.retained_count}, expected 3000/3000.`);
}
if (selection.target_count !== 3000) fail(`Selection target is ${selection.target_count}, expected 3000.`);
if (report.bank_sha256 !== sha256(bankText)) fail("Bank SHA-256 does not match the selection report.");
if (JSON.stringify(selection.prerequisite_batch_ids) !== JSON.stringify(semanticAudit.applied_batch_ids)) {
  fail("Semantic audit batches do not match the selection prerequisites.");
}

const qids = new Set();
const fingerprints = new Set();
const normalizedStems = new Map();
const sourceArtifactPattern = /(?:medicalstudyzone|canadaqbank|hupe:l\/app|�|(?:…|\.{3})\s*\d{1,4}\s*[\/|]\s*\d{2,4})/iu;
let exactStemDuplicateCount = 0;
for (const question of bank.questions ?? []) {
  if (!Number.isInteger(question.qid)) fail("A question has a non-integer qid.");
  if (qids.has(question.qid)) fail(`Duplicate qid ${question.qid}.`);
  qids.add(question.qid);

  if (typeof question.content_fingerprint !== "string" || !question.content_fingerprint) {
    fail(`Question ${question.qid} has no content fingerprint.`);
  } else if (fingerprints.has(question.content_fingerprint)) {
    fail(`Question ${question.qid} duplicates a content fingerprint.`);
  }
  fingerprints.add(question.content_fingerprint);

  const stemKey = normalize(question.stem);
  if (!stemKey) fail(`Question ${question.qid} has an empty normalized stem.`);
  if (normalizedStems.has(stemKey)) {
    exactStemDuplicateCount += 1;
    fail(`Questions ${normalizedStems.get(stemKey)} and ${question.qid} have exact normalized stems.`);
  }
  normalizedStems.set(stemKey, question.qid);

  if (!Array.isArray(question.options) || question.options.length < 2) {
    fail(`Question ${question.qid} has invalid options.`);
    continue;
  }
  const normalizedOptions = question.options.map(normalizeOption);
  if (normalizedOptions.some((option) => !option)) fail(`Question ${question.qid} has an empty option.`);
  if (new Set(normalizedOptions).size !== normalizedOptions.length) fail(`Question ${question.qid} has duplicate options.`);
  if (!Number.isInteger(question.answer_index) || question.answer_index < 0 || question.answer_index >= question.options.length) {
    fail(`Question ${question.qid} has an invalid answer index.`);
  }
  const namedOption = String(question.answer_key ?? "").match(/correct answer is\s*(?:\*{1,2})?\s*option\s*(\d+)/iu);
  if (namedOption && Number(namedOption[1]) - 1 !== question.answer_index) {
    fail(`Question ${question.qid} has an answer-key index mismatch.`);
  }
  if (!Array.isArray(question.explanation) || !question.explanation.some((value) => String(value ?? "").trim())) {
    fail(`Question ${question.qid} has no explanation.`);
  }
  if (question.option_explanations && typeof question.option_explanations === "object") {
    const actual = Object.keys(question.option_explanations).sort((left, right) => Number(left) - Number(right));
    const expected = question.options.map((_, index) => String(index));
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      fail(`Question ${question.qid} has incomplete option explanations.`);
    }
  }
  if (question.has_figure && !question.figure_url && !(question.image_assets?.length > 0)) {
    fail(`Question ${question.qid} requires a missing figure.`);
  }
  const learnerText = [
    question.stem,
    ...question.options,
    ...(question.explanation ?? []),
    question.answer_key,
    question.key_points,
  ].join("\n");
  if (sourceArtifactPattern.test(learnerText)) fail(`Question ${question.qid} retains a source artifact.`);
}

const selectedUnresolvedPairs = (semanticAudit.unresolved_semantic_candidates ?? []).filter(
  (candidate) => qids.has(candidate.left_qid) && qids.has(candidate.right_qid),
);
if (selectedUnresolvedPairs.length) {
  fail(`Selected bank contains ${selectedUnresolvedPairs.length} unresolved semantic pairs.`);
}
if (report.retained_unresolved_semantic_pairs !== selectedUnresolvedPairs.length) {
  fail("Semantic-pair count does not match the selection report.");
}
if ((report.structural_validation_failures_in_selected_bank ?? []).length) {
  fail("Selection report contains structural validation failures.");
}

const bankByQid = new Map((bank.questions ?? []).map((question) => [question.qid, question]));
const reviewByQid = new Map((reviews.reviews ?? []).map((review) => [review.qid, review]));
for (const update of targetedBatch.updates ?? []) {
  const question = bankByQid.get(update.qid);
  if (!question) {
    fail(`Targeted correction ${update.qid} is missing from the selected bank.`);
    continue;
  }
  for (const [field, expected] of Object.entries(update.patch ?? {})) {
    if (JSON.stringify(question[field]) !== JSON.stringify(expected)) {
      fail(`Targeted correction ${update.qid} does not match patch field ${field}.`);
    }
  }
  const review = reviewByQid.get(update.qid);
  if (!review || review.verdict !== "needs_correction" || review.content_fingerprint !== update.expected_fingerprint) {
    fail(`Targeted correction ${update.qid} lacks its matching source-content review.`);
  }
}

const deletionQids = new Set((selection.deletions ?? []).map((deletion) => deletion.remove_qid));
if (deletionQids.size !== selection.deletions?.length) fail("Selection contains duplicate deletion qids.");
for (const qid of deletionQids) if (qids.has(qid)) fail(`Excluded qid ${qid} is still in the bank.`);
if (qids.size + deletionQids.size !== report.post_remediation_count) {
  fail("Retained plus curated-exclusion counts do not equal the post-remediation pool.");
}

const summary = {
  bank_count: bank.questions?.length ?? 0,
  unique_qid_count: qids.size,
  unique_content_fingerprint_count: fingerprints.size,
  exact_normalized_stem_duplicates: exactStemDuplicateCount,
  structural_failures: report.structural_validation_failures_in_selected_bank?.length ?? 0,
  retained_unresolved_semantic_pairs: selectedUnresolvedPairs.length,
  targeted_corrections_verified: targetedBatch.updates?.length ?? 0,
  medically_verified_count: report.medically_verified_count,
  medically_unreviewed_count: report.medically_unreviewed_count,
  medical_review_complete: report.medical_review_complete,
  failure_count: failures.length,
  failures,
};

console.log(JSON.stringify(summary, null, 2));
if (failures.length) process.exitCode = 1;
