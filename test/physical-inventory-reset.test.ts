import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { Prisma } from "@prisma/client";
import { HttpError } from "../src/shared/http-error.js";
import {
  PHYSICAL_RESET_CONFIRMATION,
  PHYSICAL_RESET_PATH,
  applyPhysicalInventoryZero,
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
  routes.indexOf('inventoryRouter.post("/physical/prepare"')
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
      count: async ({ where }: { where?: { OR?: Array<Record<string, { gt: number }>> } } = {}) => {
        if (!where?.OR) return state.inventory.length;
        return state.inventory.filter((row) => where.OR!.some((cond) => {
          const field = Object.keys(cond)[0]!;
          return row[field as "qty" | "reservedQty"].gt(0);
        })).length;
      },
      updateMany: async ({ data }: { data: { qty: number; reservedQty: number } }) => {
        for (const row of state.inventory) {
          row.qty = d(data.qty);
          row.reservedQty = d(data.reservedQty);
        }
        return { count: state.inventory.length };
      },
      deleteMany: async () => {
        throw new Error("inventory.deleteMany forbidden");
      }
    },
    inventoryLayer: {
      aggregate: async ({ _sum }: { _sum: Record<string, boolean> }) => {
        const key = Object.keys(_sum)[0]!;
        return { _sum: { [key]: sum(state.layers, key) } };
      },
      count: async ({ where }: { where?: { OR?: Array<Record<string, { gt: number }>> } } = {}) => {
        if (!where?.OR) return state.layers.length;
        return state.layers.filter((row) => where.OR!.some((cond) => {
          const field = Object.keys(cond)[0]!;
          return row[field as "qty" | "reservedQty"].gt(0);
        })).length;
      },
      updateMany: async ({ data }: { data: { qty: number; reservedQty: number } }) => {
        for (const row of state.layers) {
          row.qty = d(data.qty);
          row.reservedQty = d(data.reservedQty);
        }
        return { count: state.layers.length };
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
      count: async ({ where }: { where?: { quantity?: { gt: number } } } = {}) => {
        if (where?.quantity?.gt === 0) return state.stock.filter((row) => row.quantity.gt(0)).length;
        return state.stock.length;
      },
      updateMany: async ({ data }: { data: { quantity: number } }) => {
        for (const row of state.stock) row.quantity = d(data.quantity);
        return { count: state.stock.length };
      }
    },
    inventoryReservation: {
      count: async ({ where }: { where?: { status?: string } } = {}) => {
        if (where?.status) return state.reservations.filter((row) => row.status === where.status).length;
        return state.reservations.length;
      },
      updateMany: async ({ where, data }: { where: { status: string }; data: { status: string } }) => {
        let count = 0;
        for (const row of state.reservations) {
          if (row.status === where.status) {
            row.status = data.status;
            count += 1;
          }
        }
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
  assert.match(html, /Esta acción dejará todas las existencias en cero\. No eliminará productos, proyectos, ubicaciones ni usuarios\. Después podrá realizarse una nueva carga de inventario\./);
  assert.match(html, /Escribe <strong>BORRAR INVENTARIO<\/strong> para confirmar/);
  assert.match(js, /physicalInventoryResetConfirmBtn\.addEventListener\("click", \(\) => void runPhysicalInventoryReset\(\)\)/);
  assert.doesNotMatch(js, /DOMContentLoaded[\s\S]{0,400}runPhysicalInventoryReset/);
});

test("deja existencias y seriales en cero, conserva catálogos y movimientos, y es idempotente", async () => {
  const { state, tx } = createFakeTx();
  const first = await applyPhysicalInventoryZero(tx as never, { userId: "admin-1" });
  assert.equal(first.result, "ZEROED");
  assert.equal(first.inventoriesZeroed, 1);
  assert.equal(first.serialsReleased, 1);
  assert.equal(first.reservationsReleased, 1);
  assert.equal(state.serials.length, 0);
  assert.equal(String(state.inventory[0]!.qty), "0");
  assert.equal(String(state.inventory[0]!.reservedQty), "0");
  assert.equal(String(state.layers[0]!.qty), "0");
  assert.equal(state.reservations[0]!.status, "RELEASED");
  assert.equal(state.movements.length, 1);
  assert.equal(state.products.length, 1);
  assert.equal(state.locations.length, 1);
  assert.equal(state.users.length, 1);
  assert.equal(state.deleted.product, 0);
  assert.equal(state.deleted.movement, 0);
  assert.equal(state.deleted.importBatch, 0);
  assert.equal(state.logs.length, 1);
  assert.equal(state.logs[0]!.subtype, "PHYSICAL_RESET");
  assert.equal(state.logs[0]!.userId, "admin-1");

  const second = await applyPhysicalInventoryZero(tx as never, { userId: "admin-1" });
  assert.equal(second.result, "ALREADY_ZERO");
  assert.equal(second.inventoriesZeroed, 0);
  assert.equal(second.serialsReleased, 0);
  assert.equal(state.serials.length, 0);
  assert.equal(state.logs.length, 2);
});

test("un fallo intermedio hace rollback y no deja seriales a medias", async () => {
  const { state, tx } = createFakeTx();
  const snapshot = {
    inventory: cloneRows(state.inventory),
    serials: cloneRows(state.serials),
    reservations: cloneRows(state.reservations)
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
        state.serials = cloneRows(snapshot.serials);
        state.reservations = cloneRows(snapshot.reservations);
        throw error;
      }
    }
  };
  await assert.rejects(() => executePhysicalInventoryReset({ userId: "admin-1" }, db as never), /audit-fail/);
  assert.equal(String(state.inventory[0]!.qty), "10");
  assert.equal(state.serials[0]!.serialNumber, "1659");
  assert.equal(state.reservations[0]!.status, "ACTIVE");
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
        alreadyZero: true,
        inventoriesZeroed: 0,
        qtyCleared: "0",
        reservedCleared: "0",
        layersZeroed: 0,
        serialsReleased: 0,
        reservationsReleased: 0,
        legacyStockZeroed: 0,
        result: "ALREADY_ZERO"
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
  await applyPhysicalInventoryZero(tx as never, { userId: "admin-1" });
  const serialSet = new Set(state.serials.map((row) => row.serialNumber.toUpperCase()));
  assert.equal(serialSet.has("1659"), false);
  assert.equal(state.serials.length, 0);
});
