import AxeBuilder from "@axe-core/playwright";
import { expect, signInDemo, test } from "./fixtures";

async function expectNoSeriousViolations(page: import("@playwright/test").Page) {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
  expect(results.violations.filter((violation) => ["serious", "critical"].includes(violation.impact ?? ""))).toEqual([]);
}

test("public and private surfaces meet the serious accessibility gate", async ({ page, consoleErrors }) => {
  test.setTimeout(90_000);
  void consoleErrors;
  const publicPaths = ["/", "/login", "/forgot-password", "/terms", "/privacy", "/refund-policy", "/support"];
  const privatePaths = ["/dashboard", "/create", "/questions", "/stats", "/settings", "/billing", "/author", "/session/demo?mode=tutor", "/session/demo/review?mode=tutor"];

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
  expect(manifest).toMatchObject({ name: "Montreal QBank", display: "standalone", start_url: "/login?next=/dashboard" });
  expect(manifest.orientation).toBeUndefined();
  expect(manifest.icons).toEqual(expect.arrayContaining([
    expect.objectContaining({ src: "/icon-192.png", sizes: "192x192" }),
    expect.objectContaining({ src: "/icon-512.png", sizes: "512x512" }),
  ]));

  const worker = await page.request.get("/sw.js");
  expect(worker.ok()).toBeTruthy();
  expect(worker.headers()["content-type"]).toContain("application/javascript");
  expect((await page.request.get("/offline.html")).ok()).toBeTruthy();
});

test("SEO routes, canonical metadata, structured data, and security headers are valid", async ({ page, consoleErrors }) => {
  void consoleErrors;
  const home = await page.goto("/");
  expect(home?.headers()["content-security-policy"]).toContain("default-src 'self'");
  expect(home?.headers()["x-powered-by"]).toBeUndefined();
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", /^https:\/\/lmcc-prep\.vercel\.app\/?$/);
  await expect(page.locator('meta[property="og:url"]')).toHaveAttribute("content", /^https:\/\/lmcc-prep\.vercel\.app\/?$/);
  const jsonLd = await page.locator('script[type="application/ld+json"]').textContent();
  expect(jsonLd).toContain("FAQPage");
  expect(jsonLd).toContain("SoftwareApplication");

  const robots = await page.request.get("/robots.txt");
  expect(robots.ok()).toBeTruthy();
  const robotsText = await robots.text();
  expect(robotsText).toContain("Disallow: /dashboard");
  expect(robotsText).toContain("Sitemap:");

  const sitemap = await page.request.get("/sitemap.xml");
  expect(sitemap.ok()).toBeTruthy();
  const sitemapText = await sitemap.text();
  for (const route of ["/terms", "/privacy", "/refund-policy", "/support"]) expect(sitemapText).toContain(route);
  for (const route of ["/dashboard", "/login", "/api/"]) expect(sitemapText).not.toContain(route);

  const capture = await page.request.post("/api/public/capture", { data: { stem: "should not be accepted" } });
  expect(capture.status()).toBe(404);
});

test("marketing navigation stays sticky and preserves anchored headings", async ({ page, consoleErrors }) => {
  void consoleErrors;
  await page.goto("/");
  for (const name of ["Features", "Subjects", "Pricing", "FAQ"]) {
    await page.getByRole("navigation", { name: "Marketing navigation" }).getByRole("link", { name }).click();
    await expect.poll(() => page.locator("header").evaluate((header) => Math.round(header.getBoundingClientRect().top))).toBe(0);
    const target = name === "FAQ" ? "#faq" : `#${name.toLowerCase()}`;
    await expect.poll(() => page.locator(target).evaluate((section) => section.getBoundingClientRect().top)).toBeGreaterThanOrEqual(70);
  }
});

test("public counts are identical before and during demo, and private landmarks expose state", async ({ page, consoleErrors }) => {
  void consoleErrors;
  await page.goto("/");
  const anonymousCounts = await page.locator("#subjects h3 + p").allTextContents();
  await signInDemo(page);
  await expect(page.getByRole("status").filter({ hasText: "Simulated demo data" })).toBeVisible();
  await expect(page.getByRole("table", { name: "Daily accuracy for the last 28 calendar days" })).toBeAttached();
  await expect(page.getByRole("table", { name: "Weekly study activity for the last 12 weeks" })).toBeAttached();
  const current = page.getByRole("navigation", { name: "Main navigation" }).getByRole("link", { name: "Dashboard" });
  await expect(current).toHaveAttribute("aria-current", "page");
  await page.goto("/session/demo?mode=tutor");
  await expect(page.locator("main")).toHaveCount(1);
  await page.goto("/");
  const demoCounts = await page.locator("#subjects h3 + p").allTextContents();
  expect(demoCounts).toEqual(anonymousCounts);
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
