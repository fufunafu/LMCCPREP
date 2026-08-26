#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const projectDirectory = resolve(scriptDirectory, "..");
const outputDirectory = resolve(projectDirectory, "audit-output");
const bankPath = resolve(outputDirectory, "full-deduplicated-question-bank.json");
const reportPath = resolve(outputDirectory, "full-deduplicated-question-bank-report.json");

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

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

function parseAnswerKeyOption(answerKey) {
  const match = String(answerKey ?? "").match(/correct answer is\s*(?:\*{1,2})?\s*option\s*(\d+)/iu);
  return match ? Number(match[1]) - 1 : null;
}

function validateQuestion(question) {
  const failures = [];
  if (!Number.isInteger(question.qid)) failures.push("invalid_qid");
  if (typeof question.stem !== "string" || question.stem.trim().length < 12) failures.push("short_or_empty_stem");
  if (!Array.isArray(question.options) || question.options.length < 2 || question.options.some((option) => !String(option ?? "").trim())) failures.push("invalid_options");
  if (Array.isArray(question.options) && new Set(question.options.map(normalizeOption)).size !== question.options.length) failures.push("duplicate_options");
  if (!Number.isInteger(question.answer_index) || question.answer_index < 0 || question.answer_index >= (question.options?.length ?? 0)) failures.push("invalid_answer_index");
  if (!Array.isArray(question.explanation) || question.explanation.every((part) => !String(part ?? "").trim())) failures.push("missing_explanation");
  const answerKeyIndex = parseAnswerKeyOption(question.answer_key);
  if (answerKeyIndex !== null && answerKeyIndex !== question.answer_index) failures.push("answer_key_index_mismatch");
  if (question.has_figure && !question.figure_url && !(question.image_assets?.length > 0)) failures.push("missing_required_figure");
  return failures;
}

function applyBatches(snapshot, batches) {
  const byQid = new Map(snapshot.questions.map((question) => [question.qid, { ...question }]));
  const updates = new Map();
  const deletions = new Map();
  for (const batch of batches) {
    for (const update of batch.updates ?? []) {
      const current = byQid.get(update.qid);
      if (!current) throw new Error(`Update target Q${update.qid} is missing.`);
      if (current.content_fingerprint !== update.expected_fingerprint) throw new Error(`Update target Q${update.qid} has a stale fingerprint.`);
      if (deletions.has(update.qid)) throw new Error(`Q${update.qid} is updated after deletion.`);
      const next = { ...current, ...(update.patch ?? {}) };
      next.content_fingerprint = contentFingerprint(next);
      byQid.set(update.qid, next);
      updates.set(update.qid, { batch_id: batch.batch_id, update });
    }
    for (const deletion of batch.deletions ?? []) {
      const current = byQid.get(deletion.remove_qid);
      if (!current) throw new Error(`Deletion target Q${deletion.remove_qid} is missing.`);
      if (current.content_fingerprint !== deletion.expected_fingerprint) throw new Error(`Deletion target Q${deletion.remove_qid} has a stale fingerprint.`);
      if (updates.has(deletion.remove_qid)) throw new Error(`Q${deletion.remove_qid} is both updated and deleted.`);
      byQid.delete(deletion.remove_qid);
      deletions.set(deletion.remove_qid, { batch_id: batch.batch_id, deletion });
    }
  }
  return { questions: [...byQid.values()].sort((left, right) => left.qid - right.qid), updates, deletions };
}

const [snapshotText, deterministicText, medicalText, semanticText, targetedText, rapidText, semanticAuditText, reviewText] = await Promise.all([
  readFile(resolve(outputDirectory, "question-review-snapshot.json"), "utf8"),
  readFile(resolve(outputDirectory, "deterministic-rationale-corrections-v1.json"), "utf8"),
  readFile(resolve(outputDirectory, "full-bank-medical-corrections-v1.json"), "utf8"),
  readFile(resolve(outputDirectory, "semantic-duplicate-resolutions-v1.json"), "utf8"),
  readFile(resolve(outputDirectory, "targeted-medical-corrections-v2.json"), "utf8"),
  readFile(resolve(outputDirectory, "rapid-model-corrections-v1.json"), "utf8"),
  readFile(resolve(outputDirectory, "question-semantic-audit-preview.json"), "utf8"),
  readFile(resolve(outputDirectory, "full-corpus-review-v1.json"), "utf8"),
]);
const snapshot = JSON.parse(snapshotText);
const deterministic = JSON.parse(deterministicText);
const medical = JSON.parse(medicalText);
const semantic = JSON.parse(semanticText);
const targeted = JSON.parse(targetedText);
const rapid = JSON.parse(rapidText);
const semanticAudit = JSON.parse(semanticAuditText);
const review = JSON.parse(reviewText);

const applied = applyBatches(snapshot, [deterministic, medical, semantic, targeted, rapid]);
const qids = applied.questions.map((question) => question.qid);
const qidSet = new Set(qids);
const duplicateQids = qids.filter((qid, index) => qids.indexOf(qid) !== index);
const normalizedStems = new Map();
const exactStemDuplicates = [];
for (const question of applied.questions) {
  const normalized = normalizeCompact(question.stem);
  if (normalizedStems.has(normalized)) exactStemDuplicates.push([normalizedStems.get(normalized), question.qid]);
  else normalizedStems.set(normalized, question.qid);
}
const structuralFailures = applied.questions
  .map((question) => ({ qid: question.qid, failures: validateQuestion(question) }))
  .filter((item) => item.failures.length);
const unresolvedPairs = semanticAudit.unresolved_semantic_candidates.filter(
  (candidate) => qidSet.has(candidate.left_qid) && qidSet.has(candidate.right_qid),
);
const unresolvedLikelyOrExactPairs = unresolvedPairs.filter((candidate) => candidate.classification !== "semantic_review");
const reviewByQid = new Map(review.reviews.map((item) => [item.qid, item]));
const missingReviewQids = qids.filter((qid) => !reviewByQid.has(qid));
const survivorClassificationCounts = {};
for (const qid of qids) {
  const classification = reviewByQid.get(qid)?.classification ?? "missing";
  survivorClassificationCounts[classification] = (survivorClassificationCounts[classification] ?? 0) + 1;
}
const enrichedQuestions = applied.questions.map((question) => {
  const audit = reviewByQid.get(question.qid);
  return {
    ...question,
    audit: audit ? {
      classification: audit.classification,
      confidence: audit.confidence,
      review_tier: audit.review_tier,
      issue: audit.issue,
      suggested_answer_index: audit.suggested_answer_index,
    } : null,
  };
});
const corrections = [...applied.updates.entries()]
  .map(([qid, item]) => ({
    qid,
    batch_id: item.batch_id,
    expected_fingerprint: item.update.expected_fingerprint,
    final_fingerprint: byQidFingerprint(enrichedQuestions, qid),
    updated_fields: Object.keys(item.update.patch ?? {}).sort(),
  }))
  .sort((left, right) => left.qid - right.qid);
const duplicateRemovals = [...applied.deletions.values()]
  .map((item) => ({ batch_id: item.batch_id, ...item.deletion }))
  .sort((left, right) => left.remove_qid - right.remove_qid);
const unresolvedQuestions = qids
  .map((qid) => reviewByQid.get(qid))
  .filter((item) => item && ["ambiguous", "possible_duplicate"].includes(item.classification))
  .map((item) => ({
    qid: item.qid,
    classification: item.classification,
    confidence: item.confidence,
    review_tier: item.review_tier,
    issue: item.issue,
    suggested_answer_index: item.suggested_answer_index,
  }));

function byQidFingerprint(questions, qid) {
  return questions.find((question) => question.qid === qid)?.content_fingerprint ?? null;
}

const bank = {
  schema_version: 1,
  bank_id: "full-deduplicated-question-bank-v1",
  generated_at: new Date().toISOString(),
  source_question_count: snapshot.questions.length,
  question_count: enrichedQuestions.length,
  confirmed_duplicate_removal_count: applied.deletions.size,
  correction_count: applied.updates.size,
  review_complete: review.review_complete,
  unresolved_possible_duplicate_pair_count: unresolvedPairs.length,
  questions: enrichedQuestions,
};
const bankText = `${JSON.stringify(bank, null, 2)}\n`;
await writeFile(bankPath, bankText, "utf8");

const report = {
  schema_version: 1,
  report_id: "full-deduplicated-question-bank-report-v1",
  generated_at: new Date().toISOString(),
  input_snapshot_count: snapshot.questions.length,
  retained_count: enrichedQuestions.length,
  confirmed_duplicate_removal_count: applied.deletions.size,
  correction_count: applied.updates.size,
  unique_qids: duplicateQids.length === 0,
  duplicate_qids: duplicateQids,
  exact_normalized_stem_duplicate_count: exactStemDuplicates.length,
  exact_normalized_stem_duplicates: exactStemDuplicates,
  structural_failure_count: structuralFailures.length,
  structural_failures: structuralFailures,
  semantic_candidate_count: semanticAudit.semantic_candidate_count,
  intentional_distinct_pair_count: semanticAudit.intentional_distinct_count,
  unresolved_possible_duplicate_pair_count: unresolvedPairs.length,
  unresolved_possible_duplicate_pairs: unresolvedPairs,
  likely_or_exact_unresolved_pair_count: unresolvedLikelyOrExactPairs.length,
  likely_or_exact_unresolved_pairs: unresolvedLikelyOrExactPairs,
  full_review_complete: review.review_complete,
  source_review_count: review.reviews.length,
  survivor_missing_review_count: missingReviewQids.length,
  survivor_missing_review_qids: missingReviewQids,
  source_classification_counts: review.classification_counts,
  survivor_classification_counts: survivorClassificationCounts,
  model_review_execution: review.model_review_execution,
  corrections,
  duplicate_removals: duplicateRemovals,
  unresolved_question_count: unresolvedQuestions.length,
  unresolved_questions: unresolvedQuestions,
  retained_qids: qids,
  removed_qids: [...applied.deletions.keys()].sort((left, right) => left - right),
  input_sha256: sha256(snapshotText),
  artifact_sha256: {
    question_review_snapshot: sha256(snapshotText),
    deterministic_rationale_corrections: sha256(deterministicText),
    full_bank_medical_corrections: sha256(medicalText),
    semantic_duplicate_resolutions: sha256(semanticText),
    targeted_medical_corrections: sha256(targetedText),
    rapid_model_corrections: sha256(rapidText),
    question_semantic_audit_preview: sha256(semanticAuditText),
    full_corpus_review: sha256(reviewText),
  },
  bank_path: relative(projectDirectory, bankPath),
  bank_sha256: sha256(bankText),
};
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify({
  report_path: reportPath,
  ...report,
  corrections: undefined,
  duplicate_removals: undefined,
  unresolved_questions: undefined,
  unresolved_possible_duplicate_pairs: undefined,
  likely_or_exact_unresolved_pairs: undefined,
  retained_qids: undefined,
  removed_qids: undefined,
}, null, 2));
