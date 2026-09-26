import type { Page } from "@playwright/test";
import { applyStudyOperation, questionPool, studyStatistics, type StudyOperation, type StudySnapshot } from "../../lib/study-core";
import { expect, signInDemo, test } from "./fixtures";

async function saved(page: Page): Promise<StudySnapshot> {
  return page.evaluate(() => new Promise((resolve, reject) => {
    const open = indexedDB.open("montreal-study-v1", 1);
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result;
      const tx = db.transaction("records", "readonly");
      const request = tx.objectStore("records").get("demo-user:mccqe");
      const bank = tx.objectStore("records").get("bank:demo-user:mccqe");
      tx.oncomplete = () => { resolve({ ...request.result, questions: bank.result }); db.close(); };
      tx.onerror = () => { reject(tx.error); db.close(); };
    };
  }));
}

for (const offline of [false, true]) {
  test(`removing sessions keeps progress and unanswered questions ${offline ? "offline" : "online"}`, async ({ page, context }) => {
    test.setTimeout(90_000);
    if (offline) await page.setViewportSize({ width: 390, height: 844 });
    let remote: StudySnapshot;
    const uploaded: StudyOperation[] = [];
    await page.route("**/api/study/snapshot", async (route) => {
      if (!remote) {
        remote = await (await route.fetch()).json();
        remote.demo = false;
        remote.sessions.demo.questionIds = remote.sessions.demo.questionIds.slice(0, 3);
        const question = remote.questions.find((q) => q.id === remote.sessions.demo.questionIds[0])!;
        remote.attempts = [{ sessionId: "demo", questionId: question.id, chosenIdx: question.answerIdx, correct: true, timeMs: 1200, createdAt: new Date().toISOString() }];
        remote.notes = { [question.id]: "Keep my question note" };
        remote.flags = [question.id];
        remote.sessions.empty = { ...remote.sessions.demo, id: "empty", questionIds: remote.sessions.demo.questionIds.slice(1), starts: {}, eliminated: {} };
      }
      await route.fulfill({ json: { ...remote, sessions: Object.fromEntries(Object.entries(remote.sessions).filter(([, session]) => !session.deletedAt)) } });
    });
    await page.route("**/api/study/sync", async (route) => {
      const { operation } = route.request().postDataJSON() as { operation: StudyOperation };
      uploaded.push(operation);
      remote = applyStudyOperation(remote, operation, false);
      await route.fulfill({ json: { ok: true } });
    });
    await signInDemo(page);
    const region = page.getByRole("region", { name: "Continue where you left off" });
    const remove = () => region.getByRole("button", { name: "Remove session with 1 of 3 answered", exact: true });
    await expect(remove()).toBeEnabled();
    if (offline) {
      await page.goto("/settings");
      await page.getByRole("button", { name: "Download offline study", exact: true }).click();
      await expect(page.getByText("Offline study is ready.", { exact: false })).toBeVisible({ timeout: 60_000 });
      await page.goto("/dashboard");
      await expect(remove()).toBeEnabled();
      await context.setOffline(true);
    }
    const before = await saved(page);
    await remove().click();
    await expect(page.getByRole("dialog")).toContainText("Your answers, question status, statistics, notes, and flags will be kept.");
    await page.getByRole("button", { name: "Keep session", exact: true }).click();
    await expect(remove()).toBeVisible();
    await remove().click();
    await page.getByRole("dialog").getByRole("button", { name: "Remove session", exact: true }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(remove()).toHaveCount(0);
    const after = await saved(page);
    expect(studyStatistics(after).stats).toEqual(studyStatistics(before).stats);
    expect(after.attempts).toEqual(before.attempts);
    expect(after.notes).toEqual(before.notes);
    expect(after.flags).toEqual(before.flags);
    expect(studyStatistics(after).sessions.map((session) => session.id)).toEqual(["empty"]);
    const available = questionPool(after, { subjectIds: [], topicIds: [], status: "unused" }).map((q) => q.id);
    expect(available).toContain(before.sessions.demo.questionIds[1]);
    expect(available).not.toContain(before.sessions.demo.questionIds[0]);
    if (offline) expect(uploaded).toHaveLength(0);
    await page.reload();
    await expect(remove()).toHaveCount(0);
    await expect(region.getByRole("button", { name: "Remove session with 0 of 2 answered", exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    if (offline) await context.setOffline(false);
    await expect.poll(() => uploaded.filter((op) => op.kind === "remove-session").length).toBe(1);
    // A fresh authoritative snapshot must not reintroduce the old session.
    await page.goto("/settings");
    await page.getByRole("button", { name: "Refresh my progress", exact: true }).click();
    await expect(page.getByText("Study progress refreshed.", { exact: false })).toBeVisible();
    await page.goto("/dashboard");
    await expect(remove()).toHaveCount(0);
    await region.getByRole("button", { name: "Remove session with 0 of 2 answered", exact: true }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Remove session", exact: true }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(region).toHaveCount(0);
    expect((await saved(page)).attempts).toEqual(before.attempts);
    expect(studyStatistics(await saved(page)).sessions).toHaveLength(0);
  });
}
