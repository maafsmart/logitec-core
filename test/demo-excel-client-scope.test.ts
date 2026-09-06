import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, test } from "node:test";
import { readFileSync } from "node:fs";
import { app } from "../src/app.js";
import { prisma } from "../src/db/prisma.js";
import { signAccessToken } from "../src/middlewares/auth.middleware.js";
import { loadDemoInventoryFromExcel } from "../src/modules/demo/demo-inventory-excel.service.js";
import {
  demoInventoryExcelPath,
  demoInventoryExcelSheetName,
  isLogitecSimplePreviewEnabled
} from "../src/modules/demo/logitec-simple-preview.feature.js";

const demoRoutesSrc = readFileSync(new URL("../src/modules/demo/demo.routes.ts", import.meta.url), "utf8");
const inventoryRoutesSrc = readFileSync(new URL("../src/modules/inventory/inventory.routes.ts", import.meta.url), "utf8");

const AVIAT = {
  id: "cl_aviat_official",
  code: "AVIAT",
  name: "AVIAT",
  tradeName: "AVIAT",
  legalName: "AVIAT SA",
  active: true
};
const OTHER = {
  id: "client-other",
  code: "OTHER",
  name: "Otro cliente",
  tradeName: "Otro",
  legalName: "Otro SA",
  active: true
};

type Stub = { restore: () => void };
const stubs: Stub[] = [];

function stub(model: keyof typeof prisma, method: string, impl: (...args: never[]) => unknown) {
  const target = prisma[model] as unknown as Record<string, (...args: never[]) => unknown>;
  const original = target[method];
  target[method] = impl as never;
  stubs.push({
    restore: () => {
      target[method] = original as never;
    }
  });
}

function restore() {
  while (stubs.length) stubs.pop()?.restore();
}

const users = {
  aviatClient: {
    id: "u-cli-aviat",
    email: "cli.aviat@test.local",
    fullName: "Cliente AVIAT",
    role: "CLIENT" as const,
    isActive: true,
    clientId: AVIAT.id,
    client: { ...AVIAT },
    mustChangePassword: false
  },
  otherClient: {
    id: "u-cli-other",
    email: "cli.other@test.local",
    fullName: "Cliente otro",
    role: "CLIENT" as const,
    isActive: true,
    clientId: OTHER.id,
    client: { ...OTHER },
    mustChangePassword: false
  },
  admin: {
    id: "u-admin",
    email: "admin@test.local",
    fullName: "Admin",
    role: "ADMIN" as const,
    isActive: true,
    clientId: null as string | null,
    client: null as typeof AVIAT | null,
    mustChangePassword: false
  }
};

function tokenFor(user: (typeof users)[keyof typeof users]) {
  return signAccessToken({
    userId: user.id,
    role: user.role,
    email: user.email,
    operationalClientId: user.role === "ADMIN" ? null : user.clientId
  });
}

let server: http.Server;
let baseUrl = "";

async function request(path: string, token?: string) {
  const response = await fetch(`${baseUrl}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {}
  });
  const text = await response.text();
  let json: Record<string, unknown> | null = null;
  try {
    json = text ? (JSON.parse(text) as Record<string, unknown>) : null;
  } catch {
    json = null;
  }
  return { status: response.status, json, text };
}

before(async () => {
  stub("user", "findUnique", async ({ where }: { where: { id?: string } }) =>
    Object.values(users).find((row) => row.id === where.id) || null
  );
  stub("client", "findUnique", async ({ where }: { where: { id?: string } }) =>
    [AVIAT, OTHER].find((row) => row.id === where.id) || null
  );
  server = http.createServer(app);
  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
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

test("demo routes restringen CLIENT al clientId AVIAT oficial", () => {
  assert.match(demoRoutesSrc, /DEMO_EXCEL_ALLOWED_CLIENT_ID = "cl_aviat_official"/);
  assert.match(demoRoutesSrc, /assertDemoExcelClientAccess/);
  assert.match(demoRoutesSrc, /isClientRole\(req\.auth\)/);
  assert.match(demoRoutesSrc, /DEMO_EXCEL_CLIENT_FORBIDDEN/);
});

test("inventario scoped /api/inventory/* permanece sin cambios en esta tarea", () => {
  assert.match(inventoryRoutesSrc, /requireOperationalClient/);
  assert.match(inventoryRoutesSrc, /scopedInventoryWhere\(req\.auth!\)/);
  assert.match(inventoryRoutesSrc, /scopedMovementWhere\(req\.auth!\)/);
  assert.doesNotMatch(demoRoutesSrc, /inventoryRouter/);
});

test("CLIENT AVIAT puede usar endpoint demo Excel", { skip: !isLogitecSimplePreviewEnabled() }, async () => {
  const res = await request("/api/demo/inventory-from-excel", tokenFor(users.aviatClient));
  assert.notEqual(res.status, 403);
  if (res.status === 200) {
    assert.equal(res.json?.source, "EXCEL_READ_ONLY");
    assert.equal((res.json?.summary as { pieces?: number })?.pieces, 23207);
  }
});

test("CLIENT no-AVIAT recibe 403 sin payload Excel", { skip: !isLogitecSimplePreviewEnabled() }, async () => {
  const res = await request("/api/demo/inventory-from-excel", tokenFor(users.otherClient));
  assert.equal(res.status, 403);
  assert.match(String(res.json?.code || ""), /DEMO_EXCEL_CLIENT_FORBIDDEN/);
  assert.notEqual(res.json?.source, "EXCEL_READ_ONLY");
  assert.equal(Array.isArray(res.json?.items), false);
});

test("ADMIN conserva acceso al endpoint demo Excel", { skip: !isLogitecSimplePreviewEnabled() }, async () => {
  const res = await request("/api/demo/inventory-from-excel", tokenFor(users.admin));
  assert.notEqual(res.status, 403);
  assert.doesNotMatch(String(res.json?.code || ""), /DEMO_EXCEL_CLIENT_FORBIDDEN/);
});

test("fixture Excel actual conserva totales AVIAT demo", { skip: !demoInventoryExcelPath() }, () => {
  const payload = loadDemoInventoryFromExcel(demoInventoryExcelPath()!, demoInventoryExcelSheetName());
  assert.equal(payload.summary.pieces, 23207);
  assert.equal(payload.summary.balances, 1918);
  assert.equal(payload.summary.locations, 230);
  assert.equal(payload.summary.projects, 9);
});
