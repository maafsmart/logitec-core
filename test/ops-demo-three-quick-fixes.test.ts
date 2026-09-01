import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const html = readFileSync(new URL("../public/dashboard.html", import.meta.url), "utf8");
const js = readFileSync(new URL("../public/dashboard.js", import.meta.url), "utf8");
const inventoryRoutes = readFileSync(
  new URL("../src/modules/inventory/inventory.routes.ts", import.meta.url),
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

function sliceBlock(source: string, token: string): string {
  const start = source.indexOf(token);
  assert.ok(start >= 0, `missing ${token}`);
  const brace = source.indexOf("{", start);
  assert.ok(brace >= 0, `missing body for ${token}`);
  let depth = 0;
  for (let i = brace; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === "{") depth += 1;
    else if (ch === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  throw new Error(`unclosed ${token}`);
}

const formatQtySrc = sliceFunction(js, "formatQty");
const movementQuantitySrc = sliceFunction(js, "movementQuantity");
const formatMovementDetailQtySrc = sliceFunction(js, "formatMovementDetailQty");
const formatMovementTypeLabelSrc = sliceFunction(js, "formatMovementTypeLabel");
const openMovementDetailSrc = sliceFunction(js, "openMovementDetail");
const submitOutboundSrc = sliceFunction(js, "submitOperationalMovement");
const wireSrc = sliceFunction(js, "wireProductTypeahead");
const invalidateSrc = sliceFunction(js, "invalidateSkuSelection");
const clearSkuSrc = sliceFunction(js, "clearSkuSelectionFields");
const syncOutboundSrc = sliceFunction(js, "syncOutboundSubmitEnabled");
const setCubeSrc = sliceFunction(js, "setOutboundInventoryFromCube");
const applyStockSrc = sliceFunction(js, "applyStockSuggestionToOps");
const renderSkuSrc = sliceFunction(js, "renderSkuContext");

test("cache-buster dashboard.js?v=97", () => {
  assert.match(html, /dashboard\.js\?v=97/);
});

test("1-2 detalle de traslado muestra Cantidad numérica y Tipo separado", () => {
  const formatQty = new Function(`${formatQtySrc}\nreturn formatQty;`)();
  const movementQuantity = new Function(`${formatQtySrc}\n${movementQuantitySrc}\nreturn movementQuantity;`)();
  const formatMovementDetailQty = new Function(
    `${formatQtySrc}\n${formatMovementDetailQtySrc}\nreturn formatMovementDetailQty;`
  )();
  const formatMovementTypeLabel = new Function(`${formatMovementTypeLabelSrc}\nreturn formatMovementTypeLabel;`)();

  const relocateRow = {
    qty: "20",
    movement: {
      movementType: "RELOCATE",
      signedQty: "0",
      quantityBefore: "50",
      quantityAfter: "30"
    }
  };
  assert.equal(formatMovementTypeLabel("RELOCATE"), "Traslado");
  assert.equal(formatMovementDetailQty(relocateRow), "20");
  assert.notEqual(formatMovementDetailQty(relocateRow), "Traslado");
  assert.equal(movementQuantity(relocateRow), "Traslado");
  assert.match(openMovementDetailSrc, /label:\s*"Tipo"/);
  assert.match(openMovementDetailSrc, /formatMovementDetailQty\(row\)/);
  assert.doesNotMatch(openMovementDetailSrc, /Cantidad",\s*value:\s*transfer \? formatQty\(row\.qty\) : movementQuantity\(row\)/);
  assert.match(openMovementDetailSrc, /quantityBefore/);
  assert.match(openMovementDetailSrc, /quantityAfter/);
  assert.equal(formatQty(relocateRow.movement.quantityBefore), "50");
  assert.equal(formatQty(relocateRow.movement.quantityAfter), "30");
});

test("3-5 Salidas envía inventoryId exacto del cubo seleccionado", () => {
  assert.match(html, /id="outboundInventoryId"/);
  assert.match(html, /id="outboundSubmitBtn"[^>]*\bdisabled\b/);
  assert.match(submitOutboundSrc, /payload\.inventoryId\s*=\s*outboundInventoryId/);
  assert.match(submitOutboundSrc, /outboundInventoryId/);
  assert.match(submitOutboundSrc, /Seleccione el cubo exacto/);
  assert.match(applyStockSrc, /setOutboundInventoryFromCube\(item\)/);
  assert.match(setCubeSrc, /inventoryId/);
  assert.match(renderSkuSrc, /outboundSelector/);
  assert.match(renderSkuSrc, /setOutboundInventoryFromCube/);
  assert.match(inventoryRoutes, /else if \(inventoryId\)/);
  assert.match(inventoryRoutes, /Línea de inventario no encontrada para ese inventoryId y SKU/);
  assert.match(inventoryRoutes, /Hay varias asignaciones para esa ubicación\/estado; indica inventoryId/);
  assert.match(setCubeSrc, /outboundInventoryId/);
  assert.ok(submitOutboundSrc.includes('type: kind === "in" ? "IN" : "OUT"'));
});

test("backend usa inventoryId sin ambigüedad por ubicación/estatus", () => {
  const start = inventoryRoutes.indexOf("let inventoryId = body.inventoryId");
  assert.ok(start >= 0);
  const chunk = inventoryRoutes.slice(start, start + 1200);
  assert.match(chunk, /else if \(inventoryId\)/);
  assert.match(chunk, /productId: product\.id/);
  assert.match(chunk, /clientId: activeClientId/);
  const ambiguousIdx = chunk.indexOf("Hay varias asignaciones");
  const targetedIdx = chunk.indexOf("else if (inventoryId)");
  assert.ok(targetedIdx >= 0 && ambiguousIdx > targetedIdx);
});

test("6-8 cambiar SKU invalida selección previa y bloquea botón", () => {
  assert.match(wireSrc, /invalidateSkuSelection\(listEl, input\)/);
  assert.match(wireSrc, /contextSeq/);
  assert.match(wireSrc, /String\(input\.value \|\| ""\)\.trim\(\) !== String\(selectedSku\)\.trim\(\)/);
  assert.match(wireSrc, /context\?\.product\?\.sku/);
  assert.match(invalidateSrc, /clearSkuSelectionFields/);
  assert.match(invalidateSrc, /hideSkuSelectedCard/);
  assert.match(clearSkuSrc, /prefix === "outbound"/);
  assert.match(clearSkuSrc, /clearOutboundInventorySelection/);
  assert.match(syncOutboundSrc, /outboundHasExactInventorySelection/);
  assert.match(syncOutboundSrc, /btn\.disabled = !ready/);
  assert.match(renderSkuSrc, /cardSku/);
});

test("predictor atrasado no puede restaurar SKU viejo", () => {
  const pickSrc = sliceBlock(wireSrc, "const pick = (item) =>");
  assert.match(pickSrc, /contextSeq/);
  assert.match(pickSrc, /contextSeq !== state\.contextSeq/);
  assert.match(pickSrc, /skuSelectedId !== selectedId/);
  assert.match(pickSrc, /skuSelectedCode/);
  assert.match(pickSrc, /String\(input\.value \|\| ""\)\.trim\(\)/);
  assert.match(wireSrc, /state\.contextSeq \+= 1/);
});

test("9-10 reubicación serializada y cache-buster no regresan", () => {
  assert.match(js, /function applyRelocateBalanceSelection\(/);
  assert.match(js, /relocateSelectedSerialIds/);
  assert.match(html, /dashboard\.js\?v=97/);
  assert.match(js, /serialControlled|lotControlled|layerId/);
});
