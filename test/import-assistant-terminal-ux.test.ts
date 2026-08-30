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
  assert.match(html, /<div class="card-panel hidden" id="importWizardPanel" style="display:none"/);
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
  const badgeCss = html.slice(html.indexOf(".import-stat-badge {"), html.indexOf(".import-stat-badge--blocked"));
  assert.match(badgeCss, /cursor: default/);
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

test("tenant foráneo no puede confirmar import ajena (ruta protegida por clientId)", () => {
  assert.match(confirmBlock, /clientId: operationalClientId\(req\.auth!\)/);
  assert.match(importsRoutes, /operationalClientId\(req\.auth!\)/);
});

test("QA-13: XLSX multi-hoja no auto-selecciona sheets[0]", () => {
  assert.match(js, /function isMultiSheetImportUpload/);
  assert.match(js, /IMPORT_SHEET_PLACEHOLDER/);
  assert.match(sliceFunction(js, "renderImportSheetSelectOptions"), /includePlaceholder/);
  assert.match(sliceFunction(js, "suggestImportSheet"), /inventario/);
  const uploadStart = js.indexOf('document.getElementById("importUploadBtn")?.addEventListener("click"');
  assert.ok(uploadStart >= 0, "missing import upload handler");
  const uploadBlock = js.slice(uploadStart, uploadStart + 3500);
  assert.doesNotMatch(uploadBlock, /\|\|\s*sheets\[0\]/);
  assert.match(uploadBlock, /else if \(sheets\.length === 1\)[\s\S]{0,160}applyImportSheetSelection\(sheets\[0\]\.name/);
  assert.match(uploadBlock, /isMultiSheetImportUpload/);
  assert.match(uploadBlock, /applyImportSheetSelection/);
});

test("QA-14: RECONCILE queda como vista previa secundaria no confirmable", () => {
  assert.match(html, /Carga de inventario/);
  assert.match(html, /importReconcilePreviewToggle/);
  assert.match(html, /Vista previa de conciliación \(NO modifica inventario\)/);
  assert.doesNotMatch(html, /RECONCILE \/ conciliación/);
  assert.match(sliceFunction(js, "syncImportWizardUi"), /No aplica — vista previa únicamente/);
  assert.match(sliceFunction(js, "getImportInventoryModeValue"), /importReconcilePreviewToggle/);
});

test("QA-09/12: PRODUCT_PROJECT_LINK_REQUIRED es informativo sin Corregir todos", () => {
  assert.match(js, /PRODUCT_PROJECT_LINK_REQUIRED/);
  assert.match(sliceFunction(js, "importReviewGroupActionCell"), /vínculos producto-proyecto al confirmar/);
  assert.match(sliceFunction(js, "renderImportReviewFromState"), /Informativos/);
  assert.match(sliceFunction(js, "renderImportReviewFromState"), /actionableGroups/);
  assert.doesNotMatch(sliceFunction(js, "renderImportReviewFromState"), /Corregir todos[\s\S]{0,120}PRODUCT_PROJECT_LINK/);
});

test("QA-16: Existencias no incluye panel duplicado de Operación", () => {
  const inventory = html.slice(html.indexOf('id="moduleInventory"'), html.indexOf('id="moduleCatalog"'));
  assert.doesNotMatch(inventory, /id="inventoryOpsNavPanel"/);
});

test("Entrada masiva navega al mismo asistente en Existencias", () => {
  assert.match(sliceFunction(js, "navigateTo"), /mod === "bulk-inbound"/);
  assert.match(sliceFunction(js, "navigateTo"), /mod = "inventory"/);
  assert.doesNotMatch(html, /id="bulkInboundOpenImportBtn"/);
  assert.match(html, /id="openInventoryImportBtn"/);
});

test("reset UX distingue eliminado vs estado actual y bloquea inventario en cero", () => {
  assert.match(sliceFunction(js, "isAviatOperationalInventoryEmpty"), /counts\.inventories/);
  assert.match(sliceFunction(js, "syncAviatDangerZone"), /Inventario ya está en cero/);
  assert.match(sliceFunction(js, "formatPhysicalResetPurgedSummary"), /Se eliminaron:/);
  assert.match(sliceFunction(js, "formatPhysicalResetCurrentSummary"), /Estado actual:/);
  assert.match(sliceFunction(js, "renderAviatResetCounts"), /mode === "purge" \? "Se eliminarán" : "Estado actual"/);
});

test("KPI Productos muestra etiqueta según scope", () => {
  assert.match(html, /id="sumProductsLabel"/);
  assert.match(sliceFunction(js, "updateInventorySummary"), /Productos con existencia/);
  assert.match(sliceFunction(js, "updateInventorySummary"), /Productos en catálogo/);
});
