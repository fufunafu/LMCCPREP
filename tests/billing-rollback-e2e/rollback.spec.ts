import { expect, test, type BrowserContext } from "@playwright/test";

const fixtureUrl = "http://127.0.0.1:54330";

async function useUnsubscribedSession(context: BrowserContext) {
  const stateResponse = await fetch(`${fixtureUrl}/__fixture/state`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ state: "rollback_disabled" }),
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

test("disabling application billing immediately restores invited-user access", async ({ page, context }) => {
  await useUnsubscribedSession(context);

  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole("heading", { name: /Welcome back/ })).toBeVisible();

  await page.goto("/create");
  await page.getByRole("button", { name: /Start session/ }).click();
  await expect(page).toHaveURL(/\/session\/00000000-0000-4000-8000-000000000201$/);
  await expect(page.getByText("Question ID 101")).toBeVisible();
});
