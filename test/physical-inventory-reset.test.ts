import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { Prisma } from "@prisma/client";
import { HttpError } from "../src/shared/http-error.js";
import {
  PHYSICAL_RESET_CONFIRMATION,
  PHYSICAL_RESET_PATH,
  FORBIDDEN_LEGACY_PROJECT_PRESENT,
  FORBIDDEN_LEGACY_PROJECT_MESSAGE,
  previewPhysicalInventoryReset,
  applyPhysicalInventoryPurge,
  assertPhysicalResetConfirmation,
  assertPhysicalResetFinalConfirmation,
  assertTenantInventoryResetAllowed,
  executePhysicalInventoryReset,
  isPhysicalResetInFlight,
  isTenantInventoryResetAllowed,
  PHYSICAL_RESET_ADVISORY_LOCK_CLASS
} from "../src/modules/inventory/physical-reset.service.js";

const html = readFileSync(new URL("../public/dashboard.html", import.meta.url), "utf8");
const js = readFileSync(new URL("../public/dashboard.js", import.meta.url), "utf8");
const routes = readFileSync(new URL("../src/modules/inventory/inventory.routes.ts", import.meta.url), "utf8");
const appSrc = readFileSync(new URL("../src/app.ts", import.meta.url), "utf8");
const serviceSrc = readFileSync(new URL("../src/modules/inventory/physical-reset.service.ts", import.meta.url), "utf8");
const envExample = readFileSync(new URL("../.env.example", import.meta.url), "utf8");

const resetBlock = routes.slice(
  routes.indexOf('inventoryRouter.get("/physical/reset/preview"'),
  routes.indexOf('inventoryRouter.post("/import"')
);

const AVIAT_ID = "client-aviat";
const OTHER_ID = "client-2";

const AVIAT_OFFICIAL_PROJECTS = [
  { id: "proj-airbus", code: "AIRBUS_SLC", name: "AIRBUS_SLC" },
  { id: "proj-att", code: "ATT_COMUNICACIONES_DIGITALES", name: "ATT_COMUNICACIONES_DIGITALES" },
  { id: "proj-aviat-net", code: "AVIAT_NETWORKS", name: "AVIAT_NETWORKS" },
  { id: "proj-interatum", code: "INTERATUM_OFFSHORE", name: "INTERATUM_OFFSHORE" },
  { id: "proj-operbes", code: "OPERBES", name: "OPERBES" },
  { id: "proj-radiomovil", code: "RADIOMOVIL_DIPSA", name: "RADIOMOVIL_DIPSA" },
  { id: "proj-sym", code: "SYM_SERVICIOS_INTEGRALES", name: "SYM_SERVICIOS_INTEGRALES" },
  { id: "proj-telmex", code: "TELEFONOS_DE_MEXICO_S_A_B_DE_C_V", name: "TELEFONOS_DE_MEXICO_S_A_B_DE_C_V" },
  { id: "proj-triple", code: "TRIPLE_PLAY_SYSTEMS_DE_MEXICO", name: "TRIPLE_PLAY_SYSTEMS_DE_MEXICO" }
] as const;

function officialAviatCustomers() {
  return AVIAT_OFFICIAL_PROJECTS.map((row) => ({ ...row, clientId: AVIAT_ID, active: true }));
}

/** LEGACY_INVALID fixture only — not a valid AVIAT master. */
const LEGACY_INVALID_LOGITEC = {
  id: "proj-logitec-LEGACY_INVALID",
  clientId: AVIAT_ID,
  code: "LOGITEC",
  name: "LOGITEC",
  active: true
};

function d(n: number) {
  return new Prisma.Decimal(n);
}

function cloneRows<T>(rows: T[]): T[] {
  return rows.map((row) => ({ ...row }));
}

function createFakeTx(seed?: Partial<{
  inventory: Array<{ id: string; clientId: string; qty: Prisma.Decimal; reservedQty: Prisma.Decimal }>;
  layers: Array<{ id: string; clientId?: string; qty: Prisma.Decimal; reservedQty: Prisma.Decimal }>;
  serials: Array<{ id: string; clientId: string; serialNumber: string }>;
  stock: Array<{ id: string; quantity: Prisma.Decimal }>;
  reservations: Array<{ id: string; clientId?: string; status: string }>;
  movements: Array<{ id: string; clientId: string; taskId?: string | null }>;
  scans: Array<{ id: string; clientId: string }>;
  activity: Array<{ id: string; clientId: string }>;
  requisitions: Array<{ id: string; clientId: string }>;
  tasks: Array<{ id: string; clientId?: string }>;
  productProjects: Array<{ id: string; clientId: string; productId?: string; projectId?: string }>;
  importBatches: Array<{ id: string; clientId: string }>;
  products: Array<{ id: string; customerId?: string | null }>;
  customers: Array<{ id: string; clientId: string; code: string; name: string }>;
  warehouses: Array<{ id: string }>;
  clients: Array<{ id: string; code: string; name: string; tradeName: string; legalName: string }>;
}>) {
  const state = {
    inventory: cloneRows(seed?.inventory || [
      { id: "inv-1", clientId: AVIAT_ID, qty: d(10), reservedQty: d(2) }
    ]),
    layers: cloneRows(seed?.layers || [{ id: "ly-1", clientId: AVIAT_ID, qty: d(10), reservedQty: d(0) }]),
    serials: cloneRows(seed?.serials || [{ id: "s-1", clientId: AVIAT_ID, serialNumber: "1659" }]),
    stock: cloneRows(seed?.stock || [{ id: "st-1", quantity: d(4) }]),
    reservations: cloneRows(seed?.reservations || [{ id: "r-1", clientId: AVIAT_ID, status: "ACTIVE" }]),
    movements: cloneRows(seed?.movements || [{ id: "m-1", clientId: AVIAT_ID, taskId: "t-1" }]),
    scans: cloneRows(seed?.scans || [{ id: "sc-1", clientId: AVIAT_ID }]),
    activity: cloneRows(seed?.activity || [{ id: "a-1", clientId: AVIAT_ID }]),
    requisitions: cloneRows(seed?.requisitions || [{ id: "rq-1", clientId: AVIAT_ID }]),
    tasks: cloneRows(seed?.tasks || [{ id: "t-1", clientId: AVIAT_ID }]),
    productProjects: cloneRows(seed?.productProjects || [
      { id: "pp-1", clientId: AVIAT_ID, productId: "p-1", projectId: "proj-airbus" }
    ]),
    importBatches: cloneRows(seed?.importBatches || [{ id: "ib-1", clientId: AVIAT_ID }]),
    products: cloneRows(seed?.products || [{ id: "p-1", customerId: "proj-airbus" }]),
    customers: cloneRows(seed?.customers || officialAviatCustomers()),
    warehouses: cloneRows(seed?.warehouses || [{ id: "wh-1" }]),
    clients: cloneRows(seed?.clients || [
      { id: AVIAT_ID, code: "AVIAT", name: "AVIAT", tradeName: "AVIAT", legalName: "AVIAT" }
    ]),
    locations: [{ id: "l-1" }],
    users: [{ id: "u-1" }],
    logs: [] as Array<Record<string, unknown>>,
    deleted: {
      product: 0,
      location: 0,
      user: 0
    }
  };

  function clientIdFromWhere(where: unknown): string | undefined {
    if (!where || typeof where !== "object") return undefined;
    const record = where as Record<string, unknown>;
    if (typeof record.clientId === "string") return record.clientId;
    if (record.inventory && typeof record.inventory === "object") {
      return clientIdFromWhere(record.inventory);
    }
    if (record.project && typeof record.project === "object") {
      return clientIdFromWhere(record.project);
    }
    if (Array.isArray(record.OR)) {
      for (const part of record.OR) {
        const found = clientIdFromWhere(part);
        if (found) return found;
      }
    }
    if (Array.isArray(record.AND)) {
      for (const part of record.AND) {
        const found = clientIdFromWhere(part);
        if (found) return found;
      }
    }
    return undefined;
  }

  function sum(rows: Array<Record<string, unknown>>, field: string, clientId?: string) {
    return rows
      .filter((row) => !clientId || row.clientId === clientId)
      .reduce((acc, row) => acc.add((row[field] as Prisma.Decimal) || d(0)), d(0));
  }

  function scopedDelete<T extends { clientId?: string }>(rows: T[], where: unknown) {
    const clientId = clientIdFromWhere(where);
    const kept = clientId ? rows.filter((row) => row.clientId !== clientId) : [];
    return { next: kept, count: rows.length - kept.length };
  }

  const emptyCount = { count: 0 };

  const tx = {
    client: {
      findMany: async () => state.clients
    },
    customer: {
      findMany: async ({ where }: { where?: { clientId?: string } }) =>
        state.customers.filter((row) => !where?.clientId || row.clientId === where.clientId),
      delete: async () => {
        throw new Error("customer.delete forbidden");
      },
      count: async ({ where }: { where?: { projectId?: string; clientId?: string } }) => {
        if (where && "projectId" in (where as object) && (where as { projectId?: string }).projectId) {
          return state.customers.filter((row) => row.id === (where as { projectId: string }).projectId).length;
        }
        return state.customers.length;
      }
    },
    inventory: {
      aggregate: async ({ where, _sum }: { where?: unknown; _sum: Record<string, boolean> }) => {
        const key = Object.keys(_sum)[0]!;
        return { _sum: { [key]: sum(state.inventory, key, clientIdFromWhere(where)) } };
      },
      count: async ({ where }: { where?: unknown } = {}) => {
        const clientId = clientIdFromWhere(where);
        if ((where as { projectId?: string } | undefined)?.projectId) {
          return 0;
        }
        return clientId ? state.inventory.filter((row) => row.clientId === clientId).length : state.inventory.length;
      },
      updateMany: async () => {
        throw new Error("inventory.updateMany forbidden");
      },
      deleteMany: async ({ where }: { where?: unknown }) => {
        const result = scopedDelete(state.inventory, where);
        state.inventory = result.next;
        return { count: result.count };
      }
    },
    inventoryLayer: {
      aggregate: async ({ _sum }: { _sum: Record<string, boolean> }) => {
        const key = Object.keys(_sum)[0]!;
        return { _sum: { [key]: sum(state.layers, key) } };
      },
      count: async ({ where }: { where?: unknown } = {}) => {
        const clientId = clientIdFromWhere(where);
        return clientId ? state.layers.filter((row) => !row.clientId || row.clientId === clientId).length : state.layers.length;
      },
      updateMany: async () => {
        throw new Error("inventoryLayer.updateMany forbidden");
      },
      deleteMany: async ({ where }: { where?: unknown }) => {
        const clientId = clientIdFromWhere(where);
        if (!clientId) {
          const count = state.layers.length;
          state.layers = [];
          return { count };
        }
        const kept = state.layers.filter((row) => row.clientId && row.clientId !== clientId);
        const count = state.layers.length - kept.length;
        state.layers = kept;
        return { count };
      }
    },
    inventorySerial: {
      count: async ({ where }: { where?: unknown } = {}) => {
        const clientId = clientIdFromWhere(where);
        return clientId ? state.serials.filter((row) => row.clientId === clientId).length : state.serials.length;
      },
      deleteMany: async ({ where }: { where?: unknown }) => {
        const result = scopedDelete(state.serials, where);
        state.serials = result.next;
        return { count: result.count };
      }
    },
    inventoryStock: {
      count: async () => state.stock.length,
      findMany: async () => {
        throw new Error("inventoryStock.findMany forbidden");
      },
      deleteMany: async () => {
        throw new Error("inventoryStock.deleteMany forbidden");
      }
    },
    inventoryReservation: {
      count: async ({ where }: { where?: unknown } = {}) => {
        const clientId = clientIdFromWhere(where);
        return clientId
          ? state.reservations.filter((row) => !row.clientId || row.clientId === clientId).length
          : state.reservations.length;
      },
      updateMany: async () => {
        throw new Error("inventoryReservation.updateMany forbidden");
      },
      deleteMany: async ({ where }: { where?: unknown }) => {
        const clientId = clientIdFromWhere(where);
        if (!clientId) {
          const count = state.reservations.length;
          state.reservations = [];
          return { count };
        }
        const kept = state.reservations.filter((row) => row.clientId && row.clientId !== clientId);
        const count = state.reservations.length - kept.length;
        state.reservations = kept;
        return { count };
      }
    },
    inventoryMovement: {
      count: async ({ where }: { where?: unknown } = {}) => {
        const clientId = clientIdFromWhere(where);
        if (where && typeof where === "object" && ("OR" in (where as object))) {
          return 0;
        }
        return clientId ? state.movements.filter((row) => row.clientId === clientId).length : state.movements.length;
      },
      findMany: async () => state.movements,
      updateMany: async () => emptyCount,
      deleteMany: async ({ where }: { where?: unknown }) => {
        const result = scopedDelete(state.movements, where);
        state.movements = result.next;
        return { count: result.count };
      }
    },
    scanEvent: {
      count: async ({ where }: { where?: unknown } = {}) => {
        const clientId = clientIdFromWhere(where);
        return clientId ? state.scans.filter((row) => row.clientId === clientId).length : state.scans.length;
      },
      findMany: async () => state.scans,
      deleteMany: async ({ where }: { where?: unknown }) => {
        const result = scopedDelete(state.scans, where);
        state.scans = result.next;
        return { count: result.count };
      }
    },
    activityLog: {
      count: async ({ where }: { where?: { clientId?: string; customerId?: string } } = {}) => {
        if (where?.customerId) return 0;
        const clientId = where?.clientId;
        return clientId ? state.activity.filter((row) => row.clientId === clientId).length : state.activity.length;
      },
      deleteMany: async ({ where }: { where?: unknown }) => {
        const result = scopedDelete(state.activity, where);
        state.activity = result.next;
        return { count: result.count };
      },
      create: async ({ data }: { data: Record<string, unknown> }) => {
        state.logs.push(data);
        return data;
      }
    },
    requisition: {
      count: async ({ where }: { where?: unknown } = {}) => {
        const clientId = clientIdFromWhere(where);
        if ((where as { projectId?: string } | undefined)?.projectId) return 0;
        return clientId ? state.requisitions.filter((row) => row.clientId === clientId).length : state.requisitions.length;
      },
      findMany: async () => state.requisitions,
      deleteMany: async ({ where }: { where?: unknown }) => {
        const result = scopedDelete(state.requisitions, where);
        state.requisitions = result.next;
        return { count: result.count };
      }
    },
    task: {
      count: async ({ where }: { where?: unknown } = {}) => {
        const clientId = clientIdFromWhere(where);
        return clientId ? state.tasks.filter((row) => !row.clientId || row.clientId === clientId).length : state.tasks.length;
      },
      findMany: async ({ where }: { where?: unknown } = {}) => {
        const clientId = clientIdFromWhere(where);
        return state.tasks
          .filter((row) => !clientId || row.clientId === clientId)
          .map((row) => ({ id: row.id }));
      },
      updateMany: async () => emptyCount,
      deleteMany: async ({ where }: { where?: { id?: { in: string[] } } }) => {
        if (where?.id?.in) {
          const drop = new Set(where.id.in);
          const kept = state.tasks.filter((row) => !drop.has(row.id));
          const count = state.tasks.length - kept.length;
          state.tasks = kept;
          return { count };
        }
        const count = state.tasks.length;
        state.tasks = [];
        return { count };
      }
    },
    productProject: {
      count: async ({ where }: { where?: unknown } = {}) => {
        const clientId = clientIdFromWhere(where);
        const projectId = (where as { projectId?: string } | undefined)?.projectId;
        if (projectId) return state.productProjects.filter((row) => row.projectId === projectId).length;
        return clientId ? state.productProjects.filter((row) => row.clientId === clientId).length : state.productProjects.length;
      },
      deleteMany: async () => {
        throw new Error("productProject.deleteMany forbidden");
      }
    },
    importBatch: {
      count: async ({ where }: { where?: unknown } = {}) => {
        const clientId = clientIdFromWhere(where);
        return clientId
          ? state.importBatches.filter((row) => row.clientId === clientId).length
          : state.importBatches.length;
      },
      deleteMany: async ({ where }: { where?: unknown } = {}) => {
        const clientId = clientIdFromWhere(where);
        if (!clientId) {
          throw new Error("importBatch.deleteMany requires clientId");
        }
        const kept = state.importBatches.filter((row) => row.clientId !== clientId);
        const count = state.importBatches.length - kept.length;
        state.importBatches = kept;
        return { count };
      }
    },
    product: {
      count: async ({ where }: { where?: { customerId?: string } } = {}) => {
        if (where?.customerId) return state.products.filter((row) => row.customerId === where.customerId).length;
        return state.products.filter((row) => !row.customerId).length;
      },
      updateMany: async () => {
        throw new Error("product.customerId mutation forbidden");
      },
      deleteMany: async () => {
        state.deleted.product += 1;
      },
      findMany: async () => state.products
    },
    location: { deleteMany: async () => { state.deleted.location += 1; } },
    user: { deleteMany: async () => { state.deleted.user += 1; } },
    $queryRaw: async () => [{ locked: true }]
  };

  return { state, tx };
}

function withResetFlag<T>(enabled: boolean, fn: () => T): T {
  const previous = process.env.ALLOW_TENANT_INVENTORY_RESET;
  process.env.ALLOW_TENANT_INVENTORY_RESET = enabled ? "true" : "false";
  const restore = () => {
    if (previous === undefined) delete process.env.ALLOW_TENANT_INVENTORY_RESET;
    else process.env.ALLOW_TENANT_INVENTORY_RESET = previous;
  };
  try {
    const result = fn();
    if (result && typeof (result as { then?: unknown }).then === "function") {
      return (result as Promise<unknown>).finally(restore) as T;
    }
    restore();
    return result;
  } catch (error) {
    restore();
    throw error;
  }
}

test("la frase de confirmación es exacta y no admite N/A ni variantes", () => {
  assert.equal(PHYSICAL_RESET_CONFIRMATION, "BORRAR INVENTARIO DE AVIAT");
  assert.doesNotThrow(() => assertPhysicalResetConfirmation("BORRAR INVENTARIO DE AVIAT"));
  assert.doesNotThrow(() => assertPhysicalResetFinalConfirmation("BORRAR INVENTARIO DE AVIAT", "BORRAR INVENTARIO DE AVIAT"));
  assert.throws(() => assertPhysicalResetConfirmation("BORRAR INVENTARIO"), HttpError);
  assert.throws(() => assertPhysicalResetConfirmation("borrar inventario de aviat"), HttpError);
  assert.throws(() => assertPhysicalResetFinalConfirmation("BORRAR INVENTARIO DE AVIAT", "BORRAR INVENTARIO"), HttpError);
});

test("el flag de inicialización rechaza el reinicio cuando está apagado", () => {
  withResetFlag(false, () => {
    assert.equal(isTenantInventoryResetAllowed(), false);
    assert.throws(() => assertTenantInventoryResetAllowed(), (error: unknown) => (
      error instanceof HttpError && error.statusCode === 403 && error.code === "TENANT_INVENTORY_RESET_DISABLED"
    ));
  });
  withResetFlag(true, () => {
    assert.equal(isTenantInventoryResetAllowed(), true);
    assert.doesNotThrow(() => assertTenantInventoryResetAllowed());
  });
  assert.match(envExample, /ALLOW_TENANT_INVENTORY_RESET=false/);
  assert.match(serviceSrc, /TENANT_INVENTORY_RESET_FLAG/);
});

test("el endpoint v1 existe, es ADMIN y toma el cliente solo del contexto firmado", () => {
  assert.equal(PHYSICAL_RESET_PATH, "/api/v1/inventory/physical/reset");
  assert.match(appSrc, /app\.use\("\/api\/v1\/inventory", inventoryRouter\)/);
  assert.match(resetBlock, /requireRole\(\["ADMIN"\]\)/);
  assert.doesNotMatch(resetBlock, /OPERATOR|CLIENT|SUPERVISOR/);
  assert.match(resetBlock, /executePhysicalInventoryReset/);
  assert.match(resetBlock, /req\.auth!\.operationalClientId!/);
  assert.match(resetBlock, /void body\.clientId/);
  assert.match(resetBlock, /assertPhysicalResetFinalConfirmation/);
  assert.match(resetBlock, /assertTenantInventoryResetAllowed/);
  assert.doesNotMatch(resetBlock, /\/api\/imports\/.+\/confirm/);
  assert.match(serviceSrc, /result: "PURGED"/);
});

test("OPERATOR y CLIENT no tienen el botón ni la ruta", () => {
  assert.match(js, /physicalInventoryResetBtns\.forEach\(\(btn\) => \{\s*btn\.classList\.toggle\("hidden", role !== "ADMIN"\)/s);
  assert.match(js, /if \(currentRole !== "ADMIN" \|\| physicalInventoryResetBusy\) return/);
  assert.match(resetBlock, /requireRole\(\["ADMIN"\]\)/);
});

test("la zona de peligro está en Sistema y el importador único en Existencias", () => {
  const configSlice = html.slice(html.indexOf('id="moduleConfig"'), html.indexOf("        </main>"));
  const inventorySlice = html.slice(html.indexOf('id="moduleInventory"'), html.indexOf('id="moduleConfig"'));
  assert.match(configSlice, /id="aviatDangerZone"/);
  assert.match(configSlice, /Borrar inventario de AVIAT/);
  assert.doesNotMatch(configSlice, /id="importWizardPanel"/);
  assert.match(inventorySlice, /id="openInventoryImportBtn"[^>]*>Abrir asistente de importación/);
  assert.match(inventorySlice, /id="importWizardPanel"/);
  assert.doesNotMatch(inventorySlice, /id="physicalInventoryResetBtn"/);
  assert.doesNotMatch(inventorySlice, /Borrar inventario de AVIAT/);
  assert.match(html, /id="physicalInventoryResetModal"/);
  assert.match(html, /Se eliminan existencias y operación relacionada/);
  assert.match(html, /Se conservan productos, proyectos válidos, asignaciones producto-proyecto/);
  assert.doesNotMatch(html, /el proyecto LOGITEC si existe/);
  assert.doesNotMatch(html, /No se borran ProductProject, el proyecto LOGITEC/);
  assert.match(html, /Escribe <strong>BORRAR INVENTARIO DE AVIAT<\/strong> para confirmar/);
  assert.match(html, /id="physicalInventoryResetFinalAck"/);
  assert.match(js, /physicalInventoryResetConfirmBtn\.addEventListener\("click", \(\) => void runPhysicalInventoryReset\(\)\)/);
  assert.match(js, /refreshInventoryAfterPhysicalPurge/);
  assert.match(js, /bumpClientContextEpoch/);
  assert.match(js, /productProjectsPreserved/);
  assert.match(js, /SE CONSERVARÁ/);
  assert.match(js, /proyectos válidos/);
  assert.match(js, /isAviatResetBlocked/);
  assert.match(js, /FORBIDDEN_LEGACY_PROJECT_PRESENT/);
  assert.match(js, /Reset bloqueado/);
  assert.doesNotMatch(js, /resolverlo automáticamente/);
  assert.doesNotMatch(js, /productProjectsPurged/);
  assert.match(html, /dashboard\.js\?v=90/);
});

test("elimina el inventario operativo de AVIAT y conserva catálogos y el otro cliente", async () => {
  const officialProjects = officialAviatCustomers();
  const { state, tx } = createFakeTx({
    inventory: [
      { id: "inv-1", clientId: AVIAT_ID, qty: d(10), reservedQty: d(2) },
      { id: "inv-0", clientId: AVIAT_ID, qty: d(0), reservedQty: d(0) },
      { id: "inv-other", clientId: OTHER_ID, qty: d(7), reservedQty: d(1) }
    ],
    layers: [
      { id: "ly-1", clientId: AVIAT_ID, qty: d(10), reservedQty: d(0) },
      { id: "ly-other", clientId: OTHER_ID, qty: d(7), reservedQty: d(0) }
    ],
    serials: [
      { id: "s-1", clientId: AVIAT_ID, serialNumber: "1659" },
      { id: "s-other", clientId: OTHER_ID, serialNumber: "OTHER" }
    ],
    movements: [
      { id: "m-1", clientId: AVIAT_ID, taskId: "t-1" },
      { id: "m-other", clientId: OTHER_ID, taskId: null }
    ],
    reservations: [
      { id: "r-1", clientId: AVIAT_ID, status: "ACTIVE" },
      { id: "r-other", clientId: OTHER_ID, status: "ACTIVE" }
    ],
    scans: [
      { id: "sc-1", clientId: AVIAT_ID },
      { id: "sc-other", clientId: OTHER_ID }
    ],
    activity: [
      { id: "a-1", clientId: AVIAT_ID },
      { id: "a-other", clientId: OTHER_ID }
    ],
    requisitions: [
      { id: "rq-1", clientId: AVIAT_ID },
      { id: "rq-other", clientId: OTHER_ID }
    ],
    tasks: [
      { id: "t-1", clientId: AVIAT_ID },
      { id: "t-other", clientId: OTHER_ID }
    ],
    products: [
      { id: "p-1", customerId: "proj-airbus" },
      { id: "p-2", customerId: "proj-att" }
    ],
    productProjects: [
      ...officialProjects.map((project) => ({
        id: `pp-${project.id}`,
        clientId: AVIAT_ID,
        productId: "p-1",
        projectId: project.id
      })),
      { id: "pp-att", clientId: AVIAT_ID, productId: "p-2", projectId: "proj-att" },
      { id: "pp-other", clientId: OTHER_ID, productId: "p-other", projectId: "proj-other" }
    ],
    customers: [
      ...officialProjects,
      { id: "proj-other", clientId: OTHER_ID, code: "OTHER-PROJECT", name: "Other Project" }
    ],
    warehouses: [{ id: "wh-1" }, { id: "wh-2" }],
    importBatches: [
      { id: "ib-aviat", clientId: AVIAT_ID },
      { id: "ib-other", clientId: OTHER_ID }
    ],
    clients: [
      { id: AVIAT_ID, code: "AVIAT", name: "AVIAT", tradeName: "AVIAT", legalName: "AVIAT" },
      { id: OTHER_ID, code: "CLI2", name: "Cliente 2", tradeName: "Cliente 2", legalName: "Cliente 2" }
    ]
  });
  const productProjectsBefore = cloneRows(state.productProjects);
  const productsBefore = cloneRows(state.products);
  const customersBefore = cloneRows(state.customers);
  const warehousesBefore = cloneRows(state.warehouses);
  const locationsBefore = cloneRows(state.locations);
  const usersBefore = cloneRows(state.users);
  const stockBefore = cloneRows(state.stock);

  const first = await applyPhysicalInventoryPurge(tx as never, { userId: "admin-1", clientId: AVIAT_ID });
  assert.equal(first.result, "PURGED");
  assert.equal(first.alreadyZero, false);
  assert.equal(first.inventoriesPurged, 2);
  assert.equal(first.serialsPurged, 1);
  assert.equal(first.movementsPurged, 1);
  assert.equal(first.productProjectsPurged, 0);
  assert.equal(first.productProjectsPreserved, productProjectsBefore.filter((row) => row.clientId === AVIAT_ID).length);
  assert.equal(state.inventory.some((row) => row.clientId === AVIAT_ID), false);
  assert.equal(state.layers.some((row) => row.clientId === AVIAT_ID), false);
  assert.equal(state.serials.some((row) => row.clientId === AVIAT_ID), false);
  assert.equal(state.reservations.some((row) => row.clientId === AVIAT_ID), false);
  assert.equal(state.movements.some((row) => row.clientId === AVIAT_ID), false);
  assert.equal(state.scans.some((row) => row.clientId === AVIAT_ID), false);
  assert.equal(state.requisitions.some((row) => row.clientId === AVIAT_ID), false);
  assert.equal(state.tasks.some((row) => row.clientId === AVIAT_ID), false);
  assert.equal(state.inventory.find((row) => row.id === "inv-other")?.clientId, OTHER_ID);
  assert.equal(state.serials.find((row) => row.id === "s-other")?.serialNumber, "OTHER");
  assert.equal(state.movements.find((row) => row.id === "m-other")?.clientId, OTHER_ID);
  assert.equal(state.layers.some((row) => row.id === "ly-other"), true);
  assert.equal(state.reservations.some((row) => row.id === "r-other"), true);
  assert.equal(state.scans.some((row) => row.id === "sc-other"), true);
  assert.equal(state.activity.some((row) => row.id === "a-other"), true);
  assert.equal(state.requisitions.some((row) => row.id === "rq-other"), true);
  assert.equal(state.tasks.some((row) => row.id === "t-other"), true);
  assert.deepEqual(state.productProjects, productProjectsBefore);
  assert.deepEqual(state.products, productsBefore);
  assert.deepEqual(state.customers, customersBefore);
  assert.deepEqual(state.warehouses, warehousesBefore);
  assert.deepEqual(state.locations, locationsBefore);
  assert.deepEqual(state.users, usersBefore);
  assert.deepEqual(state.stock, stockBefore);
  assert.equal(state.importBatches.some((row) => row.id === "ib-aviat"), false);
  assert.equal(state.importBatches.some((row) => row.id === "ib-other"), true);
  assert.equal(first.importBatchesPurged, 1);
  assert.equal(state.productProjects.some((row) => row.id === "pp-other"), true);
  assert.equal(state.products.length, 2);
  assert.equal(state.deleted.product, 0);
  assert.equal(state.deleted.location, 0);
  assert.equal(state.deleted.user, 0);
  assert.deepEqual(
    state.customers.filter((row) => row.clientId === AVIAT_ID).map((row) => row.code).sort(),
    AVIAT_OFFICIAL_PROJECTS.map((row) => row.code).slice().sort()
  );
  assert.equal(state.customers.some((row) => row.code === "LOGITEC"), false);
  assert.equal(state.customers.some((row) => row.code === "OTHER-PROJECT"), true);
  assert.equal(state.products.some((row) => row.customerId === "proj-airbus"), true);
  assert.equal(state.products.some((row) => row.customerId === "proj-att"), true);
  assert.equal(state.productProjects.some((row) => row.projectId === "proj-airbus"), true);
  assert.equal(first.legacyLogitec.found, false);
  assert.equal(state.logs[0]!.subtype, "PHYSICAL_RESET");

  const second = await applyPhysicalInventoryPurge(tx as never, { userId: "admin-1", clientId: AVIAT_ID });
  assert.equal(second.result, "PURGED");
  assert.equal(second.alreadyEmpty, true);
  assert.equal(second.inventoriesPurged, 0);
  assert.equal(second.movementsPurged, 0);
  assert.deepEqual(state.productProjects, productProjectsBefore);
  assert.deepEqual(state.products, productsBefore);
});

test("conserva InventoryStock y las importaciones de otro cliente", async () => {
  const { state, tx } = createFakeTx({
    inventory: [
      { id: "inv-1", clientId: AVIAT_ID, qty: d(10), reservedQty: d(2) },
      { id: "inv-other", clientId: OTHER_ID, qty: d(7), reservedQty: d(1) }
    ],
    stock: [
      { id: "st-shared", quantity: d(40) },
      { id: "st-other", quantity: d(9) }
    ],
    importBatches: [
      { id: "ib-aviat", clientId: AVIAT_ID },
      { id: "ib-other", clientId: OTHER_ID },
      { id: "ib-admin-other", clientId: OTHER_ID }
    ],
    clients: [
      { id: AVIAT_ID, code: "AVIAT", name: "AVIAT", tradeName: "AVIAT", legalName: "AVIAT" },
      { id: OTHER_ID, code: "CLI2", name: "Cliente 2", tradeName: "Cliente 2", legalName: "Cliente 2" }
    ]
  });
  const stockBefore = cloneRows(state.stock);
  const otherImportsBefore = cloneRows(
    state.importBatches.filter((row) => row.clientId === OTHER_ID)
  );
  const result = await applyPhysicalInventoryPurge(tx as never, { userId: "admin-1", clientId: AVIAT_ID });
  assert.equal(result.legacyStockPurged, 0);
  assert.equal(result.legacyStockZeroed, 0);
  assert.equal(result.importBatchesPurged, 1);
  assert.deepEqual(state.stock, stockBefore);
  assert.deepEqual(state.importBatches, otherImportsBefore);
  assert.equal(state.inventory.find((row) => row.id === "inv-other")?.clientId, OTHER_ID);
});

test("el bloqueo PostgreSQL impide un segundo reinicio entre instancias", async () => {
  const { state, tx } = createFakeTx({
    stock: [{ id: "st-keep", quantity: d(99) }],
    importBatches: [
      { id: "ib-aviat", clientId: AVIAT_ID },
      { id: "ib-other", clientId: OTHER_ID }
    ]
  });
  tx.$queryRaw = async () => [{ locked: false }];
  const db = {
    $transaction: async (fn: (inner: typeof tx) => Promise<unknown>) => fn(tx)
  };
  await withResetFlag(true, async () => {
    await assert.rejects(
      () => executePhysicalInventoryReset({ userId: "admin-1", clientId: AVIAT_ID }, db as never),
      (error: unknown) => error instanceof HttpError && error.code === "PHYSICAL_RESET_IN_FLIGHT"
    );
  });
  assert.equal(state.inventory.length, 1);
  assert.equal(String(state.inventory[0]!.qty), "10");
  assert.equal(state.stock.length, 1);
  assert.equal(state.importBatches.length, 2);
  assert.equal(isPhysicalResetInFlight(), false);
});

test("un cliente distinto a AVIAT no puede reiniciar", async () => {
  const { tx } = createFakeTx();
  await assert.rejects(
    () => applyPhysicalInventoryPurge(tx as never, { userId: "admin-1", clientId: OTHER_ID }),
    (error: unknown) => error instanceof HttpError && error.code === "TENANT_INVENTORY_RESET_NOT_AVIAT"
  );
});

test("un fallo intermedio hace rollback y no deja seriales a medias", async () => {
  const { state, tx } = createFakeTx();
  const snapshot = {
    inventory: cloneRows(state.inventory),
    layers: cloneRows(state.layers),
    serials: cloneRows(state.serials),
    reservations: cloneRows(state.reservations),
    movements: cloneRows(state.movements)
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
        state.movements = cloneRows(snapshot.movements);
        throw error;
      }
    }
  };
  await withResetFlag(true, async () => {
    await assert.rejects(
      () => executePhysicalInventoryReset({ userId: "admin-1", clientId: AVIAT_ID }, db as never),
      /audit-fail/
    );
  });
  assert.equal(state.inventory.length, 1);
  assert.equal(String(state.inventory[0]!.qty), "10");
  assert.equal(state.serials[0]!.serialNumber, "1659");
  assert.equal(state.movements.length, 1);
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
        movementsPurged: 0,
        scanEventsPurged: 0,
        activityLogsPurged: 0,
        requisitionsPurged: 0,
        tasksPurged: 0,
        productProjectsPurged: 0,
        productProjectsPreserved: 0,
        importBatchesPurged: 0,
        legacyStockPurged: 0,
        qtyCleared: "0",
        reservedCleared: "0",
        orphanProductsRetained: 0,
        legacyLogitec: { found: false },
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
  await withResetFlag(true, async () => {
    const first = executePhysicalInventoryReset({ userId: "admin-1", clientId: AVIAT_ID }, db as never);
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.equal(isPhysicalResetInFlight(), true);
    await assert.rejects(
      () => executePhysicalInventoryReset({ userId: "admin-2", clientId: AVIAT_ID }, db as never),
      (error: unknown) => error instanceof HttpError && error.statusCode === 409
    );
    release();
    await first;
  });
  assert.equal(isPhysicalResetInFlight(), false);
});

test("el flag apagado impide execute aunque haya confirmación", async () => {
  const db = {
    $transaction: async () => {
      throw new Error("transaction should not run");
    }
  };
  await withResetFlag(false, async () => {
    await assert.rejects(
      () => executePhysicalInventoryReset({ userId: "admin-1", clientId: AVIAT_ID }, db as never),
      (error: unknown) => error instanceof HttpError && error.code === "TENANT_INVENTORY_RESET_DISABLED"
    );
  });
});

test("después del reset los seriales de la carga borrada no bloquean una recarga", async () => {
  const { state, tx } = createFakeTx();
  await applyPhysicalInventoryPurge(tx as never, { userId: "admin-1", clientId: AVIAT_ID });
  const serialSet = new Set(state.serials.filter((row) => row.clientId === AVIAT_ID).map((row) => row.serialNumber.toUpperCase()));
  assert.equal(serialSet.has("1659"), false);
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

test("preview reporta productProjectsPreserved y no lo trata como purge", async () => {
  const { tx } = createFakeTx({
    productProjects: [
      { id: "pp-1", clientId: AVIAT_ID, productId: "p-1", projectId: "proj-airbus" },
      { id: "pp-2", clientId: AVIAT_ID, productId: "p-1", projectId: "proj-att" },
      { id: "pp-other", clientId: OTHER_ID, productId: "p-x", projectId: "proj-other" }
    ],
    clients: [
      { id: AVIAT_ID, code: "AVIAT", name: "AVIAT", tradeName: "AVIAT", legalName: "AVIAT" },
      { id: OTHER_ID, code: "CLI2", name: "Cliente 2", tradeName: "Cliente 2", legalName: "Cliente 2" }
    ]
  });
  const db = {
    $transaction: async (fn: (inner: typeof tx) => Promise<unknown>) => fn(tx)
  };
  await withResetFlag(true, async () => {
    const preview = await previewPhysicalInventoryReset({ userId: "admin-1", clientId: AVIAT_ID }, db as never);
    assert.equal(preview.counts.productProjectsPreserved, 2);
    assert.equal("productProjects" in preview.counts, false);
    assert.deepEqual(preview.forbiddenLegacyProjects, []);
    assert.equal(preview.blockCode, null);
    assert.equal(preview.canExecute, true);
  });
});

test("LEGACY_INVALID LOGITEC bloquea preview y no se cuenta como maestro preservado", async () => {
  const { state, tx } = createFakeTx({
    customers: [...officialAviatCustomers(), LEGACY_INVALID_LOGITEC],
    productProjects: [
      { id: "pp-1", clientId: AVIAT_ID, productId: "p-1", projectId: "proj-airbus" },
      { id: "pp-legacy", clientId: AVIAT_ID, productId: "p-legacy", projectId: LEGACY_INVALID_LOGITEC.id }
    ]
  });
  const db = {
    $transaction: async (fn: (inner: typeof tx) => Promise<unknown>) => fn(tx)
  };
  await withResetFlag(true, async () => {
    const preview = await previewPhysicalInventoryReset({ userId: "admin-1", clientId: AVIAT_ID }, db as never);
    assert.equal(preview.canExecute, false);
    assert.equal(preview.blockCode, FORBIDDEN_LEGACY_PROJECT_PRESENT);
    assert.equal(preview.blockMessage, FORBIDDEN_LEGACY_PROJECT_MESSAGE);
    assert.equal(preview.forbiddenLegacyProjects.length, 1);
    assert.equal(preview.forbiddenLegacyProjects[0]!.code, "LOGITEC");
    assert.equal(state.inventory.length, 1);
  });
});

test("LEGACY_INVALID LOGITEC hace fallar el reset antes de cualquier escritura", async () => {
  const { state, tx } = createFakeTx({
    customers: [...officialAviatCustomers(), LEGACY_INVALID_LOGITEC]
  });
  const inventoryBefore = cloneRows(state.inventory);
  await assert.rejects(
    () => applyPhysicalInventoryPurge(tx as never, { userId: "admin-1", clientId: AVIAT_ID }),
    (error: unknown) =>
      error instanceof HttpError &&
      error.statusCode === 409 &&
      error.code === FORBIDDEN_LEGACY_PROJECT_PRESENT &&
      error.message === FORBIDDEN_LEGACY_PROJECT_MESSAGE
  );
  assert.deepEqual(state.inventory, inventoryBefore);
  assert.equal(state.importBatches.length, 1);
  const db = {
    $transaction: async (fn: (inner: typeof tx) => Promise<unknown>) => fn(tx)
  };
  await withResetFlag(true, async () => {
    await assert.rejects(
      () => executePhysicalInventoryReset({ userId: "admin-1", clientId: AVIAT_ID }, db as never),
      (error: unknown) =>
        error instanceof HttpError && error.code === FORBIDDEN_LEGACY_PROJECT_PRESENT
    );
  });
  assert.deepEqual(state.inventory, inventoryBefore);
});

test("el reset no borra ProductProject ni customerId maestro válido y no usa customer.delete", () => {
  assert.doesNotMatch(serviceSrc, /productProject\.deleteMany/);
  assert.doesNotMatch(serviceSrc, /customerId:\s*null/);
  assert.doesNotMatch(serviceSrc, /customer\.delete/);
  assert.match(serviceSrc, /productProjectsPreserved/);
  assert.match(serviceSrc, /productProjectsPurged:\s*0/);
  assert.match(serviceSrc, /FORBIDDEN_LEGACY_PROJECT_PRESENT/);
  assert.match(serviceSrc, /assertNoForbiddenCompanyProjects/);
  assert.doesNotMatch(serviceSrc, /retained:\s*true/);
  const assertIdx = serviceSrc.indexOf("await assertNoForbiddenCompanyProjects");
  const deleteIdx = serviceSrc.indexOf("inventory.deleteMany");
  assert.ok(assertIdx > 0 && deleteIdx > assertIdx);
  assert.doesNotMatch(html, /productProjects(?!Preserved)/);
});

test("un error Prisma de FK real no se oculta detrás de 500 genérico", async () => {
  const { tx } = createFakeTx();
  tx.inventoryMovement.deleteMany = async () => {
    throw new Prisma.PrismaClientKnownRequestError("Foreign key constraint failed", {
      code: "P2003",
      clientVersion: "5.22.0",
      meta: {
        modelName: "InventoryMovement",
        field_name: "InventoryMovement_inventorySerialId_fkey",
        constraint: "InventoryMovement_inventorySerialId_fkey"
      }
    });
  };
  const db = {
    $transaction: async (fn: (inner: typeof tx) => Promise<unknown>) => fn(tx)
  };
  await withResetFlag(true, async () => {
    await assert.rejects(
      () => executePhysicalInventoryReset({ userId: "admin-1", clientId: AVIAT_ID }, db as never),
      (error: unknown) =>
        error instanceof HttpError &&
        error.statusCode === 500 &&
        error.code === "P2003" &&
        error.message === "El reinicio de inventario falló y se revirtió."
    );
  });
});

test("P2028 de transacción se reintenta una vez y luego expone el código Prisma", async () => {
  const { tx } = createFakeTx();
  let attempts = 0;
  const db = {
    $transaction: async (fn: (inner: typeof tx) => Promise<unknown>) => {
      attempts += 1;
      if (attempts === 1) {
        throw new Prisma.PrismaClientKnownRequestError("Transaction not found", {
          code: "P2028",
          clientVersion: "5.22.0"
        });
      }
      return fn(tx);
    }
  };
  await withResetFlag(true, async () => {
    const result = await executePhysicalInventoryReset({ userId: "admin-1", clientId: AVIAT_ID }, db as never);
    assert.equal(result.ok, true);
    assert.equal(attempts, 2);
  });
});

test("el middleware registra excepciones no HttpError en lugar de tragarlas", () => {
  const middlewareSrc = readFileSync(new URL("../src/middlewares/error.middleware.ts", import.meta.url), "utf8");
  assert.match(middlewareSrc, /\[unhandled\]/);
  assert.match(middlewareSrc, /console\.error/);
  assert.match(serviceSrc, /\[physical-reset\]/);
  assert.match(serviceSrc, /PHYSICAL_RESET_INTERNAL/);
  assert.doesNotMatch(serviceSrc, /Promise\.all\(/);
});

test("el reinicio no borra InventoryStock y usa advisory lock de PostgreSQL", () => {
  assert.equal(PHYSICAL_RESET_ADVISORY_LOCK_CLASS, 90429101);
  assert.notEqual(PHYSICAL_RESET_ADVISORY_LOCK_CLASS, 72707369);
  assert.match(serviceSrc, /pg_try_advisory_xact_lock/);
  assert.match(serviceSrc, /hashtext\(\$\{clientId\}\)/);
  assert.match(serviceSrc, /legacyStockPurged:\s*0/);
  assert.match(serviceSrc, /legacyStockZeroed:\s*0/);
  assert.match(serviceSrc, /importBatch\.deleteMany\(\{\s*where:\s*\{\s*clientId:\s*aviatId/);
  assert.match(serviceSrc, /importBatch\.count\(\{\s*where:\s*clientWhere/);
  assert.doesNotMatch(serviceSrc, /inventoryStock\.deleteMany/);
  assert.doesNotMatch(serviceSrc, /inventoryStock\.findMany/);
  assert.doesNotMatch(serviceSrc, /createdBy:\s*\{\s*OR:/);
  assert.doesNotMatch(serviceSrc, /role:\s*"ADMIN"/);
});
