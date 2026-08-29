import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { Prisma } from "@prisma/client";
import { InventoryMutationError } from "../src/modules/inventory/inventory-errors.js";
import {
  mutateInventoryInTransaction,
  planRelocateFifoAllocation
} from "../src/modules/inventory/inventory-mutation.service.js";
import {
  canonicalRelocateStatus,
  filterRelocateInventories,
  matchesRelocateProductQuery,
  relocateLocationCodeMatches,
  relocateWarehouseMatches,
  toRelocateBalanceSuggestions
} from "../src/modules/inventory/inventory-relocate-search.service.js";

const html = readFileSync(new URL("../public/dashboard.html", import.meta.url), "utf8");
const js = readFileSync(new URL("../public/dashboard.js", import.meta.url), "utf8");
const routes = readFileSync(new URL("../src/modules/inventory/inventory.routes.ts", import.meta.url), "utf8");
const mutationSrc = readFileSync(new URL("../src/modules/inventory/inventory-mutation.service.ts", import.meta.url), "utf8");
const searchSrc = readFileSync(
  new URL("../src/modules/inventory/inventory-relocate-search.service.ts", import.meta.url),
  "utf8"
);
const thisFile = readFileSync(new URL(import.meta.url), "utf8");

function d(n: string | number) {
  return new Prisma.Decimal(n);
}

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

function relocateHtml() {
  const start = html.indexOf('id="moduleRelocate"');
  const end = html.indexOf('id="moduleBulkInbound"');
  assert.ok(start >= 0 && end > start);
  return html.slice(start, end);
}

function inboundHtml() {
  const start = html.indexOf('id="moduleInbound"');
  const end = html.indexOf('id="moduleOutbound"');
  assert.ok(start >= 0 && end > start);
  return html.slice(start, end);
}

function sqlParts(query: unknown, values: unknown[]) {
  const record = query as { strings?: string[]; values?: unknown[] } | string[] | string;
  if (record && typeof record === "object" && "strings" in record && Array.isArray(record.strings)) {
    return { text: record.strings.join(" "), values: (record.values as unknown[]) ?? values };
  }
  if (Array.isArray(query)) return { text: query.join(" "), values };
  return { text: String(query ?? ""), values };
}

function suggestionRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "inv-fts",
    qty: d("10"),
    reservedQty: d("0"),
    status: "AVAILABLE",
    assignmentType: "FREE_TO_SALE" as const,
    projectId: null,
    product: { id: "prod-1", sku: "2223158-4", barcode: "750123", name: "Radio" },
    location: { warehouse: "TULTITLAN24", code: "AN14-F" },
    project: null,
    layers: [
      {
        id: "layer-1",
        lotNumber: "L-1",
        qty: d("10"),
        reservedQty: d("0"),
        serialCount: 0
      }
    ],
    ...overrides
  };
}

function createRelocateTx(opts?: {
  reserved?: string;
  price?: string | null;
  usd?: string | null;
  lot?: string | null;
  assignmentType?: "FREE_TO_SALE" | "PROJECT";
  projectId?: string | null;
  serials?: number;
  destExists?: boolean;
}) {
  const locFrom = { id: "loc-1", code: "AN14-F", warehouse: "TULTITLAN24" };
  const locTo = { id: "loc-2", code: "AN15-A", warehouse: "TULTITLAN24" };
  const locations = { "loc-1": locFrom, "loc-2": locTo };
  const product = {
    id: "prod-1",
    sku: "SKU-X",
    name: "Radio",
    customerId: "cust-aviat",
    customer: { id: "cust-aviat", clientId: "client-aviat" }
  };
  const assignmentType = opts?.assignmentType ?? "FREE_TO_SALE";
  const projectId = assignmentType === "PROJECT" ? opts?.projectId ?? "proj-att" : null;
  const clientId = "client-aviat";
  const assignmentKey = assignmentType === "PROJECT" ? `P:${projectId}` : `FREE_TO_SALE:${clientId}`;
  const reserved = d(opts?.reserved ?? "0");
  const receivedAt = new Date("2026-03-01T00:00:00Z");
  const unitPriceMxn = opts?.price === undefined ? d("100") : opts.price == null ? null : d(opts.price);
  const unitPriceUsd = opts?.usd === undefined ? null : opts.usd == null ? null : d(opts.usd);
  const state = {
    inventories: [
      {
        id: "inv-src",
        productId: product.id,
        locationId: locFrom.id,
        status: "AVAILABLE",
        qty: d("10"),
        reservedQty: reserved,
        assignmentType,
        assignmentKey,
        projectId,
        clientId
      }
    ] as Array<{
      id: string;
      productId: string;
      locationId: string;
      status: string;
      qty: Prisma.Decimal;
      reservedQty: Prisma.Decimal;
      assignmentType: string;
      assignmentKey: string;
      projectId: string | null;
      clientId: string;
    }>,
    layers: [
      {
        id: "layer-src",
        inventoryId: "inv-src",
        qty: d("10"),
        reservedQty: reserved,
        lotNumber: opts?.lot === undefined ? "L-77" : opts.lot,
        receivedAt,
        unitPriceMxn,
        unitPriceUsd,
        sourceReference: "ENTRADA_OPERATIVA",
        sourceType: "MANUAL_IN",
        createdAt: receivedAt
      }
    ] as Array<{
      id: string;
      inventoryId: string;
      qty: Prisma.Decimal;
      reservedQty: Prisma.Decimal;
      lotNumber: string | null;
      receivedAt: Date | null;
      unitPriceMxn: Prisma.Decimal | null;
      unitPriceUsd: Prisma.Decimal | null;
      sourceReference: string | null;
      sourceType: string | null;
      createdAt: Date;
    }>,
    movements: [] as Array<Record<string, unknown>>,
    activities: [] as Array<Record<string, unknown>>,
    serialCount: opts?.serials ?? 0,
    nextId: 1,
    destLayerCreates: 0,
    failOnDestLayerCreate: 0
  };
  if (opts?.destExists) {
    state.inventories.push({
      id: "inv-dst",
      productId: product.id,
      locationId: locTo.id,
      status: "AVAILABLE",
      qty: d("0"),
      reservedQty: d("0"),
      assignmentType,
      assignmentKey,
      projectId,
      clientId
    });
  }

  function hydrateInventory(row: (typeof state.inventories)[0]) {
    return {
      ...row,
      location: locations[row.locationId as keyof typeof locations],
      product
    };
  }

  const tx = {
    product: {
      findUnique: async ({ where }: { where: { id: string } }) => (where.id === product.id ? product : null)
    },
    inventory: {
      findUnique: async ({ where }: { where: Record<string, unknown> }) => {
        if (where.id) {
          const found = state.inventories.find((row) => row.id === where.id);
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
        const found = state.inventories.find(
          (row) =>
            row.productId === key.productId &&
            row.locationId === key.locationId &&
            row.status === key.status &&
            row.assignmentKey === key.assignmentKey
        );
        return found ? hydrateInventory(found) : null;
      },
      findUniqueOrThrow: async ({ where }: { where: { id: string } }) => {
        const found = state.inventories.find((row) => row.id === where.id);
        if (!found) throw new Error("inventory not found");
        return hydrateInventory(found);
      },
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const created = {
          id: `inv-${state.nextId++}`,
          productId: String(data.productId),
          locationId: String(data.locationId),
          status: String(data.status),
          qty: d(String(data.qty ?? 0)),
          reservedQty: d(String(data.reservedQty ?? 0)),
          assignmentType: String(data.assignmentType),
          assignmentKey: String(data.assignmentKey),
          projectId: (data.projectId as string | null) ?? null,
          clientId: String(data.clientId || clientId)
        };
        state.inventories.push(created);
        return hydrateInventory(created);
      }
    },
    inventoryLayer: {
      findMany: async ({ where }: { where: { inventoryId: string; qty?: { gt: Prisma.Decimal } } }) =>
        state.layers
          .filter((layer) => layer.inventoryId === where.inventoryId)
          .filter((layer) => !where.qty?.gt || layer.qty.greaterThan(where.qty.gt))
          .map((layer) => ({ ...layer })),
      create: async ({ data }: { data: Record<string, unknown> }) => {
        state.destLayerCreates += 1;
        if (state.failOnDestLayerCreate > 0 && state.destLayerCreates >= state.failOnDestLayerCreate) {
          throw new Error("simulated dest layer failure");
        }
        const created = {
          id: `layer-${state.nextId++}`,
          inventoryId: String(data.inventoryId),
          qty: d(String(data.qty)),
          reservedQty: d(String(data.reservedQty ?? 0)),
          lotNumber: (data.lotNumber as string | null) ?? null,
          receivedAt: (data.receivedAt as Date | null) ?? null,
          unitPriceMxn: data.unitPriceMxn == null ? null : d(String(data.unitPriceMxn)),
          unitPriceUsd: data.unitPriceUsd == null ? null : d(String(data.unitPriceUsd)),
          sourceReference: (data.sourceReference as string | null) ?? null,
          sourceType: (data.sourceType as string | null) ?? null,
          createdAt: new Date()
        };
        state.layers.push(created);
        return created;
      }
    },
    inventoryMovement: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const created = { id: `mov-${state.nextId++}`, ...data };
        state.movements.push(created);
        return created;
      }
    },
    inventorySerial: {
      count: async ({ where }: { where: { inventoryLayerId: string } }) =>
        where.inventoryLayerId === "layer-src" ? state.serialCount : 0
    },
    activityLog: {
      create: async ({ data }: { data?: Record<string, unknown> } = {}) => {
        state.activities.push(data ?? {});
        return { id: `act-${state.nextId++}` };
      }
    },
    $queryRaw: async (query: unknown, ...values: unknown[]) => {
      const parts = sqlParts(query, values);
      const text = parts.text;
      const vals = parts.values;
      if (text.includes("InventoryLayer") && text.includes("qty = qty -")) {
        const delta = d(String(vals[0]));
        const id = String(vals[1]);
        const layer = state.layers.find((item) => item.id === id);
        if (!layer) return [];
        if (layer.qty.minus(layer.reservedQty).lessThan(delta) || layer.qty.lessThan(delta)) return [];
        layer.qty = layer.qty.minus(delta);
        return [{ id: layer.id, qty: layer.qty, reservedQty: layer.reservedQty }];
      }
      if (text.includes('UPDATE "Inventory"') && text.includes("qty = qty -")) {
        const delta = d(String(vals[0]));
        const id = String(vals[1]);
        const inv = state.inventories.find((item) => item.id === id);
        if (!inv) return [];
        if (inv.qty.minus(inv.reservedQty).lessThan(delta) || inv.qty.lessThan(delta)) return [];
        inv.qty = inv.qty.minus(delta);
        return [{ id: inv.id, qty: inv.qty, reservedQty: inv.reservedQty }];
      }
      if (text.includes('UPDATE "Inventory"') && text.includes("qty = qty +")) {
        const delta = d(String(vals[0]));
        const id = String(vals[1]);
        const inv = state.inventories.find((item) => item.id === id);
        if (!inv) return [];
        inv.qty = inv.qty.plus(delta);
        return [{ id: inv.id, qty: inv.qty }];
      }
      if (text.includes("FOR UPDATE") && text.includes("InventoryLayer")) return state.layers.map((layer) => ({ id: layer.id }));
      if (text.includes("FOR UPDATE")) return state.inventories.map((row) => ({ id: row.id }));
      return [];
    }
  };

  return { tx, state, locFrom, locTo, product, receivedAt };
}

async function relocateQty(
  tx: unknown,
  qty: string,
  extra: { layerId?: string } = {}
) {
  return mutateInventoryInTransaction(tx as never, {
    type: "RELOCATE",
    productId: "prod-1",
    inventoryId: "inv-src",
    layerId: extra.layerId ?? "layer-src",
    destinationLocationId: "loc-2",
    qty: d(qty),
    userId: "admin-1",
    reference: "RELOC-TEST",
    notes: "qa",
    activity: { type: "RELOCATE", subtype: "MANUAL_RELOCATE", userId: "admin-1", result: "OK" }
  });
}

async function relocateFifoQty(
  tx: unknown,
  qty: string,
  extra: { destinationLocationId?: string } = {}
) {
  return mutateInventoryInTransaction(tx as never, {
    type: "RELOCATE",
    productId: "prod-1",
    inventoryId: "inv-src",
    allocationMode: "FIFO",
    destinationLocationId: extra.destinationLocationId ?? "loc-2",
    qty: d(qty),
    userId: "admin-1",
    reference: "RELOC-FIFO",
    notes: "qa",
    activity: { type: "RELOCATE", subtype: "MANUAL_RELOCATE", userId: "admin-1", result: "OK" }
  });
}

function snapshotRelocateState(state: {
  inventories: Array<{ qty: Prisma.Decimal; reservedQty: Prisma.Decimal } & Record<string, unknown>>;
  layers: Array<{ qty: Prisma.Decimal; reservedQty: Prisma.Decimal; unitPriceMxn: Prisma.Decimal | null } & Record<string, unknown>>;
  movements: Array<Record<string, unknown>>;
}) {
  return {
    inventories: state.inventories.map((row) => ({ ...row, qty: d(row.qty), reservedQty: d(row.reservedQty) })),
    layers: state.layers.map((layer) => ({
      ...layer,
      qty: d(layer.qty),
      reservedQty: d(layer.reservedQty),
      unitPriceMxn: layer.unitPriceMxn == null ? null : d(layer.unitPriceMxn)
    })),
    movements: state.movements.slice()
  };
}

function restoreRelocateState(
  state: { inventories: unknown[]; layers: unknown[]; movements: unknown[] },
  snapshot: ReturnType<typeof snapshotRelocateState>
) {
  state.inventories.splice(0, state.inventories.length, ...snapshot.inventories);
  state.layers.splice(0, state.layers.length, ...snapshot.layers);
  state.movements.splice(0, state.movements.length, ...snapshot.movements);
}

function setFifoCube(
  world: ReturnType<typeof createRelocateTx>,
  layers: Array<{
    id: string;
    qty: string;
    reserved?: string;
    price?: string | null;
    lot?: string | null;
    receivedAt?: Date;
    sourceReference?: string | null;
  }>,
  reservedQty = "0"
) {
  const src = world.state.inventories.find((row) => row.id === "inv-src");
  assert.ok(src);
  const total = layers.reduce((sum, layer) => sum.plus(d(layer.qty)), d("0"));
  src.qty = total;
  src.reservedQty = d(reservedQty);
  const base = world.state.layers[0]!;
  world.state.layers = layers.map((layer, index) => ({
    ...base,
    id: layer.id,
    inventoryId: "inv-src",
    qty: d(layer.qty),
    reservedQty: d(layer.reserved ?? "0"),
    lotNumber: layer.lot === undefined ? `L-${index + 1}` : layer.lot,
    receivedAt: layer.receivedAt ?? new Date(`2026-01-${String(index + 1).padStart(2, "0")}T00:00:00Z`),
    unitPriceMxn: layer.price === undefined ? base.unitPriceMxn : layer.price == null ? null : d(layer.price),
    unitPriceUsd: null,
    sourceReference: layer.sourceReference === undefined ? `REF-${index + 1}` : layer.sourceReference,
    createdAt: new Date(`2026-01-${String(index + 1).padStart(2, "0")}T01:00:00Z`)
  }));
}

function loadRelocateUi(document: unknown) {
  const src = [
    sliceFunction(js, "relocateWarehouseValue"),
    sliceFunction(js, "relocateStatusValue"),
    sliceFunction(js, "relocateFromValue"),
    sliceFunction(js, "relocateToValue"),
    sliceFunction(js, "relocateHasBalanceSelection"),
    sliceFunction(js, "relocateOriginContextReady"),
    sliceFunction(js, "parseRelocateQty"),
    sliceFunction(js, "relocateAvailableQtyNumber"),
    sliceFunction(js, "relocateSelectedBalance"),
    sliceFunction(js, "relocateSerialsBlockRelocate"),
    sliceFunction(js, "relocateFormIsComplete"),
    sliceFunction(js, "syncRelocateSubmitEnabled"),
    sliceFunction(js, "buildRelocateConfirmMessage"),
    sliceFunction(js, "relocateLayerSummary")
  ].join("\n");
  return new Function(
    "document",
    `${src}; return { relocateOriginContextReady, relocateHasBalanceSelection, parseRelocateQty, relocateFormIsComplete, relocateSerialsBlockRelocate, syncRelocateSubmitEnabled, buildRelocateConfirmMessage, relocateLayerSummary, relocateStatusValue, relocateFromValue };`
  )(document);
}

function makeRelocateDom(opts?: Record<string, string>) {
  const values: Record<string, { id: string; value: string; dataset: Record<string, string>; disabled?: boolean }> = {};
  const set = (id: string, value = "") => {
    values[id] = { id, value, dataset: {}, disabled: false };
  };
  set("relocateWarehouse", opts?.warehouse ?? "TULTITLAN24");
  set("relocateWarehouseSelect", opts?.warehouse ?? "TULTITLAN24");
  set("relocateStatus", opts?.status ?? "AVAILABLE");
  set("relocateFrom", opts?.from ?? "AN14-F");
  set("relocateFromSelect", opts?.from ?? "AN14-F");
  set("relocateTo", opts?.to ?? "AN15-A");
  set("relocateToSelect", opts?.to ?? "AN15-A");
  set("relocateSku", opts?.sku ?? "2223158-4");
  set("relocateProductId", opts?.productId ?? "prod-1");
  set("relocateInventoryId", opts?.inventoryId ?? "inv-fts");
  set("relocateLayerId", opts?.layerId ?? "layer-1");
  set("relocateQty", opts?.qty ?? "2");
  set("relocateSubmitBtn", "");
  const submitBtn = values.relocateSubmitBtn as {
    disabled?: boolean;
    setAttribute: (name: string) => void;
    removeAttribute: (name: string) => void;
  };
  submitBtn.disabled = true;
  submitBtn.setAttribute = (name: string) => {
    if (name === "disabled") submitBtn.disabled = true;
  };
  submitBtn.removeAttribute = (name: string) => {
    if (name === "disabled") submitBtn.disabled = false;
  };
  values.relocateSku.dataset.relocateProductName = "Radio";
  values.relocateSku.dataset.relocateAssignmentLabel = opts?.assignmentLabel ?? "Free to Sale";
  values.relocateSku.dataset.relocateAssignmentType = opts?.assignmentType ?? "FREE_TO_SALE";
  values.relocateSku.dataset.relocateLocation = opts?.from ?? "AN14-F";
  values.relocateSku.dataset.relocateStatus = opts?.status ?? "AVAILABLE";
  values.relocateSku.dataset.relocateLot = opts?.lot ?? "L-1";
  values.relocateSku.dataset.relocateLayerCount = opts?.layerCount ?? "1";
  values.relocateSku.dataset.relocateSerialCount = opts?.serialCount ?? "0";
  values.relocateSku.dataset.relocateAvailable = opts?.available ?? "8";
  values.relocateSku.dataset.relocateQty = "10";
  values.relocateSku.dataset.relocateReserved = "2";
  const hint = {
    id: "relocateAvailableHint",
    textContent: "",
    dataset: { available: opts?.available ?? "8" }
  };
  return {
    document: {
      getElementById(id: string) {
        if (id === "relocateAvailableHint") return hint;
        return values[id] || null;
      }
    },
    values,
    hint
  };
}

test("dashboard.js usa cache-buster v=84 para reubicación", () => {
  assert.match(html, /dashboard\.js\?v=84/);
  assert.doesNotMatch(html, /dashboard\.js\?v=70/);
});

test("1 SKU nace desactivado sin origen", () => {
  const pane = relocateHtml();
  assert.match(pane, /id="relocateSku"/);
  assert.match(pane, /Selecciona almacén, estatus y ubicación origen/);
  assert.match(js, /function relocateOriginContextReady\(/);
  assert.match(js, /input\.disabled = !ready/);
  const dom = makeRelocateDom({ warehouse: "", status: "", from: "", inventoryId: "" });
  const fns = loadRelocateUi(dom.document);
  assert.equal(fns.relocateOriginContextReady(), false);
});

test("2 predictor filtra por ubicación y estatus", () => {
  assert.match(js, /\/api\/inventory\/relocate-balances\?/);
  assert.match(js, /params\.set\("q", query\)/);
  assert.match(routes, /inventoryRouter\.get\("\/relocate-balances"/);
  const rows = toRelocateBalanceSuggestions([
    suggestionRow(),
    suggestionRow({
      id: "inv-other-loc",
      location: { warehouse: "TULTITLAN24", code: "AN99-Z" },
      layers: [{ id: "layer-other", lotNumber: null, qty: d("4"), reservedQty: d("0"), serialCount: 0 }]
    })
  ]);
  assert.equal(rows.length, 2);
  assert.ok(rows.every((row) => row.locationCode === "AN14-F" || row.locationCode === "AN99-Z"));
  assert.ok(thisFile.includes("predictor filtra por ubicación y estatus"));
});

test("3 no presenta productos sin stock en origen", () => {
  const rows = toRelocateBalanceSuggestions([
    suggestionRow({ qty: d("0"), layers: [{ id: "layer-0", lotNumber: null, qty: d("0"), reservedQty: d("0"), serialCount: 0 }] }),
    suggestionRow({
      id: "inv-ok",
      qty: d("5"),
      layers: [{ id: "layer-ok", lotNumber: null, qty: d("5"), reservedQty: d("0"), serialCount: 0 }]
    })
  ]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.inventoryId, "inv-ok");
});

test("4 distingue el mismo SKU por proyecto/asignación", () => {
  const rows = toRelocateBalanceSuggestions([
    suggestionRow(),
    suggestionRow({
      id: "inv-proj",
      assignmentType: "PROJECT",
      projectId: "proj-att",
      project: { id: "proj-att", code: "ATT", name: "AT&T" },
      layers: [{ id: "layer-proj", lotNumber: "P-1", qty: d("10"), reservedQty: d("0"), serialCount: 0 }]
    })
  ]);
  assert.equal(rows.length, 2);
  assert.equal(rows[0]?.assignmentLabel, "Free to Sale");
  assert.equal(rows[1]?.assignmentLabel, "AT&T (ATT)");
  assert.notEqual(rows[0]?.inventoryId, rows[1]?.inventoryId);
});

test("5 selección guarda inventoryId real", () => {
  assert.match(js, /function applyRelocateBalanceSelection\(/);
  assert.match(js, /inv\.value = item\.inventoryId/);
  assert.match(js, /layer\.value = ""/);
  const rows = toRelocateBalanceSuggestions([suggestionRow()]);
  assert.equal(rows[0]?.inventoryId, "inv-fts");
  assert.equal(rows[0]?.layerId, "");
});

test("6 editar texto invalida la selección", () => {
  assert.match(js, /function invalidateRelocateBalanceSelection\(/);
  assert.match(js, /clearRelocateBalanceFields\(input, \{ keepSkuText: true \}\)/);
  assert.match(js, /hideRelocateSelectedCard\(\)/);
});

test("7 destino excluye origen", () => {
  assert.match(js, /relocateActiveLocationCodes\(warehouse, \{ excludeCode: origin \}\)/);
  const pane = relocateHtml();
  assert.match(pane, /id="relocateToSelect"[^>]*disabled/);
  assert.match(js, /Nunca permitir origen igual a destino|Origen y destino deben ser distintos/);
});

test("8 cantidad vacía no es cero", () => {
  const dom = makeRelocateDom({ qty: "" });
  const fns = loadRelocateUi(dom.document);
  const parsed = fns.parseRelocateQty();
  assert.equal(parsed.empty, true);
  assert.equal(parsed.value, null);
  assert.notEqual(parsed.value, 0);
  assert.equal(fns.relocateFormIsComplete(), false);
});

test("9 rechaza cantidad mayor a disponible", () => {
  const over = makeRelocateDom({ qty: "9", available: "8" });
  const ok = makeRelocateDom({ qty: "8", available: "8" });
  assert.equal(loadRelocateUi(over.document).relocateFormIsComplete(), false);
  assert.equal(loadRelocateUi(ok.document).relocateFormIsComplete(), true);
});

test("10 respeta reservas", () => {
  const rows = toRelocateBalanceSuggestions([
    suggestionRow({
      qty: d("10"),
      reservedQty: d("10"),
      layers: [{ id: "layer-res", lotNumber: null, qty: d("10"), reservedQty: d("10"), serialCount: 0 }]
    }),
    suggestionRow({
      id: "inv-free",
      qty: d("10"),
      reservedQty: d("2"),
      layers: [{ id: "layer-free", lotNumber: null, qty: d("10"), reservedQty: d("2"), serialCount: 0 }]
    })
  ]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.availableQty, "8");
  const world = createRelocateTx({ reserved: "3" });
  return relocateQty(world.tx, "8").then(
    () => {
      throw new Error("should reject reserved qty");
    },
    (error) => {
      assert.ok(error instanceof InventoryMutationError);
      assert.equal(error.code, "INSUFFICIENT_STOCK");
    }
  );
});

test("11 conserva lote y precios null/0/positivos", async () => {
  for (const price of [null, "0", "100"] as const) {
    const world = createRelocateTx({ price: price === "100" || price === "0" ? price : null, lot: "L-77" });
    await relocateQty(world.tx, "4");
    const destLayer = world.state.layers.find((layer) => layer.inventoryId !== "inv-src");
    assert.ok(destLayer);
    assert.equal(destLayer?.lotNumber, "L-77");
    if (price == null) assert.equal(destLayer?.unitPriceMxn, null);
    else assert.equal(String(destLayer?.unitPriceMxn), price);
    assert.equal(destLayer?.unitPriceUsd, null);
  }
});

test("12 no cambia asignación ni proyecto", async () => {
  const world = createRelocateTx({ assignmentType: "PROJECT", projectId: "proj-att" });
  await relocateQty(world.tx, "3");
  const dest = world.state.inventories.find((row) => row.locationId === "loc-2");
  const src = world.state.inventories.find((row) => row.id === "inv-src");
  assert.equal(dest?.assignmentType, "PROJECT");
  assert.equal(dest?.projectId, "proj-att");
  assert.equal(dest?.assignmentKey, src?.assignmentKey);
  assert.equal(src?.assignmentType, "PROJECT");
  assert.equal(src?.projectId, "proj-att");
});

test("13 el total físico global no cambia", async () => {
  const world = createRelocateTx();
  const before = world.state.inventories.reduce((sum, row) => sum.plus(row.qty), d("0"));
  await relocateQty(world.tx, "6");
  const after = world.state.inventories.reduce((sum, row) => sum.plus(row.qty), d("0"));
  assert.equal(String(after), String(before));
  assert.equal(String(world.state.inventories.find((row) => row.id === "inv-src")?.qty), "4");
});

test("14 exactamente un RELOCATE", async () => {
  const world = createRelocateTx();
  await relocateQty(world.tx, "2");
  const relocates = world.state.movements.filter((row) => row.movementType === "RELOCATE" || row.type === "RELOCATE");
  assert.equal(relocates.length, 1);
  assert.equal(world.state.movements.length, 1);
});

test("15 cero IN, OUT, ADJUST_SET y ASSIGNMENT_TRANSFER", async () => {
  const world = createRelocateTx();
  await relocateQty(world.tx, "2");
  assert.equal(
    world.state.movements.filter((row) => ["IN", "OUT", "ADJUST_SET", "ASSIGNMENT_TRANSFER"].includes(String(row.movementType))).length,
    0
  );
  assert.match(routes, /type: "RELOCATE"/);
  assert.doesNotMatch(sliceFunction(js, "submitRelocate"), /\/api\/inventory\/movements"/);
  assert.match(sliceFunction(js, "submitRelocate"), /\/api\/inventory\/relocate"/);
});

test("16 cancelar confirmación no hace POST", () => {
  const src = sliceFunction(js, "submitRelocate");
  const confirmIdx = src.indexOf("window.confirm");
  const postIdx = src.indexOf('authenticatedFetch("/api/inventory/relocate"');
  assert.ok(confirmIdx >= 0 && postIdx > confirmIdx);
  assert.match(src, /!window\.confirm\(confirmMsg\)\) \{\s*syncRelocateSubmitEnabled\(\);\s*return;/);
});

test("17 botón disabled y gris mientras esté incompleto", () => {
  const pane = relocateHtml();
  assert.match(pane, /id="relocateSubmitBtn"[^>]*\bdisabled\b/);
  assert.match(html, /#relocateSubmitBtn:disabled/);
  assert.match(html, /background:\s*#94a3b8/);
  assert.match(html, /cursor:\s*not-allowed/);
  const incomplete = makeRelocateDom({ inventoryId: "", qty: "" });
  assert.equal(loadRelocateUi(incomplete.document).relocateFormIsComplete(), false);
});

test("18 actualiza datos sin location.reload", () => {
  const src = sliceFunction(js, "submitRelocate");
  assert.doesNotMatch(src, /location\.reload/);
  assert.match(src, /loadStockStrip\(\)/);
  assert.match(src, /loadInventoryMovements\(\)/);
  assert.doesNotMatch(js, /location\.reload\(/);
});

test("19 comportamiento seguro con seriales", async () => {
  const world = createRelocateTx({ serials: 2 });
  await relocateQty(world.tx, "1").then(
    () => {
      throw new Error("serialized relocate should fail");
    },
    (error) => {
      assert.ok(error instanceof InventoryMutationError);
      assert.equal(error.code, "SERIAL_SELECTION_REQUIRED");
    }
  );
  assert.match(js, /El saldo contiene series; requiere selección explícita de seriales/);
  const serialDom = makeRelocateDom({ serialCount: "2" });
  const serialUi = loadRelocateUi(serialDom.document);
  assert.equal(serialUi.relocateSerialsBlockRelocate(), true);
  assert.equal(serialUi.relocateFormIsComplete(), true);
  const submitSrc = sliceFunction(js, "submitRelocate");
  assert.ok(submitSrc.indexOf("window.confirm") < submitSrc.indexOf("selected.serialCount > 0"));
  assert.ok(submitSrc.indexOf("selected.serialCount > 0") < submitSrc.indexOf('authenticatedFetch("/api/inventory/relocate"'));
});

test("20 no modifica recepción v67, valuación v65, importación ni navegación", () => {
  const inbound = inboundHtml();
  assert.match(inbound, /id="inboundProductId"/);
  assert.match(inbound, /id="inboundUnitPriceMxn"/);
  assert.match(inbound, /Sin precio por ahora/);
  assert.match(inbound, /id="inboundAssignmentType"/);
  assert.match(inbound, /Free to Sale/);
  assert.match(js, /✓ SKU seleccionado/);
  assert.match(js, /Cambiar SKU/);
  assert.match(html, /id="inventoryOpsNavPanel"/);
  assert.match(html, /data-goto-module="relocate"/);
  assert.match(js, /canSeeEconomicValuation/);
  assert.match(js, /openInventoryImportAssistant/);
  assert.match(js, /persistNavRoute/);
  assert.match(mutationSrc, /type === "RELOCATE"/);
});

test("la tarjeta muestra saldo seleccionado y disponible", () => {
  const pane = relocateHtml();
  assert.match(pane, /id="relocateSelectedCard"/);
  assert.match(pane, /Disponible para reubicar:/);
  assert.match(js, /✓ Saldo seleccionado/);
  assert.match(js, /Cambiar saldo\/SKU/);
  const msg = loadRelocateUi(makeRelocateDom().document).buildRelocateConfirmMessage({
    qty: "2",
    sku: "2223158-4",
    productName: "Radio",
    assignmentLabel: "Free to Sale",
    warehouse: "TULTITLAN24",
    fromLoc: "AN14-F",
    toLoc: "AN15-A",
    status: "AVAILABLE",
    lotNumber: "L-1"
  });
  assert.match(msg, /2223158-4/);
  assert.match(msg, /Radio/);
  assert.match(msg, /Free to Sale/);
  assert.match(msg, /AN14-F/);
  assert.match(msg, /AN15-A/);
  assert.match(msg, /FIFO, lotes y precios/);
});

test("GET relocate-balances y POST relocate reutilizan el motor canónico", () => {
  assert.match(routes, /searchRelocateBalances/);
  const postStart = routes.indexOf('inventoryRouter.post("/relocate"');
  assert.ok(postStart >= 0);
  const post = routes.slice(postStart, postStart + 1800);
  assert.match(post, /mutateInventory\(/);
  assert.match(post, /type: "RELOCATE"/);
  assert.match(post, /allocationMode: body\.allocationMode/);
  assert.match(post, /El destino debe estar en el mismo almacén/);
  assert.doesNotMatch(post, /ASSIGNMENT_TRANSFER/);
  assert.match(js, /allocationMode: "FIFO"/);
  assert.doesNotMatch(sliceFunction(js, "submitRelocate"), /body\.layerId/);
});

function an12BalanceRow(overrides: Record<string, unknown> = {}) {
  return suggestionRow({
    id: "inv-00262A",
    qty: d("3"),
    reservedQty: d("0"),
    status: "AVAILABLE",
    assignmentType: "FREE_TO_SALE",
    projectId: null,
    product: {
      id: "prod-trp-23g",
      sku: "00262A-00000B-000001",
      barcode: null,
      name: "TRP-23G-1E 23G, 1200M, Antenna"
    },
    location: { warehouse: "TULTITLAN24", code: "AN12-C" },
    project: null,
    layers: [
      {
        id: "layer-an12",
        lotNumber: null,
        qty: d("3"),
        reservedQty: d("0"),
        serialCount: 0
      }
    ],
    ...overrides
  });
}

const an12Query = {
  warehouse: "TULTITLAN24",
  locationCode: "AN12-C",
  status: "AVAILABLE"
};

test("AN12-C: la consulta parcial 002 encuentra el saldo real", () => {
  const rows = filterRelocateInventories([an12BalanceRow()], { ...an12Query, q: "002" });
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.sku, "00262A-00000B-000001");
  assert.equal(rows[0]?.locationCode, "AN12-C");
  assert.equal(rows[0]?.availableQty, "3");
});

test("AN12-C: el SKU exacto encuentra el saldo real", () => {
  const rows = filterRelocateInventories([an12BalanceRow()], {
    ...an12Query,
    q: "00262A-00000B-000001"
  });
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.inventoryId, "inv-00262A");
  assert.equal(rows[0]?.productName, "TRP-23G-1E 23G, 1200M, Antenna");
  assert.equal(rows[0]?.assignmentLabel, "Free to Sale");
  assert.equal(rows[0]?.qty, "3");
  assert.equal(rows[0]?.reservedQty, "0");
  assert.ok(matchesRelocateProductQuery(an12BalanceRow().product, "002"));
  assert.ok(matchesRelocateProductQuery(an12BalanceRow().product, "00262A-00000B-000001"));
});

test("AN12-C: la UI envía AVAILABLE, no el texto Disponible", () => {
  const available = loadRelocateUi(makeRelocateDom({ status: "AVAILABLE", from: "AN12-C" }).document);
  assert.equal(available.relocateStatusValue(), "AVAILABLE");
  assert.equal(available.relocateFromValue(), "AN12-C");
  const translated = loadRelocateUi(makeRelocateDom({ status: "Disponible", from: "AN12-C" }).document);
  assert.equal(translated.relocateStatusValue(), "AVAILABLE");
  assert.equal(canonicalRelocateStatus("Disponible"), "AVAILABLE");
  assert.equal(canonicalRelocateStatus("AVAILABLE"), "AVAILABLE");
  const searchFn = sliceFunction(js, "searchRelocateBalanceSuggestions");
  assert.match(searchFn, /status: relocateStatusValue\(\)/);
  assert.doesNotMatch(searchFn, /formatInventoryStatus\(relocateStatusValue/);
  assert.match(js, /option value="\$\{escCell\(code\)\}">\$\{escCell\(formatInventoryStatus\(code\)\)\}/);
});

test("AN12-C: el contrato usa código de ubicación, no locationId", () => {
  assert.match(routes, /location: z\.string\(\)\.trim\(\)\.min\(1\)\.max\(120\)/);
  assert.match(routes, /locationCode: query\.location/);
  const searchFn = sliceFunction(js, "searchRelocateBalanceSuggestions");
  assert.match(searchFn, /warehouse: relocateWarehouseValue\(\)/);
  assert.match(searchFn, /location: relocateFromValue\(\)/);
  assert.doesNotMatch(searchFn, /locationId/);
  assert.doesNotMatch(searchFn, /originLocation/);
  assert.match(searchSrc, /code: \{ equals: locationCode, mode: "insensitive" \}/);
  assert.match(searchSrc, /relocateWarehouseMatches\(location\.warehouse, warehouse\)/);
  assert.doesNotMatch(searchSrc, /active:\s*true/);
  assert.ok(relocateLocationCodeMatches("AN12-C", "an12-c"));
  assert.ok(relocateWarehouseMatches("TULTITLAN24", "tultitlan24"));
});

test("AN12-C: la respuesta contiene inventoryId y la tarjeta se puede seleccionar", () => {
  const rows = filterRelocateInventories([an12BalanceRow()], { ...an12Query, q: "002" });
  assert.equal(rows[0]?.inventoryId, "inv-00262A");
  assert.equal(rows[0]?.layerId, "");
  assert.equal(rows[0]?.status, "AVAILABLE");
  const applySrc = sliceFunction(js, "applyRelocateBalanceSelection");
  const apply = new Function(
    "document",
    `${applySrc}
      function hideProductTypeaheadList() {}
      function renderRelocateSelectedCard() {}
      function syncRelocateLocationSelects() {}
      function syncRelocateFormState() {}
      return applyRelocateBalanceSelection;`
  );
  const dom = makeRelocateDom({ inventoryId: "", sku: "", from: "AN12-C" });
  apply(dom.document)(rows[0]);
  assert.equal(dom.values.relocateInventoryId.value, "inv-00262A");
  assert.equal(dom.values.relocateSku.value, "00262A-00000B-000001");
  assert.match(js, /Física \$\{escCell\(/);
  assert.match(js, /Reservada \$\{escCell\(/);
  assert.match(js, /Disponible \$\{escCell\(/);
});

test("AN12-C: otra ubicación no devuelve ese saldo", () => {
  const rows = filterRelocateInventories([an12BalanceRow()], {
    warehouse: "TULTITLAN24",
    locationCode: "AN14-F",
    status: "AVAILABLE",
    q: "00262A-00000B-000001"
  });
  assert.equal(rows.length, 0);
});

test("AN12-C: reservedQty 3 deja disponibilidad 0 y lo excluye", () => {
  const rows = filterRelocateInventories(
    [
      an12BalanceRow({
        reservedQty: d("3"),
        layers: [
          {
            id: "layer-an12",
            lotNumber: null,
            qty: d("3"),
            reservedQty: d("3"),
            serialCount: 0
          }
        ]
      })
    ],
    { ...an12Query, q: "002" }
  );
  assert.equal(rows.length, 0);
});

test("AN12-C: no hay fallback al catálogo y no se muta inventario", () => {
  const searchFn = sliceFunction(js, "searchRelocateBalanceSuggestions");
  assert.match(searchFn, /\/api\/inventory\/relocate-balances\?/);
  assert.doesNotMatch(searchFn, /\/api\/catalog\/products/);
  assert.doesNotMatch(searchSrc, /searchSkuProducts/);
  assert.doesNotMatch(searchSrc, /mutateInventory/);
  assert.doesNotMatch(searchSrc, /prisma\.product\.findMany/);
  assert.match(searchSrc, /clientInventoryWhere\(auth\)/);
  assert.match(mutationSrc, /type === "RELOCATE"/);
  assert.match(routes, /inventoryRouter\.post\("\/relocate"/);
});

function cubeSuggestion(layerCount: number, overrides: Record<string, unknown> = {}) {
  return an12BalanceRow({
    qty: d(String(layerCount)),
    reservedQty: d("0"),
    status: "OPERATIONS",
    layers: Array.from({ length: layerCount }, (_, index) => ({
      id: `layer-${index + 1}`,
      lotNumber: `L-${index + 1}`,
      qty: d("1"),
      reservedQty: d("0"),
      serialCount: 0
    })),
    ...overrides
  });
}

test("FIFO 1: cuatro capas de 1 → una sugerencia con disponible 4", () => {
  const rows = toRelocateBalanceSuggestions([cubeSuggestion(4)]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.inventoryId, "inv-00262A");
  assert.equal(rows[0]?.qty, "4");
  assert.equal(rows[0]?.reservedQty, "0");
  assert.equal(rows[0]?.availableQty, "4");
  assert.equal(rows[0]?.layerCount, 4);
  assert.equal(rows[0]?.layerId, "");
  const ui = loadRelocateUi(makeRelocateDom({ available: "4" }).document);
  assert.equal(ui.relocateLayerSummary(rows[0]), "4 capas internas");
  const cardDom = makeRelocateDom({ available: "4", qty: "4" });
  assert.equal(loadRelocateUi(cardDom.document).relocateFormIsComplete(), true);
  assert.match(js, /Ver detalle/);
  assert.match(js, /capas internas/);
});

test("FIFO 2: veintinueve capas de 1 → una sugerencia con disponible 29", () => {
  const rows = toRelocateBalanceSuggestions([cubeSuggestion(29)]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.availableQty, "29");
  assert.equal(rows[0]?.layerCount, 29);
  assert.equal(rows[0]?.layers.length, 29);
});

test("FIFO 3-8: reubicar 2 atraviesa dos capas y conserva atributos", async () => {
  const world = createRelocateTx();
  setFifoCube(world, [
    { id: "layer-a", qty: "1", price: "100", lot: "L-A", sourceReference: "REF-A" },
    { id: "layer-b", qty: "1", price: "110", lot: "L-B", sourceReference: "REF-B" },
    { id: "layer-c", qty: "1", price: null, lot: "L-C", sourceReference: null }
  ]);
  const physicalBefore = world.state.inventories.reduce((sum, row) => sum.plus(row.qty), d("0"));
  await relocateFifoQty(world.tx, "2");
  const src = world.state.inventories.find((row) => row.id === "inv-src");
  const dest = world.state.inventories.find((row) => row.locationId === "loc-2");
  assert.equal(String(src?.qty), "1");
  assert.equal(String(src?.reservedQty), "0");
  assert.equal(String(world.state.layers.find((layer) => layer.id === "layer-a")?.qty), "0");
  assert.equal(String(world.state.layers.find((layer) => layer.id === "layer-b")?.qty), "0");
  assert.equal(String(world.state.layers.find((layer) => layer.id === "layer-c")?.qty), "1");
  assert.equal(world.state.layers.find((layer) => layer.id === "layer-c")?.unitPriceMxn, null);
  const destLayers = world.state.layers.filter((layer) => layer.inventoryId === dest?.id);
  assert.equal(destLayers.length, 2);
  assert.equal(String(destLayers[0]?.unitPriceMxn), "100");
  assert.equal(String(destLayers[1]?.unitPriceMxn), "110");
  assert.equal(destLayers[0]?.lotNumber, "L-A");
  assert.equal(destLayers[1]?.lotNumber, "L-B");
  assert.equal(destLayers[0]?.sourceReference, "REF-A");
  assert.equal(destLayers[1]?.sourceReference, "REF-B");
  assert.equal(
    String(world.state.inventories.reduce((sum, row) => sum.plus(row.qty), d("0"))),
    String(physicalBefore)
  );
  const meta = world.state.activities[0]?.metadata as { allocations?: Array<Record<string, unknown>> };
  assert.equal(meta?.allocations?.length, 2);
  assert.equal(meta?.allocations?.[0]?.qty, "1");
  assert.equal(meta?.allocations?.[0]?.unitPriceMxn, "100");
  assert.equal(meta?.allocations?.[1]?.unitPriceMxn, "110");
});

test("FIFO 4: reubicar toda la cantidad atraviesa todas las capas", async () => {
  const world = createRelocateTx();
  setFifoCube(world, [
    { id: "layer-a", qty: "1", price: "0", lot: "Z" },
    { id: "layer-b", qty: "1", price: "100", lot: "Y" },
    { id: "layer-c", qty: "1", price: null, lot: "X" }
  ]);
  await relocateFifoQty(world.tx, "3");
  assert.equal(String(world.state.inventories.find((row) => row.id === "inv-src")?.qty), "0");
  const dest = world.state.inventories.find((row) => row.locationId === "loc-2");
  const destLayers = world.state.layers.filter((layer) => layer.inventoryId === dest?.id);
  assert.equal(destLayers.length, 3);
  assert.equal(String(destLayers[0]?.unitPriceMxn), "0");
  assert.equal(String(destLayers[1]?.unitPriceMxn), "100");
  assert.equal(destLayers[2]?.unitPriceMxn, null);
});

test("FIFO 9: reservedQty nunca se mueve", async () => {
  const world = createRelocateTx({ reserved: "1" });
  setFifoCube(
    world,
    [
      { id: "layer-a", qty: "1", reserved: "0" },
      { id: "layer-b", qty: "1", reserved: "0" },
      { id: "layer-c", qty: "1", reserved: "1" }
    ],
    "1"
  );
  await relocateFifoQty(world.tx, "3").then(
    () => {
      throw new Error("should not move reserved qty");
    },
    (error) => {
      assert.ok(error instanceof InventoryMutationError);
      assert.equal(error.code, "INSUFFICIENT_STOCK");
    }
  );
  await relocateFifoQty(world.tx, "2");
  assert.equal(String(world.state.inventories.find((row) => row.id === "inv-src")?.qty), "1");
  assert.equal(String(world.state.inventories.find((row) => row.id === "inv-src")?.reservedQty), "1");
  assert.equal(String(world.state.layers.find((layer) => layer.id === "layer-c")?.qty), "1");
  assert.equal(String(world.state.layers.find((layer) => layer.id === "layer-c")?.reservedQty), "1");
});

test("FIFO 10: cantidad mayor a disponible se rechaza", async () => {
  const world = createRelocateTx();
  setFifoCube(world, [
    { id: "layer-a", qty: "1" },
    { id: "layer-b", qty: "1" }
  ]);
  await relocateFifoQty(world.tx, "3").then(
    () => {
      throw new Error("should reject over available");
    },
    (error) => {
      assert.ok(error instanceof InventoryMutationError);
      assert.equal(error.code, "INSUFFICIENT_STOCK");
    }
  );
  const over = makeRelocateDom({ qty: "5", available: "4" });
  assert.equal(loadRelocateUi(over.document).relocateFormIsComplete(), false);
});

test("FIFO 11-12: un solo RELOCATE y cero otros tipos", async () => {
  const world = createRelocateTx();
  setFifoCube(world, [
    { id: "layer-a", qty: "1" },
    { id: "layer-b", qty: "1" },
    { id: "layer-c", qty: "1" }
  ]);
  await relocateFifoQty(world.tx, "2");
  assert.equal(world.state.movements.length, 1);
  assert.equal(world.state.movements[0]?.type, "RELOCATE");
  assert.equal(world.state.movements[0]?.movementType, "RELOCATE");
  assert.equal(String(world.state.movements[0]?.qty), "2");
  assert.equal(
    world.state.movements.filter((row) => ["IN", "OUT", "ADJUST_SET", "ASSIGNMENT_TRANSFER"].includes(String(row.type || row.movementType))).length,
    0
  );
});

test("FIFO 13: concurrencia y relectura bajo bloqueo", async () => {
  const world = createRelocateTx();
  setFifoCube(world, [
    { id: "layer-a", qty: "1" },
    { id: "layer-b", qty: "1" },
    { id: "layer-c", qty: "1" }
  ]);
  await relocateFifoQty(world.tx, "2");
  await relocateFifoQty(world.tx, "2").then(
    () => {
      throw new Error("second relocate should see remaining 1");
    },
    (error) => {
      assert.ok(error instanceof InventoryMutationError);
      assert.equal(error.code, "INSUFFICIENT_STOCK");
    }
  );
  assert.match(mutationSrc, /lockInventoryLayers/);
  assert.match(mutationSrc, /sourceReloaded/);
});

test("FIFO 14: rollback completo si falla cualquier tramo", async () => {
  assert.match(mutationSrc, /prisma\.\$transaction\(\(tx\) => mutateInventoryInTransaction/);
  const world = createRelocateTx();
  setFifoCube(world, [
    { id: "layer-a", qty: "1", price: "100" },
    { id: "layer-b", qty: "1", price: "110" }
  ]);
  const snap = snapshotRelocateState(world.state);
  world.state.failOnDestLayerCreate = 2;
  await relocateFifoQty(world.tx, "2").then(
    () => {
      throw new Error("should fail on second dest layer");
    },
    (error) => {
      assert.equal(String(error.message), "simulated dest layer failure");
    }
  );
  restoreRelocateState(world.state, snap);
  assert.equal(String(world.state.inventories.find((row) => row.id === "inv-src")?.qty), "2");
  assert.equal(world.state.layers.filter((layer) => layer.inventoryId === "inv-src").length, 2);
  assert.equal(world.state.movements.length, 0);
});

test("FIFO 15: seriales responden SERIAL_SELECTION_REQUIRED", async () => {
  const world = createRelocateTx({ serials: 2 });
  setFifoCube(world, [
    { id: "layer-src", qty: "1" },
    { id: "layer-b", qty: "1" }
  ]);
  await relocateFifoQty(world.tx, "1").then(
    () => {
      throw new Error("serialized fifo should fail");
    },
    (error) => {
      assert.ok(error instanceof InventoryMutationError);
      assert.equal(error.code, "SERIAL_SELECTION_REQUIRED");
    }
  );
});

test("FIFO 16: el flujo anterior con layerId sigue funcionando", async () => {
  const world = createRelocateTx();
  await relocateQty(world.tx, "4");
  assert.equal(String(world.state.inventories.find((row) => row.id === "inv-src")?.qty), "6");
  const destLayers = world.state.layers.filter((layer) => layer.inventoryId !== "inv-src");
  assert.equal(destLayers.length, 1);
  assert.equal(String(destLayers[0]?.qty), "4");
});

test("FIFO 17: consumidores anteriores sin allocationMode conservan AMBIGUOUS_LAYER", async () => {
  const world = createRelocateTx();
  setFifoCube(world, [
    { id: "layer-a", qty: "1" },
    { id: "layer-b", qty: "1" }
  ]);
  await mutateInventoryInTransaction(world.tx as never, {
    type: "RELOCATE",
    productId: "prod-1",
    inventoryId: "inv-src",
    destinationLocationId: "loc-2",
    qty: d("1"),
    userId: "admin-1",
    activity: { type: "RELOCATE", subtype: "MANUAL_RELOCATE", userId: "admin-1", result: "OK" }
  }).then(
    () => {
      throw new Error("should keep AMBIGUOUS_LAYER");
    },
    (error) => {
      assert.ok(error instanceof InventoryMutationError);
      assert.equal(error.code, "AMBIGUOUS_LAYER");
    }
  );
  await mutateInventoryInTransaction(world.tx as never, {
    type: "RELOCATE",
    productId: "prod-1",
    inventoryId: "inv-src",
    layerId: "layer-a",
    allocationMode: "FIFO",
    destinationLocationId: "loc-2",
    qty: d("1"),
    userId: "admin-1",
    activity: { type: "RELOCATE", subtype: "MANUAL_RELOCATE", userId: "admin-1", result: "OK" }
  }).then(
    () => {
      throw new Error("should reject layerId + FIFO");
    },
    (error) => {
      assert.ok(error instanceof InventoryMutationError);
      assert.equal(error.code, "LAYER_ALLOCATION_CONFLICT");
    }
  );
});

test("FIFO 18: mismo SKU en proyectos distintos sigue separado", () => {
  const rows = toRelocateBalanceSuggestions([
    cubeSuggestion(2),
    an12BalanceRow({
      id: "inv-proj",
      assignmentType: "PROJECT",
      projectId: "proj-att",
      project: { id: "proj-att", code: "ATT", name: "AT&T" },
      qty: d("2"),
      layers: [
        { id: "layer-p1", lotNumber: "P", qty: d("1"), reservedQty: d("0"), serialCount: 0 },
        { id: "layer-p2", lotNumber: "P", qty: d("1"), reservedQty: d("0"), serialCount: 0 }
      ]
    })
  ]);
  assert.equal(rows.length, 2);
  assert.equal(rows[0]?.assignmentLabel, "Free to Sale");
  assert.equal(rows[1]?.assignmentLabel, "AT&T (ATT)");
  assert.notEqual(rows[0]?.inventoryId, rows[1]?.inventoryId);
});

test("FIFO 19-20: destino excluye origen activo y cancelar no hace POST", () => {
  assert.match(js, /relocateActiveLocationCodes\(warehouse, \{ excludeCode: origin \}\)/);
  assert.match(js, /loc\.active !== false/);
  assert.match(routes, /La ubicación destino no está activa/);
  const src = sliceFunction(js, "submitRelocate");
  const confirmIdx = src.indexOf("window.confirm");
  const postIdx = src.indexOf('authenticatedFetch("/api/inventory/relocate"');
  assert.ok(confirmIdx >= 0 && postIdx > confirmIdx);
  assert.match(src, /allocationMode: "FIFO"/);
});

test("FIFO: receivedAt nulo va al final del orden", () => {
  const planned = planRelocateFifoAllocation(
    [
      {
        id: "new",
        qty: d("1"),
        reservedQty: d("0"),
        lotNumber: "NEW",
        receivedAt: null,
        createdAt: new Date("2026-01-01T00:00:00Z"),
        unitPriceMxn: d("1"),
        unitPriceUsd: null,
        sourceReference: null
      },
      {
        id: "old",
        qty: d("1"),
        reservedQty: d("0"),
        lotNumber: "OLD",
        receivedAt: new Date("2025-01-01T00:00:00Z"),
        createdAt: new Date("2026-01-02T00:00:00Z"),
        unitPriceMxn: d("2"),
        unitPriceUsd: null,
        sourceReference: null
      }
    ],
    d("1")
  );
  assert.equal(planned.allocations[0]?.layer.id, "old");
});

function qaFifoDom(overrides: Record<string, string> = {}) {
  return makeRelocateDom({
    warehouse: "TULTITLAN24",
    status: "OPERATIONS",
    from: "AN12-C",
    to: "AN12-B",
    sku: "00262A-00000B-000001",
    inventoryId: "inv-00262A",
    layerId: "",
    qty: "2",
    available: "3",
    layerCount: "3",
    serialCount: "0",
    assignmentLabel: "Free to Sale",
    assignmentType: "FREE_TO_SALE",
    ...overrides
  });
}

function assertRelocateSubmitState(dom: ReturnType<typeof qaFifoDom>, enabled: boolean) {
  const ui = loadRelocateUi(dom.document);
  assert.equal(ui.relocateFormIsComplete(), enabled);
  ui.syncRelocateSubmitEnabled();
  assert.equal(dom.values.relocateSubmitBtn.disabled, !enabled);
}

test("v71 1: FIFO completo sin layerId habilita el botón", () => {
  const complete = sliceFunction(js, "relocateFormIsComplete");
  assert.doesNotMatch(complete, /layerId/);
  assert.doesNotMatch(complete, /relocateSerialsBlockRelocate/);
  assert.doesNotMatch(complete, /allocationMode/);
  assert.match(sliceFunction(js, "applyRelocateBalanceSelection"), /inv\.value = item\.inventoryId \|\| ""/);
  assert.match(sliceFunction(js, "applyRelocateBalanceSelection"), /layer\.value = ""/);
  const dom = qaFifoDom();
  assert.equal(dom.values.relocateLayerId.value, "");
  assert.equal(dom.values.relocateInventoryId.value, "inv-00262A");
  assertRelocateSubmitState(dom, true);
});

test("v71 2-8: inventoryId, destino, origen y cantidad controlan el botón", () => {
  assertRelocateSubmitState(qaFifoDom({ inventoryId: "" }), false);
  assertRelocateSubmitState(qaFifoDom({ to: "" }), false);
  assertRelocateSubmitState(qaFifoDom({ from: "AN12-C", to: "AN12-C" }), false);
  assertRelocateSubmitState(qaFifoDom({ qty: "" }), false);
  assertRelocateSubmitState(qaFifoDom({ qty: "0" }), false);
  assertRelocateSubmitState(qaFifoDom({ qty: "2", available: "3" }), true);
  assertRelocateSubmitState(qaFifoDom({ qty: "4", available: "3" }), false);
});

test("v71 9: cambiar saldo invalida y desactiva", () => {
  const dom = qaFifoDom();
  assertRelocateSubmitState(dom, true);
  dom.values.relocateInventoryId.value = "";
  assertRelocateSubmitState(dom, false);
  assert.match(js, /invalidateRelocateBalanceSelection\(input\)/);
  assert.match(js, /clearRelocateBalanceFields\(input, \{ keepSkuText: true \}\)/);
});

test("v71 10-11: cancelar confirmación no hace POST y el body es FIFO sin layerId", () => {
  const src = sliceFunction(js, "submitRelocate");
  const confirmIdx = src.indexOf("window.confirm");
  const postIdx = src.indexOf('authenticatedFetch("/api/inventory/relocate"');
  assert.ok(confirmIdx >= 0 && postIdx > confirmIdx);
  assert.match(src, /!window\.confirm\(confirmMsg\)\) \{\s*syncRelocateSubmitEnabled\(\);\s*return;/);
  assert.match(src, /allocationMode: "FIFO"/);
  assert.doesNotMatch(src, /body\.layerId/);
  assert.doesNotMatch(src, /layerId:/);
});

test("v71 12: predictor, tarjeta, capas y motor v70 permanecen intactos", () => {
  const rows = toRelocateBalanceSuggestions([cubeSuggestion(3)]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.layerId, "");
  assert.equal(rows[0]?.layerCount, 3);
  assert.equal(rows[0]?.availableQty, "3");
  assert.match(js, /allocationMode: "FIFO"/);
  assert.match(js, /Ver detalle/);
  assert.match(js, /capas internas/);
  assert.match(mutationSrc, /type === "RELOCATE"/);
  assert.match(sliceFunction(js, "applyRelocateBalanceSelection"), /layer\.value = ""/);
});

test("v71 13: referencia y notas opcionales no bloquean", () => {
  const pane = relocateHtml();
  assert.match(pane, /Referencia \(opcional\)/);
  assert.match(pane, /Notas \(opcional\)/);
  const complete = sliceFunction(js, "relocateFormIsComplete");
  assert.doesNotMatch(complete, /relocateReference/);
  assert.doesNotMatch(complete, /relocateNotes/);
  assertRelocateSubmitState(qaFifoDom(), true);
});

test("v71 14: recepción v67 permanece intacta", () => {
  const inbound = inboundHtml();
  assert.match(inbound, /id="inboundProductId"/);
  assert.match(inbound, /id="inboundUnitPriceMxn"/);
  assert.match(inbound, /Sin precio por ahora/);
  assert.match(inbound, /id="inboundAssignmentType"/);
  assert.match(inbound, /Free to Sale/);
});

test("v71 confirmación FIFO incluye SKU, destino, referencia y capas", () => {
  const msg = loadRelocateUi(qaFifoDom().document).buildRelocateConfirmMessage({
    qty: "2",
    sku: "00262A-00000B-000001",
    productName: "Antena",
    assignmentLabel: "Free to Sale",
    warehouse: "TULTITLAN24",
    fromLoc: "AN12-C",
    toLoc: "AN12-B",
    status: "OPERATIONS",
    layerCount: "3",
    reference: "QA-CANCELAR"
  });
  assert.match(msg, /00262A-00000B-000001/);
  assert.match(msg, /Antena/);
  assert.match(msg, /Free to Sale/);
  assert.match(msg, /2 piezas/);
  assert.match(msg, /AN12-C/);
  assert.match(msg, /AN12-B/);
  assert.match(msg, /OPERATIONS/);
  assert.match(msg, /QA-CANCELAR/);
  assert.match(msg, /Asignación FIFO sobre 3 capas/);
});

