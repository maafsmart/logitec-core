import { defineConfig, devices } from "@playwright/test";

const port = Number(process.env.E2E_PORT || 3100);
const baseURL = process.env.E2E_BASE_URL || `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: "./test/e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: [["list"]],
  use: {
    baseURL,
    headless: true,
    screenshot: "only-on-failure",
    video: "on",
    trace: "retain-on-failure"
  },
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: `npx tsx src/server.ts`,
        url: `${baseURL}/health`,
        reuseExistingServer: false,
        timeout: 60_000,
        env: {
          ...process.env,
          NODE_ENV: "development",
          DATABASE_ENVIRONMENT: "development",
          PORT: String(port)
        }
      },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }]
});
