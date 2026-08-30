import { defineConfig, devices } from "@playwright/test";

const port = Number(process.env.E2E_PORT || 3100);
const baseURL = process.env.E2E_BASE_URL || `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: "./test/e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  globalSetup: "./scripts/e2e-global-setup.ts",
  globalTeardown: "./scripts/e2e-global-teardown.ts",
  outputDir: "test/e2e/evidence/results",
  reporter: [
    ["list"],
    ["json", { outputFile: "test/e2e/evidence/playwright-results.json" }]
  ],
  use: {
    baseURL,
    headless: true,
    screenshot: "on",
    video: "on",
    trace: "off"
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
