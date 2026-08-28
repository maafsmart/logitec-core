import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const html = readFileSync(new URL("../public/dashboard.html", import.meta.url), "utf8");
const js = readFileSync(new URL("../public/dashboard.js", import.meta.url), "utf8");
const exportRoutes = readFileSync(new URL("../src/modules/exports/exports.routes.ts", import.meta.url), "utf8");
const inventoryRoutes = readFileSync(
  new URL("../src/modules/inventory/inventory.routes.ts", import.meta.url),
  "utf8"
);

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

const exportFn = sliceFunction(js, "exportMovementsCsv");
const downloadFn = sliceFunction(js, "downloadExport");

function sliceRoute(source: string, path: string): string {
  const start = source.indexOf(`exportsRouter.get("${path}"`);
  assert.ok(start >= 0, `missing route ${path}`);
  const next = source.indexOf("exportsRouter.get(", start + 10);
  return source.slice(start, next >= 0 ? next : source.length);
}

const movementsCsvRoute = sliceRoute(exportRoutes, "/movements.csv");

test("el botón de Existencias ya no utiliza limit=all", () => {
  assert.match(html, /id="exportMovementsBtn"[^>]*>Exportar movimientos CSV</);
  assert.match(
    js,
    /exportMovementsBtn\.addEventListener\("click",\s*\(\)\s*=>\s*void exportMovementsCsv\(\)\)/
  );
  assert.doesNotMatch(exportFn, /limit=all/);
  assert.doesNotMatch(js, /limit=all/);
  assert.doesNotMatch(exportFn, /\/api\/inventory\/movements/);
});

test("utiliza la exportación canónica /api/exports/movements.csv", () => {
  assert.match(exportFn, /\/api\/exports\/movements\.csv/);
  assert.match(exportFn, /downloadExport\(/);
  assert.match(exportFn, /logitec_movimientos\.csv/);
  assert.doesNotMatch(exportFn, /projectId/);
  assert.doesNotMatch(exportFn, /assignmentType/);
  assert.doesNotMatch(exportFn, /inventoryScopeQueryString/);
  assert.match(js, /downloadExport\("\/api\/exports\/movements\.csv",\s*"movements\.csv"\)/);
});

test("la exportación canónica no se limita a 100 movimientos", () => {
  assert.match(exportFn, /limit=20000/);
  assert.match(movementsCsvRoute, /max\(20000\)/);
  assert.match(movementsCsvRoute, /default\(5000\)/);
  assert.match(movementsCsvRoute, /take:\s*query\.limit/);
  assert.doesNotMatch(movementsCsvRoute, /\.max\(100\)/);
  assert.match(inventoryRoutes, /inventoryRouter\.get\(\s*"\/movements"/);
  assert.match(inventoryRoutes, /max\(100\)\.default\(50\)/);
  assert.doesNotMatch(exportFn, /\/api\/inventory\/movements/);
});

test("entrega CSV válido con encabezados y BOM compatible con Excel", () => {
  assert.match(exportRoutes, /return `\\uFEFF\$\{lines\.join\("\\r\\n"\)\}`/);
  assert.match(
    movementsCsvRoute,
    /\["fecha", "cliente", "proyecto", "sku", "tipo", "qty", "antes", "despues", "origen", "destino", "estado", "lote", "usuario", "requisicion", "referencia"\]/
  );
  assert.match(movementsCsvRoute, /Content-Type", "text\/csv; charset=utf-8"/);
  assert.match(movementsCsvRoute, /exportsRouter\.get\(\s*"\/movements\.csv"/);
  assert.match(movementsCsvRoute, /method:\s*"GET"|exportsRouter\.get/);
});

test("sesión expirada y errores no descargan un archivo corrupto", () => {
  assert.match(downloadFn, /Sesión expirada/);
  assert.match(downloadFn, /No se pudo completar la exportación/);
  assert.match(downloadFn, /if \(!response\)/);
  assert.match(downloadFn, /if \(!response\.ok\)/);
  assert.match(downloadFn, /blob\.size === 0/);
  const blobIdx = downloadFn.indexOf("response.blob()");
  const okIdx = downloadFn.indexOf("if (!response.ok)");
  const createIdx = downloadFn.indexOf("createObjectURL");
  assert.ok(okIdx >= 0 && blobIdx > okIdx, "solo lee el cuerpo si la respuesta es OK");
  assert.ok(createIdx > blobIdx, "no crea el enlace de descarga antes del blob");
});

test("la exportación de movimientos es de solo lectura", () => {
  assert.doesNotMatch(exportFn, /method:\s*"POST"/i);
  assert.doesNotMatch(exportFn, /method:\s*"PATCH"/i);
  assert.doesNotMatch(exportFn, /method:\s*"PUT"/i);
  assert.doesNotMatch(exportFn, /method:\s*"DELETE"/i);
  assert.doesNotMatch(downloadFn, /method:\s*"POST"/i);
  assert.doesNotMatch(downloadFn, /method:\s*"PATCH"/i);
  assert.doesNotMatch(downloadFn, /method:\s*"PUT"/i);
  assert.doesNotMatch(downloadFn, /method:\s*"DELETE"/i);
  assert.match(movementsCsvRoute, /exportsRouter\.get\(\s*"\/movements\.csv"/);
  assert.doesNotMatch(exportFn, /mutateInventory/);
  assert.doesNotMatch(exportFn, /physical\/reset/);
  assert.doesNotMatch(exportFn, /\/api\/imports/);
});

test("no cambia visibilidad de roles ni el Excel económico", () => {
  assert.match(
    movementsCsvRoute,
    /requireRole\(\["ADMIN", "SUPERVISOR", "OPERATOR", "CLIENT"\]\)/
  );
  assert.match(js, /canExportInventory = role === "ADMIN" \|\| role === "OPERATOR" \|\| role === "SUPERVISOR"/);
  assert.match(js, /exportMovementsBtn\.style\.display = canExportInventory/);
  assert.match(js, /downloadExport\("\/api\/exports\/inventory\.xlsx",\s*"inventory\.xlsx"\)/);
  assert.match(js, /canSeeEconomicValuation/);
  assert.match(html, /dashboard\.js\?v=65/);
  assert.match(html, /id="openInventoryImportBtn"[^>]*>Abrir asistente de importación</);
  assert.match(js, /function openInventoryImportAssistant\(/);
});
