import AxeBuilder from "@axe-core/playwright";
import { expect, signInDemo, test } from "./fixtures";

test("public landing shows all five available discipline totals", async ({ page, consoleErrors }) => {
  void consoleErrors;
  await page.goto("/");
  const subjects = page.getByRole("region", { name: /questions across five available disciplines/i });
  await expect(subjects.getByRole("heading", { level: 3 })).toHaveCount(5);
  await expect(page.getByText("$59", { exact: true })).toBeVisible();
  await expect(page.getByText("$349", { exact: true })).toBeVisible();

  await page.goto("/refund-policy");
  await expect(page.getByRole("heading", { name: "Initial-purchase refunds" })).toBeVisible();
  await expect(page.getByText(/no more than 25 questions/)).toBeVisible();

  await page.goto("/terms");
  await expect(page.getByText("Montreal QBank is operated by 15041074 Canada Inc.")).toBeVisible();
  await expect(page.getByText("67 Westmore Dr, Unit 19, Etobicoke, ON M9V 3Y6, Canada")).toBeVisible();

  await page.goto("/support");
  await expect(page.getByRole("link", { name: "fuanne_gm@hotmail.com" })).toHaveAttribute("href", "mailto:fuanne_gm@hotmail.com");
});

test("demo login, protected routes, and sign-out", async ({ page, consoleErrors }) => {
  void consoleErrors;
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login\?next=%2Fdashboard$/);
  await signInDemo(page);
  await page.goto("/settings");
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login\?notice=signed-out$/);
  await expect(page.getByRole("status")).toContainText("signed out");
  await page.goto("/stats");
  await expect(page).toHaveURL(/\/login\?next=%2Fstats$/);
});

test("dashboard navigation reaches every primary destination", async ({ page, consoleErrors }) => {
  void consoleErrors;
  await signInDemo(page);
  const navigation = page.getByRole("navigation", { name: "Main navigation" });
  for (const [name, path, heading] of [
    ["New session", "/create", "Create a practice session"],
    ["Questions", "/questions", "Browse all questions"],
    ["Statistics", "/stats", "Your statistics"],
    ["Settings", "/settings", "Settings"],
    ["Dashboard", "/dashboard", /Welcome back/],
  ] as const) {
    await navigation.getByRole("link", { name }).click();
    await expect(page).toHaveURL(new RegExp(`${path}$`));
    await expect(page.getByRole("heading", { name: heading })).toBeVisible();
  }
});

test("demo app navigation makes no browser Supabase requests", async ({ page, consoleErrors }) => {
  void consoleErrors;
  const supabaseRequests: string[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).hostname.endsWith(".supabase.co")) supabaseRequests.push(request.url());
  });
  await signInDemo(page);
  await page.goto("/create");
  await page.goto("/billing");
  await page.goto("/settings");
  await page.goto("/session/demo?mode=tutor");
  expect(supabaseRequests).toEqual([]);
});

test("demo billing stays isolated from Stripe and live portal actions", async ({ page, consoleErrors }) => {
  void consoleErrors;
  const billingRequests: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.hostname.includes("stripe") || url.hostname.endsWith(".supabase.co") || url.pathname.startsWith("/api/billing/")) {
      billingRequests.push(request.url());
    }
  });
  await signInDemo(page);
  await page.goto("/billing");
  await expect(page.getByRole("heading", { name: "Billing" })).toBeVisible();
  await expect(page.getByText("Demo access", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Manage billing" })).toHaveCount(0);
  expect(billingRequests).toEqual([]);
});

test("password recovery is discoverable and privacy-preserving", async ({ page, consoleErrors }) => {
  void consoleErrors;
  await page.goto("/login");
  await page.getByRole("link", { name: "Forgot password?" }).click();
  await expect(page).toHaveURL(/\/forgot-password$/);
  await expect(page.getByRole("heading", { name: "Reset your password" })).toBeVisible();
  await expect(page.getByText(/confirmation is the same/i)).toBeVisible();
});

test("password recovery submission reaches Supabase without account disclosure", async ({ page, consoleErrors }) => {
  test.skip(process.env.RUN_SUPABASE_E2E !== "1", "Runs only when deliberate Supabase integration testing is enabled.");
  void consoleErrors;
  await page.goto("/forgot-password");
  await page.getByLabel("Email address").fill("invalid-reset@lmccprep.test");
  await page.getByRole("button", { name: "Send reset link" }).click();
  await expect(page).toHaveURL(/\/login\?notice=reset-sent$/);
  await expect(page.getByRole("status")).toContainText(/If an invited account matches/i);
});

test("login and dashboard have no serious accessibility violations", async ({ page, consoleErrors }) => {
  void consoleErrors;
  await page.goto("/login");
  let results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
  expect(results.violations.filter((violation) => ["serious", "critical"].includes(violation.impact ?? ""))).toEqual([]);
  await signInDemo(page);
  results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
  expect(results.violations.filter((violation) => ["serious", "critical"].includes(violation.impact ?? ""))).toEqual([]);
});

test("real login failure messaging", async ({ page, consoleErrors }) => {
  test.skip(process.env.RUN_SUPABASE_E2E !== "1", "Runs only when deliberate Supabase integration testing is enabled.");
  void consoleErrors;
  await page.goto("/login");
  await page.locator("#email").fill("invalid-login@lmccprep.test");
  await page.locator("#password").fill("definitely-not-valid");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("alert").filter({ hasText: /incorrect|too many attempts|could not reach/i })).toBeVisible();
});

test("reset progress requires explicit confirmation", async ({ page, consoleErrors }) => {
  void consoleErrors;
  await signInDemo(page);
  await page.goto("/settings");
  await page.getByRole("button", { name: "Reset progress" }).click();
  const confirm = page.getByRole("button", { name: "Reset everything" });
  await expect(confirm).toBeDisabled();
  await page.getByLabel("Type RESET to confirm").fill("RESET");
  await expect(confirm).toBeEnabled();
  await confirm.click();
  await expect(page.getByText("Demo progress is temporary")).toBeVisible();
});
