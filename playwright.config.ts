import dotenv from "dotenv";
import { defineConfig, devices } from "@playwright/test";
import { buildE2eWebServerEnv } from "./src/scripts/e2e-safety.js";

dotenv.config();

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
        command: "npx tsx scripts/e2e-web-server.ts",
        url: `${baseURL}/health`,
        reuseExistingServer: false,
        timeout: 60_000,
        env: buildE2eWebServerEnv(process.env, port)
      },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }]
});
