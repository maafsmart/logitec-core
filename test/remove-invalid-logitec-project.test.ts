import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { Prisma } from "@prisma/client";
import { isForbiddenInventoryProjectRecord } from "../src/modules/inventory/inventory-project-rules.js";
import {
  INVALID_LOGITEC_PROJECT_CODE,
  auditInvalidLogitecProject,
  executeRemoveInvalidLogitecProject,
  planRemoveInvalidLogitecProject,
  snapshotGlobalCounts,
  snapshotsMatchOperationalData
} from "../src/modules/master-data/remove-invalid-logitec-project.service.js";
import { assertAllowedMasterLabel } from "../src/modules/master-data/master-data.service.js";

const html = readFileSync(new URL("../public/dashboard.html", import.meta.url), "utf8");
const seedSrc = readFileSync(new URL("../prisma/seed.ts", import.meta.url), "utf8");
const migrationPhase1 = readFileSync(
  new URL("../prisma/migrations/20260509001000_wms_core_phase1/migration.sql", import.meta.url),
  "utf8"
);

const LOGITEC_ID = "proj-logitec";
const ATT_ID = "proj-att";
const AVIAT_CLIENT = "client-aviat";

type Row = {
  products: Array<{ id: string; sku: string; customerId: string | null }>;
  productProjects: Array<{ id: string; productId: string; projectId: string; active: boolean }>;
  customers: Array<{ id: string; clientId: string; code: string; name: string; active: boolean; createdAt: Date }>;
  inventories: Array<{
    id: string;
    productId: string;
    projectId: string | null;
    assignmentType: "PROJECT" | "FREE_TO_SALE" | "LEGACY_UNASSIGNED";
    qty: Prisma.Decimal;
    reservedQty: Prisma.Decimal;
  }>;
  activityLogs: Array<{ id: string; customerId: string | null }>;
};

function cloneRow(initial: Row): Row {
  return {
    products: initial.products.map((row) => ({ ...row })),
    productProjects: initial.productProjects.map((row) => ({ ...row })),
    customers: initial.customers.map((row) => ({ ...row, createdAt: new Date(row.createdAt) })),
    inventories: initial.inventories.map((row) => ({
      ...row,
      qty: new Prisma.Decimal(row.qty),
      reservedQty: new Prisma.Decimal(row.reservedQty)
    })),
    activityLogs: initial.activityLogs.map((row) => ({ ...row }))
  };
}

function makeDb(initial: Row) {
  const state = cloneRow(initial);
  const db = {
    inventory: {
      aggregate: async ({ where, _sum }: { where?: { projectId?: string }; _sum?: { qty?: boolean } }) => {
        const rows = state.inventories.filter((row) => !where?.projectId || row.projectId === where.projectId);
        if (_sum?.qty) {
          const total = rows.reduce((acc, row) => acc.plus(row.qty), new Prisma.Decimal(0));
          return { _sum: { qty: total } };
        }
        return { _sum: { qty: new Prisma.Decimal(0) } };
      },
      count: async ({ where }: { where?: { projectId?: string; productId?: { in?: string[] }; assignmentType?: string } } = {}) => {
        return state.inventories.filter((row) => {
          if (where?.projectId && row.projectId !== where.projectId) return false;
          if (where?.productId?.in && !where.productId.in.includes(row.productId)) return false;
          if (where?.assignmentType && row.assignmentType !== where.assignmentType) return false;
          return true;
        }).length;
      },
      findMany: async ({
        where
      }: {
        where: {
          productId?: { in?: string[] };
          assignmentType?: string;
          projectId?: { not: null };
        };
      }) => {
        return state.inventories
          .filter((row) => {
            if (where.productId?.in && !where.productId.in.includes(row.productId)) return false;
            if (where.assignmentType && row.assignmentType !== where.assignmentType) return false;
            if (where.projectId?.not === null && row.projectId == null) return false;
            return true;
          })
          .map((row) => ({
            ...row,
            project: state.customers.find((c) => c.id === row.projectId) || null,
            product: state.products.find((p) => p.id === row.productId)!
          }));
      }
    },
    product: {
      count: async ({ where }: { where?: { customerId?: string | null } } = {}) => {
        return state.products.filter((row) =>
          where?.customerId === undefined ? true : row.customerId === where.customerId
        ).length;
      },
      findMany: async ({ where }: { where: { customerId: string } }) =>
        state.products.filter((row) => row.customerId === where.customerId),
      updateMany: async ({ where, data }: { where: { customerId: string }; data: { customerId: null } }) => {
        let count = 0;
        for (const row of state.products) {
          if (row.customerId === where.customerId) {
            row.customerId = data.customerId;
            count += 1;
          }
        }
        return { count };
      }
    },
    productProject: {
      count: async ({ where }: { where?: { projectId?: string; productId?: { in?: string[] } } } = {}) =>
        state.productProjects.filter((row) => {
          if (where?.projectId && row.projectId !== where.projectId) return false;
          if (where?.productId?.in && !where.productId.in.includes(row.productId)) return false;
          return true;
        }).length,
      findMany: async ({ where }: { where: { OR: Array<{ productId: string; projectId: string }> } }) =>
        state.productProjects.filter((row) =>
          where.OR.some((part) => part.productId === row.productId && part.projectId === row.projectId)
        ),
      deleteMany: async ({ where }: { where: { projectId: string } }) => {
        const before = state.productProjects.length;
        state.productProjects = state.productProjects.filter((row) => row.projectId !== where.projectId);
        return { count: before - state.productProjects.length };
      }
    },
    customer: {
      findFirst: async ({ where }: { where: { OR: Array<{ code?: { equals: string; mode: string }; name?: { equals: string; mode: string } }> } }) => {
        return (
          state.customers.find(
            (row) =>
              row.code.toUpperCase() === INVALID_LOGITEC_PROJECT_CODE ||
              row.name.toUpperCase() === INVALID_LOGITEC_PROJECT_CODE
          ) || null
        );
      },
      count: async ({ where }: { where?: { OR?: Array<{ code?: { equals: string; mode: string }; name?: { equals: string; mode: string } }> } } = {}) => {
        if (!where?.OR) return state.customers.length;
        return state.customers.filter(
          (row) =>
            row.code.toUpperCase() === INVALID_LOGITEC_PROJECT_CODE ||
            row.name.toUpperCase() === INVALID_LOGITEC_PROJECT_CODE
        ).length;
      },
      delete: async ({ where }: { where: { id: string } }) => {
        state.customers = state.customers.filter((row) => row.id !== where.id);
        for (const log of state.activityLogs) {
          if (log.customerId === where.id) log.customerId = null;
        }
      }
    },
    inventoryMovement: { count: async () => 4363 },
    inventorySerial: { count: async () => 1702 },
    importBatch: { count: async () => 10 },
    requisition: { count: async () => 0 },
    inventoryReservation: { count: async () => 0 },
    task: { count: async () => 0 },
    activityLog: {
      count: async ({ where }: { where?: { customerId?: string } } = {}) =>
        state.activityLogs.filter((row) => (where?.customerId ? row.customerId === where.customerId : true)).length
    },
    $transaction: async (fn: (tx: typeof db) => Promise<unknown>) => fn(db)
  };
  return { db, state };
}

function fixture(): Row {
  return {
    customers: [
      {
        id: LOGITEC_ID,
        clientId: AVIAT_CLIENT,
        code: "LOGITEC",
        name: "LOGITEC",
        active: true,
        createdAt: new Date("2026-07-16T20:45:02.023Z")
      },
      {
        id: ATT_ID,
        clientId: AVIAT_CLIENT,
        code: "ATT",
        name: "AT&T",
        active: true,
        createdAt: new Date("2026-07-01T00:00:00.000Z")
      }
    ],
    products: [
      { id: "prod-1", sku: "SKU-1", customerId: LOGITEC_ID },
      { id: "prod-2", sku: "SKU-2", customerId: LOGITEC_ID }
    ],
    productProjects: [
      { id: "pp-bad-1", productId: "prod-1", projectId: LOGITEC_ID, active: true },
      { id: "pp-bad-2", productId: "prod-2", projectId: LOGITEC_ID, active: true },
      { id: "pp-good-1", productId: "prod-1", projectId: ATT_ID, active: true }
    ],
    inventories: [
      {
        id: "inv-1",
        productId: "prod-1",
        projectId: ATT_ID,
        assignmentType: "PROJECT",
        qty: new Prisma.Decimal(20),
        reservedQty: new Prisma.Decimal(0)
      }
    ],
    activityLogs: [{ id: "log-1", customerId: LOGITEC_ID }]
  };
}

test("A) proyecto LOGITEC inexistente después de remover", async () => {
  const { db, state } = makeDb(fixture());
  const result = await executeRemoveInvalidLogitecProject(db as never);
  assert.equal(result.applied.customerDeleted, true);
  assert.equal(state.customers.some((row) => row.code === "LOGITEC"), false);
});

test("B) seed/bootstrap no recrea LOGITEC como proyecto", () => {
  assert.doesNotMatch(seedSrc, /customer\.create[\s\S]{0,120}LOGITEC/);
  assert.doesNotMatch(seedSrc, /customer\.upsert[\s\S]{0,120}LOGITEC/);
  assert.throws(() => assertAllowedMasterLabel("LOGITEC", "LOGITEC"));
});

test("C) listados operativos excluyen LOGITEC como proyecto", () => {
  assert.equal(isForbiddenInventoryProjectRecord({ code: "LOGITEC", name: "LOGITEC" }), true);
  assert.match(migrationPhase1, /customer_logitec_default/);
});

test("D) no quedan FK huérfanas al remover LOGITEC", async () => {
  const { db, state } = makeDb(fixture());
  await executeRemoveInvalidLogitecProject(db as never);
  assert.equal(state.productProjects.some((row) => row.projectId === LOGITEC_ID), false);
  assert.equal(state.products.some((row) => row.customerId === LOGITEC_ID), false);
  assert.equal(state.activityLogs[0]?.customerId, null);
});

test("E-H) piezas/saldos/productos/movimientos/seriales/ImportBatch preservados", async () => {
  const { db } = makeDb(fixture());
  const before = await snapshotGlobalCounts(db as never);
  const result = await executeRemoveInvalidLogitecProject(db as never);
  assert.equal(snapshotsMatchOperationalData(before, result.after), true);
  assert.equal(result.after.piezas, "20");
  assert.equal(result.after.saldos, 1);
  assert.equal(result.after.productos, 2);
  assert.equal(result.after.movimientos, 4363);
  assert.equal(result.after.seriales, 1702);
  assert.equal(result.after.importBatch, 10);
});

test("J) AVIAT y proyectos reales siguen intactos", async () => {
  const { db, state } = makeDb(fixture());
  await executeRemoveInvalidLogitecProject(db as never);
  assert.ok(state.customers.some((row) => row.code === "ATT"));
  assert.ok(state.productProjects.some((row) => row.projectId === ATT_ID));
});

test("K) marca LOGITEC CORE WMS intacta", () => {
  assert.match(html, /LOGITEC CORE WMS/);
});

test("plan bloquea si falta ProductProject real o hay inventario en LOGITEC", async () => {
  const base = fixture();
  base.productProjects = base.productProjects.filter((row) => row.projectId !== ATT_ID);
  const { db } = makeDb(base);
  const plan = await planRemoveInvalidLogitecProject(db as never);
  assert.equal(plan.safetyPass, false);
  assert.ok(plan.blockingReasons.some((reason) => reason.includes("Missing")));
});

test("audit detecta proyecto LOGITEC y referencias", async () => {
  const { db } = makeDb(fixture());
  const audit = await auditInvalidLogitecProject(db as never);
  assert.equal(audit.project?.id, LOGITEC_ID);
  assert.equal(Number(audit.refs.productsAsOwner), 2);
  assert.equal(audit.missingRealProjectLinks.length, 0);
});
