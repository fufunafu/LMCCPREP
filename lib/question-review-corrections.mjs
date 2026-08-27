export function completeRedundantSupportFields(snapshotQuestion, patch) {
  const rewritesQuestionContent = ["stem", "options", "answer_index", "explanation"]
    .some((field) => Object.hasOwn(patch, field));
  if (!rewritesQuestionContent) return patch;

  const mergedQuestion = { ...snapshotQuestion, ...patch };
  const options = Array.isArray(mergedQuestion.options) ? mergedQuestion.options : [];
  const answerIndex = mergedQuestion.answer_index;
  const answerText = Number.isInteger(answerIndex) ? options[answerIndex] : null;
  const paragraphs = Array.isArray(mergedQuestion.explanation)
    ? mergedQuestion.explanation.map((paragraph) => paragraph?.trim()).filter(Boolean)
    : [];
  if (!answerText || paragraphs.length === 0) return patch;

  const supportParagraphs = paragraphs.length > 1 ? paragraphs.slice(1) : paragraphs;
  const primarySupport = supportParagraphs[0];
  const distractorSupport = supportParagraphs.at(-1);
  const completedPatch = { ...patch };
  if (!Object.hasOwn(completedPatch, "answer_key")) {
    completedPatch.answer_key = `The correct answer is Option ${answerIndex + 1}: ${answerText}. ${primarySupport}`;
  }
  if (!Object.hasOwn(completedPatch, "key_points")) {
    completedPatch.key_points = supportParagraphs.join("\n\n");
  }
  if (!Object.hasOwn(completedPatch, "option_explanations")) {
    completedPatch.option_explanations = Object.fromEntries(options.map((option, index) => [
      String(index),
      index === answerIndex
        ? `Correct. ${primarySupport}`
        : `Incorrect. The best answer is ${answerText}. ${distractorSupport}`,
    ]));
  }
  return completedPatch;
}
