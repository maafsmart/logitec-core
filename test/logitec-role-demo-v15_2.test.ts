import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const html = readFileSync(new URL("../public/logitec-role-demo.html", import.meta.url), "utf8");
const js = readFileSync(new URL("../public/logitec-role-demo.js", import.meta.url), "utf8");

function sliceFunction(source: string, name: string): string {
  const token = `function ${name}(`;
  const start = source.indexOf(token);
  assert.ok(start >= 0, `missing function ${name}`);
  let paren = 0;
  let brace = -1;
  for (let i = start + token.length - 1; i < source.length; i += 1) {
    const ch = source[i];
    if (brace < 0) {
      if (ch === "(") paren += 1;
      else if (ch === ")") {
        paren -= 1;
        if (paren === 0) {
          brace = source.indexOf("{", i);
          if (brace < 0) break;
          i = brace - 1;
        }
      }
      continue;
    }
    if (ch === "{") paren += 1;
    else if (ch === "}") {
      paren -= 1;
      if (paren === 0) return source.slice(start, i + 1);
    }
  }
  throw new Error(`unclosed function ${name}`);
}

type StockRow = {
  product: { sku: string };
  location: { code: string };
  project: { code: string } | null;
  qty: number;
};

type Capture = {
  id: string;
  status: string;
  declaredAction: string;
  executor: string;
  reviewer: string | null;
  reviewType: string | null;
  physicalStartedAt: string;
  physicalEndedAt: string;
  adminUpdatedAt: string | null;
  readings: Array<Record<string, string | null>>;
};

const coreFns = [
  "normalizeScannerRawValue",
  "isAuthorizedClientProject",
  "clientAuthorizedProjectSet",
  "readingClassificationKind",
  "stockRowsMatchingReading",
  "projectLabelFromStockRow",
  "authorizedProjectsFromStockRows",
  "deriveReadingProjectLabel",
  "deriveCaptureProjectLabel",
  "clientVisibleProvisionalCaptures"
]
  .map((name) => sliceFunction(js, name))
  .join("\n");

function makeHarness(stock: StockRow[]) {
  return new Function(
    `${coreFns}
var state = { role: "CLIENT", stock: ${JSON.stringify(stock)}, provisionalCaptures: [] };
return { state, deriveReadingProjectLabel, clientVisibleProvisionalCaptures };`
  )() as {
    state: { stock: StockRow[]; provisionalCaptures: Capture[] };
    deriveReadingProjectLabel: (reading: Record<string, string | null>) => string | null;
    clientVisibleProvisionalCaptures: () => Capture[];
  };
}

function skuReading(sku: string) {
  return { raw: sku, normalized: sku, classification: `SKU · ${sku}`, at: "2026-09-05T08:00:30.000Z" };
}

function capture(readings: Capture["readings"]): Capture {
  return {
    id: "CP-0001",
    status: "PENDIENTE DE SUPERVISIÓN",
    declaredAction: "Recibir mercancía",
    executor: "Operador",
    reviewer: null,
    reviewType: null,
    physicalStartedAt: "2026-09-05T08:00:00.000Z",
    physicalEndedAt: "2026-09-05T08:01:00.000Z",
    adminUpdatedAt: null,
    readings
  };
}

test("cache-buster v=15.3", () => {
  assert.match(html, /logitec-role-demo\.js\?v=15\.3\.1/);
  assert.match(html, /logitec-role-demo\.css\?v=15\.3\.1/);
});

test("fail-closed evalúa todas las coincidencias antes de filtrar autorizables", () => {
  assert.match(sliceFunction(js, "authorizedProjectsFromStockRows"), /for \(const project of projects\)/);
  assert.match(sliceFunction(js, "authorizedProjectsFromStockRows"), /if \(!isAuthorizedClientProject\(project\)\) return new Set\(\)/);
  assert.doesNotMatch(sliceFunction(js, "authorizedProjectsFromStockRows"), /if \(isAuthorizedClientProject\(project\)\) projects\.add/);
});

test("mismo SKU en dos filas del mismo proyecto → visible", () => {
  const h = makeHarness([
    { product: { sku: "SKU-SAME" }, location: { code: "AN100" }, project: { code: "PROJ-ALPHA" }, qty: 1 },
    { product: { sku: "SKU-SAME" }, location: { code: "AN105" }, project: { code: "PROJ-ALPHA" }, qty: 2 }
  ]);
  h.state.provisionalCaptures = [capture([skuReading("SKU-SAME")])];
  assert.equal(h.deriveReadingProjectLabel(skuReading("SKU-SAME")), "PROJ-ALPHA");
  assert.equal(h.clientVisibleProvisionalCaptures().length, 1);
});

test("proyecto autorizado + FREE_TO_SALE → no visible", () => {
  const h = makeHarness([
    { product: { sku: "SKU-MIX" }, location: { code: "AN100" }, project: { code: "PROJ-ALPHA" }, qty: 1 },
    { product: { sku: "SKU-MIX" }, location: { code: "AN105" }, project: { code: "FREE_TO_SALE" }, qty: 2 }
  ]);
  h.state.provisionalCaptures = [capture([skuReading("SKU-MIX")])];
  assert.equal(h.deriveReadingProjectLabel(skuReading("SKU-MIX")), null);
  assert.equal(h.clientVisibleProvisionalCaptures().length, 0);
});

test("proyecto autorizado + Sin proyecto → no visible", () => {
  const h = makeHarness([
    { product: { sku: "SKU-MIX" }, location: { code: "AN100" }, project: { code: "PROJ-ALPHA" }, qty: 1 },
    { product: { sku: "SKU-MIX" }, location: { code: "AN105" }, project: { code: "Sin proyecto" }, qty: 2 }
  ]);
  h.state.provisionalCaptures = [capture([skuReading("SKU-MIX")])];
  assert.equal(h.deriveReadingProjectLabel(skuReading("SKU-MIX")), null);
  assert.equal(h.clientVisibleProvisionalCaptures().length, 0);
});

test("proyecto autorizado + null/vacío → no visible", () => {
  const h = makeHarness([
    { product: { sku: "SKU-MIX" }, location: { code: "AN100" }, project: { code: "PROJ-ALPHA" }, qty: 1 },
    { product: { sku: "SKU-MIX" }, location: { code: "AN105" }, project: null, qty: 2 }
  ]);
  h.state.provisionalCaptures = [capture([skuReading("SKU-MIX")])];
  assert.equal(h.deriveReadingProjectLabel(skuReading("SKU-MIX")), null);
  assert.equal(h.clientVisibleProvisionalCaptures().length, 0);
});

test("dos proyectos autorizados distintos → no visible", () => {
  const h = makeHarness([
    { product: { sku: "SKU-MIX" }, location: { code: "AN100" }, project: { code: "PROJ-ALPHA" }, qty: 1 },
    { product: { sku: "SKU-MIX" }, location: { code: "AN105" }, project: { code: "PROJ-BETA" }, qty: 2 }
  ]);
  h.state.provisionalCaptures = [capture([skuReading("SKU-MIX")])];
  assert.equal(h.deriveReadingProjectLabel(skuReading("SKU-MIX")), null);
  assert.equal(h.clientVisibleProvisionalCaptures().length, 0);
});

test("solo FREE_TO_SALE → no visible", () => {
  const h = makeHarness([
    { product: { sku: "SKU-FTS" }, location: { code: "AN002" }, project: { code: "FREE_TO_SALE" }, qty: 1 }
  ]);
  h.state.provisionalCaptures = [capture([skuReading("SKU-FTS")])];
  assert.equal(h.deriveReadingProjectLabel(skuReading("SKU-FTS")), null);
  assert.equal(h.clientVisibleProvisionalCaptures().length, 0);
});

test("RAW intacto y stock intacto", () => {
  const h = makeHarness([
    { product: { sku: "SKU-SAME" }, location: { code: "AN100" }, project: { code: "PROJ-ALPHA" }, qty: 1 },
    { product: { sku: "SKU-SAME" }, location: { code: "AN105" }, project: { code: "PROJ-ALPHA" }, qty: 2 }
  ]);
  const stockBefore = structuredClone(h.state.stock);
  const reading = { raw: "]C1SKU-SAME", normalized: "SKU-SAME", classification: "SKU · SKU-SAME", at: "2026-09-05T08:00:30.000Z" };
  h.state.provisionalCaptures = [capture([reading])];
  h.clientVisibleProvisionalCaptures();
  assert.deepEqual(h.state.stock, stockBefore);
  assert.equal(reading.raw, "]C1SKU-SAME");
});

test("demo bloquea escrituras no-GET", () => {
  assert.match(js, /Demo read-only: \$\{method\} bloqueado/);
  assert.match(js, /state\.blockedWrites \+= 1/);
});
