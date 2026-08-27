#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import nextEnvironment from "@next/env";

const { loadEnvConfig } = nextEnvironment;
const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const projectDirectory = resolve(scriptDirectory, "..");
const outputDirectory = resolve(projectDirectory, "audit-output");
const sourcePath = resolve(outputDirectory, "semantic-duplicate-resolutions-v1.json");
const resumePath = resolve(outputDirectory, "semantic-duplicate-resolutions-v1-resume.json");
loadEnvConfig(projectDirectory);

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
if (!supabaseUrl || !serviceRoleKey) throw new Error("Supabase production credentials are required.");

const source = JSON.parse(await readFile(sourcePath, "utf8"));
const deletions = source.deletions ?? [];
const byRemoved = new Map(deletions.map((deletion) => [deletion.remove_qid, deletion]));

function terminalSurvivor(deletion) {
  const visited = new Set([deletion.remove_qid]);
  let survivor = deletion.keep_qid;
  while (byRemoved.has(survivor)) {
    if (visited.has(survivor)) throw new Error(`Duplicate mapping cycle at qid ${survivor}.`);
    visited.add(survivor);
    survivor = byRemoved.get(survivor).keep_qid;
  }
  return survivor;
}

const requestedQids = [...new Set(deletions.flatMap((deletion) => [
  deletion.remove_qid,
  terminalSurvivor(deletion),
]))];
const existingQids = new Set();
for (let start = 0; start < requestedQids.length; start += 250) {
  const chunk = requestedQids.slice(start, start + 250);
  const response = await fetch(
    `${supabaseUrl}/rest/v1/questions?select=qid&qid=in.${encodeURIComponent(`(${chunk.join(",")})`)}`,
    { headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` } },
  );
  if (!response.ok) throw new Error(`Question lookup failed: ${response.status} ${await response.text()}`);
  for (const row of await response.json()) existingQids.add(row.qid);
}

const remaining = deletions
  .filter((deletion) => existingQids.has(deletion.remove_qid))
  .map((deletion) => ({
    ...deletion,
    keep_qid: terminalSurvivor(deletion),
  }));
const missingSurvivors = remaining
  .map((deletion) => deletion.keep_qid)
  .filter((qid) => !existingQids.has(qid));
if (missingSurvivors.length) {
  throw new Error(`Canonical survivors are missing: ${[...new Set(missingSurvivors)].join(", ")}`);
}

const resume = {
  batch_id: "semantic-duplicate-resolutions-v1-resume",
  updates: [],
  deletions: remaining,
};
await writeFile(resumePath, `${JSON.stringify(resume, null, 2)}\n`, "utf8");
console.log(JSON.stringify({
  resume_path: resumePath,
  source_deletions: deletions.length,
  already_removed: deletions.length - remaining.length,
  remaining_deletions: remaining.length,
}, null, 2));
