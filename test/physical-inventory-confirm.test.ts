import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { Prisma } from "@prisma/client";
import { HttpError } from "../src/shared/http-error.js";
import { ImportExecuteError } from "../src/modules/imports/import-execute-bulk.service.js";
import { isPhysicalResetInFlight } from "../src/modules/inventory/physical-inventory-lock.js";
import {
  PHYSICAL_CONFIRM_PATH,
  PHYSICAL_CONFIRM_PHRASE,
  PHYSICAL_PREPARE_PATH,
  assertAnLocationsRemainSeparate,
  assertPhysicalAppendBlocked,
  assertPhysicalBatchReady,
  assertPhysicalConfirmPhrase,
  assertPhysicalShaMatch,
  assertSourceSha256,
  executePhysicalInventoryConfirm,
  inventoryModeOf,
  stagedInventoryTotals,
  type PhysicalBatchSnapshot
} from "../src/modules/inventory/physical-confirm.service.js";

const SHA = "1B996210DD04FD42087A46C0D3E4225F927982ED5B919B2D807459BBE422BE20";
const html = readFileSync(new URL("../public/dashboard.html", import.meta.url), "utf8");
const js = readFileSync(new URL("../public/dashboard.js", import.meta.url), "utf8");
const routes = readFileSync(new URL("../src/modules/inventory/inventory.routes.ts", import.meta.url), "utf8");
const importRoutes = readFileSync(new URL("../src/modules/imports/imports.routes.ts", import.meta.url), "utf8");
const validateSrc = readFileSync(new URL("../src/modules/imports/import-validate.service.ts", import.meta.url), "utf8");

const confirmBlock = routes.slice(
  routes.indexOf('inventoryRouter.post("/physical/confirm"'),
  routes.indexOf('inventoryRouter.post("/import"')
);
const prepareBlock = routes.slice(
  routes.indexOf('inventoryRouter.post("/physical/prepare"'),
  routes.indexOf('inventoryRouter.post("/physical/confirm"')
);

function d(n: number) {
  return new Prisma.Decimal(n);
}

function cloneRows<T>(rows: T[]): T[] {
  return rows.map((row) => ({ ...row }));
}

function sampleRows(): PhysicalBatchSnapshot["rows"] {
  return [
    {
      sourceRow: 1,
      reviewState: "READY",
      normalized: {
        sku: "AND-VHLP4-11-NC3",
        qty: 1,
        location: "AN102",
        locationId: "loc-102",
        status: "OPERATIONS",
        assignmentType: "FREE_TO_SALE",
        serialNumber: "S-ANTENNA"
      },
      errors: [],
      action: "IMPORT"
    },
    {
      sourceRow: 2,
      reviewState: "WARNING",
      normalized: {
        sku: "AND-CNT-400-500M",
        qty: 1200,
        location: "AN202",
        locationId: "loc-202",
        status: "OPERATIONS",
        assignmentType: "FREE_TO_SALE",
        serialNumber: null
      },
      errors: [],
      action: "IMPORT"
    }
  ];
}

function sampleBatch(overrides: Partial<PhysicalBatchSnapshot> = {}): PhysicalBatchSnapshot {
  return {
    id: "batch-1",
    context: "INVENTORY",
    status: "READY",
    originalFileName: "INVENTARIO FISICO 14 AGOSTO 2026.xlsx",
    totalRows: 2,
    validRows: 2,
    invalidRows: 0,
    confirmedAt: null,
    completedAt: null,
    metadata: {
      inventoryMode: "RECONCILE",
      sourceSha256: SHA
    },
    rows: sampleRows(),
    ...overrides
  };
}

function createFakeDb(seed?: {
  qty?: number;
  failAt?: "zero" | "apply" | "serial";
  duplicateSerial?: boolean;
}) {
  const state = {
    inventory: [{ id: "inv-1", qty: d(seed?.qty ?? 18198), reservedQty: d(0) }],
    layers: [{ id: "ly-1", qty: d(seed?.qty ?? 18198), reservedQty: d(0) }],
    serials: [{ id: "s-old", serialNumber: "OLD-SERIAL" }],
    stock: [{ id: "st-1", productId: "p-1", warehouse: "TULTITLAN24", quantity: d(4) }],
    reservations: [{ id: "r-1", status: "ACTIVE" }],
    movements: [{ id: "m-hist" }],
    products: [{ id: "p-1" }, { id: "p-2" }],
    locations: [{ id: "loc-102" }, { id: "loc-202" }],
    users: [{ id: "admin-1" }],
    batch: { id: "batch-1", status: "READY", confirmedAt: null as Date | null, completedAt: null as Date | null, metadata: {} as Record<string, unknown> },
    logs: [] as Array<Record<string, unknown>>,
    deleted: { product: 0, location: 0, user: 0, movement: 0 }
  };

  function sum(rows: Array<Record<string, Prisma.Decimal>>, field: string) {
    return rows.reduce((acc, row) => acc.add(row[field] || d(0)), d(0));
  }

  const tx = {
    $queryRaw: async () => [],
    inventory: {
      count: async ({ where }: { where?: { qty?: { gt: number } } } = {}) => {
        if (where?.qty?.gt === 0) return state.inventory.filter((row) => row.qty.gt(0)).length;
        return state.inventory.length;
      },
      aggregate: async ({ _sum }: { _sum: Record<string, boolean> }) => {
        const key = Object.keys(_sum)[0]!;
        return { _sum: { [key]: sum(state.inventory, key) } };
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
      updateMany: async ({ data }: { data: { qty: number; reservedQty: number } }) => {
        for (const row of state.layers) {
          row.qty = d(data.qty);
          row.reservedQty = d(data.reservedQty);
        }
        return { count: state.layers.length };
      },
      aggregate: async ({ _sum }: { _sum: Record<string, boolean> }) => ({
        _sum: { [Object.keys(_sum)[0]!]: sum(state.layers, Object.keys(_sum)[0]!) }
      }),
      count: async () => state.layers.length
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
    inventoryMovement: {
      count: async () => state.movements.length,
      deleteMany: async () => {
        state.deleted.movement += 1;
        throw new Error("movements.deleteMany forbidden");
      }
    },
    product: {
      count: async () => state.products.length,
      deleteMany: async () => { state.deleted.product += 1; }
    },
    location: {
      count: async () => state.locations.length,
      deleteMany: async () => { state.deleted.location += 1; }
    },
    user: { deleteMany: async () => { state.deleted.user += 1; } },
    importBatch: {
      updateMany: async ({ where, data }: { where: { id: string; status: string }; data: Record<string, unknown> }) => {
        if (state.batch.id !== where.id || state.batch.status !== where.status) return { count: 0 };
        Object.assign(state.batch, data);
        return { count: 1 };
      },
      update: async ({ data }: { data: Record<string, unknown> }) => {
        Object.assign(state.batch, data);
        return state.batch;
      },
      findUnique: async () => state.batch
    },
    activityLog: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        state.logs.push(data);
        return data;
      }
    }
  };

  const snapshot = () => ({
    inventory: cloneRows(state.inventory),
    serials: cloneRows(state.serials),
    reservations: cloneRows(state.reservations),
    batch: { ...state.batch },
    movements: cloneRows(state.movements),
    products: cloneRows(state.products),
    locations: cloneRows(state.locations)
  });

  const db = {
    $transaction: async (fn: (inner: typeof tx) => Promise<unknown>) => {
      const before = snapshot();
      try {
        return await fn(tx);
      } catch (error) {
        state.inventory = cloneRows(before.inventory);
        state.serials = cloneRows(before.serials);
        state.reservations = cloneRows(before.reservations);
        state.batch = { ...before.batch };
        state.movements = cloneRows(before.movements);
        state.products = cloneRows(before.products);
        state.locations = cloneRows(before.locations);
        throw error;
      }
    }
  };

  async function zero(inner: typeof tx) {
    if (seed?.failAt === "zero") throw new Error("zero-fail");
    await inner.inventoryReservation.updateMany({ where: { status: "ACTIVE" }, data: { status: "RELEASED" } });
    await inner.inventory.updateMany({ data: { qty: 0, reservedQty: 0 } });
    await inner.inventoryLayer.updateMany({ data: { qty: 0, reservedQty: 0 } });
    await inner.inventoryStock.updateMany({ data: { quantity: 0 } });
    await inner.inventorySerial.deleteMany();
    return {
      ok: true as const,
      alreadyZero: false,
      inventoriesZeroed: 1,
      qtyCleared: "18198",
      reservedCleared: "0",
      layersZeroed: 1,
      serialsReleased: 1,
      reservationsReleased: 1,
      legacyStockZeroed: 1,
      result: "ZEROED" as const
    };
  }

  async function applyRows() {
    if (seed?.duplicateSerial || seed?.failAt === "serial") {
      throw new ImportExecuteError("SERIAL_DUPLICATE_FILE", 2);
    }
    if (seed?.failAt === "apply") throw new Error("apply-fail");
    const staged = 1201;
    state.inventory[0]!.qty = d(staged);
    state.serials = [{ id: "s-new", serialNumber: "S-ANTENNA" }];
    state.movements.push({ id: "m-new" });
    return {
      results: [{ sourceRow: 1, ok: true }, { sourceRow: 2, ok: true }],
      stagedQty: "1201",
      cubes: 2,
      layers: 2,
      movements: 2,
      serials: 1,
      newProducts: 0
    };
  }

  return { state, db, zero, applyRows };
}

async function runConfirm(
  fake: ReturnType<typeof createFakeDb>,
  batch: PhysicalBatchSnapshot = sampleBatch()
) {
  return executePhysicalInventoryConfirm(
    {
      batchId: batch.id,
      userId: "admin-1",
      confirmation: PHYSICAL_CONFIRM_PHRASE,
      sourceSha256: SHA
    },
    fake.db as never,
    {
      loadBatch: async () => batch,
      liveQty: async () => d(18198),
      zero: fake.zero as never,
      applyRows: fake.applyRows as never,
      rebuildStock: async () => 1,
      restoreReady: async () => {
        fake.state.batch.status = "READY";
        fake.state.batch.confirmedAt = null;
        fake.state.batch.completedAt = null;
      }
    }
  );
}

test("la frase y el SHA son exactos", () => {
  assert.equal(PHYSICAL_CONFIRM_PHRASE, "SUSTITUIR INVENTARIO");
  assert.doesNotThrow(() => assertPhysicalConfirmPhrase("SUSTITUIR INVENTARIO"));
  assert.doesNotThrow(() => assertPhysicalConfirmPhrase("  SUSTITUIR INVENTARIO  "));
  assert.throws(() => assertPhysicalConfirmPhrase("sustituir inventario"), HttpError);
  assert.throws(() => assertPhysicalConfirmPhrase("BORRAR INVENTARIO"), HttpError);
  assert.throws(() => assertSourceSha256("abc"), HttpError);
  assert.equal(assertSourceSha256(SHA.toLowerCase()), SHA);
  assert.throws(() => assertPhysicalShaMatch("FFFF".repeat(16), SHA), HttpError);
  assert.doesNotThrow(() => assertPhysicalShaMatch(SHA, SHA));
});

test("ADMIN exclusivo en prepare/confirm y OPERATOR/CLIENT no ven la UI", () => {
  assert.equal(PHYSICAL_CONFIRM_PATH, "/api/v1/inventory/physical/confirm");
  assert.equal(PHYSICAL_PREPARE_PATH, "/api/v1/inventory/physical/prepare");
  assert.match(prepareBlock, /requireRole\(\["ADMIN"\]\)/);
  assert.match(confirmBlock, /requireRole\(\["ADMIN"\]\)/);
  assert.doesNotMatch(prepareBlock, /OPERATOR|CLIENT|SUPERVISOR/);
  assert.doesNotMatch(confirmBlock, /OPERATOR|CLIENT|SUPERVISOR/);
  assert.match(js, /physicalInventoryReconcileBtns\.forEach\(\(btn\) => \{\s*btn\.classList\.toggle\("hidden", role !== "ADMIN"\)/s);
  assert.match(js, /if \(currentRole !== "ADMIN" \|\| physicalInventoryReconcileBusy\) return/);
});

test("APPEND con inventario no vacío se rechaza y RECONCILE no suma", () => {
  assert.throws(() => assertPhysicalAppendBlocked("APPEND", 18198), (error: unknown) => (
    error instanceof HttpError && error.statusCode === 409
  ));
  assert.doesNotThrow(() => assertPhysicalAppendBlocked("RECONCILE", 18198));
  assert.doesNotThrow(() => assertPhysicalAppendBlocked("APPEND", 0));
  assert.match(importRoutes, /No se puede confirmar un lote físico APPEND sobre inventario no vacío/);
  assert.match(importRoutes, /physical\/confirm/);
});

test("el lote APPEND READY no es confirmable por el flujo genérico de inventario", () => {
  assert.equal(inventoryModeOf({ metadata: { inventoryMode: "APPEND" } }), "APPEND");
  const append = sampleBatch({ metadata: { inventoryMode: "APPEND" } });
  assert.doesNotThrow(() => assertPhysicalBatchReady(append));
  assert.throws(() => assertPhysicalAppendBlocked("APPEND", "18198"), HttpError);
});

test("AN102/202, AN103/203 y AN104/204 permanecen separadas", () => {
  assert.doesNotThrow(() => assertAnLocationsRemainSeparate(sampleRows()));
  assert.throws(
    () => assertAnLocationsRemainSeparate([
      sampleRows()[0]!,
      {
        ...sampleRows()[1]!,
        normalized: {
          ...(sampleRows()[1]!.normalized as Record<string, unknown>),
          sku: "AND-VHLP4-11-NC3",
          location: "AN202"
        }
      }
    ]),
    HttpError
  );
});

test("los 685 warnings informativos no descartan filas ni cambian cantidades", () => {
  assert.match(validateSrc, /code: "PRODUCT_PROJECT_LINK_REQUIRED"/);
  assert.match(validateSrc, /severity: "WARNING"/);
  assert.match(validateSrc, /code: "NEW_SKU"/);
  assert.match(validateSrc, /code: "PRICE_REVIEW_REQUIRED"/);
  assert.match(validateSrc, /normalized\[priceField\] = null/);
  assert.doesNotMatch(validateSrc, /qty:.+PRODUCT_PROJECT_LINK_REQUIRED/);
  const totals = stagedInventoryTotals(sampleRows());
  assert.equal(String(totals.qty), "1201");
  assert.equal(totals.locations, 2);
  assert.equal(totals.serialized, 1);
});

test("RECONCILE reemplaza, no suma, y conserva catálogos e historial", async () => {
  const fake = createFakeDb();
  const result = await runConfirm(fake);
  assert.equal(result.alreadyApplied, false);
  assert.equal(result.status, "COMPLETED");
  assert.equal(result.after.qty, "1201");
  assert.notEqual(result.after.qty, "19400");
  assert.equal(String(fake.state.inventory[0]!.qty), "1201");
  assert.equal(fake.state.serials[0]!.serialNumber, "S-ANTENNA");
  assert.equal(fake.state.serials.some((row) => row.serialNumber === "OLD-SERIAL"), false);
  assert.equal(fake.state.movements.some((row) => row.id === "m-hist"), true);
  assert.equal(fake.state.products.length, 2);
  assert.equal(fake.state.locations.length, 2);
  assert.equal(fake.state.deleted.product, 0);
  assert.equal(fake.state.deleted.movement, 0);
  assert.equal(fake.state.logs.some((row) => row.subtype === "PHYSICAL_CONFIRM"), true);
  assert.equal(fake.state.batch.status, "COMPLETED");
});

test("un fallo intermedio hace rollback completo y deja el lote READY", async () => {
  const fake = createFakeDb({ failAt: "apply" });
  await assert.rejects(() => runConfirm(fake), /apply-fail/);
  assert.equal(String(fake.state.inventory[0]!.qty), "18198");
  assert.equal(fake.state.serials[0]!.serialNumber, "OLD-SERIAL");
  assert.equal(fake.state.reservations[0]!.status, "ACTIVE");
  assert.equal(fake.state.batch.status, "READY");
  assert.equal(fake.state.batch.confirmedAt, null);
  assert.equal(isPhysicalResetInFlight(), false);
});

test("serial duplicado hace rollback y no deja ocupación a medias", async () => {
  const fake = createFakeDb({ duplicateSerial: true });
  await assert.rejects(
    () => runConfirm(fake),
    (error: unknown) => error instanceof HttpError || error instanceof ImportExecuteError
  );
  assert.equal(String(fake.state.inventory[0]!.qty), "18198");
  assert.equal(fake.state.serials[0]!.serialNumber, "OLD-SERIAL");
  assert.equal(fake.state.batch.status, "READY");
});

test("la segunda confirmación no duplica inventario", async () => {
  const fake = createFakeDb();
  const first = await runConfirm(fake);
  assert.equal(first.alreadyApplied, false);
  const completed = sampleBatch({
    status: "COMPLETED",
    confirmedAt: new Date(),
    completedAt: new Date(),
    metadata: {
      inventoryMode: "RECONCILE",
      sourceSha256: SHA,
      physicalConfirm: { before: first.before, after: first.after, applied: first.applied }
    }
  });
  const second = await executePhysicalInventoryConfirm(
    {
      batchId: "batch-1",
      userId: "admin-1",
      confirmation: PHYSICAL_CONFIRM_PHRASE,
      sourceSha256: SHA
    },
    fake.db as never,
    {
      loadBatch: async () => completed,
      liveQty: async () => d(1201),
      restoreReady: async () => undefined
    }
  );
  assert.equal(second.alreadyApplied, true);
  assert.equal(String(fake.state.inventory[0]!.qty), "1201");
  assert.equal(fake.state.serials.filter((row) => row.serialNumber === "S-ANTENNA").length, 1);
});

test("frase incorrecta, SHA incorrecto y lote APPEND se rechazan sin escribir", async () => {
  const fake = createFakeDb();
  await assert.rejects(
    () => executePhysicalInventoryConfirm({
      batchId: "batch-1",
      userId: "admin-1",
      confirmation: "BORRAR INVENTARIO",
      sourceSha256: SHA
    }, fake.db as never, { loadBatch: async () => sampleBatch(), liveQty: async () => d(18198), restoreReady: async () => undefined }),
    (error: unknown) => error instanceof HttpError && error.statusCode === 400
  );
  await assert.rejects(
    () => executePhysicalInventoryConfirm({
      batchId: "batch-1",
      userId: "admin-1",
      confirmation: PHYSICAL_CONFIRM_PHRASE,
      sourceSha256: "0".repeat(64)
    }, fake.db as never, { loadBatch: async () => sampleBatch(), liveQty: async () => d(18198), restoreReady: async () => undefined }),
    (error: unknown) => error instanceof HttpError && error.statusCode === 400
  );
  await assert.rejects(
    () => executePhysicalInventoryConfirm({
      batchId: "batch-1",
      userId: "admin-1",
      confirmation: PHYSICAL_CONFIRM_PHRASE,
      sourceSha256: SHA
    }, fake.db as never, {
      loadBatch: async () => sampleBatch({ metadata: { inventoryMode: "APPEND", sourceSha256: SHA } }),
      liveQty: async () => d(18198),
      restoreReady: async () => undefined
    }),
    (error: unknown) => error instanceof HttpError && error.statusCode === 409
  );
  assert.equal(String(fake.state.inventory[0]!.qty), "18198");
});

test("la UI administrativa de conciliación existe y no llama reset ni confirm genérico", () => {
  assert.match(html, /id="physicalInventoryPrepareBtn"/);
  assert.match(html, /id="physicalInventoryConfirmBtn"/);
  assert.match(html, /id="physicalInventoryPrepareModal"/);
  assert.match(html, /id="physicalInventoryConfirmModal"/);
  assert.match(html, /Escribe <strong>SUSTITUIR INVENTARIO<\/strong> para confirmar/);
  assert.match(js, /\/api\/v1\/inventory\/physical\/prepare/);
  assert.match(js, /\/api\/v1\/inventory\/physical\/confirm/);
  assert.match(js, /La carga física se sustituye con Sustituir inventario/);
  assert.doesNotMatch(js.slice(js.indexOf("runPhysicalInventoryConfirm")), /\/physical\/reset/);
  assert.doesNotMatch(js.slice(js.indexOf("async function runPhysicalInventoryConfirm")), /\/api\/imports\/\$\{currentImportId\}\/confirm/);
});
