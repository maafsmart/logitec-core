import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./test/e2e-pda",
  fullyParallel: false,
  workers: 1,
  timeout: 30_000,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:4179",
    headless: true,
    trace: "off"
  },
  webServer: {
    command: "NODE_ENV=test DATABASE_ENVIRONMENT=qa DATABASE_URL=postgresql://local:local@127.0.0.1:5432/logitec_browser_test PRODUCTION_DATABASE_HOST=production.invalid JWT_SECRET=test-only-secret-at-least-12 PDA_TOKEN_PEPPER=test-only-pda-pepper-at-least-32-characters ENABLE_PDA_SCANNER_LAB=true PORT=4179 npx tsx src/server.ts",
    url: "http://127.0.0.1:4179/health",
    reuseExistingServer: false,
    timeout: 30_000
  },
  projects: [{
    name: "borrowed-android",
    use: { ...devices["Pixel 7"] }
  }]
});
