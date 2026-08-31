import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { Prisma } from "@prisma/client";
import { LayerPriceError, parseLayerUnitPriceMxn } from "../src/modules/inventory/inventory-layer-price.service.js";
import {
  parseLayerQtyToValue,
  splitUnpricedInventoryLayerPrice
} from "../src/modules/inventory/inventory-layer-price-split.service.js";
import { calculateInventoryValuation } from "../src/modules/inventory/inventory-valuation.service.js";
import { canExposeEconomicValuation } from "../src/modules/inventory/inventory-economic-access.js";

const html = readFileSync(new URL("../public/dashboard.html", import.meta.url), "utf8");
const js = readFileSync(new URL("../public/dashboard.js", import.meta.url), "utf8");
const routes = readFileSync(new URL("../src/modules/inventory/inventory.routes.ts", import.meta.url), "utf8");
const splitSrc = readFileSync(
  new URL("../src/modules/inventory/inventory-layer-price-split.service.ts", import.meta.url),
  "utf8"
);
const priceSrc = readFileSync(
  new URL("../src/modules/inventory/inventory-layer-price.service.ts", import.meta.url),
  "utf8"
);

function d(n: string | number) {
  return new Prisma.Decimal(n);
}

function cloneDec(value: Prisma.Decimal | null) {
  return value == null ? null : new Prisma.Decimal(value.toString());
}

function makeCube(opts?: {
  qty?: string;
  reservedQty?: string;
  unitPriceMxn?: string | null;
  serials?: number;
  assignmentType?: "FREE_TO_SALE" | "PROJECT";
  projectId?: string | null;
  extraCubes?: Array<{ id: string; qty: string; unitPriceMxn: string | null }>;
}) {
  const qty = d(opts?.qty ?? "138");
  const reservedQty = d(opts?.reservedQty ?? "0");
  const layer = {
    id: "layer-source",
    inventoryId: "inv-fts",
    lotNumber: "L-138",
    qty,
    reservedQty,
    receivedAt: new Date("2026-06-22T00:00:00.000Z"),
    unitPriceMxn: opts?.unitPriceMxn == null ? null : d(opts.unitPriceMxn),
    unitPriceUsd: null,
    sourceReference: "IMPORT",
    sourceType: "MANUAL_IN",
    serialCount: opts?.serials ?? 0
  };
  const inventory = {
    id: "inv-fts",
    qty,
    reservedQty,
    assignmentType: opts?.assignmentType ?? "FREE_TO_SALE",
    assignmentKey: opts?.assignmentType === "PROJECT" ? `PROJECT:${opts.projectId}` : "FREE_TO_SALE:client-aviat",
    projectId: opts?.projectId ?? null,
    clientId: "client-aviat",
    product: { id: "prod-1", sku: "2223158-4", name: "Equipo", customerId: "cust-1" },
    location: { id: "loc-1", code: "AN14-F", warehouse: "TULTITLAN24" },
    project: opts?.projectId ? { id: opts.projectId, code: "P1", name: "Proyecto 1" } : null
  };
  const extraLayers = (opts?.extraCubes ?? []).map((cube, index) => ({
    id: cube.id,
    inventoryId: `inv-other-${index}`,
    lotNumber: "OTHER",
    qty: d(cube.qty),
    reservedQty: d(0),
    receivedAt: layer.receivedAt,
    unitPriceMxn: cube.unitPriceMxn == null ? null : d(cube.unitPriceMxn),
    unitPriceUsd: null,
    sourceReference: "OTHER",
    sourceType: "MANUAL_IN",
    serialCount: 0,
    inventoryQty: d(cube.qty)
  }));
  return { layer, inventory, extraLayers };
}

function snapshotLayers(layers: Array<{ qty: Prisma.Decimal; unitPriceMxn: Prisma.Decimal | null }>) {
  return layers
    .map((layer) => `${layer.qty.toString()}:${layer.unitPriceMxn?.toString() ?? "null"}`)
    .sort()
    .join("|");
}

function createSplitDb(seed: ReturnType<typeof makeCube>) {
  let committed = {
    inventory: {
      ...seed.inventory,
      qty: cloneDec(seed.inventory.qty)!,
      reservedQty: cloneDec(seed.inventory.reservedQty)!
    },
    layers: [
      {
        ...seed.layer,
        qty: cloneDec(seed.layer.qty)!,
        reservedQty: cloneDec(seed.layer.reservedQty)!,
        unitPriceMxn: cloneDec(seed.layer.unitPriceMxn),
        unitPriceUsd: cloneDec(seed.layer.unitPriceUsd)
      }
    ],
    extraLayers: seed.extraLayers.map((layer) => ({
      ...layer,
      qty: cloneDec(layer.qty)!,
      reservedQty: cloneDec(layer.reservedQty)!,
      unitPriceMxn: cloneDec(layer.unitPriceMxn)
    })),
    logs: [] as Array<Record<string, unknown>>,
    movements: 0,
    inventoryUpdates: 0,
    nextId: 1
  };

  function cloneState(state: typeof committed) {
    return {
      inventory: {
        ...state.inventory,
        qty: cloneDec(state.inventory.qty)!,
        reservedQty: cloneDec(state.inventory.reservedQty)!
      },
      layers: state.layers.map((layer) => ({
        ...layer,
        qty: cloneDec(layer.qty)!,
        reservedQty: cloneDec(layer.reservedQty)!,
        unitPriceMxn: cloneDec(layer.unitPriceMxn),
        unitPriceUsd: cloneDec(layer.unitPriceUsd)
      })),
      extraLayers: state.extraLayers.map((layer) => ({
        ...layer,
        qty: cloneDec(layer.qty)!,
        reservedQty: cloneDec(layer.reservedQty)!,
        unitPriceMxn: cloneDec(layer.unitPriceMxn)
      })),
      logs: [...state.logs],
      movements: state.movements,
      inventoryUpdates: state.inventoryUpdates,
      nextId: state.nextId
    };
  }

  function hydrate(layer: (typeof committed.layers)[number], inventory = committed.inventory) {
    return {
      ...layer,
      inventory: {
        ...inventory,
        product: seed.inventory.product,
        location: seed.inventory.location,
        project: seed.inventory.project
      },
      _count: { serials: seed.layer.serialCount }
    };
  }

  function makeTx(working: typeof committed) {
    return {
      $queryRaw: async () => [],
      inventoryMovement: {
        create: async () => {
          working.movements += 1;
          throw new Error("inventoryMovement.create forbidden");
        }
      },
      inventory: {
        update: async () => {
          working.inventoryUpdates += 1;
          throw new Error("inventory.update forbidden");
        },
        findUniqueOrThrow: async ({ where }: { where: { id: string } }) => {
          if (where.id !== working.inventory.id) throw new Error("inventory not found");
          return {
            qty: working.inventory.qty,
            reservedQty: working.inventory.reservedQty,
            assignmentType: working.inventory.assignmentType,
            assignmentKey: working.inventory.assignmentKey,
            projectId: working.inventory.projectId,
            clientId: working.inventory.clientId
          };
        }
      },
      inventoryLayer: {
        findUnique: async ({ where }: { where: { id: string } }) => {
          const found = working.layers.find((layer) => layer.id === where.id);
          return found ? hydrate(found, working.inventory) : null;
        },
        findUniqueOrThrow: async ({ where }: { where: { id: string } }) => {
          const found = working.layers.find((layer) => layer.id === where.id);
          if (!found) throw new Error("layer not found");
          return found;
        },
        update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
          const found = working.layers.find((layer) => layer.id === where.id);
          if (!found) throw new Error("layer not found");
          if (data.qty != null) found.qty = d(String(data.qty));
          if ("unitPriceMxn" in data) found.unitPriceMxn = data.unitPriceMxn == null ? null : d(String(data.unitPriceMxn));
          return { ...found, qty: cloneDec(found.qty)!, reservedQty: cloneDec(found.reservedQty)!, unitPriceMxn: cloneDec(found.unitPriceMxn) };
        },
        create: async ({ data }: { data: Record<string, unknown> }) => {
          const created = {
            id: `layer-valued-${working.nextId++}`,
            inventoryId: String(data.inventoryId),
            lotNumber: (data.lotNumber as string | null) ?? null,
            qty: d(String(data.qty)),
            reservedQty: d(String(data.reservedQty ?? 0)),
            receivedAt: (data.receivedAt as Date | null) ?? null,
            unitPriceMxn: data.unitPriceMxn == null ? null : d(String(data.unitPriceMxn)),
            unitPriceUsd: data.unitPriceUsd == null ? null : d(String(data.unitPriceUsd)),
            sourceReference: (data.sourceReference as string | null) ?? null,
            sourceType: (data.sourceType as string | null) ?? null,
            serialCount: 0
          };
          working.layers.push(created);
          return created;
        },
        findMany: async ({ where }: { where: { inventoryId: string; qty?: { gt: Prisma.Decimal } } }) => {
          return working.layers
            .filter((layer) => layer.inventoryId === where.inventoryId)
            .filter((layer) => (where.qty?.gt != null ? layer.qty.greaterThan(where.qty.gt) : true))
            .map((layer) => ({
              id: layer.id,
              lotNumber: layer.lotNumber,
              qty: layer.qty,
              reservedQty: layer.reservedQty,
              unitPriceMxn: layer.unitPriceMxn,
              unitPriceUsd: layer.unitPriceUsd
            }));
        }
      },
      activityLog: {
        create: async ({ data }: { data: Record<string, unknown> }) => {
          working.logs.push(data);
          return data;
        }
      }
    };
  }

  let chain = Promise.resolve();
  const db = {
    inventoryLayer: {
      findUnique: async ({ where }: { where: { id: string } }) => {
        const found = committed.layers.find((layer) => layer.id === where.id);
        return found ? hydrate(found, committed.inventory) : null;
      }
    },
    $transaction: async (fn: (tx: ReturnType<typeof makeTx>) => Promise<unknown>) => {
      const run = async () => {
        const working = cloneState(committed);
        try {
          const result = await fn(makeTx(working));
          committed = working;
          return result;
        } catch (error) {
          throw error;
        }
      };
      const next = chain.then(run, run);
      chain = next.then(
        () => undefined,
        () => undefined
      );
      return next;
    },
    getState: () => committed
  };
  return db;
}

test("parseo de cantidad vacía no equivale a 0 y rechaza inválidos", () => {
  assert.equal(Number(""), 0);
  assert.throws(() => parseLayerQtyToValue(""), (error: LayerPriceError) => error.code === "QTY_REQUIRED");
  assert.throws(() => parseLayerQtyToValue(null), (error: LayerPriceError) => error.code === "QTY_REQUIRED");
  assert.throws(() => parseLayerQtyToValue("   "), (error: LayerPriceError) => error.code === "QTY_REQUIRED");
  assert.throws(() => parseLayerQtyToValue("0"), (error: LayerPriceError) => error.code === "INVALID_QTY");
  assert.throws(() => parseLayerQtyToValue("-1"), (error: LayerPriceError) => error.code === "INVALID_QTY");
  assert.throws(() => parseLayerQtyToValue("1.23456"), (error: LayerPriceError) => error.code === "INVALID_QTY");
  assert.equal(parseLayerQtyToValue("40").toString(), "40");
  assert.equal(parseLayerUnitPriceMxn("0").toString(), "0");
  assert.throws(() => parseLayerUnitPriceMxn("-1"));
  assert.throws(() => parseLayerUnitPriceMxn("100.12345"));
});

test("138 null a 40 por 100 deja 98 null y el cubo en 138", async () => {
  const db = createSplitDb(makeCube());
  const result = (await splitUnpricedInventoryLayerPrice(
    { layerId: "layer-source", qtyToValue: "40", unitPriceMxn: "100", userId: "admin-1" },
    db as never
  )) as Awaited<ReturnType<typeof splitUnpricedInventoryLayerPrice>>;
  const state = db.getState();
  assert.equal(state.inventory.qty.toString(), "138");
  assert.equal(state.inventory.reservedQty.toString(), "0");
  assert.equal(state.inventory.assignmentType, "FREE_TO_SALE");
  assert.equal(state.inventory.projectId, null);
  assert.equal(state.layers.length, 2);
  assert.equal(snapshotLayers(state.layers), "40:100|98:null");
  assert.equal(result.split, true);
  assert.equal(result.qtyRemaining, "98");
  assert.equal(result.valuation.qtyValued, "40");
  assert.equal(result.valuation.qtyUnvalued, "98");
  assert.equal(result.valuation.totalValueMxn, "4000.00");
  assert.equal(result.valuation.avgUnitPriceMxn, "100.00");
  assert.equal(result.valuation.coveragePct, "28.99");
  assert.equal(state.movements, 0);
  assert.equal(state.inventoryUpdates, 0);
  assert.equal(state.logs[0]?.subtype, "LAYER_PRICE_SPLIT");
});

test("segunda valuación 30 a 115 deja 70 valuadas y 68 null", async () => {
  const db = createSplitDb(makeCube());
  await splitUnpricedInventoryLayerPrice(
    { layerId: "layer-source", qtyToValue: "40", unitPriceMxn: "100", userId: "admin-1" },
    db as never
  );
  const result = (await splitUnpricedInventoryLayerPrice(
    { layerId: "layer-source", qtyToValue: "30", unitPriceMxn: "115", userId: "admin-1" },
    db as never
  )) as Awaited<ReturnType<typeof splitUnpricedInventoryLayerPrice>>;
  const state = db.getState();
  assert.equal(state.inventory.qty.toString(), "138");
  assert.equal(state.layers.length, 3);
  assert.equal(snapshotLayers(state.layers), "30:115|40:100|68:null");
  const sum = state.layers.reduce((acc, layer) => acc.plus(layer.qty), d(0));
  assert.equal(sum.toString(), state.inventory.qty.toString());
  assert.equal(result.valuation.qtyValued, "70");
  assert.equal(result.valuation.qtyUnvalued, "68");
  assert.equal(result.valuation.totalValueMxn, "7450.00");
  assert.equal(result.valuation.avgUnitPriceMxn, "106.43");
  assert.equal(result.valuation.coveragePct, "50.72");
  assert.equal(result.valuation.status, "PARTIAL");
  assert.equal(state.extraLayers.length, 0);
});

test("precio 0 manual, capa completa, reservas, seriales y rechazos", async () => {
  const alreadyPriced = createSplitDb(makeCube({ unitPriceMxn: "50" }));
  await assert.rejects(
    () =>
      splitUnpricedInventoryLayerPrice(
        { layerId: "layer-source", qtyToValue: "40", unitPriceMxn: "100", userId: "admin-1" },
        alreadyPriced as never
      ),
    (error: LayerPriceError) => error.code === "LAYER_ALREADY_PRICED"
  );
  assert.equal(alreadyPriced.getState().layers.length, 1);
  assert.equal(alreadyPriced.getState().layers[0]?.qty.toString(), "138");

  const zeroDb = createSplitDb(makeCube({ qty: "10" }));
  const zero = (await splitUnpricedInventoryLayerPrice(
    { layerId: "layer-source", qtyToValue: "10", unitPriceMxn: "0", userId: "admin-1" },
    zeroDb as never
  )) as Awaited<ReturnType<typeof splitUnpricedInventoryLayerPrice>>;
  assert.equal(zero.split, false);
  assert.equal(zeroDb.getState().layers.length, 1);
  assert.equal(zeroDb.getState().layers[0]?.unitPriceMxn?.toString(), "0");
  assert.equal(zero.valuation.qtyValued, "10");
  assert.equal(zero.valuation.totalValueMxn, "0.00");
  assert.equal(zeroDb.getState().logs[0]?.subtype, "LAYER_PRICE_UPDATE");

  const reservedDb = createSplitDb(makeCube({ reservedQty: "10" }));
  const fullReserved = await splitUnpricedInventoryLayerPrice(
    { layerId: "layer-source", qtyToValue: "138", unitPriceMxn: "100", userId: "admin-1" },
    reservedDb as never
  );
  assert.equal((fullReserved as { split: boolean }).split, false);
  assert.equal(reservedDb.getState().layers[0]?.reservedQty.toString(), "10");
  assert.equal(reservedDb.getState().layers.length, 1);

  await assert.rejects(
    () =>
      splitUnpricedInventoryLayerPrice(
        { layerId: "layer-source", qtyToValue: "40", unitPriceMxn: "100", userId: "admin-1" },
        reservedDb as never
      ),
    (error: LayerPriceError) => error.code === "LAYER_ALREADY_PRICED"
  );

  const serialFull = createSplitDb(makeCube({ serials: 3 }));
  const serialFullResult = await splitUnpricedInventoryLayerPrice(
    { layerId: "layer-source", qtyToValue: "138", unitPriceMxn: "9", userId: "admin-1" },
    serialFull as never
  );
  assert.equal((serialFullResult as { split: boolean }).split, false);
  assert.equal(serialFull.getState().layers.length, 1);

  const serialPartial = createSplitDb(makeCube({ serials: 3 }));
  await assert.rejects(
    () =>
      splitUnpricedInventoryLayerPrice(
        { layerId: "layer-source", qtyToValue: "40", unitPriceMxn: "100", userId: "admin-1" },
        serialPartial as never
      ),
    (error: LayerPriceError) => error.code === "SERIAL_SELECTION_REQUIRED" && error.statusCode === 409
  );
  assert.equal(serialPartial.getState().layers.length, 1);
  assert.equal(serialPartial.getState().layers[0]?.qty.toString(), "138");

  const reservedPartial = createSplitDb(makeCube({ reservedQty: "100" }));
  await assert.rejects(
    () =>
      splitUnpricedInventoryLayerPrice(
        { layerId: "layer-source", qtyToValue: "40", unitPriceMxn: "100", userId: "admin-1" },
        reservedPartial as never
      ),
    (error: LayerPriceError) => error.code === "QTY_EXCEEDS_UNRESERVED"
  );
  await assert.rejects(
    () =>
      splitUnpricedInventoryLayerPrice(
        { layerId: "layer-source", qtyToValue: "200", unitPriceMxn: "100", userId: "admin-1" },
        reservedPartial as never
      ),
    (error: LayerPriceError) => error.code === "QTY_EXCEEDS_LAYER"
  );
});

test("concurrencia, rollback, auditoría y cubos ajenos intactos", async () => {
  const db = createSplitDb(
    makeCube({
      extraCubes: [{ id: "other-1", qty: "20", unitPriceMxn: null }]
    })
  );
  const [first, second] = await Promise.allSettled([
    splitUnpricedInventoryLayerPrice(
      { layerId: "layer-source", qtyToValue: "100", unitPriceMxn: "100", userId: "admin-1" },
      db as never
    ),
    splitUnpricedInventoryLayerPrice(
      { layerId: "layer-source", qtyToValue: "100", unitPriceMxn: "115", userId: "admin-2" },
      db as never
    )
  ]);
  const ok = [first, second].filter((item) => item.status === "fulfilled");
  const rejected = [first, second].filter((item) => item.status === "rejected");
  assert.equal(ok.length, 1);
  assert.equal(rejected.length, 1);
  assert.equal((rejected[0] as PromiseRejectedResult).reason.code, "LAYER_CHANGED");
  const state = db.getState();
  assert.equal(state.inventory.qty.toString(), "138");
  const valued = state.layers.filter((layer) => layer.unitPriceMxn != null).reduce((acc, layer) => acc.plus(layer.qty), d(0));
  assert.ok(valued.lessThanOrEqualTo(d(100)));
  assert.equal(state.layers.reduce((acc, layer) => acc.plus(layer.qty), d(0)).toString(), "138");
  assert.equal(state.extraLayers[0]?.qty.toString(), "20");
  assert.equal(state.extraLayers[0]?.unitPriceMxn, null);
  assert.equal(state.movements, 0);

  const log = state.logs[0] as { type: string; subtype: string; metadata: Record<string, unknown>; userId: string };
  assert.equal(log.type, "INVENTORY");
  assert.equal(log.subtype, "LAYER_PRICE_SPLIT");
  assert.equal(log.userId, "admin-1");
  assert.equal(log.metadata.inventoryId, "inv-fts");
  assert.equal(log.metadata.sourceLayerId, "layer-source");
  assert.ok(log.metadata.valuedLayerId);
  assert.equal(log.metadata.qtyBefore, "138");
  assert.equal(log.metadata.qtyValued, "100");
  assert.equal(log.metadata.qtyRemaining, "38");
  assert.equal(log.metadata.previousUnitPriceMxn, null);
  assert.equal(log.metadata.newUnitPriceMxn, "100");
  assert.equal(log.metadata.assignmentType, "FREE_TO_SALE");
  assert.equal(log.metadata.projectId, null);
  assert.equal(log.metadata.lotNumber, "L-138");

  const rollbackDb = createSplitDb(makeCube());
  rollbackDb.getState().inventory.qty = d("137");
  await assert.rejects(
    () =>
      splitUnpricedInventoryLayerPrice(
        { layerId: "layer-source", qtyToValue: "40", unitPriceMxn: "100", userId: "admin-1" },
        rollbackDb as never
      ),
    (error: LayerPriceError) => error.code === "LAYER_QTY_TOTAL_MISMATCH"
  );
  assert.equal(rollbackDb.getState().layers.length, 1);
  assert.equal(rollbackDb.getState().layers[0]?.qty.toString(), "138");
  assert.equal(rollbackDb.getState().layers[0]?.unitPriceMxn, null);
  assert.equal(rollbackDb.getState().logs.length, 0);
});

test("endpoint, roles, PATCH intacto y UI de valuación parcial", () => {
  assert.match(routes, /inventoryRouter\.patch\("\/layers\/:layerId\/price", requireRole\(\["ADMIN"\]\)/);
  assert.match(routes, /inventoryRouter\.post\("\/layers\/:layerId\/price-split", requireRole\(\["ADMIN"\]\)/);
  assert.match(routes, /updateInventoryLayerUnitPriceMxn/);
  assert.match(routes, /splitUnpricedInventoryLayerPrice/);
  assert.equal(canExposeEconomicValuation("ADMIN"), true);
  assert.equal(canExposeEconomicValuation("SUPERVISOR"), true);
  assert.equal(canExposeEconomicValuation("OPERATOR"), true);
  assert.equal(canExposeEconomicValuation("CLIENT"), true);
  const postIdx = routes.indexOf('inventoryRouter.post("/layers/:layerId/price-split"');
  const postBlock = routes.slice(postIdx, routes.indexOf("inventoryRouter.get(\"/products/:productId/valuation\"", postIdx));
  assert.doesNotMatch(postBlock, /OPERATOR|SUPERVISOR|CLIENT/);
  assert.doesNotMatch(priceSrc, /inventoryLayer\.create/);
  assert.doesNotMatch(splitSrc, /inventoryMovement\.create/);
  assert.doesNotMatch(splitSrc, /tx\.inventory\.update/);
  assert.match(splitSrc, /FOR UPDATE/);
  assert.match(splitSrc, /subtype = "LAYER_PRICE_SPLIT"/);
  assert.match(html, /id="priceQtyToValue"/);
  assert.match(html, /id="priceAvailableUnpriced"/);
  assert.match(html, /id="priceRemainingUnpriced"/);
  assert.match(html, /id="priceAddedValue"/);
  assert.match(html, /id="priceDestType"/);
  assert.match(html, /id="priceDestProject"/);
  assert.match(html, /Proyecto o asignación/);
  assert.match(js, /\/api\/inventory\/layers\/\$\{encodeURIComponent\(layer\.id\)\}\/price-split/);
  assert.match(js, /layerPriceSplitConfirmMessage/);
  assert.match(js, /loadStockStrip/);
  const confirmStart = js.indexOf("async function confirmLayerPriceUpdate");
  const confirmEnd = js.indexOf("function wireLayerPricePanel");
  const confirmBlock = js.slice(confirmStart, confirmEnd);
  assert.doesNotMatch(confirmBlock, /location\.reload/);
  assert.match(confirmBlock, /method: "POST"/);
  assert.match(js, /priceQtyToValue"\)\?\.value/);
  assert.match(js, /btn\.disabled = !\(layer\?\.id && parsed\.ok && qtyParsed\.ok && qtyFitsUnpricedLayer/);
  const qtyStart = js.indexOf("function parseLayerQtyToValueInput");
  const qtyEnd = js.indexOf("function decimal4ToScaled");
  assert.doesNotMatch(js.slice(qtyStart, qtyEnd), /Number\(/);
  const msg = js.slice(js.indexOf("function layerPriceSplitConfirmMessage"), js.indexOf("function decimal4ProductToMoney"));
  assert.match(msg, /Se asignará un precio unitario de \$\{priceLabel\} MXN a \$\{formatQty\(qtyRaw\)\} piezas/);
  assert.match(msg, /Quedarán \$\{formatQty\(remainingRaw\)\} piezas sin precio/);
  assert.match(msg, /El saldo total de \$\{formatQty\(totalRaw\)\} piezas no cambia/);
  assert.match(html, /dashboard\.js\?v=92/);
  assert.match(js, /logitec_active_nav/);
});
