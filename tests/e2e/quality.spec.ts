import AxeBuilder from "@axe-core/playwright";
import { expect, signInDemo, test } from "./fixtures";

async function expectNoSeriousViolations(page: import("@playwright/test").Page) {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
  expect(results.violations.filter((violation) => ["serious", "critical"].includes(violation.impact ?? ""))).toEqual([]);
}

test("public and private surfaces meet the serious accessibility gate", async ({ page, consoleErrors }) => {
  void consoleErrors;
  const publicPaths = ["/", "/login", "/forgot-password"];
  const privatePaths = ["/dashboard", "/create", "/questions", "/stats", "/settings", "/author", "/session/demo?mode=tutor", "/session/demo/review?mode=tutor"];

  for (const path of publicPaths) {
    await test.step(`light ${path}`, async () => {
      await page.goto(path);
      await expectNoSeriousViolations(page);
    });
  }

  await page.evaluate(() => window.localStorage.setItem("theme", "dark"));
  for (const path of publicPaths) {
    await test.step(`dark ${path}`, async () => {
      await page.goto(path);
      await expect(page.locator("html")).toHaveClass(/dark/);
      await expectNoSeriousViolations(page);
    });
  }

  await signInDemo(page);
  for (const path of privatePaths) {
    await test.step(`dark ${path}`, async () => {
      await page.goto(path);
      await expect(page.locator("html")).toHaveClass(/dark/);
      await expectNoSeriousViolations(page);
    });
  }

  await page.evaluate(() => window.localStorage.setItem("theme", "light"));
  for (const path of privatePaths) {
    await test.step(`light ${path}`, async () => {
      await page.goto(path);
      await expectNoSeriousViolations(page);
    });
  }
});

test("PWA assets and private-route indexing headers are production-ready", async ({ page, consoleErrors }) => {
  void consoleErrors;
  await signInDemo(page);
  const dashboard = await page.goto("/dashboard");
  expect(dashboard?.headers()["x-robots-tag"]).toBe("noindex, nofollow, noarchive");

  const manifestResponse = await page.request.get("/manifest.webmanifest");
  expect(manifestResponse.ok()).toBeTruthy();
  const manifest = await manifestResponse.json();
  expect(manifest).toMatchObject({ name: "LMCC Prep", display: "standalone", start_url: "/dashboard" });
  expect(manifest.icons).toEqual(expect.arrayContaining([
    expect.objectContaining({ src: "/icon-192.png", sizes: "192x192" }),
    expect.objectContaining({ src: "/icon-512.png", sizes: "512x512" }),
  ]));

  const worker = await page.request.get("/sw.js");
  expect(worker.ok()).toBeTruthy();
  expect(worker.headers()["content-type"]).toContain("application/javascript");
  expect((await page.request.get("/offline.html")).ok()).toBeTruthy();
});

test("registered service worker serves the offline fallback", async ({ page, context }) => {
  await page.goto("/");
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await page.reload();
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBeTruthy();

  await context.setOffline(true);
  try {
    await page.goto(`/unavailable-offline-${Date.now()}`);
    await expect(page.getByRole("heading", { name: "You are offline" })).toBeVisible();
  } finally {
    await context.setOffline(false);
  }
});
