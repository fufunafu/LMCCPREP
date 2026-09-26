import { expect, signInDemo, test } from "./fixtures";
import type { StudySnapshot } from "../../lib/study-core";

for (const offline of [false, true]) {
  test(`save and exit resumes the same question and saved answer${offline ? " offline" : " after reload"}`, async ({ page, context }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    if (offline) await page.setViewportSize({ width: 390, height: 844 });
    await signInDemo(page);
    if (offline) {
      await page.goto("/settings");
      await page.getByRole("button", { name: "Download offline study", exact: true }).click();
      await expect(page.getByText("Offline study is ready.", { exact: false })).toBeVisible({ timeout: 60_000 });
    }
    await page.goto("/session/demo?mode=tutor");
    await page.getByRole("radio", { name: /3 A soft, position-dependent systolic sound/ }).click();
    await page.getByRole("group", { name: "Question navigation" }).getByRole("button", { name: "Next question", exact: true }).click();
    await expect(page.getByText("Q 2 / 20", { exact: true })).toBeVisible();
    const qid = await page.getByText(/^Question ID /).textContent();
    if (offline) await context.setOffline(true);
    if (!offline) await page.getByLabel("Question tools", { exact: true }).click();
    await page.getByRole("button", { name: "Save and exit", exact: true }).click();
    const resume = page.getByRole("region", { name: "Continue where you left off" });
    await expect(resume).toContainText("1 of 20 answered · Question 2");
    await page.reload();
    await expect(resume).toContainText("1 of 20 answered · Question 2");
    await resume.getByRole("link", { name: "Continue session", exact: true }).click();
    await expect(page.getByText(/^Question ID /)).toHaveText(qid!);
    await page.getByRole("group", { name: "Question navigation" }).getByRole("button", { name: "Previous question" }).click();
    await expect(page.getByRole("radio", { name: /3 A soft, position-dependent systolic sound, correct answer/ })).toBeVisible();
    await expect(page.getByText("1 of 20 answered", { exact: true })).toHaveCount(1);
    expect(pageErrors).toEqual([]);
    if (offline) await context.setOffline(false);
  });
}

test("started session remains prominent behind newer empty or finished sessions", async ({ page }) => {
  await page.route("**/api/study/snapshot", async (route) => {
    const snapshot: StudySnapshot = await (await route.fetch()).json();
    const active = snapshot.sessions.demo;
    active.cursor = 1; active.currentIndex = 1;
    snapshot.attempts = [{ sessionId: "demo", questionId: active.questionIds[0], chosenIdx: 2, correct: true, timeMs: 1000, createdAt: active.createdAt }];
    for (let i = 1; i <= 6; i++) {
      const createdAt = new Date(Date.parse(active.createdAt) + i * 60_000).toISOString();
      snapshot.sessions[`new-${i}`] = { ...active, id: `new-${i}`, cursor: 0, currentIndex: 0, createdAt, ...(i > 2 ? { finishedAt: createdAt } : {}) };
    }
    snapshot.sessions.unavailable = { ...active, id: "unavailable", questionIds: ["not-in-this-bank"] };
    await route.fulfill({ json: snapshot });
  });
  await signInDemo(page);
  await expect(page.getByRole("link", { name: "Resume session", exact: true })).toHaveAttribute("href", "/session/demo?mode=tutor");
  const resume = page.getByRole("region", { name: "Continue where you left off" });
  await expect(resume).toContainText("1 of 20 answered · Question 2");
  await resume.getByText("Other unfinished sessions (2)", { exact: true }).click();
  await expect(resume.locator('a[href="/session/new-1?mode=tutor"]')).toBeVisible();
  await expect(resume.locator('a[href="/session/new-2?mode=tutor"]')).toBeVisible();
  await expect(resume.locator('a[href*="unavailable"]')).toHaveCount(0);
  await resume.getByRole("link", { name: "Continue session", exact: true }).click();
  await expect(page.getByText("Q 2 / 20", { exact: true })).toBeVisible();
});

test("finished sessions are reviewed instead of offered for resume", async ({ page }) => {
  await page.route("**/api/study/snapshot", async (route) => {
    const snapshot: StudySnapshot = await (await route.fetch()).json();
    snapshot.sessions.demo.finishedAt = new Date().toISOString();
    await route.fulfill({ json: snapshot });
  });
  await signInDemo(page);
  await expect(page.getByRole("link", { name: "Start practicing", exact: true })).toHaveAttribute("href", "/create");
  await expect(page.getByRole("region", { name: "Continue where you left off" })).toHaveCount(0);
  await expect(page.locator('a[href="/session/demo/review"]')).toBeVisible();
});
