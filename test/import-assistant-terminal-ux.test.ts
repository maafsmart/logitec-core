import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const html = readFileSync(new URL("../public/dashboard.html", import.meta.url), "utf8");
const js = readFileSync(new URL("../public/dashboard.js", import.meta.url), "utf8");
const importsRoutes = readFileSync(new URL("../src/modules/imports/imports.routes.ts", import.meta.url), "utf8");
const importResume = readFileSync(new URL("../src/modules/imports/import-resume.service.ts", import.meta.url), "utf8");
const inventoryRoutes = readFileSync(new URL("../src/modules/inventory/inventory.routes.ts", import.meta.url), "utf8");
const inventoryScope = readFileSync(new URL("../src/modules/inventory/inventory-scope.ts", import.meta.url), "utf8");

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

const confirmBlock = importsRoutes.slice(importsRoutes.indexOf('importsRouter.post("/:id/confirm"'));

test("importWizardPanel inicia cerrado y solo ADMIN lo abre", () => {
  assert.match(html, /id="importWizardPanel"[^>]*class="[^"]*hidden[^"]*"[^>]*style="display:none"/);
  assert.match(html, /id="openInventoryImportBtn"/);
  assert.match(sliceFunction(js, "openInventoryImportAssistant"), /canAdministerInventoryImport\(\)/);
  assert.match(sliceFunction(js, "applyRoleNavigation"), /importWizardPanel\.style\.display = "none"/);
  assert.match(sliceFunction(js, "applyRoleNavigation"), /importWizardPanel\.classList\.add\("hidden"\)/);
});

test("COMPLETED cierra el wizard, limpia sesión y vuelve a scope Todas", () => {
  assert.match(js, /function finishImportWizardAfterCompleted/);
  assert.match(js, /finishImportWizardAfterCompleted\(/);
  assert.match(sliceFunction(js, "finishImportWizardAfterCompleted"), /closeImportWizardPanel\(\)/);
  assert.match(sliceFunction(js, "finishImportWizardAfterCompleted"), /dismissImportWizardSession/);
  assert.match(sliceFunction(js, "finishImportWizardAfterCompleted"), /returnInventoryToTotalScopeAfterImport/);
  assert.match(sliceFunction(js, "returnInventoryToTotalScopeAfterImport"), /assignmentType: ""/);
});

test("CANCELLED cierra el wizard sin borrar historial del servidor", () => {
  assert.match(sliceFunction(js, "submitImportCancel"), /\/api\/imports\/\$\{id\}\/cancel/);
  assert.match(sliceFunction(js, "submitImportCancel"), /closeImportWizardPanel\(\)/);
  assert.match(sliceFunction(js, "submitImportCancel"), /refreshImportHistory\(\)/);
  assert.doesNotMatch(sliceFunction(js, "submitImportCancel"), /\/api\/imports\/\$\{id\}\/confirm/);
});

test("lotes terminales no se rehidratan como sesión activa del wizard", () => {
  assert.match(sliceFunction(js, "applyImportServerState"), /isTerminalImportUiBatch\(state\.status\)/);
  assert.match(importResume, /RESUMABLE_IMPORT_STATUSES.*UPLOADED.*MAPPED.*VALIDATED.*READY.*PROCESSING/s);
  assert.doesNotMatch(importResume, /RESUMABLE_IMPORT_STATUSES[\s\S]{0,120}COMPLETED/);
  assert.match(importsRoutes, /status: \{ in: \[\.\.\.RESUMABLE_IMPORT_STATUSES\] \}/);
});

test("Cerrar asistente es distinto de cancelar importación", () => {
  assert.match(html, /id="importCloseWizardBtn"/);
  assert.match(html, /id="importCloseWizardInnerBtn"/);
  assert.match(sliceFunction(js, "closeImportWizardUiOnly"), /closeImportWizardPanel\(\)/);
  assert.doesNotMatch(sliceFunction(js, "closeImportWizardUiOnly"), /\/cancel/);
  assert.match(sliceFunction(js, "closeImportWizardUiOnly"), /importResumeDismissedId/);
});

test("etapas completadas deshabilitan controles hasta cambio upstream", () => {
  const syncFn = sliceFunction(js, "syncImportWizardUi");
  assert.match(syncFn, /label: "✓ Archivo cargado"/);
  assert.match(syncFn, /label: "✓ Mapeo aplicado"/);
  assert.match(syncFn, /label: "✓ Validado"/);
  assert.match(syncFn, /label: "✓ Revisión sincronizada"/);
  assert.match(syncFn, /label: "✓ Confirmado"/);
});

test("contadores de revisión no usan project-chip clickeable", () => {
  assert.match(sliceFunction(js, "renderImportReviewFromState"), /importStatBadge\(/);
  assert.doesNotMatch(sliceFunction(js, "renderImportReviewFromState"), /class="project-chip"/);
  assert.match(sliceFunction(js, "renderImportValidateSummary"), /importStatBadge\(/);
  assert.doesNotMatch(sliceFunction(js, "renderImportValidateSummary"), /class="project-chip"/);
  assert.match(html, /\.import-stat-badge[\s\S]{0,80}cursor: default/);
});

test("advertencias se presentan aparte de bloqueados", () => {
  assert.match(sliceFunction(js, "renderImportValidateSummary"), /no bloquean la confirmación/);
  assert.match(sliceFunction(js, "renderImportReviewFromState"), /Advertencias/);
  assert.match(sliceFunction(js, "renderImportReviewFromState"), /Bloqueados/);
});

test("scope Todas vs Free to Sale vs Con proyecto", () => {
  assert.match(inventoryScope, /assignmentType === "FREE_TO_SALE"/);
  assert.match(inventoryScope, /assignmentType === "PROJECT"/);
  assert.match(sliceFunction(js, "inventoryScopeQueryString"), /params\.set\("assignmentType", scope\.assignmentType\)/);
  assert.match(sliceFunction(js, "fillInventoryProjectSelects"), /aria-pressed/);
  assert.match(sliceFunction(js, "finishImportWizardAfterCompleted"), /returnInventoryToTotalScopeAfterImport/);
});

test("doble confirmación queda bloqueada por claim atómico del backend", () => {
  assert.match(confirmBlock, /updateMany\(/);
  assert.match(confirmBlock, /status: \{ in: \["READY", "VALIDATED"\] \}/);
  assert.match(confirmBlock, /claimed\.count !== 1/);
  assert.match(importResume, /assertImportBatchMutable/);
  assert.match(importResume, /status === "COMPLETED"/);
});

test("KPI Productos: catálogo vs productos con existencia", () => {
  assert.match(inventoryRoutes, /distinctInventoryProducts/);
  assert.match(inventoryRoutes, /catalogProducts/);
  assert.match(
    inventoryRoutes,
    /products: hasInventoryScope\(scope\) \? distinctInventoryProducts : catalogProducts/
  );
  assert.match(sliceFunction(js, "updateInventorySummary"), /hasActiveInventoryScope\(\)/);
});

test("tenant foráneo no puede confirmar import ajena (ruta protegida por clientId)", () => {
  assert.match(confirmBlock, /clientId: operationalClientId\(req\.auth!\)/);
  assert.match(importsRoutes, /operationalClientId\(req\.auth!\)/);
});
