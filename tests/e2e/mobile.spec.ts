import { expect, signInDemo, test } from "./fixtures";

async function expectNoHorizontalOverflow(page: import("@playwright/test").Page) {
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth + 1);
}

test("@mobile supports navigation and question controls at iPhone width", async ({ page, consoleErrors }) => {
  void consoleErrors;
  await signInDemo(page);
  await expect(page.getByRole("navigation", { name: "Primary" })).toBeVisible();
  await page.getByRole("link", { name: "Practice", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Create a practice session" })).toBeVisible();
  await page.getByRole("button", { name: /Start session/ }).click();
  await expect(page.getByRole("button", { name: "Strike out answer A" })).toBeVisible();
  await page.getByRole("button", { name: "Strike out answer A" }).click();
  await expect(page.getByRole("button", { name: /A A diastolic component/ })).toBeDisabled();
  await expectNoHorizontalOverflow(page);
});

test("@mobile every public and private page fits a 375px viewport", async ({ page, consoleErrors }) => {
  void consoleErrors;
  await page.setViewportSize({ width: 375, height: 812 });
  for (const path of ["/", "/login", "/forgot-password", "/terms", "/privacy", "/refund-policy", "/support"]) {
    await page.goto(path);
    await expectNoHorizontalOverflow(page);
  }

  await signInDemo(page);
  for (const path of [
    "/dashboard",
    "/create",
    "/questions",
    "/stats",
    "/settings",
    "/billing",
    "/author",
    "/session/demo?mode=tutor",
    "/session/demo/review?mode=tutor",
  ]) {
    await test.step(path, async () => {
      await page.goto(path);
      await expectNoHorizontalOverflow(page);
    });
  }
});
