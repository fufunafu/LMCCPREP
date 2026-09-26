import { expect, signInDemo, test } from "./fixtures";
import type { Page } from "@playwright/test";
import type { StudySnapshot } from "../../lib/study-core";

async function savedSnapshot(page: Page): Promise<StudySnapshot> {
  return page.evaluate(() => new Promise((resolve, reject) => {
    const open = indexedDB.open("montreal-study-v1", 1);
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result;
      const tx = db.transaction("records", "readonly");
      const read = tx.objectStore("records").get("demo-user:mccqe");
      tx.oncomplete = () => { resolve(read.result); db.close(); };
      tx.onerror = () => { reject(tx.error); db.close(); };
    };
  }));
}

for (const exhausted of [false, true]) {
  test(exhausted ? "exhausted new questions offer review without recycling old answers" : "daily practice uses new questions and keeps replacement skips separate from due review", async ({ page }) => {
    let seed: StudySnapshot;
    await page.route("**/api/study/snapshot", async (route) => {
      seed = await (await route.fetch()).json();
      const past = new Date(Date.now() - 3 * 86400_000).toISOString();
      seed.plan = { examDate: new Date(Date.now() + 30 * 86400_000).toISOString().slice(0, 10), minutesPerDay: 60, minutesPerQuestion: 1 };
      seed.attempts = seed.questions.slice(0, exhausted ? undefined : 2).map((q, i) => ({ sessionId: "past-session", questionId: q.id, chosenIdx: i ? q.answerIdx : null, correct: i > 0, timeMs: 5000, createdAt: past }));
      await route.fulfill({ json: seed });
    });
    await signInDemo(page);
    const review = page.getByRole("button", { name: "Start due review", exact: true });
    await expect(review).toBeEnabled();
    if (exhausted) {
      await expect(page.getByRole("button", { name: "No new questions remaining", exact: true })).toBeDisabled();
      await expect(page.getByRole("button", { name: /^Start today/ })).toHaveCount(0);
      return;
    }
    await page.getByRole("button", { name: "Start today’s 20 new questions", exact: true }).click();
    await expect(page.getByText("Q 1 / 20", { exact: true })).toBeVisible();
    const sessionId = new URL(page.url()).pathname.split("/").at(-1)!;
    const session = (await savedSnapshot(page)).sessions[sessionId];
    expect(session.filters.status).toBe("unused");
    expect(session.questionIds).toHaveLength(20);
    for (const answer of seed!.attempts) expect(session.questionIds).not.toContain(answer.questionId);
    const original = await page.getByText(/^Question ID /).textContent();
    await page.getByRole("button", { name: "Skip question", exact: true }).click();
    await expect(page.getByText(/^Question ID /)).not.toHaveText(original!);
    const replaced = (await savedSnapshot(page)).sessions[sessionId];
    for (const answer of seed!.attempts) expect(replaced.questionIds).not.toContain(answer.questionId);
    await page.goto("/dashboard");
    await review.click();
    await expect(page.getByText("Q 1 / 1", { exact: true })).toBeVisible();
    await expect(page.getByText(/^Question ID /)).toHaveText(`Question ID ${seed!.questions[0].qid}`);
  });
}

test("tutor timer counts up, freezes on answer, and restores saved time", async ({ page, consoleErrors }) => {
  void consoleErrors;
  await page.clock.install();
  await signInDemo(page);
  await page.goto("/session/demo?mode=tutor");
  const timer = page.getByRole("timer");
  await expect(timer).toHaveAttribute("aria-label", /elapsed$/);
  await page.clock.fastForward(8000);
  await expect(timer).toHaveText(/00:0[89]/);
  await page.getByRole("radio", { name: /C A soft, position-dependent systolic sound/ }).click();
  await expect(page.getByRole("region", { name: "Answer explanation" })).toBeVisible();
  const savedTime = await timer.textContent();
  await page.clock.fastForward(65_000);
  await expect(timer).toHaveText(savedTime!);
  await page.reload();
  await expect(timer).toHaveText(savedTime!);
  const navigation = page.getByRole("group", { name: "Question navigation" });
  await navigation.getByRole("button", { name: "Next question", exact: true }).click();
  await expect(page.getByText("Q 2 / 20", { exact: true })).toBeVisible();
  await expect(timer).toHaveText("00:00");
  await page.clock.fastForward(100_000);
  await expect(timer).toHaveText(/01:4[01]/);
  await expect(page.getByText("Q 2 / 20", { exact: true })).toBeVisible();
  await expect(page.getByRole("radio").first()).toBeEnabled();
  await navigation.getByRole("button", { name: "Previous question" }).click();
  await expect(page.getByText("Q 1 / 20", { exact: true })).toBeVisible();
  await expect(timer).toHaveText(savedTime!);
});
