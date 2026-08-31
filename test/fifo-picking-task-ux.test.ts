import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { Prisma } from "@prisma/client";
import {
  compareFifoLayers,
  effectiveFifoDate,
  fifoAvailableLayers,
  planRelocateFifoAllocation,
  toFifoLayerCandidate
} from "../src/modules/inventory/inventory-mutation.service.js";
import { InventoryMutationError } from "../src/modules/inventory/inventory-errors.js";

const html = readFileSync(new URL("../public/dashboard.html", import.meta.url), "utf8");
const js = readFileSync(new URL("../public/dashboard.js", import.meta.url), "utf8");
const pickingRoutes = readFileSync(new URL("../src/modules/picking/picking.routes.ts", import.meta.url), "utf8");
const inventoryRoutes = readFileSync(new URL("../src/modules/inventory/inventory.routes.ts", import.meta.url), "utf8");
const mutationSrc = readFileSync(new URL("../src/modules/inventory/inventory-mutation.service.ts", import.meta.url), "utf8");
const tasksRoutes = readFileSync(new URL("../src/modules/tasks/tasks.routes.ts", import.meta.url), "utf8");
const reqService = readFileSync(new URL("../src/modules/requisitions/requisition.service.ts", import.meta.url), "utf8");

function d(n: string | number) {
  return new Prisma.Decimal(n);
}

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

function layer(input: {
  id: string;
  receivedAt?: Date | null;
  createdAt: Date;
  qty?: string;
  reservedQty?: string;
}): Parameters<typeof fifoAvailableLayers>[0][number] {
  return {
    id: input.id,
    lotNumber: null,
    qty: d(input.qty ?? "1"),
    reservedQty: d(input.reservedQty ?? "0"),
    receivedAt: input.receivedAt ?? null,
    createdAt: input.createdAt,
    unitPriceMxn: null,
    unitPriceUsd: null,
    sourceReference: null
  };
}

test("A: receivedAt antiguo va antes que receivedAt nuevo", () => {
  const older = new Date("2024-01-01T00:00:00.000Z");
  const newer = new Date("2024-06-01T00:00:00.000Z");
  const sorted = [
    layer({ id: "new", receivedAt: newer, createdAt: newer }),
    layer({ id: "old", receivedAt: older, createdAt: older })
  ].sort(compareFifoLayers);
  assert.deepEqual(sorted.map((row) => row.id), ["old", "new"]);
});

test("B: receivedAt null + createdAt antiguo va antes que receivedAt posterior (ejemplo Hugo)", () => {
  const aug1 = new Date("2026-08-01T00:00:00.000Z");
  const aug20 = new Date("2026-08-20T00:00:00.000Z");
  const a = layer({ id: "A", receivedAt: null, createdAt: aug1 });
  const b = layer({ id: "B", receivedAt: aug20, createdAt: aug20 });
  assert.ok(compareFifoLayers(a, b) < 0);
  const sorted = [b, a].sort(compareFifoLayers);
  assert.deepEqual(sorted.map((row) => row.id), ["A", "B"]);
  assert.equal(effectiveFifoDate(a).toISOString(), aug1.toISOString());
});

test("C: ambos receivedAt null ordenan por createdAt ASC", () => {
  const early = new Date("2025-01-01T00:00:00.000Z");
  const late = new Date("2025-06-01T00:00:00.000Z");
  const sorted = [
    layer({ id: "late", receivedAt: null, createdAt: late }),
    layer({ id: "early", receivedAt: null, createdAt: early })
  ].sort(compareFifoLayers);
  assert.deepEqual(sorted.map((row) => row.id), ["early", "late"]);
});

test("D: misma fecha FIFO efectiva desempata por createdAt ASC", () => {
  const effective = new Date("2026-03-01T00:00:00.000Z");
  const sorted = [
    layer({ id: "b", receivedAt: effective, createdAt: new Date("2026-03-05T00:00:00.000Z") }),
    layer({ id: "a", receivedAt: effective, createdAt: new Date("2026-03-02T00:00:00.000Z") })
  ].sort(compareFifoLayers);
  assert.deepEqual(sorted.map((row) => row.id), ["a", "b"]);
});

test("E: mismo receivedAt y createdAt desempata por id ASC", () => {
  const when = new Date("2026-01-01T00:00:00.000Z");
  const sorted = [
    layer({ id: "layer-z", receivedAt: when, createdAt: when }),
    layer({ id: "layer-a", receivedAt: when, createdAt: when })
  ].sort(compareFifoLayers);
  assert.deepEqual(sorted.map((row) => row.id), ["layer-a", "layer-z"]);
});

test("F: qty - reservedQty <= 0 no se ofrece", () => {
  const available = fifoAvailableLayers([
    {
      id: "empty",
      lotNumber: null,
      qty: d(5),
      reservedQty: d(5),
      receivedAt: new Date("2024-01-01"),
      createdAt: new Date("2024-01-01"),
      unitPriceMxn: null,
      unitPriceUsd: null,
      sourceReference: null
    },
    {
      id: "ok",
      lotNumber: "L1",
      qty: d(10),
      reservedQty: d(2),
      receivedAt: new Date("2024-02-01"),
      createdAt: new Date("2024-02-01"),
      unitPriceMxn: null,
      unitPriceUsd: null,
      sourceReference: "IN-1"
    }
  ]);
  assert.equal(available.length, 1);
  assert.equal(available[0]!.layer.id, "ok");
  assert.equal(available[0]!.availableQty.toString(), "8");
});

test("G: la primera entrada FIFO queda fifoRecommended=true", () => {
  const aug1 = new Date("2026-08-01T00:00:00.000Z");
  const aug20 = new Date("2026-08-20T00:00:00.000Z");
  const ranked = fifoAvailableLayers([
    layer({ id: "B", receivedAt: aug20, createdAt: aug20 }),
    layer({ id: "A", receivedAt: null, createdAt: aug1 })
  ]);
  const first = toFifoLayerCandidate(ranked[0]!.layer, ranked[0]!.availableQty, true);
  const second = toFifoLayerCandidate(ranked[1]!.layer, ranked[1]!.availableQty, false);
  assert.equal(ranked[0]!.layer.id, "A");
  assert.equal(first.fifoRecommended, true);
  assert.equal(second.fifoRecommended, false);
});

test("H: planRelocateFifoAllocation usa el mismo orden FIFO efectivo", () => {
  const aug1 = new Date("2026-08-01T00:00:00.000Z");
  const aug20 = new Date("2026-08-20T00:00:00.000Z");
  const planned = planRelocateFifoAllocation(
    [
      {
        id: "B",
        lotNumber: null,
        qty: d(5),
        reservedQty: d(0),
        receivedAt: aug20,
        createdAt: aug20,
        unitPriceMxn: null,
        unitPriceUsd: null,
        sourceReference: null
      },
      {
        id: "A",
        lotNumber: null,
        qty: d(5),
        reservedQty: d(0),
        receivedAt: null,
        createdAt: aug1,
        unitPriceMxn: null,
        unitPriceUsd: null,
        sourceReference: null
      }
    ],
    d(3)
  );
  assert.equal(planned.allocations[0]!.layer.id, "A");
});

test("I: picking libre preselecciona la misma entrada (renderPickLayerOptions)", () => {
  const renderSrc = sliceFunction(js, "renderPickLayerOptions");
  assert.match(renderSrc, /fifoRecommended/);
  assert.match(renderSrc, /recommended\?\.layerId \|\| recommended\?\.id/);
  assert.match(sliceFunction(js, "formatPickLayerEntryDate"), /receivedAt \|\| layer\?\.createdAt/);
});

test("J: override manual sigue enviando layerId y layerSelectionMode", () => {
  const payload = sliceFunction(js, "buildPickScanPayload");
  assert.match(payload, /layerSelectionMode/);
  assert.match(payload, /body\.layerId/);
  assert.match(sliceFunction(js, "renderPickLayerOptions"), /MANUAL/);
  assert.match(pickingRoutes, /layerSelectionMode: z\.enum\(\["FIFO", "MANUAL"\]\)/);
});

test("comparePickFifoReservations reutiliza compareFifoLayers (requisiciones compatibles)", () => {
  assert.match(reqService, /compareFifoLayers/);
  assert.doesNotMatch(reqService, /POSITIVE_INFINITY/);
  assert.match(mutationSrc, /effectiveFifoDate/);
  assert.doesNotMatch(mutationSrc, /POSITIVE_INFINITY/);
});

test("Crear tarea tiene typeahead de SKU reutilizando wireProductTypeahead", () => {
  assert.match(html, /id="taskSkuSuggestions"/);
  assert.match(html, /product-typeahead.*taskSku/s);
  assert.match(js, /wireProductTypeahead\([\s\S]*taskSku/);
  assert.match(js, /getCustomerCode:\s*\(\)\s*=>\s*readSmartFieldValue\("taskProject"\)/);
});

test("Crear tarea carga ubicaciones reales del catálogo y filtra por almacén", () => {
  assert.match(js, /populateTaskOperationalFields/);
  assert.match(js, /loadLocationsQuiet/);
  assert.match(js, /getKnownLocationsForWarehouse/);
  assert.match(js, /populateTaskLocationSelect/);
  assert.match(js, /navigateTo[\s\S]*populateTaskOperationalFields/);
  assert.match(js, /taskWarehouseSelect[\s\S]*populateTaskLocationSelect/);
});

test("Otra ubicación sigue disponible como fallback en tareas", () => {
  assert.match(sliceFunction(js, "populateTaskLocationSelect"), /Otra ubicación/);
  assert.match(sliceFunction(js, "fillSmartSelect"), /SMART_OTHER/);
});

test("Tarea tipo Movimiento no ejecuta mutateInventory", () => {
  assert.match(tasksRoutes, /tasksRouter\.post\("\/",/);
  assert.doesNotMatch(tasksRoutes, /mutateInventory/);
  assert.match(html, /taskMovementHint/);
  assert.match(html, /Esta tarea no modifica existencias/);
  assert.match(js, /taskGoRelocateBtn/);
});

test("Picking libre: UI resuelve múltiples entradas y envía layerId exacto", () => {
  assert.match(js, /renderPickLayerOptions/);
  assert.match(js, /AMBIGUOUS_LAYER/);
  assert.match(sliceFunction(js, "scanCode"), /renderPickLayerOptions/);
  const payload = sliceFunction(js, "buildPickScanPayload");
  assert.match(payload, /body\.layerId/);
  assert.match(payload, /layerSelectionMode/);
  assert.match(html, /id="pickLayerOptions"/);
  assert.match(js, /Recomendado FIFO/);
  assert.match(js, /prefetchPickLayersForInventory/);
});

test("Picking libre: no hay segunda implementación FIFO en el cliente", () => {
  assert.match(mutationSrc, /compareFifoLayers/);
  assert.match(mutationSrc, /fifoAvailableLayers/);
  assert.doesNotMatch(js, /function compareFifoLayers/);
});

test("Backend picking acepta layerId y layerSelectionMode MANUAL en notas", () => {
  assert.match(pickingRoutes, /layerSelectionMode: z\.enum\(\["FIFO", "MANUAL"\]\)/);
  assert.match(pickingRoutes, /Selección manual distinta de FIFO recomendado/);
});

test("Capas API devuelve FIFO ordenado con fifoRecommended", () => {
  assert.match(inventoryRoutes, /fifoAvailableLayers/);
  assert.match(inventoryRoutes, /toFifoLayerCandidate/);
  const candidate = toFifoLayerCandidate(
    {
      id: "layer-1",
      lotNumber: "LOT-A",
      qty: d(10),
      reservedQty: d(1),
      receivedAt: new Date("2024-01-01"),
      createdAt: new Date("2024-01-02"),
      unitPriceMxn: d(100),
      unitPriceUsd: null,
      sourceReference: "IN-001"
    },
    d(9),
    true
  );
  assert.equal(candidate.fifoRecommended, true);
  assert.equal(candidate.availableQty, "9");
});

test("selectLayer marca AMBIGUOUS_LAYER con entradas ordenadas FIFO", () => {
  assert.match(mutationSrc, /Hay varias entradas con saldo disponible/);
  assert.match(mutationSrc, /fifoAvailableLayers\(layers\)/);
  assert.doesNotMatch(mutationSrc, /varias capas con saldo\. Selecciona capa/);
});

test("Requisiciones elegibles APPROVED e IN_PROGRESS y estado vacío informativo", () => {
  assert.match(js, /row\.status === "APPROVED" \|\| row\.status === "IN_PROGRESS"/);
  assert.match(js, /No hay requisiciones aprobadas o en progreso para surtir/);
  assert.match(js, /pickRequisitionEmptyHint/);
  assert.match(html, /id="pickRequisitionEmptyHint"/);
  assert.doesNotMatch(sliceFunction(js, "loadPickRequisitions"), /textContent = folio libre/);
});

test("FIFO de requisición existente no se rompe", () => {
  assert.match(reqService, /comparePickFifoReservations/);
  assert.match(reqService, /planFifoReservationConsumption/);
  assert.match(reqService, /allocationMode === "FIFO"/);
  assert.match(js, /buildReservedFifoPickPayload/);
  assert.match(js, /executeReservedFifoPick/);
});

test("Serializados mantienen flujo FIFO elegible", () => {
  assert.match(pickingRoutes, /eligible-serials/);
  assert.match(reqService, /getEligiblePickSerials/);
  assert.match(js, /refreshReservedPickEligibleSerials/);
});

test("Reubicación sigue usando planRelocateFifoAllocation compartido", () => {
  assert.match(mutationSrc, /planRelocateFifoAllocation/);
  assert.match(js, /allocationMode:\s*"FIFO"/);
});

test("Cache buster v=93 para dashboard.js", () => {
  assert.match(html, /dashboard\.js\?v=93/);
});
