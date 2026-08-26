#!/usr/bin/env node

import { spawn } from "node:child_process";
import { readFile, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const projectDirectory = resolve(scriptDirectory, "..");
const batchDirectory = resolve(projectDirectory, "audit-output", "full-corpus-model-review-v1");
const manifestPath = resolve(batchDirectory, "manifest.json");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));

if (!process.argv.includes("--acknowledge-external-model")) {
  throw new Error("This command sends question-bank content to the configured external Codex model service. Re-run with --acknowledge-external-model only after the user explicitly approves that transfer.");
}

const onlyIndex = process.argv.indexOf("--only");
const only = onlyIndex >= 0 ? Number(process.argv[onlyIndex + 1]) : null;
const retryIndex = process.argv.indexOf("--retries");
const retries = retryIndex >= 0 ? Number(process.argv[retryIndex + 1]) : 2;
const concurrencyIndex = process.argv.indexOf("--concurrency");
const concurrency = concurrencyIndex >= 0 ? Number(process.argv[concurrencyIndex + 1]) : 4;
if (only !== null && (!Number.isInteger(only) || only < 1 || only > manifest.batches.length)) {
  throw new Error(`--only must be an integer from 1 through ${manifest.batches.length}.`);
}
if (!Number.isInteger(retries) || retries < 0 || retries > 5) {
  throw new Error("--retries must be an integer from 0 through 5.");
}
if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 8) {
  throw new Error("--concurrency must be an integer from 1 through 8.");
}

const promptPrefix = `You are performing a rapid medical multiple-choice question audit. Spend no more than 10 seconds on each question. Do not browse, call tools, inspect other files, or do lengthy source research. Return one review for every supplied qid, in the same order, using the required JSON schema.\n\nClassify each question as exactly one of:\n- pass: the keyed answer is medically plausible, the options are coherent, and the answer key and explanation are internally consistent.\n- needs_correction: there is an obvious medical, logical, answer-index, option, or explanation error. If only the keyed answer index is clearly wrong, provide the corrected zero-based suggested_answer_index. Otherwise use null.\n- ambiguous: the question has more than one defensible answer, lacks decisive information, depends on changing/local guidance you cannot verify quickly, or has an unresolved correctness concern.\n- possible_duplicate: the question itself visibly repeats another question within this supplied batch. State the other qid in issue. Do not infer duplication merely because two questions share a topic.\n\nUse concise issue text. For pass, briefly state why the keyed answer fits. Do not claim current-guideline verification. The input follows.\n\n`;

async function validExistingResult(batch) {
  try {
    await stat(batch.result_path);
    const result = JSON.parse(await readFile(batch.result_path, "utf8"));
    const qids = result.reviews?.map((review) => review.qid) ?? [];
    return qids.length === batch.qids.length && qids.every((qid, index) => qid === batch.qids[index]);
  } catch {
    return false;
  }
}

function runCodex(batch, input, attempt) {
  return new Promise((resolvePromise, rejectPromise) => {
    const perQuestionTimeLimitMs = manifest.per_question_time_limit_ms ?? 10_000;
    const timeoutMs = batch.question_count * perQuestionTimeLimitMs;
    const child = spawn("codex", [
      "exec",
      "--ignore-user-config",
      "--ephemeral",
      "--skip-git-repo-check",
      "--sandbox", "read-only",
      "--color", "never",
      "-C", batchDirectory,
      "--output-schema", manifest.schema_path,
      "--output-last-message", batch.result_path,
      "-",
    ], { stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      setTimeout(() => child.kill("SIGKILL"), 2_000).unref();
    }, timeoutMs);
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", rejectPromise);
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      if (code === 0) resolvePromise({ stdout, stderr });
      else rejectPromise(new Error(`${batch.batch_id} attempt ${attempt} failed with code ${code}, signal ${signal ?? "none"}: ${stderr.slice(-2000)}${stdout.slice(-1000)}`));
    });
    child.stdin.end(`${promptPrefix}${input}`);
  });
}

const selectedBatches = only === null ? manifest.batches : [manifest.batches[only - 1]];
let completed = 0;
let skipped = 0;
let nextBatchIndex = 0;
let fatalError = null;

async function processBatch(batch) {
  if (await validExistingResult(batch)) {
    skipped += 1;
    console.log(JSON.stringify({ event: "skip", batch_id: batch.batch_id, completed, skipped }));
    return;
  }
  const input = await readFile(batch.input_path, "utf8");
  let lastError = null;
  for (let attempt = 1; attempt <= retries + 1; attempt += 1) {
    try {
      await runCodex(batch, input, attempt);
      if (!(await validExistingResult(batch))) throw new Error(`${batch.batch_id} returned missing, duplicate, or reordered qids.`);
      completed += 1;
      console.log(JSON.stringify({ event: "complete", batch_id: batch.batch_id, questions: batch.question_count, completed, skipped }));
      lastError = null;
      break;
    } catch (error) {
      lastError = error;
      console.error(JSON.stringify({ event: "retry", batch_id: batch.batch_id, attempt, error: error.message }));
    }
  }
  if (lastError) throw lastError;
}

async function worker(workerId) {
  while (!fatalError) {
    const batchIndex = nextBatchIndex;
    nextBatchIndex += 1;
    if (batchIndex >= selectedBatches.length) return;
    const batch = selectedBatches[batchIndex];
    try {
      console.log(JSON.stringify({ event: "start", worker_id: workerId, batch_id: batch.batch_id }));
      await processBatch(batch);
    } catch (error) {
      fatalError = error;
      return;
    }
  }
}

const workerCount = Math.min(concurrency, selectedBatches.length);
await Promise.all(Array.from({ length: workerCount }, (_, index) => worker(index + 1)));
if (fatalError) throw fatalError;
console.log(JSON.stringify({ event: "done", selected_batches: selectedBatches.length, concurrency: workerCount, completed, skipped }));
