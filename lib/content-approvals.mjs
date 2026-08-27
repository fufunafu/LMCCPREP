import { createHash } from "node:crypto";

export const MAX_CONTENT_APPROVAL_ITEMS = 250;
export const APPROVED_RIGHTS_STATUSES = new Set(["original", "licensed"]);

const rightsStatuses = new Set(["original", "licensed", "unverified", "quarantined"]);
const editorialStatuses = new Set(["pending", "reviewed", "stale"]);
const datePattern = /^\d{4}-\d{2}-\d{2}$/u;
const artifactHashPattern = /^sha256:[0-9a-f]{64}$/u;
const batchIdPattern = /^[a-zA-Z0-9][a-zA-Z0-9._-]{3,119}$/u;

function object(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value;
}

function requiredString(value, label, maxLength = 2_000) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} is required.`);
  const normalized = value.trim();
  if (normalized.length > maxLength) throw new Error(`${label} is too long.`);
  return normalized;
}

function optionalString(container, field, label, maxLength = 20_000) {
  if (!Object.hasOwn(container, field)) return undefined;
  if (container[field] === null) return null;
  return requiredString(container[field], label, maxLength);
}

function enumValue(value, allowed, label) {
  const normalized = requiredString(value, label, 40);
  if (!allowed.has(normalized)) throw new Error(`${label} is invalid.`);
  return normalized;
}

function integer(value, label) {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`${label} must be a non-negative integer.`);
  return value;
}

function positiveInteger(value, label) {
  if (!Number.isSafeInteger(value) || value < 1) throw new Error(`${label} must be a positive integer.`);
  return value;
}

function date(value, label, required = true) {
  if ((value === null || value === undefined || value === "") && !required) return null;
  const normalized = requiredString(value, label, 10);
  const parsed = new Date(`${normalized}T00:00:00Z`);
  if (!datePattern.test(normalized) || Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== normalized) {
    throw new Error(`${label} must be a valid YYYY-MM-DD date.`);
  }
  return normalized;
}

function timestamp(value, label) {
  const normalized = requiredString(value, label, 64);
  const parsed = new Date(normalized);
  if (!Number.isFinite(parsed.getTime())) throw new Error(`${label} must be a valid ISO timestamp.`);
  return parsed.toISOString();
}

function transformation(value, label) {
  const entry = object(value, label);
  const artifactHash = requiredString(entry.artifact_hash, `${label}.artifact_hash`, 80).toLowerCase();
  if (!artifactHashPattern.test(artifactHash)) {
    throw new Error(`${label}.artifact_hash must use sha256:<64 lowercase hex characters>.`);
  }
  return {
    date: date(entry.date, `${label}.date`),
    responsible_role: requiredString(entry.responsible_role, `${label}.responsible_role`, 200),
    action: requiredString(entry.action, `${label}.action`, 2_000),
    artifact_hash: artifactHash,
  };
}

function normalizeRights(value, label) {
  const rights = object(value, label);
  const status = enumValue(rights.status, rightsStatuses, `${label}.status`);
  const note = requiredString(rights.note, `${label}.note`, 5_000);
  const transformations = rights.transformations === undefined
    ? []
    : Array.isArray(rights.transformations)
      ? rights.transformations.map((entry, index) => transformation(entry, `${label}.transformations[${index}]`))
      : (() => { throw new Error(`${label}.transformations must be an array.`); })();
  const normalized = {
    status,
    note,
    content_author: optionalString(rights, "content_author", `${label}.content_author`, 500),
    license_or_permission: optionalString(rights, "license_or_permission", `${label}.license_or_permission`, 5_000),
    permission_evidence_uri: optionalString(rights, "permission_evidence_uri", `${label}.permission_evidence_uri`, 2_000),
    transformations,
    reviewed_at: Object.hasOwn(rights, "reviewed_at") ? date(rights.reviewed_at, `${label}.reviewed_at`, false) : undefined,
    reviewer_role: optionalString(rights, "reviewer_role", `${label}.reviewer_role`, 300),
  };
  if (APPROVED_RIGHTS_STATUSES.has(status)) {
    for (const [field, display] of [
      ["content_author", "content_author"],
      ["license_or_permission", "license_or_permission"],
      ["permission_evidence_uri", "permission_evidence_uri"],
      ["reviewed_at", "reviewed_at"],
      ["reviewer_role", "reviewer_role"],
    ]) {
      if (!normalized[field]) throw new Error(`${label}.${display} is required for approved rights.`);
    }
    if (normalized.permission_evidence_uri.startsWith("data:")) {
      throw new Error(`${label}.permission_evidence_uri must reference protected evidence, not inline data.`);
    }
  }
  if (status === "quarantined" && (!normalized.reviewed_at || !normalized.reviewer_role)) {
    throw new Error(`${label} requires reviewed_at and reviewer_role when quarantined.`);
  }
  return normalized;
}

function normalizeEditorial(value, label) {
  const editorial = object(value, label);
  const status = enumValue(editorial.status, editorialStatuses, `${label}.status`);
  const normalized = {
    status,
    last_reviewed_at: Object.hasOwn(editorial, "last_reviewed_at")
      ? date(editorial.last_reviewed_at, `${label}.last_reviewed_at`, false)
      : undefined,
    reviewer_role: optionalString(editorial, "reviewer_role", `${label}.reviewer_role`, 300),
    references_text: optionalString(editorial, "references_text", `${label}.references_text`, 40_000),
    reference_exception: optionalString(editorial, "reference_exception", `${label}.reference_exception`, 5_000),
  };
  if (["reviewed", "stale"].includes(status) && (!normalized.last_reviewed_at || !normalized.reviewer_role)) {
    throw new Error(`${label} requires last_reviewed_at and reviewer_role when ${status}.`);
  }
  return normalized;
}

function normalizeQuestion(value, index) {
  const label = `questions[${index}]`;
  const entry = object(value, label);
  const expected = object(entry.expected, `${label}.expected`);
  return {
    qid: positiveInteger(entry.qid, `${label}.qid`),
    expected: {
      distribution_rights_status: enumValue(expected.distribution_rights_status, rightsStatuses, `${label}.expected.distribution_rights_status`),
      editorial_status: enumValue(expected.editorial_status, editorialStatuses, `${label}.expected.editorial_status`),
    },
    rights: normalizeRights(entry.rights, `${label}.rights`),
    editorial: normalizeEditorial(entry.editorial, `${label}.editorial`),
  };
}

function normalizeImage(value, index) {
  const label = `images[${index}]`;
  const entry = object(value, label);
  const expected = object(entry.expected, `${label}.expected`);
  return {
    qid: positiveInteger(entry.qid, `${label}.qid`),
    image_index: integer(entry.image_index, `${label}.image_index`),
    expected: {
      distribution_rights_status: enumValue(expected.distribution_rights_status, rightsStatuses, `${label}.expected.distribution_rights_status`),
    },
    rights: normalizeRights(entry.rights, `${label}.rights`),
  };
}

function assertNoDuplicates(values, label) {
  if (new Set(values).size !== values.length) throw new Error(`${label} contains duplicate targets.`);
}

export function normalizeApprovalManifest(value) {
  const manifest = object(value, "manifest");
  const batchId = requiredString(manifest.batch_id, "batch_id", 120);
  if (!batchIdPattern.test(batchId)) throw new Error("batch_id may contain only letters, numbers, periods, underscores, and hyphens.");
  const approvalRecord = object(manifest.approval_record, "approval_record");
  const questions = Array.isArray(manifest.questions)
    ? manifest.questions.map(normalizeQuestion)
    : (() => { throw new Error("questions must be an array."); })();
  const images = Array.isArray(manifest.images)
    ? manifest.images.map(normalizeImage)
    : (() => { throw new Error("images must be an array."); })();
  const itemCount = questions.length + images.length;
  if (!itemCount) throw new Error("The approval manifest must contain at least one question or image.");
  if (itemCount > MAX_CONTENT_APPROVAL_ITEMS) {
    throw new Error(`The approval manifest exceeds the ${MAX_CONTENT_APPROVAL_ITEMS}-item atomic batch limit.`);
  }
  assertNoDuplicates(questions.map((entry) => entry.qid), "questions");
  assertNoDuplicates(images.map((entry) => `${entry.qid}:${entry.image_index}`), "images");
  return {
    batch_id: batchId,
    approval_record: {
      release_owner_role: requiredString(approvalRecord.release_owner_role, "approval_record.release_owner_role", 300),
      approved_at: timestamp(approvalRecord.approved_at, "approval_record.approved_at"),
      legal_approval_record_id: optionalString(approvalRecord, "legal_approval_record_id", "approval_record.legal_approval_record_id", 500) ?? null,
    },
    questions,
    images,
  };
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
  }
  return value;
}

export function manifestSha256(manifest) {
  return createHash("sha256").update(JSON.stringify(canonicalize(manifest))).digest("hex");
}

function mergeField(current, next) {
  return next === undefined ? current ?? null : next;
}

function appendTransformations(current, additions, label) {
  const existing = Array.isArray(current) ? current : [];
  const combined = [...existing, ...additions];
  const hashes = combined.map((entry) => entry?.artifact_hash).filter(Boolean);
  if (new Set(hashes).size !== hashes.length) throw new Error(`${label} repeats a transformation artifact hash.`);
  return combined;
}

export function buildApprovalPlan(manifest, currentQuestions, currentImages) {
  const questionById = new Map(currentQuestions.map((row) => [row.qid, row]));
  const imageById = new Map(currentImages.map((row) => [`${row.qid}:${row.image_index}`, row]));

  const questionPatches = manifest.questions.map((entry) => {
    const current = questionById.get(entry.qid);
    if (!current) throw new Error(`Question target ${entry.qid} does not exist.`);
    if (current.source === "user") throw new Error(`Question target ${entry.qid} is personal content and cannot be bank-approved.`);
    if (current.distribution_rights_status !== entry.expected.distribution_rights_status
      || current.editorial_status !== entry.expected.editorial_status) {
      throw new Error(`Question target ${entry.qid} changed after the manifest was prepared.`);
    }
    const patch = {
      qid: entry.qid,
      expected_rights_status: entry.expected.distribution_rights_status,
      expected_editorial_status: entry.expected.editorial_status,
      distribution_rights_status: entry.rights.status,
      distribution_rights_note: entry.rights.note,
      content_author: mergeField(current.content_author, entry.rights.content_author),
      license_or_permission: mergeField(current.license_or_permission, entry.rights.license_or_permission),
      permission_evidence_uri: mergeField(current.permission_evidence_uri, entry.rights.permission_evidence_uri),
      transformation_history: appendTransformations(current.transformation_history, entry.rights.transformations, `Question target ${entry.qid}`),
      provenance_reviewed_at: mergeField(current.provenance_reviewed_at, entry.rights.reviewed_at),
      provenance_reviewer_role: mergeField(current.provenance_reviewer_role, entry.rights.reviewer_role),
      editorial_status: entry.editorial.status,
      last_reviewed_at: mergeField(current.last_reviewed_at, entry.editorial.last_reviewed_at),
      reviewer_role: mergeField(current.reviewer_role, entry.editorial.reviewer_role),
      references_text: mergeField(current.references_text, entry.editorial.references_text),
      reference_exception: mergeField(current.reference_exception, entry.editorial.reference_exception),
      needs_review: entry.editorial.status !== "reviewed",
    };
    if (APPROVED_RIGHTS_STATUSES.has(patch.distribution_rights_status)) {
      for (const field of ["content_author", "license_or_permission", "permission_evidence_uri", "provenance_reviewed_at", "provenance_reviewer_role"]) {
        if (!patch[field]) throw new Error(`Question target ${entry.qid} lacks ${field} for approved rights.`);
      }
      if (!patch.transformation_history.length) throw new Error(`Question target ${entry.qid} lacks transformation history for approved rights.`);
    }
    if (patch.editorial_status === "reviewed" && !patch.references_text && !patch.reference_exception) {
      throw new Error(`Question target ${entry.qid} requires an approved reference or documented exception.`);
    }
    return patch;
  });

  const imagePatches = manifest.images.map((entry) => {
    const key = `${entry.qid}:${entry.image_index}`;
    const parent = questionById.get(entry.qid);
    if (!parent || parent.source === "user") throw new Error(`Image target ${key} is not attached to bank content.`);
    const current = imageById.get(key);
    if (!current) throw new Error(`Image target ${key} does not exist.`);
    if (current.distribution_rights_status !== entry.expected.distribution_rights_status) {
      throw new Error(`Image target ${key} changed after the manifest was prepared.`);
    }
    const patch = {
      qid: entry.qid,
      image_index: entry.image_index,
      expected_rights_status: entry.expected.distribution_rights_status,
      distribution_rights_status: entry.rights.status,
      distribution_rights_note: entry.rights.note,
      content_author: mergeField(current.content_author, entry.rights.content_author),
      license_or_permission: mergeField(current.license_or_permission, entry.rights.license_or_permission),
      permission_evidence_uri: mergeField(current.permission_evidence_uri, entry.rights.permission_evidence_uri),
      transformation_history: appendTransformations(current.transformation_history, entry.rights.transformations, `Image target ${key}`),
      provenance_reviewed_at: mergeField(current.provenance_reviewed_at, entry.rights.reviewed_at),
      provenance_reviewer_role: mergeField(current.provenance_reviewer_role, entry.rights.reviewer_role),
    };
    if (APPROVED_RIGHTS_STATUSES.has(patch.distribution_rights_status)) {
      for (const field of ["content_author", "license_or_permission", "permission_evidence_uri", "provenance_reviewed_at", "provenance_reviewer_role"]) {
        if (!patch[field]) throw new Error(`Image target ${key} lacks ${field} for approved rights.`);
      }
      if (!patch.transformation_history.length) throw new Error(`Image target ${key} lacks transformation history for approved rights.`);
    }
    return patch;
  });

  const finalImageRights = new Map(currentImages.map((row) => [`${row.qid}:${row.image_index}`, row.distribution_rights_status]));
  for (const patch of imagePatches) finalImageRights.set(`${patch.qid}:${patch.image_index}`, patch.distribution_rights_status);
  for (const patch of questionPatches) {
    if (!APPROVED_RIGHTS_STATUSES.has(patch.distribution_rights_status) || patch.editorial_status !== "reviewed") continue;
    const unsafeImage = currentImages.find((image) => image.qid === patch.qid
      && !APPROVED_RIGHTS_STATUSES.has(finalImageRights.get(`${image.qid}:${image.image_index}`)));
    if (unsafeImage) throw new Error(`Question target ${patch.qid} has an image without approved rights.`);
  }

  return {
    questionPatches,
    imagePatches,
    summary: {
      questions: questionPatches.length,
      images: imagePatches.length,
      rightsApprovedQuestions: questionPatches.filter((entry) => APPROVED_RIGHTS_STATUSES.has(entry.distribution_rights_status)).length,
      editoriallyReviewedQuestions: questionPatches.filter((entry) => entry.editorial_status === "reviewed").length,
      rightsApprovedImages: imagePatches.filter((entry) => APPROVED_RIGHTS_STATUSES.has(entry.distribution_rights_status)).length,
      publiclyEligibleQuestions: questionPatches.filter((entry) => APPROVED_RIGHTS_STATUSES.has(entry.distribution_rights_status) && entry.editorial_status === "reviewed").length,
    },
  };
}
