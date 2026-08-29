import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const inventory = read("../src/modules/inventory/inventory.routes.ts");
const requisitions = read("../src/modules/requisitions/requisitions.routes.ts");
const requisitionService = read("../src/modules/requisitions/requisition.service.ts");
const catalog = read("../src/modules/catalog/catalog.routes.ts");
const tasks = read("../src/modules/tasks/tasks.routes.ts");
const incidents = read("../src/modules/incidents/incidents.routes.ts");
const comments = read("../src/modules/comments/comments.routes.ts");
const warehouses = read("../src/modules/master-data/warehouses.routes.ts");
const masterData = read("../src/modules/master-data/master-data.service.ts");

test("movimientos, precios, reubicación y reasignación validan el tenant autenticado", () => {
  assert.match(inventory, /const activeClientId = operationalClientId\(req\.auth!\)/);
  assert.match(inventory, /status: stockStatus, clientId: activeClientId/);
  assert.match(inventory, /clientId: body\.type === "IN" \? activeClientId : undefined/);
  assert.doesNotMatch(inventory, /clientId: body\.clientId === undefined/);
  assert.ok((inventory.match(/assertAccessibleInventory\(req\.auth!/g) || []).length >= 3);
  assert.ok((inventory.match(/assertAccessibleLayer\(req\.auth!/g) || []).length >= 6);
});

test("todas las mutaciones de requisición cargan primero la requisición accesible", () => {
  for (const route of ["submit", "approve", "cancel", "lines"]) {
    const start = requisitions.indexOf(`/:id/${route}`);
    assert.notEqual(start, -1);
    assert.match(requisitions.slice(start, start + 900), /loadAccessibleRequisition/);
  }
  assert.match(requisitions, /assertAccessibleInventory\(req\.auth!, body\.inventoryId/);
  assert.match(requisitions, /assertAccessibleLayer\(req\.auth!, body\.layerId/);
  assert.match(requisitions, /assertAccessibleRequisition\(req\.auth!, reservation\?\.requisitionLine\.requisition\)/);
  assert.match(requisitionService, /clientId: input\.clientId,\s*OR:/);
});

test("proyectos e importación de catálogo ignoran owner clientId del frontend", () => {
  assert.match(catalog, /clientId: req\.auth!\.operationalClientId!/);
  assert.match(catalog, /const ownerClientId = req\.auth!\.operationalClientId!/);
  assert.match(catalog, /code: customerCode, clientId: ownerClientId/);
  assert.match(catalog, /AND: \[\{ id \}, clientCustomerWhere\(req\.auth!\)\]/);
});

test("tareas, incidencias, comentarios y estadísticas persisten clientId", () => {
  assert.match(tasks, /clientId: activeClientId/);
  assert.match(tasks, /clientTaskWhere\(\{ \.\.\.req\.auth!/);
  assert.match(incidents, /clientId: operationalClientId\(req\.auth!\)/);
  assert.match(incidents, /clientId,\s*\.\.\.\(isElevated/);
  assert.match(comments, /clientId: operationalClientId\(req\.auth!\)/);
  assert.match(masterData, /where: \{ clientId, location: \{ warehouseId: warehouse\.id \}/);
  assert.match(warehouses, /warehouseOperationalStats\(prisma as never, row, operationalClientId\(req\.auth!\)\)/);
});
