import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
if (!url || !serviceKey) throw new Error("Supabase inventory configuration is incomplete.");

const supabase = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});
const outputDirectory = resolve("audit-output");
const outputPath = resolve(outputDirectory, "content-provenance-inventory.json");

async function fetchAll(table, columns) {
  const rows = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await supabase.from(table).select(columns).order(table === "questions" ? "qid" : "qid").range(offset, offset + 999);
    if (error) throw new Error(`Could not export ${table} provenance metadata.`);
    rows.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  return rows;
}

const questionCoreColumns = "qid,source,qbank_question_id,source_category,source_subject,source_topic,source_pages,distribution_rights_status,distribution_rights_note,editorial_status,last_reviewed_at,reviewer_role,reference_exception,references_text,needs_review,review_note,created_at";
const questionProvenanceColumns = `${questionCoreColumns},content_author,license_or_permission,permission_evidence_uri,transformation_history,provenance_reviewed_at,provenance_reviewer_role`;
const imageCoreColumns = "qid,image_index,name,mime_type,byte_length,sha256,storage_path,source_path";
const imageProvenanceColumns = `${imageCoreColumns},distribution_rights_status,distribution_rights_note,content_author,license_or_permission,permission_evidence_uri,transformation_history,provenance_reviewed_at,provenance_reviewer_role`;

let schemaComplete = true;
let questions;
let images;
try {
  [questions, images] = await Promise.all([
    fetchAll("questions", questionProvenanceColumns),
    fetchAll("qbank_question_images", imageProvenanceColumns),
  ]);
} catch {
  schemaComplete = false;
  [questions, images] = await Promise.all([
    fetchAll("questions", questionCoreColumns),
    fetchAll("qbank_question_images", imageCoreColumns),
  ]);
}

const normalizeQuestion = (question) => ({
  ...question,
  content_author: question.content_author ?? null,
  license_or_permission: question.license_or_permission ?? null,
  permission_evidence_uri: question.permission_evidence_uri ?? null,
  transformation_history: question.transformation_history ?? [],
  provenance_reviewed_at: question.provenance_reviewed_at ?? null,
  provenance_reviewer_role: question.provenance_reviewer_role ?? null,
  has_references: Boolean(question.references_text?.trim()),
  references_text: undefined,
});
const normalizeImage = (image) => ({
  ...image,
  distribution_rights_status: image.distribution_rights_status ?? "unverified",
  distribution_rights_note: image.distribution_rights_note ?? null,
  content_author: image.content_author ?? null,
  license_or_permission: image.license_or_permission ?? null,
  permission_evidence_uri: image.permission_evidence_uri ?? null,
  transformation_history: image.transformation_history ?? [],
  provenance_reviewed_at: image.provenance_reviewed_at ?? null,
  provenance_reviewer_role: image.provenance_reviewer_role ?? null,
});

const questionInventory = questions.map(normalizeQuestion);
const imageInventory = images.map(normalizeImage);
const countBy = (rows, field) => Object.fromEntries([...new Set(rows.map((row) => row[field] ?? "missing"))].sort().map((value) => [value, rows.filter((row) => (row[field] ?? "missing") === value).length]));
const inventory = {
  generated_at: new Date().toISOString(),
  schema_complete: schemaComplete,
  summary: {
    questions: questionInventory.length,
    images: imageInventory.length,
    question_rights: countBy(questionInventory, "distribution_rights_status"),
    question_editorial: countBy(questionInventory, "editorial_status"),
    image_rights: countBy(imageInventory, "distribution_rights_status"),
  },
  questions: questionInventory,
  images: imageInventory,
};

await mkdir(outputDirectory, { recursive: true });
await writeFile(outputPath, `${JSON.stringify(inventory, null, 2)}\n`, { mode: 0o600 });
console.log(`Wrote ${questionInventory.length} question rows and ${imageInventory.length} image rows to ${outputPath}. Schema complete: ${schemaComplete}.`);
