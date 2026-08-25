#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const projectDirectory = resolve(scriptDirectory, "..");
const snapshotPath = resolve(projectDirectory, "audit-output", "question-review-snapshot.json");
const adjudicationPath = resolve(projectDirectory, "audit-output", "semantic-pair-adjudications-v1.json");
const batchFlagIndex = process.argv.indexOf("--batch");
const batchPath = batchFlagIndex >= 0 && process.argv[batchFlagIndex + 1]
  ? resolve(process.cwd(), process.argv[batchFlagIndex + 1])
  : null;
if (batchFlagIndex >= 0 && !batchPath) throw new Error("--batch requires a JSON file path.");
const outputPath = resolve(
  projectDirectory,
  "audit-output",
  batchPath ? "question-semantic-audit-preview.json" : "question-semantic-audit.json",
);

const STOP_WORDS = new Set([
  "about", "above", "after", "again", "against", "among", "because", "before", "being",
  "below", "between", "could", "during", "following", "from", "have", "having", "into",
  "most", "other", "patient", "patients", "should", "than", "that", "their", "there",
  "these", "they", "this", "those", "through", "under", "very", "what", "when", "where",
  "which", "while", "with", "would", "year", "years", "following", "appropriate", "likely",
  "best", "next", "step", "male", "female", "woman", "women", "man", "child", "infant",
  "presents", "present", "reports", "history", "examination", "reveals", "results", "shows",
]);

const ANSWER_NOISE_WORDS = new Set([
  "administer", "administration", "begin", "choice", "continue", "discontinue", "immediate",
  "immediately", "initiate", "initial", "management", "most", "option", "perform", "proceed",
  "recommend", "recommended", "start", "therapy", "treatment", "with", "without",
]);

const EXPLICIT_ASSET_PATTERN = /(?:see (?:the )?(?:picture|image|figure|photograph|photo|chart|graph|tracing)|(?:picture|image|figure|photograph|photo|chart|graph|tracing) (?:shown|below|above)|shown (?:in|on) (?:the )?(?:picture|image|figure|photograph|photo|chart|graph|tracing)|this (?:picture|image|figure|photograph|photo|chart|graph|tracing)|pictured (?:above|below)|(?:following|below|above) (?:picture|image|figure|photograph|photo|chart|graph|tracing)|based on (?:the )?(?:picture|image|figure|photograph|photo|chart|graph|tracing))/iu;
const EMBEDDED_OPTION_PATTERN = /(?:^|\n)\s*(?:i\s*)?[a-e][.)]\s+[^\n]{2,100}\s*$/iu;
const FIFTH_OPTION_REFERENCE_PATTERN = /(?:choice|option)\s*(?:e|5)|\(e\)/iu;

function normalize(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/https?:\/\/\S+/gu, " ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/gu, " ");
}

function compact(value) {
  return normalize(value).replace(/\s+/gu, "");
}

function canonicalAnswer(value) {
  return normalize(value)
    .replace(/\bcomputed tomography(?: scan)?\b/gu, "ct")
    .replace(/\bmagnetic resonance imaging\b/gu, "mri")
    .replace(/\bkaryotyp(?:e|ing)(?: analysis)?\b/gu, "karyotype")
    .replace(/\bangiotensin converting enzyme\b/gu, "ace")
    .replace(/\bcaesarean\b/gu, "cesarean")
    .split(" ")
    .filter((token) => token && !ANSWER_NOISE_WORDS.has(token))
    .join(" ");
}

function tokens(value) {
  return normalize(value)
    .split(" ")
    .filter((token) => token.length >= 3 && !STOP_WORDS.has(token));
}

function features(value) {
  const words = tokens(value);
  const output = [...words];
  for (let index = 0; index < words.length - 1; index += 1) {
    output.push(`${words[index]}_${words[index + 1]}`);
  }
  return output;
}

function setJaccard(left, right) {
  if (!left.size && !right.size) return 1;
  let shared = 0;
  for (const value of left) if (right.has(value)) shared += 1;
  return shared / (left.size + right.size - shared);
}

function cosine(left, right) {
  const smaller = left.size <= right.size ? left : right;
  const larger = left.size <= right.size ? right : left;
  let dot = 0;
  for (const [feature, weight] of smaller) dot += weight * (larger.get(feature) ?? 0);
  const leftMagnitude = Math.sqrt([...left.values()].reduce((sum, weight) => sum + weight ** 2, 0));
  const rightMagnitude = Math.sqrt([...right.values()].reduce((sum, weight) => sum + weight ** 2, 0));
  return leftMagnitude && rightMagnitude ? dot / (leftMagnitude * rightMagnitude) : 0;
}

function answerText(question) {
  return Array.isArray(question.options) && Number.isInteger(question.answer_index)
    ? question.options[question.answer_index] ?? ""
    : "";
}

function taskText(stem) {
  const parts = String(stem ?? "").split(/(?<=[?.!])\s+|\n+/u).map((part) => part.trim()).filter(Boolean);
  return parts.slice(-2).join(" ");
}

function pairKey(left, right) {
  return left < right ? `${left}:${right}` : `${right}:${left}`;
}

const snapshot = JSON.parse(await readFile(snapshotPath, "utf8"));
const adjudicationFile = JSON.parse(await readFile(adjudicationPath, "utf8"));
if (!Array.isArray(adjudicationFile.adjudications)) {
  throw new Error(`${adjudicationPath} must contain an adjudications array.`);
}
const snapshotByQid = new Map(snapshot.questions.map((question) => [question.qid, question]));
const adjudicationByPair = new Map();
for (const adjudication of adjudicationFile.adjudications) {
  const {
    left_qid: leftQid,
    left_fingerprint: leftFingerprint,
    right_qid: rightQid,
    right_fingerprint: rightFingerprint,
    status,
  } = adjudication;
  if (!Number.isInteger(leftQid) || !Number.isInteger(rightQid) || leftQid === rightQid) {
    throw new Error(`Invalid adjudication question IDs: ${JSON.stringify(adjudication)}`);
  }
  if (!new Set(["intentional_distinct", "pending_delete"]).has(status)) {
    throw new Error(`Invalid adjudication status for ${leftQid}:${rightQid}: ${status}`);
  }
  const key = pairKey(leftQid, rightQid);
  if (adjudicationByPair.has(key)) throw new Error(`Duplicate adjudication for ${key}.`);

  const leftQuestion = snapshotByQid.get(leftQid);
  const rightQuestion = snapshotByQid.get(rightQid);
  if (status === "intentional_distinct" && (!leftQuestion || !rightQuestion)) {
    throw new Error(`Intentional-distinct adjudication ${key} refers to a missing question.`);
  }
  if (status === "pending_delete") {
    if (![leftQid, rightQid].includes(adjudication.remove_qid)) {
      throw new Error(`Pending deletion ${key} has an invalid remove_qid.`);
    }
    if (![leftQid, rightQid].includes(adjudication.keep_qid) || adjudication.keep_qid === adjudication.remove_qid) {
      throw new Error(`Pending deletion ${key} has an invalid keep_qid.`);
    }
    if (!snapshotByQid.has(adjudication.keep_qid)) {
      throw new Error(`Pending deletion ${key} refers to a missing survivor.`);
    }
  }
  if (leftQuestion && leftQuestion.content_fingerprint !== leftFingerprint) {
    throw new Error(`Stale left fingerprint in adjudication ${key}.`);
  }
  if (rightQuestion && rightQuestion.content_fingerprint !== rightFingerprint) {
    throw new Error(`Stale right fingerprint in adjudication ${key}.`);
  }
  adjudicationByPair.set(key, adjudication);
}
let questions = snapshot.questions;
let appliedBatchId = null;
if (batchPath) {
  const batch = JSON.parse(await readFile(batchPath, "utf8"));
  const updateByQid = new Map((batch.updates ?? []).map((update) => [update.qid, update.patch ?? {}]));
  const removedQids = new Set((batch.deletions ?? []).map((deletion) => deletion.remove_qid));
  questions = questions
    .filter((question) => !removedQids.has(question.qid))
    .map((question) => ({ ...question, ...(updateByQid.get(question.qid) ?? {}) }));
  appliedBatchId = batch.batch_id ?? null;
}
const byQid = new Map(questions.map((question) => [question.qid, question]));
const tokenSets = new Map();
const answerSets = new Map();
const answerConceptSets = new Map();
const taskSets = new Map();
const featureLists = new Map();
const documentFrequency = new Map();

for (const question of questions) {
  const list = features(question.stem);
  const unique = new Set(list);
  featureLists.set(question.qid, list);
  tokenSets.set(question.qid, new Set(tokens(question.stem)));
  answerSets.set(question.qid, new Set(tokens(answerText(question))));
  answerConceptSets.set(question.qid, new Set(tokens(canonicalAnswer(answerText(question)))));
  taskSets.set(question.qid, new Set(tokens(taskText(question.stem))));
  for (const feature of unique) documentFrequency.set(feature, (documentFrequency.get(feature) ?? 0) + 1);
}

const vectors = new Map();
const inverted = new Map();
for (const question of questions) {
  const counts = new Map();
  for (const feature of featureLists.get(question.qid)) counts.set(feature, (counts.get(feature) ?? 0) + 1);
  const vector = new Map();
  for (const [feature, count] of counts) {
    const df = documentFrequency.get(feature) ?? 1;
    const weight = (1 + Math.log(count)) * Math.log((questions.length + 1) / (df + 1));
    vector.set(feature, weight);
    if (df <= 120) {
      const ids = inverted.get(feature) ?? [];
      ids.push(question.qid);
      inverted.set(feature, ids);
    }
  }
  vectors.set(question.qid, vector);
}

const candidatePairs = new Set();
for (const question of questions) {
  const rareFeatures = [...new Set(featureLists.get(question.qid))]
    .filter((feature) => (documentFrequency.get(feature) ?? Infinity) <= 120)
    .sort((left, right) => (documentFrequency.get(left) ?? 0) - (documentFrequency.get(right) ?? 0))
    .slice(0, 18);
  for (const feature of rareFeatures) {
    for (const candidateQid of inverted.get(feature) ?? []) {
      if (candidateQid !== question.qid) candidatePairs.add(pairKey(question.qid, candidateQid));
    }
  }
}

const answerGroups = new Map();
const canonicalAnswerGroups = new Map();
const topicGroups = new Map();
for (const question of questions) {
  const normalizedAnswer = normalize(answerText(question));
  if (normalizedAnswer.length >= 3) {
    const key = `${question.subject_id}|${normalizedAnswer}`;
    const group = answerGroups.get(key) ?? [];
    group.push(question.qid);
    answerGroups.set(key, group);
  }
  const normalizedConcept = canonicalAnswer(answerText(question));
  if (normalizedConcept.length >= 3) {
    const key = `${question.subject_id}|${normalizedConcept}`;
    const group = canonicalAnswerGroups.get(key) ?? [];
    group.push(question.qid);
    canonicalAnswerGroups.set(key, group);
  }
  const topicGroup = topicGroups.get(question.topic_id) ?? [];
  topicGroup.push(question.qid);
  topicGroups.set(question.topic_id, topicGroup);
}

for (const group of [...answerGroups.values(), ...canonicalAnswerGroups.values(), ...topicGroups.values()]) {
  if (group.length > 180) continue;
  for (let left = 0; left < group.length; left += 1) {
    for (let right = left + 1; right < group.length; right += 1) {
      candidatePairs.add(pairKey(group[left], group[right]));
    }
  }
}

const semanticCandidates = [];
for (const key of candidatePairs) {
  const [leftQid, rightQid] = key.split(":").map(Number);
  const left = byQid.get(leftQid);
  const right = byQid.get(rightQid);
  if (!left || !right || left.subject_id !== right.subject_id) continue;

  const stemCosine = cosine(vectors.get(leftQid), vectors.get(rightQid));
  const stemJaccard = setJaccard(tokenSets.get(leftQid), tokenSets.get(rightQid));
  const answerSimilarity = setJaccard(answerSets.get(leftQid), answerSets.get(rightQid));
  const answerConceptSimilarity = setJaccard(answerConceptSets.get(leftQid), answerConceptSets.get(rightQid));
  const taskSimilarity = setJaccard(taskSets.get(leftQid), taskSets.get(rightQid));
  const answerExact = normalize(answerText(left)) === normalize(answerText(right));
  const answerConceptExact = canonicalAnswer(answerText(left)) === canonicalAnswer(answerText(right));
  const sameTopic = left.topic_id === right.topic_id;
  const exactStem = compact(left.stem) === compact(right.stem);
  const optionSimilarity = setJaccard(
    new Set(left.options.map(normalize)),
    new Set(right.options.map(normalize)),
  );

  const score = (
    stemCosine * 0.42
    + stemJaccard * 0.18
    + answerSimilarity * 0.14
    + answerConceptSimilarity * 0.06
    + taskSimilarity * 0.1
    + optionSimilarity * 0.1
    + (answerExact ? 0.03 : 0)
    + (answerConceptExact ? 0.01 : 0)
    + (sameTopic ? 0.02 : 0)
  );
  const include = exactStem
    || stemCosine >= 0.76
    || (sameTopic && stemCosine >= 0.42 && stemJaccard >= 0.18)
    || (answerExact && stemCosine >= 0.46 && (stemJaccard >= 0.23 || taskSimilarity >= 0.5))
    || (answerConceptExact && stemCosine >= 0.3 && (stemJaccard >= 0.12 || taskSimilarity >= 0.25 || optionSimilarity >= 0.35))
    || (answerConceptSimilarity >= 0.65 && stemCosine >= 0.34 && (sameTopic || stemJaccard >= 0.16))
    || (answerSimilarity >= 0.8 && optionSimilarity >= 0.6 && stemCosine >= 0.4);
  if (!include) continue;

  semanticCandidates.push({
    left_qid: leftQid,
    right_qid: rightQid,
    classification: exactStem ? "exact_stem" : score >= 0.72 ? "likely_near_duplicate" : "semantic_review",
    score: Number(score.toFixed(4)),
    stem_cosine: Number(stemCosine.toFixed(4)),
    stem_jaccard: Number(stemJaccard.toFixed(4)),
    answer_similarity: Number(answerSimilarity.toFixed(4)),
    answer_concept_similarity: Number(answerConceptSimilarity.toFixed(4)),
    task_similarity: Number(taskSimilarity.toFixed(4)),
    option_similarity: Number(optionSimilarity.toFixed(4)),
    same_topic: sameTopic,
    answer_exact: answerExact,
    answer_concept_exact: answerConceptExact,
    left_topic: left.topic_id,
    right_topic: right.topic_id,
    left_answer: answerText(left),
    right_answer: answerText(right),
    left_stem: left.stem,
    right_stem: right.stem,
  });
}

semanticCandidates.sort((left, right) => right.score - left.score);

const annotatedSemanticCandidates = semanticCandidates.map((candidate) => {
  const adjudication = adjudicationByPair.get(pairKey(candidate.left_qid, candidate.right_qid));
  if (!adjudication) return candidate;
  return {
    ...candidate,
    adjudication: {
      status: adjudication.status,
      reason: adjudication.reason,
      ...(adjudication.remove_qid ? { remove_qid: adjudication.remove_qid } : {}),
      ...(adjudication.keep_qid ? { keep_qid: adjudication.keep_qid } : {}),
    },
  };
});
const unresolvedSemanticCandidates = annotatedSemanticCandidates.filter((candidate) => !candidate.adjudication);
const intentionalDistinctCandidates = annotatedSemanticCandidates.filter(
  (candidate) => candidate.adjudication?.status === "intentional_distinct",
);
const pendingResolutionCandidates = annotatedSemanticCandidates.filter(
  (candidate) => candidate.adjudication?.status === "pending_delete",
);

const structuralCandidates = [];
for (const question of questions) {
  const explanationText = Array.isArray(question.explanation) ? question.explanation.join("\n") : "";
  if (EMBEDDED_OPTION_PATTERN.test(question.stem)) {
    structuralCandidates.push({ qid: question.qid, code: "possible_option_embedded_in_stem", stem: question.stem });
  }
  if (question.options.length === 4 && FIFTH_OPTION_REFERENCE_PATTERN.test(`${question.stem}\n${explanationText}`)) {
    structuralCandidates.push({ qid: question.qid, code: "four_options_but_fifth_referenced", stem: question.stem });
  }
  if (
    EXPLICIT_ASSET_PATTERN.test(question.stem)
    && !question.figure_url
    && (!Array.isArray(question.image_assets) || question.image_assets.length === 0)
  ) {
    structuralCandidates.push({ qid: question.qid, code: "explicit_missing_asset_reference", stem: question.stem });
  }
}

const report = {
  schema_version: 1,
  generated_at: new Date().toISOString(),
  applied_batch_id: appliedBatchId,
  adjudication_set_id: adjudicationFile.adjudication_set_id ?? null,
  question_count: questions.length,
  semantic_candidate_count: annotatedSemanticCandidates.length,
  adjudicated_semantic_candidate_count: annotatedSemanticCandidates.length - unresolvedSemanticCandidates.length,
  intentional_distinct_count: intentionalDistinctCandidates.length,
  pending_resolution_count: pendingResolutionCandidates.length,
  unresolved_semantic_candidate_count: unresolvedSemanticCandidates.length,
  likely_or_exact_count: annotatedSemanticCandidates.filter((candidate) => candidate.classification !== "semantic_review").length,
  structural_candidate_count: structuralCandidates.length,
  semantic_candidates: annotatedSemanticCandidates,
  unresolved_semantic_candidates: unresolvedSemanticCandidates,
  structural_candidates: structuralCandidates,
};

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify({
  output: outputPath,
  question_count: report.question_count,
  semantic_candidate_count: report.semantic_candidate_count,
  intentional_distinct_count: report.intentional_distinct_count,
  pending_resolution_count: report.pending_resolution_count,
  unresolved_semantic_candidate_count: report.unresolved_semantic_candidate_count,
  likely_or_exact_count: report.likely_or_exact_count,
  structural_candidate_count: report.structural_candidate_count,
}, null, 2));
