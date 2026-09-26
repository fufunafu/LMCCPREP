import { expect, signInDemo, test } from "./fixtures";
import type { StudyOperation, StudySnapshot } from "../../lib/study-core";

test("initial study download can be retried without reloading", async ({ page }) => {
  let fail = true;
  await page.route("**/api/study/snapshot", (route) => fail ? route.fulfill({ status: 503, json: { error: "Temporary study outage" } }) : route.continue());
  await signInDemo(page);
  await expect(page.getByRole("button", { name: "Retry study data" })).toBeEnabled();
  await page.getByRole("navigation", { name: "Main navigation" }).getByRole("link", { name: "Settings", exact: true }).click();
  await expect(page.getByRole("button", { name: "Download offline study", exact: true })).toBeEnabled();
  fail = false;
  await page.getByRole("button", { name: "Refresh my progress", exact: true }).click();
  await expect(page.getByText(/30 questions saved/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Retry study data" })).toHaveCount(0);
});

test("a temporary snapshot outage preserves offline access", async ({ page, context }) => {
  await signInDemo(page);
  await page.goto("/settings");
  await page.getByRole("button", { name: "Download offline study", exact: true }).click();
  await expect(page.getByText("Offline study is ready.", { exact: false })).toBeVisible({ timeout: 60_000 });
  await page.route("**/api/study/snapshot", (route) => route.fulfill({ status: 503, json: { error: "Temporary study outage" } }));
  await page.getByRole("button", { name: "Refresh my progress", exact: true }).click();
  await expect(page.getByText(/30 questions saved/)).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("montreal-study-active-v1"))).toBe("demo-user:mccqe");
  await context.setOffline(true);
  await page.goto("/session/demo");
  await expect(page.getByRole("radio").first()).toBeEnabled();
  await page.getByRole("radio").first().click();
  await expect(page.getByRole("region", { name: "Answer explanation" })).toBeVisible();
});

test("conflicted sessions preserve dependent work while notes sync and recovery keeps a backup", async ({ page }) => {
  let remote: StudySnapshot;
  const received: StudyOperation[] = [];
  await page.route("**/api/study/snapshot", async (route) => {
    if (!remote) { remote = await (await route.fetch()).json(); remote.demo = false; }
    await route.fulfill({ json: remote });
  });
  await page.route("**/api/study/sync", async (route) => {
    const { operation } = route.request().postDataJSON() as { operation: StudyOperation };
    received.push(operation);
    if (operation.kind === "attempt") {
      const online = { ...operation.attempt, chosenIdx: 1, correct: false };
      remote.attempts = [online];
      await route.fulfill({ status: 409, json: { code: "study_conflict", error: "Answered differently on another device." } });
    } else { if (operation.kind === "note") remote.notes[operation.questionId] = operation.body; await route.fulfill({ json: { ok: true } }); }
  });
  await page.route("**/api/study/session/demo?resolve=1", (route) => route.fulfill({ json: { userId: remote.userId, examId: remote.examId, session: remote.sessions.demo, attempts: remote.attempts } }));
  await signInDemo(page);
  await page.goto("/session/demo");
  await page.getByRole("radio").first().click();
  await expect(page.getByRole("link", { name: "Resolve sync conflicts" })).toBeVisible();
  await page.getByRole("button", { name: "Next question", exact: true }).click();
  await page.getByLabel("Question tools", { exact: true }).click();
  await page.getByRole("button", { name: "Open notes" }).click();
  await page.getByPlaceholder(/Write a clinical pearl/).fill("This note must still sync");
  await page.getByRole("button", { name: "Save note", exact: true }).click();
  await expect.poll(() => received.some((op) => op.kind === "note")).toBe(true);
  expect(received.some((op) => op.kind === "progress")).toBe(false);
  await page.getByRole("link", { name: "Resolve sync conflicts" }).click();
  await page.getByRole("button", { name: "Refresh my progress", exact: true }).click();
  await expect(page.getByRole("region", { name: "Sync conflicts" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("region", { name: "Sync conflicts" })).toBeVisible();
  await page.getByRole("button", { name: "Use online version", exact: true }).click();
  await page.getByRole("button", { name: "Use online version and keep backup", exact: true }).click();
  await expect(page.getByText(/0 updates waiting to sync/)).toBeVisible();
  await expect(page.getByRole("region", { name: "Sync conflicts" })).toHaveCount(0);
  const downloadEvent = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download study backup" }).click();
  const download = await downloadEvent;
  const stream = await download.createReadStream();
  const chunks = []; for await (const chunk of stream!) chunks.push(chunk);
  const backup = JSON.parse(Buffer.concat(chunks).toString());
  expect(backup.recovered.map((op: StudyOperation) => op.kind)).toEqual(["attempt", "progress"]);
  await expect(page.getByRole("button", { name: "Sign out", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page).toHaveURL(/\/login\?notice=signed-out/);
});

test("demo library opens the selected question outside the current session roster", async ({ page, context }) => {
  await signInDemo(page);
  // Next's local route redirects use localhost even when the test origin uses 127.0.0.1.
  if (new URL(page.url()).hostname === "127.0.0.1") await context.addCookies([{ name: "lmcc_demo", value: "1", domain: "localhost", path: "/", httpOnly: true }]);
  await page.goto("/questions");
  await page.getByRole("textbox", { name: "Search questions" }).fill("1026");
  const link = page.locator('a[href="/api/practice/1026"]');
  await expect(link).toHaveCount(1);
  await link.click();
  await expect(page.getByText("Question ID 1026", { exact: true })).toBeVisible();
  await expect(page.getByText("Q 1 / 1", { exact: true })).toBeVisible();
  await page.getByRole("radio").first().click();
  await expect(page.getByRole("region", { name: "Answer explanation" })).toBeVisible();
  await page.reload();
  await expect(page.getByText("Question ID 1026", { exact: true })).toBeVisible();
});
