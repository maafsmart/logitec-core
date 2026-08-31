import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { Prisma } from "@prisma/client";
import {
  compareFifoLayers,
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

test("FIFO: receivedAt más antiguo, luego createdAt, luego id", () => {
  const older = new Date("2024-01-01T10:00:00.000Z");
  const newer = new Date("2024-06-01T10:00:00.000Z");
  const layers = [
    { id: "b", receivedAt: newer, createdAt: newer },
    { id: "a", receivedAt: older, createdAt: older },
    { id: "c", receivedAt: null, createdAt: older },
    { id: "d", receivedAt: null, createdAt: newer }
  ];
  const sorted = [...layers].sort(compareFifoLayers);
  assert.deepEqual(sorted.map((l) => l.id), ["a", "b", "c", "d"]);
});

test("FIFO: fifoAvailableLayers excluye qty-reservedQty <= 0", () => {
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

test("FIFO: planRelocateFifoAllocation reutiliza la misma política", () => {
  const layers = [
    {
      id: "new",
      lotNumber: null,
      qty: d(5),
      reservedQty: d(0),
      receivedAt: new Date("2025-01-01"),
      createdAt: new Date("2025-01-01"),
      unitPriceMxn: null,
      unitPriceUsd: null,
      sourceReference: null
    },
    {
      id: "old",
      lotNumber: null,
      qty: d(5),
      reservedQty: d(0),
      receivedAt: new Date("2024-01-01"),
      createdAt: new Date("2024-01-01"),
      unitPriceMxn: null,
      unitPriceUsd: null,
      sourceReference: null
    }
  ];
  const planned = planRelocateFifoAllocation(layers, d(3));
  assert.equal(planned.allocations[0]!.layer.id, "old");
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

test("Cache buster v=91 para dashboard.js", () => {
  assert.match(html, /dashboard\.js\?v=91/);
});
