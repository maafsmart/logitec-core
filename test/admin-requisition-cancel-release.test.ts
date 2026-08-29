import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const html = readFileSync(new URL("../public/dashboard.html", import.meta.url), "utf8");
const js = readFileSync(new URL("../public/dashboard.js", import.meta.url), "utf8");
const routes = readFileSync(new URL("../src/modules/requisitions/requisitions.routes.ts", import.meta.url), "utf8");
const serviceSrc = readFileSync(new URL("../src/modules/requisitions/requisition.service.ts", import.meta.url), "utf8");
const pickingSrc = readFileSync(new URL("../src/modules/picking/picking.routes.ts", import.meta.url), "utf8");
const mutationSrc = readFileSync(
  new URL("../src/modules/inventory/inventory-mutation.service.ts", import.meta.url),
  "utf8"
);

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

test("el panel lateral muestra Cancelar requisición en APPROVED e IN_PROGRESS", () => {
  const render = sliceFunction(js, "renderRequisitionDetail");
  const show = sliceFunction(js, "canShowRequisitionCancel");
  assert.match(render, /Cancelar requisición/);
  assert.match(render, /canShowRequisitionCancel\(row\)/);
  assert.match(render, /id: "cancel-requisition"/);
  assert.match(show, /APPROVED/);
  assert.match(show, /IN_PROGRESS/);
  assert.match(sliceFunction(js, "canCancelRequisitionUi"), /ADMIN/);
  assert.match(sliceFunction(js, "canCancelRequisitionUi"), /SUPERVISOR/);
  assert.doesNotMatch(sliceFunction(js, "canCancelRequisitionUi"), /OPERATOR/);
});

test("el botón queda oculto cuando no corresponde", () => {
  const show = sliceFunction(js, "canShowRequisitionCancel");
  const runtime = new Function(`${show}; function canCancelRequisitionUi(){ return true; } return canShowRequisitionCancel;`)() as (
    row: { status?: string }
  ) => boolean;
  assert.equal(runtime({ status: "APPROVED" }), true);
  assert.equal(runtime({ status: "IN_PROGRESS" }), true);
  assert.equal(runtime({ status: "DRAFT" }), false);
  assert.equal(runtime({ status: "SUBMITTED" }), false);
  assert.equal(runtime({ status: "CANCELLED" }), false);
  assert.equal(runtime({ status: "COMPLETED" }), false);
  assert.equal(runtime({ status: "REJECTED" }), false);
  const closedRuntime = new Function(
    `${show}; function canCancelRequisitionUi(){ return false; } return canShowRequisitionCancel;`
  )() as (row: { status?: string }) => boolean;
  assert.equal(closedRuntime({ status: "APPROVED" }), false);
});

test("la confirmación incluye el folio y no escribe si se cancela", async () => {
  const src = sliceFunction(js, "cancelRequisitionFromDetail");
  assert.match(src, /window\.confirm/);
  assert.match(src, /Se liberarán las reservas\. El inventario físico no será eliminado\./);
  assert.ok(src.indexOf("window.confirm") < src.indexOf("authenticatedFetch"));
  const fn = new Function(
    "window",
    "authenticatedFetch",
    "canShowRequisitionCancel",
    "setOpsMessage",
    "refreshRequisitionViews",
    `async ${src}; return cancelRequisitionFromDetail;`
  );
  let calls = 0;
  const cancelRequisitionFromDetail = fn(
    { confirm: () => false },
    async () => {
      calls += 1;
      return { ok: true, json: async () => ({}) };
    },
    () => true,
    () => {},
    async () => {}
  ) as (row: { id: string; number: string; status: string }) => Promise<void>;
  await cancelRequisitionFromDetail({ id: "req-1", number: "OS-2026-001", status: "APPROVED" });
  assert.equal(calls, 0);
});

test("la UI reutiliza POST /api/requisitions/:id/cancel y refresca el panel", () => {
  const src = sliceFunction(js, "cancelRequisitionFromDetail");
  assert.match(src, /\/api\/requisitions\/\$\{encodeURIComponent\(row\.id\)\}\/cancel/);
  assert.match(src, /method: "POST"/);
  assert.match(src, /refreshRequisitionViews\(row\.id\)/);
  assert.match(routes, /requisitionsRouter\.post\("\/:id\/cancel"/);
  assert.match(serviceSrc, /export async function cancelRequisition/);
  assert.match(sliceFunction(serviceSrc, "cancelRequisitionInTransaction"), /task\.updateMany/);
  assert.match(sliceFunction(serviceSrc, "cancelRequisitionInTransaction"), /status: "CANCELLED"/);
  assert.match(sliceFunction(serviceSrc, "cancelRequisitionInTransaction"), /status: "RELEASED"/);
});

test("FIFO reserva y picking existentes continúan intactos", () => {
  assert.match(serviceSrc, /planRelocateFifoAllocation/);
  assert.match(serviceSrc, /allocationMode: "FIFO"/);
  assert.match(pickingSrc, /consumeReservationPick/);
  assert.match(js, /allocationMode: "FIFO"/);
  assert.match(js, /function buildReservedFifoPickPayload/);
  assert.match(mutationSrc, /type === "RELOCATE"/);
  assert.match(html, /dashboard\.js\?v=84/);
  assert.doesNotMatch(html, /dashboard\.js\?v=74/);
});
