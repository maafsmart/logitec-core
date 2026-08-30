import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";

type SpecRow = { title?: string; tests?: Array<{ results?: Array<{ status?: string }> }> };
type SuiteRow = { suites?: SuiteRow[]; specs?: SpecRow[] };

function collectSpecs(suites: SuiteRow[] | undefined, out: Array<{ title: string; status: string }>) {
  for (const suite of suites || []) {
    for (const spec of suite.specs || []) {
      const status = spec.tests?.[0]?.results?.[0]?.status || "unknown";
      out.push({ title: spec.title || "(untitled)", status });
    }
    collectSpecs(suite.suites, out);
  }
}

export default async function globalTeardown() {
  const dir = path.resolve("test/e2e/evidence");
  mkdirSync(dir, { recursive: true });
  const resultsPath = path.join(dir, "playwright-results.json");
  const tests: Array<{ title: string; status: string }> = [];
  if (existsSync(resultsPath)) {
    try {
      const raw = JSON.parse(readFileSync(resultsPath, "utf8")) as { suites?: SuiteRow[] };
      collectSpecs(raw.suites, tests);
    } catch {
      /* evidencia incompleta */
    }
  }
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
  writeFileSync(path.join(dir, "audit-report.md"), report);
}
