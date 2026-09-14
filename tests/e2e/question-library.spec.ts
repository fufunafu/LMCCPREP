import { expect, signInDemo, test } from "./fixtures";

const cards = (page: import("@playwright/test").Page) => page.locator('a[href^="/api/practice/"]');
const ready = (page: import("@playwright/test").Page) => expect(page.locator('[aria-busy="true"]')).toHaveCount(0);

test("question library loads one page and supports search, pagination, and clearing filters", async ({ page, consoleErrors }) => {
  void consoleErrors;
  await signInDemo(page);
  await page.goto("/questions");
  await expect(cards(page)).toHaveCount(8);
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await ready(page);
  await expect(page.getByText("Page 2 of 4")).toBeVisible();
  await expect(cards(page).first()).toHaveAttribute("href", "/api/practice/1009");
  await page.getByRole("textbox", { name: "Search questions" }).fill("1001");
  await expect(cards(page)).toHaveCount(1);
  await expect(cards(page).first()).toHaveAttribute("href", "/api/practice/1001");
  await page.getByRole("textbox", { name: "Search questions" }).fill("");
  await expect(cards(page)).toHaveCount(8);
  await expect(page.getByText("Page 1 of 4")).toBeVisible();
  await page.getByLabel("Subject", { exact: true }).selectOption("pediatrics");
  await expect(cards(page)).toHaveCount(6);
  await page.getByLabel("Topic", { exact: true }).selectOption("ped-cardio");
  await expect(cards(page)).toHaveCount(2);
  await page.getByRole("button", { name: "Clear filters" }).click();
  await expect(cards(page)).toHaveCount(8);
  await expect(page.getByLabel("Topic", { exact: true })).toHaveValue("all");
});

test("question library cancels stale searches and retries failed loads", async ({ page }) => {
  await signInDemo(page);
  await page.goto("/questions");
  let releaseOld: (() => void) | undefined;
  await page.route("**/api/questions?**", async (route) => {
    const query = new URL(route.request().url()).searchParams.get("query");
    if (query === "delayed") {
      await new Promise<void>((resolve) => { releaseOld = resolve; });
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ questions: [], statuses: {}, total: 0, page: 1, pageSize: 8 }) });
    } else if (query === "fail") {
      await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "Unavailable" }) });
    } else await route.continue();
  });
  const search = page.getByRole("textbox", { name: "Search questions" });
  await search.fill("delayed");
  await expect.poll(() => Boolean(releaseOld)).toBe(true);
  await search.fill("1002");
  await expect(cards(page)).toHaveCount(1);
  await expect(cards(page).first()).toHaveAttribute("href", "/api/practice/1002");
  releaseOld!();
  await search.fill("fail");
  await expect(page.getByRole("alert").filter({ hasText: "Questions could not be loaded" })).toBeVisible();
  await expect(cards(page).first()).toHaveAttribute("href", "/api/practice/1002");
  await page.unroute("**/api/questions?**");
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Questions could not be loaded" })).toHaveCount(0);
  await ready(page);
  await expect(cards(page)).toHaveCount(0);
  await page.getByRole("button", { name: "Clear filters" }).click();
  await expect(cards(page)).toHaveCount(8);
});

test("question API stays private and returns bounded, uncacheable pages", async ({ page }) => {
  const signedOut = await page.request.get("/api/questions");
  expect(signedOut.status()).toBe(401);
  await signInDemo(page);
  // Use the browser for its secure demo cookie on the local HTTP origin.
  const response = await page.evaluate(async () => {
    const result = await fetch("/api/questions?page=2");
    return { status: result.status, cacheControl: result.headers.get("cache-control"), body: await result.json() };
  });
  expect(response.status).toBe(200);
  expect(response.cacheControl).toContain("no-store");
  const body = response.body;
  expect(body.questions).toHaveLength(8);
  expect(body.page).toBe(2);
  expect(body.total).toBe(30);
  expect(Object.keys(body.statuses)).toHaveLength(8);
  expect(body.questions[0]).not.toHaveProperty("options");
  expect(body.questions[0]).not.toHaveProperty("answerIdx");
  expect(body.questions[0]).not.toHaveProperty("explanation");
});

test("navigation shows loading feedback while a private page is still rendering", async ({ page }) => {
  await signInDemo(page);
  await page.route("**/questions?**", async (route) => {
    if (route.request().headers()["rsc"] !== "1" || route.request().headers()["next-router-prefetch"] === "1") return route.continue();
    const response = await route.fetch();
    await new Promise((resolve) => setTimeout(resolve, 1200));
    await route.fulfill({ response });
  });
  await page.getByRole("navigation", { name: "Main navigation" }).getByRole("link", { name: "Questions", exact: true }).click();
  await expect(page.getByRole("status", { name: /Loading (questions|page)/ })).toBeVisible({ timeout: 1000 });
  await expect(page.getByRole("heading", { name: "Browse all questions" })).toBeVisible();
  await expect(cards(page)).toHaveCount(8);
});
