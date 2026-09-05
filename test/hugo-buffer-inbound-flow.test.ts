import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { readFileSync } from "node:fs";
import { after, before, test } from "node:test";
import bcrypt from "bcryptjs";
import { Prisma } from "@prisma/client";

process.env.ENABLE_HUGO_BUFFER_INBOUND = "true";
process.env.HUGO_BUFFER_IN_LOCATION_PREFERENCE = "BUFFER-IN";
process.env.HUGO_BUFFER_OUT_LOCATION_PREFERENCE = "BUFFER-OUT";

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
  assert.match(html, /Operación por escaneo/);
  assert.match(html, /Recepción · Movimientos · Buffer de salida/);
  assert.match(html, /Pedido \/ referencia del cliente/);
  assert.match(html, />Mover</);
  assert.match(html, /Confirmar movimiento/);
  assert.match(html, /Preparar salida/);
  assert.match(html, /Confirmar preparación/);
  assert.match(html, /role="tablist"/);
  assert.match(html, /role="tabpanel"/);
  assert.match(html, />Libre venta</);
  assert.match(html, /value="FREE_TO_SALE"/);
  assert.match(html, /id="locationsWarn"/);
  assert.match(js, /\/api\/catalog\/products\/search/);
  assert.match(js, /\/api\/inventory\/movements/);
  assert.match(js, /\/api\/inventory\/stock/);
  assert.match(js, /\/api\/inventory\/relocate/);
  assert.match(js, /Preparación Buffer de salida/);
  assert.match(js, /OUT_PREP_NOTES/);
  assert.match(js, /normalizeClientReference/);
  assert.match(js, /setActiveFlow/);
  assert.match(js, /syncLocationsWarning/);
  assert.match(js, /initFlowTabs/);
  assert.match(html, /outOrderRefInput/);
  assert.match(html, /Pedido \/ referencia del cliente/);
  assert.match(envExample, /ENABLE_HUGO_BUFFER_INBOUND/);
  assert.match(envExample, /HUGO_BUFFER_IN_LOCATION_PREFERENCE/);
  assert.match(envExample, /HUGO_BUFFER_OUT_LOCATION_PREFERENCE/);
  assert.match(featureSrc, /preferredBufferOutLocationCode/);
  assert.match(featureSrc, /production/);
  assert.doesNotMatch(js, /mobile-picking-qa|qaOnly/i);
  assert.doesNotMatch(js, /transporte|caja|picking/i);
  const submitOut = sliceFunction(js, "submitOutPrepare");
  assert.match(submitOut, /\/api\/inventory\/relocate/);
  assert.match(submitOut, /notes: OUT_PREP_NOTES/);
  assert.match(submitOut, /normalizeClientReference\(outOrderRefInput/);
  assert.doesNotMatch(submitOut, /\/api\/inventory\/movements/);
  assert.doesNotMatch(submitOut, /type:\s*"OUT"/);
  assert.doesNotMatch(submitOut, /type:\s*'OUT'/);
});

test("referencia Enter no envía formularios", () => {
  assert.match(js, /bindReferenceEnterGuard\(orderRefInput\)/);
  assert.match(js, /bindReferenceEnterGuard\(outOrderRefInput\)/);
  const guardStart = js.indexOf("function bindReferenceEnterGuard(");
  assert.ok(guardStart >= 0);
  const guardEnd = js.indexOf("}", js.indexOf("event.preventDefault();", guardStart));
  const guard = js.slice(guardStart, guardEnd + 1);
  assert.match(guard, /event\.preventDefault\(\)/);
  assert.doesNotMatch(guard, /submitInbound|submitMove|submitOutPrepare/);
});

test("UI filtra ubicaciones inactivas en selector", () => {
  assert.match(js, /active !== false/);
  assert.match(js, /syncLocationsWarning/);
  assert.match(js, /activeLocationCount\(\) === 0/);
});

test("pestañas son botones accesibles y limpian mensajes ajenos", () => {
  assert.match(html, /type="button" role="tab"/);
  assert.match(js, /syncFlowTheme/);
  assert.match(js, /flow-pos-/);
  assert.match(js, /flow-palette-/);
  assert.match(html, /tab-hint/);
  assert.match(html, /flow-pos-first/);
  assert.match(html, /flow-palette-recepcion/);
  assert.match(html, /hugo-buffer-inbound\.js\?v=9/);
  assert.match(js, /if \(flowId !== "recepcion"\) hideAction\(\)/);
  assert.match(js, /if \(flowId !== "mover"\) hideMoveAction\(\)/);
  assert.match(js, /if \(flowId !== "salida"\) hideOutAction\(\)/);
  const tabHandlerStart = js.indexOf("tabEl.addEventListener(\"keydown\"");
  assert.ok(tabHandlerStart >= 0);
  const tabHandler = js.slice(tabHandlerStart, tabHandlerStart + 600);
  assert.match(tabHandler, /event\.key === "Enter"/);
  assert.match(tabHandler, /event\.key === " "/);
  assert.match(tabHandler, /ArrowRight/);
  assert.match(tabHandler, /ArrowLeft/);
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

test("movimiento Enter no confirma ni permite doble envío", () => {
  const moveScanStart = js.indexOf('moveScanInput.addEventListener("keydown"');
  assert.ok(moveScanStart >= 0);
  const moveScanEnd = js.indexOf("});", moveScanStart);
  const moveScanHandler = js.slice(moveScanStart, moveScanEnd + 3);
  assert.match(moveScanHandler, /lookupMoveCode\(moveScanInput\.value\)/);
  assert.doesNotMatch(moveScanHandler, /submitMove/);
  const destScanStart = js.indexOf('moveDestScan.addEventListener("keydown"');
  assert.ok(destScanStart >= 0);
  const destScanEnd = js.indexOf("});", destScanStart);
  const destScanHandler = js.slice(destScanStart, destScanEnd + 3);
  assert.match(destScanHandler, /resolveMoveDestFromScan\(moveDestScan\.value\)/);
  assert.doesNotMatch(destScanHandler, /submitMove/);
  assert.match(js, /if \(state\.moveBusy \|\| !state\.moveOrigin \|\| !state\.moveProduct\) return/);
  assert.match(js, /if \(state\.moveBusy\) return/);
  assert.match(js, /state\.moveBusy = true/);
  assert.match(js, /moveSubmitBtn\.disabled = !ok/);
  assert.match(js, /origin !== dest/);
  assert.match(js, /qty <= availableQty\(state\.moveOrigin\)/);
});

test("reubicación limita destino al almacén origen y refresca stock tras éxito", () => {
  assert.match(js, /moveOriginWarehouse/);
  assert.match(js, /sameMoveWarehouse/);
  assert.match(js, /mismo almacén que el origen/);
  const fillDest = sliceFunction(js, "fillMoveDestSelect");
  assert.match(fillDest, /originWh/);
  assert.match(fillDest, /sameMoveWarehouse\(row\)/);
  const submitSrc = sliceFunction(js, "submitMove");
  assert.match(submitSrc, /refreshMoveAfterSuccess/);
  assert.match(submitSrc, /await refreshMoveAfterSuccess\(\)/);
  assert.doesNotMatch(submitSrc, /clearMoveAfterSuccess/);
  const failIdx = submitSrc.indexOf("if (!response.ok)");
  const refreshIdx = submitSrc.indexOf("await refreshMoveAfterSuccess()");
  assert.ok(failIdx >= 0 && refreshIdx > failIdx);
  const refreshSrc = sliceFunction(js, "refreshMoveAfterSuccess");
  assert.match(refreshSrc, /await loadMoveStock\(\)/);
});

test("productos serializados bloquean reubicación Hugo", () => {
  assert.match(js, /flujo especializado de reubicación en el dashboard/);
  assert.match(js, /product\.serialControlled/);
});

test("preparar salida usa reubicación, filtra almacén y refresca stock", () => {
  assert.match(js, /outOriginWarehouse/);
  assert.match(js, /sameOutWarehouse/);
  assert.match(js, /refreshOutAfterSuccess/);
  const submitOut = sliceFunction(js, "submitOutPrepare");
  assert.match(submitOut, /await refreshOutAfterSuccess\(\)/);
  assert.doesNotMatch(submitOut, /type:\s*"OUT"/);
  const bufferScanStart = js.indexOf('outBufferScan.addEventListener("keydown"');
  assert.ok(bufferScanStart >= 0);
  const bufferScanEnd = js.indexOf("});", bufferScanStart);
  const bufferScanHandler = js.slice(bufferScanStart, bufferScanEnd + 3);
  assert.match(bufferScanHandler, /resolveOutBufferFromScan\(outBufferScan\.value\)/);
  assert.doesNotMatch(bufferScanHandler, /submitOutPrepare/);
  assert.match(js, /if \(state\.outBusy \|\| !state\.outOrigin \|\| !state\.outProduct\) return/);
  assert.match(js, /state\.outBusy = true/);
  const refreshOut = sliceFunction(js, "refreshOutAfterSuccess");
  assert.match(refreshOut, /await loadOutStock\(\)/);
});

test("pedido/referencia opcional no envía Enter ni HTML inseguro", () => {
  assert.match(js, /bindReferenceEnterGuard\(orderRefInput\)/);
  assert.match(js, /bindReferenceEnterGuard\(outOrderRefInput\)/);
  const normalize = sliceFunction(js, "normalizeClientReference");
  assert.match(normalize, /CLIENT_REF_MAX/);
  assert.match(normalize, /replace\(\/\\s\+\//);
  const submitInbound = sliceFunction(js, "submitInbound");
  assert.match(submitInbound, /normalizeClientReference\(orderRefInput/);
  assert.doesNotMatch(submitInbound, /innerHTML.*orderRefInput/);
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
  { id: "loc-an2", code: "AN2-A", warehouse: "TULTITLAN24", active: true, description: "Destino activo" },
  { id: "loc-buffer-out", code: "BUFFER-OUT", warehouse: "TULTITLAN24", active: true, description: "Buffer salida" },
  { id: "loc-wh2", code: "BUFFER-OUT-2", warehouse: "OTHER-WH", active: true, description: "Buffer otro almacén" },
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
let relocateMovementCreates = 0;
let outMovementCreates = 0;
let lastRelocateMovement: Record<string, unknown> | null = null;
let useRelocateTx = false;
let useJourneyWorld = false;

const journeyState = {
  inventories: [] as Array<Record<string, unknown>>,
  layers: [] as Array<Record<string, unknown>>,
  movements: [] as Array<Record<string, unknown>>,
  nextId: 1
};

function resetJourneyState() {
  journeyState.inventories = [];
  journeyState.layers = [];
  journeyState.movements = [];
  journeyState.nextId = 1;
}

function journeyQtyAt(locationCode: string) {
  const loc = locations.find((row) => row.code === locationCode);
  if (!loc) return d("0");
  const row = journeyState.inventories.find((item) => item.locationId === loc.id);
  return row ? d(String(row.qty)) : d("0");
}

function journeyInventoryAt(locationCode: string) {
  const loc = locations.find((row) => row.code === locationCode);
  if (!loc) return null;
  return journeyState.inventories.find((item) => item.locationId === loc.id) || null;
}

const stockInventoryRow = {
  id: "inv-hugo-src",
  productId: product.id,
  locationId: locations[0].id,
  clientId: AVIAT.id,
  qty: d("10"),
  reservedQty: d("2"),
  status: "AVAILABLE",
  assignmentType: "FREE_TO_SALE",
  assignmentKey: `FREE_TO_SALE:${AVIAT.id}`,
  projectId: null,
  product: {
    id: product.id,
    sku: product.sku,
    name: product.name,
    active: true,
    barcode: product.barcode
  },
  location: locations[0],
  client: { ...AVIAT },
  project: null,
  layers: [{ id: "layer-hugo-1", lotNumber: null, qty: d("10"), reservedQty: d("2"), unitPriceMxn: null, unitPriceUsd: null }]
};

const foreignInventoryRow = {
  id: "inv-foreign",
  productId: product.id,
  locationId: locations[0].id,
  clientId: "client-other",
  qty: d("5"),
  reservedQty: d("0"),
  status: "AVAILABLE",
  assignmentType: "FREE_TO_SALE",
  assignmentKey: "FREE_TO_SALE:client-other",
  projectId: null,
  product: stockInventoryRow.product,
  location: locations[0],
  client: { id: "client-other", code: "OTHER", name: "Other", tradeName: "Other", legalName: "Other SA", active: true },
  project: null,
  layers: [{ id: "layer-foreign", lotNumber: null, qty: d("5"), reservedQty: d("0"), unitPriceMxn: null, unitPriceUsd: null }]
};

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

function buildRelocateTx() {
  const locFrom = locations[0];
  const locTo = locations[1];
  const locationMap = Object.fromEntries(locations.map((row) => [row.id, row]));
  const productRow = {
    id: product.id,
    serialControlled: product.serialControlled,
    customerId: product.customerId,
    customer: { id: product.customerId, clientId: AVIAT.id },
    sku: product.sku,
    name: product.name
  };
  const state = {
    inventories: [
      {
        id: stockInventoryRow.id,
        productId: product.id,
        locationId: locFrom.id,
        status: "AVAILABLE",
        qty: d("10"),
        reservedQty: d("2"),
        assignmentType: "FREE_TO_SALE",
        assignmentKey: `FREE_TO_SALE:${AVIAT.id}`,
        projectId: null,
        clientId: AVIAT.id
      }
    ] as Array<Record<string, unknown>>,
    layers: [
      {
        id: "layer-hugo-1",
        inventoryId: stockInventoryRow.id,
        qty: d("10"),
        reservedQty: d("2"),
        lotNumber: null,
        receivedAt: new Date("2026-03-01T00:00:00Z"),
        unitPriceMxn: d("100"),
        unitPriceUsd: null,
        sourceReference: "ENTRADA_OPERATIVA",
        sourceType: "MANUAL_IN",
        createdAt: new Date("2026-03-01T00:00:00Z")
      }
    ] as Array<Record<string, unknown>>,
    movements: [] as Array<Record<string, unknown>>,
    nextId: 1
  };

  function hydrateInventory(row: Record<string, unknown>) {
    return {
      ...row,
      location: locationMap[String(row.locationId) as keyof typeof locationMap],
      product: productRow
    };
  }

  return {
    state,
    tx: {
      product: {
        findUnique: async ({ where }: { where: { id: string } }) => (where.id === product.id ? productRow : null)
      },
      inventory: {
        findUnique: async ({ where }: { where: Record<string, unknown> }) => {
          if (where.id) {
            const found = state.inventories.find((row) => row.id === where.id);
            return found ? hydrateInventory(found) : null;
          }
          return null;
        },
        findUniqueOrThrow: async ({ where }: { where: { id: string } }) => {
          const found = state.inventories.find((row) => row.id === where.id);
          if (!found) throw new Error("inventory not found");
          return hydrateInventory(found);
        },
        create: async ({ data }: { data: Record<string, unknown> }) => {
          const row = {
            id: `inv-${state.nextId++}`,
            ...data,
            qty: d(String(data.qty ?? 0)),
            reservedQty: d(String(data.reservedQty ?? 0))
          };
          state.inventories.push(row);
          return hydrateInventory(row);
        }
      },
      inventoryLayer: {
        findMany: async ({ where }: { where: { inventoryId: string } }) =>
          state.layers.filter((layer) => layer.inventoryId === where.inventoryId),
        create: async ({ data }: { data: Record<string, unknown> }) => {
          const row = {
            id: `layer-${state.nextId++}`,
            ...data,
            qty: d(String(data.qty ?? 0)),
            reservedQty: d(String(data.reservedQty ?? 0)),
            lotNumber: (data.lotNumber as string | null) ?? null,
            receivedAt: (data.receivedAt as Date | null) ?? null,
            unitPriceMxn: data.unitPriceMxn == null ? null : d(String(data.unitPriceMxn)),
            unitPriceUsd: null,
            sourceReference: (data.sourceReference as string | null) ?? null,
            sourceType: (data.sourceType as string | null) ?? null,
            createdAt: new Date()
          };
          state.layers.push(row);
          return row;
        }
      },
      inventorySerial: { count: async () => 0, findMany: async () => [], findFirst: async () => null, create: async () => ({ id: "ser-1" }) },
      inventoryMovement: {
        create: async ({ data }: { data: Record<string, unknown> }) => {
          relocateMovementCreates += 1;
          const row = { id: `mov-${state.nextId++}`, ...data };
          lastRelocateMovement = row;
          state.movements.push(row);
          return row;
        }
      },
      activityLog: { create: async () => ({ id: "act-1" }) },
      $queryRaw: async (query: unknown, ...values: unknown[]) => {
        const text = String((query as { strings?: string[] })?.strings?.join("") || query);
        if (text.includes("InventoryLayer") && text.includes("qty = qty -")) {
          const delta = d(String(values[0]));
          const id = String(values[1]);
          const layer = state.layers.find((item) => item.id === id);
          if (!layer) return [];
          layer.qty = d(String(layer.qty)).minus(delta);
          return [{ id: layer.id, qty: layer.qty, reservedQty: layer.reservedQty }];
        }
        if (text.includes('UPDATE "Inventory"') && text.includes("qty = qty -")) {
          const delta = d(String(values[0]));
          const id = String(values[1]);
          const inv = state.inventories.find((item) => item.id === id);
          if (!inv) return [];
          inv.qty = d(String(inv.qty)).minus(delta);
          return [{ id: inv.id, qty: inv.qty, reservedQty: inv.reservedQty }];
        }
        if (text.includes('UPDATE "Inventory"') && text.includes("qty = qty +")) {
          const delta = d(String(values[0]));
          const id = String(values[1]);
          const inv = state.inventories.find((item) => item.id === id);
          if (!inv) return [];
          inv.qty = d(String(inv.qty)).plus(delta);
          return [{ id: inv.id, qty: inv.qty }];
        }
        if (text.includes("FOR UPDATE")) return [{ id: "layer-hugo-1" }];
        return [];
      }
    }
  };
}

function buildJourneyTx() {
  const locationMap = Object.fromEntries(locations.map((row) => [row.id, row]));
  const productRow = {
    id: product.id,
    serialControlled: product.serialControlled,
    customerId: product.customerId,
    customer: { id: product.customerId, clientId: AVIAT.id },
    sku: product.sku,
    name: product.name
  };

  function hydrateInventory(row: Record<string, unknown>) {
    return {
      ...row,
      location: locationMap[String(row.locationId) as keyof typeof locationMap],
      product: productRow
    };
  }

  return {
    state: journeyState,
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
        findUnique: async ({ where }: { where: Record<string, unknown> }) => {
          if (where.id) {
            const found = journeyState.inventories.find((row) => row.id === where.id);
            return found ? hydrateInventory(found) : null;
          }
          const key = (
            where as {
              productId_locationId_status_assignmentKey?: {
                productId: string;
                locationId: string;
                status: string;
                assignmentKey: string;
              };
            }
          ).productId_locationId_status_assignmentKey;
          if (!key) return null;
          const found = journeyState.inventories.find(
            (row) =>
              row.productId === key.productId &&
              row.locationId === key.locationId &&
              row.status === key.status &&
              row.assignmentKey === key.assignmentKey
          );
          return found ? hydrateInventory(found) : null;
        },
        findUniqueOrThrow: async ({ where }: { where: Record<string, unknown> }) => {
          const found = await (async () => {
            if (where.id) return journeyState.inventories.find((row) => row.id === where.id) || null;
            const key = (
              where as {
                productId_locationId_status_assignmentKey?: {
                  productId: string;
                  locationId: string;
                  status: string;
                  assignmentKey: string;
                };
              }
            ).productId_locationId_status_assignmentKey;
            if (!key) return null;
            return (
              journeyState.inventories.find(
                (row) =>
                  row.productId === key.productId &&
                  row.locationId === key.locationId &&
                  row.status === key.status &&
                  row.assignmentKey === key.assignmentKey
              ) || null
            );
          })();
          if (!found) throw new Error("inventory not found");
          return hydrateInventory(found);
        },
        create: async ({ data }: { data: Record<string, unknown> }) => {
          inventoryCreates += 1;
          const row = {
            id: `inv-j-${journeyState.nextId++}`,
            ...data,
            qty: d(String(data.qty ?? 0)),
            reservedQty: d(String(data.reservedQty ?? 0))
          };
          journeyState.inventories.push(row);
          return hydrateInventory(row);
        }
      },
      inventoryLayer: {
        findMany: async ({ where }: { where?: { inventoryId?: string } }) =>
          journeyState.layers.filter((layer) => !where?.inventoryId || layer.inventoryId === where.inventoryId),
        create: async ({ data }: { data: Record<string, unknown> }) => {
          const row = {
            id: `layer-j-${journeyState.nextId++}`,
            ...data,
            qty: d(String(data.qty ?? 0)),
            reservedQty: d(String(data.reservedQty ?? 0)),
            lotNumber: (data.lotNumber as string | null) ?? null,
            receivedAt: (data.receivedAt as Date | null) ?? new Date(),
            unitPriceMxn: data.unitPriceMxn == null ? null : d(String(data.unitPriceMxn)),
            unitPriceUsd: null,
            sourceReference: (data.sourceReference as string | null) ?? null,
            sourceType: (data.sourceType as string | null) ?? null,
            createdAt: new Date()
          };
          journeyState.layers.push(row);
          return row;
        }
      },
      inventorySerial: { findFirst: async () => null, findMany: async () => [], create: async () => ({ id: "ser-1" }), count: async () => 0 },
      inventoryMovement: {
        create: async ({ data }: { data: Record<string, unknown> }) => {
          movementCreates += 1;
          if (String(data.type || "").toUpperCase() === "OUT") outMovementCreates += 1;
          if (String(data.type || "").toUpperCase() === "RELOCATE") {
            relocateMovementCreates += 1;
            lastRelocateMovement = { id: `mov-j-${journeyState.nextId}`, ...data };
          }
          const row = { id: `mov-j-${journeyState.nextId++}`, ...data };
          journeyState.movements.push(row);
          return row;
        }
      },
      activityLog: { create: async () => ({ id: "act-1" }) },
      $queryRaw: async (query: unknown, ...values: unknown[]) => {
        const text = String((query as { strings?: string[] })?.strings?.join("") || query);
        if (text.includes("InventoryLayer") && text.includes("qty = qty -")) {
          const delta = d(String(values[0]));
          const id = String(values[1]);
          const layer = journeyState.layers.find((item) => item.id === id);
          if (!layer) return [];
          layer.qty = d(String(layer.qty)).minus(delta);
          return [{ id: layer.id, qty: layer.qty, reservedQty: layer.reservedQty }];
        }
        if (text.includes('UPDATE "Inventory"') && text.includes("qty = qty -")) {
          const delta = d(String(values[0]));
          const id = String(values[1]);
          const inv = journeyState.inventories.find((item) => item.id === id);
          if (!inv) return [];
          inv.qty = d(String(inv.qty)).minus(delta);
          return [{ id: inv.id, qty: inv.qty, reservedQty: inv.reservedQty }];
        }
        if (text.includes('UPDATE "Inventory"') && text.includes("qty = qty +")) {
          const delta = d(String(values[0]));
          const id = String(values[1]);
          let inv = journeyState.inventories.find((item) => item.id === id);
          if (!inv) {
            inv = {
              id,
              productId: product.id,
              locationId: locations[2].id,
              clientId: AVIAT.id,
              status: "AVAILABLE",
              assignmentType: "FREE_TO_SALE",
              assignmentKey: `FREE_TO_SALE:${AVIAT.id}`,
              projectId: null,
              qty: d("0"),
              reservedQty: d("0")
            };
            journeyState.inventories.push(inv);
          }
          inv.qty = d(String(inv.qty)).plus(delta);
          return [{ id: inv.id, qty: inv.qty }];
        }
        if (text.includes("InventoryLayer") && text.includes("qty = qty +")) {
          return [{ id: String(values[1] ?? "layer-j-new"), qty: d(String(values[0] ?? 1)), unitPriceMxn: null }];
        }
        if (text.includes("FOR UPDATE") && text.includes("InventoryLayer")) {
          return journeyState.layers.map((layer) => ({ id: layer.id }));
        }
        if (text.includes("FOR UPDATE")) return journeyState.inventories.map((row) => ({ id: row.id }));
        return [];
      }
    }
  };
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
          if (String(data.type || "").toUpperCase() === "OUT") outMovementCreates += 1;
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
    if (useJourneyWorld) {
      const { tx } = buildJourneyTx();
      return fn(tx);
    }
    if (useRelocateTx) {
      const { tx } = buildRelocateTx();
      return fn(tx);
    }
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
  stub("inventory", "findMany", async () => {
    if (useJourneyWorld) {
      return journeyState.inventories
        .filter((row) => d(String(row.qty)).greaterThan(0))
        .map((row) => ({
          id: row.id,
          productId: row.productId,
          locationId: row.locationId,
          clientId: row.clientId,
          qty: row.qty,
          reservedQty: row.reservedQty || d("0"),
          status: row.status,
          assignmentType: row.assignmentType,
          assignmentKey: row.assignmentKey,
          projectId: row.projectId,
          product: stockInventoryRow.product,
          location: locations.find((loc) => loc.id === row.locationId),
          client: { ...AVIAT },
          project: null,
          layers: journeyState.layers
            .filter((layer) => layer.inventoryId === row.id)
            .map((layer) => ({
              id: layer.id,
              lotNumber: layer.lotNumber ?? null,
              qty: layer.qty,
              reservedQty: layer.reservedQty || d("0"),
              unitPriceMxn: null,
              unitPriceUsd: null
            }))
        }));
    }
    return [stockInventoryRow];
  });
  stub("inventory", "findFirst", async ({ where }: { where?: { id?: string; clientId?: string } }) => {
    if (useJourneyWorld && where?.id) {
      const row = journeyState.inventories.find((item) => item.id === where.id);
      if (!row) return null;
      if (where.clientId && row.clientId !== where.clientId) return null;
      return {
        ...row,
        product: {
          id: product.id,
          sku: product.sku,
          name: product.name,
          serialControlled: product.serialControlled,
          customerId: product.customerId,
          customer: { id: product.customerId, clientId: AVIAT.id }
        },
        location: locations.find((loc) => loc.id === row.locationId)
      };
    }
    if (where?.id === stockInventoryRow.id) {
      if (where.clientId && where.clientId !== AVIAT.id) return null;
      return {
        ...stockInventoryRow,
        product: {
          id: product.id,
          sku: product.sku,
          name: product.name,
          serialControlled: product.serialControlled,
          customerId: product.customerId,
          customer: { id: product.customerId, clientId: AVIAT.id }
        },
        location: locations[0]
      };
    }
    if (where?.id === foreignInventoryRow.id) {
      return { id: foreignInventoryRow.id, clientId: foreignInventoryRow.clientId };
    }
    return null;
  });
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
  const body = ok.json as {
    preferredLocationCode?: string;
    preferredBufferOutLocationCode?: string;
    flow?: string;
  };
  assert.equal(body.flow, "buffer-inbound");
  assert.equal(body.preferredLocationCode, "BUFFER-IN");
  assert.equal(body.preferredBufferOutLocationCode, "BUFFER-OUT");
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
  assert.match(String(page.text), /Operación por escaneo/);
  assert.match(String(page.text), />Mover</);
  assert.match(String(page.text), /Preparar salida/);
});

test("stock autenticado expone existencias del cliente activo", async () => {
  const stock = await request("/api/inventory/stock", { token: tokenFor(operator) });
  assert.equal(stock.status, 200);
  const rows = stock.json as Array<{ id: string; qty: string; reservedQty: string }>;
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.id, "inv-hugo-src");
  assert.equal(String(rows[0]?.qty), "10");
  assert.equal(String(rows[0]?.reservedQty), "2");
});

test("reubicación válida registra movimiento", async () => {
  useRelocateTx = true;
  const beforeRelocate = relocateMovementCreates;
  const beforeTx = transactionCalls;
  try {
    const relocate = await request("/api/inventory/relocate", {
      method: "POST",
      token: tokenFor(operator),
      body: {
        inventoryId: "inv-hugo-src",
        allocationMode: "FIFO",
        destinationLocation: "AN2-A",
        quantity: 3,
        reference: "HUGO-MOVE-TEST"
      }
    });
    assert.equal(relocate.status, 201, JSON.stringify(relocate.json));
    assert.equal(relocateMovementCreates, beforeRelocate + 1);
    assert.equal(transactionCalls, beforeTx + 1);
  } finally {
    useRelocateTx = false;
  }
});

test("origen igual a destino rechaza reubicación", async () => {
  useRelocateTx = true;
  const beforeRelocate = relocateMovementCreates;
  const beforeTx = transactionCalls;
  try {
    const same = await request("/api/inventory/relocate", {
      method: "POST",
      token: tokenFor(operator),
      body: {
        inventoryId: "inv-hugo-src",
        allocationMode: "FIFO",
        destinationLocation: "BUFFER-IN",
        quantity: 1
      }
    });
    assert.equal(same.status, 400);
    assert.match(String((same.json as { message?: string })?.message || ""), /distintos/i);
    assert.equal(relocateMovementCreates, beforeRelocate);
    assert.equal(transactionCalls, beforeTx);
  } finally {
    useRelocateTx = false;
  }
});

test("cantidad superior al disponible rechaza reubicación", async () => {
  useRelocateTx = true;
  const beforeRelocate = relocateMovementCreates;
  const beforeTx = transactionCalls;
  try {
    const excess = await request("/api/inventory/relocate", {
      method: "POST",
      token: tokenFor(operator),
      body: {
        inventoryId: "inv-hugo-src",
        allocationMode: "FIFO",
        destinationLocation: "AN2-A",
        quantity: 999
      }
    });
    assert.equal(excess.status, 409);
    assert.equal((excess.json as { code?: string })?.code, "INSUFFICIENT_STOCK");
    assert.equal(relocateMovementCreates, beforeRelocate);
    assert.equal(transactionCalls, beforeTx + 1);
  } finally {
    useRelocateTx = false;
  }
});

test("ubicación destino inactiva rechaza reubicación", async () => {
  useRelocateTx = true;
  const beforeRelocate = relocateMovementCreates;
  const beforeTx = transactionCalls;
  try {
    const inactive = await request("/api/inventory/relocate", {
      method: "POST",
      token: tokenFor(operator),
      body: {
        inventoryId: "inv-hugo-src",
        allocationMode: "FIFO",
        destinationLocation: "OFF-LOC",
        quantity: 1
      }
    });
    assert.equal(inactive.status, 400);
    assert.match(String((inactive.json as { message?: string })?.message || ""), /activa/i);
    assert.equal(relocateMovementCreates, beforeRelocate);
    assert.equal(transactionCalls, beforeTx);
  } finally {
    useRelocateTx = false;
  }
});

test("inventario de otro cliente rechaza reubicación", async () => {
  useRelocateTx = true;
  const beforeRelocate = relocateMovementCreates;
  const beforeTx = transactionCalls;
  try {
    const foreign = await request("/api/inventory/relocate", {
      method: "POST",
      token: tokenFor(operator),
      body: {
        inventoryId: "inv-foreign",
        allocationMode: "FIFO",
        destinationLocation: "AN2-A",
        quantity: 1
      }
    });
    assert.equal(foreign.status, 409);
    assert.equal((foreign.json as { code?: string })?.code, "CROSS_CLIENT_OPERATION");
    assert.equal(relocateMovementCreates, beforeRelocate);
    assert.equal(transactionCalls, beforeTx);
  } finally {
    useRelocateTx = false;
  }
});

test("preparación Buffer de salida válida reubica sin movimiento OUT", async () => {
  useRelocateTx = true;
  const beforeRelocate = relocateMovementCreates;
  const beforeOut = outMovementCreates;
  const beforeTx = transactionCalls;
  try {
    const prepare = await request("/api/inventory/relocate", {
      method: "POST",
      token: tokenFor(operator),
      body: {
        inventoryId: "inv-hugo-src",
        allocationMode: "FIFO",
        destinationLocation: "BUFFER-OUT",
        quantity: 2,
        reference: "PED-HUGO-OUT-001",
        notes: "Preparación Buffer de salida"
      }
    });
    assert.equal(prepare.status, 201, JSON.stringify(prepare.json));
    assert.equal(relocateMovementCreates, beforeRelocate + 1);
    assert.equal(outMovementCreates, beforeOut);
    assert.equal(transactionCalls, beforeTx + 1);
    assert.equal(lastRelocateMovement?.reference, "PED-HUGO-OUT-001");
    assert.equal(lastRelocateMovement?.notes, "Preparación Buffer de salida");
    assert.notEqual(lastRelocateMovement?.type, "OUT");
  } finally {
    useRelocateTx = false;
  }
});

test("preparación mantiene inventario reubicado en Buffer de salida", async () => {
  useRelocateTx = true;
  try {
    const prepare = await request("/api/inventory/relocate", {
      method: "POST",
      token: tokenFor(operator),
      body: {
        inventoryId: "inv-hugo-src",
        allocationMode: "FIFO",
        destinationLocation: "BUFFER-OUT",
        quantity: 2,
        reference: "Preparación Buffer de salida"
      }
    });
    assert.equal(prepare.status, 201);
    const body = prepare.json as { type?: string };
    assert.equal(body.type, "RELOCATE");
    assert.notEqual(body.type, "OUT");
  } finally {
    useRelocateTx = false;
  }
});

test("preparación rechaza Buffer de salida en otro almacén", async () => {
  useRelocateTx = true;
  const beforeRelocate = relocateMovementCreates;
  try {
    const cross = await request("/api/inventory/relocate", {
      method: "POST",
      token: tokenFor(operator),
      body: {
        inventoryId: "inv-hugo-src",
        allocationMode: "FIFO",
        destinationLocation: "BUFFER-OUT-2",
        quantity: 1,
        reference: "Preparación Buffer de salida"
      }
    });
    assert.equal(cross.status, 400);
    assert.match(String((cross.json as { message?: string })?.message || ""), /almacén|no existe/i);
    assert.equal(relocateMovementCreates, beforeRelocate);
  } finally {
    useRelocateTx = false;
  }
});

test("recorrido completo Hugo: entrada → operativa → Buffer de salida", async () => {
  useJourneyWorld = true;
  resetJourneyState();
  const token = tokenFor(operator);
  const clientRef = "PED-JOURNEY-7788";
  try {
    const inbound = await request("/api/inventory/movements", {
      method: "POST",
      token,
      body: {
        sku: "SKU-HUGO-1",
        type: "IN",
        quantity: 5,
        location: "BUFFER-IN",
        assignmentType: "FREE_TO_SALE",
        clientId: AVIAT.id,
        reference: clientRef
      }
    });
    assert.equal(inbound.status, 201, JSON.stringify(inbound.json));
    assert.equal(journeyQtyAt("BUFFER-IN").toString(), "5");

    const bufferInv = journeyInventoryAt("BUFFER-IN");
    assert.ok(bufferInv?.id);

    const toOps = await request("/api/inventory/relocate", {
      method: "POST",
      token,
      body: {
        inventoryId: String(bufferInv?.id),
        allocationMode: "FIFO",
        destinationLocation: "AN2-A",
        quantity: 3
      }
    });
    assert.equal(toOps.status, 201, JSON.stringify(toOps.json));
    assert.equal(journeyQtyAt("BUFFER-IN").toString(), "2");
    assert.equal(journeyQtyAt("AN2-A").toString(), "3");

    const opsInv = journeyInventoryAt("AN2-A");
    assert.ok(opsInv?.id);

    const prepare = await request("/api/inventory/relocate", {
      method: "POST",
      token,
      body: {
        inventoryId: String(opsInv?.id),
        allocationMode: "FIFO",
        destinationLocation: "BUFFER-OUT",
        quantity: 2,
        reference: clientRef,
        notes: "Preparación Buffer de salida"
      }
    });
    assert.equal(prepare.status, 201, JSON.stringify(prepare.json));
    assert.equal(journeyQtyAt("AN2-A").toString(), "1");
    assert.equal(journeyQtyAt("BUFFER-OUT").toString(), "2");

    const prepareBody = prepare.json as { type?: string; reference?: string | null; notes?: string | null };
    assert.equal(prepareBody.type, "RELOCATE");
    assert.notEqual(prepareBody.type, "OUT");
    assert.equal(prepareBody.reference, clientRef);
    assert.equal(prepareBody.notes, "Preparación Buffer de salida");

    const last = journeyState.movements[journeyState.movements.length - 1] as {
      type?: string;
      movementType?: string;
      reference?: string | null;
      notes?: string | null;
    };
    assert.equal(last.movementType || last.type, "RELOCATE");
    assert.equal(last.reference, clientRef);
    assert.equal(last.notes, "Preparación Buffer de salida");

    const inboundMove = journeyState.movements.find((row) => row.movementType === "IN") as
      | { reference?: string | null }
      | undefined;
    assert.equal(inboundMove?.reference, clientRef);

    const stock = await request("/api/inventory/stock", { token });
    assert.equal(stock.status, 200);
    const rows = stock.json as Array<{ location?: { code?: string }; qty: string }>;
    const outRow = rows.find((row) => row.location?.code === "BUFFER-OUT");
    assert.ok(outRow);
    assert.equal(String(outRow?.qty), "2");
  } finally {
    useJourneyWorld = false;
    resetJourneyState();
  }
});
