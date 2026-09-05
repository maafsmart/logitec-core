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
  executor: string;
  executorRole: string;
  executorActorId: string | null;
  reviewer: string | null;
  reviewerActorId: string | null;
  reviewType: string | null;
  reviewHistory?: Array<Record<string, string>>;
  physicalStartedAt: string;
  physicalEndedAt: string;
  adminUpdatedAt: string | null;
  readings: Array<{ raw: string; at: string; classification?: string; normalized?: string; project?: string | null }>;
};

const reviewHarnessSrc = `
${sliceFunction(js, "currentDemoActorId")}
${sliceFunction(js, "demoReviewerLabel")}
${sliceFunction(js, "ensureReviewHistory")}
${sliceFunction(js, "appendReviewHistory")}
${sliceFunction(js, "reviewTypeForStatusChange")}
${sliceFunction(js, "canReviewProvisionalCapture")}
${sliceFunction(js, "updateProvisionalCaptureStatus")}
const PROVISIONAL_STATUSES = [
  "PENDIENTE DE SUPERVISIÓN",
  "REQUIERE ACLARACIÓN",
  "VALIDADO · PENDIENTE DE REGISTRO",
  "RECHAZADO ADMINISTRATIVAMENTE"
];
var state = {
  role: "SUPERVISOR",
  operatorMode: false,
  provisionalCaptures: [],
  demoSupervisorActorId: "SUPERVISOR_DEMO",
  demoAdminActorId: "ADMIN_DEMO"
};
function renderContent() {}
function reviewAs(role, capture, nextStatus) {
  state.role = role;
  if (!capture.reviewHistory) capture.reviewHistory = [];
  state.provisionalCaptures = [structuredClone(capture)];
  updateProvisionalCaptureStatus(capture.id, nextStatus);
  return state.provisionalCaptures[0];
}
return { state, reviewAs, reviewTypeForStatusChange, currentDemoActorId };
`;

const reviewHarness = new Function(reviewHarnessSrc)() as {
  state: { role: string; provisionalCaptures: Capture[] };
  reviewAs: (role: string, capture: Capture, nextStatus: string) => Capture;
  reviewTypeForStatusChange: (capture: Capture, reviewerActorId: string | null, reviewerRole: string, nextStatus: string) => string | null;
  currentDemoActorId: () => string | null;
};

function baseCapture(overrides: Partial<Capture> = {}): Capture {
  return {
    id: "CP-0001",
    status: "PENDIENTE DE SUPERVISIÓN",
    executor: "Operador",
    executorRole: "OPERATOR",
    executorActorId: "OPERATOR_DEMO",
    reviewer: null,
    reviewerActorId: null,
    reviewType: null,
    reviewHistory: [],
    physicalStartedAt: "2026-09-05T08:00:00.000Z",
    physicalEndedAt: "2026-09-05T08:01:00.000Z",
    adminUpdatedAt: null,
    readings: [{ raw: "SKU-A", at: "2026-09-05T08:00:30.000Z", classification: "SKU · SKU-A", normalized: "SKU-A", project: "PROJ-ALPHA" }],
    ...overrides
  };
}

test("cache-buster v=15.3", () => {
  assert.match(html, /logitec-role-demo\.js\?v=15\.3\.2/);
  assert.match(html, /logitec-role-demo\.css\?v=15\.3\.2/);
});

test("ADMIN_DEMO en currentDemoActorId", () => {
  const h = new Function(reviewHarnessSrc)() as typeof reviewHarness;
  h.state.role = "ADMIN";
  assert.equal(h.currentDemoActorId(), "ADMIN_DEMO");
});

test("Operador captura → Supervisor valida → Validación de Supervisor", () => {
  const updated = reviewHarness.reviewAs("SUPERVISOR", baseCapture(), "VALIDADO · PENDIENTE DE REGISTRO");
  assert.equal(updated.reviewType, "Validación de Supervisor");
  assert.equal(updated.reviewer, "Supervisor");
});

test("Supervisor captura → mismo Supervisor → Autovalidación de Supervisor", () => {
  const updated = reviewHarness.reviewAs(
    "SUPERVISOR",
    baseCapture({ executor: "Supervisor", executorRole: "SUPERVISOR", executorActorId: "SUPERVISOR_DEMO" }),
    "VALIDADO · PENDIENTE DE REGISTRO"
  );
  assert.equal(updated.reviewType, "Autovalidación de Supervisor");
});

test("Operador captura → Admin valida → Validación de Administrador", () => {
  const updated = reviewHarness.reviewAs("ADMIN", baseCapture(), "VALIDADO · PENDIENTE DE REGISTRO");
  assert.equal(updated.reviewType, "Validación de Administrador");
  assert.equal(updated.reviewer, "Administrador");
});

test("Supervisor captura → Admin valida → Validación de Administrador", () => {
  const updated = reviewHarness.reviewAs(
    "ADMIN",
    baseCapture({ executor: "Supervisor", executorRole: "SUPERVISOR", executorActorId: "SUPERVISOR_DEMO" }),
    "VALIDADO · PENDIENTE DE REGISTRO"
  );
  assert.equal(updated.reviewType, "Validación de Administrador");
});

test("Admin captura → mismo Admin valida → Autovalidación de Administrador", () => {
  const updated = reviewHarness.reviewAs(
    "ADMIN",
    baseCapture({ executor: "Administrador", executorRole: "ADMIN", executorActorId: "ADMIN_DEMO" }),
    "VALIDADO · PENDIENTE DE REGISTRO"
  );
  assert.equal(updated.reviewType, "Autovalidación de Administrador");
});

test("autovalidación por identidad, no por rol", () => {
  const type = reviewHarness.reviewTypeForStatusChange(
    { executorActorId: "ADMIN_DEMO" } as Capture,
    "ADMIN_DEMO",
    "ADMIN",
    "VALIDADO · PENDIENTE DE REGISTRO"
  );
  assert.equal(type, "Autovalidación de Administrador");
  const other = reviewHarness.reviewTypeForStatusChange(
    { executorActorId: "OPERATOR_DEMO" } as Capture,
    "ADMIN_DEMO",
    "ADMIN",
    "VALIDADO · PENDIENTE DE REGISTRO"
  );
  assert.equal(other, "Validación de Administrador");
});

test("Supervisor ya validó → Admin no duplica al mantener mismo estado", () => {
  const capture = baseCapture({
    status: "VALIDADO · PENDIENTE DE REGISTRO",
    reviewer: "Supervisor",
    reviewType: "Validación de Supervisor",
    reviewHistory: [
      {
        reviewer: "Supervisor",
        reviewerRole: "SUPERVISOR",
        reviewerActorId: "SUPERVISOR_DEMO",
        reviewType: "Validación de Supervisor",
        status: "VALIDADO · PENDIENTE DE REGISTRO",
        at: "2026-09-05T09:00:00.000Z"
      }
    ]
  });
  const updated = reviewHarness.reviewAs("ADMIN", capture, "VALIDADO · PENDIENTE DE REGISTRO");
  assert.equal(updated.reviewHistory?.length, 1);
});

test("reviewHistory conserva todas las revisiones", () => {
  let capture = baseCapture();
  capture = reviewHarness.reviewAs("SUPERVISOR", capture, "REQUIERE ACLARACIÓN");
  capture = reviewHarness.reviewAs("ADMIN", capture, "VALIDADO · PENDIENTE DE REGISTRO");
  assert.equal(capture.reviewHistory?.length, 2);
  assert.match(capture.reviewHistory?.[0].reviewType || "", /Supervisor/);
  assert.match(capture.reviewHistory?.[1].reviewType || "", /Administrador/);
});

test("revisión nueva no borra RAW, ejecutor ni tiempos físicos", () => {
  const before = baseCapture({
    executor: "Operador",
    physicalStartedAt: "2026-09-05T07:00:00.000Z",
    physicalEndedAt: "2026-09-05T07:05:00.000Z",
    readings: [{ raw: "KEEP-RAW", at: "2026-09-05T07:01:00.000Z" }]
  });
  const updated = reviewHarness.reviewAs("ADMIN", before, "VALIDADO · PENDIENTE DE REGISTRO");
  assert.equal(updated.executor, "Operador");
  assert.equal(updated.physicalStartedAt, "2026-09-05T07:00:00.000Z");
  assert.equal(updated.physicalEndedAt, "2026-09-05T07:05:00.000Z");
  assert.equal(updated.readings[0].raw, "KEEP-RAW");
});

test("Admin puede guardar pendiente y validar después", () => {
  assert.match(js, /GUARDAR PENDIENTE/);
  assert.match(js, /validateProvisionalCaptureNow[\s\S]*state\.role !== "SUPERVISOR" && state\.role !== "ADMIN"/);
  assert.match(sliceFunction(js, "buildProvisionalCaptureFromSession"), /reviewHistory: \[\]/);
});

test("Admin ve capturas globales sin filtro Cliente", () => {
  assert.match(js, /adminCaptureProjectDisplay/);
  assert.match(sliceFunction(js, "adminMovementsView"), /Alcance global/);
  assert.doesNotMatch(sliceFunction(js, "adminMovementsView"), /clientVisibleProvisionalCaptures/);
});

test("Cliente sigue fail-closed V15.2 y sin scanner", () => {
  assert.match(sliceFunction(js, "authorizedProjectsFromStockRows"), /if \(!isAuthorizedClientProject\(project\)\) return new Set\(\)/);
  const clientBlock = js.slice(js.indexOf("CLIENT:"), js.indexOf("const state = {"));
  assert.doesNotMatch(clientBlock, /renderScannerWorkspace/);
});

test("Cliente Reportes contiene cuatro familias y export disabled", () => {
  assert.match(js, /function clientReportsView/);
  assert.match(js, /Inventario actual/);
  assert.match(js, /Movimientos oficiales/);
  assert.match(js, /Trazabilidad física reportada/);
  assert.match(js, /Diferencias y pendientes/);
  assert.match(js, /EXPORTAR · disponible en integración oficial/);
  assert.match(js, /Production: report scope and exports must be enforced server-side/);
});

test("POL-003 matriz Admin validar y autovalidar", () => {
  assert.match(policies, /Validación administrativa no equivale por sí misma a registro oficial de inventario/);
  assert.match(policies, /\*\*Admin\*\* \| sí \| sí \| sí \| sí/);
});

test("no inventa movimientos oficiales en reportes Cliente", () => {
  assert.match(sliceFunction(js, "clientReportsView"), /No disponible en la fuente actual de la DEMO/);
});

test("demo bloquea escrituras no-GET", () => {
  assert.match(js, /Demo read-only: \$\{method\} bloqueado/);
});
