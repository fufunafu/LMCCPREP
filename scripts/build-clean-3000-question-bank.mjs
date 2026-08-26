#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const projectDirectory = resolve(scriptDirectory, "..");
const outputDirectory = resolve(projectDirectory, "audit-output");

const paths = {
  snapshot: resolve(outputDirectory, "question-review-snapshot.json"),
  reviews: resolve(outputDirectory, "question-reviews.json"),
  deterministic: resolve(outputDirectory, "deterministic-rationale-corrections-v1.json"),
  medical: resolve(outputDirectory, "full-bank-medical-corrections-v1.json"),
  semantic: resolve(outputDirectory, "semantic-duplicate-resolutions-v1.json"),
  targetedMedical: resolve(outputDirectory, "targeted-medical-corrections-v2.json"),
  semanticAudit: resolve(outputDirectory, "question-semantic-audit-preview.json"),
  bank: resolve(outputDirectory, "clean-3000-question-bank.json"),
  selection: resolve(outputDirectory, "clean-3000-selection-v2.json"),
  report: resolve(outputDirectory, "clean-3000-selection-v2-report.json"),
};

const TARGET_COUNT = 3000;
const SUBJECT_TARGETS = {
  medicine: 1230,
  obgyn: 257,
  pediatrics: 551,
  pmch: 377,
  psychiatry: 410,
  surgery: 175,
};
const BUILD_ID = "clean-3000-selection-v2";
const MAX_SELECTION_ATTEMPTS = 2048;

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
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

function normalizeOption(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/×/gu, "*")
    .replace(/÷/gu, "/")
    .replace(/[^\p{L}\p{N}.+\-*/%=<>]+/gu, "");
}

function contentFingerprint(question) {
  return sha256(`${normalizeCompact(question.stem)}|${question.options.map(normalizeCompact).join("|")}`);
}

function parseAnswerKeyOption(answerKey) {
  if (typeof answerKey !== "string") return null;
  const match = answerKey.match(/correct answer is\s*(?:\*{1,2})?\s*option\s*(\d+)/iu);
  return match ? Number(match[1]) - 1 : null;
}

function textLength(value) {
  if (Array.isArray(value)) return value.filter((item) => typeof item === "string").join("\n").trim().length;
  return typeof value === "string" ? value.trim().length : 0;
}

function validateQuestion(question) {
  const failures = [];
  const options = Array.isArray(question.options) ? question.options : [];
  if (!Number.isInteger(question.qid)) failures.push("invalid qid");
  if (typeof question.stem !== "string" || question.stem.trim().length < 12) failures.push("short or empty stem");
  if (!SUBJECT_TARGETS[question.subject_id]) failures.push("invalid subject");
  if (typeof question.topic_id !== "string" || !question.topic_id.trim()) failures.push("missing topic");
  if (options.length < 2 || options.some((option) => typeof option !== "string" || !option.trim())) {
    failures.push("invalid options");
  }
  if (new Set(options.map(normalizeOption)).size !== options.length) failures.push("duplicate options");
  if (!Number.isInteger(question.answer_index) || question.answer_index < 0 || question.answer_index >= options.length) {
    failures.push("invalid answer index");
  }
  if (!Array.isArray(question.explanation) || question.explanation.every((paragraph) => !String(paragraph ?? "").trim())) {
    failures.push("missing explanation");
  }
  const keyedOption = parseAnswerKeyOption(question.answer_key);
  if (keyedOption !== null && keyedOption !== question.answer_index) failures.push("answer key index mismatch");
  if (question.has_figure && !question.figure_url && (!Array.isArray(question.image_assets) || question.image_assets.length === 0)) {
    failures.push("missing required figure");
  }
  return failures;
}

function applyBatches(snapshot, batches) {
  const byQid = new Map(snapshot.questions.map((question) => [question.qid, { ...question }]));
  const removed = new Map();
  const updated = new Map();

  for (const batch of batches) {
    for (const update of batch.updates ?? []) {
      if (removed.has(update.qid)) throw new Error(`Question ${update.qid} is updated after removal.`);
      const current = byQid.get(update.qid);
      if (!current) throw new Error(`Update target ${update.qid} is absent from the snapshot.`);
      if (update.expected_fingerprint !== current.content_fingerprint) {
        throw new Error(`Update target ${update.qid} has a stale expected fingerprint.`);
      }
      const next = { ...current, ...(update.patch ?? {}) };
      next.content_fingerprint = contentFingerprint(next);
      byQid.set(update.qid, next);
      updated.set(update.qid, { batch_id: batch.batch_id, update });
    }

    for (const deletion of batch.deletions ?? []) {
      if (updated.has(deletion.remove_qid)) {
        throw new Error(`Question ${deletion.remove_qid} is both updated and removed.`);
      }
      const current = byQid.get(deletion.remove_qid);
      if (!current) throw new Error(`Removal target ${deletion.remove_qid} is absent from the snapshot.`);
      if (deletion.expected_fingerprint !== current.content_fingerprint) {
        throw new Error(`Removal target ${deletion.remove_qid} has a stale expected fingerprint.`);
      }
      byQid.delete(deletion.remove_qid);
      removed.set(deletion.remove_qid, { batch_id: batch.batch_id, deletion });
    }
  }

  return {
    questions: [...byQid.values()].sort((left, right) => left.qid - right.qid),
    removed,
    updated,
  };
}

function reviewedSurvivors(questions, reviews, correctionBatches) {
  const questionByQid = new Map(questions.map((question) => [question.qid, question]));
  const correctionByQid = new Map();
  for (const batch of correctionBatches) {
    for (const update of batch.updates ?? []) {
      if (correctionByQid.has(update.qid)) {
        throw new Error(`Question ${update.qid} is corrected by more than one projected batch.`);
      }
      correctionByQid.set(update.qid, update);
    }
  }
  const verified = new Map();
  const stale = [];

  for (const review of reviews.reviews ?? []) {
    const question = questionByQid.get(review.qid);
    if (!question) continue;
    if (review.verdict === "pass") {
      if (review.content_fingerprint !== question.content_fingerprint) {
        stale.push({ qid: review.qid, reason: "pass review does not match projected content" });
        continue;
      }
      verified.set(review.qid, { review, projected_verdict: "pass" });
      continue;
    }
    if (review.verdict !== "needs_correction") continue;
    const update = correctionByQid.get(review.qid);
    if (!update || review.content_fingerprint !== update.expected_fingerprint) {
      stale.push({ qid: review.qid, reason: "correction review has no matching staged update" });
      continue;
    }
    verified.set(review.qid, { review, projected_verdict: "corrected" });
  }

  if (stale.length) throw new Error(`Stale projected reviews: ${JSON.stringify(stale.slice(0, 20))}`);
  return verified;
}

function conflictGraph(questions, semanticAudit) {
  const validQids = new Set(questions.map((question) => question.qid));
  const conflicts = new Map(questions.map((question) => [question.qid, new Set()]));
  const unresolvedPairs = [];
  for (const candidate of semanticAudit.unresolved_semantic_candidates ?? []) {
    if (!validQids.has(candidate.left_qid) || !validQids.has(candidate.right_qid)) continue;
    conflicts.get(candidate.left_qid).add(candidate.right_qid);
    conflicts.get(candidate.right_qid).add(candidate.left_qid);
    unresolvedPairs.push(candidate);
  }
  return { conflicts, unresolvedPairs };
}

function questionScore(question, verified, conflictCount) {
  const stemLength = textLength(question.stem);
  const explanationLength = textLength(question.explanation);
  const optionExplanations = question.option_explanations && typeof question.option_explanations === "object"
    ? Object.keys(question.option_explanations).length
    : 0;
  const supportText = [question.stem, question.answer_key, question.key_points, ...(question.explanation ?? [])].join("\n");
  let score = 0;
  if (verified.has(question.qid)) score += 1_000_000;
  if (question.source === "qbankmd") score += 320;
  if (question.source === "canadaqbank") score += 80;
  if (!question.needs_review) score += 80;
  if (question.topic_id && !/(?:^|\/)(?:other|no-topic|general)$/iu.test(question.topic_id)) score += 90;
  if (stemLength >= 120 && stemLength <= 1800) score += 90;
  else if (stemLength < 70 || stemLength > 3500) score -= 180;
  if (explanationLength >= 250 && explanationLength <= 7000) score += 110;
  else if (explanationLength < 100) score -= 180;
  if (textLength(question.answer_key) >= 60) score += 45;
  if (textLength(question.key_points) >= 60) score += 45;
  if (optionExplanations >= question.options.length) score += 70;
  if (question.has_figure && (question.figure_url || question.image_assets?.length)) score += 30;
  if (question.source_subject) score += 15;
  if (question.source_topic) score += 15;
  if (/�|medicalstudyzone|canadaqbank|(?:…|\.{3})\s*\d{1,4}\s*[\/|]\s*\d{2,4}/iu.test(supportText)) score -= 800;
  score -= conflictCount * 18;
  return score;
}

function jitter(qid, attempt) {
  const value = sha256(`${BUILD_ID}:${attempt}:${qid}`).slice(0, 12);
  return Number.parseInt(value, 16) / 0xffffffffffff;
}

function chooseQuestions(questions, verified, conflicts) {
  const structuralFailures = questions
    .map((question) => ({ qid: question.qid, failures: validateQuestion(question) }))
    .filter((result) => result.failures.length);
  const invalid = new Set(structuralFailures.map((result) => result.qid));
  const eligible = questions.filter((question) => !invalid.has(question.qid));
  const scored = eligible.map((question) => ({
    question,
    baseScore: questionScore(question, verified, conflicts.get(question.qid).size),
  }));
  let best = null;

  for (let attempt = 0; attempt < MAX_SELECTION_ATTEMPTS; attempt += 1) {
    const selected = new Set();
    const counts = Object.fromEntries(Object.keys(SUBJECT_TARGETS).map((subject) => [subject, 0]));
    const ordered = scored
      .sort((left, right) => {
        const leftNeed = SUBJECT_TARGETS[left.question.subject_id] - counts[left.question.subject_id];
        const rightNeed = SUBJECT_TARGETS[right.question.subject_id] - counts[right.question.subject_id];
        const leftPriority = left.baseScore + jitter(left.question.qid, attempt) * 24 + leftNeed / SUBJECT_TARGETS[left.question.subject_id];
        const rightPriority = right.baseScore + jitter(right.question.qid, attempt) * 24 + rightNeed / SUBJECT_TARGETS[right.question.subject_id];
        return rightPriority - leftPriority || left.question.qid - right.question.qid;
      });

    for (const { question } of ordered) {
      if (counts[question.subject_id] >= SUBJECT_TARGETS[question.subject_id]) continue;
      if ([...conflicts.get(question.qid)].some((neighbor) => selected.has(neighbor))) continue;
      selected.add(question.qid);
      counts[question.subject_id] += 1;
      if (selected.size === TARGET_COUNT) break;
    }

    const filledSubjects = Object.keys(SUBJECT_TARGETS).filter(
      (subject) => counts[subject] === SUBJECT_TARGETS[subject],
    ).length;
    const candidate = { selected, counts, attempt, filledSubjects };
    if (!best || candidate.selected.size > best.selected.size || (
      candidate.selected.size === best.selected.size && candidate.filledSubjects > best.filledSubjects
    )) best = candidate;
    if (selected.size === TARGET_COUNT && filledSubjects === Object.keys(SUBJECT_TARGETS).length) return {
      ...candidate,
      structuralFailures,
      eligibleCount: eligible.length,
    };
  }

  throw new Error(`Could not fill the 3,000-question quotas. Best result: ${JSON.stringify({
    count: best?.selected.size ?? 0,
    counts: best?.counts ?? {},
    filled_subjects: best?.filledSubjects ?? 0,
  })}`);
}

const [snapshotText, reviewsText, deterministicText, medicalText, semanticText, targetedMedicalText, semanticAuditText] = await Promise.all([
  readFile(paths.snapshot, "utf8"),
  readFile(paths.reviews, "utf8"),
  readFile(paths.deterministic, "utf8"),
  readFile(paths.medical, "utf8"),
  readFile(paths.semantic, "utf8"),
  readFile(paths.targetedMedical, "utf8"),
  readFile(paths.semanticAudit, "utf8"),
]);
const snapshot = JSON.parse(snapshotText);
const reviews = JSON.parse(reviewsText);
const deterministicBatch = JSON.parse(deterministicText);
const medicalBatch = JSON.parse(medicalText);
const semanticBatch = JSON.parse(semanticText);
const targetedMedicalBatch = JSON.parse(targetedMedicalText);
const semanticAudit = JSON.parse(semanticAuditText);

if (Object.values(SUBJECT_TARGETS).reduce((sum, count) => sum + count, 0) !== TARGET_COUNT) {
  throw new Error("Subject targets do not sum to 3,000.");
}
if (semanticAudit.question_count !== snapshot.question_count
  - (medicalBatch.deletions?.length ?? 0)
  - (deterministicBatch.deletions?.length ?? 0)
  - (semanticBatch.deletions?.length ?? 0)) {
  throw new Error("The semantic preview does not match the projected batch question count.");
}
const projectedBatches = [deterministicBatch, medicalBatch, semanticBatch, targetedMedicalBatch];
const expectedBatchIds = projectedBatches.map((batch) => batch.batch_id);
if (JSON.stringify(semanticAudit.applied_batch_ids) !== JSON.stringify(expectedBatchIds)) {
  throw new Error("The semantic preview was not generated from every current correction and duplicate-resolution batch.");
}

const projected = applyBatches(snapshot, projectedBatches);
const verified = reviewedSurvivors(projected.questions, reviews, projectedBatches);
const { conflicts, unresolvedPairs } = conflictGraph(projected.questions, semanticAudit);
const selectionResult = chooseQuestions(projected.questions, verified, conflicts);
const selectedQuestions = projected.questions
  .filter((question) => selectionResult.selected.has(question.qid))
  .sort((left, right) => left.qid - right.qid);
const selectedSet = new Set(selectedQuestions.map((question) => question.qid));
const selectedUnresolvedPairs = unresolvedPairs.filter(
  (candidate) => selectedSet.has(candidate.left_qid) && selectedSet.has(candidate.right_qid),
);
if (selectedQuestions.length !== TARGET_COUNT) throw new Error(`Selected ${selectedQuestions.length}, expected 3,000.`);
if (selectedUnresolvedPairs.length) {
  throw new Error(`Selected bank retains unresolved semantic pairs: ${selectedUnresolvedPairs.length}.`);
}

const retainedBySubject = Object.fromEntries(Object.keys(SUBJECT_TARGETS).map((subject) => [
  subject,
  selectedQuestions.filter((question) => question.subject_id === subject).length,
]));
if (JSON.stringify(retainedBySubject) !== JSON.stringify(SUBJECT_TARGETS)) {
  throw new Error(`Selected bank misses subject targets: ${JSON.stringify(retainedBySubject)}.`);
}
const retainedBySource = Object.fromEntries(
  [...new Set(selectedQuestions.map((question) => question.source))].sort().map((source) => [
    source,
    selectedQuestions.filter((question) => question.source === source).length,
  ]),
);
const verifiedQuestions = selectedQuestions.filter((question) => verified.has(question.qid));
const passCount = verifiedQuestions.filter((question) => verified.get(question.qid).projected_verdict === "pass").length;
const correctedCount = verifiedQuestions.length - passCount;
const excludedQuestions = projected.questions.filter((question) => !selectedSet.has(question.qid));
const excludedBySubject = Object.fromEntries(Object.keys(SUBJECT_TARGETS).map((subject) => [
  subject,
  excludedQuestions.filter((question) => question.subject_id === subject).length,
]));
const excludedBySource = Object.fromEntries(
  [...new Set(projected.questions.map((question) => question.source))].sort().map((source) => [
    source,
    excludedQuestions.filter((question) => question.source === source).length,
  ]),
);

const generatedAt = new Date().toISOString();
const bank = {
  schema_version: 2,
  generated_at: generatedAt,
  selection_id: BUILD_ID,
  question_count: selectedQuestions.length,
  medical_review: {
    verified_count: verifiedQuestions.length,
    unreviewed_count: selectedQuestions.length - verifiedQuestions.length,
    complete: verifiedQuestions.length === selectedQuestions.length,
  },
  questions: selectedQuestions,
};
const bankText = `${JSON.stringify(bank, null, 2)}\n`;
const bankSha256 = sha256(bankText);

const selection = {
  schema_version: 2,
  batch_id: BUILD_ID,
  generated_at: generatedAt,
  prerequisite_batch_ids: expectedBatchIds,
  target_count: TARGET_COUNT,
  subject_targets: SUBJECT_TARGETS,
  updates: [],
  deletions: excludedQuestions.map((question) => ({
    remove_qid: question.qid,
    expected_fingerprint: question.content_fingerprint,
    deletion_kind: "curation_exclusion",
    allow_image_asset_deletion: true,
    reason: "Excluded from the clean 3,000 curation after medical-review prioritization, structural validation, quality scoring, subject balancing, and unresolved semantic-conflict separation.",
  })),
};
const report = {
  schema_version: 2,
  generated_at: generatedAt,
  selection_id: BUILD_ID,
  target_count: TARGET_COUNT,
  input_snapshot_count: snapshot.question_count,
  prior_removal_count: projected.removed.size,
  post_remediation_count: projected.questions.length,
  curation_exclusion_count: excludedQuestions.length,
  retained_count: selectedQuestions.length,
  medically_verified_count: verifiedQuestions.length,
  medically_unreviewed_count: selectedQuestions.length - verifiedQuestions.length,
  medical_review_complete: verifiedQuestions.length === selectedQuestions.length,
  reviewed_pass_survivor_count: passCount,
  corrected_survivor_count: correctedCount,
  unresolved_semantic_candidates_evaluated: unresolvedPairs.length,
  retained_unresolved_semantic_pairs: selectedUnresolvedPairs.length,
  structural_validation_failures_in_selected_bank: [],
  structurally_invalid_candidates_excluded: selectionResult.structuralFailures,
  selection_attempt: selectionResult.attempt,
  eligible_pool_count: selectionResult.eligibleCount,
  subject_targets: SUBJECT_TARGETS,
  retained_by_subject: retainedBySubject,
  retained_by_source: retainedBySource,
  excluded_by_subject: excludedBySubject,
  excluded_by_source: excludedBySource,
  medically_verified_qids: verifiedQuestions.map((question) => question.qid),
  medically_unreviewed_qids: selectedQuestions
    .filter((question) => !verified.has(question.qid))
    .map((question) => question.qid),
  kept_qids: selectedQuestions.map((question) => question.qid),
  excluded_qids: excludedQuestions.map((question) => question.qid),
  input_sha256: {
    snapshot: sha256(snapshotText),
    reviews: sha256(reviewsText),
    deterministic_batch: sha256(deterministicText),
    medical_batch: sha256(medicalText),
    semantic_batch: sha256(semanticText),
    targeted_medical_batch: sha256(targetedMedicalText),
    semantic_audit: sha256(semanticAuditText),
  },
  bank_path: relative(projectDirectory, paths.bank),
  bank_sha256: bankSha256,
};

await mkdir(outputDirectory, { recursive: true });
await Promise.all([
  writeFile(paths.bank, bankText, "utf8"),
  writeFile(paths.selection, `${JSON.stringify(selection, null, 2)}\n`, "utf8"),
  writeFile(paths.report, `${JSON.stringify(report, null, 2)}\n`, "utf8"),
]);
console.log(JSON.stringify({
  bank: relative(projectDirectory, paths.bank),
  selection: relative(projectDirectory, paths.selection),
  report: relative(projectDirectory, paths.report),
  retained_count: report.retained_count,
  medically_verified_count: report.medically_verified_count,
  medically_unreviewed_count: report.medically_unreviewed_count,
  retained_unresolved_semantic_pairs: report.retained_unresolved_semantic_pairs,
  structural_validation_failures_in_selected_bank: report.structural_validation_failures_in_selected_bank.length,
  retained_by_subject: report.retained_by_subject,
  retained_by_source: report.retained_by_source,
  bank_sha256: report.bank_sha256,
}, null, 2));
