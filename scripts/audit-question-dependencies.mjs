#!/usr/bin/env node

import nextEnvironment from "@next/env";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const { loadEnvConfig } = nextEnvironment;
const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const projectDirectory = resolve(scriptDirectory, "..");
loadEnvConfig(projectDirectory);

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
}

const qids = process.argv.slice(2).map(Number);
if (!qids.length || qids.some((qid) => !Number.isInteger(qid))) {
  throw new Error("Usage: node scripts/audit-question-dependencies.mjs <qid> [qid ...]");
}

const directTables = [
  "attempts",
  "flags",
  "notes",
  "question_edits",
  "qbank_question_categories",
  "qbank_question_topics",
  "qbank_question_images",
];
const headers = {
  apikey: serviceRoleKey,
  Authorization: `Bearer ${serviceRoleKey}`,
  Prefer: "count=exact",
  Range: "0-0",
};

async function exactCount(path) {
  const response = await fetch(`${supabaseUrl}/rest/v1/${path}`, { headers });
  if (!response.ok) throw new Error(`${path}: ${response.status} ${await response.text()}`);
  const range = response.headers.get("content-range");
  const match = range?.match(/\/(\d+)$/u);
  if (!match) throw new Error(`${path}: missing exact Content-Range header`);
  return Number(match[1]);
}

const report = [];
for (const qid of qids) {
  const counts = Object.fromEntries(await Promise.all([
    ...directTables.map(async (table) => [
      table,
      await exactCount(`${table}?select=qid&qid=eq.${qid}`),
    ]),
    (async () => [
      "sessions",
      await exactCount(`sessions?select=id&question_ids=cs.%7B${qid}%7D`),
    ])(),
  ]));
  report.push({ qid, counts });
}

console.log(JSON.stringify(report, null, 2));
