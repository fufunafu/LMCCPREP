#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const projectDirectory = resolve(scriptDirectory, "..");
const snapshotPath = resolve(projectDirectory, "audit-output", "question-review-snapshot.json");
const outputPath = resolve(projectDirectory, "audit-output", "question-artifact-locations.json");

const patterns = [
  ["replacement_character", /�/gu],
  ["medicalstudyzone_artifact", /medicalstudyzone/giu],
  ["broken_qbank_url", /(?:https?:\/fapp|hupe:l\/app|canacla?qbank|oomtexaml|exam[_ ]ueer|categoty|toplc)/giu],
  ["page_counter_artifact", /(?:…|\.{3})\s*\d{1,4}\s*[\/|]\s*\d{2,4}\b/gu],
  ["broken_ellipsis_artifact", /…\s*\d{2,}/gu],
  ["broken_word_with_dots", /\b[a-z]\.{2,}[a-z]/giu],
  ["question_label_artifact", /\b(?:j\s*)?question\s+\d+\b/giu],
];

function stringFields(question) {
  const fields = [
    ["stem", question.stem],
    ["answer_key", question.answer_key],
    ["key_points", question.key_points],
    ["references_text", question.references_text],
  ];
  for (const [index, option] of question.options.entries()) {
    fields.push([`options[${index}]`, option]);
  }
  for (const [index, paragraph] of question.explanation.entries()) {
    fields.push([`explanation[${index}]`, paragraph]);
  }
  for (const [key, explanation] of Object.entries(question.option_explanations ?? {})) {
    fields.push([`option_explanations.${key}`, explanation]);
  }
  return fields.filter(([, value]) => typeof value === "string");
}

const snapshot = JSON.parse(await readFile(snapshotPath, "utf8"));
const findings = [];
for (const question of snapshot.questions) {
  for (const [path, value] of stringFields(question)) {
    for (const [code, pattern] of patterns) {
      pattern.lastIndex = 0;
      for (const match of value.matchAll(pattern)) {
        const start = Math.max(0, match.index - 100);
        const end = Math.min(value.length, match.index + match[0].length + 140);
        findings.push({
          qid: question.qid,
          source: question.source,
          subject_id: question.subject_id,
          code,
          path,
          match: match[0],
          context: value.slice(start, end),
        });
      }
    }
  }
}

const summary = {};
for (const finding of findings) {
  summary[finding.code] ??= { match_count: 0, question_ids: new Set(), paths: {} };
  summary[finding.code].match_count += 1;
  summary[finding.code].question_ids.add(finding.qid);
  summary[finding.code].paths[finding.path] = (summary[finding.code].paths[finding.path] ?? 0) + 1;
}
const serializableSummary = Object.fromEntries(Object.entries(summary).map(([code, value]) => [
  code,
  {
    match_count: value.match_count,
    question_count: value.question_ids.size,
    paths: value.paths,
  },
]));
const report = {
  schema_version: 1,
  generated_at: new Date().toISOString(),
  question_count: snapshot.question_count,
  summary: serializableSummary,
  findings,
};
await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ output: outputPath, summary: serializableSummary }, null, 2));
