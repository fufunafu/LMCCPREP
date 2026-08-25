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

const batchArgument = process.argv.find((argument) => argument.endsWith(".json"));
if (!batchArgument) {
  throw new Error("Usage: node scripts/apply-question-review-corrections.mjs <batch.json> [--apply]");
}
const batchPath = resolve(process.cwd(), batchArgument);
const applyChanges = process.argv.includes("--apply");
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
}
const apiHeaders = {
  apikey: serviceRoleKey,
  Authorization: `Bearer ${serviceRoleKey}`,
};
const allowedPatchFields = new Set([
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
]);

function reviewFields(question, includeTags = Object.hasOwn(question, "tags")) {
  const fields = {
    subject_id: question.subject_id,
    topic_id: question.topic_id,
    stem: question.stem,
    options: question.options,
    answer_index: question.answer_index,
    explanation: question.explanation,
    has_figure: question.has_figure,
    figure_url: question.figure_url,
    needs_review: question.needs_review,
    review_note: question.review_note,
    answer_key: question.answer_key,
    key_points: question.key_points,
    option_explanations: question.option_explanations,
    references_text: question.references_text,
  };
  if (includeTags) fields.tags = question.tags;
  return fields;
}

function reviewHash(question, includeTags) {
  return createHash("sha256").update(JSON.stringify(reviewFields(question, includeTags))).digest("hex");
}

function parseAnswerKeyOption(answerKey) {
  if (typeof answerKey !== "string") return null;
  const match = answerKey.match(/correct answer is\s*(?:\*{1,2})?\s*option\s*(\d+)/iu);
  return match ? Number(match[1]) - 1 : null;
}

function validateQuestion(question) {
  const failures = [];
  if (!question.stem || question.stem.trim().length < 12) failures.push("short or empty stem");
  if (!Array.isArray(question.options) || question.options.length < 2) failures.push("too few options");
  if (question.options.some((option) => typeof option !== "string" || !option.trim())) failures.push("empty option");
  if (new Set(question.options.map((option) => option.normalize("NFKC").toLowerCase().replace(/\s+/gu, " ").trim())).size !== question.options.length) {
    failures.push("duplicate options");
  }
  if (!Number.isInteger(question.answer_index) || question.answer_index < 0 || question.answer_index >= question.options.length) {
    failures.push("invalid answer index");
  }
  if (!Array.isArray(question.explanation) || question.explanation.every((value) => !value?.trim())) {
    failures.push("empty explanation");
  }
  if (question.tags !== undefined && (!Array.isArray(question.tags) || question.tags.length === 0)) {
    failures.push("missing search tags");
  }
  const namedOption = parseAnswerKeyOption(question.answer_key);
  if (namedOption !== null && namedOption !== question.answer_index) failures.push("answer key index mismatch");
  if (question.option_explanations && typeof question.option_explanations === "object") {
    const expectedKeys = question.options.map((_, index) => String(index));
    const actualKeys = Object.keys(question.option_explanations).sort((left, right) => Number(left) - Number(right));
    if (JSON.stringify(actualKeys) !== JSON.stringify(expectedKeys)) {
      failures.push("option explanation keys do not match options");
    }
  }
  return failures;
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

async function fetchQuestions(qids, includeTags) {
  const fields = ["qid", ...Object.keys(reviewFields({}, includeTags))].join(",");
  const filter = encodeURIComponent(`(${qids.join(",")})`);
  return api(`questions?select=${fields}&qid=in.${filter}&order=qid.asc`);
}

async function fetchRows(table, query) {
  return api(`${table}?${query}`);
}

async function exactCount(table, filter) {
  const response = await fetch(`${supabaseUrl}/rest/v1/${table}?select=*&${filter}`, {
    headers: {
      ...apiHeaders,
      Prefer: "count=exact",
      Range: "0-0",
    },
  });
  if (!response.ok) throw new Error(`${table}: ${response.status} ${await response.text()}`);
  const match = response.headers.get("content-range")?.match(/\/(\d+)$/u);
  if (!match) throw new Error(`${table}: missing exact Content-Range header`);
  return Number(match[1]);
}

async function dependencyCounts(qid) {
  const directTables = ["attempts", "flags", "notes", "question_edits"];
  return Object.fromEntries(await Promise.all([
    ...directTables.map(async (table) => [table, await exactCount(table, `qid=eq.${qid}`)]),
    (async () => [
      "sessions",
      await exactCount("sessions", `question_ids=cs.%7B${qid}%7D`),
    ])(),
  ]));
}

async function upsertTopic(topic) {
  return api("topics?on_conflict=id", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=representation",
    },
    body: JSON.stringify(topic),
  });
}

async function patchQuestion(qid, patch) {
  return api(`questions?qid=eq.${qid}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Prefer: "return=representation" },
    body: JSON.stringify(patch),
  });
}

async function insertIgnore(table, row, conflictColumns) {
  return api(`${table}?on_conflict=${encodeURIComponent(conflictColumns)}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Prefer: "resolution=ignore-duplicates,return=minimal",
    },
    body: JSON.stringify(row),
  });
}

async function deleteQuestion(qid) {
  return api(`questions?qid=eq.${qid}`, {
    method: "DELETE",
    headers: { Prefer: "return=representation" },
  });
}

const [snapshot, batch] = await Promise.all([
  readFile(snapshotPath, "utf8").then(JSON.parse),
  readFile(batchPath, "utf8").then(JSON.parse),
]);
const updates = Array.isArray(batch.updates) ? batch.updates : [];
const deletions = Array.isArray(batch.deletions) ? batch.deletions : [];
if (!batch.batch_id || (!updates.length && !deletions.length)) {
  throw new Error("The correction batch needs a batch_id and at least one update or deletion.");
}
const snapshotById = new Map(snapshot.questions.map((question) => [question.qid, question]));
const includeTags = snapshot.questions.some((question) => Object.hasOwn(question, "tags"));
const seenQids = new Set();
const preconditionFailures = [];
for (const update of updates) {
  if (seenQids.has(update.qid)) preconditionFailures.push(`Question ${update.qid} occurs twice.`);
  seenQids.add(update.qid);
  const snapshotQuestion = snapshotById.get(update.qid);
  if (!snapshotQuestion) preconditionFailures.push(`Question ${update.qid} is missing from the snapshot.`);
  if (snapshotQuestion && update.expected_fingerprint !== snapshotQuestion.content_fingerprint) {
    preconditionFailures.push(`Question ${update.qid} no longer matches the batch fingerprint.`);
  }
  const invalidFields = Object.keys(update.patch ?? {}).filter((field) => !allowedPatchFields.has(field));
  if (invalidFields.length) preconditionFailures.push(`Question ${update.qid} uses invalid fields: ${invalidFields.join(", ")}.`);
  if (snapshotQuestion) {
    for (const failure of validateQuestion({ ...snapshotQuestion, ...update.patch })) {
      preconditionFailures.push(`Question ${update.qid}: ${failure}.`);
    }
  }
}
for (const deletion of deletions) {
  if (!Number.isInteger(deletion.remove_qid) || !Number.isInteger(deletion.keep_qid)) {
    preconditionFailures.push("Every deletion needs integer remove_qid and keep_qid values.");
    continue;
  }
  if (deletion.remove_qid === deletion.keep_qid) {
    preconditionFailures.push(`Question ${deletion.remove_qid} cannot be its own survivor.`);
  }
  if (seenQids.has(deletion.remove_qid)) {
    preconditionFailures.push(`Question ${deletion.remove_qid} occurs in more than one operation.`);
  }
  seenQids.add(deletion.remove_qid);
  const removed = snapshotById.get(deletion.remove_qid);
  const kept = snapshotById.get(deletion.keep_qid);
  if (!removed) preconditionFailures.push(`Duplicate candidate ${deletion.remove_qid} is missing from the snapshot.`);
  if (!kept) preconditionFailures.push(`Required survivor ${deletion.keep_qid} is missing from the snapshot.`);
  if (removed && deletion.expected_fingerprint !== removed.content_fingerprint) {
    preconditionFailures.push(`Duplicate candidate ${deletion.remove_qid} no longer matches the batch fingerprint.`);
  }
}
if (preconditionFailures.length) {
  throw new Error(`Batch preconditions failed:\n${preconditionFailures.join("\n")}`);
}

const qids = [...new Set([
  ...updates.map((update) => update.qid),
  ...deletions.flatMap((deletion) => [deletion.remove_qid, deletion.keep_qid]),
])];
const productionQuestions = await fetchQuestions(qids, includeTags);
const productionById = new Map(productionQuestions.map((question) => [question.qid, question]));
for (const qid of qids) {
  const snapshotQuestion = snapshotById.get(qid);
  const productionQuestion = productionById.get(qid);
  if (!productionQuestion) preconditionFailures.push(`Question ${qid} is missing from production.`);
  else if (reviewHash(snapshotQuestion, includeTags) !== reviewHash(productionQuestion, includeTags)) {
    preconditionFailures.push(`Question ${qid} changed after the snapshot was exported.`);
  }
}

const dependencyReport = [];
for (const deletion of deletions) {
  const counts = await dependencyCounts(deletion.remove_qid);
  dependencyReport.push({ qid: deletion.remove_qid, counts });
  if (Object.values(counts).some((count) => count > 0)) {
    preconditionFailures.push(`Question ${deletion.remove_qid} has user-data or session dependencies.`);
  }
}
if (preconditionFailures.length) {
  throw new Error(`Production preconditions failed:\n${preconditionFailures.join("\n")}`);
}

const removalQids = deletions.map((deletion) => deletion.remove_qid);
const hierarchyBackup = removalQids.length ? {
  categories: await fetchRows(
    "qbank_question_categories",
    `select=qid,category_id&qid=in.${encodeURIComponent(`(${removalQids.join(",")})`)}&order=qid.asc,category_id.asc`,
  ),
  topics: await fetchRows(
    "qbank_question_topics",
    `select=qid,topic_id&qid=in.${encodeURIComponent(`(${removalQids.join(",")})`)}&order=qid.asc`,
  ),
  images: await fetchRows(
    "qbank_question_images",
    `select=*&qid=in.${encodeURIComponent(`(${removalQids.join(",")})`)}&order=qid.asc,image_index.asc`,
  ),
} : { categories: [], topics: [], images: [] };
for (const deletion of deletions) {
  if (hierarchyBackup.images.some(({ qid }) => qid === deletion.remove_qid)) {
    preconditionFailures.push(`Question ${deletion.remove_qid} has image assets that require manual migration.`);
  }
}
if (preconditionFailures.length) {
  throw new Error(`Deletion safety preconditions failed:\n${preconditionFailures.join("\n")}`);
}

const timestamp = new Date().toISOString().replace(/[:.]/gu, "");
await mkdir(outputDirectory, { recursive: true });
const backupPath = resolve(outputDirectory, `${batch.batch_id}-backup-${timestamp}.json`);
const reportPath = resolve(outputDirectory, `${batch.batch_id}-report-${timestamp}.json`);
await writeFile(backupPath, `${JSON.stringify({
  generated_at: new Date().toISOString(),
  mode: applyChanges ? "apply" : "dry_run",
  batch_id: batch.batch_id,
  questions: productionQuestions,
  hierarchy: hierarchyBackup,
  dependencies: dependencyReport,
}, null, 2)}\n`, "utf8");

if (applyChanges) {
  for (const topic of batch.ensure_topics ?? []) await upsertTopic(topic);
}
const changes = [];
for (const update of updates) {
  const before = productionById.get(update.qid);
  let after = { ...before, ...update.patch };
  if (applyChanges) {
    const updated = await patchQuestion(update.qid, update.patch);
    if (!updated || updated.length !== 1) {
      throw new Error(`Question ${update.qid} update returned ${updated?.length ?? 0} rows.`);
    }
    [after] = updated;
  }
  changes.push({
    qid: update.qid,
    reason: update.reason,
    fields: Object.keys(update.patch).sort(),
    before_hash: reviewHash(before, includeTags),
    after_hash: reviewHash(after, includeTags),
  });
}
const deletionResults = [];
for (const deletion of deletions) {
  const categoryLinks = hierarchyBackup.categories.filter(({ qid }) => qid === deletion.remove_qid);
  const topicLink = hierarchyBackup.topics.find(({ qid }) => qid === deletion.remove_qid);
  if (applyChanges) {
    for (const link of categoryLinks) {
      await insertIgnore(
        "qbank_question_categories",
        { qid: deletion.keep_qid, category_id: link.category_id },
        "qid,category_id",
      );
    }
    if (topicLink) {
      const existingTopic = await fetchRows(
        "qbank_question_topics",
        `select=qid,topic_id&qid=eq.${deletion.keep_qid}`,
      );
      if (!existingTopic.length) {
        await insertIgnore(
          "qbank_question_topics",
          { qid: deletion.keep_qid, topic_id: topicLink.topic_id },
          "qid",
        );
      }
    }
    const removed = await deleteQuestion(deletion.remove_qid);
    if (!removed || removed.length !== 1) {
      throw new Error(`Question ${deletion.remove_qid} deletion returned ${removed?.length ?? 0} rows.`);
    }
  }
  deletionResults.push({
    ...deletion,
    migrated_category_links: categoryLinks.map(({ category_id: categoryId }) => categoryId),
    source_topic_link: topicLink?.topic_id ?? null,
  });
}
await writeFile(reportPath, `${JSON.stringify({
  generated_at: new Date().toISOString(),
  mode: applyChanges ? "apply" : "dry_run",
  batch_id: batch.batch_id,
  backup_path: backupPath,
  changes,
  deletions: deletionResults,
}, null, 2)}\n`, "utf8");
console.log(JSON.stringify({
  mode: applyChanges ? "apply" : "dry_run",
  batch_id: batch.batch_id,
  update_count: changes.length,
  deletion_count: deletionResults.length,
  backup: backupPath,
  report: reportPath,
}, null, 2));
