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
  throw new Error("Usage: node scripts/inspect-questions.mjs <qid> [qid ...]");
}

const select = [
  "qid", "source", "subject_id", "topic_id", "stem", "options", "answer_index",
  "explanation", "has_figure", "figure_url", "needs_review", "review_note",
  "qbank_question_id", "source_category", "source_subject", "source_topic",
  "answer_key", "key_points", "option_explanations", "references_text", "tags", "source_raw",
].join(",");
const filter = encodeURIComponent(`(${qids.join(",")})`);
const response = await fetch(
  `${supabaseUrl}/rest/v1/questions?select=${select}&qid=in.${filter}&order=qid.asc`,
  {
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
    },
  },
);
if (!response.ok) {
  throw new Error(`${response.status} ${await response.text()}`);
}

console.log(JSON.stringify(await response.json(), null, 2));
