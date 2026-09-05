import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const html = readFileSync(new URL("../public/logitec-role-demo.html", import.meta.url), "utf8");
const js = readFileSync(new URL("../public/logitec-role-demo.js", import.meta.url), "utf8");
const policies = readFileSync(new URL("../docs/POLITICAS_SISTEMA_LOGITEC_CORE_WMS.md", import.meta.url), "utf8");

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

const harnessSrc = `
${sliceFunction(js, "normalizeScannerRawValue")}
${sliceFunction(js, "isAuthorizedClientProject")}
${sliceFunction(js, "clientAuthorizedProjectSet")}
${sliceFunction(js, "readingClassificationKind")}
${sliceFunction(js, "stockRowsMatchingReading")}
${sliceFunction(js, "projectLabelFromStockRow")}
${sliceFunction(js, "authorizedProjectsFromStockRows")}
${sliceFunction(js, "officialLocationsFromStockRows")}
${sliceFunction(js, "deriveReadingProjectLabel")}
${sliceFunction(js, "deriveCaptureProjectLabel")}
${sliceFunction(js, "deriveReadingOfficialLocation")}
${sliceFunction(js, "clientVisibleProvisionalCaptures")}
${sliceFunction(js, "clientAdminStatusMessage")}
${sliceFunction(js, "renderClientProvisionalCaptureCard")}
${sliceFunction(js, "clientCapturePhysicalLocation")}
${sliceFunction(js, "clientCaptureOfficialLocation")}
${sliceFunction(js, "renderClientReadingEvidence")}
function esc(v){return String(v??"");}
var state = {
  role: "CLIENT",
  stock: [
    { product: { sku: "SKU-A" }, location: { code: "AN203" }, project: { code: "AVIAT NETWORKS" }, qty: 5, sap: "SAP-1", pedido: "45003182", partida: "P-1" },
    { product: { sku: "SKU-FREE" }, location: { code: "AN105" }, project: { code: "FREE_TO_SALE" }, qty: 2 }
  ],
  provisionalCaptures: []
};
function applyRoleView(role) {
  state.role = role;
}
return {
  state,
  applyRoleView,
  isAuthorizedClientProject,
  clientVisibleProvisionalCaptures,
  clientAdminStatusMessage,
  renderClientProvisionalCaptureCard,
  clientCapturePhysicalLocation,
  clientCaptureOfficialLocation
};`;

const harness = new Function(harnessSrc)() as {
  state: {
    role: string;
    stock: unknown[];
    provisionalCaptures: Capture[];
  };
  applyRoleView: (role: string) => void;
  clientVisibleProvisionalCaptures: () => Capture[];
  clientAdminStatusMessage: (status: string) => string;
  renderClientProvisionalCaptureCard: (capture: Capture) => string;
};

function authorizedCapture(overrides: Partial<Capture> = {}): Capture {
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
    readings: [{ raw: "SKU-A", normalized: "SKU-A", classification: "SKU · SKU-A", project: "AVIAT NETWORKS", at: "2026-09-05T08:00:30.000Z" }],
    ...overrides
  };
}

test("cache-buster v=15.3", () => {
  assert.match(html, /logitec-role-demo\.js\?v=15\.3/);
  assert.match(html, /logitec-role-demo\.css\?v=15\.3/);
});

test("Cliente conserva Inicio + Consulta", () => {
  assert.match(js, /CLIENT:\s*\{\s*tabs:\s*\[\{ id: "inicio", label: "Inicio" \}, \{ id: "consulta", label: "Consulta" \}\]/);
});

test("Cliente sigue sin scanner", () => {
  const clientBlock = js.slice(js.indexOf("CLIENT:"), js.indexOf("const state = {"));
  assert.doesNotMatch(clientBlock, /ESCANEO LIBRE/);
  assert.doesNotMatch(clientBlock, /renderScannerWorkspace/);
  const freeScanBlock = sliceFunction(js, "freeScanRoleContext");
  assert.doesNotMatch(freeScanBlock, /CLIENT/);
});

test("Operador genera CP y cambio a Cliente conserva memoria", () => {
  const h = new Function(harnessSrc)() as typeof harness;
  h.state.provisionalCaptures = [authorizedCapture()];
  h.applyRoleView("OPERATOR");
  assert.equal(h.state.provisionalCaptures.length, 1);
  h.applyRoleView("CLIENT");
  assert.equal(h.state.provisionalCaptures.length, 1);
  assert.equal(h.clientVisibleProvisionalCaptures().length, 1);
});

test("Supervisor genera CP y cambio a Cliente conserva memoria", () => {
  const h = new Function(harnessSrc)() as typeof harness;
  h.state.provisionalCaptures = [authorizedCapture({ executor: "Supervisor", status: "VALIDADO · PENDIENTE DE REGISTRO" })];
  h.applyRoleView("SUPERVISOR");
  h.applyRoleView("CLIENT");
  assert.equal(h.state.provisionalCaptures.length, 1);
});

test("captura sin proyecto identificable no se muestra al Cliente", () => {
  harness.state.provisionalCaptures = [
    authorizedCapture({ readings: [{ raw: "UNKNOWN", normalized: "UNKNOWN", classification: "SIN CLASIFICAR", project: null, at: "2026-09-05T08:00:30.000Z" }] })
  ];
  assert.equal(harness.clientVisibleProvisionalCaptures().length, 0);
});

test("captura Sin proyecto no se muestra al Cliente", () => {
  harness.state.provisionalCaptures = [
    authorizedCapture({ readings: [{ raw: "X", normalized: "X", classification: "SIN CLASIFICAR", project: "Sin proyecto", at: "2026-09-05T08:00:30.000Z" }] })
  ];
  assert.equal(harness.clientVisibleProvisionalCaptures().length, 0);
});

test("captura FREE_TO_SALE no se muestra al Cliente", () => {
  harness.state.provisionalCaptures = [
    authorizedCapture({ readings: [{ raw: "SKU-FREE", normalized: "SKU-FREE", classification: "SKU · SKU-FREE", project: "FREE_TO_SALE", at: "2026-09-05T08:00:30.000Z" }] })
  ];
  assert.equal(harness.clientVisibleProvisionalCaptures().length, 0);
});

test("captura de proyecto autorizado sí se muestra al Cliente", () => {
  harness.state.provisionalCaptures = [authorizedCapture()];
  assert.equal(harness.clientVisibleProvisionalCaptures().length, 1);
});

test("Cliente ve REALIDAD FÍSICA REPORTADA y ESTADO ADMINISTRATIVO", () => {
  const htmlCard = harness.renderClientProvisionalCaptureCard(authorizedCapture());
  assert.match(htmlCard, /REALIDAD FÍSICA REPORTADA/);
  assert.match(htmlCard, /ESTADO ADMINISTRATIVO · NO REGISTRADO EN INVENTARIO/);
});

test("pendiente de supervisión no aparece como movimiento oficial", () => {
  const msg = harness.clientAdminStatusMessage("PENDIENTE DE SUPERVISIÓN");
  assert.match(msg, /Pendiente de supervisión · no registrado en inventario oficial/);
  assert.doesNotMatch(msg, /Validado administrativamente/);
  assert.doesNotMatch(msg, /ya registrado/i);
});

test("validado pendiente de registro tampoco aparece como registrado", () => {
  const msg = harness.clientAdminStatusMessage("VALIDADO · PENDIENTE DE REGISTRO");
  assert.match(msg, /Validado administrativamente · todavía no registrado en inventario oficial/);
});

test("requiere aclaración se distingue", () => {
  const msg = harness.clientAdminStatusMessage("REQUIERE ACLARACIÓN");
  assert.match(msg, /Requiere aclaración · no registrado en inventario oficial/);
});

test("rechazado administrativamente se distingue", () => {
  const msg = harness.clientAdminStatusMessage("RECHAZADO ADMINISTRATIVAMENTE");
  assert.match(msg, /Rechazado administrativamente · no registrado en inventario oficial/);
});

test("RAW original intacto en tarjeta Cliente", () => {
  const htmlCard = harness.renderClientProvisionalCaptureCard(authorizedCapture());
  assert.match(htmlCard, /<code>SKU-A<\/code>/);
});

test("applyRoleView no borra provisionalCaptures", () => {
  assert.match(sliceFunction(js, "applyRoleView"), /provisionalCaptures survive role switches/);
  assert.doesNotMatch(sliceFunction(js, "applyRoleView"), /provisionalCaptures\s*=\s*\[\]/);
});

test("state.stock no se modifica en helpers Cliente", () => {
  const stockBefore = structuredClone(harness.state.stock);
  harness.state.provisionalCaptures = [authorizedCapture()];
  harness.clientVisibleProvisionalCaptures();
  harness.renderClientProvisionalCaptureCard(authorizedCapture());
  assert.deepEqual(harness.state.stock, stockBefore);
});

test("demo bloquea escrituras no-GET", () => {
  assert.match(js, /Demo read-only: \$\{method\} bloqueado/);
  assert.match(js, /state\.blockedWrites \+= 1/);
});

test("POL-002 nota V15 actualizada", () => {
  assert.match(policies, /V15 implementa en DEMO READ-ONLY la separación visual/);
  assert.doesNotMatch(policies, /No implementar todavía Modo Cliente V15/);
});

test("presentación móvil Cliente legible", () => {
  const css = readFileSync(new URL("../public/logitec-role-demo.css", import.meta.url), "utf8");
  assert.match(css, /\.client-provisional-dual/);
  assert.match(css, /mobile-emulation-active \.client-provisional-dual/);
});

test("ubicación física reportada solo con evidencia de escaneo", () => {
  const h = new Function(harnessSrc)() as typeof harness;
  const withScan = authorizedCapture({
    readings: [
      {
        raw: "AN203",
        normalized: "AN203",
        classification: "UBICACIÓN · AN203",
        scannedLocation: "AN203",
        officialLocation: "AN203",
        project: "AVIAT NETWORKS",
        at: "2026-09-05T08:00:30.000Z"
      }
    ]
  });
  assert.equal(h.clientCapturePhysicalLocation(withScan), "AN203");
  assert.equal(h.clientCaptureOfficialLocation(withScan), null);
  assert.equal(h.clientCapturePhysicalLocation(authorizedCapture()), null);
});
