import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, test } from "node:test";
import { readFileSync } from "node:fs";
import bcrypt from "bcryptjs";
import { Prisma } from "@prisma/client";
import { app } from "../src/app.js";
import { prisma } from "../src/db/prisma.js";
import { PASSWORD_CHANGE_REQUIRED, signAccessToken } from "../src/middlewares/auth.middleware.js";

const authSrc = readFileSync(new URL("../src/middlewares/auth.middleware.ts", import.meta.url), "utf8");

const AVIAT = {
  id: "client-aviat",
  code: "AVIAT",
  name: "AVIAT",
  tradeName: "AVIAT",
  legalName: "AVIAT SA",
  active: true
};
const OTHER = {
  id: "client-2",
  code: "CLI2",
  name: "Cliente 2",
  tradeName: "Cliente 2",
  legalName: "C2 SA",
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
    clientId: null as string | null,
    client: null as typeof AVIAT | null,
    passwordHash,
    mustChangePassword: false,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    phone: null,
    alternatePhone: null,
    address: null,
    city: null,
    state: null,
    postalCode: null,
    jobTitle: null,
    notes: null,
    avatarUrl: null
  },
  supervisor: {
    id: "u-sup",
    email: "sup@test.local",
    fullName: "Supervisor",
    role: "SUPERVISOR" as const,
    isActive: true,
    clientId: AVIAT.id,
    client: { ...AVIAT },
    passwordHash,
    mustChangePassword: false,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    phone: null,
    alternatePhone: null,
    address: null,
    city: null,
    state: null,
    postalCode: null,
    jobTitle: null,
    notes: null,
    avatarUrl: null
  },
  operator: {
    id: "u-op",
    email: "op@test.local",
    fullName: "Operator",
    role: "OPERATOR" as const,
    isActive: true,
    clientId: AVIAT.id,
    client: { ...AVIAT },
    passwordHash,
    mustChangePassword: false,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    phone: null,
    alternatePhone: null,
    address: null,
    city: null,
    state: null,
    postalCode: null,
    jobTitle: null,
    notes: null,
    avatarUrl: null
  },
  client: {
    id: "u-cli",
    email: "cli@test.local",
    fullName: "Cliente AVIAT",
    role: "CLIENT" as const,
    isActive: true,
    clientId: AVIAT.id,
    client: { ...AVIAT },
    passwordHash,
    mustChangePassword: false,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    phone: null,
    alternatePhone: null,
    address: null,
    city: null,
    state: null,
    postalCode: null,
    jobTitle: null,
    notes: null,
    avatarUrl: null
  },
  clientTwo: {
    id: "u-cli-2",
    email: "c2@test.local",
    fullName: "Cliente 2",
    role: "CLIENT" as const,
    isActive: true,
    clientId: OTHER.id,
    client: { ...OTHER },
    passwordHash,
    mustChangePassword: false,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    phone: null,
    alternatePhone: null,
    address: null,
    city: null,
    state: null,
    postalCode: null,
    jobTitle: null,
    notes: null,
    avatarUrl: null
  }
};

const inventories = [
  {
    id: "inv-aviat",
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
    product: { sku: "SKU-AVIAT", name: "Radio", active: true, barcode: null },
    layers: [{ qty: new Prisma.Decimal(10), reservedQty: new Prisma.Decimal(0), unitPriceMxn: new Prisma.Decimal(10) }]
  },
  {
    id: "inv-c2",
    clientId: OTHER.id,
    qty: new Prisma.Decimal(4),
    reservedQty: new Prisma.Decimal(0),
    status: "AVAILABLE",
    assignmentType: "PROJECT",
    assignmentKey: "P:proj-c2",
    projectId: "proj-c2",
    updatedAt: new Date("2026-08-01T00:00:00Z"),
    location: { id: "loc-2", code: "AN1-B", warehouse: "WH-B" },
    client: OTHER,
    project: { id: "proj-c2", code: "P2A", name: "Proyecto 2A", client: OTHER },
    product: { sku: "SKU-C2", name: "Antena", active: true, barcode: null },
    layers: []
  }
];

const originals: Array<{ model: string; method: string; fn: unknown }> = [];

function stub(model: string, method: string, fn: (...args: never[]) => unknown) {
  const delegate = (prisma as unknown as Record<string, Record<string, unknown>>)[model];
  originals.push({ model, method, fn: delegate[method] });
  delegate[method] = fn;
}

function restore() {
  for (const item of originals.splice(0)) {
    (prisma as unknown as Record<string, Record<string, unknown>>)[item.model][item.method] = item.fn as never;
  }
}

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
  return undefined;
}

function tokenFor(user: (typeof users)[keyof typeof users], operationalClientId?: string | null) {
  return signAccessToken({
    userId: user.id,
    role: user.role,
    email: user.email,
    operationalClientId: operationalClientId === undefined ? user.clientId : operationalClientId
  });
}

let server: http.Server;
let baseUrl = "";

async function request(
  path: string,
  options: { method?: string; token?: string; body?: unknown } = {}
) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: options.method || "GET",
    headers: {
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
      ...(options.body ? { "Content-Type": "application/json" } : {})
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
  return { status: response.status, json, text };
}

before(async () => {
  stub("user", "findUnique", async ({ where }: { where: { id?: string; email?: string } }) =>
    Object.values(users).find((row) => row.id === where.id || row.email === where.email) || null
  );
  stub("user", "update", async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
    const current = Object.values(users).find((row) => row.id === where.id);
    if (!current) return null;
    if (typeof data.passwordHash === "string") current.passwordHash = data.passwordHash;
    if (data.mustChangePassword !== undefined) current.mustChangePassword = Boolean(data.mustChangePassword);
    return { ...current, ...data, client: current.client };
  });
  stub("client", "findUnique", async ({ where }: { where: { id?: string } }) =>
    [AVIAT, OTHER].find((row) => row.id === where.id) || null
  );
  stub("inventoryStatusDefinition", "findMany", async () => [{ code: "AVAILABLE", sortOrder: 1 }]);
  stub("inventory", "findMany", async ({ where }: { where?: unknown }) => {
    const clientId = clientIdFromWhere(where);
    return inventories.filter((row) => !clientId || row.clientId === clientId);
  });
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
  restore();
});

test("requireAuth lee mustChangePassword de BD y no del JWT", () => {
  assert.match(authSrc, /mustChangePassword: true/);
  assert.match(authSrc, /PASSWORD_CHANGE_REQUIRED/);
  assert.match(authSrc, /\/api\/auth\/me/);
  assert.match(authSrc, /\/api\/auth\/change-password/);
  assert.doesNotMatch(authSrc, /decoded\.mustChangePassword/);
});

test("token previo al reset queda bloqueado; me y change-password siguen; luego se restaura", async () => {
  const matrix = [users.admin, users.supervisor, users.operator, users.client] as const;
  for (const user of matrix) {
    user.mustChangePassword = false;
    user.passwordHash = passwordHash;
    const token = tokenFor(user, user.role === "ADMIN" ? AVIAT.id : user.clientId);
    const before = await request("/api/inventory/statuses", { token });
    assert.equal(before.status, 200, `${user.role} statuses before reset`);

    user.mustChangePassword = true;
    const blocked = await request("/api/inventory/statuses", { token });
    assert.equal(blocked.status, 403, `${user.role} statuses after reset`);
    assert.equal((blocked.json as { code?: string })?.code, PASSWORD_CHANGE_REQUIRED, `${user.role} code`);

    const imports = await request("/api/imports", { token });
    assert.equal(imports.status, 403, `${user.role} imports`);
    assert.equal((imports.json as { code?: string })?.code, PASSWORD_CHANGE_REQUIRED);

    const patchMe = await request("/api/auth/me", {
      method: "PATCH",
      token,
      body: { fullName: "No debe pasar" }
    });
    assert.equal(patchMe.status, 403, `${user.role} patch me`);
    assert.equal((patchMe.json as { code?: string })?.code, PASSWORD_CHANGE_REQUIRED);

    const me = await request("/api/auth/me", { token });
    assert.equal(me.status, 200, `${user.role} me`);
    assert.equal((me.json as { mustChangePassword?: boolean }).mustChangePassword, true);

    const changed = await request("/api/auth/change-password", {
      method: "POST",
      token,
      body: { currentPassword: "secret12", newPassword: `nueva12-${user.role}` }
    });
    assert.equal(changed.status, 200, `${user.role} change-password`);
    assert.equal((changed.json as { mustChangePassword?: boolean }).mustChangePassword, false);
    assert.equal(user.mustChangePassword, false);

    const after = await request("/api/inventory/statuses", { token });
    assert.equal(after.status, 200, `${user.role} statuses restored`);
  }
});

test("tras el cambio el aislamiento por tenant se conserva", async () => {
  users.client.mustChangePassword = false;
  users.clientTwo.mustChangePassword = false;
  const aviatToken = tokenFor(users.client);
  const otherToken = tokenFor(users.clientTwo);
  const aviatStock = await request("/api/inventory/stock", { token: aviatToken });
  assert.equal(aviatStock.status, 200);
  const aviatRows = Array.isArray(aviatStock.json) ? aviatStock.json : [];
  assert.ok(aviatRows.every((row) => (row as { clientId?: string }).clientId === AVIAT.id));
  assert.ok(aviatRows.every((row) => (row as { clientId?: string }).clientId !== OTHER.id));

  const otherStock = await request("/api/inventory/stock", { token: otherToken });
  assert.equal(otherStock.status, 200);
  const otherRows = Array.isArray(otherStock.json) ? otherStock.json : [];
  assert.ok(otherRows.every((row) => (row as { clientId?: string }).clientId === OTHER.id));
  assert.ok(otherRows.every((row) => (row as { clientId?: string }).clientId !== AVIAT.id));
});
