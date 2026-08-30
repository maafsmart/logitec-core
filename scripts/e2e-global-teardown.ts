import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { sanitizePlaywrightResultsDump } from "../src/scripts/e2e-safety.js";

type SpecRow = { title?: string; tests?: Array<{ results?: Array<{ status?: string }> }> };
type SuiteRow = { suites?: SuiteRow[]; specs?: SpecRow[] };
type ResultsFile = { suites?: SuiteRow[]; stats?: { expected?: number; unexpected?: number } };

function collectSpecs(suites: SuiteRow[] | undefined, out: Array<{ title: string; status: string }>) {
  for (const suite of suites || []) {
    for (const spec of suite.specs || []) {
      const status = spec.tests?.[0]?.results?.[0]?.status || "unknown";
      out.push({ title: spec.title || "(untitled)", status });
    }
    collectSpecs(suite.suites, out);
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function readResultsWhenReady(resultsPath: string): Promise<ResultsFile | null> {
  for (let attempt = 0; attempt < 15; attempt += 1) {
    if (existsSync(resultsPath)) {
      try {
        const raw = JSON.parse(readFileSync(resultsPath, "utf8")) as ResultsFile;
        const tests: Array<{ title: string; status: string }> = [];
        collectSpecs(raw.suites, tests);
        if (tests.length > 0 || Number(raw.stats?.expected || 0) > 0) return raw;
      } catch {
        /* reporter still writing */
      }
    }
    await sleep(200);
  }
  return null;
}

function writeAuditReport(dir: string, tests: Array<{ title: string; status: string }>) {
  const passed = tests.filter((t) => t.status === "passed" || t.status === "expected").length;
  const failed = tests.filter((t) => t.status === "failed" || t.status === "unexpected").length;
  const report = [
    "# Evidencia Playwright E2E (sin secretos)",
    "",
    `- Fecha: ${new Date().toISOString()}`,
    `- Tests: ${passed}/${tests.length} PASS`,
    `- Failed: ${failed}`,
    "",
    "## Matriz de roles",
    "- ADMIN: qa.admin@logitec.local",
    "- SUPERVISOR: qa.supervisor@logitec.local",
    "- OPERATOR: qa.operator@logitec.local",
    "- CLIENT: qa.client@logitec.local",
    "",
    "## Casos",
    ...tests.map((t) => `- ${t.status}: ${t.title}`),
    "",
    "Videos, screenshots, console.log y network.log están en este directorio / results.",
    "No se guardan passwords, tokens, cookies ni Authorization."
  ].join("\n");
  writeFileSync(path.join(dir, "audit-report.md"), `${report}\n`);
}

export default async function globalTeardown() {
  const dir = path.resolve("test/e2e/evidence");
  mkdirSync(dir, { recursive: true });
  const resultsPath = path.join(dir, "playwright-results.json");
  const tests: Array<{ title: string; status: string }> = [];
  const raw = await readResultsWhenReady(resultsPath);
  if (raw) {
    const sanitized = sanitizePlaywrightResultsDump(raw) as ResultsFile;
    writeFileSync(resultsPath, `${JSON.stringify(sanitized, null, 2)}\n`);
    collectSpecs(sanitized.suites, tests);
  }
  writeAuditReport(dir, tests);
}
