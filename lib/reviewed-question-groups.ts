import { createHash } from "node:crypto";
import manifest from "@/lib/reviewed-question-groups.json";
import type { Question } from "@/lib/types";
export function questionFingerprint(q: Question) {
  const hash = createHash("sha256");
  for (const field of [q.stem, String(q.options.length), ...q.options, String(q.answerIdx)]) {
    const bytes = Buffer.from(field); hash.update(`${bytes.length}:`); hash.update(bytes);
  }
  return hash.digest("hex");
}
export function verifiedQuestionGroups(questions: Question[]): string[][] {
  const bank = new Map(questions.map((q) => [q.qid, q]));
  return manifest.groups.map((group) => group.flatMap((member) => { const q = bank.get(member.qid); return q && questionFingerprint(q) === member.fingerprint ? [q.id] : []; })).filter((group) => group.length > 1);
}
