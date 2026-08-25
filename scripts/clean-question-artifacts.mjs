#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import nextEnvironment from "@next/env";

const { loadEnvConfig } = nextEnvironment;
const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const projectDirectory = resolve(scriptDirectory, "..");
const outputDirectory = resolve(projectDirectory, "audit-output");
const snapshotPath = resolve(outputDirectory, "question-review-snapshot.json");
loadEnvConfig(projectDirectory);

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
}
const applyChanges = process.argv.includes("--apply");
const apiHeaders = {
  apikey: serviceRoleKey,
  Authorization: `Bearer ${serviceRoleKey}`,
};

const sourceUrlPattern = /(?:https?:\/f?app|h[a-z]*:l\/app)\.[^\n]*?(?:…|(?:[.,]\s*){2,})\s*[0-9n.]+\s*(?:\/\s*)?[0-9]{0,4}\b/giu;
const pageCounterPattern = /(?:…|\.{3})\s*\d{1,4}\s*[\/|]\s*\d{2,4}\b/gu;
const sourceQuestionLabelPattern = /^\s*(?:j\s*)?question\s+\d+(?:\s+q(?:\.?\s*id|10)\s*:?\s*\d+.*)?\s*$/iu;
const remainingArtifactPatterns = [
  ["broken_qbank_url", /(?:https?:\/fapp|hupe:l\/app|canacla?qbank|oomtexaml|exam[_ ]ueer|categoty|toplc)/iu],
  ["page_counter_artifact", /(?:…|\.{3})\s*\d{1,4}\s*[\/|]\s*\d{2,4}\b/u],
  ["broken_ellipsis_artifact", /…\s*\d{2,}/u],
  ["broken_word_with_dots", /\b[a-z]\.{2,}[a-z]/iu],
  ["question_label_artifact", /\b(?:j\s*)?question\s+\d+\b/iu],
];

function cleanText(value) {
  if (typeof value !== "string") return value;
  if (sourceQuestionLabelPattern.test(value)) return "";
  sourceUrlPattern.lastIndex = 0;
  pageCounterPattern.lastIndex = 0;
  const needsCleanup = sourceUrlPattern.test(value)
    || pageCounterPattern.test(value)
    || value.includes("L..amisil")
    || value.includes("L..opressor");
  sourceUrlPattern.lastIndex = 0;
  pageCounterPattern.lastIndex = 0;
  if (!needsCleanup) return value;
  return value
    .replace(sourceUrlPattern, " ")
    .replace(pageCounterPattern, " ")
    .replace(/L\.\.amisil/gu, "Lamisil")
    .replace(/L\.\.opressor/gu, "Lopressor")
    .replace(/[ \t]+/gu, " ")
    .replace(/ *\n */gu, "\n")
    .replace(/\s+([,.;:?!])/gu, "$1")
    .replace(/\n{3,}/gu, "\n\n")
    .trim();
}

function cleanObjectValues(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  return Object.fromEntries(Object.entries(value).map(([key, text]) => [key, cleanText(text)]));
}

function cleanOption(value) {
  return cleanText(value)
    .replace(/\s+The correct answe?\.?r is[\s\S]*$/iu, "")
    .replace(/\s+~\s*$/u, "")
    .trim();
}

function proposedPatch(question) {
  const patch = {};
  const cleanedStem = cleanText(question.stem);
  const cleanedOptions = question.options.map(cleanOption);
  const cleanedExplanation = question.explanation.map(cleanText).filter(Boolean);
  const cleanedAnswerKey = cleanText(question.answer_key);
  const cleanedKeyPoints = cleanText(question.key_points);
  const cleanedReferences = cleanText(question.references_text);
  const cleanedOptionExplanations = cleanObjectValues(question.option_explanations);
  if (cleanedStem !== question.stem) patch.stem = cleanedStem;
  if (JSON.stringify(cleanedOptions) !== JSON.stringify(question.options)) patch.options = cleanedOptions;
  if (JSON.stringify(cleanedExplanation) !== JSON.stringify(question.explanation)) {
    patch.explanation = cleanedExplanation;
  }
  if (cleanedAnswerKey !== question.answer_key) patch.answer_key = cleanedAnswerKey || null;
  if (cleanedKeyPoints !== question.key_points) patch.key_points = cleanedKeyPoints || null;
  if (cleanedReferences !== question.references_text) patch.references_text = cleanedReferences || null;
  if (JSON.stringify(cleanedOptionExplanations) !== JSON.stringify(question.option_explanations)) {
    patch.option_explanations = cleanedOptionExplanations;
  }
  return patch;
}

function reviewFields(question) {
  return {
    stem: question.stem,
    options: question.options,
    explanation: question.explanation,
    answer_key: question.answer_key,
    key_points: question.key_points,
    option_explanations: question.option_explanations,
    references_text: question.references_text,
  };
}

function reviewHash(question) {
  return createHash("sha256").update(JSON.stringify(reviewFields(question))).digest("hex");
}

function validateQuestion(question) {
  const failures = [];
  if (!question.stem || question.stem.trim().length < 12) failures.push("short or empty stem");
  if (!Array.isArray(question.options) || question.options.length < 2) failures.push("too few options");
  if (question.options.some((option) => !option?.trim())) failures.push("empty option");
  if (question.options.some((option) => option.length > 500)) failures.push("implausibly long option");
  if (question.options.some((option) => /\b(?:the correct answer|explanation:)\b/iu.test(option))) {
    failures.push("answer explanation remains inside an option");
  }
  if (new Set(question.options.map((option) => option.toLowerCase().replace(/\s+/gu, " ").trim())).size !== question.options.length) {
    failures.push("duplicate options after cleanup");
  }
  if (!Number.isInteger(question.answer_index) || question.answer_index < 0 || question.answer_index >= question.options.length) {
    failures.push("invalid answer index");
  }
  if (!Array.isArray(question.explanation) || !question.explanation.length) failures.push("empty explanation");
  for (const [path, value] of [
    ["stem", question.stem],
    ...question.options.map((value, index) => [`options[${index}]`, value]),
    ...question.explanation.map((value, index) => [`explanation[${index}]`, value]),
  ]) {
    for (const [code, pattern] of remainingArtifactPatterns) {
      if (pattern.test(value)) failures.push(`${code} remains in ${path}`);
    }
  }
  return [...new Set(failures)];
}

async function api(path, options = {}) {
  let response;
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    response = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
      ...options,
      headers: { ...apiHeaders, ...options.headers },
    });
    if (response.ok || ![429, 500, 502, 503, 504].includes(response.status) || attempt === 4) break;
    await new Promise((resolveDelay) => setTimeout(resolveDelay, attempt * 750));
  }
  if (!response.ok) throw new Error(`${path}: ${response.status} ${await response.text()}`);
  if (response.status === 204) return null;
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

async function fetchQuestions(qids) {
  const fields = [
    "qid", "stem", "options", "answer_index", "explanation", "answer_key", "key_points",
    "option_explanations", "references_text",
  ].join(",");
  const filter = encodeURIComponent(`(${qids.join(",")})`);
  return api(`questions?select=${fields}&qid=in.${filter}&order=qid.asc`);
}

async function patchQuestion(qid, patch) {
  return api(`questions?qid=eq.${qid}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Prefer: "return=representation" },
    body: JSON.stringify(patch),
  });
}

const snapshot = JSON.parse(await readFile(snapshotPath, "utf8"));
const proposals = snapshot.questions
  .map((question) => ({ question, patch: proposedPatch(question) }))
  .filter(({ patch }) => Object.keys(patch).length > 0);
const validationFailures = [];
for (const { question, patch } of proposals) {
  const after = { ...question, ...patch };
  for (const failure of validateQuestion(after)) {
    validationFailures.push({ qid: question.qid, failure });
  }
}
if (validationFailures.length) {
  console.error(JSON.stringify({ validation_failures: validationFailures }, null, 2));
  throw new Error(`${validationFailures.length} proposed cleanup validations failed.`);
}

const qids = proposals.map(({ question }) => question.qid);
const productionQuestions = qids.length ? await fetchQuestions(qids) : [];
const productionById = new Map(productionQuestions.map((question) => [question.qid, question]));
const driftFailures = [];
for (const { question } of proposals) {
  const production = productionById.get(question.qid);
  if (!production) driftFailures.push(`Question ${question.qid} is missing from production.`);
  else if (reviewHash(production) !== reviewHash(question)) {
    driftFailures.push(`Question ${question.qid} changed after the review snapshot was exported.`);
  }
}
if (driftFailures.length) throw new Error(`Production drift detected:\n${driftFailures.join("\n")}`);

const timestamp = new Date().toISOString().replace(/[:.]/gu, "");
await mkdir(outputDirectory, { recursive: true });
const backupPath = resolve(outputDirectory, `question-artifact-backup-${timestamp}.json`);
const reportPath = resolve(outputDirectory, `question-artifact-cleanup-${timestamp}.json`);
await writeFile(backupPath, `${JSON.stringify({
  generated_at: new Date().toISOString(),
  mode: applyChanges ? "apply" : "dry_run",
  questions: productionQuestions,
}, null, 2)}\n`, "utf8");

const changes = [];
for (const { question, patch } of proposals) {
  let after = { ...question, ...patch };
  if (applyChanges) {
    const updated = await patchQuestion(question.qid, patch);
    if (!updated || updated.length !== 1) {
      throw new Error(`Question ${question.qid} update returned ${updated?.length ?? 0} rows.`);
    }
    [after] = updated;
  }
  changes.push({
    qid: question.qid,
    fields: Object.keys(patch).sort(),
    before_hash: reviewHash(question),
    after_hash: reviewHash(after),
    patch,
  });
}
await writeFile(reportPath, `${JSON.stringify({
  generated_at: new Date().toISOString(),
  mode: applyChanges ? "apply" : "dry_run",
  backup_path: backupPath,
  changes,
}, null, 2)}\n`, "utf8");
console.log(JSON.stringify({
  mode: applyChanges ? "apply" : "dry_run",
  changed_question_count: changes.length,
  changed_field_count: changes.reduce((count, change) => count + change.fields.length, 0),
  backup: backupPath,
  report: reportPath,
}, null, 2));
