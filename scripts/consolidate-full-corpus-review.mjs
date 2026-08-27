#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const projectDirectory = resolve(scriptDirectory, "..");
const outputDirectory = resolve(projectDirectory, "audit-output");
const modelDirectory = resolve(outputDirectory, "full-corpus-model-review-v1");
const outputPath = resolve(outputDirectory, "full-corpus-review-v1.json");

const [snapshot, canonical, inthread, semantic, manifest] = await Promise.all([
  readFile(resolve(outputDirectory, "question-review-snapshot.json"), "utf8").then(JSON.parse),
  readFile(resolve(outputDirectory, "question-reviews.json"), "utf8").then(JSON.parse),
  readFile(resolve(outputDirectory, "full-corpus-inthread-review-v1.json"), "utf8").then(JSON.parse),
  readFile(resolve(outputDirectory, "semantic-duplicate-resolutions-v1.json"), "utf8").then(JSON.parse),
  readFile(resolve(modelDirectory, "manifest.json"), "utf8").then(JSON.parse),
]);

const canonicalByQid = new Map(canonical.reviews.map((review) => [review.qid, review]));
const inthreadByQid = new Map(inthread.reviews.map((review) => [review.qid, review]));
const deletionByQid = new Map(semantic.deletions.map((deletion) => [deletion.remove_qid, deletion]));
const modelByQid = new Map();
const missingBatches = [];

for (const batch of manifest.batches) {
  let result;
  try {
    result = JSON.parse(await readFile(batch.result_path, "utf8"));
  } catch {
    missingBatches.push(batch.batch_id);
    continue;
  }
  const qids = result.reviews?.map((review) => review.qid) ?? [];
  if (qids.length !== batch.qids.length || !qids.every((qid, index) => qid === batch.qids[index])) {
    throw new Error(`${batch.batch_id} does not contain exactly its expected qids in order.`);
  }
  for (const review of result.reviews) {
    if (modelByQid.has(review.qid)) throw new Error(`Q${review.qid} occurs in multiple model results.`);
    modelByQid.set(review.qid, { ...review, batch_id: batch.batch_id });
  }
}

const reviews = snapshot.questions.map((question) => {
  const deletion = deletionByQid.get(question.qid);
  if (deletion) {
    return {
      qid: question.qid,
      content_fingerprint: question.content_fingerprint,
      classification: "possible_duplicate",
      confidence: "high",
      review_tier: "confirmed_duplicate_adjudication",
      issue: deletion.reason,
      confirmed_duplicate: true,
      keep_qid: deletion.keep_qid,
      suggested_answer_index: null,
    };
  }

  const expert = canonicalByQid.get(question.qid);
  if (expert) {
    return {
      qid: question.qid,
      content_fingerprint: expert.content_fingerprint,
      classification: expert.verdict,
      confidence: expert.confidence,
      review_tier: "source_checked_expert_review",
      issue: expert.rationale,
      confirmed_duplicate: false,
      keep_qid: null,
      suggested_answer_index: null,
      sources: expert.sources ?? [],
      batch_id: expert.batch_id,
    };
  }

  const local = inthreadByQid.get(question.qid);
  if (local) {
    if (local.content_fingerprint !== question.content_fingerprint) {
      throw new Error(`In-thread review for Q${question.qid} has a stale fingerprint.`);
    }
    return {
      ...local,
      review_tier: "rapid_inthread_model_review",
      confirmed_duplicate: false,
      keep_qid: null,
      batch_id: inthread.review_id,
    };
  }

  const rapid = modelByQid.get(question.qid);
  if (rapid) {
    return {
      qid: question.qid,
      content_fingerprint: question.content_fingerprint,
      classification: rapid.classification,
      confidence: rapid.confidence,
      review_tier: "rapid_model_plausibility_review",
      issue: rapid.issue,
      confirmed_duplicate: false,
      keep_qid: null,
      suggested_answer_index: rapid.suggested_answer_index,
      batch_id: rapid.batch_id,
    };
  }

  return {
    qid: question.qid,
    content_fingerprint: question.content_fingerprint,
    classification: "ambiguous",
    confidence: "low",
    review_tier: "pending_model_review",
    issue: "Rapid model review has not yet been run.",
    confirmed_duplicate: false,
    keep_qid: null,
    suggested_answer_index: null,
  };
});

const counts = {};
const tiers = {};
for (const review of reviews) {
  counts[review.classification] = (counts[review.classification] ?? 0) + 1;
  tiers[review.review_tier] = (tiers[review.review_tier] ?? 0) + 1;
}
const modelClassificationCounts = {};
for (const modelReview of modelByQid.values()) {
  modelClassificationCounts[modelReview.classification] = (modelClassificationCounts[modelReview.classification] ?? 0) + 1;
}
const artifact = {
  schema_version: 1,
  review_id: "full-corpus-review-v1",
  generated_at: new Date().toISOString(),
  question_count: snapshot.questions.length,
  review_complete: missingBatches.length === 0
    && modelByQid.size === manifest.model_review_target_count
    && reviews.every((review) => review.review_tier !== "pending_model_review"),
  classification_counts: counts,
  review_tier_counts: tiers,
  model_review_execution: {
    target_count: manifest.model_review_target_count,
    result_count: modelByQid.size,
    batch_count: manifest.batch_count,
    batch_size: manifest.batch_size,
    per_question_time_limit_ms: manifest.per_question_time_limit_ms,
    timeout_policy: manifest.timeout_policy,
    classification_counts: modelClassificationCounts,
  },
  missing_model_batches: missingBatches,
  reviews,
};
await writeFile(outputPath, `${JSON.stringify(artifact, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
console.log(JSON.stringify({ output_path: outputPath, ...artifact, reviews: undefined }, null, 2));
