import { defineConfig, devices } from "@playwright/test";

const externalBaseUrl = process.env.PLAYWRIGHT_BASE_URL;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: externalBaseUrl ?? "http://127.0.0.1:3100",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  webServer: externalBaseUrl ? undefined : {
    command: "ulimit -n 4096 && npm run start -- --hostname 127.0.0.1 --port 3100",
    url: "http://127.0.0.1:3100",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects: [
    {
      name: "desktop-chrome",
      grepInvert: /@mobile/,
      use: { browserName: "chromium", channel: "chrome", viewport: { width: 1440, height: 1000 } },
    },
    {
      name: "mobile-chrome",
      grep: /@mobile/,
      use: { ...devices["iPhone 13"], browserName: "chromium", channel: "chrome" },
    },
  ],
});
