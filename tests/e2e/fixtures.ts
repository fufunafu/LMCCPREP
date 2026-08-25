import { expect, test as base } from "@playwright/test";

export const test = base.extend<{ consoleErrors: string[] }>({
  consoleErrors: async ({ page }, run) => {
    const errors: string[] = [];
    page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
    page.on("pageerror", (error) => errors.push(error.message));
    await run(errors);
    expect(errors, "Unexpected browser console errors").toEqual([]);
  },
});

export { expect } from "@playwright/test";

export async function signInDemo(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await page.getByRole("button", { name: "Use demo login" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole("heading", { name: /Welcome back/ })).toBeVisible();
}
