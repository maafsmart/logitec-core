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
  executorOperatorMode?: boolean;
  reviewer: string | null;
  reviewerActorId: string | null;
  reviewType: string | null;
  physicalStartedAt: string;
  physicalEndedAt: string;
  adminUpdatedAt: string | null;
  readings: Array<{ raw: string; at: string }>;
};

const actorIdSrc = sliceFunction(js, "currentDemoActorId");
const demoReviewerLabelSrc = sliceFunction(js, "demoReviewerLabel");
const ensureReviewHistorySrc = sliceFunction(js, "ensureReviewHistory");
const appendReviewHistorySrc = sliceFunction(js, "appendReviewHistory");
const reviewTypeSrc = sliceFunction(js, "reviewTypeForStatusChange");
const canReviewSrc = sliceFunction(js, "canReviewProvisionalCapture");
const supervisorReviewTypeSrc = sliceFunction(js, "supervisorReviewTypeForStatusChange");
const updateSrc = sliceFunction(js, "updateProvisionalCaptureStatus");

const makeApply = new Function(
  `${actorIdSrc}
${demoReviewerLabelSrc}
${ensureReviewHistorySrc}
${appendReviewHistorySrc}
${reviewTypeSrc}
${canReviewSrc}
${supervisorReviewTypeSrc}
${updateSrc}
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
return function apply(capture, nextStatus, reviewerActorOverride) {
  if (reviewerActorOverride) state.demoSupervisorActorId = reviewerActorOverride;
  if (!capture.reviewHistory) capture.reviewHistory = [];
  state.provisionalCaptures = [structuredClone(capture)];
  updateProvisionalCaptureStatus(capture.id, nextStatus);
  return state.provisionalCaptures[0];
};`
) as () => (capture: Capture, nextStatus: string, reviewerActorOverride?: string) => Capture;

const apply = makeApply();

function baseCapture(overrides: Partial<Capture> = {}): Capture {
  return {
    id: "CP-0001",
    status: "PENDIENTE DE SUPERVISIÓN",
    executor: "Supervisor",
    executorRole: "SUPERVISOR",
    executorActorId: "SUPERVISOR_DEMO",
    reviewer: null,
    reviewerActorId: null,
    reviewType: null,
    physicalStartedAt: "2026-09-05T08:00:00.000Z",
    physicalEndedAt: "2026-09-05T08:01:00.000Z",
    adminUpdatedAt: null,
    readings: [{ raw: "RAW-123", at: "2026-09-05T08:00:30.000Z" }],
    ...overrides
  };
}

test("cache-buster v=15.3", () => {
  assert.match(html, /logitec-role-demo\.js\?v=16.1.3/);
});

test("Supervisor A ejecuta + Supervisor A valida → Autovalidación", () => {
  const updated = apply(baseCapture(), "VALIDADO · PENDIENTE DE REGISTRO", "SUPERVISOR_DEMO");
  assert.equal(updated.executorActorId, "SUPERVISOR_DEMO");
  assert.equal(updated.reviewerActorId, "SUPERVISOR_DEMO");
  assert.equal(updated.reviewType, "Autovalidación de Supervisor");
});

test("Supervisor A ejecuta + Supervisor B valida → Validación de Supervisor", () => {
  const updated = apply(baseCapture(), "VALIDADO · PENDIENTE DE REGISTRO", "SUPERVISOR_B_DEMO");
  assert.equal(updated.executorActorId, "SUPERVISOR_DEMO");
  assert.equal(updated.reviewerActorId, "SUPERVISOR_B_DEMO");
  assert.equal(updated.reviewType, "Validación de Supervisor");
  assert.notEqual(updated.reviewType, "Autovalidación de Supervisor");
});

test("Supervisor trabajando como Operador conserva actorId y autovalida", () => {
  const updated = apply(
    baseCapture({
      executor: "Supervisor trabajando como Operador",
      executorRole: "SUPERVISOR",
      executorActorId: "SUPERVISOR_DEMO",
      executorOperatorMode: true
    }),
    "VALIDADO · PENDIENTE DE REGISTRO",
    "SUPERVISOR_DEMO"
  );
  assert.equal(updated.executor, "Supervisor trabajando como Operador");
  assert.equal(updated.executorActorId, "SUPERVISOR_DEMO");
  assert.equal(updated.reviewType, "Autovalidación de Supervisor");
});

test("Operador → Supervisor valida → Validación de Supervisor", () => {
  const updated = apply(
    baseCapture({
      executor: "Operador",
      executorRole: "OPERATOR",
      executorActorId: "OPERATOR_DEMO"
    }),
    "VALIDADO · PENDIENTE DE REGISTRO",
    "SUPERVISOR_DEMO"
  );
  assert.equal(updated.executorActorId, "OPERATOR_DEMO");
  assert.equal(updated.reviewerActorId, "SUPERVISOR_DEMO");
  assert.equal(updated.reviewType, "Validación de Supervisor");
});

test("RAW, tiempos físicos y ejecutor permanecen intactos", () => {
  const updated = apply(
    baseCapture({
      executor: "Operador",
      executorRole: "OPERATOR",
      executorActorId: "OPERATOR_DEMO",
      physicalStartedAt: "2026-09-05T07:00:00.000Z",
      physicalEndedAt: "2026-09-05T07:05:00.000Z",
      readings: [{ raw: "KEEP-ME", at: "2026-09-05T07:01:00.000Z" }]
    }),
    "VALIDADO · PENDIENTE DE REGISTRO",
    "SUPERVISOR_DEMO"
  );
  assert.equal(updated.executor, "Operador");
  assert.equal(updated.physicalStartedAt, "2026-09-05T07:00:00.000Z");
  assert.equal(updated.physicalEndedAt, "2026-09-05T07:05:00.000Z");
  assert.equal(updated.readings[0].raw, "KEEP-ME");
});

test("autovalidacion no usa executorRole como prueba", () => {
  assert.match(js, /executorActorId && reviewerActorId && capture\.executorActorId === reviewerActorId/);
  assert.doesNotMatch(
    sliceFunction(js, "supervisorReviewTypeForStatusChange"),
    /executorRole === "SUPERVISOR"/
  );
});
