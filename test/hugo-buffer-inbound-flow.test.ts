import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { readFileSync } from "node:fs";
import { after, before, test } from "node:test";
import bcrypt from "bcryptjs";
import { Prisma } from "@prisma/client";

process.env.ENABLE_HUGO_BUFFER_INBOUND = "true";
process.env.HUGO_BUFFER_IN_LOCATION_PREFERENCE = "BUFFER-IN";

const { app } = await import("../src/app.js");
const { prisma } = await import("../src/db/prisma.js");
const { signAccessToken } = await import("../src/middlewares/auth.middleware.js");

const html = readFileSync(new URL("../public/hugo-buffer-inbound.html", import.meta.url), "utf8");
const js = readFileSync(new URL("../public/hugo-buffer-inbound.js", import.meta.url), "utf8");
const loginJs = readFileSync(new URL("../public/login.js", import.meta.url), "utf8");
const appSrc = readFileSync(new URL("../src/app.ts", import.meta.url), "utf8");
const envExample = readFileSync(new URL("../.env.example", import.meta.url), "utf8");
const featureSrc = readFileSync(
  new URL("../src/modules/hugo-flow/hugo-buffer-inbound.feature.ts", import.meta.url),
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

test("artefactos Hugo documentan bandera local y flujo buffer", () => {
  assert.match(html, /Buffer de entrada/);
  assert.match(html, /Pedido \/ referencia del cliente/);
  assert.match(js, /\/api\/catalog\/products\/search/);
  assert.match(js, /\/api\/inventory\/movements/);
  assert.match(envExample, /ENABLE_HUGO_BUFFER_INBOUND/);
  assert.match(envExample, /HUGO_BUFFER_IN_LOCATION_PREFERENCE/);
  assert.match(featureSrc, /production/);
  assert.doesNotMatch(js, /mobile-picking-qa|qaOnly/i);
});

test("UI filtra ubicaciones inactivas en selector", () => {
  assert.match(js, /active !== false/);
});

test("login ?next= rechaza URLs externas y acepta rutas internas allowlist", () => {
  const resolvePostLoginPath = new Function(
    `${sliceFunction(loginJs, "isSafeInternalPostLoginPath")}\n${sliceFunction(loginJs, "resolvePostLoginPath")}\nreturn resolvePostLoginPath;`
  )();
  assert.equal(resolvePostLoginPath("?next=%2Fhugo-buffer-inbound.html"), "/hugo-buffer-inbound.html");
  assert.equal(resolvePostLoginPath("?next=https://evil.test"), "/dashboard.html");
  assert.equal(resolvePostLoginPath("?next=%2F%2Fevil.test"), "/dashboard.html");
  assert.equal(resolvePostLoginPath("?next=javascript:alert(1)"), "/dashboard.html");
  assert.equal(resolvePostLoginPath("?next=%5Cevil"), "/dashboard.html");
  assert.equal(resolvePostLoginPath("?next=%2Funknown.html"), "/dashboard.html");
});

test("escaneo Enter no registra entrada ni permite doble envío", () => {
  const scanHandlerStart = js.indexOf('scanInput.addEventListener("keydown"');
  assert.ok(scanHandlerStart >= 0);
  const scanHandlerEnd = js.indexOf("});", scanHandlerStart);
  const scanHandler = js.slice(scanHandlerStart, scanHandlerEnd + 3);
  assert.match(scanHandler, /lookupCode\(scanInput\.value\)/);
  assert.doesNotMatch(scanHandler, /submitInbound/);
  assert.match(js, /if \(state\.busy \|\| !state\.selectedProduct\) return/);
  assert.match(js, /if \(state\.busy\) return/);
  assert.match(js, /state\.busy = true/);
  assert.match(js, /submitBtn\.disabled = !ok/);
});

test("mensajes y valores escaneados no usan HTML inseguro", () => {
  assert.match(js, /escapeHtml\(/);
  assert.match(js, /gateMessage\.textContent = text/);
  assert.match(js, /actionMessage\.textContent = text/);
});

test("producción devuelve 404 aunque exista la ruta", () => {
  assert.match(featureSrc, /NODE_ENV === "production"/);
  assert.match(featureSrc, /DATABASE_ENVIRONMENT === "production"/);
  assert.match(appSrc, /isHugoBufferInboundEnabled\(\)/);
  assert.match(appSrc, /res\.status\(404\)/);
});

const AVIAT = {
  id: "client-aviat",
  code: "AVIAT",
  name: "AVIAT",
  tradeName: "AVIAT",
  legalName: "AVIAT SA",
  active: true
};

const passwordHash = bcrypt.hashSync("secret12", 4);
const operator = {
  id: "u-op",
  email: "op@test.local",
  fullName: "Operator",
  role: "OPERATOR" as const,
  isActive: true,
  clientId: AVIAT.id,
  client: { ...AVIAT },
  passwordHash
};

const locations = [
  { id: "loc-buffer", code: "BUFFER-IN", warehouse: "TULTITLAN24", active: true, description: "Buffer entrada" },
  { id: "loc-off", code: "OFF-LOC", warehouse: "TULTITLAN24", active: false, description: "Inactiva" }
];

const product = {
  id: "prod-1",
  sku: "SKU-HUGO-1",
  barcode: "BC-HUGO-1",
  name: "Radio demo",
  description: "Demo",
  unit: "PZA",
  warehouse: "TULTITLAN24",
  active: true,
  serialControlled: false,
  customerId: "proj-att",
  customer: { id: "proj-att", code: "ATT", name: "AT&T" },
  inventories: [{ clientId: AVIAT.id }],
  productProjects: [{ active: true, projectId: "proj-att", project: { id: "proj-att", code: "ATT", name: "AT&T", clientId: AVIAT.id } }]
};

let movementCreates = 0;
let inventoryCreates = 0;
let transactionCalls = 0;

const originals: Array<{ model: string; method: string; fn: unknown }> = [];

function stub(model: string, method: string, fn: (...args: never[]) => unknown) {
  const delegate = (prisma as unknown as Record<string, Record<string, unknown>>)[model];
  originals.push({ model, method, fn: delegate[method] });
  delegate[method] = fn;
}

function restorePrisma() {
  for (const item of originals.splice(0)) {
    if (item.model === "__root__") {
      (prisma as unknown as Record<string, unknown>)[item.method] = item.fn;
      continue;
    }
    (prisma as unknown as Record<string, Record<string, unknown>>)[item.model][item.method] = item.fn as never;
  }
}

function tokenFor(user: typeof operator) {
  return signAccessToken({
    userId: user.id,
    role: user.role,
    clientId: user.clientId,
    operationalClientId: user.clientId
  });
}

function d(n: string | number) {
  return new Prisma.Decimal(n);
}

function buildTx() {
  const state = {
    inventories: [] as Array<Record<string, unknown>>,
    layers: [] as Array<Record<string, unknown>>,
    movements: [] as Array<Record<string, unknown>>,
    nextId: 1
  };
  const location = locations[0];
  const productRow = {
    id: product.id,
    serialControlled: product.serialControlled,
    customerId: product.customerId,
    customer: { id: product.customerId, clientId: AVIAT.id },
    sku: product.sku,
    name: product.name
  };
  return {
    state,
    tx: {
      product: {
        findUnique: async ({ where }: { where: { id: string } }) => (where.id === product.id ? productRow : null)
      },
      customer: {
        findUnique: async ({ where }: { where: { id: string } }) =>
          where.id === "proj-att" ? { id: "proj-att", code: "ATT", name: "AT&T", active: true, clientId: AVIAT.id } : null
      },
      client: {
        findUnique: async ({ where }: { where: { id: string } }) => (where.id === AVIAT.id ? AVIAT : null)
      },
      inventoryStatusDefinition: {
        findUnique: async () => ({ code: "AVAILABLE", active: true })
      },
      inventory: {
        findUnique: async () => null,
        findUniqueOrThrow: async ({ where }: { where: { productId_locationId_status_assignmentKey?: Record<string, string> } }) => {
          const key = where.productId_locationId_status_assignmentKey;
          const found = state.inventories.find(
            (row) =>
              row.productId === key?.productId &&
              row.locationId === key?.locationId &&
              row.status === key?.status &&
              row.assignmentKey === key?.assignmentKey
          );
          if (!found) throw new Error("inventory not found");
          return { ...found, location, product: productRow };
        },
        create: async ({ data }: { data: Record<string, unknown> }) => {
          inventoryCreates += 1;
          const row = {
            id: `inv-${state.nextId++}`,
            ...data,
            qty: d("0"),
            reservedQty: d("0"),
            productId: data.productId,
            locationId: data.locationId
          };
          state.inventories.push(row);
          return { ...row, location, product: productRow };
        }
      },
      inventoryLayer: {
        findMany: async () => [],
        create: async ({ data }: { data: Record<string, unknown> }) => {
          const row = {
            id: `layer-${state.nextId++}`,
            ...data,
            qty: d(String(data.qty ?? 0)),
            reservedQty: d("0"),
            lotNumber: (data.lotNumber as string | null) ?? null,
            sourceReference: (data.sourceReference as string | null) ?? null,
            unitPriceMxn: null,
            unitPriceUsd: null,
            createdAt: new Date()
          };
          state.layers.push(row);
          return row;
        }
      },
      inventorySerial: { findFirst: async () => null, findMany: async () => [], create: async () => ({ id: "ser-1" }) },
      inventoryMovement: {
        create: async ({ data }: { data: Record<string, unknown> }) => {
          movementCreates += 1;
          const row = { id: `mov-${state.nextId++}`, ...data };
          state.movements.push(row);
          return row;
        }
      },
      activityLog: { create: async () => ({ id: "act-1" }) },
      $queryRaw: async (query: unknown, ...values: unknown[]) => {
        const text = String((query as { strings?: string[] })?.strings?.join("") || query);
        if (text.includes('UPDATE "Inventory"') && text.includes("qty = qty +")) {
          return [{ id: String(values[1] ?? "inv-new"), qty: d(String(values[0] ?? 1)) }];
        }
        if (text.includes("InventoryLayer") && text.includes("qty = qty +")) {
          return [{ id: String(values[1] ?? "layer-new"), qty: d(String(values[0] ?? 1)), unitPriceMxn: null }];
        }
        if (text.includes("FOR UPDATE")) return [{ id: "inv-new" }];
        return [];
      }
    }
  };
}

let server: http.Server;
let baseUrl = "";

async function request(path: string, options: { method?: string; token?: string; body?: unknown } = {}) {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (options.token) headers.Authorization = `Bearer ${options.token}`;
  if (options.body) headers["Content-Type"] = "application/json";
  const response = await fetch(`${baseUrl}${path}`, {
    method: options.method || "GET",
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const text = await response.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }
  return { status: response.status, json, text };
}

before(async () => {
  const prismaRoot = prisma as unknown as { $transaction: (...args: unknown[]) => Promise<unknown> };
  const origTransaction = prismaRoot.$transaction.bind(prismaRoot);
  originals.push({ model: "__root__", method: "$transaction", fn: origTransaction });
  prismaRoot.$transaction = async (fn: (tx: unknown) => Promise<unknown>) => {
    transactionCalls += 1;
    const { tx } = buildTx();
    return fn(tx);
  };

  stub("user", "findUnique", async ({ where }: { where: { id?: string } }) => {
    if (where.id === operator.id) return operator;
    return null;
  });
  stub("inventoryStatusDefinition", "findFirst", async () => ({ code: "AVAILABLE", active: true }));
  stub("location", "findMany", async ({ where, take }: { where?: { code?: string; AND?: unknown[] }; take?: number }) => {
    if (where?.code) {
      const code = String(where.code).toUpperCase();
      const matches = locations.filter((row) => row.code.toUpperCase() === code);
      return typeof take === "number" ? matches.slice(0, take) : matches;
    }
    return locations.filter((row) => row.active);
  });
  stub("location", "findFirst", async ({ where }: { where?: { code?: string; warehouse?: string } }) => {
    const code = where?.code ? String(where.code).toUpperCase() : "";
    if (!code) return null;
    const row = locations.find((loc) => loc.code.toUpperCase() === code);
    if (!row) return null;
    if (where?.warehouse && row.warehouse.toUpperCase() !== String(where.warehouse).toUpperCase()) return null;
    return row;
  });
  stub("product", "findFirst", async ({ where }: { where: Record<string, unknown> }) => {
    const and = Array.isArray(where.AND) ? where.AND : [];
    const skuPart = and.find((part) => part && typeof part === "object" && "sku" in part) as { sku?: string } | undefined;
    const sku = skuPart?.sku?.trim().toUpperCase();
    if (sku === "SKU-HUGO-1") return product;
    return null;
  });
  stub("product", "findMany", async () => [product]);
  stub("inventory", "findMany", async () => []);
  stub("activityLog", "create", async () => ({ id: "act-1" }));

  await new Promise<void>((resolve) => {
    server = http.createServer(app).listen(0, "127.0.0.1", () => {
      baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
      resolve();
    });
  });
});

after(async () => {
  if (server) {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
  restorePrisma();
});

test("bootstrap exige autenticación", async () => {
  const blocked = await request("/api/hugo-flow/bootstrap");
  assert.equal(blocked.status, 401);
});

test("bootstrap autenticado expone preferencia configurable", async () => {
  const ok = await request("/api/hugo-flow/bootstrap", { token: tokenFor(operator) });
  assert.equal(ok.status, 200);
  const body = ok.json as { preferredLocationCode?: string; flow?: string };
  assert.equal(body.flow, "buffer-inbound");
  assert.equal(body.preferredLocationCode, "BUFFER-IN");
});

test("búsqueda predictiva por SKU autenticada", async () => {
  const search = await request("/api/catalog/products/search?q=SKU-HUGO-1", { token: tokenFor(operator) });
  assert.equal(search.status, 200);
  const rows = search.json as Array<{ sku: string }>;
  assert.ok(Array.isArray(rows));
  assert.equal(rows[0]?.sku, "SKU-HUGO-1");
});

test("entrada IN válida registra movimiento", async () => {
  const beforeMovements = movementCreates;
  const beforeTx = transactionCalls;
  const inbound = await request("/api/inventory/movements", {
    method: "POST",
    token: tokenFor(operator),
    body: {
      sku: "SKU-HUGO-1",
      type: "IN",
      quantity: 2,
      location: "BUFFER-IN",
      assignmentType: "FREE_TO_SALE",
      clientId: AVIAT.id,
      reference: "PED-HUGO-001"
    }
  });
  assert.equal(inbound.status, 201, JSON.stringify(inbound.json));
  assert.equal(movementCreates, beforeMovements + 1);
  assert.equal(transactionCalls, beforeTx + 1);
});

test("cantidad inválida rechaza sin mutar inventario", async () => {
  const beforeMovements = movementCreates;
  const beforeTx = transactionCalls;
  const beforeInventory = inventoryCreates;
  const invalid = await request("/api/inventory/movements", {
    method: "POST",
    token: tokenFor(operator),
    body: {
      sku: "SKU-HUGO-1",
      type: "IN",
      quantity: 0,
      location: "BUFFER-IN",
      assignmentType: "FREE_TO_SALE",
      clientId: AVIAT.id
    }
  });
  assert.equal(invalid.status, 400);
  assert.equal(movementCreates, beforeMovements);
  assert.equal(transactionCalls, beforeTx);
  assert.equal(inventoryCreates, beforeInventory);
});

test("ubicación inexistente rechaza sin mutar inventario", async () => {
  const beforeMovements = movementCreates;
  const beforeTx = transactionCalls;
  const invalid = await request("/api/inventory/movements", {
    method: "POST",
    token: tokenFor(operator),
    body: {
      sku: "SKU-HUGO-1",
      type: "IN",
      quantity: 1,
      location: "NO-EXISTE",
      assignmentType: "FREE_TO_SALE",
      clientId: AVIAT.id
    }
  });
  assert.equal(invalid.status, 400);
  assert.match(String((invalid.json as { message?: string })?.message || ""), /ubicación/i);
  assert.equal(movementCreates, beforeMovements);
  assert.equal(transactionCalls, beforeTx);
});

test("pantalla HTML responde solo con bandera activa", async () => {
  const page = await request("/hugo-buffer-inbound.html");
  assert.equal(page.status, 200);
  assert.match(String(page.text), /Buffer de entrada/);
});
