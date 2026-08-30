import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, test } from "node:test";
import bcrypt from "bcryptjs";
import { Prisma } from "@prisma/client";
import { readFileSync } from "node:fs";
import { app } from "../src/app.js";
import { prisma } from "../src/db/prisma.js";
import { signAccessToken } from "../src/middlewares/auth.middleware.js";

const html = readFileSync(new URL("../public/dashboard.html", import.meta.url), "utf8");
const js = readFileSync(new URL("../public/dashboard.js", import.meta.url), "utf8");
const importsRoutes = readFileSync(
  new URL("../src/modules/imports/imports.routes.ts", import.meta.url),
  "utf8"
);
const inventoryRoutes = readFileSync(
  new URL("../src/modules/inventory/inventory.routes.ts", import.meta.url),
  "utf8"
);
const requisitionsRoutes = readFileSync(
  new URL("../src/modules/requisitions/requisitions.routes.ts", import.meta.url),
  "utf8"
);
const incidentsRoutes = readFileSync(
  new URL("../src/modules/incidents/incidents.routes.ts", import.meta.url),
  "utf8"
);
const authRoutes = readFileSync(new URL("../src/modules/auth/auth.routes.ts", import.meta.url), "utf8");

function sliceFunction(source: string, name: string): string {
  const token = `function ${name}(`;
  const start = source.indexOf(token);
  assert.ok(start >= 0, `missing function ${name}`);
  const from = source.lastIndexOf("\n", start) >= 0 ? source.lastIndexOf("\n", start) + 1 : start;
  const next = source.indexOf("\nfunction ", start + token.length);
  const nextAsync = source.indexOf("\nasync function ", start + token.length);
  const candidates = [next, nextAsync].filter((n) => n >= 0);
  const end = candidates.length ? Math.min(...candidates) : source.length;
  return source.slice(from, end);
}

const applyRoleFn = sliceFunction(js, "applyRoleNavigation");

const AVIAT = {
  id: "client-aviat",
  code: "AVIAT",
  name: "AVIAT",
  tradeName: "AVIAT",
  legalName: "AVIAT SA",
  active: true
};
const CLIENT2 = {
  id: "client-2",
  code: "CLI2",
  name: "Cliente 2",
  tradeName: "Cliente 2",
  legalName: "Cliente 2 SA",
  active: true
};

const passwordHash = bcrypt.hashSync("secret12", 4);
const users = {
  admin: {
    id: "u-admin",
    email: "admin@test.local",
    fullName: "Admin",
    role: "ADMIN" as const,
    isActive: true,
    clientId: null,
    client: null,
    passwordHash
  },
  supervisor: {
    id: "u-sup",
    email: "sup@test.local",
    fullName: "Supervisor",
    role: "SUPERVISOR" as const,
    isActive: true,
    clientId: AVIAT.id,
    client: { ...AVIAT },
    passwordHash
  },
  operator: {
    id: "u-op",
    email: "op@test.local",
    fullName: "Operator",
    role: "OPERATOR" as const,
    isActive: true,
    clientId: AVIAT.id,
    client: { ...AVIAT },
    passwordHash
  },
  clientAviat: {
    id: "u-cli-a",
    email: "aviat@test.local",
    fullName: "Cliente AVIAT",
    role: "CLIENT" as const,
    isActive: true,
    clientId: AVIAT.id,
    client: { ...AVIAT },
    passwordHash
  },
  clientTwo: {
    id: "u-cli-2",
    email: "c2@test.local",
    fullName: "Cliente 2",
    role: "CLIENT" as const,
    isActive: true,
    clientId: CLIENT2.id,
    client: { ...CLIENT2 },
    passwordHash
  }
};

const inventories = [
  {
    id: "inv-aviat",
    productId: "prod-1",
    sku: "SKU-SHARED-1",
    clientId: AVIAT.id,
    qty: new Prisma.Decimal(10),
    reservedQty: new Prisma.Decimal(0),
    status: "AVAILABLE",
    assignmentType: "FREE_TO_SALE",
    assignmentKey: "FREE_TO_SALE:client-aviat",
    projectId: null,
    updatedAt: new Date("2026-08-01T00:00:00Z"),
    location: { id: "loc-1", code: "AN1-A", warehouse: "WH-A" },
    client: AVIAT,
    project: null,
    product: { sku: "SKU-SHARED-1", name: "Radio", active: true, barcode: null },
    layers: [{ lotNumber: "L1", qty: new Prisma.Decimal(10), reservedQty: new Prisma.Decimal(0), serials: [] }]
  },
  {
    id: "inv-c2",
    productId: "prod-1",
    sku: "SKU-SHARED-1",
    clientId: CLIENT2.id,
    qty: new Prisma.Decimal(4),
    reservedQty: new Prisma.Decimal(0),
    status: "AVAILABLE",
    assignmentType: "PROJECT",
    assignmentKey: "P:proj-c2",
    projectId: "proj-c2",
    updatedAt: new Date("2026-08-01T00:00:00Z"),
    location: { id: "loc-2", code: "AN1-A", warehouse: "WH-B" },
    client: CLIENT2,
    project: { id: "proj-c2", code: "P2A", name: "Proyecto 2A", client: CLIENT2 },
    product: { sku: "SKU-SHARED-1", name: "Radio", active: true, barcode: null },
    layers: []
  }
];

const layers = [
  {
    id: "layer-aviat",
    inventoryId: "inv-aviat",
    clientId: AVIAT.id,
    qty: new Prisma.Decimal(10),
    reservedQty: new Prisma.Decimal(0),
    unitPriceMxn: new Prisma.Decimal(100)
  },
  {
    id: "layer-c2",
    inventoryId: "inv-c2",
    clientId: CLIENT2.id,
    qty: new Prisma.Decimal(4),
    reservedQty: new Prisma.Decimal(0),
    unitPriceMxn: new Prisma.Decimal(50)
  }
];

const movements = [
  {
    id: "mov-aviat",
    clientId: AVIAT.id,
    productId: "prod-1",
    qty: new Prisma.Decimal(1),
    quantityBefore: new Prisma.Decimal(0),
    quantityAfter: new Prisma.Decimal(1),
    stockStatus: "AVAILABLE",
    createdAt: new Date("2026-08-01T00:00:00Z"),
    movementType: "IN",
    reference: null,
    client: AVIAT,
    product: { sku: "SKU-SHARED-1", name: "Radio" },
    fromProject: null,
    toProject: null,
    fromLocation: { code: "AN1-A" },
    toLocation: { code: "AN1-A" },
    user: { fullName: "Admin" },
    requisitionLine: null,
    inventoryLayer: null,
    toAssignmentType: "FREE_TO_SALE",
    fromAssignmentType: "FREE_TO_SALE"
  },
  {
    id: "mov-c2",
    clientId: CLIENT2.id,
    productId: "prod-1",
    qty: new Prisma.Decimal(1),
    quantityBefore: new Prisma.Decimal(0),
    quantityAfter: new Prisma.Decimal(1),
    stockStatus: "AVAILABLE",
    createdAt: new Date("2026-08-01T00:00:00Z"),
    movementType: "IN",
    reference: null,
    client: CLIENT2,
    product: { sku: "SKU-SHARED-1", name: "Radio" },
    fromProject: { code: "P2A" },
    toProject: { code: "P2A" },
    fromLocation: { code: "AN1-A" },
    toLocation: { code: "AN1-A" },
    user: { fullName: "Admin" },
    requisitionLine: null,
    inventoryLayer: null,
    toAssignmentType: "PROJECT",
    fromAssignmentType: "PROJECT"
  }
];

const importBatches = [
  {
    id: "import-aviat",
    clientId: AVIAT.id,
    createdById: users.admin.id,
    context: "INVENTORY",
    status: "READY",
    invalidRows: 0,
    metadata: {},
    createdAt: new Date("2026-08-01T00:00:00Z"),
    rows: [{ id: "ir-1", sourceRow: 1, normalized: { sku: "SKU-SHARED-1" }, status: "OK" }],
    createdBy: { id: users.admin.id, fullName: "Admin", email: users.admin.email }
  }
];

const incidents = [
  { id: "inc-aviat", clientId: AVIAT.id, status: "OPEN", resolution: null },
  { id: "inc-c2", clientId: CLIENT2.id, status: "OPEN", resolution: null }
];

const products = [
  {
    id: "prod-1",
    sku: "SKU-SHARED-1",
    barcode: null,
    name: "Radio",
    description: "",
    unit: "PZA",
    serialControlled: false,
    lotControlled: false,
    warehouse: "WH-A",
    createdAt: new Date("2026-08-01T00:00:00Z"),
    inventories: [{ clientId: AVIAT.id }],
    productProjects: []
  },
  {
    id: "prod-2",
    sku: "SKU-C2-ONLY",
    barcode: null,
    name: "Antena",
    description: "",
    unit: "PZA",
    serialControlled: false,
    lotControlled: false,
    warehouse: "WH-B",
    createdAt: new Date("2026-08-01T00:00:00Z"),
    inventories: [{ clientId: CLIENT2.id }],
    productProjects: []
  }
];

const clients = [AVIAT, CLIENT2];
const projects = [
  { id: "proj-att", code: "ATT", name: "AT&T", clientId: AVIAT.id, active: true },
  { id: "proj-c2", code: "P2A", name: "Proyecto 2A", clientId: CLIENT2.id, active: true }
];

function clientIdFromWhere(where: unknown): string | undefined {
  if (!where || typeof where !== "object") return undefined;
  const record = where as Record<string, unknown>;
  if (typeof record.clientId === "string") return record.clientId;
  if (Array.isArray(record.AND)) {
    for (const part of record.AND) {
      const found = clientIdFromWhere(part);
      if (found) return found;
    }
  }
  if (record.inventory && typeof record.inventory === "object") {
    return clientIdFromWhere(record.inventory);
  }
  if (record.inventories && typeof record.inventories === "object") {
    const inv = record.inventories as { some?: { clientId?: string } };
    return inv.some?.clientId;
  }
  return undefined;
}

const originals: Array<{ model: string; method: string; fn: unknown }> = [];

function stub(model: string, method: string, fn: (...args: never[]) => unknown) {
  const delegate = (prisma as unknown as Record<string, Record<string, unknown>>)[model];
  originals.push({ model, method, fn: delegate[method] });
  delegate[method] = fn;
}

function restorePrisma() {
  for (const item of originals.splice(0)) {
    (prisma as unknown as Record<string, Record<string, unknown>>)[item.model][item.method] = item.fn as never;
  }
}

let server: http.Server;
let baseUrl = "";

function tokenFor(user: (typeof users)[keyof typeof users], operationalClientId?: string | null) {
  return signAccessToken({
    userId: user.id,
    role: user.role,
    email: user.email,
    operationalClientId: operationalClientId === undefined ? user.clientId : operationalClientId
  });
}

async function request(
  path: string,
  options: { method?: string; token?: string; body?: unknown; headers?: Record<string, string> } = {}
) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: options.method || "GET",
    headers: {
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.headers || {})
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const text = await response.text();
  let json: Record<string, unknown> | unknown[] | null = null;
  try {
    json = text ? (JSON.parse(text) as Record<string, unknown>) : null;
  } catch {
    json = null;
  }
  return { status: response.status, text, json, headers: response.headers };
}

const staffRoles = [users.supervisor, users.operator] as const;
const nonAdminRoles = [users.supervisor, users.operator, users.clientAviat] as const;

before(async () => {
  stub("user", "findUnique", async ({ where }: { where: { id?: string; email?: string } }) =>
    Object.values(users).find((row) => row.id === where.id || row.email === where.email) || null
  );
  stub("client", "findUnique", async ({ where }: { where: { id?: string } }) =>
    clients.find((row) => row.id === where.id) || null
  );
  stub("client", "findMany", async () =>
    clients.map((row) => ({ ...row, _count: { projects: projects.filter((p) => p.clientId === row.id).length } }))
  );
  stub("inventory", "findMany", async ({ where }: { where?: Record<string, unknown> }) => {
    const clientId = clientIdFromWhere(where);
    return inventories.filter((row) => !clientId || row.clientId === clientId);
  });
  stub("inventory", "findFirst", async ({ where }: { where: { id?: string; AND?: Array<{ id?: string }> } }) => {
    const id = where.id || where.AND?.find((part) => part.id)?.id;
    return inventories.find((row) => row.id === id) || null;
  });
  stub("inventoryLayer", "findFirst", async ({ where }: { where: { id?: string; AND?: Array<{ id?: string }> } }) => {
    const id = where.id || where.AND?.find((part) => part.id)?.id;
    const layer = layers.find((row) => row.id === id);
    if (!layer) return null;
    const inv = inventories.find((row) => row.id === layer.inventoryId);
    return { ...layer, inventory: { clientId: inv?.clientId || "" } };
  });
  stub("inventoryMovement", "findMany", async ({ where }: { where?: unknown }) => {
    const clientId = clientIdFromWhere(where);
    return movements.filter((row) => !clientId || row.clientId === clientId);
  });
  stub("product", "findMany", async ({ where }: { where?: Record<string, unknown> }) => {
    let clientId = clientIdFromWhere(where);
    if (!clientId && where?.OR && Array.isArray(where.OR)) {
      for (const clause of where.OR) {
        if (!clause || typeof clause !== "object") continue;
        const inv = (clause as { inventories?: { some?: { clientId?: string } } }).inventories;
        if (inv?.some?.clientId) clientId = inv.some.clientId;
        const pp = (clause as { productProjects?: { some?: { project?: { clientId?: string } } } }).productProjects;
        if (pp?.some?.project?.clientId) clientId = pp.some.project.clientId;
      }
    }
    if (!clientId) return products;
    return products.filter(
      (row) =>
        row.inventories.some((inv) => inv.clientId === clientId) ||
        row.productProjects.some((pp: { project?: { clientId?: string } }) => pp.project?.clientId === clientId)
    );
  });
  stub("importBatch", "findFirst", async ({ where, include }: { where?: { id?: string; clientId?: string }; include?: unknown }) => {
    const row =
      importBatches.find(
        (batch) =>
          (!where?.id || batch.id === where.id) && (!where?.clientId || batch.clientId === where.clientId)
      ) || null;
    if (!row) return null;
    if (include) return { ...row };
    return row;
  });
  stub("importBatch", "findMany", async ({ where }: { where?: { clientId?: string } }) =>
    importBatches.filter((row) => !where?.clientId || row.clientId === where.clientId)
  );
  stub("importRow", "findMany", async ({ where }: { where?: { importBatchId?: string } }) => {
    const batch = importBatches.find((row) => row.id === where?.importBatchId);
    return batch?.rows || [];
  });
  stub("incident", "findFirst", async ({ where }: { where: { id?: string; clientId?: string } }) =>
    incidents.find((row) => row.id === where.id && (!where.clientId || row.clientId === where.clientId)) || null
  );
  stub("incident", "update", async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => ({
    id: where.id,
    ...incidents.find((row) => row.id === where.id),
    ...data
  }));
  stub("customer", "findFirst", async ({ where }: { where: { id?: string; clientId?: string } }) =>
    projects.find((row) => row.id === where.id && (!where.clientId || row.clientId === where.clientId)) || null
  );
  stub("inventoryStatusDefinition", "findFirst", async () => ({ code: "AVAILABLE", active: true }));
  stub("inventoryStatusDefinition", "findMany", async () => [{ code: "AVAILABLE", sortOrder: 1 }]);
  stub("scanEvent", "findMany", async () => []);
  stub("activityLog", "create", async () => ({ id: "act-1" }));

  server = http.createServer(app);
  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address() as AddressInfo;
      baseUrl = `http://127.0.0.1:${address.port}`;
      resolve();
    });
  });
});

after(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
  restorePrisma();
});

test("rutas de importación GET son exclusivas de ADMIN en backend", () => {
  const getPaths = [
    'importsRouter.get("/", requireRole(["ADMIN"])',
    'importsRouter.get("/active", requireRole(["ADMIN"])',
    'importsRouter.get("/:id", requireRole(["ADMIN"])',
    'importsRouter.get("/:id/preview", requireRole(["ADMIN"])',
    'importsRouter.get("/:id/errors", requireRole(["ADMIN"])',
    'importsRouter.get("/:id/normalized.csv", requireRole(["ADMIN"])'
  ];
  for (const snippet of getPaths) {
    assert.match(importsRoutes, new RegExp(snippet.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.doesNotMatch(importsRoutes, /requireRole\(\["ADMIN", "SUPERVISOR"\]\)/);
});

test("IMPORTS GET: ADMIN permitido, SUPERVISOR/OPERATOR/CLIENT → 403", async () => {
  const adminToken = tokenFor(users.admin, AVIAT.id);
  const list = await request("/api/imports", { token: adminToken });
  assert.equal(list.status, 200);
  const detail = await request("/api/imports/import-aviat", { token: adminToken });
  assert.equal(detail.status, 200);
  const preview = await request("/api/imports/import-aviat/preview", { token: adminToken });
  assert.equal(preview.status, 200);
  const errors = await request("/api/imports/import-aviat/errors", { token: adminToken });
  assert.equal(errors.status, 200);
  const normalized = await request("/api/imports/import-aviat/normalized.csv", { token: adminToken });
  assert.equal(normalized.status, 200);

  for (const user of nonAdminRoles) {
    const token = tokenFor(user);
    for (const path of [
      "/api/imports",
      "/api/imports/import-aviat",
      "/api/imports/import-aviat/preview",
      "/api/imports/import-aviat/errors",
      "/api/imports/import-aviat/normalized.csv"
    ]) {
      const res = await request(path, { token });
      assert.equal(res.status, 403, `${user.role} ${path}`);
    }
  }
});

test("IMPORT MUTATIONS: solo ADMIN", async () => {
  const adminToken = tokenFor(users.admin, AVIAT.id);
  const forbidden = await request("/api/imports/import-aviat/confirm", {
    method: "POST",
    token: adminToken,
    body: {}
  });
  assert.notEqual(forbidden.status, 403);

  for (const user of nonAdminRoles) {
    const token = tokenFor(user);
    for (const [path, method] of [
      ["/api/imports/upload", "POST"],
      ["/api/imports/import-aviat/confirm", "POST"],
      ["/api/imports/import-aviat/cancel", "POST"]
    ] as const) {
      const res = await request(path, { method, token, body: {} });
      assert.equal(res.status, 403, `${user.role} ${method} ${path}`);
    }
  }
});

test("PRICE PATCH y RESET: solo ADMIN", async () => {
  assert.match(inventoryRoutes, /inventoryRouter\.patch\("\/layers\/:layerId\/price", requireRole\(\["ADMIN"\]\)/);
  assert.match(inventoryRoutes, /inventoryRouter\.post\("\/physical\/reset", requireRole\(\["ADMIN"\]\)/);

  const adminToken = tokenFor(users.admin, AVIAT.id);
  for (const user of [users.supervisor, users.operator, users.clientAviat]) {
    const token = tokenFor(user);
    const price = await request("/api/inventory/layers/layer-aviat/price", {
      method: "PATCH",
      token,
      body: { unitPriceMxn: 10 }
    });
    assert.equal(price.status, 403, `${user.role} price`);
    const reset = await request("/api/inventory/physical/reset", {
      method: "POST",
      token,
      body: { confirmation: "RESET", finalConfirmation: "RESET" }
    });
    assert.equal(reset.status, 403, `${user.role} reset`);
  }

  const adminPrice = await request("/api/inventory/layers/layer-aviat/price", {
    method: "PATCH",
    token: adminToken,
    body: { unitPriceMxn: 10 }
  });
  assert.notEqual(adminPrice.status, 403);
});

test("CLIENT EXPORTS: inventario, movimientos, productos y xlsx scoped", async () => {
  const token = tokenFor(users.clientAviat);
  const inventoryCsv = await request("/api/exports/inventory.csv", { token });
  assert.equal(inventoryCsv.status, 200);
  assert.match(inventoryCsv.text, /SKU-SHARED-1/);
  assert.doesNotMatch(inventoryCsv.text, /Cliente 2/);

  const movementsCsv = await request("/api/exports/movements.csv", { token });
  assert.equal(movementsCsv.status, 200);
  assert.match(movementsCsv.text, /SKU-SHARED-1/);
  assert.doesNotMatch(movementsCsv.text, /Cliente 2/);

  const productsCsv = await request("/api/exports/products.csv", { token });
  assert.equal(productsCsv.status, 200);
  assert.match(productsCsv.text, /SKU-SHARED-1/);
  assert.doesNotMatch(productsCsv.text, /SKU-C2-ONLY/);

  const xlsx = await request("/api/exports/inventory.xlsx", { token });
  assert.equal(xlsx.status, 200);
  assert.match(xlsx.headers.get("content-type") || "", /spreadsheetml/);
});

test("CLIENT no puede exportar tenant ajeno aunque cambie clientId en query", async () => {
  const token = tokenFor(users.clientAviat);
  const inventoryCsv = await request("/api/exports/inventory.csv?clientId=client-2", { token });
  assert.equal(inventoryCsv.status, 200);
  assert.doesNotMatch(inventoryCsv.text, /SKU-C2-ONLY/);
  assert.doesNotMatch(inventoryCsv.text, /Cliente 2/);

  const movementsCsv = await request("/api/exports/movements.csv?clientId=client-2", { token });
  assert.equal(movementsCsv.status, 200);
  assert.doesNotMatch(movementsCsv.text, /Cliente 2/);
});

test("REQUISITION APPROVAL: ADMIN/SUPERVISOR permitido, OPERATOR/CLIENT prohibido", async () => {
  assert.match(requisitionsRoutes, /\/:id\/approve", requireRole\(\["ADMIN", "SUPERVISOR"\]\)/);

  for (const user of [users.operator, users.clientAviat]) {
    const res = await request("/api/requisitions/req-1/approve", {
      method: "POST",
      token: tokenFor(user)
    });
    assert.equal(res.status, 403, user.role);
  }

  for (const user of [users.admin, users.supervisor]) {
    const res = await request("/api/requisitions/req-1/approve", {
      method: "POST",
      token: tokenFor(user, AVIAT.id)
    });
    assert.notEqual(res.status, 403, user.role);
  }
});

test("INCIDENT RESOLVE: ADMIN/SUPERVISOR permitido, OPERATOR/CLIENT prohibido", async () => {
  assert.match(incidentsRoutes, /incidentsRouter\.patch\("\/:id", requireRole\(\["ADMIN", "SUPERVISOR"\]\)/);

  for (const user of [users.operator, users.clientAviat]) {
    const res = await request("/api/incidents/inc-aviat", {
      method: "PATCH",
      token: tokenFor(user),
      body: { status: "RESOLVED", resolution: "ok" }
    });
    assert.equal(res.status, 403, user.role);
  }

  for (const user of [users.admin, users.supervisor]) {
    const res = await request("/api/incidents/inc-aviat", {
      method: "PATCH",
      token: tokenFor(user, AVIAT.id),
      body: { status: "RESOLVED", resolution: "ok" }
    });
    assert.equal(res.status, 200, user.role);
  }
});

test("PICKING/RELOCATION: staff permitido, CLIENT prohibido", async () => {
  for (const user of staffRoles) {
    const token = tokenFor(user);
    const pick = await request("/api/picking/scan", {
      method: "POST",
      token,
      body: { code: "UNKNOWN-SKU" }
    });
    assert.notEqual(pick.status, 403, `${user.role} picking`);
    const relocate = await request("/api/inventory/relocate", {
      method: "POST",
      token,
      body: { inventoryId: "inv-aviat", destinationLocation: "AN2-A", quantity: 1 }
    });
    assert.notEqual(relocate.status, 403, `${user.role} relocate`);
  }

  const clientToken = tokenFor(users.clientAviat);
  const pick = await request("/api/picking/scan", {
    method: "POST",
    token: clientToken,
    body: { code: "SKU-SHARED-1" }
  });
  assert.equal(pick.status, 403);
  const relocate = await request("/api/inventory/relocate", {
    method: "POST",
    token: clientToken,
    body: { inventoryId: "inv-aviat", destinationLocation: "AN2-A", quantity: 1 }
  });
  assert.equal(relocate.status, 403);
});

test("SELECT/CLEAR CLIENT: solo ADMIN", async () => {
  assert.match(authRoutes, /authRouter\.post\("\/select-client"[\s\S]{0,120}requireRole\(\["ADMIN"\]\)/);
  assert.match(authRoutes, /authRouter\.post\("\/clear-client"[\s\S]{0,120}requireRole\(\["ADMIN"\]\)/);

  for (const user of nonAdminRoles) {
    const token = tokenFor(user);
    const select = await request("/api/auth/select-client", {
      method: "POST",
      token,
      body: { clientId: CLIENT2.id }
    });
    assert.equal(select.status, 403, `${user.role} select-client`);
    const clear = await request("/api/auth/clear-client", { method: "POST", token });
    assert.equal(clear.status, 403, `${user.role} clear-client`);
  }
});

test("UI ADMIN: importación, precio, reset y administración visibles", () => {
  assert.match(applyRoleFn, /catalogImportSection\.classList\.toggle\("hidden", !isAdmin\)/);
  assert.match(applyRoleFn, /openInvBtn\.style\.display = isAdmin \? "inline-block" : "none"/);
  assert.match(applyRoleFn, /physicalInventoryResetBtns[\s\S]{0,180}role !== "ADMIN"/);
  assert.match(applyRoleFn, /configUsersBtn[\s\S]{0,120}role === "ADMIN"/);
  assert.match(applyRoleFn, /importWizardPanel[\s\S]{0,120}role !== "ADMIN"/);
});

test("UI SUPERVISOR/OPERATOR: importación oculta, operación visible", () => {
  assert.match(applyRoleFn, /inventoryOpsNavPanel[\s\S]{0,120}toggle\("hidden", !isAdmin\)/);
  assert.match(applyRoleFn, /canOperate = role === "ADMIN" \|\| role === "SUPERVISOR" \|\| role === "OPERATOR"/);
  assert.match(applyRoleFn, /canExportTrace = role === "ADMIN" \|\| role === "OPERATOR" \|\| role === "SUPERVISOR"/);
  assert.doesNotMatch(applyRoleFn, /canExportTrace[\s\S]{0,80}CLIENT/);
});

test("UI CLIENT: exports de lectura visibles, operaciones de escritura ocultas", () => {
  assert.match(
    applyRoleFn,
    /canExportInventory[\s\S]{0,120}role === "CLIENT"/
  );
  assert.match(applyRoleFn, /canExportProducts = role === "ADMIN" \|\| role === "CLIENT"/);
  assert.match(applyRoleFn, /reqPanel[\s\S]{0,120}role === "CLIENT" \? "none"/);
  assert.match(applyRoleFn, /inBtn[\s\S]{0,200}canOperate \? "inline-block" : "none"/);
  assert.match(applyRoleFn, /createProductForm\.classList\.toggle\("hidden", role !== "ADMIN"\)/);
  assert.match(html, /id="reportsExportStock"/);
  assert.match(html, /id="reportsExportMovements"/);
  assert.match(html, /id="reportsExportStockXlsx"/);
});

test("UI: módulos prohibidos se ocultan del menú (no disabled)", () => {
  assert.match(applyRoleFn, /btn\.disabled = false/);
  assert.doesNotMatch(applyRoleFn, /btn\.disabled = !enabled/);
  assert.match(applyRoleFn, /isNavModuleButtonVisible/);
  assert.match(applyRoleFn, /setRoleUiVisible/);
  assert.match(js, /CLIENT: \[\s*"inventory"/);
  assert.doesNotMatch(js, /CLIENT:[\s\S]{0,220}"picking"/);
  assert.doesNotMatch(js, /CLIENT:[\s\S]{0,220}"inbound"/);
  assert.doesNotMatch(js, /CLIENT:[\s\S]{0,220}"relocate"/);
  assert.doesNotMatch(js, /CLIENT:[\s\S]{0,220}"outbound"/);
  assert.doesNotMatch(js, /CLIENT:[\s\S]{0,220}"tasks"/);
  assert.doesNotMatch(js, /CLIENT:[\s\S]{0,220}"config"/);
});

test("UI SUPERVISOR: admin/import/users/clients ausentes del menú", () => {
  assert.doesNotMatch(js, /SUPERVISOR:[\s\S]{0,320}"clients"/);
  assert.doesNotMatch(js, /SUPERVISOR:[\s\S]{0,320}"config"/);
  assert.doesNotMatch(js, /SUPERVISOR:[\s\S]{0,320}"users"/);
  assert.match(applyRoleFn, /inventoryOpsNavPanel[\s\S]{0,120}toggle\("hidden", !isAdmin\)/);
  assert.match(applyRoleFn, /setRoleUiVisible\(clientContextGate, isAdmin\)/);
});

test("UI OPERATOR: config/users/clients ausentes; operación visible", () => {
  assert.doesNotMatch(js, /OPERATOR:[\s\S]{0,320}"config"/);
  assert.doesNotMatch(js, /OPERATOR:[\s\S]{0,320}"users"/);
  assert.doesNotMatch(js, /OPERATOR:[\s\S]{0,320}"clients"/);
  assert.match(js, /OPERATOR:[\s\S]{0,320}"picking"/);
  assert.match(applyRoleFn, /js-write-operational/);
});

test("UI CLIENT: formularios de escritura ocultos del DOM visual", () => {
  assert.match(html, /id="reqCreatePanel"[\s\S]{0,80}js-write-operational/);
  assert.match(html, /incidents-form-panel[\s\S]{0,80}js-write-operational/);
  assert.match(applyRoleFn, /setRoleUiVisible\(document\.getElementById\("reqCreatePanel"\), canOperate\)/);
  assert.match(applyRoleFn, /setRoleUiVisible\(document\.querySelector\("\.incidents-form-panel"\), canOperate\)/);
  assert.match(applyRoleFn, /setRoleUiVisible\(document\.getElementById\("moduleConfig"\), isAdmin\)/);
  assert.match(applyRoleFn, /setRoleUiVisible\(document\.getElementById\("moduleUsers"\), isAdmin\)/);
});
