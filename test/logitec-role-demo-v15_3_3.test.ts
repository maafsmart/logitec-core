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

type Capture = {
  id: string;
  status: string;
  executor: string;
  executorRole: string;
  executorActorId: string | null;
  reviewer: string | null;
  reviewerRole?: string | null;
  reviewerActorId: string | null;
  reviewType: string | null;
  reviewHistory?: Array<Record<string, string>>;
  physicalStartedAt: string;
  physicalEndedAt: string;
  adminUpdatedAt: string | null;
  readings: Array<{ raw: string; at: string }>;
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
return { state, reviewAs };
`;

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
    readings: [{ raw: "KEEP-RAW", at: "2026-09-05T08:00:30.000Z" }],
    ...overrides
  };
}

test("cache-buster v=15.3.3", () => {
  assert.match(html, /logitec-role-demo\.js\?v=16.1/);
  assert.match(html, /logitec-role-demo\.css\?v=16.1/);
});

test("Supervisor Movimientos muestra filtro TODO | OFICIAL | FÍSICA REPORTADA", () => {
  const supervisorView = sliceFunction(js, "supervisorMovementsView");
  const filterBar = sliceFunction(js, "renderDualTraceFilterBar");
  assert.match(supervisorView, /renderDualTraceFilterBar/);
  assert.match(filterBar, /TODO/);
  assert.match(filterBar, /OFICIAL/);
  assert.match(filterBar, /FÍSICA REPORTADA/);
});

test("movementsView enruta Supervisor a supervisorMovementsView", () => {
  assert.match(sliceFunction(js, "movementsView"), /state\.role === "SUPERVISOR"\) return supervisorMovementsView\(\)/);
});

test("Supervisor usa trazabilidad oficial sin filtros Cliente", () => {
  const supervisorView = sliceFunction(js, "supervisorMovementsView");
  assert.match(supervisorView, /renderAdminOfficialTraceBlock\(\)/);
  assert.doesNotMatch(supervisorView, /clientVisibleOfficialMovements/);
  assert.doesNotMatch(supervisorView, /clientAuthorizedProjectSet/);
});

test("Excel sin movimientos muestra aviso correcto en bloque oficial", () => {
  assert.match(
    sliceFunction(js, "renderAdminOfficialTraceBlock"),
    /La fuente Excel no contiene historial de movimientos oficiales/
  );
});

test("Supervisor ve capturas provisionales con disclaimer POL-002", () => {
  const supervisorView = sliceFunction(js, "supervisorMovementsView");
  assert.match(supervisorView, /state\.provisionalCaptures/);
  assert.match(supervisorView, /renderSupervisorProvisionalCaptureCard/);
  assert.match(sliceFunction(js, "renderProvisionalCaptureCard"), /REALIDAD FÍSICA REPORTADA · NO CONSTITUYE MOVIMIENTO OFICIAL/);
  assert.match(sliceFunction(js, "renderProvisionalCaptureCard"), /Historial de revisiones/);
});

test("Supervisor puede validar, aclarar, rechazar y reabrir desde vista dual", () => {
  assert.match(sliceFunction(js, "renderSupervisorProvisionalCaptureCard"), /renderProvisionalCaptureCard/);
  assert.match(sliceFunction(js, "renderProvisionalReviewControls"), /provisional-status-select/);
  assert.match(sliceFunction(js, "renderProvisionalReviewControls"), /canReviewProvisionalCapture/);
  const h = new Function(reviewHarnessSrc)() as {
    reviewAs: (role: string, c: Capture, s: string) => Capture;
  };
  assert.equal(h.reviewAs("SUPERVISOR", baseCapture(), "VALIDADO · PENDIENTE DE REGISTRO").status, "VALIDADO · PENDIENTE DE REGISTRO");
  assert.equal(h.reviewAs("SUPERVISOR", baseCapture(), "REQUIERE ACLARACIÓN").reviewType, "Revisión de Supervisor · requiere aclaración");
  assert.equal(h.reviewAs("SUPERVISOR", baseCapture(), "RECHAZADO ADMINISTRATIVAMENTE").reviewType, "Rechazo administrativo de Supervisor");
  assert.equal(
    h.reviewAs("SUPERVISOR", baseCapture({ status: "REQUIERE ACLARACIÓN" }), "PENDIENTE DE SUPERVISIÓN").reviewType,
    "Reapertura administrativa de Supervisor"
  );
});

test("autovalidación sigue determinada por executorActorId === reviewerActorId", () => {
  const h = new Function(reviewHarnessSrc)() as {
    reviewAs: (role: string, c: Capture, s: string) => Capture;
  };
  const updated = h.reviewAs(
    "SUPERVISOR",
    baseCapture({ executorActorId: "SUPERVISOR_DEMO", executorRole: "SUPERVISOR", executor: "Supervisor" }),
    "VALIDADO · PENDIENTE DE REGISTRO"
  );
  assert.equal(updated.reviewType, "Autovalidación de Supervisor");
});

test("reviewHistory se conserva y RAW intacto al revisar desde Supervisor", () => {
  const h = new Function(reviewHarnessSrc)() as {
    reviewAs: (role: string, c: Capture, s: string) => Capture;
  };
  const updated = h.reviewAs("SUPERVISOR", baseCapture(), "REQUIERE ACLARACIÓN");
  assert.equal(updated.readings[0].raw, "KEEP-RAW");
  assert.equal(updated.reviewHistory?.length, 1);
});

test("Pendientes de supervisión se mantiene como módulo operativo", () => {
  assert.match(js, /pending_supervision.*Pendientes de supervisión/s);
  assert.match(sliceFunction(js, "supervisorPendingSupervisionView"), /state\.provisionalCaptures/);
  assert.match(sliceFunction(js, "supervisorPendingSupervisionView"), /provisional-status-select/);
});

test("Movimientos y Pendientes reutilizan la misma fuente provisionalCaptures", () => {
  assert.match(sliceFunction(js, "supervisorMovementsView"), /const captures = state\.provisionalCaptures/);
  assert.match(sliceFunction(js, "supervisorPendingSupervisionView"), /const rows = state\.provisionalCaptures/);
  assert.doesNotMatch(sliceFunction(js, "supervisorMovementsView"), /structuredClone\(state\.provisionalCaptures\)/);
});

test("Admin conserva trazabilidad dual global sin regresión", () => {
  const adminView = sliceFunction(js, "adminMovementsView");
  assert.match(adminView, /renderDualTraceFilterBar/);
  assert.match(adminView, /Alcance global · incluye ambiguas/);
  assert.match(adminView, /renderAdminProvisionalCaptureCard/);
  assert.match(sliceFunction(js, "renderAdminProvisionalCaptureCard"), /Resolver administrativamente/);
});

test("Cliente sigue fail-closed sin cambios en helpers", () => {
  assert.match(sliceFunction(js, "clientMovementsView"), /clientVisibleOfficialMovements\(\)/);
  assert.match(sliceFunction(js, "renderClientPhysicalActivitySection"), /clientVisibleProvisionalCaptures\(\)/);
  assert.doesNotMatch(sliceFunction(js, "clientMovementsView"), /supervisorMovementsView/);
});

test("componentes compartidos neutralizados entre Admin y Supervisor", () => {
  assert.match(js, /function renderDualTraceFilterBar\(/);
  assert.match(js, /function renderProvisionalCaptureCard\(/);
  assert.match(js, /function renderProvisionalReviewControls\(/);
});

test("demo bloquea escrituras no-GET", () => {
  assert.match(js, /Demo read-only: \$\{method\} bloqueado/);
});
