import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { resolveInboundAssignment } from "../src/modules/inventory/inventory-assignment.js";
import { InventoryMutationError } from "../src/modules/inventory/inventory-errors.js";
import { isOperationalProjectRecord } from "../src/modules/inventory/inventory-project-rules.js";
import {
  RequisitionError,
  approveRequisition,
  createRequisition,
  requireOperationalProject,
  submitRequisition
} from "../src/modules/requisitions/requisition.service.js";

const html = readFileSync(new URL("../public/dashboard.html", import.meta.url), "utf8");
const js = readFileSync(new URL("../public/dashboard.js", import.meta.url), "utf8");
const inventoryRoutes = readFileSync(new URL("../src/modules/inventory/inventory.routes.ts", import.meta.url), "utf8");
const serviceSrc = readFileSync(new URL("../src/modules/requisitions/requisition.service.ts", import.meta.url), "utf8");
const reserveSrc = serviceSrc;
const pickingSrc = readFileSync(new URL("../src/modules/picking/picking.routes.ts", import.meta.url), "utf8");
const mutationSrc = readFileSync(
  new URL("../src/modules/inventory/inventory-mutation.service.ts", import.meta.url),
  "utf8"
);
const transferSrc = readFileSync(
  new URL("../src/modules/inventory/inventory-assignment-transfer.service.ts", import.meta.url),
  "utf8"
);

function sliceFunction(source: string, name: string): string {
  const token = `function ${name}(`;
  const start = source.indexOf(token);
  assert.ok(start >= 0, `missing function ${name}`);
  let paren = 0;
  let brace = -1;
  for (let i = start + token.length - 1; i < source.length; i += 1) {
    const ch = source[i];
    if (brace < 0) {
      if (ch === "(") paren += 1;
      else if (ch === ")") {
        paren -= 1;
        if (paren === 0) {
          brace = source.indexOf("{", i);
          if (brace < 0) break;
          i = brace - 1;
        }
      }
      continue;
    }
    if (ch === "{") paren += 1;
    else if (ch === "}") {
      paren -= 1;
      if (paren === 0) return source.slice(start, i + 1);
    }
  }
  throw new Error(`unclosed function ${name}`);
}

const REAL_ACTIVE = [
  { id: "p-airbus", code: "AIRBUS", name: "AIRBUS", active: true },
  { id: "p-att", code: "ATT", name: "AT&T COMUNICACIONES DIGITALES", active: true },
  { id: "p-aviat", code: "AVIAT", name: "AVIAT NETWORKS", active: true },
  { id: "p-interatum", code: "INTERATUM", name: "INTERATUM OFFSHORE", active: true },
  { id: "p-operbes", code: "OPERBES", name: "OPERBES", active: true },
  { id: "p-telcel", code: "TELCEL", name: "RADIOMOVIL DIPSA", active: true },
  { id: "p-sym", code: "SYM", name: "SYM SERVICIOS INTEGRALES", active: true },
  { id: "p-telmex", code: "TELMEX", name: "TELÉFONOS DE MÉXICO", active: true },
  { id: "p-triple", code: "TRIPLEPLAY", name: "TRIPLE PLAY SYSTEMS DE MÉXICO", active: true }
];

function catalogWithExtras(extra: Array<Record<string, unknown>> = []) {
  return [
    ...REAL_ACTIVE,
    { id: "p-empty", code: "NUEVO-SIN-STOCK", name: "Proyecto sin existencias", active: true },
    ...extra
  ];
}

function loadOperationalSelect() {
  const start = js.indexOf("function isForbiddenProjectLabel");
  const end = js.indexOf("function getAviatProjectFromRow");
  assert.ok(start >= 0 && end > start);
  return new Function(`${js.slice(start, end)}; return { isForbiddenProjectLabel, isOperationalProjectRecord, getOperationalProjectsForSelect };`)() as {
    isForbiddenProjectLabel: (value: unknown) => boolean;
    isOperationalProjectRecord: (project: unknown) => boolean;
    getOperationalProjectsForSelect: (catalog?: unknown) => Array<{ id: string; code: string; name: string }>;
  };
}

function codesOf(rows: Array<{ code: string }>) {
  return rows.map((row) => row.code).sort();
}

const createInput = {
  number: "OS-TEST-1",
  projectCode: "LOGITEC",
  userId: "user-1",
  lines: [{ sku: "SKU-1", requestedQty: 1 }]
};

function rejectDb(project: { id: string; code: string; name: string; active: boolean } | null) {
  const state = { tx: 0, update: 0 };
  const db = {
    customer: {
      findFirst: async () => project
    },
    requisition: {
      findUnique: async () => null,
      update: async () => {
        state.update += 1;
        return {};
      }
    },
    $transaction: async () => {
      state.tx += 1;
      throw new Error("transaction should not run");
    }
  };
  return { db: db as never, state };
}

test("1 getOperationalProjectsForSelect excluye LOGITEC", () => {
  const { getOperationalProjectsForSelect } = loadOperationalSelect();
  const rows = getOperationalProjectsForSelect(
    catalogWithExtras([{ id: "lg", code: "LOGITEC", name: "LOGITEC", active: true }])
  );
  assert.equal(rows.some((row) => row.code === "LOGITEC" || row.name === "LOGITEC"), false);
});

test("2 excluye LOGITEC por code aunque el name sea distinto", () => {
  const { getOperationalProjectsForSelect } = loadOperationalSelect();
  const rows = getOperationalProjectsForSelect(
    catalogWithExtras([{ id: "lg", code: "LOGITEC", name: "Operadora Logitec", active: true }])
  );
  assert.equal(rows.some((row) => row.id === "lg"), false);
});

test("3 excluye LOGITEC por name aunque el code sea distinto", () => {
  const { getOperationalProjectsForSelect } = loadOperationalSelect();
  const rows = getOperationalProjectsForSelect(
    catalogWithExtras([{ id: "lg", code: "HOLDING", name: "LOGITEC", active: true }])
  );
  assert.equal(rows.some((row) => row.id === "lg"), false);
});

test("4 comparación insensible a mayúsculas y espacios", () => {
  const { getOperationalProjectsForSelect, isForbiddenProjectLabel } = loadOperationalSelect();
  assert.equal(isForbiddenProjectLabel(" logitec "), true);
  assert.equal(isForbiddenProjectLabel("LoGiTeC"), true);
  const rows = getOperationalProjectsForSelect(
    catalogWithExtras([
      { id: "lg1", code: " logitec ", name: "Holding", active: true },
      { id: "lg2", code: "HOLD", name: "  LoGiTeC  ", active: true }
    ])
  );
  assert.equal(rows.some((row) => row.id === "lg1" || row.id === "lg2"), false);
});

test("5 excluye active false", () => {
  const { getOperationalProjectsForSelect } = loadOperationalSelect();
  const rows = getOperationalProjectsForSelect(
    catalogWithExtras([{ id: "old", code: "OLD", name: "Proyecto inactivo", active: false }])
  );
  assert.equal(rows.some((row) => row.id === "old"), false);
  assert.equal(isOperationalProjectRecord({ code: "OLD", name: "Proyecto inactivo", active: false }), false);
});

test("6 excluye FREE TO SALE", () => {
  const { getOperationalProjectsForSelect } = loadOperationalSelect();
  const rows = getOperationalProjectsForSelect(
    catalogWithExtras([{ id: "fts", code: "FREE TO SALE", name: "Libre", active: true }])
  );
  assert.equal(rows.some((row) => row.id === "fts"), false);
});

test("7 excluye CUSTOMER OWNS", () => {
  const { getOperationalProjectsForSelect } = loadOperationalSelect();
  const rows = getOperationalProjectsForSelect(
    catalogWithExtras([{ id: "own", code: "CUSTOMER OWNS", name: "Owns", active: true }])
  );
  assert.equal(rows.some((row) => row.id === "own"), false);
});

test("8 excluye CUSTOMR OWNS", () => {
  const { getOperationalProjectsForSelect } = loadOperationalSelect();
  const rows = getOperationalProjectsForSelect(
    catalogWithExtras([{ id: "own2", code: "X", name: "CUSTOMR OWNS", active: true }])
  );
  assert.equal(rows.some((row) => row.id === "own2"), false);
});

test("9 excluye ASO", () => {
  const { getOperationalProjectsForSelect } = loadOperationalSelect();
  const rows = getOperationalProjectsForSelect(
    catalogWithExtras([{ id: "aso", code: "ASO", name: "ASO", active: true }])
  );
  assert.equal(rows.some((row) => row.id === "aso"), false);
});

test("10 conserva todos los proyectos reales activos", () => {
  const { getOperationalProjectsForSelect } = loadOperationalSelect();
  const rows = getOperationalProjectsForSelect(catalogWithExtras());
  for (const project of REAL_ACTIVE) {
    assert.ok(
      rows.some((row) => row.code === project.code && row.name === project.name),
      `missing ${project.name}`
    );
  }
});

test("11 conserva proyecto activo sin stock", () => {
  const { getOperationalProjectsForSelect } = loadOperationalSelect();
  const rows = getOperationalProjectsForSelect(catalogWithExtras());
  assert.ok(rows.some((row) => row.code === "NUEVO-SIN-STOCK"));
  assert.deepEqual(
    codesOf(rows).includes("NUEVO-SIN-STOCK"),
    true
  );
});

test("12 #reqCustomer usa fuente operativa", () => {
  const fill = sliceFunction(js, "fillCustomerSelect");
  const populate = sliceFunction(js, "populateOperationalSelects");
  assert.match(fill, /getOperationalProjectsForSelect\(\)/);
  assert.doesNotMatch(fill, /getCustomersForSelect\(\)/);
  assert.match(populate, /fillCustomerSelect\("reqCustomer"/);
});

test("13 #outboundCustomer usa fuente operativa", () => {
  const populate = sliceFunction(js, "populateOperationalSelects");
  assert.match(populate, /fillCustomerSelect\("outboundCustomer"/);
  assert.match(sliceFunction(js, "fillCustomerSelect"), /getOperationalProjectsForSelect\(\)/);
});

test("14 #pickProject usa fuente operativa", () => {
  const pick = sliceFunction(js, "populatePickContextSelects");
  assert.match(pick, /getOperationalProjectsForSelect\(\)/);
  assert.doesNotMatch(pick, /productsCache/);
  assert.match(html, /id="pickProject"/);
});

test("15 #taskProjectSelect usa fuente operativa", () => {
  const smart = sliceFunction(js, "populateSmartOperationalFields");
  assert.match(smart, /getOperationalProjectsForSelect\(\)/);
  assert.match(smart, /taskProjectSelect/);
  assert.doesNotMatch(smart, /getKnownProjects\(\)/);
});

test("16 #assignDestProject usa fuente operativa", () => {
  const open = sliceFunction(js, "openAssignmentTransferPanel");
  assert.match(open, /getOperationalProjectsForSelect\(/);
  assert.match(html, /id="assignDestProject"/);
});

test("17 módulo Clientes usa clientes 3PL y no el catálogo de proyectos", () => {
  const admin = sliceFunction(js, "renderClientsModule");
  const load = sliceFunction(js, "loadRealClientsQuiet");
  const customers = sliceFunction(js, "getCustomersForSelect");
  assert.match(admin, /loadRealClientsModule/);
  assert.match(load, /\/api\/clients/);
  assert.doesNotMatch(admin, /getOperationalProjectsForSelect/);
  assert.doesNotMatch(load, /clientsCache/);
  assert.match(customers, /productsCache/);
  assert.match(customers, /clientsCache/);
});

test("18 registros históricos conservan nombre LOGITEC", () => {
  assert.match(sliceFunction(js, "formatReqTableProject"), /isForbiddenProjectLabel/);
  assert.match(js, /req\.project \? `\$\{req\.project\.name\} \(\$\{req\.project\.code\}\)`/);
  assert.match(serviceSrc, /name: row\.project\.name/);
  assert.doesNotMatch(sliceFunction(serviceSrc, "listRequisitions"), /requireOperationalProject/);
  assert.doesNotMatch(sliceFunction(serviceSrc, "getRequisition"), /requireOperationalProject/);
});

test("19 createRequisition rechaza LOGITEC", async () => {
  const { db, state } = rejectDb({ id: "lg", code: "LOGITEC", name: "LOGITEC", active: true });
  await assert.rejects(
    () => createRequisition(createInput, db),
    (error: unknown) => error instanceof RequisitionError && error.code === "PROJECT_NOT_AVAILABLE"
  );
  assert.equal(state.tx, 0);
  assert.throws(
    () => requireOperationalProject({ id: "lg", code: "LOGITEC", name: "Operadora", active: true }),
    (error: unknown) => error instanceof RequisitionError && error.code === "PROJECT_NOT_AVAILABLE"
  );
});

test("20 createRequisition rechaza proyecto inactivo", async () => {
  const { db, state } = rejectDb({ id: "old", code: "OLD", name: "Viejo", active: false });
  await assert.rejects(
    () => createRequisition({ ...createInput, projectCode: "OLD" }, db),
    (error: unknown) => error instanceof RequisitionError && error.code === "PROJECT_NOT_AVAILABLE"
  );
  assert.equal(state.tx, 0);
});

test("21 createRequisition acepta proyecto real activo", async () => {
  const state = { tx: 0 };
  const db = {
    customer: {
      findFirst: async () => ({
        id: "p-att",
        code: "ATT",
        name: "AT&T COMUNICACIONES DIGITALES",
        active: true
      })
    },
    requisition: { findUnique: async () => null, update: async () => ({}) },
    $transaction: async () => {
      state.tx += 1;
      throw new Error("stop-before-write");
    }
  };
  await assert.rejects(
    () => createRequisition({ ...createInput, projectCode: "ATT" }, db as never),
    (error: unknown) => error instanceof Error && error.message === "stop-before-write"
  );
  assert.equal(state.tx, 1);
  assert.doesNotThrow(() =>
    requireOperationalProject({
      id: "p-att",
      code: "ATT",
      name: "AT&T COMUNICACIONES DIGITALES",
      active: true
    })
  );
});

test("22 submit de DRAFT rechaza proyecto ya inválido", async () => {
  const state = { update: 0 };
  const db = {
    customer: { findFirst: async () => null },
    requisition: {
      findUnique: async () => ({
        id: "req-1",
        number: "OS-OLD",
        status: "DRAFT",
        projectId: "lg",
        project: { id: "lg", code: "LOGITEC", name: "LOGITEC", active: true },
        lines: [{ id: "line-1" }]
      }),
      update: async () => {
        state.update += 1;
        return {};
      }
    },
    $transaction: async () => {
      throw new Error("transaction should not run");
    }
  };
  await assert.rejects(
    () => submitRequisition("req-1", "user-1", db as never),
    (error: unknown) => error instanceof RequisitionError && error.code === "PROJECT_NOT_AVAILABLE"
  );
  assert.equal(state.update, 0);
});

test("23 approve rechaza proyecto inválido antes de iniciar", async () => {
  const db = {
    customer: { findFirst: async () => null },
    requisition: {
      findUnique: async () => ({
        id: "req-1",
        number: "OS-OLD",
        status: "SUBMITTED",
        projectId: "lg",
        project: { id: "lg", code: "LOGITEC", name: "LOGITEC", active: true, client: null },
        createdBy: { id: "user-1", fullName: "A", email: "a@x" },
        lines: [
          {
            id: "line-1",
            productId: "prod-1",
            requestedQty: { toString: () => "1" },
            fulfilledQty: { toString: () => "0" },
            product: { id: "prod-1", sku: "SKU-1", name: "Radio", barcode: null, customerId: "lg" },
            reservations: []
          }
        ],
        tasks: []
      }),
      update: async () => {
        throw new Error("update should not run");
      }
    },
    $transaction: async () => {
      throw new Error("transaction should not run");
    }
  };
  await assert.rejects(
    () => approveRequisition("req-1", "user-1", "ADMIN", db as never),
    (error: unknown) => error instanceof RequisitionError && error.code === "PROJECT_NOT_AVAILABLE"
  );
});

test("24 cancelación y consulta histórica siguen disponibles", () => {
  assert.doesNotMatch(sliceFunction(serviceSrc, "cancelRequisitionInTransaction"), /requireOperationalProject/);
  assert.doesNotMatch(sliceFunction(serviceSrc, "cancelRequisition"), /requireOperationalProject/);
  assert.doesNotMatch(sliceFunction(serviceSrc, "listRequisitions"), /PROJECT_NOT_AVAILABLE/);
  assert.match(serviceSrc, /export async function listRequisitions/);
  assert.match(serviceSrc, /export async function getRequisition/);
  assert.match(serviceSrc, /export async function cancelRequisition/);
});

test("25 GET /api/inventory/projects no cambia", () => {
  const start = inventoryRoutes.indexOf('inventoryRouter.get("/projects"');
  const end = inventoryRoutes.indexOf('inventoryRouter.get("/stock/:inventoryId/layers"');
  assert.ok(start >= 0 && end > start);
  const block = inventoryRoutes.slice(start, end);
  assert.match(block, /assignmentType: "PROJECT"/);
  assert.match(block, /qty: \{ gt: 0 \}/);
  assert.match(block, /isForbiddenInventoryProjectRecord/);
  assert.doesNotMatch(block, /PROJECT_NOT_AVAILABLE/);
  assert.doesNotMatch(block, /getOperationalProjectsForSelect/);
});

test("26 reserva FIFO v72 permanece intacta", () => {
  assert.match(reserveSrc, /allocationMode/);
  assert.match(reserveSrc, /planRelocateFifoAllocation/);
  assert.match(reserveSrc, /LAYER_ALLOCATION_CONFLICT/);
  assert.match(html, /id="reqActionInventoryId"/);
});

test("27 picking FIFO v73 permanece intacto", () => {
  assert.match(pickingSrc, /allocationMode/);
  assert.match(pickingSrc, /consumeReservationPick/);
  assert.match(js, /allocationMode: "FIFO"/);
  assert.match(js, /requisitionLineId/);
});

test("28 reubicación, recepción y salidas no tienen regresiones", () => {
  assert.match(mutationSrc, /type === "RELOCATE"/);
  assert.match(js, /function submitOperationalMovement/);
  assert.match(html, /id="inboundProjectId"/);
  assert.match(html, /id="outboundCustomer"/);
  assert.match(sliceFunction(js, "realActiveCatalogProjects"), /getOperationalProjectsForSelect\(\)/);
  assert.match(transferSrc, /isForbiddenInventoryProjectRecord/);
  assert.match(transferSrc, /PROJECT_INACTIVE/);
});

test("29 cache-buster v77", () => {
  assert.match(html, /dashboard\.js\?v=81/);
  assert.doesNotMatch(html, /dashboard\.js\?v=73/);
});

test("createRequisition no encuentra proyecto inexistente", async () => {
  const { db, state } = rejectDb(null);
  await assert.rejects(
    () => createRequisition({ ...createInput, projectCode: "NO-EXISTE" }, db),
    (error: unknown) => error instanceof RequisitionError && error.code === "PROJECT_NOT_FOUND"
  );
  assert.equal(state.tx, 0);
});

test("recepción y reasignación ya rechazan LOGITEC como destino nuevo", async () => {
  const tx = {
    customer: {
      findUnique: async ({ where: { id } }: { where: { id: string } }) =>
        id === "lg"
          ? { id: "lg", code: "LOGITEC", name: "LOGITEC", active: true, clientId: "client-aviat" }
          : null
    }
  };
  await assert.rejects(
    () =>
      resolveInboundAssignment(tx as never, { customerId: "p-att", customer: { clientId: "client-aviat" } }, {
        assignmentType: "PROJECT",
        projectId: "lg"
      }),
    (error: unknown) => error instanceof InventoryMutationError && error.code === "PROJECT_NOT_FOUND"
  );
});
