#!/usr/bin/env node

import { isDeepStrictEqual } from "node:util";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import nextEnvironment from "@next/env";

const { loadEnvConfig } = nextEnvironment;
const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const projectDirectory = resolve(scriptDirectory, "..");
const outputDirectory = resolve(projectDirectory, "audit-output");
loadEnvConfig(projectDirectory);

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
if (!supabaseUrl || !serviceRoleKey) throw new Error("Supabase production credentials are required.");

const [batch, bank, report] = await Promise.all([
  readFile(resolve(outputDirectory, "semantic-duplicate-resolutions-v1.json"), "utf8").then(JSON.parse),
  readFile(resolve(outputDirectory, "full-deduplicated-question-bank.json"), "utf8").then(JSON.parse),
  readFile(resolve(outputDirectory, "full-deduplicated-question-bank-report.json"), "utf8").then(JSON.parse),
]);
const headers = { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` };
const failures = [];
const assert = (condition, message) => { if (!condition) failures.push(message); };

async function rows(path, range) {
  const response = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
    headers: { ...headers, ...(range ? { Range: range } : {}) },
  });
  if (!response.ok) throw new Error(`${path}: ${response.status} ${await response.text()}`);
  return response.json();
}

async function allRows(path) {
  const result = [];
  for (let start = 0; ; start += 1000) {
    const page = await rows(path, `${start}-${start + 999}`);
    result.push(...page);
    if (page.length < 1000) return result;
  }
}

function normalizeStem(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/https?:\/\/\S+/gu, " ")
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

const candidateReviewFields = [
  "subject_id",
  "topic_id",
  "stem",
  "options",
  "answer_index",
  "explanation",
  "has_figure",
  "figure_url",
  "needs_review",
  "review_note",
  "answer_key",
  "key_points",
  "option_explanations",
  "references_text",
  "tags",
];
const reviewFields = candidateReviewFields.filter((field) =>
  bank.questions.some((question) => Object.hasOwn(question, field))
);
const productionQuestions = await allRows(`questions?select=qid,${reviewFields.join(",")}&order=qid.asc`);
const productionQids = productionQuestions.map(({ qid }) => qid);
const expectedQids = bank.questions.map(({ qid }) => qid).sort((left, right) => left - right);
assert(isDeepStrictEqual(productionQids, expectedQids), "Production qids do not exactly match the verified deduplicated bank.");

const expectedByQid = new Map(bank.questions.map((question) => [question.qid, question]));
const contentMismatches = [];
for (const current of productionQuestions) {
  const expected = expectedByQid.get(current.qid);
  const fields = reviewFields.filter((field) => {
    const expectedValue = Object.hasOwn(expected ?? {}, field) ? expected[field] : null;
    return !isDeepStrictEqual(current[field], expectedValue);
  });
  if (fields.length) contentMismatches.push({ qid: current.qid, fields });
}
assert(
  contentMismatches.length === 0,
  `Production content differs from the reviewed bank for ${contentMismatches.length} questions: ${contentMismatches.slice(0, 20).map(({ qid, fields }) => `Q${qid} (${fields.join(", ")})`).join("; ")}`,
);

const stems = new Map();
const exactStemDuplicates = [];
for (const question of productionQuestions) {
  const normalized = normalizeStem(question.stem);
  if (stems.has(normalized)) exactStemDuplicates.push([stems.get(normalized), question.qid]);
  else stems.set(normalized, question.qid);
}
assert(exactStemDuplicates.length === 0, "Production still contains an exact normalized-stem duplicate.");

const removedQids = batch.deletions.map(({ remove_qid: qid }) => qid);
for (const table of ["attempts", "flags", "notes", "question_edits", "qbank_question_categories", "qbank_question_topics", "qbank_question_images"]) {
  let references = 0;
  for (let start = 0; start < removedQids.length; start += 250) {
    const chunk = removedQids.slice(start, start + 250);
    references += (await rows(
      `${table}?select=qid&qid=in.${encodeURIComponent(`(${chunk.join(",")})`)}`,
    )).length;
  }
  assert(references === 0, `${table} still references ${references} removed qids.`);
}

const sessions = await allRows("sessions?select=question_ids");
const removedSet = new Set(removedQids);
const sessionReferences = sessions.reduce(
  (count, session) => count + session.question_ids.filter((qid) => removedSet.has(qid)).length,
  0,
);
assert(sessionReferences === 0, `Sessions still contain ${sessionReferences} removed qids.`);

console.log(JSON.stringify({
  passed: failures.length === 0,
  failure_count: failures.length,
  failures,
  production_questions: productionQuestions.length,
  expected_questions: expectedQids.length,
  confirmed_duplicate_removals: removedQids.length,
  exact_normalized_stem_duplicates: exactStemDuplicates.length,
  removed_user_data_references: failures.filter((failure) => /attempts|flags|notes|question_edits|Sessions/u.test(failure)).length,
  review_fields_checked: reviewFields.length,
  production_content_mismatches: contentMismatches.length,
  corrected_questions_checked: report.corrections?.length ?? 0,
  stable_bank_content_sha256: report.bank_content_sha256,
}, null, 2));
if (failures.length) process.exitCode = 1;
