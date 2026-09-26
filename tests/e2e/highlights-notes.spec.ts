import type { Page } from "@playwright/test";
import { expect, signInDemo, test } from "./fixtures";

async function selectText(page: Page, region: string, start: number, end: number) {
  await page.locator(`[data-highlight-region="${region}"]`).evaluate((element, span) => {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    const range = document.createRange(); let offset = 0; let started = false;
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const length = node.textContent?.length ?? 0;
      if (!started && span.start < offset + length) { range.setStart(node, span.start - offset); started = true; }
      if (started && span.end <= offset + length) { range.setEnd(node, span.end - offset); break; }
      offset += length;
    }
    window.getSelection()?.removeAllRanges(); window.getSelection()?.addRange(range);
  }, { start, end });
}
async function painted(page: Page) {
  return page.evaluate(() => Array.from(CSS.highlights.entries()).filter(([name]) => name.startsWith("question-")).flatMap(([, highlights]) => Array.from(highlights).map((range) => range.toString())));
}

test("question highlights and sidebar notes survive navigation and offline reload", async ({ page, context }) => {
  test.setTimeout(120_000);
  page.setDefaultTimeout(15_000);
  // A local demo fixture exercises selections across real Markdown elements.
  await page.route("**/api/study/snapshot", async (route) => {
    const snapshot = await (await route.fetch()).json();
    snapshot.questions[0].stem = "A **bold clinical finding** needs careful review. What is the best next step?";
    await route.fulfill({ json: snapshot });
  });
  await signInDemo(page);
  await page.goto("/settings");
  await page.getByRole("button", { name: "Download offline study", exact: true }).click();
  await expect(page.getByText("Offline study is ready.", { exact: false })).toBeVisible({ timeout: 60_000 });
  await page.goto("/session/demo?mode=tutor");
  await expect(page.getByText("Select question or explanation text to highlight.")).toBeVisible();
  await selectText(page, "stem", 2, 30);
  await page.getByRole("button", { name: "Highlight", exact: true }).click();
  await expect.poll(() => painted(page)).toEqual(["bold clinical finding needs "]);
  await expect(page.getByText(/saved highlight/)).toHaveCount(0);
  await expect(page.getByText("0 of 20 answered", { exact: true })).toBeVisible();
  await page.getByLabel("Notes for this question", { exact: true }).fill("Compare the clinical findings first.");
  await page.getByRole("button", { name: "Save notes", exact: true }).click();
  await expect(page.getByText("Note saved", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Go to question 2, unanswered", exact: true }).first().click();
  await expect(page.getByLabel("Notes for this question", { exact: true })).toHaveValue("Review the Ottawa ankle rules and their exclusions.");
  await expect.poll(() => painted(page)).toEqual([]);
  await page.getByRole("button", { name: /^Go to question 1, unanswered/ }).first().click();
  await expect.poll(() => painted(page)).toEqual(["bold clinical finding needs "]);
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByLabel("Notes for this question", { exact: true })).toHaveValue("Compare the clinical findings first.");
  await expect.poll(() => painted(page)).toEqual(["bold clinical finding needs "]);
  await page.getByRole("radio").first().click();
  await selectText(page, "summary", 0, 20);
  await page.getByRole("button", { name: "Highlight", exact: true }).click();
  await expect.poll(async () => (await painted(page)).length).toBe(2);
  await page.getByLabel("Notes for this question", { exact: true }).fill("Updated offline.");
  await page.getByRole("button", { name: "Save notes", exact: true }).click();
  await expect(page.getByText("Note saved", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Notes for this question", { exact: true })).toHaveValue("Updated offline.");
  await expect.poll(async () => (await painted(page)).length).toBe(2);
  await selectText(page, "stem", 4, 10);
  await page.getByRole("button", { name: "Remove", exact: true }).click();
  await expect.poll(async () => (await painted(page)).length).toBe(1);
  await selectText(page, "summary", 0, 10);
  await page.getByRole("button", { name: "Remove", exact: true }).click();
  await expect.poll(() => painted(page)).toEqual([]);
  await page.reload();
  await expect(page.getByLabel("Notes for this question", { exact: true })).toHaveValue("Updated offline.");
  await expect(page.getByText(/saved highlight/)).toHaveCount(0);
  await context.setOffline(false);
});

test("@mobile selection toolbar and notes fit a narrow screen", async ({ page }) => {
  await signInDemo(page);
  await page.goto("/session/demo?mode=tutor");
  await page.locator('[data-highlight-region="stem"]').scrollIntoViewIfNeeded();
  await selectText(page, "stem", 0, 30);
  const toolbar = page.getByRole("group", { name: "Text highlighting", exact: true });
  await expect(toolbar).toBeVisible();
  const bounds = await toolbar.boundingBox();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  await page.getByRole("button", { name: "Highlight", exact: true }).tap();
  await expect.poll(async () => (await painted(page)).length).toBe(1);
  await expect(page.getByText(/saved highlight/)).toHaveCount(0);
  await page.getByLabel("Notes for this question", { exact: true }).fill("A mobile note.");
  await page.getByRole("button", { name: "Save notes", exact: true }).tap();
  await expect(page.getByText("Note saved", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Notes for this question", { exact: true })).toHaveValue("A mobile note.");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
