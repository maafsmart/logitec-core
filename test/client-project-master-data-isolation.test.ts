import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { HttpError } from "../src/shared/http-error.js";
import {
  clientActivityWhere,
  clientCustomerWhere,
  clientInventoryWhere,
  clientMovementWhere,
  clientProductWhere,
  clientRequisitionWhere,
  clientScanWhere,
  clientSerialWhere,
  clientTaskWhere,
  effectiveRequestedClientId
} from "../src/modules/clients/client-scope.js";
import {
  MASTER_DEACTIVATE_CODES,
  createClientRecord,
  createLocationRecord,
  createProjectRecord,
  createWarehouseRecord,
  setLocationActive,
  setProjectActive,
  updateProjectRecord,
  updateWarehouseRecord
} from "../src/modules/master-data/master-data.service.js";

const html = readFileSync(new URL("../public/dashboard.html", import.meta.url), "utf8");
const js = readFileSync(new URL("../public/dashboard.js", import.meta.url), "utf8");
const clientScopeSrc = readFileSync(new URL("../src/modules/clients/client-scope.ts", import.meta.url), "utf8");
const catalogSrc = readFileSync(new URL("../src/modules/catalog/catalog.routes.ts", import.meta.url), "utf8");
const clientsSrc = readFileSync(new URL("../src/modules/clients/clients.routes.ts", import.meta.url), "utf8");
const inventorySrc = readFileSync(new URL("../src/modules/inventory/inventory.routes.ts", import.meta.url), "utf8");
const requisitionsSrc = readFileSync(new URL("../src/modules/requisitions/requisitions.routes.ts", import.meta.url), "utf8");
const pickingSrc = readFileSync(new URL("../src/modules/picking/picking.routes.ts", import.meta.url), "utf8");
const tasksSrc = readFileSync(new URL("../src/modules/tasks/tasks.routes.ts", import.meta.url), "utf8");
const exportsSrc = readFileSync(new URL("../src/modules/exports/exports.routes.ts", import.meta.url), "utf8");
const appSrc = readFileSync(new URL("../src/app.ts", import.meta.url), "utf8");
const usersSrc = readFileSync(new URL("../src/modules/users/users.routes.ts", import.meta.url), "utf8");
const skuSearchSrc = readFileSync(new URL("../src/modules/catalog/sku-search.service.ts", import.meta.url), "utf8");

const aviatAuth = { role: "CLIENT" as const, clientId: "client-aviat" };
const client2Auth = { role: "CLIENT" as const, clientId: "client-2" };
const adminAuth = { role: "ADMIN" as const, clientId: null };

function makeDb() {
  const clients: any[] = [];
  const customers: any[] = [];
  const warehouses: any[] = [];
  const locations: any[] = [];
  let inventoryCount = 0;
  let reservationCount = 0;
  let requisitionCount = 0;
  let taskCount = 0;
  let layerCount = 0;
  let movementCount = 0;
  let activityCount = 0;
  const id = (prefix: string) => `${prefix}_${Math.random().toString(36).slice(2, 8)}`;
  const db = {
    _setInventory(n: number) {
      inventoryCount = n;
    },
    _setReservations(n: number) {
      reservationCount = n;
    },
    _setLayers(n: number) {
      layerCount = n;
    },
    _setMovements(n: number) {
      movementCount = n;
    },
    _setActivity(n: number) {
      activityCount = n;
    },
    client: {
      findUnique: async ({ where }: any) =>
        clients.find((row) => row.id === where.id || row.code === where.code) || null,
      create: async ({ data }: any) => {
        const row = { id: id("cli"), active: true, ...data };
        clients.push(row);
        return row;
      },
      update: async ({ where, data }: any) => {
        const row = clients.find((item) => item.id === where.id);
        Object.assign(row, data);
        return row;
      }
    },
    customer: {
      findUnique: async ({ where }: any) =>
        customers.find((row) => row.id === where.id || row.code === where.code) || null,
      findMany: async ({ where }: any) =>
        customers.filter((row) => !where?.clientId || row.clientId === where.clientId),
      create: async ({ data }: any) => {
        const row = { id: id("prj"), active: true, ...data, client: clients.find((c) => c.id === data.clientId) || null };
        customers.push(row);
        return row;
      },
      update: async ({ where, data }: any) => {
        const row = customers.find((item) => item.id === where.id);
        Object.assign(row, data);
        row.client = clients.find((c) => c.id === row.clientId) || row.client;
        return row;
      },
      count: async ({ where }: any) => customers.filter((row) => row.clientId === where.clientId && (where.active == null || row.active === where.active)).length
    },
    warehouse: {
      findUnique: async ({ where }: any) =>
        warehouses.find((row) => row.id === where.id || row.code === where.code) || null,
      create: async ({ data }: any) => {
        const row = { id: id("wh"), active: true, ...data };
        warehouses.push(row);
        return row;
      },
      update: async ({ where, data }: any) => {
        const row = warehouses.find((item) => item.id === where.id);
        Object.assign(row, data);
        return row;
      }
    },
    location: {
      findUnique: async ({ where }: any) =>
        locations.find((row) => row.id === where.id || row.code === where.code) || null,
      findFirst: async ({ where }: any) =>
        locations.find((row) => {
          if (where?.AND) {
            const parts = Array.isArray(where.AND) ? where.AND : [where.AND];
            const combined = Object.assign({}, ...parts);
            if (combined.warehouseId && combined.code) {
              if (combined.id?.not && row.id === combined.id.not) return false;
              return row.warehouseId === combined.warehouseId && row.code === combined.code;
            }
          }
          if (where?.warehouseId && where?.code) {
            if (where.id?.not && row.id === where.id.not) return false;
            return row.warehouseId === where.warehouseId && row.code === where.code;
          }
          if (where?.OR) {
            return where.OR.some(
              (clause: any) =>
                clause.warehouseId && clause.code && row.warehouseId === clause.warehouseId && row.code === clause.code
            );
          }
          if (where?.id) return row.id === where.id;
          return false;
        }) || null,
      create: async ({ data }: any) => {
        const row = { id: id("loc"), active: true, ...data };
        locations.push(row);
        return row;
      },
      update: async ({ where, data }: any) => {
        const row = locations.find((item) => item.id === where.id);
        Object.assign(row, data);
        return row;
      },
      count: async () => locations.length
    },
    inventory: {
      count: async () => inventoryCount,
      aggregate: async () => ({ _sum: { qty: null, reservedQty: null } })
    },
    inventoryReservation: { count: async () => reservationCount },
    requisition: { count: async () => requisitionCount },
    task: { count: async () => taskCount },
    product: { count: async () => 0 },
    productProject: { count: async () => 0 },
    inventoryMovement: { count: async () => movementCount },
    inventoryLayer: { count: async () => layerCount },
    activityLog: { count: async () => activityCount }
  };
  return db;
}

test("CLIENT no autoriza inventario ni movimientos con product.customer", () => {
  assert.doesNotMatch(clientScopeSrc, /product:\s*\{\s*customer:\s*\{\s*clientId/);
  const productWhere = JSON.stringify(clientProductWhere(aviatAuth));
  const movementWhere = JSON.stringify(clientMovementWhere(aviatAuth));
  const inventoryWhere = JSON.stringify(clientInventoryWhere(aviatAuth));
  assert.equal(productWhere.includes('"customer":{"clientId"'), false);
  assert.equal(movementWhere.includes('"customer":{"clientId"'), false);
  assert.deepEqual(clientInventoryWhere(aviatAuth), { clientId: "client-aviat" });
  assert.equal(inventoryWhere.includes("assignmentType"), false);
  assert.deepEqual(clientCustomerWhere(aviatAuth), { clientId: "client-aviat" });
  assert.deepEqual(clientRequisitionWhere(aviatAuth), { project: { clientId: "client-aviat" } });
  assert.ok(Array.isArray(clientTaskWhere(aviatAuth).OR));
  assert.deepEqual(clientScanWhere(aviatAuth), { clientId: "client-aviat" });
  assert.deepEqual(clientSerialWhere(aviatAuth), { clientId: "client-aviat" });
  assert.deepEqual(clientActivityWhere(aviatAuth), { clientId: "client-aviat" });
});

test("cambiar clientId en query no amplía el alcance CLIENT", () => {
  assert.equal(effectiveRequestedClientId(aviatAuth, "client-2"), undefined);
  assert.equal(effectiveRequestedClientId(aviatAuth, "client-aviat"), undefined);
  assert.equal(effectiveRequestedClientId(adminAuth, "client-2"), undefined);
  const adminAviat = { role: "ADMIN" as const, clientId: null, operationalClientId: "client-2" };
  const adminFilter = JSON.stringify(clientMovementWhere(adminAviat));
  assert.equal(adminFilter.includes('"customer":{"clientId"'), false);
  assert.match(adminFilter, /"clientId":"client-2"/);
});

test("un projectId ajeno no coincide con el where CLIENT", () => {
  const aviat = clientInventoryWhere(aviatAuth);
  const other = clientInventoryWhere(client2Auth);
  assert.notDeepEqual(aviat, other);
  assert.deepEqual(clientCustomerWhere(aviatAuth).clientId, "client-aviat");
  assert.deepEqual(clientCustomerWhere(client2Auth).clientId, "client-2");
});

test("relaciones Cliente → Proyectos quedan aisladas", async () => {
  const db = makeDb();
  const aviat = await createClientRecord(db as never, { code: "AVIAT", name: "AVIAT" });
  const client2 = await createClientRecord(db as never, { code: "CLI2", name: "Cliente 2" });
  const p2a = await createProjectRecord(db as never, { clientId: client2.id, code: "P2A", name: "Proyecto 2A" });
  const p2b = await createProjectRecord(db as never, { clientId: client2.id, code: "P2B", name: "Proyecto 2B" });
  const att = await createProjectRecord(db as never, { clientId: aviat.id, code: "ATT", name: "AT&T Comunicaciones Digitales" });
  const aviatProjects = await db.customer.findMany({ where: { clientId: aviat.id } });
  const client2Projects = await db.customer.findMany({ where: { clientId: client2.id } });
  assert.equal(aviatProjects.some((row) => row.id === p2a.id || row.id === p2b.id), false);
  assert.equal(client2Projects.some((row) => row.id === att.id), false);
  assert.equal(client2Projects.map((row) => row.code).sort().join(","), "P2A,P2B");
});

test("proyecto sin cliente y código duplicado se rechazan", async () => {
  const db = makeDb();
  const client2 = await createClientRecord(db as never, { code: "CLI2", name: "Cliente 2" });
  await assert.rejects(
    () => createProjectRecord(db as never, { clientId: "", code: "P2A", name: "Proyecto 2A" }),
    (error: unknown) => error instanceof HttpError && error.statusCode === 400 && error.code === MASTER_DEACTIVATE_CODES.PROJECT_CLIENT_REQUIRED
  );
  await createProjectRecord(db as never, { clientId: client2.id, code: "P2A", name: "Proyecto 2A" });
  await assert.rejects(
    () => createProjectRecord(db as never, { clientId: client2.id, code: "P2A", name: "Otro" }),
    (error: unknown) => error instanceof HttpError && error.statusCode === 409 && error.code === MASTER_DEACTIVATE_CODES.DUPLICATE_CODE
  );
  await assert.rejects(
    () => createClientRecord(db as never, { code: "LOGITEC", name: "LOGITEC" }),
    (error: unknown) => error instanceof HttpError && error.code === MASTER_DEACTIVATE_CODES.FORBIDDEN_MASTER_LABEL
  );
});

test("catálogos de almacén y ubicación, duplicado y bloqueo con inventario", async () => {
  const db = makeDb();
  const warehouse = await createWarehouseRecord(db as never, { code: "TULTITLAN24", name: "Tultitlán 24" });
  assert.equal(warehouse.code, "TULTITLAN24");
  const location = await createLocationRecord(db as never, { warehouse: "TULTITLAN24", code: "AN22-A", description: "Pasillo A" });
  assert.equal(location.code, "AN22-A");
  await assert.rejects(
    () => createLocationRecord(db as never, { warehouse: "TULTITLAN24", code: "AN22-A" }),
    (error: unknown) => error instanceof HttpError && error.code === MASTER_DEACTIVATE_CODES.DUPLICATE_CODE
  );
  const warehouseB = await createWarehouseRecord(db as never, { code: "TULTITLAN25", name: "Tultitlán 25" });
  const locationB = await createLocationRecord(db as never, { warehouse: "TULTITLAN25", code: "AN22-A" });
  assert.equal(locationB.code, "AN22-A");
  assert.equal(locationB.warehouseId, warehouseB.id);
  assert.notEqual(locationB.warehouseId, location.warehouseId);
  db._setInventory(4);
  await assert.rejects(
    () => setLocationActive(db as never, location.id, false),
    (error: unknown) => error instanceof HttpError && error.statusCode === 409 && error.code === MASTER_DEACTIVATE_CODES.HAS_PHYSICAL_INVENTORY
  );
  db._setInventory(0);
  db._setReservations(2);
  const projectClient = await createClientRecord(db as never, { code: "CLI3", name: "Cliente 3" });
  const project = await createProjectRecord(db as never, { clientId: projectClient.id, code: "P3A", name: "Proyecto 3A" });
  await assert.rejects(
    () => setProjectActive(db as never, project.id, false),
    (error: unknown) => error instanceof HttpError && error.statusCode === 409 && error.code === MASTER_DEACTIVATE_CODES.HAS_ACTIVE_RESERVATIONS
  );
});

test("rutas CLIENT auditadas quedan protegidas en servidor", () => {
  assert.match(inventorySrc, /clientInventoryWhere/);
  assert.match(inventorySrc, /requireOperationalClient/);
  assert.doesNotMatch(inventorySrc, /product:\s*\{\s*customer:\s*\{\s*clientId: query\.clientId/);
  assert.match(catalogSrc, /createProjectRecord/);
  assert.match(catalogSrc, /clientCustomerWhere/);
  assert.match(clientsSrc, /isClientScopedRole/);
  assert.match(requisitionsSrc, /CLIENT/);
  assert.match(requisitionsSrc, /clientRequisitionWhere/);
  assert.match(requisitionsSrc, /assertAccessibleRequisition/);
  assert.match(pickingSrc, /requireRole\(\["ADMIN", "OPERATOR", "SUPERVISOR", "CLIENT"\]\)/);
  assert.match(pickingSrc, /clientScanWhere/);
  assert.match(tasksSrc, /clientTaskWhere/);
  assert.match(exportsSrc, /scopedInventoryWhere/);
  assert.match(exportsSrc, /scopedMovementWhere/);
  assert.match(exportsSrc, /clientProductWhere/);
  assert.match(appSrc, /\/api\/warehouses/);
  assert.match(usersSrc, /requieren un cliente asignado/);
  assert.match(skuSearchSrc, /operationalClientId\(auth\)/);
  assert.match(catalogSrc, /PHYSICAL_DELETE_DISABLED/);
});

test("Crear producto manual no crea inventario ficticio", () => {
  const start = catalogSrc.indexOf('catalogRouter.post("/products"');
  const end = catalogSrc.indexOf("res.status(201).json(product)", start);
  const block = catalogSrc.slice(start, end);
  assert.match(block, /prisma\.product\.create/);
  assert.doesNotMatch(block, /prisma\.inventory\.create/);
  assert.doesNotMatch(block, /qty:\s*1/);
});

test("frontend Clientes, catálogos y cache-buster v=82", () => {
  assert.match(html, /dashboard\.js\?v=82/);
  assert.doesNotMatch(html, /dashboard\.js\?v=81/);
  assert.match(html, /id="btnClients"/);
  assert.match(html, /data-inv-master-tab="clients"/);
  assert.match(html, /id="clientsAddBtn"/);
  assert.match(html, /id="warehousesAddBtn"/);
  assert.match(html, /id="locationsAddBtn"/);
  assert.match(html, /id="locationsSearch"/);
  assert.match(html, /id="newClientId"/);
  assert.match(html, /id="masterDataModal"/);
  assert.match(html, /id="inboundClientField"/);
  assert.match(html, /class="js-inventory-client-select"/);
  assert.match(html, /id="clientContextGate"/);
  assert.match(html, /Seleccionar cliente/);
  assert.match(js, /CLIENT: "inventory"/);
  assert.match(js, /openClientForm/);
  assert.match(js, /openProjectForm/);
  assert.match(js, /loadWarehousesModule/);
  assert.match(js, /loadLocationsModule/);
  assert.match(js, /Todos los proyectos de mi cliente/);
  assert.match(js, /SUPERVISOR, OPERATOR y CLIENT requieren un cliente asignado/);
  assert.match(js, /owningClientDisplayName/);
  assert.match(js, /inboundSelectedOwnerClientId/);
  assert.match(js, /payload\.clientId = inboundSelectedOwnerClientId/);
  assert.match(js, /clientContextEpoch/);
  assert.match(js, /clearOperationalClientState/);
  assert.doesNotMatch(js, /btn\.style\.display = role === "CLIENT" \? "none"/);
  assert.doesNotMatch(js, /Todos los clientes/);
});

test("cambiar cliente de proyecto con historial queda bloqueado", async () => {
  const db = makeDb();
  const aviat = await createClientRecord(db as never, { code: "AVIAT", name: "AVIAT" });
  const client2 = await createClientRecord(db as never, { code: "CLI2", name: "Cliente 2" });
  const project = await createProjectRecord(db as never, { clientId: aviat.id, code: "ATT", name: "AT&T" });
  db._setInventory(1);
  await assert.rejects(
    () => updateProjectRecord(db as never, project.id, { clientId: client2.id }),
    (error: unknown) =>
      error instanceof HttpError &&
      error.statusCode === 409 &&
      error.code === MASTER_DEACTIVATE_CODES.PROJECT_HAS_OPERATIONAL_HISTORY
  );
});

test("proyecto vacío sin historial puede reasignarse; uno nuevo exige cliente", async () => {
  const db = makeDb();
  const aviat = await createClientRecord(db as never, { code: "AVIAT", name: "AVIAT" });
  const client2 = await createClientRecord(db as never, { code: "CLI2", name: "Cliente 2" });
  const empty = await createProjectRecord(db as never, { clientId: aviat.id, code: "EMPTY", name: "Vacío" });
  const updated = await updateProjectRecord(db as never, empty.id, { clientId: client2.id });
  assert.equal(updated.clientId, client2.id);
  await assert.rejects(
    () => createProjectRecord(db as never, { clientId: "", code: "NOCLIENT", name: "Huérfano" }),
    (error: unknown) => error instanceof HttpError && error.code === MASTER_DEACTIVATE_CODES.PROJECT_CLIENT_REQUIRED
  );
});

test("Warehouse/Location por ID, duplicado y código inmutable", async () => {
  const db = makeDb();
  const warehouse = await createWarehouseRecord(db as never, { code: "TULTITLAN24", name: "Tultitlán 24" });
  const location = await createLocationRecord(db as never, { warehouse: "tultitlan24", code: "AN22-A" });
  assert.equal(location.warehouseId, warehouse.id);
  assert.equal(location.warehouse, "TULTITLAN24");
  await assert.rejects(
    () => createLocationRecord(db as never, { warehouseId: warehouse.id, code: "AN22-A" }),
    (error: unknown) => error instanceof HttpError && error.code === MASTER_DEACTIVATE_CODES.DUPLICATE_CODE
  );
  await assert.rejects(
    () => updateWarehouseRecord(db as never, warehouse.id, { code: "OTRO" }),
    (error: unknown) => error instanceof HttpError && error.code === MASTER_DEACTIVATE_CODES.WAREHOUSE_CODE_IMMUTABLE
  );
  const renamed = await updateWarehouseRecord(db as never, warehouse.id, { name: "CEDIS Tultitlán" });
  assert.equal(renamed.code, "TULTITLAN24");
  assert.equal(renamed.name, "CEDIS Tultitlán");
});
