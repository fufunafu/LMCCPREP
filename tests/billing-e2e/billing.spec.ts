import AxeBuilder from "@axe-core/playwright";
import { expect, test, type BrowserContext } from "@playwright/test";

const fixtureUrl = "http://127.0.0.1:54329";

async function useBillingState(context: BrowserContext, state: string) {
  await context.clearCookies();
  const stateResponse = await fetch(`${fixtureUrl}/__fixture/state`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ state }),
  });
  expect(stateResponse.ok).toBeTruthy();
  const sessionResponse = await fetch(`${fixtureUrl}/__fixture/session`);
  const session = await sessionResponse.json() as { cookieName: string; cookieValue: string };
  await context.addCookies([{
    name: session.cookieName,
    value: session.cookieValue,
    domain: "127.0.0.1",
    httpOnly: true,
    path: "/",
    sameSite: "Lax",
  }]);
}

test("signed-in unsubscribed and expired users are redirected to Billing", async ({ page, context }) => {
  await useBillingState(context, "unsubscribed");
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/billing\?notice=subscription-required$/);
  await expect(page.getByRole("heading", { name: "Billing" })).toBeVisible();

  await useBillingState(context, "expired");
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/billing\?notice=subscription-required$/);
});

test("active and canceled subscribers retain paid app access", async ({ page, context }) => {
  await useBillingState(context, "active");
  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { name: /Welcome back/ })).toBeVisible();

  await page.goto("/create");
  await page.getByRole("button", { name: /Start session/ }).click();
  await expect(page).toHaveURL(/\/session\/00000000-0000-4000-8000-000000000201$/);
  await expect(page.getByText("Question ID 101")).toBeVisible();

  await useBillingState(context, "canceled_active");
  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { name: /Welcome back/ })).toBeVisible();
  await page.goto("/billing");
  await expect(page.getByText(/Access ends September 25, 2030/)).toBeVisible();
});

test("Checkout exposes only known plans and surfaces safe errors", async ({ page, context }) => {
  await useBillingState(context, "unsubscribed");
  const submittedPlans: string[] = [];
  await page.route("**/api/billing/checkout", async (route) => {
    const body = route.request().postDataJSON() as { plan?: string; priceId?: string };
    submittedPlans.push(body.plan ?? "missing");
    expect(body.priceId).toBeUndefined();
    await route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: "Billing is not fully configured yet." }),
    });
  });
  await page.goto("/billing");
  await expect(page.getByRole("button", { name: "Choose monthly" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Choose annual" })).toBeVisible();
  await page.getByRole("button", { name: "Choose monthly" }).click();
  await expect(page.getByText("Billing is not fully configured yet.")).toBeVisible();
  expect(submittedPlans).toEqual(["monthly"]);
});

test("Manage billing and past-due recovery open a mocked portal", async ({ page, context }) => {
  await useBillingState(context, "past_due");
  let portalCalls = 0;
  await page.route("**/api/billing/portal", async (route) => {
    portalCalls += 1;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ url: "http://127.0.0.1:3102/settings?portal=opened" }),
    });
  });
  await page.goto("/settings");
  await expect(page.getByText(/Access is available through September 1, 2030/)).toBeVisible();
  await page.getByRole("button", { name: "Update payment method" }).click();
  await expect(page).toHaveURL(/\/settings\?portal=opened$/);
  expect(portalCalls).toBe(1);
});

test("the authenticated Billing page is mobile-safe and accessible", async ({ page, context }) => {
  await useBillingState(context, "unsubscribed");
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/billing");
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth + 1);
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
  expect(results.violations.filter((violation) => ["serious", "critical"].includes(violation.impact ?? ""))).toEqual([]);
});
