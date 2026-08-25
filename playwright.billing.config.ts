import { defineConfig } from "@playwright/test";

const appPort = 3102;
const fixturePort = 54329;
const appUrl = `http://127.0.0.1:${appPort}`;
const fixtureUrl = `http://127.0.0.1:${fixturePort}`;
const appEnvironment = [
  "BILLING_FIXTURE=true",
  `NEXT_PUBLIC_SUPABASE_URL=${fixtureUrl}`,
  "NEXT_PUBLIC_SUPABASE_ANON_KEY=fixture-anon-key",
  `NEXT_PUBLIC_SITE_URL=${appUrl}`,
  "STRIPE_SECRET_KEY=sk_test_fixture",
  "STRIPE_WEBHOOK_SECRET=whsec_fixture",
  "STRIPE_PRICE_MONTHLY=price_monthly",
  "STRIPE_PRICE_ANNUAL=price_annual",
  "SUPABASE_SERVICE_ROLE_KEY=fixture-service-role",
  "BILLING_REQUIRED=true",
  "BILLING_GRACE_DAYS=3",
  "BILLING_TERMS_READY=true",
  "NEXT_PUBLIC_BILLING_MONTHLY_CAD=20",
  "NEXT_PUBLIC_BILLING_ANNUAL_CAD=200",
].join(" ");

export default defineConfig({
  testDir: "./tests/billing-e2e",
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: appUrl,
    browserName: "chromium",
    channel: "chrome",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: [
    {
      command: `BILLING_FIXTURE_PORT=${fixturePort} node tests/billing-fixture/server.mjs`,
      url: `${fixtureUrl}/health`,
      reuseExistingServer: false,
      timeout: 30_000,
    },
    {
      command: `${appEnvironment} npm run dev -- --hostname 127.0.0.1 --port ${appPort}`,
      url: appUrl,
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
});
