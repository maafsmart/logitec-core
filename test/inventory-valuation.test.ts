import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";
import { Prisma } from "@prisma/client";
import { canExposeEconomicValuation } from "../src/modules/inventory/inventory-economic-access.js";
import {
  calculateInventoryValuation,
  publicValuationForRole,
  summarizeStockAssignments,
  summarizeVisibleStock
} from "../src/modules/inventory/inventory-valuation.service.js";
import {
  layerPriceOnlyData,
  parseLayerUnitPriceMxn,
  LayerPriceError
} from "../src/modules/inventory/inventory-layer-price.service.js";

const js = readFileSync(new URL("../public/dashboard.js", import.meta.url), "utf8");
const html = readFileSync(new URL("../public/dashboard.html", import.meta.url), "utf8");
const stockRoutes = readFileSync(new URL("../src/modules/inventory/inventory.routes.ts", import.meta.url), "utf8");
const catalogRoutes = readFileSync(new URL("../src/modules/catalog/catalog.routes.ts", import.meta.url), "utf8");
const priceService = readFileSync(
  new URL("../src/modules/inventory/inventory-layer-price.service.ts", import.meta.url),
  "utf8"
);

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
  assert.match(js, /El valor es parcial porque existen piezas sin precio asignado/);
  assert.match(js, /STOCK_EXPORT_COLUMNS/);
});

test("HTML de existencias, proyectos y catálogo muestra la vista económica", () => {
  assert.match(html, /id="sumInventoryValue"/);
  assert.match(html, /id="sumValuedQty"/);
  assert.match(html, /id="sumUnvaluedQty"/);
  assert.match(html, /id="sumEconomicCoverage"/);
  assert.match(html, /js-economic-card/);
  assert.match(html, /id="sumStockCubes"/);
  assert.match(html, /id="sumStockTotal"[\s\S]{0,120}Piezas/);
  assert.match(html, /id="sumStockCubes"[\s\S]{0,120}Saldos/);
  assert.match(html, /dashboard\.js\?v=59/);
  assert.doesNotMatch(html, /dashboard\.js\?v=58/);
  assert.doesNotMatch(html, /dashboard\.js\?v=57/);
  assert.doesNotMatch(html, /dashboard\.js\?v=56/);
});

test("APIs de inventario y catálogo no rellenan precios faltantes ni usan customerId como proyecto", () => {
  assert.match(stockRoutes, /canExposeEconomicValuation/);
  assert.match(stockRoutes, /calculateInventoryValuation/);
  assert.match(catalogRoutes, /stockAssignments/);
  assert.match(catalogRoutes, /summarizeStockAssignments/);
  assert.match(stockRoutes, /qty: \{ gt: 0 \}/);
});

test("Piezas es la suma de qty y Saldos es el conteo de cubos con qty>0", () => {
  const summary = summarizeVisibleStock([
    { qty: 100, valuation: { qtyUnvalued: "0" } },
    { qty: 43, valuation: { qtyUnvalued: "43" } },
    { qty: 0, valuation: { qtyUnvalued: "0" } },
    { qty: "7.5", valuation: { qtyUnvalued: "2.5" } }
  ]);
  assert.equal(summary.saldos, 3);
  assert.equal(summary.piezas, "150.5");
  assert.equal(summary.unvaluedSaldos, 2);
  assert.equal(summary.unvaluedPiezas, "45.5");
});

test("precio cero es valor asignado y null es ausencia de precio", () => {
  const zero = calculateInventoryValuation([layer({ qty: 6, unitPriceMxn: 0 })]);
  const missing = calculateInventoryValuation([layer({ qty: 6, unitPriceMxn: null })]);
  assert.equal(zero.status, "COMPLETE");
  assert.equal(zero.qtyValued, "6");
  assert.equal(zero.qtyUnvalued, "0");
  assert.equal(zero.totalValueMxn, "0.00");
  assert.equal(missing.status, "NONE");
  assert.equal(missing.qtyValued, "0");
  assert.equal(missing.qtyUnvalued, "6");
  assert.equal(missing.totalValueMxn, null);
  const parsedZero = parseLayerUnitPriceMxn("0");
  assert.equal(parsedZero.toString(), "0");
  assert.throws(() => parseLayerUnitPriceMxn(null), LayerPriceError);
  assert.throws(() => parseLayerUnitPriceMxn(""), LayerPriceError);
  assert.throws(() => parseLayerUnitPriceMxn("1.23456"), LayerPriceError);
  assert.equal(parseLayerUnitPriceMxn("12.3456").toString(), "12.3456");
});

test("la edición de precio solo actualiza unitPriceMxn y no toca existencias", () => {
  const data = layerPriceOnlyData(new Prisma.Decimal("9.5"));
  assert.deepEqual(Object.keys(data), ["unitPriceMxn"]);
  assert.match(priceService, /data: layerPriceOnlyData\(price\)/);
  assert.match(priceService, /subtype: "LAYER_PRICE_UPDATE"/);
  assert.match(priceService, /logActivity/);
  assert.doesNotMatch(priceService, /inventoryMovement\.create/);
  assert.doesNotMatch(priceService, /tx\.inventory\.update/);
  assert.doesNotMatch(priceService, /tx\.inventoryLayer\.create/);
  assert.doesNotMatch(priceService, /tx\.inventoryLayer\.delete/);
  assert.doesNotMatch(priceService, /splitLayer/);
});

test("ADMIN puede editar precio; OPERATOR y CLIENT quedan rechazados", () => {
  assert.match(stockRoutes, /inventoryRouter\.patch\("\/layers\/:layerId\/price", requireRole\(\["ADMIN"\]\)/);
  assert.match(stockRoutes, /No autorizado para editar valuación económica/);
  assert.match(stockRoutes, /No autorizado para consultar valuación económica/);
  const patchIdx = stockRoutes.indexOf('inventoryRouter.patch("/layers/:layerId/price"');
  const patchBlock = stockRoutes.slice(patchIdx, stockRoutes.indexOf("inventoryRouter.get(\"/products/:productId/valuation\"", patchIdx));
  assert.match(patchBlock, /requireRole\(\["ADMIN"\]\)/);
  assert.doesNotMatch(patchBlock, /OPERATOR/);
  assert.doesNotMatch(patchBlock, /CLIENT/);
  assert.match(stockRoutes, /unitPriceMxn: _mxn/);
  assert.match(stockRoutes, /unitPriceUsd: _usd/);
});

test("tras guardar precio se recalcan tarjetas y tabla sin recargar la página", () => {
  const start = js.indexOf("async function confirmLayerPriceUpdate");
  const end = js.indexOf("function wireLayerPricePanel");
  const block = js.slice(start, end);
  assert.ok(start >= 0 && end > start);
  assert.match(block, /loadStockStrip/);
  assert.doesNotMatch(block, /location\.reload/);
  assert.match(js, /inventoryUnpricedOnly/);
  assert.match(js, /sumStockCubes/);
  assert.match(html, /Ver registros sin precio/);
  assert.match(html, /id="layerPricePanel"/);
  assert.match(js, /window\.confirm/);
});

function loadLayerPriceInputHelpers() {
  const start = js.indexOf("function parseLayerPriceMxnInput");
  const end = js.indexOf("function openInventoryDetail");
  assert.ok(start >= 0 && end > start);
  const sandbox = {};
  vm.runInNewContext(js.slice(start, end), sandbox);
  return sandbox;
}

test("precio null deja el campo vacío y nunca convierte vacío en cero", () => {
  assert.equal(Number(""), 0);
  const helpers = loadLayerPriceInputHelpers();
  const empty = helpers.parseLayerPriceMxnInput("");
  const blank = helpers.parseLayerPriceMxnInput("   ");
  const missing = helpers.parseLayerPriceMxnInput(null);
  assert.equal(empty.ok, false);
  assert.equal(empty.empty, true);
  assert.equal(blank.empty, true);
  assert.equal(missing.empty, true);
  assert.notEqual(empty.value, "0");
  assert.equal(empty.value, undefined);
  assert.equal(helpers.normalizeLayerPriceMxn(""), null);
  assert.equal(helpers.layerHasAssignedPrice({ unitPriceMxn: null }), false);
  assert.equal(helpers.layerHasAssignedPrice({ unitPriceMxn: "" }), false);
  assert.match(js, /resetNewPriceInput/);
  const resetStart = js.indexOf("function resetNewPriceInput");
  const resetEnd = js.indexOf("function updateLayerPricePreview");
  const resetBlock = js.slice(resetStart, resetEnd);
  assert.match(resetBlock, /el\.value = ""/);
  assert.match(resetBlock, /layerHasAssignedPrice\(layer\)/);
  assert.doesNotMatch(resetBlock, /Number\(/);
  assert.match(html, /id="priceNew"[^>]*placeholder="Escribe el precio unitario MXN"/);
  assert.equal((html.match(/Escribe el precio unitario MXN/g) || []).length, 1);
  assert.match(html, /id="priceNewHint"[^>]*>Permite valores desde 0 y hasta 4 decimales\./);
  assert.match(html, /class="price-new-help"/);
  assert.doesNotMatch(html, /id="priceNewHint"[^>]*>Escribe el precio unitario MXN/);
  assert.doesNotMatch(html, /id="priceNew"[^>]*placeholder="0\.0000"/);
});

test("campo vacío mantiene Guardar desactivado y cero escrito a mano es válido", () => {
  const helpers = loadLayerPriceInputHelpers();
  const zero = helpers.parseLayerPriceMxnInput("0");
  const zeroPad = helpers.parseLayerPriceMxnInput("0.0000");
  assert.equal(zero.ok, true);
  assert.equal(zero.value, "0");
  assert.equal(zeroPad.ok, true);
  assert.equal(helpers.normalizeLayerPriceMxn("0"), "0.0000");
  const nullLayer = { id: "l1", unitPriceMxn: null };
  const valuedLayer = { id: "l2", unitPriceMxn: "12.5" };
  assert.equal(helpers.layerPriceHasRealChange(nullLayer, zero), true);
  assert.equal(helpers.layerPriceHasRealChange(valuedLayer, helpers.parseLayerPriceMxnInput("12.5")), false);
  assert.equal(helpers.layerPriceHasRealChange(valuedLayer, helpers.parseLayerPriceMxnInput("12.5000")), false);
  assert.equal(helpers.layerPriceHasRealChange(valuedLayer, helpers.parseLayerPriceMxnInput("12.51")), true);
  assert.match(html, /id="priceConfirmBtn"[^>]*disabled/);
  assert.match(html, /#priceConfirmBtn:disabled[\s\S]*cursor:\s*not-allowed/);
  assert.match(html, /#priceConfirmBtn:disabled[\s\S]*background:\s*#94a3b8/);
  assert.match(js, /btn\.disabled = !\(layer\?\.id && parsed\.ok && layerPriceHasRealChange/);
  const parseStart = js.indexOf("function parseLayerPriceMxnInput");
  const parseEnd = js.indexOf("function normalizeLayerPriceMxn");
  assert.doesNotMatch(js.slice(parseStart, parseEnd), /Number\(/);
});

test("Guardar precio desactivado se ve gris y se reactiva con un valor válido", () => {
  const cssStart = html.indexOf("#priceConfirmBtn:disabled");
  assert.ok(cssStart >= 0);
  const cssBlock = html.slice(cssStart, cssStart + 220);
  assert.match(cssBlock, /background:\s*#94a3b8/);
  assert.match(cssBlock, /cursor:\s*not-allowed/);
  assert.doesNotMatch(cssBlock, /var\(--accent\)/);
  assert.match(html, /id="priceConfirmBtn"[^>]*disabled/);
  const helpers = loadLayerPriceInputHelpers();
  const zero = helpers.parseLayerPriceMxnInput("0");
  const valid = helpers.parseLayerPriceMxnInput("12.5");
  const nullLayer = { id: "l1", unitPriceMxn: null };
  assert.equal(zero.ok, true);
  assert.equal(valid.ok, true);
  assert.equal(helpers.layerPriceHasRealChange(nullLayer, zero), true);
  assert.equal(helpers.layerPriceHasRealChange(nullLayer, valid), true);
  assert.match(js, /btn\.disabled = !\(layer\?\.id && parsed\.ok && layerPriceHasRealChange\(layer, parsed\)\)/);
});

test("Cancelar no hace PATCH y un precio existente exige un cambio real", () => {
  const closeStart = js.indexOf("function closeLayerPricePanel");
  const closeEnd = js.indexOf("async function confirmLayerPriceUpdate");
  const closeBlock = js.slice(closeStart, closeEnd);
  assert.ok(closeStart >= 0 && closeEnd > closeStart);
  assert.doesNotMatch(closeBlock, /authenticatedFetch/);
  assert.doesNotMatch(closeBlock, /PATCH/);
  assert.doesNotMatch(closeBlock, /\/api\/inventory\/layers\//);
  const confirmStart = js.indexOf("async function confirmLayerPriceUpdate");
  const confirmEnd = js.indexOf("function wireLayerPricePanel");
  const confirmBlock = js.slice(confirmStart, confirmEnd);
  assert.match(confirmBlock, /layerPriceHasRealChange/);
  assert.match(confirmBlock, /El precio no cambió/);
  const fetchIdx = confirmBlock.indexOf("authenticatedFetch");
  const changeIdx = confirmBlock.indexOf("layerPriceHasRealChange");
  assert.ok(changeIdx >= 0 && fetchIdx > changeIdx);
});

test("la confirmación muestra el precio exacto y las piezas afectadas", () => {
  const helpers = loadLayerPriceInputHelpers();
  assert.equal(
    helpers.layerPriceConfirmMessage(helpers.parseLayerPriceMxnInput("0"), "138"),
    "Se asignará un precio unitario de $0.0000 MXN a 138 piezas. ¿Deseas continuar?"
  );
  assert.equal(
    helpers.layerPriceConfirmMessage(helpers.parseLayerPriceMxnInput("0.0000"), "138"),
    "Se asignará un precio unitario de $0.0000 MXN a 138 piezas. ¿Deseas continuar?"
  );
  assert.match(js, /window\.confirm\(layerPriceConfirmMessage\(parsed, qty\)\)/);
  assert.throws(() => parseLayerUnitPriceMxn(""), LayerPriceError);
  assert.throws(() => parseLayerUnitPriceMxn("   "), LayerPriceError);
  assert.equal(parseLayerUnitPriceMxn(0).toString(), "0");
});
