import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const html = readFileSync(new URL("../public/dashboard.html", import.meta.url), "utf8");
const js = readFileSync(new URL("../public/dashboard.js", import.meta.url), "utf8");
const inventoryRoutes = readFileSync(
  new URL("../src/modules/inventory/inventory.routes.ts", import.meta.url),
  "utf8"
);
const exportRoutes = readFileSync(new URL("../src/modules/exports/exports.routes.ts", import.meta.url), "utf8");

function sliceFunction(source: string, name: string): string {
  const token = `function ${name}(`;
  const start = source.indexOf(token);
  assert.ok(start >= 0, `missing function ${name}`);
  const from = source.lastIndexOf("\n", start) >= 0 ? source.lastIndexOf("\n", start) + 1 : start;
  const next = source.indexOf("\nfunction ", start + token.length);
  const nextAsync = source.indexOf("\nasync function ", start + token.length);
  const candidates = [next, nextAsync].filter((n) => n >= 0);
  const end = candidates.length ? Math.min(...candidates) : source.length;
  return source.slice(from, end);
}

function sliceConstArray(source: string, name: string): string {
  const token = `const ${name} = [`;
  const start = source.indexOf(token);
  assert.ok(start >= 0, `missing const ${name}`);
  const nextConst = source.indexOf("\nconst ", start + token.length);
  return source.slice(start, nextConst >= 0 ? nextConst : source.length);
}

function sliceRoute(source: string, needle: string): string {
  const start = source.indexOf(needle);
  assert.ok(start >= 0, `missing ${needle}`);
  const nextGet = source.indexOf("inventoryRouter.get(", start + needle.length);
  const nextPost = source.indexOf("inventoryRouter.post(", start + needle.length);
  const candidates = [nextGet, nextPost].filter((n) => n >= 0);
  const end = candidates.length ? Math.min(...candidates) : source.length;
  return source.slice(start, end);
}

const formatQtySrc = sliceFunction(js, "formatQty");
const formatBalanceSrc = sliceFunction(js, "formatMovementBalance");
const formatMovementBalance = new Function(`${formatQtySrc}\n${formatBalanceSrc}\nreturn formatMovementBalance;`)();
const movementColumns = sliceConstArray(js, "MOVEMENT_COLUMNS");
const loadMovements = sliceFunction(js, "loadInventoryMovements");
const listRoute = sliceRoute(inventoryRoutes, 'inventoryRouter.get("/movements"');
const csvStart = exportRoutes.indexOf('exportsRouter.get("/movements.csv"');
assert.ok(csvStart >= 0, "missing movements.csv");
const csvNext = exportRoutes.indexOf("exportsRouter.get(", csvStart + 10);
const movementsCsvRoute = exportRoutes.slice(csvStart, csvNext >= 0 ? csvNext : exportRoutes.length);

function apiRow(before: string | number | null | undefined, after: string | number | null | undefined) {
  return { movement: { quantityBefore: before, quantityAfter: after } };
}

test("la tabla de Existencias usa quantityBefore y quantityAfter de la API", () => {
  assert.match(html, /Movimientos de inventario/);
  assert.match(movementColumns, /label:\s*"Antes"/);
  assert.match(movementColumns, /label:\s*"Después"/);
  assert.match(movementColumns, /formatMovementBalance\(m,\s*"quantityBefore"\)/);
  assert.match(movementColumns, /formatMovementBalance\(m,\s*"quantityAfter"\)/);
  assert.match(movementColumns, /m\.movement\?\.quantityBefore/);
  assert.match(movementColumns, /m\.movement\?\.quantityAfter/);
  assert.doesNotMatch(movementColumns, /formatQty\(m\.quantityBefore\)/);
  assert.doesNotMatch(movementColumns, /formatQty\(m\.quantityAfter\)/);
  assert.match(listRoute, /quantityBefore:\s*row\.quantityBefore\.toString\(\)/);
  assert.match(listRoute, /quantityAfter:\s*row\.quantityAfter\.toString\(\)/);
  assert.match(listRoute, /movement:\s*\{/);
  assert.match(movementsCsvRoute, /r\.quantityBefore\.toString\(\)/);
  assert.match(movementsCsvRoute, /r\.quantityAfter\.toString\(\)/);
});

test("muestra 0 a 1, 1 a 2 y 30 a 31 sin recalcular", () => {
  const zeroToOne = apiRow("0", "1");
  const oneToTwo = apiRow("1", "2");
  const thirtyToThirtyOne = apiRow("30", "31");
  assert.equal(formatMovementBalance(zeroToOne, "quantityBefore"), "0");
  assert.equal(formatMovementBalance(zeroToOne, "quantityAfter"), "1");
  assert.equal(formatMovementBalance(oneToTwo, "quantityBefore"), "1");
  assert.equal(formatMovementBalance(oneToTwo, "quantityAfter"), "2");
  assert.equal(formatMovementBalance(thirtyToThirtyOne, "quantityBefore"), "30");
  assert.equal(formatMovementBalance(thirtyToThirtyOne, "quantityAfter"), "31");
  const misleadingTopLevel = {
    quantityBefore: "99",
    quantityAfter: "100",
    qty: "1",
    movement: { quantityBefore: "0", quantityAfter: "1" }
  };
  assert.equal(formatMovementBalance(misleadingTopLevel, "quantityBefore"), "0");
  assert.equal(formatMovementBalance(misleadingTopLevel, "quantityAfter"), "1");
  assert.doesNotMatch(formatBalanceSrc, /quantityAfter\.minus|row\.qty/);
});

test("cero no se transforma en guion y null sí muestra guion", () => {
  assert.equal(formatMovementBalance(apiRow(0, 1), "quantityBefore"), "0");
  assert.equal(formatMovementBalance(apiRow("0", "1"), "quantityBefore"), "0");
  assert.notEqual(formatMovementBalance(apiRow(0, 1), "quantityBefore"), "—");
  assert.equal(formatMovementBalance(apiRow(null, "1"), "quantityBefore"), "—");
  assert.equal(formatMovementBalance(apiRow(undefined, "1"), "quantityBefore"), "—");
  assert.equal(formatMovementBalance(apiRow("", "1"), "quantityBefore"), "—");
  assert.equal(formatMovementBalance({ movement: {} }, "quantityBefore"), "—");
  assert.equal(formatMovementBalance({}, "quantityBefore"), "—");
  assert.equal(formatMovementBalance(apiRow("1", null), "quantityAfter"), "—");
});

test("conserva las demás columnas y no escribe inventario", () => {
  for (const label of ["Fecha", "Proyecto", "Lote", "Tipo", "Cantidad", "SKU / Código", "Producto", "Ubicación", "Usuario", "Referencia"]) {
    assert.match(movementColumns, new RegExp(`label:\\s*"${label}"`));
  }
  assert.doesNotMatch(html, /id="movementForm"/);
  assert.match(html, /id="inventoryOpsNavPanel"/);
  assert.match(html, /id="exportMovementsBtn"/);
  assert.match(html, /dashboard\.js\?v=85/);
  assert.match(loadMovements, /authenticatedFetch\(`\/api\/inventory\/movements/);
  assert.doesNotMatch(loadMovements, /method:\s*"POST"/i);
  assert.doesNotMatch(loadMovements, /method:\s*"PATCH"/i);
  assert.doesNotMatch(loadMovements, /method:\s*"PUT"/i);
  assert.doesNotMatch(loadMovements, /method:\s*"DELETE"/i);
  assert.doesNotMatch(formatBalanceSrc, /method:\s*"(POST|PATCH|PUT|DELETE)"/i);
  assert.match(inventoryRoutes, /inventoryRouter\.post\("\/movements"/);
  assert.match(js, /downloadExport\("\/api\/exports\/movements\.csv\?limit=20000"/);
});
