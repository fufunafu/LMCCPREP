import AxeBuilder from "@axe-core/playwright";
import { expect, signInDemo, test } from "./fixtures";

const publicPaths = ["/", "/features", "/pricing", "/faq", "/request-access", "/terms", "/privacy", "/refund-policy", "/support"];

async function expectNoSeriousViolations(page: import("@playwright/test").Page) {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
  expect(results.violations.filter((violation) => ["serious", "critical"].includes(violation.impact ?? ""))).toEqual([]);
}

test("public and private surfaces meet the serious accessibility gate", async ({ page, consoleErrors }) => {
  test.setTimeout(90_000);
  void consoleErrors;
  const accessiblePublicPaths = ["/", "/login", "/forgot-password", "/terms", "/privacy", "/refund-policy", "/support"];
  const privatePaths = ["/dashboard", "/create", "/questions", "/stats", "/settings", "/billing", "/author", "/session/demo?mode=tutor", "/session/demo/review?mode=tutor"];

  for (const path of accessiblePublicPaths) {
    await test.step(`light ${path}`, async () => {
      await page.goto(path);
      await expectNoSeriousViolations(page);
    });
  }

  await page.evaluate(() => window.localStorage.setItem("theme", "dark"));
  for (const path of accessiblePublicPaths) {
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
    expect.objectContaining({ src: "/icon", sizes: "512x512", purpose: "maskable" }),
  ]));

  const maskableIcon = await page.request.get("/icon");
  expect(maskableIcon.ok()).toBeTruthy();
  expect(maskableIcon.headers()["content-type"]).toContain("image/png");

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
  const jsonLdText = await page.locator('script[type="application/ld+json"]').textContent();
  const jsonLd = JSON.parse(jsonLdText ?? "{}");
  const graph = jsonLd["@graph"] as Array<Record<string, unknown>>;
  expect(graph.map((item) => item["@type"])).toEqual(["Organization", "WebSite", "SoftwareApplication", "FAQPage"]);
  const application = graph.find((item) => item["@type"] === "SoftwareApplication");
  expect(application).toMatchObject({ name: "Montreal QBank", applicationCategory: "EducationalApplication", operatingSystem: "Web" });
  expect(application?.offers).toEqual([
    { "@type": "Offer", priceCurrency: "CAD", price: 59, category: "per month", url: "https://lmcc-prep.vercel.app/pricing" },
    { "@type": "Offer", priceCurrency: "CAD", price: 349, category: "per year", url: "https://lmcc-prep.vercel.app/pricing" },
  ]);
  const faq = graph.find((item) => item["@type"] === "FAQPage");
  expect(faq?.mainEntity).toEqual(expect.arrayContaining([
    expect.objectContaining({ "@type": "Question", acceptedAnswer: expect.objectContaining({ "@type": "Answer" }) }),
  ]));

  const robots = await page.request.get("/robots.txt");
  expect(robots.ok()).toBeTruthy();
  const robotsText = await robots.text();
  expect(robotsText).toContain("Disallow: /dashboard");
  expect(robotsText).toContain("Sitemap:");

  const sitemap = await page.request.get("/sitemap.xml");
  expect(sitemap.ok()).toBeTruthy();
  const sitemapText = await sitemap.text();
  for (const route of ["/features", "/pricing", "/faq", "/request-access", "/terms", "/privacy", "/refund-policy", "/support"]) expect(sitemapText).toContain(route);
  for (const route of ["/dashboard", "/login", "/api/"]) expect(sitemapText).not.toContain(route);

  const capture = await page.request.post("/api/public/capture", { data: { stem: "should not be accepted" } });
  expect(capture.status()).toBe(404);
  expect(await capture.text()).not.toMatch(/supabase|stripe|stack|database/i);

  for (const response of [home, capture, await page.request.get("/sw.js"), await page.request.get("/icon")]) {
    expect(response?.headers()["x-content-type-options"]).toBe("nosniff");
    expect(response?.headers()["x-frame-options"]).toBe("DENY");
    expect(response?.headers()["referrer-policy"]).toBe("strict-origin-when-cross-origin");
    expect(response?.headers()["permissions-policy"]).toContain("camera=()");
    expect(response?.headers()["content-security-policy"]).toContain("default-src 'self'");
  }
});

test("every indexable page has unique metadata and all public links resolve", async ({ page, consoleErrors }) => {
  void consoleErrors;
  const titles = new Set<string>();
  const descriptions = new Set<string>();
  const openGraphTitles = new Set<string>();
  const openGraphDescriptions = new Set<string>();
  const internalPaths = new Set<string>();

  for (const path of publicPaths) {
    await test.step(path, async () => {
      const response = await page.goto(path);
      expect(response?.status()).toBeLessThan(400);
      const expectedCanonical = `https://lmcc-prep.vercel.app${path === "/" ? "" : path}`;
      const title = await page.title();
      const description = await page.locator('meta[name="description"]').getAttribute("content");
      const ogTitle = await page.locator('meta[property="og:title"]').getAttribute("content");
      const ogDescription = await page.locator('meta[property="og:description"]').getAttribute("content");
      expect(title).toBeTruthy();
      expect(description).toBeTruthy();
      expect(ogTitle).toBeTruthy();
      expect(ogDescription).toBeTruthy();
      await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", expectedCanonical);
      await expect(page.locator('meta[property="og:url"]')).toHaveAttribute("content", expectedCanonical);
      titles.add(title);
      descriptions.add(description ?? "");
      openGraphTitles.add(ogTitle ?? "");
      openGraphDescriptions.add(ogDescription ?? "");

      const hrefs = await page.locator("a[href]").evaluateAll((anchors) => anchors.map((anchor) => anchor.getAttribute("href") ?? ""));
      for (const href of hrefs) {
        if (!href || href.startsWith("mailto:") || href.startsWith("tel:")) continue;
        const resolved = new URL(href, page.url());
        if (resolved.origin !== new URL(page.url()).origin) continue;
        if (resolved.pathname === path && resolved.hash) {
          await expect(page.locator(resolved.hash)).toHaveCount(1);
        }
        internalPaths.add(`${resolved.pathname}${resolved.search}`);
      }
    });
  }

  expect(titles.size).toBe(publicPaths.length);
  expect(descriptions.size).toBe(publicPaths.length);
  expect(openGraphTitles.size).toBe(publicPaths.length);
  expect(openGraphDescriptions.size).toBe(publicPaths.length);
  for (const path of internalPaths) {
    const response = await page.request.get(path);
    expect(response.status(), `Broken internal link: ${path}`).toBeLessThan(400);
  }
});

test("marketing navigation routes to dedicated pages and stays sticky", async ({ page, consoleErrors }) => {
  void consoleErrors;
  await page.goto("/");
  for (const [name, path, heading] of [["Features", "/features", "Tools that make each session count."], ["FAQ", "/faq", "Frequently asked questions."]]) {
    await page.getByRole("navigation", { name: "Marketing navigation" }).getByRole("link", { name }).click();
    await expect(page).toHaveURL(path);
    await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Marketing navigation" }).getByRole("link", { name })).toHaveAttribute("aria-current", "page");
    await page.mouse.wheel(0, 600);
    await expect.poll(() => page.locator("header").evaluate((header) => Math.round(header.getBoundingClientRect().top))).toBe(0);
  }
});

test("unapproved public catalog stays withheld during demo, and private landmarks expose state", async ({ page, consoleErrors }) => {
  void consoleErrors;
  await page.goto("/");
  await expect(page.locator("#subjects")).toHaveCount(0);
  await signInDemo(page);
  await expect(page.getByRole("status").filter({ hasText: "Simulated demo data" })).toBeVisible();
  await expect(page.getByRole("table", { name: "Daily accuracy for the last 28 calendar days" })).toBeAttached();
  await expect(page.getByRole("table", { name: "Weekly study activity for the last 12 weeks" })).toBeAttached();
  const current = page.getByRole("navigation", { name: "Main navigation" }).getByRole("link", { name: "Dashboard" });
  await expect(current).toHaveAttribute("aria-current", "page");
  await page.goto("/session/demo?mode=tutor");
  await expect(page.locator("main")).toHaveCount(1);
  await page.goto("/");
  await expect(page.locator("#subjects")).toHaveCount(0);
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

test("tablet landscape and common desktop widths do not introduce page overflow", async ({ page, consoleErrors }) => {
  test.setTimeout(90_000);
  void consoleErrors;
  await signInDemo(page);
  const viewports = [
    { width: 1024, height: 768, label: "tablet-landscape" },
    { width: 1280, height: 800, label: "desktop-1280" },
    { width: 1920, height: 1080, label: "desktop-1920" },
  ];
  const paths = ["/", "/dashboard", "/create", "/questions", "/stats", "/session/demo?mode=tutor"];

  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    for (const path of paths) {
      await test.step(`${viewport.label} ${path}`, async () => {
        await page.goto(path);
        const dimensions = await page.evaluate(() => ({
          clientWidth: document.documentElement.clientWidth,
          scrollWidth: document.documentElement.scrollWidth,
        }));
        expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth + 1);
        await expect(page.locator("h1").first()).toBeVisible();
      });
    }
  }
});
