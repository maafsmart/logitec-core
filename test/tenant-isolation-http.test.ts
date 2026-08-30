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
const INACTIVE = {
  id: "client-off",
  code: "OFF",
  name: "Inactivo",
  tradeName: "Inactivo",
  legalName: null,
  active: false
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
    location: { id: "loc-1", code: "AN1-A", warehouse: "WH-A" },
    client: AVIAT,
    project: null,
    product: { sku: "SKU-SHARED-1", name: "Radio", active: true, barcode: null },
    layers: []
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
    location: { id: "loc-2", code: "AN1-A", warehouse: "WH-B" },
    client: CLIENT2,
    project: { id: "proj-c2", code: "P2A", name: "Proyecto 2A", client: CLIENT2 },
    product: { sku: "SKU-SHARED-1", name: "Radio", active: true, barcode: null },
    layers: []
  }
];
const layers = [
  { id: "layer-aviat", inventoryId: "inv-aviat", clientId: AVIAT.id, qty: new Prisma.Decimal(10) },
  { id: "layer-c2", inventoryId: "inv-c2", clientId: CLIENT2.id, qty: new Prisma.Decimal(4) }
];
const serials = [
  { id: "ser-aviat", clientId: AVIAT.id, productId: "prod-1", serialNumber: "IMEI-A", inventoryLayerId: null },
  { id: "ser-c2", clientId: CLIENT2.id, productId: "prod-1", serialNumber: "IMEI-2", inventoryLayerId: "layer-c2" }
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
    id: "import-c2",
    clientId: CLIENT2.id,
    createdById: users.admin.id,
    context: "INVENTORY",
    status: "READY",
    invalidRows: 0,
    metadata: {},
    rows: []
  }
];
let foreignImportMutations = 0;
const scans: Array<Record<string, unknown>> = [
  { id: "scan-aviat", clientId: AVIAT.id, scannedCode: "SKU-SHARED-1", result: "OK", userId: "u-sup", createdAt: new Date() },
  { id: "scan-c2", clientId: CLIENT2.id, scannedCode: "SKU-SHARED-1", result: "OK", userId: "u-cli-2", createdAt: new Date() }
];
const projects = [
  { id: "proj-att", code: "ATT", name: "AT&T", clientId: AVIAT.id, active: true },
  { id: "proj-c2", code: "P2A", name: "Proyecto 2A", clientId: CLIENT2.id, active: true }
];
const clients = [AVIAT, CLIENT2, INACTIVE];

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

function tokenFor(
  user: (typeof users)[keyof typeof users],
  operationalClientId?: string | null
) {
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

before(async () => {
  stub("user", "findUnique", async ({ where, include, select }: { where: { id?: string; email?: string }; include?: unknown; select?: unknown }) => {
    const user = Object.values(users).find((row) => row.id === where.id || row.email === where.email) || null;
    if (!user) return null;
    if (include || select) return { ...user };
    return user;
  });
  stub("client", "findUnique", async ({ where, select }: { where: { id?: string }; select?: Record<string, unknown> }) => {
    const client = clients.find((row) => row.id === where.id) || null;
    if (!client) return null;
    if (select && "_count" in select) return { ...client, _count: { projects: projects.filter((p) => p.clientId === client.id).length } };
    return client;
  });
  stub("client", "findMany", async ({ where }: { where?: { id?: string } }) => {
    const rows = clients.filter((row) => !where?.id || row.id === where.id);
    return rows.map((row) => ({ ...row, _count: { projects: projects.filter((p) => p.clientId === row.id).length } }));
  });
  stub("inventory", "findMany", async ({ where }: { where?: Record<string, unknown> }) => {
    const clientId = clientIdFromWhere(where);
    const id = typeof where?.id === "string" ? where.id : undefined;
    const locationCode =
      where?.location && typeof where.location === "object"
        ? (where.location as { code?: string }).code
        : undefined;
    return inventories.filter((row) => {
      if (clientId && row.clientId !== clientId) return false;
      if (id && row.id !== id) return false;
      if (locationCode && row.location.code !== locationCode) return false;
      return true;
    });
  });
  stub("inventory", "findFirst", async ({ where }: { where: { id?: string; AND?: Array<{ id?: string }> } }) => {
    const id = where.id || where.AND?.find((part) => part.id)?.id;
    return inventories.find((row) => row.id === id) || null;
  });
  stub("inventory", "groupBy", async ({ where }: { where?: unknown }) => {
    const clientId = clientIdFromWhere(where);
    const rows = inventories.filter((row) => row.projectId && (!clientId || row.clientId === clientId));
    return rows.map((row) => ({ projectId: row.projectId, _sum: { qty: row.qty }, _count: { _all: 1 } }));
  });
  stub("inventoryLayer", "findFirst", async ({ where }: { where: { id?: string; AND?: Array<{ id?: string }> } }) => {
    const id = where.id || where.AND?.find((part) => part.id)?.id;
    const layer = layers.find((row) => row.id === id);
    if (!layer) return null;
    const inv = inventories.find((row) => row.id === layer.inventoryId);
    return { id: layer.id, inventory: { clientId: inv?.clientId || "" } };
  });
  stub("inventorySerial", "findFirst", async ({ where }: { where: { id?: string; AND?: Array<{ id?: string }> } }) => {
    const id = where.id || where.AND?.find((part) => part.id)?.id;
    return serials.find((row) => row.id === id) || null;
  });
  stub("inventoryMovement", "findFirst", async ({ where }: { where: { id?: string; AND?: Array<{ id?: string }> } }) => {
    const id = where.id || where.AND?.find((part) => part.id)?.id;
    return movements.find((row) => row.id === id) || null;
  });
  stub("inventoryMovement", "findMany", async ({ where }: { where?: unknown }) => {
    const clientId = clientIdFromWhere(where);
    return movements.filter((row) => !clientId || row.clientId === clientId);
  });
  stub("scanEvent", "findMany", async ({ where }: { where?: unknown }) => {
    const clientId = clientIdFromWhere(where);
    return scans.filter((row) => !clientId || row.clientId === clientId);
  });
  stub("scanEvent", "create", async ({ data }: { data: Record<string, unknown> }) => {
    const row = { id: `scan-${scans.length + 1}`, createdAt: new Date(), ...data };
    scans.push(row);
    return { id: row.id, result: data.result, scannedCode: data.scannedCode, createdAt: row.createdAt };
  });
  stub("customer", "findFirst", async ({ where }: { where: { id?: string; clientId?: string } }) => {
    return projects.find((row) => row.id === where.id && (!where.clientId || row.clientId === where.clientId)) || null;
  });
  stub("customer", "findMany", async ({ where }: { where?: { id?: { in?: string[] }; clientId?: string } }) => {
    return projects.filter((row) => {
      if (where?.clientId && row.clientId !== where.clientId) return false;
      if (where?.id?.in && !where.id.in.includes(row.id)) return false;
      return true;
    });
  });
  stub("product", "findFirst", async ({ where }: { where: { sku?: string; active?: boolean; OR?: Array<{ sku?: string; barcode?: string }> } }) => {
    const sku = where.sku || where.OR?.find((part) => part.sku)?.sku;
    if (sku && sku.toUpperCase() === "SKU-SHARED-1") {
      return { id: "prod-1", sku: "SKU-SHARED-1", barcode: null, name: "Radio", warehouse: "WH-A", customerId: "proj-att", customer: { id: "proj-att", code: "ATT", name: "AT&T" } };
    }
    return null;
  });
  stub("product", "findMany", async () => []);
  stub("importBatch", "findFirst", async ({ where }: { where?: { id?: string; clientId?: string } }) =>
    importBatches.find((row) =>
      (!where?.id || row.id === where.id) &&
      (!where?.clientId || row.clientId === where.clientId)
    ) || null
  );
  stub("importBatch", "findMany", async ({ where }: { where?: { clientId?: string } }) =>
    importBatches.filter((row) => !where?.clientId || row.clientId === where.clientId)
  );
  stub("importBatch", "updateMany", async () => {
    foreignImportMutations += 1;
    return { count: 0 };
  });
  stub("importBatch", "deleteMany", async () => {
    foreignImportMutations += 1;
    return { count: 0 };
  });
  stub("activityLog", "create", async () => ({ id: "act-1" }));
  stub("inventoryStatusDefinition", "findFirst", async () => ({ code: "AVAILABLE", active: true }));
  stub("inventoryStatusDefinition", "findMany", async () => [{ code: "AVAILABLE", sortOrder: 1 }]);

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

test("UI ADMIN exige selector y cache-buster v=86 con epoch", () => {
  assert.match(html, /id="clientContextGate"/);
  assert.match(html, /Seleccionar cliente/);
  assert.match(html, /dashboard\.js\?v=86/);
  assert.match(js, /clientContextEpoch/);
  assert.match(js, /clearOperationalClientState/);
  assert.match(js, /CLIENT_CONTEXT_REQUIRED/);
  assert.doesNotMatch(js, /Todos los clientes/);
});

test("HTTP ADMIN login sin contexto y ruta operativa exige CLIENT_CONTEXT_REQUIRED", async () => {
  const login = await request("/api/auth/login", {
    method: "POST",
    body: { email: "admin@test.local", password: "secret12" }
  });
  assert.equal(login.status, 200);
  const loginBody = login.json as { accessToken: string; user: { operationalClient: unknown } };
  assert.equal(loginBody.user.operationalClient, null);
  const blocked = await request("/api/inventory/stock", { token: loginBody.accessToken });
  assert.equal(blocked.status, 403);
  assert.equal((blocked.json as { code: string }).code, "CLIENT_CONTEXT_REQUIRED");
});

test("HTTP ADMIN selecciona AVIAT, cambia a Cliente 2 e inactivo se rechaza", async () => {
  const adminToken = tokenFor(users.admin, null);
  const invalid = await request("/api/auth/select-client", {
    method: "POST",
    token: adminToken,
    body: { clientId: INACTIVE.id }
  });
  assert.equal(invalid.status, 403);
  assert.equal((invalid.json as { code: string }).code, "CLIENT_CONTEXT_INVALID");

  const selected = await request("/api/auth/select-client", {
    method: "POST",
    token: adminToken,
    body: { clientId: AVIAT.id }
  });
  assert.equal(selected.status, 200);
  const aviatToken = (selected.json as { accessToken: string }).accessToken;
  const aviatStock = await request("/api/inventory/stock", { token: aviatToken });
  assert.equal(aviatStock.status, 200);
  const aviatRows = aviatStock.json as Array<{ id: string; clientId: string }>;
  assert.deepEqual(aviatRows.map((row) => row.id), ["inv-aviat"]);

  const switched = await request("/api/auth/select-client", {
    method: "POST",
    token: aviatToken,
    body: { clientId: CLIENT2.id }
  });
  const c2Token = (switched.json as { accessToken: string }).accessToken;
  const c2Stock = await request("/api/inventory/stock?clientId=client-aviat", { token: c2Token });
  const c2Rows = c2Stock.json as Array<{ id: string }>;
  assert.deepEqual(c2Rows.map((row) => row.id), ["inv-c2"]);
});

test("HTTP SUPERVISOR y OPERATOR no listan Cliente 2 ni usan cubos ajenos", async () => {
  for (const user of [users.supervisor, users.operator]) {
    const token = tokenFor(user);
    const listed = await request("/api/clients", { token });
    assert.equal(listed.status, 200);
    const rows = listed.json as Array<{ id: string }>;
    assert.deepEqual(rows.map((row) => row.id), [AVIAT.id]);
    const foreign = await request(`/api/clients/${CLIENT2.id}`, { token });
    assert.equal(foreign.status, 404);
    const stock = await request("/api/inventory/stock?clientId=client-2", { token });
    const stockRows = stock.json as Array<{ id: string }>;
    assert.deepEqual(stockRows.map((row) => row.id), ["inv-aviat"]);
    const pick = await request("/api/picking/scan", {
      method: "POST",
      token,
      body: { code: "SKU-SHARED-1", inventoryId: "inv-c2" }
    });
    assert.equal(pick.status, 409);
    assert.equal((pick.json as { code: string }).code, "CROSS_CLIENT_OPERATION");
  }
});

test("HTTP CLIENT AVIAT y Cliente 2 no se filtran por SKU compartido", async () => {
  const aviat = await request("/api/inventory/stock", { token: tokenFor(users.clientAviat) });
  const c2 = await request("/api/inventory/stock", { token: tokenFor(users.clientTwo) });
  assert.deepEqual((aviat.json as Array<{ id: string }>).map((row) => row.id), ["inv-aviat"]);
  assert.deepEqual((c2.json as Array<{ id: string }>).map((row) => row.id), ["inv-c2"]);
  const aviatProjects = await request("/api/inventory/projects", { token: tokenFor(users.clientAviat) });
  assert.equal(aviatProjects.status, 200);
});

test("HTTP IDs ajenos de cubo, capa, serie, movimiento y proyecto", async () => {
  const token = tokenFor(users.supervisor);
  const layer = await request("/api/inventory/layers/layer-c2", { token });
  assert.equal(layer.status, 409);
  const serial = await request("/api/inventory/serials/ser-c2", { token });
  assert.equal(serial.status, 409);
  const movement = await request("/api/inventory/movements/mov-c2", { token });
  assert.equal(movement.status, 409);
});

test("HTTP IDs conocidos no permiten mutar inventario, capas ni asignaciones de otro cliente", async () => {
  const token = tokenFor(users.admin, AVIAT.id);
  const movement = await request("/api/inventory/movements", {
    method: "POST",
    token,
    body: {
      sku: "SKU-SHARED-1",
      type: "OUT",
      quantity: 1,
      status: "AVAILABLE",
      inventoryId: "inv-c2"
    }
  });
  const relocate = await request("/api/inventory/relocate", {
    method: "POST",
    token,
    body: {
      inventoryId: "inv-c2",
      destinationLocation: "AN2-A",
      quantity: 1
    }
  });
  const transfer = await request("/api/inventory/assignment-transfer", {
    method: "POST",
    token,
    body: {
      sourceInventoryId: "inv-c2",
      qty: 1,
      destinationAssignmentType: "FREE_TO_SALE"
    }
  });
  const price = await request("/api/inventory/layers/layer-c2/price", {
    method: "PATCH",
    token,
    body: { unitPriceMxn: 10 }
  });
  assert.deepEqual(
    [movement.status, relocate.status, transfer.status, price.status],
    [409, 409, 409, 409]
  );
});

test("HTTP scans guardan clientId y Cliente 2 no es visible para AVIAT", async () => {
  const token = tokenFor(users.supervisor);
  const unknown = await request("/api/picking/scan", {
    method: "POST",
    token,
    body: { code: "UNKNOWN-SKU" }
  });
  assert.equal(unknown.status, 404);
  const created = scans.find((row) => row.scannedCode === "UNKNOWN-SKU");
  assert.equal(created?.clientId, AVIAT.id);

  const noStock = await request("/api/picking/scan", {
    method: "POST",
    token,
    body: { code: "SKU-SHARED-1", location: "NO-EXISTE" }
  });
  assert.equal(noStock.status, 409);
  assert.equal((noStock.json as { scanEvent?: { result: string } }).scanEvent?.result, "ERROR_NO_STOCK");
  const noStockScan = scans.find((row) => row.result === "ERROR_NO_STOCK");
  assert.equal(noStockScan?.clientId, AVIAT.id);

  const listed = await request("/api/picking/scans", { token });
  const rows = listed.json as Array<{ id: string; clientId?: string }>;
  assert.equal(rows.some((row) => row.id === "scan-c2"), false);
});

test("HTTP export de movimientos usa cliente operativo, no product.customer", async () => {
  const token = tokenFor(users.admin, AVIAT.id);
  const exported = await request("/api/exports/movements.csv", { token });
  assert.equal(exported.status, 200);
  assert.match(exported.text, /AVIAT/);
  assert.doesNotMatch(exported.text, /Cliente 2/);
  assert.doesNotMatch(exported.text, /product\.customer/);
});

test("HTTP ADMIN en AVIAT no puede leer ni mutar ImportBatch de otro cliente por ID conocido", async () => {
  const token = tokenFor(users.admin, AVIAT.id);
  const responses = await Promise.all([
    request("/api/imports/import-c2", { token }),
    request("/api/imports/import-c2/normalized.csv", { token }),
    request("/api/imports/import-c2/select-sheet", {
      method: "POST",
      token,
      body: { sheetName: "Inventario" }
    }),
    request("/api/imports/import-c2/confirm", { method: "POST", token, body: {} }),
    request("/api/imports/import-c2/cancel", { method: "POST", token, body: {} }),
    request("/api/imports/import-c2/review/ignore", {
      method: "POST",
      token,
      body: { sourceRows: [1] }
    })
  ]);
  assert.deepEqual(responses.map((response) => response.status), [404, 404, 404, 404, 404, 404]);
  assert.equal(foreignImportMutations, 0);
  assert.deepEqual(importBatches.map((batch) => ({ ...batch })), [
    {
      id: "import-c2",
      clientId: CLIENT2.id,
      createdById: users.admin.id,
      context: "INVENTORY",
      status: "READY",
      invalidRows: 0,
      metadata: {},
      rows: []
    }
  ]);
});
