import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const html = readFileSync(new URL("../public/dashboard.html", import.meta.url), "utf8");
const js = readFileSync(new URL("../public/dashboard.js", import.meta.url), "utf8");
const routes = readFileSync(new URL("../src/modules/picking/picking.routes.ts", import.meta.url), "utf8");
const serviceSrc = readFileSync(new URL("../src/modules/requisitions/requisition.service.ts", import.meta.url), "utf8");
const schema = readFileSync(new URL("../prisma/schema.prisma", import.meta.url), "utf8");

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

test("GET eligible-serials está en el router de picking con roles existentes", () => {
  assert.match(routes, /requireRole\(\["ADMIN", "OPERATOR", "SUPERVISOR"\]\)/);
  assert.match(
    routes,
    /pickingRouter\.get\("\/requisitions\/:requisitionId\/lines\/:lineId\/eligible-serials"/
  );
  assert.match(routes, /getEligiblePickSerials/);
  assert.doesNotMatch(sliceFunction(serviceSrc, "getEligiblePickSerials"), /\.(create|update|delete|updateMany)\(/);
});

test("POST /api/picking/scan acepta serialIds solo con FIFO", () => {
  assert.match(routes, /serialIds: z\.array/);
  assert.match(routes, /serialIds\.length && reservationId/);
  assert.match(routes, /SERIAL_IDS_REQUIRE_FIFO/);
  assert.match(routes, /serialIds/);
});

test("consumo serializado usa una transacción, locks y un movimiento por serie", () => {
  assert.match(serviceSrc, /prisma\.\$transaction/);
  assert.match(serviceSrc, /lockInventoryAndLayers/);
  assert.match(serviceSrc, /lockReservationsById/);
  assert.match(serviceSrc, /lockSerialsById/);
  assert.match(serviceSrc, /FROM "InventorySerial".*ORDER BY "id" FOR UPDATE/s);
  assert.match(serviceSrc, /inventoryLayerId: null/);
  assert.match(serviceSrc, /inventorySerialId: serial\.id/);
  assert.match(serviceSrc, /MIXED_SERIALIZATION_NOT_SUPPORTED/);
  assert.match(serviceSrc, /SERIALS_MISSING_ON_LAYER/);
  assert.match(serviceSrc, /SERIAL_FIFO_LAYER_MISMATCH/);
  assert.match(serviceSrc, /PICK_RESERVED_FIFO_SUCCESS/);
  assert.doesNotMatch(sliceFunction(serviceSrc, "finishSerializedFifoPick"), /PICK_SUCCESS/);
  assert.doesNotMatch(sliceFunction(serviceSrc, "cancelRequisitionInTransaction"), /inventorySerial\.delete/);
  assert.doesNotMatch(sliceFunction(serviceSrc, "cancelRequisitionInTransaction"), /inventoryLayerId: null/);
});

test("no hay migración ni cambio de schema Prisma", () => {
  assert.match(schema, /model InventorySerial/);
  assert.match(schema, /inventorySerialId String\?/);
});

test("cache-buster dashboard.js?v=78", () => {
  assert.match(html, /dashboard\.js\?v=78/);
  assert.doesNotMatch(html, /dashboard\.js\?v=77/);
});

test("Surtir reservado consulta elegibles y exige series antes de confirmar", () => {
  assert.match(html, /Escanear serie o IMEI/);
  assert.match(html, /id="reqActionSerialScan"/);
  assert.match(html, /id="reqActionSerialCounter"/);
  assert.match(js, /function refreshReservedPickEligibleSerials/);
  assert.match(js, /function addReservedPickSerialFromScan/);
  assert.match(js, /eligible-serials\?inventoryId=/);
  assert.match(js, /serialIds = serialIds\.slice\(\)/);
  const payload = sliceFunction(js, "buildReservedFifoPickPayload");
  assert.match(payload, /allocationMode: "FIFO"/);
  assert.doesNotMatch(payload, /reservationId/);
  const confirm = sliceFunction(js, "confirmReservedPickFromModal");
  assert.match(confirm, /reservedPickSerialNeeded/);
  assert.doesNotMatch(confirm, /pickSku|skuInput/);
  const qtyWire = sliceFunction(js, "wireReqActionModal");
  assert.match(qtyWire, /refreshReservedPickEligibleSerials/);
  assert.match(qtyWire, /event\.key !== "Enter"/);
});

test("AVIAT/LOGITEC: el plan serializado usa el proyecto operativo de la requisición", () => {
  assert.match(sliceFunction(serviceSrc, "getEligiblePickSerials"), /isOperationalProjectRecord/);
  assert.match(sliceFunction(serviceSrc, "getEligiblePickSerials"), /projectId !== line\.requisition\.projectId/);
  assert.doesNotMatch(sliceFunction(js, "refreshReservedPickEligibleSerials"), /LOGITEC/);
  assert.doesNotMatch(sliceFunction(js, "openReservedPickModal"), /LOGITEC/);
  assert.match(sliceFunction(js, "openReservedPickModal"), /req\.project \? `\$\{req\.project\.name\} \(\$\{req\.project\.code\}\)`/);
});

test("UI acepta serie o IMEI, evita duplicados, actualiza contador y desactiva Confirmar", () => {
  const harness = new Function(
    "escCell",
    `
    const confirmBtn = { disabled: false };
    const counter = { textContent: "" };
    const eligible = { innerHTML: "" };
    const selected = { innerHTML: "" };
    const document = {
      getElementById(id) {
        if (id === "reqActionConfirmBtn") return confirmBtn;
        if (id === "reqActionSerialCounter") return counter;
        if (id === "reqActionSerialEligible") return eligible;
        if (id === "reqActionSerialSelected") return selected;
        return null;
      }
    };
    const reqActionContext = {
      mode: "pick",
      selectedSerialIds: [],
      serialPlan: {
        serialRequired: true,
        quantity: "2",
        layers: [
          {
            inventoryLayerId: "layer-01",
            lotNumber: "L-1",
            serials: [
              { id: "ser-1", serialNumber: "SN-1", imei: "IMEI-1" },
              { id: "ser-2", serialNumber: "SN-2", imei: null }
            ]
          }
        ]
      }
    };
    ${sliceFunction(js, "flattenEligiblePickSerials")}
    ${sliceFunction(js, "formatEligibleSerialLabel")}
    ${sliceFunction(js, "reservedPickSerialNeeded")}
    ${sliceFunction(js, "updateReservedPickConfirmState")}
    ${sliceFunction(js, "renderReservedPickSerialUi")}
    ${sliceFunction(js, "addReservedPickSerialId")}
    ${sliceFunction(js, "addReservedPickSerialFromScan")}
    ${sliceFunction(js, "removeReservedPickSerialId")}
    renderReservedPickSerialUi();
    const initialDisabled = confirmBtn.disabled;
    const first = addReservedPickSerialFromScan("imei-1");
    const afterOne = { ok: first.ok, counter: counter.textContent, disabled: confirmBtn.disabled };
    const dup = addReservedPickSerialFromScan("SN-1");
    const second = addReservedPickSerialFromScan("SN-2");
    const complete = { ok: second.ok, counter: counter.textContent, disabled: confirmBtn.disabled };
    removeReservedPickSerialId("ser-2");
    const afterRemove = { counter: counter.textContent, disabled: confirmBtn.disabled };
    return { initialDisabled, afterOne, dup, complete, afterRemove };
    `
  );
  const result = harness((value: unknown) => String(value ?? ""));
  assert.equal(result.initialDisabled, true);
  assert.equal(result.afterOne.ok, true);
  assert.equal(result.afterOne.counter, "1 de 2");
  assert.equal(result.afterOne.disabled, true);
  assert.equal(result.dup.ok, false);
  assert.match(String(result.dup.message), /ya está seleccionada/i);
  assert.equal(result.complete.ok, true);
  assert.equal(result.complete.counter, "2 de 2");
  assert.equal(result.complete.disabled, false);
  assert.equal(result.afterRemove.counter, "1 de 2");
  assert.equal(result.afterRemove.disabled, true);
});
