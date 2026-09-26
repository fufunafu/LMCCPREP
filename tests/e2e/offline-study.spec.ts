import { expect, signInDemo, test } from "./fixtures";
import { applyStudyOperation, type StudyOperation, type StudySnapshot } from "../../lib/study-core";

test("offline reload keeps answers, replacement skips, notes, plans and statistics", async ({ page, context }) => {
  test.setTimeout(120_000);
  await signInDemo(page);
  await page.getByLabel("Minutes per day", { exact: true }).fill("30");
  await expect(page.getByLabel("Seconds per question", { exact: true })).toHaveValue("120");
  await page.getByLabel("Seconds per question", { exact: true }).fill("90");
  await page.getByRole("button", { name: "Save study plan", exact: true }).click();
  await expect(page.getByText("0 / 20", { exact: true })).toBeVisible();
  await expect(page.getByText(/30 minutes at 90 seconds per question/)).toBeVisible();
  await page.getByRole("button", { name: "Edit study plan", exact: true }).click();
  await expect(page.getByLabel("Seconds per question", { exact: true })).toHaveValue("90");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.goto("/settings");
  await page.getByRole("button", { name: "Download offline study", exact: true }).click();
  await expect(page.getByText("Offline study is ready.", { exact: false })).toBeVisible({ timeout: 60_000 });
  await page.goto("/session/demo?mode=tutor");
  const originalId = await page.getByText(/^Question ID /).textContent();
  await page.getByRole("button", { name: "Strike out answer B" }).click();
  await expect(page.getByRole("button", { name: "Restore answer B" })).toHaveAttribute("aria-pressed", "true");
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole("button", { name: "Restore answer B" })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("radio", { name: /C A soft, position-dependent systolic sound/ }).click();
  await expect(page.getByText("Correct", { exact: true }).first()).toBeVisible();
  await page.getByRole("group", { name: "Question navigation" }).getByRole("button", { name: "Next question", exact: true }).click();
  const beforeSkip = await page.getByText(/^Question ID /).textContent();
  await page.getByRole("button", { name: "Skip", exact: true }).click();
  await expect(page.getByText(/^Question ID /)).not.toHaveText(beforeSkip!);
  await expect(page.getByText("Q 2 / 20", { exact: true })).toBeVisible();
  await expect(page.getByText("1 of 20 answered", { exact: true })).toBeVisible();
  const replacement = await page.getByText(/^Question ID /).textContent();
  expect(replacement).not.toBe(originalId);
  await page.getByLabel("Question tools", { exact: true }).click();
  await page.getByRole("button", { name: "Open notes" }).click();
  await page.getByPlaceholder(/Write a clinical pearl/).fill("Saved while offline.");
  await page.getByRole("button", { name: "Save note", exact: true }).click();
  await expect(page.getByText("Note saved", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText(/^Question ID /)).toHaveText(replacement!);
  await page.getByLabel("Question tools", { exact: true }).click();
  await page.getByRole("button", { name: "Open notes" }).click();
  await expect(page.getByPlaceholder(/Write a clinical pearl/)).toHaveValue("Saved while offline.");
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await page.getByRole("navigation", { name: "Main navigation" }).getByRole("link", { name: "Dashboard", exact: true }).click();
  await expect(page.getByText("1 / 20", { exact: true })).toBeVisible();
  await expect(page.getByText(/30 minutes at 90 seconds per question/)).toBeVisible();
  await page.getByRole("navigation", { name: "Main navigation" }).getByRole("link", { name: "Statistics", exact: true }).click();
  await expect(page.getByText("First attempts", { exact: true })).toBeVisible();
  await expect(page.getByText("1 correct of 1 attempts", { exact: true })).toBeVisible();
  const cached = await page.evaluate(async () => (await Promise.all((await caches.keys()).filter((key) => key.startsWith("montreal-study-")).map(async (key) => (await (await caches.open(key)).keys()).map((r) => new URL(r.url).pathname)))).flat());
  expect(cached).toContain("/offline");
  expect(cached.every((path) => path === "/offline" || path.startsWith("/_next/static/"))).toBe(true);
  await context.setOffline(false);
});

test("offline outbox retries a lost response without duplicating an answer", async ({ page, context }) => {
  test.setTimeout(120_000);
  let remote: StudySnapshot;
  let lostResponse = false;
  let staleSnapshot = false;
  const accepted = new Set<string>();
  const received: StudyOperation[] = [];
  await page.route("**/api/study/snapshot", async (route) => {
    if (!remote) { remote = await (await route.fetch()).json(); remote.demo = false; remote.attempts = []; }
    const response = staleSnapshot ? { ...remote, attempts: [] } : remote;
    staleSnapshot = false;
    await route.fulfill({ json: response });
  });
  await page.route("**/api/study/sync", async (route) => {
    const { operation } = route.request().postDataJSON() as { operation: StudyOperation };
    received.push(operation);
    if (!accepted.has(operation.id)) { remote = applyStudyOperation(remote, operation, false); accepted.add(operation.id); }
    if (operation.kind === "attempt" && !lostResponse) { lostResponse = true; staleSnapshot = true; await route.abort("connectionreset"); return; }
    await route.fulfill({ json: { ok: true } });
  });
  await signInDemo(page);
  await page.goto("/settings");
  await page.getByRole("button", { name: "Download offline study", exact: true }).click();
  await expect(page.getByText("Offline study is ready.", { exact: false })).toBeVisible({ timeout: 60_000 });
  await context.setOffline(true);
  await page.reload();
  await page.getByRole("navigation", { name: "Main navigation" }).getByRole("link", { name: "New session", exact: true }).click();
  await page.getByRole("button", { name: "Start session", exact: false }).click();
  await page.getByRole("radio").first().click();
  await expect(page.getByRole("region", { name: "Answer explanation" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("region", { name: "Answer explanation" })).toBeVisible();
  await context.setOffline(false);
  await expect.poll(() => lostResponse).toBe(true);
  await page.getByRole("navigation", { name: "Main navigation" }).getByRole("link", { name: "Settings", exact: true }).click();
  await page.getByRole("button", { name: "Refresh my progress", exact: true }).click();
  await expect(page.getByText(/0 updates waiting to sync/)).toBeVisible();
  expect(remote!.attempts).toHaveLength(1);
  const answerRequests = received.filter((op) => op.kind === "attempt");
  expect(answerRequests.length).toBeGreaterThanOrEqual(2);
  expect(new Set(answerRequests.map((op) => op.id)).size).toBe(1);
});

test("paged downloads finish atomically and stop if the signed-in account changes", async ({ page, context }) => {
  test.setTimeout(120_000);
  await signInDemo(page);
  await page.goto("/settings");
  await expect(page.getByText(/30 questions saved/)).toBeVisible();
  const bank = await page.evaluate(async () => (await fetch("/api/study/snapshot")).json()) as StudySnapshot;
  expect(bank.questions).toHaveLength(30);
  let changeAccount = false;
  let questionPages = 0;
  await page.route("**/api/study/snapshot", (route) => route.fulfill({ json: { ...bank, demo: false, questions: [], notes: {}, attempts: [], download: { questionIds: bank.questions.map((q) => q.id) } } }));
  await page.route("**/api/study/download?*", async (route) => {
    const params = new URL(route.request().url()).searchParams;
    const common = { userId: changeAccount ? "different-user" : bank.userId, examId: bank.examId, next: null };
    if (params.get("kind") === "questions") {
      questionPages++;
      await route.fulfill({ json: { ...common, questions: params.has("cursor") ? bank.questions.slice(15) : bank.questions.slice(0, 15), next: params.has("cursor") ? null : "15" } });
    } else await route.fulfill({ json: { ...common, attempts: [], notes: { [bank.questions[0].id]: "Downloaded in a separate page." } } });
  });
  await page.getByRole("button", { name: "Download offline study", exact: true }).click();
  await expect(page.getByText("Offline study is ready.", { exact: false })).toBeVisible({ timeout: 60_000 });
  expect(questionPages).toBe(2);
  const readSaved = () => page.evaluate(async () => {
    return new Promise<{ questions: number; note: boolean }>((resolve) => {
      const request = indexedDB.open("montreal-study-v1", 1);
      request.onsuccess = () => { const db = request.result; const tx = db.transaction("records", "readonly"); const store = tx.objectStore("records"); const bank = store.get("bank:demo-user:mccqe"); const data = store.get("demo-user:mccqe"); tx.oncomplete = () => { resolve({ questions: bank.result.length, note: Object.values(data.result.notes).includes("Downloaded in a separate page.") }); db.close(); }; };
    });
  });
  expect(await readSaved()).toEqual({ questions: 30, note: true });
  changeAccount = true;
  await page.getByRole("button", { name: "Refresh my progress", exact: true }).click();
  await expect(page.getByText(/account.*changed during download/)).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("montreal-study-active-v1"))).toBeNull();
  expect(await readSaved()).toEqual({ questions: 30, note: true });
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole("heading", { name: "No offline study data saved" })).toBeVisible();
  await context.setOffline(false);
});

test("downloaded figures survive offline reload and expired access keeps saved work", async ({ page, context }) => {
  test.setTimeout(120_000);
  await page.clock.install();
  await page.route("**/api/study/snapshot", async (route) => {
    const snapshot = await (await route.fetch()).json() as StudySnapshot;
    snapshot.questions[0].figureUrls = ["/api/qbank-images/999999/0"];
    await route.fulfill({ json: snapshot });
  });
  await page.route("**/api/qbank-images/999999/0", (route) => route.fulfill({ contentType: "image/png", body: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6TjEAAAAASUVORK5CYII=", "base64") }));
  await signInDemo(page);
  await page.goto("/settings");
  await page.getByRole("button", { name: "Download offline study", exact: true }).click();
  await expect(page.getByText("Offline study is ready.", { exact: false })).toBeVisible({ timeout: 60_000 });
  await page.goto("/session/demo?mode=tutor");
  await expect(page.getByRole("img", { name: /Clinical figure 1/ })).toBeVisible();
  await context.setOffline(true);
  await page.reload();
  await expect.poll(() => page.getByRole("img", { name: /Clinical figure 1/ }).evaluate((image) => (image as HTMLImageElement).naturalWidth)).toBe(1);
  await page.getByRole("radio", { name: /C A soft, position-dependent systolic sound/ }).click();
  await expect(page.getByRole("region", { name: "Answer explanation" })).toBeVisible();
  await page.clock.fastForward(73 * 3600_000);
  await expect(page.getByRole("heading", { name: "Refresh your study access" })).toBeVisible();
  await expect(page.getByRole("radio")).toHaveCount(0);
  const savedAnswers = await page.evaluate(() => new Promise<number>((resolve) => {
    const open = indexedDB.open("montreal-study-v1", 1);
    open.onsuccess = () => { const db = open.result; const tx = db.transaction("records", "readonly"); const saved = tx.objectStore("records").get("demo-user:mccqe"); tx.oncomplete = () => { resolve(saved.result.attempts.length); db.close(); }; };
  }));
  expect(savedAnswers).toBe(1);
});
