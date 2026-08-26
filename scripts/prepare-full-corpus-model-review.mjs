#!/usr/bin/env node

import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const projectDirectory = resolve(scriptDirectory, "..");
const outputDirectory = resolve(projectDirectory, "audit-output");
const batchDirectory = resolve(outputDirectory, "full-corpus-model-review-v1");
const inputDirectory = resolve(batchDirectory, "input");
const resultDirectory = resolve(batchDirectory, "results");
const schemaPath = resolve(batchDirectory, "response-schema.json");
const manifestPath = resolve(batchDirectory, "manifest.json");

const batchSizeArgument = process.argv.indexOf("--batch-size");
const batchSize = batchSizeArgument >= 0 ? Number(process.argv[batchSizeArgument + 1]) : 80;
if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 100) {
  throw new Error("--batch-size must be an integer from 1 through 100.");
}

function truncate(value, maximum) {
  const text = Array.isArray(value) ? value.join("\n") : String(value ?? "");
  if (text.length <= maximum) return text;
  return `${text.slice(0, maximum - 24)}\n[content truncated]`;
}

function projectedQuestions(snapshot, batches) {
  const byQid = new Map(snapshot.questions.map((question) => [question.qid, { ...question }]));
  const removed = new Set();
  for (const batch of batches) {
    for (const update of batch.updates ?? []) {
      const question = byQid.get(update.qid);
      if (!question) throw new Error(`Update target Q${update.qid} is missing.`);
      if (question.content_fingerprint !== update.expected_fingerprint) {
        throw new Error(`Update target Q${update.qid} has a stale fingerprint.`);
      }
      byQid.set(update.qid, { ...question, ...(update.patch ?? {}) });
    }
    for (const deletion of batch.deletions ?? []) {
      const question = byQid.get(deletion.remove_qid);
      if (!question) throw new Error(`Deletion target Q${deletion.remove_qid} is missing.`);
      if (question.content_fingerprint !== deletion.expected_fingerprint) {
        throw new Error(`Deletion target Q${deletion.remove_qid} has a stale fingerprint.`);
      }
      byQid.delete(deletion.remove_qid);
      removed.add(deletion.remove_qid);
    }
  }
  return { byQid, removed };
}

const [snapshot, reviews, inthread, deterministic, medical, semantic, targeted, rapid] = await Promise.all([
  readFile(resolve(outputDirectory, "question-review-snapshot.json"), "utf8").then(JSON.parse),
  readFile(resolve(outputDirectory, "question-reviews.json"), "utf8").then(JSON.parse),
  readFile(resolve(outputDirectory, "full-corpus-inthread-review-v1.json"), "utf8").then(JSON.parse),
  readFile(resolve(outputDirectory, "deterministic-rationale-corrections-v1.json"), "utf8").then(JSON.parse),
  readFile(resolve(outputDirectory, "full-bank-medical-corrections-v1.json"), "utf8").then(JSON.parse),
  readFile(resolve(outputDirectory, "semantic-duplicate-resolutions-v1.json"), "utf8").then(JSON.parse),
  readFile(resolve(outputDirectory, "targeted-medical-corrections-v2.json"), "utf8").then(JSON.parse),
  readFile(resolve(outputDirectory, "rapid-model-corrections-v1.json"), "utf8").then(JSON.parse),
]);

const { byQid: projectedByQid, removed } = projectedQuestions(snapshot, [
  deterministic,
  medical,
  semantic,
  targeted,
  rapid,
]);
const reviewed = new Set(reviews.reviews.map((review) => review.qid));
for (const review of inthread.reviews ?? []) reviewed.add(review.qid);
const targetQids = [...projectedByQid.keys()]
  .filter((qid) => !reviewed.has(qid))
  .sort((left, right) => left - right);

await rm(batchDirectory, { recursive: true, force: true });
await Promise.all([
  mkdir(inputDirectory, { recursive: true }),
  mkdir(resultDirectory, { recursive: true }),
]);

const responseSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  type: "object",
  additionalProperties: false,
  required: ["reviews"],
  properties: {
    reviews: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["qid", "classification", "confidence", "issue", "suggested_answer_index"],
        properties: {
          qid: { type: "integer" },
          classification: {
            type: "string",
            enum: ["pass", "needs_correction", "ambiguous", "possible_duplicate"],
          },
          confidence: { type: "string", enum: ["high", "medium", "low"] },
          issue: { type: "string", maxLength: 600 },
          suggested_answer_index: { anyOf: [{ type: "integer", minimum: 0 }, { type: "null" }] },
        },
      },
    },
  },
};
await writeFile(schemaPath, `${JSON.stringify(responseSchema, null, 2)}\n`, "utf8");

const batches = [];
for (let offset = 0; offset < targetQids.length; offset += batchSize) {
  const qids = targetQids.slice(offset, offset + batchSize);
  const questions = qids.map((qid) => {
    const question = projectedByQid.get(qid);
    return {
      qid,
      source: question.source,
      subject_id: question.subject_id,
      topic_id: question.topic_id,
      stem: truncate(question.stem, 3200),
      options: question.options,
      answer_index: question.answer_index,
      keyed_answer: question.options?.[question.answer_index] ?? null,
      answer_key: truncate(question.answer_key, 1800),
      explanation: truncate(question.explanation, 2600),
      key_points: truncate(question.key_points, 1000),
      needs_review: Boolean(question.needs_review),
      review_note: truncate(question.review_note, 500),
    };
  });
  const batchNumber = batches.length + 1;
  const batchId = `full-corpus-model-review-${String(batchNumber).padStart(4, "0")}`;
  const inputPath = resolve(inputDirectory, `${batchId}.json`);
  await writeFile(inputPath, `${JSON.stringify({ batch_id: batchId, questions }, null, 2)}\n`, "utf8");
  batches.push({
    batch_id: batchId,
    question_count: qids.length,
    qids,
    input_path: inputPath,
    result_path: resolve(resultDirectory, `${batchId}.json`),
  });
}

const manifest = {
  schema_version: 1,
  review_id: "full-corpus-model-review-v1",
  generated_at: new Date().toISOString(),
  source_question_count: snapshot.questions.length,
  projected_survivor_count: projectedByQid.size,
  confirmed_duplicate_removal_count: removed.size,
  existing_review_count: reviewed.size,
  model_review_target_count: targetQids.length,
  batch_size: batchSize,
  per_question_time_limit_ms: 10_000,
  timeout_policy: "batch_question_count_times_per_question_limit",
  batch_count: batches.length,
  schema_path: schemaPath,
  batches,
};
await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ manifest_path: manifestPath, ...manifest, batches: undefined }, null, 2));
