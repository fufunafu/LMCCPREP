import AxeBuilder from "@axe-core/playwright";
import { expect, signInDemo, test } from "./fixtures";

test.beforeEach(async ({ page }) => { await signInDemo(page); });

test("creates a tutor session and supports answer elimination", async ({ page, consoleErrors }) => {
  void consoleErrors;
  await page.goto("/create");
  await page.getByRole("button", { name: /Start session/ }).click();
  await expect(page).toHaveURL(/\/session\/demo\?mode=tutor$/);
  await expect(page.getByText(/Could not create the session/)).toHaveCount(0);
  await page.getByRole("button", { name: "Strike out answer B" }).click();
  await expect(page.getByRole("button", { name: "Restore answer B" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("radio", { name: /B Radiation to the back/ })).toBeDisabled();
  await page.getByRole("radio", { name: /C A soft, position-dependent systolic sound/ }).click();
  await page.getByRole("button", { name: "Submit answer" }).click();
  await expect(page.getByText("Correct", { exact: true }).first()).toBeVisible();
  await page.reload();
  await expect(page.getByText("Correct", { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Submit answer" })).toHaveCount(0);
  await page.getByRole("button", { name: /Next question/ }).click();
  await page.locator("aside").getByRole("button", { name: /^Go to question 1(?:,|$)/ }).click();
  await expect(page.getByText("Correct", { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Submit answer" })).toHaveCount(0);
});

test("timed mode records an answer and advances without showing feedback", async ({ page, consoleErrors }) => {
  void consoleErrors;
  await page.goto("/create");
  await page.getByRole("button", { name: /Timed mode/ }).click();
  await page.getByRole("button", { name: /Start session/ }).click();
  await expect(page).toHaveURL(/\/session\/demo\?mode=timed$/);
  await expect(page.getByText("01:23")).toBeVisible();
  await expect(page.getByText(/01:2[12]/)).toBeVisible({ timeout: 3_000 });
  await page.getByRole("radio", { name: /C A soft, position-dependent systolic sound/ }).click();
  await page.getByRole("button", { name: "Submit answer" }).click();
  await expect(page.getByText(/Answer saved/)).toBeVisible();
  await expect(page.getByText("Review the reasoning", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Q 2 / 20")).toBeVisible();
  await page.reload();
  await expect(page.getByText("Q 2 / 20")).toBeVisible();
  await page.getByRole("button", { name: "End session" }).click();
  await expect(page).toHaveURL(/\/session\/demo\/review\?mode=timed$/);
  await page.getByRole("link", { name: "Review all" }).click();
  await expect(page).toHaveURL(/\/session\/demo\?mode=timed&q=1&review=1$/);
  await expect(page.getByText("Q 1 / 20")).toBeVisible();
});

test("opens notes, toggles a flag, and reaches session review", async ({ page, consoleErrors }) => {
  void consoleErrors;
  await page.goto("/session/demo?mode=tutor");
  const flag = page.getByRole("button", { name: "Flag question" });
  if (await flag.getAttribute("aria-pressed") === "true") {
    await flag.click();
    await expect(flag).toHaveAttribute("aria-pressed", "false");
  }
  await flag.click();
  await expect(flag).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Open notes" }).click();
  await page.getByPlaceholder(/Write a clinical pearl/).fill("Review this clinical distinction.");
  await page.getByRole("button", { name: "Save note" }).click();
  await expect(page.getByText("Note saved")).toBeVisible();
  await page.reload();
  await expect(flag).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Open notes" }).click();
  await expect(page.getByPlaceholder(/Write a clinical pearl/)).toHaveValue("Review this clinical distinction.");
  await page.getByRole("button", { name: "Close" }).click();
  await page.getByRole("button", { name: "Report an issue" }).click();
  await page.getByPlaceholder(/option C is cut off/).fill("The wording needs review.");
  await page.getByRole("button", { name: "Send report" }).click();
  await expect(page.getByText("Reports are not sent from the demo")).toBeVisible();
  await page.getByRole("button", { name: "End session" }).click();
  await expect(page).toHaveURL(/\/session\/demo\/review\?mode=tutor$/);
  await expect(page.getByRole("heading", { name: /Strong work/ })).toBeVisible();
  await page.getByRole("link", { name: "Review all" }).click();
  await expect(page).toHaveURL(/\/session\/demo\?mode=tutor&q=1&review=1$/);
  await expect(page.getByText("Review mode")).toBeVisible();
});

test("question player has no serious accessibility violations", async ({ page, consoleErrors }) => {
  void consoleErrors;
  await page.goto("/session/demo?mode=tutor");
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
  expect(results.violations.filter((violation) => ["serious", "critical"].includes(violation.impact ?? ""))).toEqual([]);
});
