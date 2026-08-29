import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { HttpError } from "../src/shared/http-error.js";
import {
  assertAccessibleInventory,
  assertAccessibleLayer,
  assertAccessibleMovement,
  assertAccessibleRequisition,
  assertAccessibleSerial,
  clientActivityWhere,
  clientInventoryWhere,
  clientMovementWhere,
  clientScanWhere,
  clientSerialWhere,
  effectiveRequestedClientId,
  scopedInventoryWhere,
  scopedMovementWhere
} from "../src/modules/clients/client-scope.js";
import {
  buildAssignment,
  freeToSaleAssignmentKey,
  resolveInboundAssignment
} from "../src/modules/inventory/inventory-assignment.js";
import { InventoryMutationError } from "../src/modules/inventory/inventory-errors.js";
import { createMovementSchema } from "../src/modules/inventory/inventory-movement.schema.js";
import { summarizeStockAssignments } from "../src/modules/inventory/inventory-valuation.service.js";

const html = readFileSync(new URL("../public/dashboard.html", import.meta.url), "utf8");
const js = readFileSync(new URL("../public/dashboard.js", import.meta.url), "utf8");
const inventorySrc = readFileSync(new URL("../src/modules/inventory/inventory.routes.ts", import.meta.url), "utf8");
const exportsSrc = readFileSync(new URL("../src/modules/exports/exports.routes.ts", import.meta.url), "utf8");

const aviat = { id: "client-aviat", code: "AVIAT", name: "AVIAT" };
const client2 = { id: "client-2", code: "CLI2", name: "Cliente 2" };
const aviatAuth = { role: "CLIENT" as const, clientId: aviat.id };
const client2Auth = { role: "CLIENT" as const, clientId: client2.id };
const adminAuth = { role: "ADMIN" as const, clientId: null };
const sku = "SKU-SHARED-1";

function twoClientWorld() {
  const loc = { id: "loc-1", code: "AN14-F", warehouse: "TULTITLAN24" };
  const aviatProject = { id: "proj-att", code: "ATT", name: "AT&T", clientId: aviat.id };
  const project2a = { id: "proj-2a", code: "P2A", name: "Proyecto 2A", clientId: client2.id };
  const inventories = [
    {
      id: "inv-aviat-prj",
      productId: "prod-1",
      sku,
      locationId: loc.id,
      status: "AVAILABLE",
      qty: 10,
      assignmentType: "PROJECT",
      assignmentKey: `P:${aviatProject.id}`,
      projectId: aviatProject.id,
      clientId: aviat.id
    },
    {
      id: "inv-aviat-fts",
      productId: "prod-1",
      sku,
      locationId: loc.id,
      status: "AVAILABLE",
      qty: 7,
      assignmentType: "FREE_TO_SALE",
      assignmentKey: freeToSaleAssignmentKey(aviat.id),
      projectId: null,
      clientId: aviat.id
    },
    {
      id: "inv-c2-prj",
      productId: "prod-1",
      sku,
      locationId: loc.id,
      status: "AVAILABLE",
      qty: 4,
      assignmentType: "PROJECT",
      assignmentKey: `P:${project2a.id}`,
      projectId: project2a.id,
      clientId: client2.id
    },
    {
      id: "inv-c2-fts",
      productId: "prod-1",
      sku,
      locationId: loc.id,
      status: "AVAILABLE",
      qty: 3,
      assignmentType: "FREE_TO_SALE",
      assignmentKey: freeToSaleAssignmentKey(client2.id),
      projectId: null,
      clientId: client2.id
    }
  ];
  const layers = [
    { id: "layer-aviat-fts", inventoryId: "inv-aviat-fts", clientId: aviat.id, qty: 7 },
    { id: "layer-c2-fts", inventoryId: "inv-c2-fts", clientId: client2.id, qty: 3 }
  ];
  const serials = [
    { id: "ser-aviat", serialNumber: "IMEI-AVIAT-1", clientId: aviat.id, inventoryLayerId: null, productId: "prod-1" },
    { id: "ser-c2", serialNumber: "IMEI-C2-1", clientId: client2.id, inventoryLayerId: "layer-c2-fts", productId: "prod-1" }
  ];
  const movements = [
    { id: "mov-aviat", clientId: aviat.id, productId: "prod-1", qty: 7, assignmentKey: freeToSaleAssignmentKey(aviat.id) },
    { id: "mov-c2", clientId: client2.id, productId: "prod-1", qty: 3, assignmentKey: freeToSaleAssignmentKey(client2.id) }
  ];
  const scans = [
    { id: "scan-aviat", clientId: aviat.id, productId: "prod-1", scannedCode: "IMEI-AVIAT-1" },
    { id: "scan-c2", clientId: client2.id, productId: "prod-1", scannedCode: "IMEI-C2-1" }
  ];
  const activity = [
    { id: "act-aviat", clientId: aviat.id, productId: "prod-1", type: "RECEIVE" },
    { id: "act-c2", clientId: client2.id, productId: "prod-1", type: "RECEIVE" }
  ];
  const requisitions = [
    { id: "req-aviat", project: { clientId: aviat.id } },
    { id: "req-c2", project: { clientId: client2.id } }
  ];
  return { loc, aviatProject, project2a, inventories, layers, serials, movements, scans, activity, requisitions };
}

function matchesClient(row: { clientId: string }, where: { clientId?: string }) {
  return !where.clientId || row.clientId === where.clientId;
}

function accessDb(world: ReturnType<typeof twoClientWorld>) {
  return {
    inventory: {
      findFirst: async ({ where }: { where: { AND?: Array<{ id?: string; clientId?: string }> } }) => {
        const id = where.AND?.find((part) => part.id)?.id;
        const clientId = where.AND?.find((part) => part.clientId)?.clientId;
        return world.inventories.find((row) => row.id === id && (!clientId || row.clientId === clientId)) || null;
      }
    },
    inventoryLayer: {
      findFirst: async ({ where }: { where: { AND?: Array<{ id?: string; inventory?: { clientId?: string } }> } }) => {
        const id = where.AND?.find((part) => part.id)?.id;
        const clientId = where.AND?.find((part) => part.inventory)?.inventory?.clientId;
        const layer = world.layers.find((row) => row.id === id);
        if (!layer) return null;
        const inv = world.inventories.find((row) => row.id === layer.inventoryId);
        if (clientId && inv?.clientId !== clientId) return null;
        return { id: layer.id };
      }
    },
    inventorySerial: {
      findFirst: async ({ where }: { where: { AND?: Array<{ id?: string; clientId?: string }> } }) => {
        const id = where.AND?.find((part) => part.id)?.id;
        const clientId = where.AND?.find((part) => part.clientId)?.clientId;
        return world.serials.find((row) => row.id === id && (!clientId || row.clientId === clientId)) || null;
      }
    },
    inventoryMovement: {
      findFirst: async ({ where }: { where: { AND?: Array<{ id?: string; clientId?: string }> } }) => {
        const id = where.AND?.find((part) => part.id)?.id;
        const clientId = where.AND?.find((part) => part.clientId)?.clientId;
        return world.movements.find((row) => row.id === id && (!clientId || row.clientId === clientId)) || null;
      }
    }
  };
}

test("dos clientes pueden tener el mismo SKU, ubicación y estatus con FTS separado", () => {
  const aviatFts = buildAssignment("FREE_TO_SALE", null, aviat.id);
  const c2Fts = buildAssignment("FREE_TO_SALE", null, client2.id);
  assert.equal(aviatFts.assignmentKey, "FREE_TO_SALE:client-aviat");
  assert.equal(c2Fts.assignmentKey, "FREE_TO_SALE:client-2");
  assert.notEqual(aviatFts.assignmentKey, c2Fts.assignmentKey);
  const world = twoClientWorld();
  const sameCubeShape = world.inventories.filter(
    (row) => row.productId === "prod-1" && row.locationId === world.loc.id && row.status === "AVAILABLE"
  );
  assert.equal(sameCubeShape.length, 4);
  const keys = new Set(sameCubeShape.map((row) => row.assignmentKey));
  assert.equal(keys.size, 4);
  assert.equal(
    world.inventories.filter((row) => matchesClient(row, clientInventoryWhere(aviatAuth) as { clientId: string })).reduce((n, row) => n + row.qty, 0),
    17
  );
  assert.equal(
    world.inventories.filter((row) => matchesClient(row, clientInventoryWhere(client2Auth) as { clientId: string })).reduce((n, row) => n + row.qty, 0),
    7
  );
});

test("CLIENT AVIAT ve proyectos AVIAT + FTS AVIAT y no ve Cliente 2", () => {
  const world = twoClientWorld();
  const aviatRows = world.inventories.filter((row) => matchesClient(row, clientInventoryWhere(aviatAuth) as { clientId: string }));
  const c2Rows = world.inventories.filter((row) => matchesClient(row, clientInventoryWhere(client2Auth) as { clientId: string }));
  assert.deepEqual(
    aviatRows.map((row) => row.id).sort(),
    ["inv-aviat-fts", "inv-aviat-prj"]
  );
  assert.deepEqual(
    c2Rows.map((row) => row.id).sort(),
    ["inv-c2-fts", "inv-c2-prj"]
  );
  assert.equal(aviatRows.some((row) => row.id === "inv-c2-fts"), false);
  assert.equal(c2Rows.some((row) => row.id === "inv-aviat-fts"), false);
  assert.deepEqual(
    world.movements.filter((row) => matchesClient(row, clientMovementWhere(aviatAuth) as { clientId: string })).map((row) => row.id),
    ["mov-aviat"]
  );
  assert.deepEqual(
    world.serials.filter((row) => matchesClient(row, clientSerialWhere(aviatAuth) as { clientId: string })).map((row) => row.id),
    ["ser-aviat"]
  );
  assert.deepEqual(
    world.scans.filter((row) => matchesClient(row, clientScanWhere(aviatAuth) as { clientId: string })).map((row) => row.id),
    ["scan-aviat"]
  );
  assert.deepEqual(
    world.activity.filter((row) => matchesClient(row, clientActivityWhere(aviatAuth) as { clientId: string })).map((row) => row.id),
    ["act-aviat"]
  );
});

test("IDs ajenos y spoof de clientId no revelan datos", async () => {
  const world = twoClientWorld();
  const db = accessDb(world);
  await assert.rejects(
    () => assertAccessibleInventory(aviatAuth, "inv-c2-fts", db),
    (error: unknown) => error instanceof HttpError && error.statusCode === 404
  );
  await assert.rejects(
    () => assertAccessibleLayer(aviatAuth, "layer-c2-fts", db),
    (error: unknown) => error instanceof HttpError && error.statusCode === 404
  );
  await assert.rejects(
    () => assertAccessibleSerial(aviatAuth, "ser-c2", db),
    (error: unknown) => error instanceof HttpError && error.statusCode === 404
  );
  await assert.rejects(
    () => assertAccessibleMovement(aviatAuth, "mov-c2", db),
    (error: unknown) => error instanceof HttpError && error.statusCode === 404
  );
  await assert.rejects(
    () => assertAccessibleRequisition(aviatAuth, world.requisitions[1]),
    (error: unknown) => error instanceof HttpError && error.statusCode === 404
  );
  await assertAccessibleInventory(aviatAuth, "inv-aviat-fts", db);
  await assertAccessibleSerial(aviatAuth, "ser-aviat", db);
  assert.equal(effectiveRequestedClientId(aviatAuth, client2.id), undefined);
  const spoofed = scopedInventoryWhere(aviatAuth, client2.id);
  assert.equal(JSON.stringify(spoofed).includes(client2.id), false);
  assert.equal(JSON.stringify(scopedMovementWhere(aviatAuth, client2.id)).includes(client2.id), false);
});

test("serie surtida conserva propietario y no se filtra por SKU compartido", () => {
  const world = twoClientWorld();
  const picked = world.serials.find((row) => row.inventoryLayerId == null);
  assert.equal(picked?.id, "ser-aviat");
  assert.equal(picked?.clientId, aviat.id);
  const byProduct = world.serials.filter((row) => row.productId === "prod-1");
  assert.equal(byProduct.length, 2);
  const aviatOnly = byProduct.filter((row) => matchesClient(row, clientSerialWhere(aviatAuth) as { clientId: string }));
  assert.deepEqual(aviatOnly.map((row) => row.id), ["ser-aviat"]);
});

test("ADMIN filtra AVIAT y Cliente 2 sin mezclar cubos; la vista global los identifica", () => {
  const world = twoClientWorld();
  const aviatFilter = scopedInventoryWhere(adminAuth, aviat.id);
  const c2Filter = scopedInventoryWhere(adminAuth, client2.id);
  const aviatRows = world.inventories.filter((row) => row.clientId === aviat.id);
  const c2Rows = world.inventories.filter((row) => row.clientId === client2.id);
  assert.match(JSON.stringify(aviatFilter), /"clientId":"client-aviat"/);
  assert.match(JSON.stringify(c2Filter), /"clientId":"client-2"/);
  assert.equal(aviatRows.some((row) => row.assignmentType === "FREE_TO_SALE"), true);
  assert.equal(c2Rows.some((row) => row.assignmentType === "FREE_TO_SALE"), true);
  const summary = summarizeStockAssignments(
    world.inventories.map((row) => ({
      qty: row.qty,
      assignmentType: row.assignmentType,
      project: row.projectId ? { id: row.projectId, code: row.assignmentKey, name: row.assignmentKey } : null
    }))
  );
  assert.equal(summary.hasFreeToSale, true);
  const owners = new Set(world.inventories.map((row) => row.clientId));
  assert.deepEqual([...owners].sort(), [client2.id, aviat.id].sort());
  assert.notEqual(freeToSaleAssignmentKey(aviat.id), freeToSaleAssignmentKey(client2.id));
});

test("recepción FTS exige cliente; schema HTTP rechaza FTS sin clientId", async () => {
  const tx = {
    client: {
      findUnique: async ({ where }: { where: { id: string } }) =>
        where.id === aviat.id
          ? { id: aviat.id, code: "AVIAT", name: "AVIAT", tradeName: "AVIAT", legalName: "AVIAT", active: true }
          : null
    },
    customer: { findUnique: async () => null }
  };
  await assert.rejects(
    () => resolveInboundAssignment(tx as never, { customerId: null }, { assignmentType: "FREE_TO_SALE", projectId: null }),
    (error: unknown) => error instanceof InventoryMutationError && error.code === "CLIENT_REQUIRED"
  );
  const ok = await resolveInboundAssignment(tx as never, { customerId: null }, {
    assignmentType: "FREE_TO_SALE",
    projectId: null,
    clientId: aviat.id
  });
  assert.equal(ok.assignmentKey, freeToSaleAssignmentKey(aviat.id));
  const parsed = createMovementSchema.safeParse({
    sku,
    type: "IN",
    quantity: 1,
    location: "AN14-F",
    assignmentType: "FREE_TO_SALE",
    projectId: null
  });
  assert.equal(parsed.success, false);
});

test("rutas de detalle, exportaciones y UI no autorizan por product.customer", () => {
  assert.match(inventorySrc, /assertAccessibleLayer/);
  assert.match(inventorySrc, /assertAccessibleSerial/);
  assert.match(inventorySrc, /assertAccessibleMovement/);
  assert.match(exportsSrc, /scopedInventoryWhere/);
  assert.match(exportsSrc, /scopedMovementWhere/);
  assert.match(html, /dashboard\.js\?v=81/);
  assert.match(js, /owningClientDisplayName/);
  assert.doesNotMatch(js, /Inventario de \$\{PRIMARY_CLIENT_AVIAT_NAME\}/);
});
