#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import nextEnvironment from "@next/env";

const { loadEnvConfig } = nextEnvironment;
const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const projectDirectory = resolve(scriptDirectory, "..");
const outputPath = resolve(projectDirectory, "audit-output", "question-review-snapshot.json");
loadEnvConfig(projectDirectory);

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
}

const apiHeaders = {
  apikey: serviceRoleKey,
  Authorization: `Bearer ${serviceRoleKey}`,
};

async function fetchAll(path, pageSize = 500) {
  const rows = [];
  for (let start = 0; ; start += pageSize) {
    let response;
    for (let attempt = 1; attempt <= 4; attempt += 1) {
      response = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
        headers: {
          ...apiHeaders,
          Range: `${start}-${start + pageSize - 1}`,
          "Range-Unit": "items",
        },
      });
      if (response.ok || ![429, 500, 502, 503, 504].includes(response.status) || attempt === 4) break;
      await new Promise((resolveDelay) => setTimeout(resolveDelay, attempt * 750));
    }
    if (!response.ok) throw new Error(`${path}: ${response.status} ${await response.text()}`);
    const page = await response.json();
    rows.push(...page);
    if (page.length < pageSize) return rows;
  }
}

function stripSourceArtifacts(value) {
  return String(value ?? "")
    .replace(/https?:\/f?app\.[^\s\n]*[^\n]*/giu, " ")
    .replace(/hupe:l\/app\.[^\s\n]*[^\n]*/giu, " ")
    .replace(/\b(?:medicalstudyzone|canadaqbank)\S*/giu, " ")
    .replace(/(?:…|\.{3})\s*\d{1,4}\s*[\/|]\s*\d{2,4}\b/gu, " ");
}

function normalizeCompact(value) {
  return stripSourceArtifacts(value)
    .normalize("NFKC")
    .toLowerCase()
    .replace(/https?:\/\/\S+/gu, " ")
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

function contentFingerprint(question) {
  return createHash("sha256")
    .update(`${normalizeCompact(question.stem)}|${question.options.map(normalizeCompact).join("|")}`)
    .digest("hex");
}

const questionSelect = [
  "qid", "source", "subject_id", "topic_id", "stem", "options", "answer_index",
  "explanation", "has_figure", "figure_url", "source_pages", "needs_review",
  "review_note", "qbank_question_id", "source_category", "source_subject",
  "source_topic", "answer_key", "key_points", "option_explanations",
  "references_text", "tags",
].join(",");

const [questions, topics, imageRows] = await Promise.all([
  fetchAll(`questions?select=${questionSelect}&order=qid.asc`),
  fetchAll("topics?select=id,subject_id,name&order=id.asc"),
  fetchAll("qbank_question_images?select=qid,image_index,name,mime_type,storage_path&order=qid.asc,image_index.asc"),
]);
const topicById = new Map(topics.map((topic) => [topic.id, topic]));
const imagesByQuestion = new Map();
for (const imageRow of imageRows) {
  const existing = imagesByQuestion.get(imageRow.qid) ?? [];
  existing.push(imageRow);
  imagesByQuestion.set(imageRow.qid, existing);
}

const snapshot = {
  schema_version: 1,
  generated_at: new Date().toISOString(),
  question_count: questions.length,
  questions: questions.map((question) => ({
    ...question,
    topic_name: topicById.get(question.topic_id)?.name ?? null,
    content_fingerprint: contentFingerprint(question),
    image_assets: imagesByQuestion.get(question.qid) ?? [],
  })),
};

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
console.log(JSON.stringify({
  output: outputPath,
  question_count: snapshot.question_count,
  image_count: imageRows.length,
}, null, 2));
