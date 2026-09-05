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
  project: { code: string };
  qty: number;
  sap?: string;
  pedido?: string;
  partida?: string;
  serialNumber?: string;
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
  "officialLocationsFromStockRows",
  "deriveReadingProjectLabel",
  "deriveCaptureProjectLabel",
  "deriveReadingOfficialLocation",
  "clientVisibleProvisionalCaptures",
  "clientAdminStatusMessage",
  "clientCapturePhysicalLocation",
  "clientCaptureOfficialLocation",
  "renderClientProvisionalCaptureCard",
  "renderClientReadingEvidence"
]
  .map((name) => sliceFunction(js, name))
  .join("\n");

function makeHarness(stock: StockRow[]) {
  return new Function(
    `${coreFns}
function esc(v){return String(v??"");}
var state = { role: "CLIENT", stock: ${JSON.stringify(stock)}, provisionalCaptures: [] };
return {
  state,
  deriveReadingProjectLabel,
  deriveCaptureProjectLabel,
  deriveReadingOfficialLocation,
  clientVisibleProvisionalCaptures,
  clientCapturePhysicalLocation,
  clientCaptureOfficialLocation,
  renderClientProvisionalCaptureCard,
  stockRowsMatchingReading
};`
  )() as {
    state: { stock: StockRow[]; provisionalCaptures: Capture[] };
    deriveReadingProjectLabel: (reading: Record<string, string | null>) => string | null;
    deriveCaptureProjectLabel: (capture: Capture) => string | null;
    deriveReadingOfficialLocation: (reading: Record<string, string | null>) => string | null;
    clientVisibleProvisionalCaptures: () => Capture[];
    clientCapturePhysicalLocation: (capture: Capture) => string | null;
    clientCaptureOfficialLocation: (capture: Capture) => string | null;
    renderClientProvisionalCaptureCard: (capture: Capture) => string;
    stockRowsMatchingReading: (reading: Record<string, string | null>) => StockRow[];
  };
}

function capture(readings: Capture["readings"], overrides: Partial<Capture> = {}): Capture {
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
    readings,
    ...overrides
  };
}

const sharedLocationStock: StockRow[] = [
  { product: { sku: "SKU-P1" }, location: { code: "AN203" }, project: { code: "PROJ-ALPHA" }, qty: 3 },
  { product: { sku: "SKU-P2" }, location: { code: "AN203" }, project: { code: "PROJ-BETA" }, qty: 2 }
];

const dualProjectSkuStock: StockRow[] = [
  { product: { sku: "SKU-DUAL" }, location: { code: "AN100" }, project: { code: "PROJ-ALPHA" }, qty: 1 },
  { product: { sku: "SKU-DUAL" }, location: { code: "AN105" }, project: { code: "PROJ-BETA" }, qty: 1 }
];

const uniqueSkuStock: StockRow[] = [
  { product: { sku: "SKU-UNIQ" }, location: { code: "AN100" }, project: { code: "PROJ-ALPHA" }, qty: 4 }
];

const sameProjectTwoLocsStock: StockRow[] = [
  { product: { sku: "SKU-SAME" }, location: { code: "AN100" }, project: { code: "PROJ-ALPHA" }, qty: 2 },
  { product: { sku: "SKU-SAME" }, location: { code: "AN105" }, project: { code: "PROJ-ALPHA" }, qty: 3 }
];

test("cache-buster v=15.3", () => {
  assert.match(html, /logitec-role-demo\.js\?v=16.1/);
  assert.match(html, /logitec-role-demo\.css\?v=16.1/);
});

test("no usa lookupStockRowFromReadingMeta con find arbitrario", () => {
  assert.doesNotMatch(js, /function lookupStockRowFromReadingMeta/);
  assert.match(js, /stockRowsMatchingReading/);
  assert.match(js, /stock\.filter/);
});

test("ubicación compartida por dos proyectos → scan UBICACIÓN no infiere proyecto", () => {
  const h = makeHarness(sharedLocationStock);
  const reading = {
    raw: "AN203",
    normalized: "AN203",
    classification: "UBICACIÓN · AN203",
    scannedLocation: "AN203",
    at: "2026-09-05T08:00:30.000Z"
  };
  assert.equal(h.stockRowsMatchingReading(reading).length, 0);
  assert.equal(h.deriveReadingProjectLabel(reading), null);
  assert.equal(h.deriveReadingOfficialLocation(reading), null);
});

test("ubicación escaneada no se convierte en officialLocation", () => {
  const h = makeHarness(sharedLocationStock);
  const cp = capture([
    {
      raw: "AN203",
      normalized: "AN203",
      classification: "UBICACIÓN · AN203",
      scannedLocation: "AN203",
      officialLocation: "AN203",
      project: "PROJ-ALPHA",
      at: "2026-09-05T08:00:30.000Z"
    }
  ]);
  assert.equal(h.clientCapturePhysicalLocation(cp), "AN203");
  assert.equal(h.clientCaptureOfficialLocation(cp), null);
});

test("SKU en dos proyectos → proyecto ambiguo → Cliente no ve captura", () => {
  const h = makeHarness(dualProjectSkuStock);
  h.state.provisionalCaptures = [
    capture([{ raw: "SKU-DUAL", normalized: "SKU-DUAL", classification: "SKU · SKU-DUAL", at: "2026-09-05T08:00:30.000Z" }])
  ];
  assert.equal(h.deriveReadingProjectLabel(h.state.provisionalCaptures[0].readings[0]), null);
  assert.equal(h.clientVisibleProvisionalCaptures().length, 0);
});

test("SKU único de un proyecto → Cliente sí la ve", () => {
  const h = makeHarness(uniqueSkuStock);
  h.state.provisionalCaptures = [
    capture([{ raw: "SKU-UNIQ", normalized: "SKU-UNIQ", classification: "SKU · SKU-UNIQ", at: "2026-09-05T08:00:30.000Z" }])
  ];
  assert.equal(h.deriveCaptureProjectLabel(h.state.provisionalCaptures[0]), "PROJ-ALPHA");
  assert.equal(h.clientVisibleProvisionalCaptures().length, 1);
});

test("SKU mismo proyecto pero dos ubicaciones → proyecto sí; ubicación oficial NO se inventa", () => {
  const h = makeHarness(sameProjectTwoLocsStock);
  const reading = { raw: "SKU-SAME", normalized: "SKU-SAME", classification: "SKU · SKU-SAME", at: "2026-09-05T08:00:30.000Z" };
  assert.equal(h.deriveReadingProjectLabel(reading), "PROJ-ALPHA");
  assert.equal(h.deriveReadingOfficialLocation(reading), null);
});

test("evidencia oficial AN100 + scan físico AN203 → Cliente muestra ambas separadas", () => {
  const h = makeHarness(uniqueSkuStock);
  const cp = capture([
    { raw: "SKU-UNIQ", normalized: "SKU-UNIQ", classification: "SKU · SKU-UNIQ", at: "2026-09-05T08:00:20.000Z" },
    {
      raw: "AN203",
      normalized: "AN203",
      classification: "UBICACIÓN · AN203",
      scannedLocation: "AN203",
      at: "2026-09-05T08:00:30.000Z"
    }
  ]);
  assert.equal(h.clientCaptureOfficialLocation(cp), "AN100");
  assert.equal(h.clientCapturePhysicalLocation(cp), "AN203");
  const card = h.renderClientProvisionalCaptureCard(cp);
  assert.match(card, /Ubicación física reportada<\/span> AN203/);
  assert.match(card, /Ubicación oficial<\/span> AN100/);
});

test("dos lecturas con proyectos conflictivos → captura no visible al Cliente", () => {
  const h = makeHarness([
    { product: { sku: "SKU-A" }, location: { code: "AN100" }, project: { code: "PROJ-ALPHA" }, qty: 1 },
    { product: { sku: "SKU-B" }, location: { code: "AN105" }, project: { code: "PROJ-BETA" }, qty: 1 }
  ]);
  h.state.provisionalCaptures = [
    capture([
      { raw: "SKU-A", normalized: "SKU-A", classification: "SKU · SKU-A", at: "2026-09-05T08:00:20.000Z" },
      { raw: "SKU-B", normalized: "SKU-B", classification: "SKU · SKU-B", at: "2026-09-05T08:00:30.000Z" }
    ])
  ];
  assert.equal(h.deriveCaptureProjectLabel(h.state.provisionalCaptures[0]), null);
  assert.equal(h.clientVisibleProvisionalCaptures().length, 0);
});

test("Sin proyecto y FREE_TO_SALE siguen excluidos", () => {
  const h = makeHarness([
    { product: { sku: "SKU-NP" }, location: { code: "AN001" }, project: { code: "Sin proyecto" }, qty: 1 },
    { product: { sku: "SKU-FTS" }, location: { code: "AN002" }, project: { code: "FREE_TO_SALE" }, qty: 1 }
  ]);
  h.state.provisionalCaptures = [
    capture([{ raw: "SKU-NP", normalized: "SKU-NP", classification: "SKU · SKU-NP", at: "2026-09-05T08:00:20.000Z" }]),
    capture([{ raw: "SKU-FTS", normalized: "SKU-FTS", classification: "SKU · SKU-FTS", at: "2026-09-05T08:00:30.000Z" }])
  ];
  assert.equal(h.clientVisibleProvisionalCaptures().length, 0);
});

test("RAW intacto y stock intacto", () => {
  const h = makeHarness(uniqueSkuStock);
  const stockBefore = structuredClone(h.state.stock);
  const cp = capture([{ raw: "]C1SKU-UNIQ", normalized: "SKU-UNIQ", classification: "SKU · SKU-UNIQ", at: "2026-09-05T08:00:30.000Z" }]);
  h.state.provisionalCaptures = [cp];
  h.clientVisibleProvisionalCaptures();
  h.renderClientProvisionalCaptureCard(cp);
  assert.deepEqual(h.state.stock, stockBefore);
  assert.match(h.renderClientProvisionalCaptureCard(cp), /<code>\]C1SKU-UNIQ<\/code>/);
});

test("demo bloquea escrituras no-GET", () => {
  assert.match(js, /Demo read-only: \$\{method\} bloqueado/);
  assert.match(js, /state\.blockedWrites \+= 1/);
});
