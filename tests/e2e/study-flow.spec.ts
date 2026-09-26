import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import type { StudySnapshot } from "../../lib/study-core";
import { expect, signInDemo, test } from "./fixtures";

async function saved(page: Page): Promise<StudySnapshot> {
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

async function shortSession(page: Page, count: number, answered: number, mode: "tutor" | "timed" = "tutor") {
  await page.route("**/api/study/snapshot", async (route) => {
    const data: StudySnapshot = await (await route.fetch()).json();
    const session = data.sessions.demo;
    session.questionIds = session.questionIds.slice(0, count);
    session.cursor = count - 1;
    session.currentIndex = count - 1;
    session.mode = mode;
    session.secondsPerQuestion = 600;
    data.attempts = session.questionIds.slice(0, answered).map((id) => {
      const q = data.questions.find((question) => question.id === id)!;
      return { sessionId: "demo", questionId: id, chosenIdx: q.answerIdx, correct: true, timeMs: 5000, createdAt: new Date().toISOString() };
    });
    await route.fulfill({ json: data });
  });
  await signInDemo(page);
  await page.goto(`/session/demo?mode=${mode}`);
  await expect(page.getByText(`Q ${count} / ${count}`, { exact: true })).toBeVisible();
}

async function endSession(page: Page) {
  const button = page.getByRole("button", { name: "End session", exact: true });
  if (!await button.isVisible()) await page.getByLabel("Question tools", { exact: true }).click();
  await button.click();
}

test("answer shortcuts match numbered choices and ignore typing, eliminated choices and letters", async ({ page, consoleErrors }) => {
  void consoleErrors;
  await signInDemo(page);
  await page.goto("/session/demo?mode=tutor");
  await expect(page.getByText("Tap an answer or press 1–5 to submit.")).toBeVisible();
  await expect(page.getByRole("radio").locator("span[aria-hidden=true]")).toHaveText(["1", "2", "3", "4", "5"]);
  const notes = page.getByRole("textbox", { name: "Notes for this question" });
  await notes.fill("12345");
  await notes.press("3");
  await expect(page.getByRole("region", { name: "Answer explanation" })).toHaveCount(0);
  await page.getByRole("button", { name: "Strike out answer 2" }).click();
  await page.getByRole("heading", { name: "Question 1 of 20", exact: true }).focus();
  await page.keyboard.press("2");
  await page.keyboard.press("c");
  await expect(page.getByRole("region", { name: "Answer explanation" })).toHaveCount(0);
  await page.keyboard.press("3");
  await expect(page.getByText("Correct", { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("radio").nth(2).locator("span[aria-hidden=true]")).toHaveText("3");
  await page.getByRole("group", { name: "Question navigation" }).getByRole("button", { name: "Next question", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Question 2 of 20", exact: true })).toBeFocused();
  await page.keyboard.press("1");
  await expect(page.getByRole("region", { name: "Answer explanation" })).toBeVisible();
  const attempts = (await saved(page)).attempts;
  expect(attempts.map((attempt) => attempt.chosenIdx)).toEqual([2, 0]);
});

test("finish check returns to unanswered questions and fully answered sessions finish directly", async ({ page, consoleErrors }) => {
  void consoleErrors;
  await shortSession(page, 3, 1);
  const navigation = page.getByRole("group", { name: "Question navigation" });
  await navigation.getByRole("button", { name: "See results", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: "2 questions unanswered" })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Review unanswered" })).toBeFocused();
  await page.keyboard.press("1");
  expect((await saved(page)).attempts).toHaveLength(1);
  expect((await saved(page)).sessions.demo.finishedAt).toBeFalsy();
  const accessibility = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
  expect(accessibility.violations.filter((item) => ["serious", "critical"].includes(item.impact ?? ""))).toEqual([]);
  await dialog.getByRole("button", { name: "Review unanswered" }).click();
  await expect(page.getByText("Q 2 / 3", { exact: true })).toBeVisible();
  await page.getByRole("radio").first().click();
  await navigation.getByRole("button", { name: "Next question", exact: true }).click();
  await page.getByRole("radio").first().click();
  await navigation.getByRole("button", { name: "See results", exact: true }).click();
  await expect(page).toHaveURL(/\/session\/demo\/review\?mode=tutor$/);
  expect((await saved(page)).attempts).toHaveLength(3);
  expect((await saved(page)).sessions.demo.finishedAt).toBeTruthy();
});

for (const timeout of [false, true]) {
  test(`last timed ${timeout ? "timeout" : "answer"} checks earlier unanswered questions and finish preserves actual attempts`, async ({ page, consoleErrors }) => {
  void consoleErrors;
  if (timeout) await page.clock.install();
  await shortSession(page, 3, 0, "timed");
  if (timeout) await page.clock.fastForward(601_000);
  else await page.getByRole("radio").first().click();
  await expect(page.getByRole("dialog").getByRole("heading", { name: "2 questions unanswered" })).toBeVisible();
  expect((await saved(page)).attempts).toHaveLength(1);
  expect((await saved(page)).sessions.demo.finishedAt).toBeFalsy();
  await page.getByRole("button", { name: "Review unanswered" }).click();
  await expect(page.getByText("Q 1 / 3", { exact: true })).toBeVisible();
  await endSession(page);
  await page.getByRole("button", { name: "Finish anyway" }).click();
  await expect(page).toHaveURL(/\/session\/demo\/review\?mode=timed$/);
  expect((await saved(page)).attempts).toHaveLength(1);
  expect((await saved(page)).sessions.demo.finishedAt).toBeTruthy();
});

}

test("@mobile finish dialog can be dismissed without losing progress", async ({ page }, testInfo) => {
  await shortSession(page, 2, 1);
  await endSession(page);
  await expect(page.getByRole("heading", { name: "1 question unanswered" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("finish-dialog.png"), animations: "disabled" });
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect((await saved(page)).sessions.demo.finishedAt).toBeFalsy();
  await endSession(page);
  await page.getByRole("button", { name: "Finish anyway" }).click();
  await expect(page).toHaveURL(/\/session\/demo\/review\?mode=tutor$/);
  expect((await saved(page)).attempts).toHaveLength(1);
});

for (const offline of [false, true]) {
  test(`weak-topic practice creates and retains a focused session ${offline ? "offline" : "online"}`, async ({ page, context }, testInfo) => {
    test.setTimeout(90_000);
    let seed: StudySnapshot;
    await page.route("**/api/study/snapshot", async (route) => {
      seed = await (await route.fetch()).json();
      const q = seed.questions[0];
      seed.attempts = [{ sessionId: "demo", questionId: q.id, chosenIdx: 0, correct: false, timeMs: 5000, createdAt: new Date().toISOString() }];
      await route.fulfill({ json: seed });
    });
    await signInDemo(page);
    await expect.poll(() => Boolean(seed)).toBe(true);
    const topicId = seed!.questions[0].topicId;
    const topicName = seed!.topics.find((topic) => topic.id === topicId)!.name;
    const targetIds = seed!.questions.filter((q) => q.topicId === topicId).map((q) => q.id);
    if (offline) {
      await page.goto("/settings");
      await page.getByRole("button", { name: "Download offline study", exact: true }).click();
      await expect(page.getByText("Offline study is ready.", { exact: false })).toBeVisible({ timeout: 60_000 });
      await page.goto("/dashboard");
      await context.setOffline(true);
    }
    await expect(page.getByRole("button", { name: `Practice ${topicName}`, exact: true })).toBeEnabled();
    if (!offline) await page.screenshot({ path: testInfo.outputPath("weak-topic-practice.png"), fullPage: true });
    await page.getByRole("button", { name: `Practice ${topicName}`, exact: true }).click();
    await expect(page).toHaveURL(/\/session\/(?!demo)[\w-]+\?mode=tutor$/);
    await expect(page.getByText(`Q 1 / ${Math.min(20, targetIds.length)}`, { exact: true })).toBeVisible();
    const snapshot = await saved(page);
    const current = new URL(page.url());
    const sessionPath = current.hash ? new URL(current.hash.slice(1), current.origin).pathname : current.pathname;
    const sessionId = sessionPath.split("/").at(-1)!;
    const session = snapshot.sessions[sessionId];
    expect(session.mode).toBe("tutor");
    expect(session.filters.topicIds).toEqual([topicId]);
    expect(session.questionIds).toHaveLength(Math.min(20, targetIds.length));
    expect(session.questionIds.every((id) => targetIds.includes(id))).toBe(true);
    expect(snapshot.sessions.demo.questionIds).toEqual(seed!.sessions.demo.questionIds);
    expect(snapshot.attempts).toHaveLength(1);
    await page.reload();
    await expect(page.getByText(`Q 1 / ${session.questionIds.length}`, { exact: true })).toBeVisible();
    expect((await saved(page)).sessions[sessionId].questionIds).toEqual(session.questionIds);
    await context.setOffline(false);
  });
}
