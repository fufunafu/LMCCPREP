#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const projectDirectory = resolve(scriptDirectory, "..");
const outputDirectory = resolve(projectDirectory, "audit-output");
const snapshotPath = resolve(outputDirectory, "question-review-snapshot.json");
const decisionsPath = resolve(outputDirectory, "bulk-medical-review-decisions-v1.json");
const batchPath = resolve(outputDirectory, "review-batch-bulk-v1.json");

const [snapshot, decisions] = await Promise.all([
  readFile(snapshotPath, "utf8").then(JSON.parse),
  readFile(decisionsPath, "utf8").then(JSON.parse),
]);

const questionByQid = new Map(snapshot.questions.map((question) => [question.qid, question]));
const reviewedQids = Object.keys(decisions.corrections ?? {}).map(Number).filter(Number.isInteger).sort((left, right) => left - right);
const missingQids = reviewedQids.filter((qid) => !questionByQid.has(qid));
if (missingQids.length) throw new Error(`Reviewed qids missing from snapshot: ${missingQids.join(", ")}`);

const reviews = reviewedQids.map((qid) => {
  const question = questionByQid.get(qid);
  const correction = decisions.corrections?.[String(qid)];
  if (correction) {
    return {
      qid,
      expected_fingerprint: question.content_fingerprint,
      verdict: "needs_correction",
      confidence: "high",
      verification_class: "current_guideline",
      rationale: correction.rationale,
      sources: correction.sources ?? [],
    };
  }
  throw new Error(`Correction decision for Q${qid} is missing.`);
});

const batch = {
  batch_id: "full-bank-medical-review-bulk-v1",
  reviewed_at: new Date().toISOString(),
  reviewer: "codex-medical-content-audit",
  reviews,
};
await writeFile(batchPath, `${JSON.stringify(batch, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ batch_path: batchPath, review_count: reviews.length }, null, 2));
