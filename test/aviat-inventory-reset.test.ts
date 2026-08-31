import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { HttpError } from "../src/shared/http-error.js";
import {
  PHYSICAL_RESET_CONFIRMATION,
  assertPhysicalResetFinalConfirmation
} from "../src/modules/inventory/physical-reset.service.js";

const html = readFileSync(new URL("../public/dashboard.html", import.meta.url), "utf8");
const js = readFileSync(new URL("../public/dashboard.js", import.meta.url), "utf8");
const routes = readFileSync(new URL("../src/modules/inventory/inventory.routes.ts", import.meta.url), "utf8");
const service = readFileSync(new URL("../src/modules/inventory/physical-reset.service.ts", import.meta.url), "utf8");
const envSrc = readFileSync(new URL("../src/config/env.ts", import.meta.url), "utf8");

test("ADMIN sin contexto no puede reiniciar: la ruta exige cliente operativo", () => {
  assert.match(routes, /inventoryRouter\.use\(requireOperationalClient\)/);
  assert.match(routes, /clientId: req\.auth!\.operationalClientId!/);
  assert.doesNotMatch(
    routes.slice(routes.indexOf('inventoryRouter.post("/physical/reset"')),
    /req\.body\?\.clientId|req\.query\.clientId|req\.headers/
  );
});

test("CLIENT, SUPERVISOR y OPERATOR no pueden reiniciar", () => {
  const preview = routes.slice(
    routes.indexOf('inventoryRouter.get("/physical/reset/preview"'),
    routes.indexOf('inventoryRouter.post("/physical/reset"')
  );
  const post = routes.slice(routes.indexOf('inventoryRouter.post("/physical/reset"'));
  assert.match(preview, /requireRole\(\["ADMIN"\]\)/);
  assert.match(post, /requireRole\(\["ADMIN"\]\)/);
  assert.doesNotMatch(preview, /SUPERVISOR|OPERATOR|CLIENT/);
  assert.match(js, /currentRole === "ADMIN" && isActiveAviatOperationalClient\(\)/);
});

test("frase incorrecta y confirmación final incompleta se rechazan", () => {
  assert.throws(
    () => assertPhysicalResetFinalConfirmation("BORRAR INVENTARIO", "BORRAR INVENTARIO"),
    HttpError
  );
  assert.throws(
    () => assertPhysicalResetFinalConfirmation(PHYSICAL_RESET_CONFIRMATION, "ok"),
    HttpError
  );
  assert.match(js, /physicalInventoryResetFinalAck/);
  assert.match(html, /Confirmo el borrado definitivo del inventario operativo de AVIAT/);
});

test("spoof de clientId en body/query se ignora", () => {
  const post = routes.slice(routes.indexOf('inventoryRouter.post("/physical/reset"'));
  assert.match(post, /clientId: z\.unknown\(\)\.optional\(\)/);
  assert.match(post, /void body\.clientId/);
  assert.match(service, /operationalClientId !== aviatId/);
  assert.match(service, /resolveUniqueAviatClientId/);
});

test("el reinicio es transaccional, idempotente y reporta conteos por entidad", () => {
  assert.match(service, /db\.\$transaction/);
  assert.match(service, /alreadyEmpty/);
  assert.match(service, /movementsPurged/);
  assert.match(service, /requisitionsPurged/);
  assert.match(service, /tasksPurged/);
  assert.match(service, /orphanProductsRetained/);
  assert.match(service, /legacyLogitec/);
  assert.match(service, /pg_try_advisory_xact_lock/);
  assert.match(service, /PHYSICAL_RESET_ADVISORY_LOCK_CLASS = 90429101/);
  assert.doesNotMatch(service, /pg_try_advisory_xact_lock\(72707369/);
  assert.doesNotMatch(service, /product\.deleteMany/);
  assert.match(js, /physicalInventoryResetBusy/);
  assert.match(js, /setPhysicalInventoryResetBusy\(true\)/);
});

test("el catálogo AVIAT conserva ProductProject y SKUs después del reset operativo", () => {
  assert.doesNotMatch(service, /productProject\.deleteMany/);
  assert.match(service, /inventory\.deleteMany/);
  assert.match(service, /inventorySerial\.deleteMany/);
  assert.match(service, /inventoryMovement\.deleteMany/);
  assert.match(service, /productProjectsPreserved/);
});

test("LOGITEC no es maestro válido: un legacy bloquea el reset y no se borra con customer.delete", () => {
  assert.match(service, /isCompanyProjectLabel/);
  assert.match(service, /FORBIDDEN_LEGACY_PROJECT_PRESENT/);
  assert.match(service, /assertNoForbiddenCompanyProjects/);
  assert.doesNotMatch(service, /customer\.delete/);
  assert.doesNotMatch(service, /retained: true/);
  assert.match(js, /isAviatResetBlocked/);
  assert.match(js, /Reset bloqueado/);
  assert.match(html, /proyectos válidos/);
  assert.doesNotMatch(html, /el proyecto LOGITEC si existe/);
});

test("cache-buster de dashboard.js se actualiza una sola vez a v=91", () => {
  const matches = [...html.matchAll(/dashboard\.js\?v=(\d+)/g)].map((row) => row[1]);
  assert.deepEqual(matches, ["91"]);
});

test("la migración de coherencia de movimientos admite FTS namespaced y el valor histórico", () => {
  const sql = readFileSync(
    new URL("../prisma/migrations/20260829040000_inventory_movement_assignment_coherence/migration.sql", import.meta.url),
    "utf8"
  );
  assert.match(sql, /InventoryMovement_to_assignment_check/);
  assert.match(sql, /FREE_TO_SALE:' \|\| "clientId"/);
  assert.match(sql, /"toAssignmentKey" = 'FREE_TO_SALE'/);
  assert.doesNotMatch(sql, /DELETE FROM "Inventory"/);
});

test("ImportBatch.clientId acota listado, alta y reinicio al cliente operativo", () => {
  const importRoutes = readFileSync(new URL("../src/modules/imports/imports.routes.ts", import.meta.url), "utf8");
  assert.match(importRoutes, /clientId: operationalClientId\(req\.auth!\)/);
  assert.match(importRoutes, /where: clientImportBatchWhere\(req\.auth!\)/);
  assert.match(importRoutes, /findFirst\(\{\s*where:\s*\{\s*id,\s*clientId\s*\}/);
  assert.doesNotMatch(importRoutes, /importBatch\.findUnique/);
  assert.match(service, /where: \{ clientId: aviatId \}/);
  assert.doesNotMatch(service, /createdBy: \{ OR: \[\{ clientId: aviatId \}, \{ role: "ADMIN" \}\] \}/);
  assert.doesNotMatch(service, /inventoryStock\.deleteMany/);
});

test("ALLOW_TENANT_INVENTORY_RESET queda documentado y en false por defecto", () => {
  assert.match(envSrc, /ALLOW_TENANT_INVENTORY_RESET/);
  assert.match(envSrc, /default\("false"\)/);
  assert.match(html, /ALLOW_TENANT_INVENTORY_RESET/);
});
