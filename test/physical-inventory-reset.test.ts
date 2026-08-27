import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { Prisma } from "@prisma/client";
import { HttpError } from "../src/shared/http-error.js";
import {
  PHYSICAL_RESET_CONFIRMATION,
  PHYSICAL_RESET_PATH,
  applyPhysicalInventoryPurge,
  assertPhysicalResetConfirmation,
  executePhysicalInventoryReset,
  isPhysicalResetInFlight
} from "../src/modules/inventory/physical-reset.service.js";

const html = readFileSync(new URL("../public/dashboard.html", import.meta.url), "utf8");
const js = readFileSync(new URL("../public/dashboard.js", import.meta.url), "utf8");
const routes = readFileSync(new URL("../src/modules/inventory/inventory.routes.ts", import.meta.url), "utf8");
const appSrc = readFileSync(new URL("../src/app.ts", import.meta.url), "utf8");
const serviceSrc = readFileSync(new URL("../src/modules/inventory/physical-reset.service.ts", import.meta.url), "utf8");

const resetBlock = routes.slice(
  routes.indexOf('inventoryRouter.post("/physical/reset"'),
  routes.indexOf('inventoryRouter.post("/import"')
);

function d(n: number) {
  return new Prisma.Decimal(n);
}

function cloneRows<T>(rows: T[]): T[] {
  return rows.map((row) => ({ ...row }));
}

function createFakeTx(seed?: Partial<{
  inventory: Array<{ id: string; qty: Prisma.Decimal; reservedQty: Prisma.Decimal }>;
  layers: Array<{ id: string; qty: Prisma.Decimal; reservedQty: Prisma.Decimal }>;
  serials: Array<{ id: string; serialNumber: string }>;
  stock: Array<{ id: string; quantity: Prisma.Decimal }>;
  reservations: Array<{ id: string; status: string }>;
  movements: Array<{ id: string }>;
  products: Array<{ id: string }>;
  locations: Array<{ id: string }>;
  users: Array<{ id: string }>;
}>) {
  const state = {
    inventory: cloneRows(seed?.inventory || [{ id: "inv-1", qty: d(10), reservedQty: d(2) }]),
    layers: cloneRows(seed?.layers || [{ id: "ly-1", qty: d(10), reservedQty: d(0) }]),
    serials: cloneRows(seed?.serials || [{ id: "s-1", serialNumber: "1659" }]),
    stock: cloneRows(seed?.stock || [{ id: "st-1", quantity: d(4) }]),
    reservations: cloneRows(seed?.reservations || [{ id: "r-1", status: "ACTIVE" }]),
    movements: cloneRows(seed?.movements || [{ id: "m-1" }]),
    products: cloneRows(seed?.products || [{ id: "p-1" }]),
    locations: cloneRows(seed?.locations || [{ id: "l-1" }]),
    users: cloneRows(seed?.users || [{ id: "u-1" }]),
    logs: [] as Array<Record<string, unknown>>,
    deleted: {
      product: 0,
      location: 0,
      user: 0,
      movement: 0,
      importBatch: 0
    }
  };

  function sum(rows: Array<Record<string, Prisma.Decimal>>, field: string) {
    return rows.reduce((acc, row) => acc.add(row[field] || d(0)), d(0));
  }

  const tx = {
    inventory: {
      aggregate: async ({ _sum }: { _sum: Record<string, boolean> }) => {
        const key = Object.keys(_sum)[0]!;
        return { _sum: { [key]: sum(state.inventory, key) } };
      },
      count: async () => state.inventory.length,
      updateMany: async () => {
        throw new Error("inventory.updateMany forbidden");
      },
      deleteMany: async () => {
        const count = state.inventory.length;
        state.inventory = [];
        return { count };
      }
    },
    inventoryLayer: {
      aggregate: async ({ _sum }: { _sum: Record<string, boolean> }) => {
        const key = Object.keys(_sum)[0]!;
        return { _sum: { [key]: sum(state.layers, key) } };
      },
      count: async () => state.layers.length,
      updateMany: async () => {
        throw new Error("inventoryLayer.updateMany forbidden");
      },
      deleteMany: async () => {
        const count = state.layers.length;
        state.layers = [];
        return { count };
      }
    },
    inventorySerial: {
      count: async () => state.serials.length,
      deleteMany: async () => {
        const count = state.serials.length;
        state.serials = [];
        return { count };
      }
    },
    inventoryStock: {
      aggregate: async ({ _sum }: { _sum: Record<string, boolean> }) => ({
        _sum: { quantity: sum(state.stock, "quantity") }
      }),
      count: async () => state.stock.length,
      updateMany: async () => {
        throw new Error("inventoryStock.updateMany forbidden");
      },
      deleteMany: async () => {
        const count = state.stock.length;
        state.stock = [];
        return { count };
      }
    },
    inventoryReservation: {
      count: async () => state.reservations.length,
      updateMany: async () => {
        throw new Error("inventoryReservation.updateMany forbidden");
      },
      deleteMany: async () => {
        const count = state.reservations.length;
        state.reservations = [];
        return { count };
      }
    },
    activityLog: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        state.logs.push(data);
        return data;
      }
    },
    product: { deleteMany: async () => { state.deleted.product += 1; } },
    location: { deleteMany: async () => { state.deleted.location += 1; } },
    user: { deleteMany: async () => { state.deleted.user += 1; } },
    inventoryMovement: { deleteMany: async () => { state.deleted.movement += 1; } },
    importBatch: { deleteMany: async () => { state.deleted.importBatch += 1; } }
  };

  return { state, tx };
}

test("la frase de confirmación es exacta y no admite N/A ni variantes", () => {
  assert.equal(PHYSICAL_RESET_CONFIRMATION, "BORRAR INVENTARIO");
  assert.doesNotThrow(() => assertPhysicalResetConfirmation("BORRAR INVENTARIO"));
  assert.doesNotThrow(() => assertPhysicalResetConfirmation("  BORRAR INVENTARIO  "));
  assert.throws(() => assertPhysicalResetConfirmation("borrar inventario"), HttpError);
  assert.throws(() => assertPhysicalResetConfirmation("N/A"), HttpError);
  assert.throws(() => assertPhysicalResetConfirmation(""), HttpError);
});

test("el endpoint v1 existe, es ADMIN y no toca confirm de importación", () => {
  assert.equal(PHYSICAL_RESET_PATH, "/api/v1/inventory/physical/reset");
  assert.match(appSrc, /app\.use\("\/api\/v1\/inventory", inventoryRouter\)/);
  assert.match(resetBlock, /requireRole\(\["ADMIN"\]\)/);
  assert.doesNotMatch(resetBlock, /OPERATOR|CLIENT|SUPERVISOR/);
  assert.match(resetBlock, /executePhysicalInventoryReset/);
  assert.doesNotMatch(resetBlock, /\/api\/imports\/.+\/confirm/);
  assert.doesNotMatch(serviceSrc, /importBatch/);
  assert.doesNotMatch(serviceSrc, /AN202|AN203|AN204/);
  assert.match(serviceSrc, /result: "PURGED"/);
  assert.doesNotMatch(serviceSrc, /result: "ZEROED"|result: "ALREADY_ZERO"/);
  assert.doesNotMatch(serviceSrc, /updateMany\(/);
});

test("OPERATOR y CLIENT no tienen el botón ni la ruta", () => {
  assert.match(js, /physicalInventoryResetBtns\.forEach\(\(btn\) => \{\s*btn\.classList\.toggle\("hidden", role !== "ADMIN"\)/s);
  assert.match(js, /if \(currentRole !== "ADMIN" \|\| physicalInventoryResetBusy\) return/);
  assert.match(resetBlock, /requireRole\(\["ADMIN"\]\)/);
});

test("el botón rojo y el modal están en Inventario y Carga física", () => {
  assert.match(html, /id="physicalInventoryResetBtn"[^>]*class="btn-danger hidden"[^>]*>Borrar todo el inventario/);
  assert.match(html, /id="physicalInventoryResetImportBtn"[^>]*class="btn-danger hidden"[^>]*>Borrar todo el inventario/);
  assert.match(html, /id="physicalInventoryResetModal"/);
  assert.match(
    html,
    /Esta acción eliminará completamente todos los registros de existencias, capas, seriales y reservas\. No eliminará productos, proyectos, clientes, almacenes, ubicaciones ni usuarios\. Después podrá realizar una nueva importación manual\./
  );
  assert.match(html, /Escribe <strong>BORRAR INVENTARIO<\/strong> para confirmar/);
  assert.match(js, /physicalInventoryResetConfirmBtn\.addEventListener\("click", \(\) => void runPhysicalInventoryReset\(\)\)/);
  assert.doesNotMatch(js, /DOMContentLoaded[\s\S]{0,400}runPhysicalInventoryReset/);
  assert.match(js, /refreshInventoryAfterPhysicalPurge/);
  assert.match(js, /clearInventoryWorkspaceState/);
  assert.match(js, /data\.result !== "PURGED"/);
  assert.doesNotMatch(js.slice(js.indexOf("async function runPhysicalInventoryReset")), /refreshInventoryAfterImport\(\);\s*\n\s*await authenticatedFetch\(`\/api\/imports/);
  assert.doesNotMatch(js.slice(js.indexOf("async function runPhysicalInventoryReset"), js.indexOf("physicalInventoryResetBtns.forEach")), /\/api\/imports\/.+\/confirm/);
});

test("elimina físicamente existencias, incluidas qty=0, y conserva catálogos y movimientos", async () => {
  const { state, tx } = createFakeTx({
    inventory: [
      { id: "inv-1", qty: d(10), reservedQty: d(2) },
      { id: "inv-0", qty: d(0), reservedQty: d(0) }
    ],
    layers: [
      { id: "ly-1", qty: d(10), reservedQty: d(0) },
      { id: "ly-0", qty: d(0), reservedQty: d(0) }
    ]
  });
  const first = await applyPhysicalInventoryPurge(tx as never, { userId: "admin-1" });
  assert.equal(first.result, "PURGED");
  assert.equal(first.alreadyZero, false);
  assert.equal(first.inventoriesPurged, 2);
  assert.equal(first.layersPurged, 2);
  assert.equal(first.serialsPurged, 1);
  assert.equal(first.reservationsPurged, 1);
  assert.equal(first.legacyStockPurged, 1);
  assert.equal(state.inventory.length, 0);
  assert.equal(state.layers.length, 0);
  assert.equal(state.serials.length, 0);
  assert.equal(state.reservations.length, 0);
  assert.equal(state.stock.length, 0);
  assert.equal(state.movements.length, 1);
  assert.equal(state.products.length, 1);
  assert.equal(state.locations.length, 1);
  assert.equal(state.users.length, 1);
  assert.equal(state.deleted.product, 0);
  assert.equal(state.deleted.location, 0);
  assert.equal(state.deleted.user, 0);
  assert.equal(state.deleted.movement, 0);
  assert.equal(state.deleted.importBatch, 0);
  assert.equal(state.logs.length, 1);
  assert.equal(state.logs[0]!.subtype, "PHYSICAL_RESET");
  assert.equal(state.logs[0]!.result, "PURGED");

  const second = await applyPhysicalInventoryPurge(tx as never, { userId: "admin-1" });
  assert.equal(second.result, "PURGED");
  assert.equal(second.alreadyEmpty, true);
  assert.equal(second.inventoriesPurged, 0);
  assert.equal(second.serialsPurged, 0);
  assert.equal(state.logs.length, 2);
});

test("un fallo intermedio hace rollback y no deja seriales a medias", async () => {
  const { state, tx } = createFakeTx();
  const snapshot = {
    inventory: cloneRows(state.inventory),
    layers: cloneRows(state.layers),
    serials: cloneRows(state.serials),
    reservations: cloneRows(state.reservations),
    stock: cloneRows(state.stock)
  };
  const db = {
    $transaction: async (fn: (inner: typeof tx) => Promise<unknown>) => {
      try {
        const originalCreate = tx.activityLog.create;
        tx.activityLog.create = async () => {
          throw new Error("audit-fail");
        };
        try {
          return await fn(tx);
        } finally {
          tx.activityLog.create = originalCreate;
        }
      } catch (error) {
        state.inventory = cloneRows(snapshot.inventory);
        state.layers = cloneRows(snapshot.layers);
        state.serials = cloneRows(snapshot.serials);
        state.reservations = cloneRows(snapshot.reservations);
        state.stock = cloneRows(snapshot.stock);
        throw error;
      }
    }
  };
  await assert.rejects(() => executePhysicalInventoryReset({ userId: "admin-1" }, db as never), /audit-fail/);
  assert.equal(state.inventory.length, 1);
  assert.equal(String(state.inventory[0]!.qty), "10");
  assert.equal(state.serials[0]!.serialNumber, "1659");
  assert.equal(state.reservations[0]!.status, "ACTIVE");
  assert.equal(state.layers.length, 1);
  assert.equal(isPhysicalResetInFlight(), false);
});

test("impide una segunda solicitud simultánea", async () => {
  let release!: () => void;
  const hold = new Promise<void>((resolve) => {
    release = resolve;
  });
  const db = {
    $transaction: async () => {
      await hold;
      return {
        ok: true,
        alreadyEmpty: true,
        inventoriesPurged: 0,
        layersPurged: 0,
        serialsPurged: 0,
        reservationsPurged: 0,
        legacyStockPurged: 0,
        qtyCleared: "0",
        reservedCleared: "0",
        result: "PURGED",
        inventoriesZeroed: 0,
        layersZeroed: 0,
        serialsReleased: 0,
        reservationsReleased: 0,
        legacyStockZeroed: 0,
        alreadyZero: false
      };
    }
  };
  const first = executePhysicalInventoryReset({ userId: "admin-1" }, db as never);
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(isPhysicalResetInFlight(), true);
  await assert.rejects(
    () => executePhysicalInventoryReset({ userId: "admin-2" }, db as never),
    (error: unknown) => error instanceof HttpError && error.statusCode === 409
  );
  release();
  await first;
  assert.equal(isPhysicalResetInFlight(), false);
});

test("después del reset los seriales de la carga borrada no bloquean una recarga", async () => {
  const { state, tx } = createFakeTx();
  await applyPhysicalInventoryPurge(tx as never, { userId: "admin-1" });
  const serialSet = new Set(state.serials.map((row) => row.serialNumber.toUpperCase()));
  assert.equal(serialSet.has("1659"), false);
  assert.equal(state.serials.length, 0);
});

test("Existencias no consulta qty=0 y AN102/202 siguen sin remapeo", () => {
  const stockBlock = routes.slice(routes.indexOf('inventoryRouter.get("/stock"'), routes.indexOf('inventoryRouter.get("/locations"'));
  assert.match(stockBlock, /qty:\s*\{\s*gt:\s*0\s*\}/);
  assert.match(stockBlock, /take:\s*20000/);
  assert.doesNotMatch(js, /AN202\s*[:=]\s*["']AN102["']/);
  assert.doesNotMatch(js, /AN203\s*[:=]\s*["']AN103["']/);
  assert.doesNotMatch(js, /AN204\s*[:=]\s*["']AN104["']/);
  assert.match(js, /Number\(row\.qty\) > 0/);
});
