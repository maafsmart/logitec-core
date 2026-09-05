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

const movementHarnessSrc = `
${sliceFunction(js, "normalizeScannerRawValue")}
${sliceFunction(js, "isAuthorizedClientProject")}
${sliceFunction(js, "projectLabelFromStockRow")}
${sliceFunction(js, "clientAuthorizedProjectSet")}
${sliceFunction(js, "movementResolutionKeys")}
${sliceFunction(js, "stockRowsMatchingMovement")}
${sliceFunction(js, "deriveMovementClientProject")}
${sliceFunction(js, "clientVisibleOfficialMovements")}
var state = {
  stock: [
    { product: { sku: "SKU-OK" }, location: { code: "AN100" }, project: { code: "PROJ-ALPHA" }, qty: 1, pedido: "45003182" },
    { product: { sku: "SKU-DUAL" }, location: { code: "AN100" }, project: { code: "PROJ-ALPHA" }, qty: 1 },
    { product: { sku: "SKU-DUAL" }, location: { code: "AN105" }, project: { code: "PROJ-BETA" }, qty: 1 },
    { product: { sku: "SKU-FTS" }, location: { code: "AN002" }, project: { code: "FREE_TO_SALE" }, qty: 1 },
    { product: { sku: "SKU-NP" }, location: { code: "AN003" }, project: { code: "Sin proyecto" }, qty: 1 }
  ],
  movements: []
};
return { state, deriveMovementClientProject, clientVisibleOfficialMovements };
`;

function baseCapture(overrides: Partial<Capture> = {}): Capture {
  return {
    id: "CP-0001",
    status: "REQUIERE ACLARACIÓN",
    executor: "Operador",
    executorRole: "OPERATOR",
    executorActorId: "OPERATOR_DEMO",
    reviewer: "Supervisor",
    reviewerRole: "SUPERVISOR",
    reviewerActorId: "SUPERVISOR_DEMO",
    reviewType: "Revisión de Supervisor · requiere aclaración",
    reviewHistory: [
      {
        reviewer: "Supervisor",
        reviewerRole: "SUPERVISOR",
        reviewerActorId: "SUPERVISOR_DEMO",
        reviewType: "Revisión de Supervisor · requiere aclaración",
        status: "REQUIERE ACLARACIÓN",
        at: "2026-09-05T09:00:00.000Z"
      }
    ],
    physicalStartedAt: "2026-09-05T08:00:00.000Z",
    physicalEndedAt: "2026-09-05T08:01:00.000Z",
    adminUpdatedAt: "2026-09-05T09:00:00.000Z",
    readings: [{ raw: "SKU-OK", at: "2026-09-05T08:00:30.000Z" }],
    ...overrides
  };
}

test("cache-buster v=15.3.1", () => {
  assert.match(html, /logitec-role-demo\.js\?v=16.1.2/);
  assert.match(html, /logitec-role-demo\.css\?v=16.1.2/);
});

test("Supervisor aclaración → pendiente registra Reapertura administrativa de Supervisor", () => {
  const h = new Function(reviewHarnessSrc)() as { reviewAs: (role: string, c: Capture, s: string) => Capture };
  const updated = h.reviewAs("SUPERVISOR", baseCapture(), "PENDIENTE DE SUPERVISIÓN");
  assert.equal(updated.reviewType, "Reapertura administrativa de Supervisor");
  assert.equal(updated.reviewHistory?.length, 2);
  assert.equal(updated.reviewHistory?.[1].reviewType, "Reapertura administrativa de Supervisor");
});

test("Admin validado → pendiente registra Reapertura administrativa de Administrador", () => {
  const h = new Function(reviewHarnessSrc)() as { reviewAs: (role: string, c: Capture, s: string) => Capture };
  const updated = h.reviewAs(
    "ADMIN",
    baseCapture({
      status: "VALIDADO · PENDIENTE DE REGISTRO",
      reviewType: "Validación de Administrador",
      reviewHistory: [
        {
          reviewer: "Administrador",
          reviewerRole: "ADMIN",
          reviewerActorId: "ADMIN_DEMO",
          reviewType: "Validación de Administrador",
          status: "VALIDADO · PENDIENTE DE REGISTRO",
          at: "2026-09-05T10:00:00.000Z"
        }
      ]
    }),
    "PENDIENTE DE SUPERVISIÓN"
  );
  assert.equal(updated.reviewType, "Reapertura administrativa de Administrador");
  assert.equal(updated.reviewHistory?.length, 2);
});

test("reviewType último nunca queda obsoleto tras reapertura", () => {
  const h = new Function(reviewHarnessSrc)() as { reviewAs: (role: string, c: Capture, s: string) => Capture };
  const updated = h.reviewAs("SUPERVISOR", baseCapture(), "PENDIENTE DE SUPERVISIÓN");
  assert.notEqual(updated.reviewType, "Revisión de Supervisor · requiere aclaración");
  assert.match(updated.reviewType || "", /Reapertura administrativa de Supervisor/);
});

test("mismo estado no duplica historial", () => {
  const h = new Function(reviewHarnessSrc)() as { reviewAs: (role: string, c: Capture, s: string) => Capture };
  const capture = baseCapture({ status: "PENDIENTE DE SUPERVISIÓN", reviewType: "Reapertura administrativa de Supervisor" });
  const updated = h.reviewAs("SUPERVISOR", capture, "PENDIENTE DE SUPERVISIÓN");
  assert.equal(updated.reviewHistory?.length, 1);
});

test("movimiento Cliente inequívoco autorizado → visible", () => {
  const h = new Function(movementHarnessSrc)() as {
    state: { movements: unknown[] };
    clientVisibleOfficialMovements: () => unknown[];
  };
  h.state.movements = [{ sku: "SKU-OK", product: "SKU-OK", reference: "45003182", type: "entrada", qty: 1 }];
  assert.equal(h.clientVisibleOfficialMovements().length, 1);
});

test("FREE_TO_SALE y Sin proyecto → ocultos", () => {
  const h = new Function(movementHarnessSrc)() as {
    state: { movements: unknown[] };
    clientVisibleOfficialMovements: () => unknown[];
  };
  h.state.movements = [
    { sku: "SKU-FTS", product: "SKU-FTS", type: "entrada", qty: 1 },
    { sku: "SKU-NP", product: "SKU-NP", type: "entrada", qty: 1 }
  ];
  assert.equal(h.clientVisibleOfficialMovements().length, 0);
});

test("movimiento ambiguo → oculto", () => {
  const h = new Function(movementHarnessSrc)() as {
    state: { movements: unknown[] };
    clientVisibleOfficialMovements: () => unknown[];
  };
  h.state.movements = [{ sku: "SKU-DUAL", product: "SKU-DUAL", type: "reubicacion", qty: 1 }];
  assert.equal(h.clientVisibleOfficialMovements().length, 0);
});

test("evidencia insuficiente → oculto", () => {
  const h = new Function(movementHarnessSrc)() as {
    state: { movements: unknown[] };
    clientVisibleOfficialMovements: () => unknown[];
  };
  h.state.movements = [{ type: "entrada", qty: 1, reference: "UNKNOWN-REF" }];
  assert.equal(h.clientVisibleOfficialMovements().length, 0);
});

test("Admin sigue viendo movimientos globales", () => {
  assert.match(sliceFunction(js, "renderAdminOfficialTraceBlock"), /state\.movements/);
  assert.doesNotMatch(sliceFunction(js, "renderAdminOfficialTraceBlock"), /clientVisibleOfficialMovements/);
});

test("ambos módulos Cliente usan el mismo helper", () => {
  assert.match(sliceFunction(js, "clientMovementsView"), /clientVisibleOfficialMovements\(\)/);
  assert.match(sliceFunction(js, "clientReportsView"), /clientVisibleOfficialMovements\(\)/);
  assert.match(js, /Production: official movement ownership must be enforced server-side/);
});

test("revisión no borra RAW ni stock", () => {
  const h = new Function(reviewHarnessSrc)() as { reviewAs: (role: string, c: Capture, s: string) => Capture };
  const before = baseCapture({
    readings: [{ raw: "KEEP-RAW", at: "2026-09-05T08:00:30.000Z" }],
    executor: "Operador",
    physicalStartedAt: "2026-09-05T07:00:00.000Z",
    physicalEndedAt: "2026-09-05T07:05:00.000Z"
  });
  const updated = h.reviewAs("SUPERVISOR", before, "PENDIENTE DE SUPERVISIÓN");
  assert.equal(updated.readings[0].raw, "KEEP-RAW");
  assert.equal(updated.executor, "Operador");
});

test("demo bloquea escrituras no-GET", () => {
  assert.match(js, /Demo read-only: \$\{method\} bloqueado/);
});
