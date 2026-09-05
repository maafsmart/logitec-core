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

const validateNowHarnessSrc = `
const DECLARED_FLOOR_ACTIONS = [
  { id: "consulta", label: "Consulta" },
  { id: "traslado", label: "Traslado / reubicación física" },
  { id: "acomodo", label: "Acomodo" },
  { id: "salida", label: "Preparar salida" },
  { id: "recepcion", label: "Recepción física" },
  { id: "etiquetado", label: "Etiquetado" },
  { id: "incidencia", label: "Incidencia / otro" }
];
${sliceFunction(js, "demoExecutorLabel")}
${sliceFunction(js, "demoReviewerLabel")}
${sliceFunction(js, "currentDemoActorId")}
${sliceFunction(js, "nextProvisionalCaptureId")}
${sliceFunction(js, "isPhysicalFloorAction")}
${sliceFunction(js, "ensureReviewHistory")}
${sliceFunction(js, "appendReviewHistory")}
${sliceFunction(js, "reviewTypeForStatusChange")}
${sliceFunction(js, "buildProvisionalCaptureFromSession")}
var state = {
  role: "SUPERVISOR",
  operatorMode: false,
  provisionalCaptureSeq: 0,
  demoSupervisorActorId: "SUPERVISOR_DEMO",
  demoAdminActorId: "ADMIN_DEMO"
};
return function build(role, validateNow) {
  state.role = role;
  const session = {
    declaredAction: "traslado",
    startedAt: "2026-09-05T08:00:00.000Z",
    observation: "",
    readings: [{ raw: "SKU-OK", at: "2026-09-05T08:00:30.000Z" }]
  };
  return buildProvisionalCaptureFromSession(session, { validateNow });
};
`;

test("cache-buster v=15.3.2", () => {
  assert.match(html, /logitec-role-demo\.js\?v=16.1/);
  assert.match(html, /logitec-role-demo\.css\?v=16.1/);
});

test("stock Cliente solo PROJ-ALPHA + movimiento explícito PROJ-BETA → oculto", () => {
  const h = new Function(movementHarnessSrc)() as {
    state: { stock: unknown[]; movements: unknown[] };
    deriveMovementClientProject: (m: Record<string, unknown>) => string | null;
    clientVisibleOfficialMovements: () => unknown[];
  };
  h.state.stock = [
    { product: { sku: "SKU-ONLY" }, location: { code: "AN100" }, project: { code: "PROJ-ALPHA" }, qty: 1 }
  ];
  const movement = { project: "PROJ-BETA", sku: "SKU-ONLY", type: "entrada", qty: 1 };
  assert.equal(h.deriveMovementClientProject(movement), null);
  h.state.movements = [movement];
  assert.equal(h.clientVisibleOfficialMovements().length, 0);
});

test("movimiento explícito PROJ-ALPHA en alcance Cliente → visible", () => {
  const h = new Function(movementHarnessSrc)() as {
    state: { movements: unknown[] };
    clientVisibleOfficialMovements: () => unknown[];
  };
  h.state.movements = [{ project: "PROJ-ALPHA", sku: "SKU-OK", type: "entrada", qty: 1 }];
  assert.equal(h.clientVisibleOfficialMovements().length, 1);
});

test("proyecto explícito autorizado pero SKU contradice otro proyecto → oculto", () => {
  const h = new Function(movementHarnessSrc)() as {
    deriveMovementClientProject: (m: Record<string, unknown>) => string | null;
  };
  assert.equal(
    h.deriveMovementClientProject({ project: "PROJ-ALPHA", sku: "SKU-DUAL", type: "reubicacion", qty: 1 }),
    null
  );
});

test("FREE_TO_SALE / Sin proyecto / ambiguo siguen ocultos", () => {
  const h = new Function(movementHarnessSrc)() as {
    state: { movements: unknown[] };
    clientVisibleOfficialMovements: () => unknown[];
  };
  h.state.movements = [
    { sku: "SKU-FTS", product: "SKU-FTS", type: "entrada", qty: 1 },
    { sku: "SKU-NP", product: "SKU-NP", type: "entrada", qty: 1 },
    { sku: "SKU-DUAL", product: "SKU-DUAL", type: "reubicacion", qty: 1 }
  ];
  assert.equal(h.clientVisibleOfficialMovements().length, 0);
});

test("Supervisor VALIDAR AHORA → reviewerRole === SUPERVISOR", () => {
  const build = new Function(validateNowHarnessSrc)() as (role: string, validateNow: boolean) => {
    reviewerRole?: string | null;
    reviewHistory?: Array<{ reviewerRole?: string | null }>;
  };
  const capture = build("SUPERVISOR", true);
  assert.equal(capture.reviewerRole, "SUPERVISOR");
  assert.equal(capture.reviewHistory?.[0]?.reviewerRole, "SUPERVISOR");
});

test("Admin VALIDAR AHORA → reviewerRole === ADMIN", () => {
  const build = new Function(validateNowHarnessSrc)() as (role: string, validateNow: boolean) => {
    reviewerRole?: string | null;
    reviewHistory?: Array<{ reviewerRole?: string | null }>;
  };
  const capture = build("ADMIN", true);
  assert.equal(capture.reviewerRole, "ADMIN");
  assert.equal(capture.reviewHistory?.[0]?.reviewerRole, "ADMIN");
});

test("deriveMovementClientProject exige clientAuthorizedProjectSet", () => {
  assert.match(sliceFunction(js, "deriveMovementClientProject"), /clientAuthorizedProjectSet\(\)\.has\(project\)/);
});

test("buildProvisionalCaptureFromSession VALIDAR AHORA establece reviewerRole", () => {
  assert.match(
    sliceFunction(js, "buildProvisionalCaptureFromSession"),
    /capture\.reviewerRole = state\.role/
  );
});
