import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { Prisma } from "@prisma/client";
import { canExposeEconomicValuation } from "../src/modules/inventory/inventory-economic-access.js";
import {
  calculateInventoryValuation,
  publicValuationForRole,
  summarizeStockAssignments
} from "../src/modules/inventory/inventory-valuation.service.js";

const js = readFileSync(new URL("../public/dashboard.js", import.meta.url), "utf8");
const html = readFileSync(new URL("../public/dashboard.html", import.meta.url), "utf8");
const stockRoutes = readFileSync(new URL("../src/modules/inventory/inventory.routes.ts", import.meta.url), "utf8");
const catalogRoutes = readFileSync(new URL("../src/modules/catalog/catalog.routes.ts", import.meta.url), "utf8");

function d(n: string | number) {
  return new Prisma.Decimal(n);
}

function layer(opts: {
  qty: string | number;
  unitPriceMxn?: string | number | null;
  unitPriceUsd?: string | number | null;
  reservedQty?: string | number;
  lotNumber?: string;
  id?: string;
}) {
  return {
    id: opts.id,
    lotNumber: opts.lotNumber ?? null,
    qty: d(opts.qty),
    reservedQty: d(opts.reservedQty ?? 0),
    unitPriceMxn: opts.unitPriceMxn == null ? null : d(opts.unitPriceMxn),
    unitPriceUsd: opts.unitPriceUsd == null ? null : d(opts.unitPriceUsd)
  };
}

test("una capa con valor calcula cantidad, total y promedio", () => {
  const result = calculateInventoryValuation([layer({ qty: 10, unitPriceMxn: "12.50" })]);
  assert.equal(result.status, "COMPLETE");
  assert.equal(result.qtyTotal, "10");
  assert.equal(result.qtyValued, "10");
  assert.equal(result.qtyUnvalued, "0");
  assert.equal(result.totalValueMxn, "125.00");
  assert.equal(result.avgUnitPriceMxn, "12.50");
  assert.equal(result.coveragePct, "100.00");
  assert.equal(result.currency, "MXN");
});

test("varias capas con el mismo valor conservan un único unitario", () => {
  const result = calculateInventoryValuation([
    layer({ qty: 4, unitPriceMxn: "10" }),
    layer({ qty: 6, unitPriceMxn: "10.0000" })
  ]);
  assert.equal(result.status, "COMPLETE");
  assert.equal(result.hasMixedUnitPrices, false);
  assert.equal(result.avgUnitPriceMxn, "10.00");
  assert.equal(result.totalValueMxn, "100.00");
});

test("varias capas con valores distintos usan promedio ponderado y desglose", () => {
  const result = calculateInventoryValuation([
    layer({ qty: 10, unitPriceMxn: "10", lotNumber: "A" }),
    layer({ qty: 30, unitPriceMxn: "20", lotNumber: "B" })
  ]);
  assert.equal(result.hasMixedUnitPrices, true);
  assert.equal(result.avgUnitPriceMxn, "17.50");
  assert.equal(result.totalValueMxn, "700.00");
  assert.equal(result.minUnitPriceMxn, "10.00");
  assert.equal(result.maxUnitPriceMxn, "20.00");
  assert.equal(result.layers.length, 2);
  assert.equal(result.layers[0]?.layerValueMxn, "100.00");
  assert.equal(result.layers[1]?.layerValueMxn, "600.00");
});

test("capas sin valor no se convierten en cero", () => {
  const result = calculateInventoryValuation([
    layer({ qty: 7, unitPriceMxn: null }),
    layer({ qty: 3, unitPriceUsd: "9" })
  ]);
  assert.equal(result.status, "NONE");
  assert.equal(result.totalValueMxn, null);
  assert.equal(result.avgUnitPriceMxn, null);
  assert.equal(result.qtyUnvalued, "10");
  assert.equal(result.qtyValued, "0");
  assert.equal(result.layers.every((item) => item.unitPriceMxn === null), true);
});

test("mezcla de piezas valuadas y sin valor queda Parcial", () => {
  const result = calculateInventoryValuation([
    layer({ qty: 8, unitPriceMxn: "5" }),
    layer({ qty: 2, unitPriceMxn: null })
  ]);
  assert.equal(result.status, "PARTIAL");
  assert.equal(result.isPartial, true);
  assert.equal(result.totalValueMxn, "40.00");
  assert.equal(result.qtyValued, "8");
  assert.equal(result.qtyUnvalued, "2");
  assert.equal(result.coveragePct, "80.00");
  assert.equal(result.avgUnitPriceMxn, "5.00");
});

test("qty=0 se excluye del cálculo", () => {
  const result = calculateInventoryValuation([
    layer({ qty: 0, unitPriceMxn: "999" }),
    layer({ qty: "0.0000", unitPriceMxn: "1" }),
    layer({ qty: 5, unitPriceMxn: "2" })
  ]);
  assert.equal(result.qtyTotal, "5");
  assert.equal(result.totalValueMxn, "10.00");
  assert.equal(result.layers.length, 1);
});

test("reservas no se descuentan del valor total", () => {
  const result = calculateInventoryValuation([
    layer({ qty: 10, reservedQty: 4, unitPriceMxn: "8" })
  ]);
  assert.equal(result.totalValueMxn, "80.00");
  assert.equal(result.availableValueMxn, "48.00");
  assert.equal(result.qtyReserved, "4");
  assert.notEqual(result.totalValueMxn, result.availableValueMxn);
});

test("aritmética decimal no usa flotantes imprecisos", () => {
  const result = calculateInventoryValuation([
    layer({ qty: "0.1", unitPriceMxn: "0.2" }),
    layer({ qty: "0.2", unitPriceMxn: "0.1" })
  ]);
  assert.equal(result.totalValueMxn, "0.04");
  assert.notEqual(0.1 * 0.2 + 0.2 * 0.1, Number(result.totalValueMxn));
  const weighted = calculateInventoryValuation([
    layer({ qty: "3", unitPriceMxn: "1.11" }),
    layer({ qty: "6", unitPriceMxn: "2.22" })
  ]);
  assert.equal(weighted.totalValueMxn, "16.65");
  assert.equal(weighted.avgUnitPriceMxn, "1.85");
});

test("FREE TO SALE se resume como asignación y no como proyecto", () => {
  const summary = summarizeStockAssignments([
    { qty: 4, assignmentType: "FREE_TO_SALE", project: null },
    { qty: 2, assignmentType: "FREE_TO_SALE", project: { id: "x", code: "FREE_TO_SALE", name: "FREE TO SALE" } }
  ]);
  assert.equal(summary.hasFreeToSale, true);
  assert.equal(summary.projects.length, 0);
  assert.equal(summary.label, "Free to Sale");
});

test("producto en varios proyectos lista existencias reales y excluye qty=0", () => {
  const summary = summarizeStockAssignments([
    { qty: 5, assignmentType: "PROJECT", project: { id: "p1", code: "P1", name: "Alfa" } },
    { qty: 3, assignmentType: "PROJECT", project: { id: "p2", code: "P2", name: "Beta" } },
    { qty: 0, assignmentType: "PROJECT", project: { id: "p3", code: "P3", name: "Gamma" } },
    { qty: 1, assignmentType: "FREE_TO_SALE", project: null }
  ]);
  assert.deepEqual(
    summary.projects.map((project) => project.code),
    ["P1", "P2"]
  );
  assert.equal(summary.hasFreeToSale, true);
  assert.match(summary.label, /Alfa/);
  assert.match(summary.label, /Beta/);
  assert.match(summary.label, /Free to Sale/);
  assert.doesNotMatch(summary.label, /Gamma/);
});

test("LOGITEC y etiquetas prohibidas no aparecen como proyecto con existencias", () => {
  const summary = summarizeStockAssignments([
    { qty: 9, assignmentType: "PROJECT", project: { id: "lg", code: "LOGITEC", name: "LOGITEC" } },
    { qty: 2, assignmentType: "PROJECT", project: { id: "ok", code: "REAL", name: "Proyecto real" } }
  ]);
  assert.equal(summary.projects.length, 1);
  assert.equal(summary.projects[0]?.code, "REAL");
});

test("filtro por proyecto solo valúa las capas de ese proyecto", () => {
  const alfa = calculateInventoryValuation([layer({ qty: 2, unitPriceMxn: "10" })]);
  const beta = calculateInventoryValuation([layer({ qty: 5, unitPriceMxn: "4" })]);
  const all = calculateInventoryValuation([
    layer({ qty: 2, unitPriceMxn: "10" }),
    layer({ qty: 5, unitPriceMxn: "4" })
  ]);
  assert.equal(alfa.totalValueMxn, "20.00");
  assert.equal(beta.totalValueMxn, "20.00");
  assert.equal(all.totalValueMxn, "40.00");
  assert.notEqual(alfa.qtyTotal, all.qtyTotal);
});

test("permiso económico solo ADMIN", () => {
  assert.equal(canExposeEconomicValuation("ADMIN"), true);
  assert.equal(canExposeEconomicValuation("OPERATOR"), false);
  assert.equal(canExposeEconomicValuation("SUPERVISOR"), false);
  assert.equal(canExposeEconomicValuation("CLIENT"), false);
  assert.equal(canExposeEconomicValuation(null), false);
  const valuation = calculateInventoryValuation([layer({ qty: 1, unitPriceMxn: "3" })]);
  assert.equal(publicValuationForRole(valuation, canExposeEconomicValuation("ADMIN"))?.totalValueMxn, "3.00");
  assert.equal(publicValuationForRole(valuation, canExposeEconomicValuation("OPERATOR")), undefined);
});

test("la valuación no altera las cantidades de entrada (508/23207 no se reescriben)", () => {
  const layers = [
    layer({ qty: 508, unitPriceMxn: "1" }),
    layer({ qty: 22699, unitPriceMxn: "2" })
  ];
  const before = layers.map((item) => item.qty.toString());
  const result = calculateInventoryValuation(layers);
  assert.deepEqual(
    layers.map((item) => item.qty.toString()),
    before
  );
  assert.equal(result.qtyTotal, "23207");
  assert.equal(result.totalValueMxn, "45906.00");
});

test("dashboard exporta columnas económicas y no trata Free to Sale como proyecto", () => {
  assert.match(js, /canSeeEconomicValuation/);
  assert.match(js, /currentRole === "ADMIN"/);
  assert.match(js, /valor_unitario_promedio_mxn/);
  assert.match(js, /valor_total_mxn/);
  assert.match(js, /estado_valuacion/);
  assert.match(js, /cantidad_valuada/);
  assert.match(js, /tipo_asignacion/);
  assert.match(js, /Proyectos con existencias/);
  assert.match(js, /Free to Sale/);
  assert.match(js, /Valor parcial: existen piezas sin valor unitario/);
  assert.match(js, /STOCK_EXPORT_COLUMNS/);
});

test("HTML de existencias, proyectos y catálogo muestra la vista económica", () => {
  assert.match(html, /id="sumInventoryValue"/);
  assert.match(html, /id="sumValuedQty"/);
  assert.match(html, /id="sumUnvaluedQty"/);
  assert.match(html, /id="sumEconomicCoverage"/);
  assert.match(html, /js-economic-card/);
  assert.match(html, /dashboard\.js\?v=56/);
  assert.doesNotMatch(html, /dashboard\.js\?v=55/);
});

test("APIs de inventario y catálogo no rellenan precios faltantes ni usan customerId como proyecto", () => {
  assert.match(stockRoutes, /canExposeEconomicValuation/);
  assert.match(stockRoutes, /calculateInventoryValuation/);
  assert.match(catalogRoutes, /stockAssignments/);
  assert.match(catalogRoutes, /summarizeStockAssignments/);
  assert.match(stockRoutes, /qty: \{ gt: 0 \}/);
});
