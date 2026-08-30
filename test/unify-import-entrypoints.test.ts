import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const html = readFileSync(new URL("../public/dashboard.html", import.meta.url), "utf8");
const js = readFileSync(new URL("../public/dashboard.js", import.meta.url), "utf8");
const inventoryRoutes = readFileSync(
  new URL("../src/modules/inventory/inventory.routes.ts", import.meta.url),
  "utf8"
);
const skuSearch = readFileSync(new URL("../src/modules/catalog/sku-search.service.ts", import.meta.url), "utf8");
const clientScope = readFileSync(new URL("../src/modules/clients/client-scope.ts", import.meta.url), "utf8");
const migrationMaster = readFileSync(
  new URL("../prisma/migrations/20260829010000_client_project_master_data/migration.sql", import.meta.url),
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
const configSlice = html.slice(html.indexOf('id="moduleConfig"'), html.indexOf("        </main>"));
const inventorySlice = html.slice(html.indexOf('id="moduleInventory"'), html.indexOf('id="moduleConfig"'));

test("el único acceso visible abre el asistente real en Existencias", () => {
  assert.match(
    html,
    /id="openInventoryImportBtn"[^>]*>Abrir asistente de importación</
  );
  assert.equal(countId(html, "openInventoryImportBtn"), 1);
  assert.doesNotMatch(html, /id="bulkInboundOpenImportBtn"/);
  assert.match(html, /id="importWizardPanel"/);
  assert.match(assistantFn, /navigateTo\(\s*"inventario"\s*,\s*"inventory"\s*\)/);
  assert.match(assistantFn, /getElementById\("importWizardPanel"\)/);
  assert.match(
    js,
    /getElementById\("openInventoryImportBtn"\)[\s\S]{0,220}openInventoryImportAssistant\(\)/
  );
  assert.doesNotMatch(assistantFn, /navigateTo\(\s*"sistema"\s*,\s*"config"\s*\)/);
});

test("ningún acceso visible abre el modal legado ni llama al endpoint deshabilitado", () => {
  assert.doesNotMatch(
    js,
    /getElementById\("openInventoryImportBtn"\)[\s\S]{0,260}openModal\("inventoryImportModal"\)/
  );
  assert.doesNotMatch(assistantFn, /openModal\("inventoryImportModal"\)/);
  assert.doesNotMatch(html, /id="inventoryImportModal"/);
  assert.doesNotMatch(js, /function runImport\(/);
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
  assert.doesNotMatch(applyRoleFn, /bulkInboundOpenImportBtn/);
  assert.match(applyRoleFn, /role !== "ADMIN"/);
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
  assert.match(assistantFn, /navigateTo\(\s*"inventario"\s*,\s*"inventory"\s*\)/);
});

test("el modal legado y su wiring fueron eliminados", () => {
  assert.doesNotMatch(html, /inventoryImportModal|id="importBtn"|id="importCsv"/);
  assert.doesNotMatch(js, /inventoryImportModal|runImport|\/api\/inventory\/import/);
});

test("la vista económica y el asistente único en Existencias se conservan", () => {
  assert.match(html, /dashboard\.js\?v=85/);
  assert.match(html, /id="sumStockTotal"/);
  assert.match(html, /id="sumStockCubes"/);
  assert.match(html, /js-economic-card/);
  assert.match(inventorySlice, /id="importWizardPanel"/);
  assert.doesNotMatch(configSlice, /id="importWizardPanel"/);
  assert.match(js, /canSeeEconomicValuation/);
});

test("Sistema no contiene el asistente y sí la zona de peligro de AVIAT", () => {
  assert.match(configSlice, /id="aviatDangerZone"/);
  assert.match(configSlice, /Zona de peligro/);
  assert.doesNotMatch(configSlice, /id="importStepper"/);
  assert.doesNotMatch(inventorySlice, /id="physicalInventoryResetImportBtn"/);
  assert.match(configSlice, /id="physicalInventoryResetImportBtn"/);
});

test("búsqueda operativa de SKU usa inventario u ownership de proyecto, no el catálogo global suelto", () => {
  assert.match(clientScope, /inventories: \{ some: \{ clientId \} \}/);
  assert.match(clientScope, /productProjects: \{ some: \{ active: true, project: \{ clientId \} \} \}/);
  assert.match(skuSearch, /clientProductWhere\(auth\)/);
  assert.doesNotMatch(skuSearch, /product\.customerId/);
});

test("la migración de master data crea AVIAT solo si Client está vacío y hay inventario", () => {
  assert.match(migrationMaster, /cl_aviat_official/);
  assert.match(migrationMaster, /WHERE NOT EXISTS \(SELECT 1 FROM "Client"\)/);
  assert.match(migrationMaster, /AND EXISTS \(SELECT 1 FROM "Inventory"\)/);
});
