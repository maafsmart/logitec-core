import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const sql = readFileSync(
  new URL("../prisma/migrations/20260829020000_inventory_client_ownership/migration.sql", import.meta.url),
  "utf8"
);
const schema = readFileSync(new URL("../prisma/schema.prisma", import.meta.url), "utf8");

test("registros operativos auxiliares reciben ownership obligatorio", () => {
  for (const model of ["Comment", "Task", "Incident"]) {
    assert.match(sql, new RegExp(`ALTER TABLE "${model}" ADD COLUMN "clientId" TEXT`));
    assert.match(sql, new RegExp(`ALTER TABLE "${model}" ALTER COLUMN "clientId" SET NOT NULL`));
    assert.match(sql, new RegExp(`${model}_clientId_fkey`));
    assert.match(sql, new RegExp(`${model}_clientId_idx`));
    const block = schema.slice(schema.indexOf(`model ${model} {`), schema.indexOf("\nmodel ", schema.indexOf(`model ${model} {`) + 1));
    assert.match(block, /clientId\s+String\s*$/m);
    assert.match(block, /onDelete: Restrict/);
  }
});

type ClientRow = { id: string; code: string; name: string; tradeName?: string | null; legalName?: string | null };
type ProjectRow = { id: string; code: string; clientId: string | null };
type InventoryRow = {
  id: string;
  productId: string;
  locationId: string;
  status: string;
  assignmentType: "PROJECT" | "FREE_TO_SALE" | "LEGACY_UNASSIGNED";
  assignmentKey: string;
  qty: number;
  clientId: string | null;
};
type LocationRow = { id: string; warehouse: string; warehouseId: string | null; code: string };
type WarehouseRow = { id: string; code: string };

function resolveAviat(clients: ClientRow[]): string {
  const matches = [
    ...new Set(
      clients
        .filter((row) =>
          [row.code, row.name, row.tradeName, row.legalName]
            .map((value) => (value || "").trim().toUpperCase())
            .includes("AVIAT")
        )
        .map((row) => row.id)
    )
  ];
  if (matches.length !== 1) {
    throw new Error(`AVIAT_CLIENT_NOT_UNIQUE: se requiere exactamente un cliente AVIAT inequívoco (encontrados ${matches.length}).`);
  }
  return matches[0]!;
}

function backfill(world: {
  clients: ClientRow[];
  projects: ProjectRow[];
  inventories: InventoryRow[];
  movements: Array<{ id: string; clientId: string | null }>;
  serials: Array<{ id: string; clientId: string | null }>;
  scans: Array<{ id: string; clientId: string | null }>;
  activity: Array<{ id: string; clientId: string | null }>;
  locations: LocationRow[];
  warehouses: WarehouseRow[];
}) {
  const aviatId = resolveAviat(world.clients);
  for (const project of world.projects) {
    if (!project.clientId) project.clientId = aviatId;
  }
  if (world.projects.some((row) => !row.clientId)) {
    throw new Error("CUSTOMER_CLIENT_BACKFILL_FAILED");
  }
  for (const inventory of world.inventories) {
    if (!inventory.clientId) inventory.clientId = aviatId;
  }
  const grouped = new Map<string, InventoryRow[]>();
  for (const inventory of world.inventories.filter((row) => row.assignmentType === "FREE_TO_SALE")) {
    const key = [
      inventory.productId,
      inventory.locationId,
      inventory.status,
      inventory.assignmentKey === "FREE_TO_SALE" ? `FREE_TO_SALE:${aviatId}` : inventory.assignmentKey
    ].join("|");
    const list = grouped.get(key) || [];
    list.push(inventory);
    grouped.set(key, list);
  }
  for (const list of grouped.values()) {
    if (list.length > 1) {
      throw new Error(`FTS_ASSIGNMENT_KEY_COLLISION: no se fusionarán cubos Free to Sale (${list.length} grupos).`);
    }
  }
  for (const inventory of world.inventories) {
    if (inventory.assignmentType === "FREE_TO_SALE" && inventory.assignmentKey === "FREE_TO_SALE") {
      inventory.assignmentKey = `FREE_TO_SALE:${inventory.clientId}`;
    }
  }
  for (const row of [...world.movements, ...world.serials, ...world.scans, ...world.activity]) {
    if (!row.clientId) row.clientId = aviatId;
  }
  for (const location of world.locations) {
    const code = location.warehouse.trim().toUpperCase();
    const matches = world.warehouses.filter((row) => row.code === code);
    if (matches.length !== 1) {
      throw new Error("LOCATION_WAREHOUSE_UNLINKED: hay ubicaciones sin almacén inequívoco; no se adivinará la relación.");
    }
    location.warehouseId = matches[0]!.id;
    location.warehouse = matches[0]!.code;
  }
  if (world.locations.some((row) => !row.warehouseId)) {
    throw new Error("LOCATION_WAREHOUSE_UNLINKED: hay ubicaciones sin almacén inequívoco; no se adivinará la relación.");
  }
  return aviatId;
}

test("la migración SQL aborta sin AVIAT único, ante colisión FTS y sin warehouse inequívoco", () => {
  assert.match(sql, /AVIAT_CLIENT_NOT_UNIQUE/);
  assert.match(sql, /FTS_ASSIGNMENT_KEY_COLLISION/);
  assert.match(sql, /LOCATION_WAREHOUSE_UNLINKED/);
  assert.match(sql, /CUSTOMER_CLIENT_BACKFILL_FAILED/);
  assert.match(sql, /FROM "Client"/);
  assert.match(sql, /SET "clientId" = \(SELECT id FROM _aviat_owner\)/);
  assert.match(sql, /FREE_TO_SALE:' \|\| aviat_id/);
  assert.match(sql, /DROP CONSTRAINT IF EXISTS "Inventory_assignment_coherence_check"/);
  assert.match(sql, /FREE_TO_SALE:' \|\| "clientId"/);
  assert.match(sql, /ALTER TABLE "Inventory" ALTER COLUMN "clientId" SET NOT NULL/);
  assert.match(sql, /ALTER TABLE "Customer" ALTER COLUMN "clientId" SET NOT NULL/);
  assert.match(sql, /ALTER TABLE "Location" ALTER COLUMN "warehouseId" SET NOT NULL/);
  assert.doesNotMatch(sql, /product\.customer/);
  assert.doesNotMatch(sql, /SUM\("qty"\)/);
  assert.doesNotMatch(sql, /DELETE FROM "Inventory"/);
});

test("backfill AVIAT liga proyectos, inventario y FTS namespaced sin perder cantidades", () => {
  const world = {
    clients: [{ id: "c-aviat", code: "AVIAT", name: "AVIAT Networks" }],
    projects: [
      { id: "p-att", code: "ATT", clientId: null as string | null },
      { id: "p-airbus", code: "AIRBUS", clientId: null as string | null }
    ],
    inventories: [
      {
        id: "inv-prj",
        productId: "prod-1",
        locationId: "loc-1",
        status: "AVAILABLE",
        assignmentType: "PROJECT" as const,
        assignmentKey: "P:p-att",
        qty: 12,
        clientId: null as string | null
      },
      {
        id: "inv-fts",
        productId: "prod-1",
        locationId: "loc-1",
        status: "AVAILABLE",
        assignmentType: "FREE_TO_SALE" as const,
        assignmentKey: "FREE_TO_SALE",
        qty: 5,
        clientId: null as string | null
      }
    ],
    movements: [{ id: "mov-1", clientId: null as string | null }],
    serials: [{ id: "ser-1", clientId: null as string | null }],
    scans: [{ id: "scan-1", clientId: null as string | null }],
    activity: [{ id: "act-1", clientId: null as string | null }],
    locations: [{ id: "loc-1", warehouse: " tultitlan24 ", warehouseId: null as string | null, code: "AN14-F" }],
    warehouses: [{ id: "wh-1", code: "TULTITLAN24" }]
  };
  const aviatId = backfill(world);
  assert.equal(aviatId, "c-aviat");
  assert.ok(world.projects.every((row) => row.clientId === aviatId));
  assert.ok(world.inventories.every((row) => row.clientId === aviatId));
  assert.equal(world.inventories.find((row) => row.id === "inv-fts")?.assignmentKey, "FREE_TO_SALE:c-aviat");
  assert.equal(world.inventories.find((row) => row.id === "inv-prj")?.qty, 12);
  assert.equal(world.inventories.find((row) => row.id === "inv-fts")?.qty, 5);
  assert.equal(world.inventories.find((row) => row.id === "inv-fts")?.id, "inv-fts");
  assert.ok(world.movements.every((row) => row.clientId === aviatId));
  assert.ok(world.serials.every((row) => row.clientId === aviatId));
  assert.ok(world.scans.every((row) => row.clientId === aviatId));
  assert.ok(world.activity.every((row) => row.clientId === aviatId));
  assert.equal(world.locations[0]?.warehouseId, "wh-1");
  assert.equal(world.locations[0]?.warehouse, "TULTITLAN24");
});

test("falla de forma clara si AVIAT no existe o no es inequívoco", () => {
  assert.throws(
    () => resolveAviat([{ id: "c1", code: "CLI2", name: "Cliente 2" }]),
    /AVIAT_CLIENT_NOT_UNIQUE/
  );
  assert.throws(
    () =>
      resolveAviat([
        { id: "c1", code: "AVIAT", name: "AVIAT" },
        { id: "c2", code: "X", name: "AVIAT" }
      ]),
    /AVIAT_CLIENT_NOT_UNIQUE/
  );
});

test("falla de forma clara ante colisión de cubos FTS y no fusiona cantidades", () => {
  const world = {
    clients: [{ id: "c-aviat", code: "AVIAT", name: "AVIAT" }],
    projects: [],
    inventories: [
      {
        id: "inv-a",
        productId: "prod-1",
        locationId: "loc-1",
        status: "AVAILABLE",
        assignmentType: "FREE_TO_SALE" as const,
        assignmentKey: "FREE_TO_SALE",
        qty: 2,
        clientId: null as string | null
      },
      {
        id: "inv-b",
        productId: "prod-1",
        locationId: "loc-1",
        status: "AVAILABLE",
        assignmentType: "FREE_TO_SALE" as const,
        assignmentKey: "FREE_TO_SALE:c-aviat",
        qty: 9,
        clientId: "c-aviat"
      }
    ],
    movements: [],
    serials: [],
    scans: [],
    activity: [],
    locations: [{ id: "loc-1", warehouse: "TULTITLAN24", warehouseId: null as string | null, code: "AN14-F" }],
    warehouses: [{ id: "wh-1", code: "TULTITLAN24" }]
  };
  assert.throws(() => backfill(world), /FTS_ASSIGNMENT_KEY_COLLISION/);
  assert.equal(world.inventories[0]?.qty, 2);
  assert.equal(world.inventories[1]?.qty, 9);
});

test("falla si una ubicación no se puede vincular al catálogo Warehouse", () => {
  const world = {
    clients: [{ id: "c-aviat", code: "AVIAT", name: "AVIAT" }],
    projects: [],
    inventories: [],
    movements: [],
    serials: [],
    scans: [],
    activity: [],
    locations: [{ id: "loc-1", warehouse: "UNKNOWN", warehouseId: null as string | null, code: "AN99-Z" }],
    warehouses: [{ id: "wh-1", code: "TULTITLAN24" }]
  };
  assert.throws(() => backfill(world), /LOCATION_WAREHOUSE_UNLINKED/);
});
