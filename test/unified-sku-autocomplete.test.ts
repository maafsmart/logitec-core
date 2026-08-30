import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, test } from "node:test";
import { Prisma } from "@prisma/client";
import { readFileSync } from "node:fs";
import { app } from "../src/app.js";
import { prisma } from "../src/db/prisma.js";
import { signAccessToken } from "../src/middlewares/auth.middleware.js";

const html = readFileSync(new URL("../public/dashboard.html", import.meta.url), "utf8");
const js = readFileSync(new URL("../public/dashboard.js", import.meta.url), "utf8");
const skuSearchSrc = readFileSync(
  new URL("../src/modules/catalog/sku-search.service.ts", import.meta.url),
  "utf8"
);
const catalogRoutes = readFileSync(
  new URL("../src/modules/catalog/catalog.routes.ts", import.meta.url),
  "utf8"
);

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

const AVIAT = { id: "client-aviat", code: "AVIAT", name: "AVIAT", tradeName: "AVIAT", legalName: "AVIAT SA", active: true };
const CLIENT2 = { id: "client-2", code: "CLI2", name: "Cliente 2", tradeName: "Cliente 2", legalName: "Cliente 2 SA", active: true };
const clients = [AVIAT, CLIENT2];

const adminUser = {
  id: "u-admin",
  email: "admin@test.local",
  fullName: "Admin",
  role: "ADMIN" as const,
  isActive: true,
  clientId: null,
  client: null
};

const products = [
  {
    id: "prod-aviat",
    sku: "SKU-AVIAT-1",
    barcode: "BAR-AVIAT",
    name: "Radio AVIAT",
    description: "Equipo radio",
    unit: "PZA",
    serialControlled: false,
    lotControlled: false,
    warehouse: "WH-A",
    productProjects: [{ projectId: "proj-att", project: { id: "proj-att", code: "ATT", name: "AT&T", clientId: AVIAT.id } }]
  },
  {
    id: "prod-c2",
    sku: "SKU-C2-ONLY",
    barcode: "BAR-C2",
    name: "Antena Cliente 2",
    description: "Solo cliente 2",
    unit: "PZA",
    serialControlled: false,
    lotControlled: false,
    warehouse: "WH-B",
    productProjects: [{ projectId: "proj-c2", project: { id: "proj-c2", code: "P2A", name: "Proyecto 2A", clientId: CLIENT2.id } }]
  }
];

const inventories = [
  {
    id: "inv-aviat",
    productId: "prod-aviat",
    clientId: AVIAT.id,
    qty: new Prisma.Decimal(20),
    reservedQty: new Prisma.Decimal(0),
    assignmentType: "PROJECT",
    projectId: "proj-att",
    location: { code: "AN26", warehouse: "WH-A" },
    project: { code: "ATT", name: "AT&T" }
  },
  {
    id: "inv-c2",
    productId: "prod-c2",
    clientId: CLIENT2.id,
    qty: new Prisma.Decimal(5),
    reservedQty: new Prisma.Decimal(0),
    assignmentType: "PROJECT",
    projectId: "proj-c2",
    location: { code: "AN1-A", warehouse: "WH-B" },
    project: { code: "P2A", name: "Proyecto 2A" }
  }
];

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

function tokenFor(clientId: string) {
  return signAccessToken({
    userId: "u-admin",
    role: "ADMIN",
    email: "admin@test.local",
    operationalClientId: clientId
  });
}

async function search(token: string, q: string, extra = "") {
  const res = await fetch(`${baseUrl}/api/catalog/products/search?q=${encodeURIComponent(q)}${extra}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  return { status: res.status, json: (await res.json()) as Array<{ sku: string; hasStock?: boolean }> };
}

before(async () => {
  stub("user", "findUnique", async ({ where }: { where: { id?: string; email?: string } }) => {
    if (where.id === adminUser.id || where.email === adminUser.email) return { ...adminUser };
    return null;
  });
  stub("client", "findUnique", async ({ where }: { where: { id?: string } }) => {
    return clients.find((row) => row.id === where.id) || null;
  });
  stub("product", "findMany", async ({ where, include }: { where?: unknown; include?: unknown }) => {
    void include;
    const owner = (where as { AND?: Array<{ OR?: Array<{ inventories?: { some?: { clientId?: string } } }> }> })?.AND?.[0];
    let clientId: string | undefined;
    const or = owner?.OR;
    if (or) {
      for (const clause of or) {
        const cid = clause.inventories?.some?.clientId;
        if (cid) clientId = cid;
      }
    }
    const qMatch = JSON.stringify(where || "").toLowerCase();
    return products
      .filter((p) => {
        if (clientId && !p.productProjects.some((pp) => pp.project.clientId === clientId)) {
          const hasInv = p.id === "prod-aviat" ? clientId === AVIAT.id : p.id === "prod-c2" ? clientId === CLIENT2.id : false;
          if (!hasInv && clientId === AVIAT.id && p.id !== "prod-aviat") return false;
          if (!hasInv && clientId === CLIENT2.id && p.id !== "prod-c2") return false;
        }
        return qMatch.includes("aviat") ? p.sku.includes("AVIAT") || p.name.toLowerCase().includes("aviat") : true;
      })
      .filter((p) => {
        if (qMatch.includes("radio")) return p.name.toLowerCase().includes("radio");
        if (qMatch.includes("bar-aviat")) return p.barcode?.includes("BAR-AVIAT");
        if (qMatch.includes("sku-aviat")) return p.sku.includes("AVIAT");
        return true;
      })
      .map((p) => ({ ...p, productProjects: p.productProjects.map((pp) => ({ ...pp, project: { ...pp.project } })) }));
  });
  stub("inventory", "findMany", async ({ where }: { where?: { AND?: Array<{ productId?: { in?: string[] }; clientId?: string }> } }) => {
    const productIds = where?.AND?.find((part) => part.productId)?.productId?.in;
    const clientId = where?.AND?.find((part) => part.clientId)?.clientId;
    return inventories.filter((row) => {
      if (clientId && row.clientId !== clientId) return false;
      if (productIds && !productIds.includes(row.productId)) return false;
      return true;
    });
  });

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
  restorePrisma();
});

test("UI: pantallas clave usan product-typeahead unificado", () => {
  for (const [inputId, listId, pta] of [
    ["ccFilterSku", "ccFilterSkuSuggestions", "control-center"],
    ["catFilterSku", "catFilterSkuSuggestions", "catalog"],
    ["traceSku", "traceSkuSuggestions", "trace"],
    ["invFilterSku", "invFilterSkuSuggestions", "inventory"],
    ["scanInput", "scanSkuSuggestions", "picking"],
    ["inboundSku", "inboundSkuSuggestions", "inbound"],
    ["outboundSku", "outboundSkuSuggestions", "outbound"],
    ["reqSku", "reqSkuSuggestions", "req"],
    ["relocateSku", "relocateSkuSuggestions", "relocate"],
    ["incidentProductSku", "incidentSkuSuggestions", "incident"]
  ] as const) {
    assert.match(html, new RegExp(`id="${inputId}"`));
    assert.match(html, new RegExp(`id="${listId}"`));
    assert.match(html, new RegExp(`data-pta="${pta}"`));
  }
});

test("JS: debounce, límite y teclado unificados", () => {
  assert.match(js, /PRODUCT_TYPEAHEAD_MIN_CHARS = 2/);
  assert.match(js, /PRODUCT_TYPEAHEAD_MAX = 12/);
  assert.match(js, /PRODUCT_TYPEAHEAD_DEBOUNCE_MS = 250/);
  const wire = sliceFunction(js, "wireProductTypeahead");
  assert.match(wire, /ArrowDown/);
  assert.match(wire, /ArrowUp/);
  assert.match(wire, /Escape/);
  assert.match(wire, /requestSeq/);
  assert.match(sliceFunction(js, "wireAllProductTypeaheads"), /ccFilterSku/);
  assert.match(sliceFunction(js, "wireAllProductTypeaheads"), /traceSku/);
  assert.match(sliceFunction(js, "wireAllProductTypeaheads"), /catFilterSku/);
});

test("A) búsqueda parcial por SKU devuelve sugerencias scoped", async () => {
  const res = await search(tokenFor(AVIAT.id), "SKU-AVIAT");
  assert.equal(res.status, 200);
  assert.ok(res.json.some((row) => row.sku === "SKU-AVIAT-1"));
  assert.equal(res.json.some((row) => row.sku === "SKU-C2-ONLY"), false);
});

test("B) búsqueda por nombre devuelve sugerencias", async () => {
  const res = await search(tokenFor(AVIAT.id), "Radio");
  assert.equal(res.status, 200);
  assert.ok(res.json.length >= 1);
});

test("C) búsqueda por código de barras devuelve sugerencias", async () => {
  const res = await search(tokenFor(AVIAT.id), "BAR-AVIAT");
  assert.equal(res.status, 200);
  assert.ok(res.json.some((row) => row.sku === "SKU-AVIAT-1"));
});

test("D) otro tenant nunca aparece en sugerencias", async () => {
  const aviat = await search(tokenFor(AVIAT.id), "SKU");
  const c2 = await search(tokenFor(CLIENT2.id), "SKU");
  assert.equal(aviat.json.some((row) => row.sku === "SKU-C2-ONLY"), false);
  assert.equal(c2.json.some((row) => row.sku === "SKU-AVIAT-1"), false);
});

test("E) Movimiento interno usa relocate-balances y exige contexto origen", () => {
  const relocate = sliceFunction(js, "wireRelocateBalanceTypeahead");
  assert.match(relocate, /relocateOriginContextReady/);
  assert.match(relocate, /searchRelocateBalanceSuggestions/);
  assert.doesNotMatch(relocate, /searchSkuSuggestions/);
  assert.match(relocate, /PRODUCT_TYPEAHEAD_MIN_CHARS/);
});

test("F) Movimientos: filtro traceSku con predictivo sin mutaciones", () => {
  const trace = sliceFunction(js, "wireAllProductTypeaheads");
  assert.match(trace, /traceSku/);
  assert.match(trace, /loadMovements/);
  assert.doesNotMatch(trace, /method:\s*"POST"/);
});

test("G) Picking mantiene flujo de escaneo y no altera FIFO", () => {
  assert.match(sliceFunction(js, "scanCode"), /buildPickScanPayload/);
  assert.match(sliceFunction(js, "applyPickSuggestion"), /isSuggestedOperationalProject/);
  assert.doesNotMatch(sliceFunction(js, "wireProductTypeahead"), /mutateInventory/);
});

test("H) Enter con dropdown cerrado no bloquea escaneo", () => {
  const wire = sliceFunction(js, "wireProductTypeahead");
  assert.match(wire, /listEl\.classList\.contains\("hidden"\)/);
  assert.match(wire, /ev\.key === "Enter"/);
});

test("I) backend aplica clientProductWhere y expone location/requireStock", () => {
  assert.match(skuSearchSrc, /clientProductWhere\(auth\)/);
  assert.match(skuSearchSrc, /scopedInventoryWhere\(auth\)/);
  assert.match(skuSearchSrc, /availableQty/);
  assert.match(catalogRoutes, /location: z\.string\(\)/);
  assert.match(catalogRoutes, /requireStock/);
});

test("J) sugerencias incluyen disponibilidad visual en dropdown", () => {
  assert.match(js, /productTypeaheadAvailabilityBadge/);
  assert.match(js, /pta-avail is-stock/);
  assert.match(html, /\.pta-avail\.is-stock/);
});
