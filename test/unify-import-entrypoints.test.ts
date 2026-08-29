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
  const from = source.lastIndexOf("\n", start) >= 0 ? source.lastIndexOf("\n", start) + 1 : start;
  const next = source.indexOf("\nfunction ", start + token.length);
  const nextAsync = source.indexOf("\nasync function ", start + token.length);
  const candidates = [next, nextAsync].filter((n) => n >= 0);
  const end = candidates.length ? Math.min(...candidates) : source.length;
  return source.slice(from, end);
}

function countId(source: string, id: string): number {
  return [...source.matchAll(new RegExp(`id="${id}"`, "g"))].length;
}

const assistantFn = sliceFunction(js, "openInventoryImportAssistant");
const roleFn = sliceFunction(js, "canAdministerInventoryImport");
const applyRoleFn = sliceFunction(js, "applyRoleNavigation");
const runImportFn = sliceFunction(js, "runImport");

test("ambos accesos visibles abren el mismo asistente real", () => {
  assert.match(
    html,
    /id="openInventoryImportBtn"[^>]*>Abrir asistente de importación</
  );
  assert.match(
    html,
    /id="bulkInboundOpenImportBtn"[^>]*>Abrir asistente de importación</
  );
  assert.match(html, /id="importWizardPanel"/);
  assert.match(js, /navigateTo\(\s*"sistema"\s*,\s*"config"\s*\)/);
  assert.match(assistantFn, /getElementById\("importWizardPanel"\)/);
  assert.match(
    js,
    /getElementById\("openInventoryImportBtn"\)[\s\S]{0,220}openInventoryImportAssistant\(\)/
  );
  assert.match(
    js,
    /getElementById\("bulkInboundOpenImportBtn"\)[\s\S]{0,180}openInventoryImportAssistant\(\)/
  );
});

test("ningún acceso visible abre el modal legado ni llama al endpoint deshabilitado", () => {
  assert.doesNotMatch(
    js,
    /getElementById\("openInventoryImportBtn"\)[\s\S]{0,260}openModal\("inventoryImportModal"\)/
  );
  assert.doesNotMatch(
    js,
    /getElementById\("bulkInboundOpenImportBtn"\)[\s\S]{0,400}openModal\("inventoryImportModal"\)/
  );
  assert.doesNotMatch(
    js,
    /getElementById\("bulkInboundOpenImportBtn"\)[\s\S]{0,400}classList\.add\("open"\)/
  );
  assert.doesNotMatch(assistantFn, /openModal\("inventoryImportModal"\)/);
  assert.match(assistantFn, /closeModal\("inventoryImportModal"\)/);
  assert.doesNotMatch(assistantFn, /\/api\/inventory\/import/);
  assert.doesNotMatch(assistantFn, /authenticatedFetch\(\s*["'`]\/api\/inventory\/import/);
});

test("no se duplica el asistente de importación", () => {
  assert.equal(countId(html, "importWizardPanel"), 1);
  assert.equal(countId(html, "importStepper"), 1);
  assert.equal(countId(html, "importFile"), 1);
  assert.equal(countId(html, "importUploadBtn"), 1);
  assert.equal(countId(html, "importConfirmBtn"), 1);
  const assistantDecls = [...js.matchAll(/function openInventoryImportAssistant\(/g)];
  assert.equal(assistantDecls.length, 1);
});

test("el endpoint antiguo continúa deshabilitado con 409 IMPORT_DISABLED", () => {
  assert.match(inventoryRoutes, /inventoryRouter\.post\(\s*"\/import"/);
  assert.match(inventoryRoutes, /code:\s*"IMPORT_DISABLED"/);
  assert.match(inventoryRoutes, /res\.status\(409\)\.json/);
  assert.match(inventoryRoutes, /requireRole\(\["ADMIN"\]\)/);
  assert.doesNotMatch(
    inventoryRoutes,
    /inventoryRouter\.post\(\s*"\/import"[\s\S]{0,400}executeImportBatch/
  );
});

test("OPERATOR, SUPERVISOR y CLIENT no reciben acceso administrativo a la importación", () => {
  assert.match(roleFn, /currentRole === "ADMIN"/);
  assert.match(assistantFn, /canAdministerInventoryImport\(\)/);
  assert.match(
    applyRoleFn,
    /openInvBtn\.style\.display = role === "ADMIN" \? "inline-block" : "none"/
  );
  assert.match(
    applyRoleFn,
    /bulkInboundOpenImportBtn\.style\.display = role === "ADMIN" \? "inline-block" : "none"/
  );
  assert.match(
    applyRoleFn,
    /importWizardPanel\.style\.display = role === "ADMIN" \? "" : "none"/
  );
  assert.doesNotMatch(roleFn, /SUPERVISOR/);
  assert.doesNotMatch(roleFn, /OPERATOR/);
  assert.doesNotMatch(roleFn, /CLIENT/);
});

test("abrir el asistente no escribe ni modifica inventario", () => {
  assert.doesNotMatch(assistantFn, /method:\s*"POST"/i);
  assert.doesNotMatch(assistantFn, /method:\s*"PATCH"/i);
  assert.doesNotMatch(assistantFn, /method:\s*"PUT"/i);
  assert.doesNotMatch(assistantFn, /method:\s*"DELETE"/i);
  assert.doesNotMatch(assistantFn, /\/api\/imports\/upload/);
  assert.doesNotMatch(assistantFn, /\/api\/imports\/[^"'`\n]*confirm/);
  assert.doesNotMatch(assistantFn, /physical\/reset/);
  assert.doesNotMatch(assistantFn, /mutateInventory/);
  assert.doesNotMatch(assistantFn, /importFile\.click/);
  assert.doesNotMatch(assistantFn, /importUploadBtn/);
  assert.doesNotMatch(assistantFn, /runImport\(/);
  assert.match(assistantFn, /navigateTo\(\s*"sistema"\s*,\s*"config"\s*\)/);
});

test("el modal legado ya no es el camino de los botones visibles", () => {
  assert.match(html, /id="inventoryImportModal"/);
  assert.match(runImportFn, /\/api\/inventory\/import/);
  assert.doesNotMatch(
    js,
    /openInventoryImportBtn[\s\S]{0,400}runImport/
  );
  assert.doesNotMatch(
    js,
    /bulkInboundOpenImportBtn[\s\S]{0,400}runImport/
  );
});

test("la vista económica v65 y el asistente de Configuración se conservan", () => {
  assert.match(html, /dashboard\.js\?v=80/);
  assert.match(html, /id="sumStockTotal"/);
  assert.match(html, /id="sumStockCubes"/);
  assert.match(html, /js-economic-card/);
  assert.match(html, /id="importWizardPanel"/);
  assert.match(js, /canSeeEconomicValuation/);
});
