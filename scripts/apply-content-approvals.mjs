import { readFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";
import { buildApprovalPlan, manifestSha256, normalizeApprovalManifest } from "../lib/content-approvals.mjs";

function option(name) {
  const exact = process.argv.indexOf(name);
  if (exact >= 0) return process.argv[exact + 1];
  const prefix = `${name}=`;
  return process.argv.find((argument) => argument.startsWith(prefix))?.slice(prefix.length);
}

function usage() {
  console.log(`Usage:
  npm run content:approvals -- --file /private/path/content-approval-batch.json
  npm run content:approvals -- --file /private/path/content-approval-batch.json --apply --confirm APPLY_CONTENT_APPROVALS

The command is a dry run unless both --apply and the exact confirmation are present.
Each manifest is limited to 250 question and image records so the database update remains atomic.
Approved items require complete rights evidence, transformation history, and review metadata.`);
}

async function fetchInChunks(client, table, columns, qids) {
  const rows = [];
  for (let offset = 0; offset < qids.length; offset += 100) {
    const chunk = qids.slice(offset, offset + 100);
    const { data, error } = await client.from(table).select(columns).in("qid", chunk);
    if (error) throw new Error(`Could not load current ${table} approval state.`);
    rows.push(...(data ?? []));
  }
  return rows;
}

if (process.argv.includes("--help")) {
  usage();
  process.exit(0);
}

const file = option("--file");
if (!file) {
  usage();
  throw new Error("--file is required.");
}
const apply = process.argv.includes("--apply");
if (apply && option("--confirm") !== "APPLY_CONTENT_APPROVALS") {
  throw new Error("Applying content approvals requires --confirm APPLY_CONTENT_APPROVALS.");
}

const manifest = normalizeApprovalManifest(JSON.parse(await readFile(file, "utf8")));
const manifestHash = manifestSha256(manifest);
const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
if (!url || !serviceRole) throw new Error("Supabase server configuration is missing.");
const admin = createClient(url, serviceRole, {
  auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
});

const qids = [...new Set([
  ...manifest.questions.map((entry) => entry.qid),
  ...manifest.images.map((entry) => entry.qid),
])];
const questionColumns = "qid,source,distribution_rights_status,distribution_rights_note,content_author,license_or_permission,permission_evidence_uri,transformation_history,provenance_reviewed_at,provenance_reviewer_role,editorial_status,last_reviewed_at,reviewer_role,references_text,reference_exception,needs_review";
const imageColumns = "qid,image_index,distribution_rights_status,distribution_rights_note,content_author,license_or_permission,permission_evidence_uri,transformation_history,provenance_reviewed_at,provenance_reviewer_role";
const [questions, images, billingResult, existingBatch] = await Promise.all([
  fetchInChunks(admin, "questions", questionColumns, qids),
  fetchInChunks(admin, "qbank_question_images", imageColumns, qids),
  admin.from("billing_settings").select("billing_required").eq("id", true).single(),
  admin.from("content_approval_batches").select("batch_id,manifest_sha256").eq("batch_id", manifest.batch_id).maybeSingle(),
]);
if (billingResult.error) throw new Error("Could not verify the billing safety switch.");
if (existingBatch.error) throw new Error("The content approval migration is not ready or its audit ledger cannot be read.");
if (existingBatch.data) throw new Error("This content approval batch_id has already been applied.");

const plan = buildApprovalPlan(manifest, questions, images);
console.log(JSON.stringify({
  mode: apply ? "apply" : "dry-run",
  batchId: manifest.batch_id,
  manifestSha256: manifestHash,
  billingRequired: Boolean(billingResult.data.billing_required),
  legalApprovalRecorded: Boolean(manifest.approval_record.legal_approval_record_id),
  summary: plan.summary,
}, null, 2));

if (!apply) {
  console.log("Dry run complete. No content approval metadata was changed.");
  process.exit(0);
}
if (billingResult.data.billing_required) {
  throw new Error("Content approval batches cannot be applied while billing enforcement is enabled.");
}

const { data, error } = await admin.rpc("apply_content_approval_batch_v1", {
  p_batch_id: manifest.batch_id,
  p_manifest_sha256: manifestHash,
  p_approved_at: manifest.approval_record.approved_at,
  p_release_owner_role: manifest.approval_record.release_owner_role,
  p_legal_approval_record_id: manifest.approval_record.legal_approval_record_id,
  p_questions: plan.questionPatches,
  p_images: plan.imagePatches,
});
if (error) throw new Error(`The atomic content approval update failed (${error.code ?? "unknown"}).`);
const result = Array.isArray(data) ? data[0] : data;
if (!result || Number(result.question_updates) !== plan.questionPatches.length || Number(result.image_updates) !== plan.imagePatches.length) {
  throw new Error("The content approval update returned an unexpected verification result.");
}
console.log(`Applied content approval batch ${manifest.batch_id}: ${result.question_updates} question update(s), ${result.image_updates} image update(s).`);
