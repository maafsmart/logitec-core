import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { Prisma } from "@prisma/client";
import { LayerPriceError, parseLayerUnitPriceMxn } from "../src/modules/inventory/inventory-layer-price.service.js";
import { parseLayerQtyToValue } from "../src/modules/inventory/inventory-layer-price-split.service.js";
import {
  parseValueAssignDestinationType,
  valueAndAssignUnpricedLayer
} from "../src/modules/inventory/inventory-layer-value-and-assign.service.js";
import { canExposeEconomicValuation } from "../src/modules/inventory/inventory-economic-access.js";
import { projectAssignmentKey } from "../src/modules/inventory/inventory-assignment.js";

const html = readFileSync(new URL("../public/dashboard.html", import.meta.url), "utf8");
const js = readFileSync(new URL("../public/dashboard.js", import.meta.url), "utf8");
const routes = readFileSync(new URL("../src/modules/inventory/inventory.routes.ts", import.meta.url), "utf8");
const priceSrc = readFileSync(
  new URL("../src/modules/inventory/inventory-layer-price.service.ts", import.meta.url),
  "utf8"
);
const splitSrc = readFileSync(
  new URL("../src/modules/inventory/inventory-layer-price-split.service.ts", import.meta.url),
  "utf8"
);
const valueSrc = readFileSync(
  new URL("../src/modules/inventory/inventory-layer-value-and-assign.service.ts", import.meta.url),
  "utf8"
);

function d(n: string | number) {
  return new Prisma.Decimal(n);
}

function cloneDec(value: Prisma.Decimal | null | undefined) {
  return value == null ? null : new Prisma.Decimal(value.toString());
}

function sqlParts(query: unknown, values: unknown[]) {
  const record = query as { strings?: string[]; values?: unknown[] } | string[] | string;
  if (record && typeof record === "object" && "strings" in record && Array.isArray(record.strings)) {
    return { text: record.strings.join(" "), values: record.values ?? values };
  }
  if (Array.isArray(query)) {
    return { text: query.join(" "), values };
  }
  return { text: String(query ?? ""), values };
}

function makeWorld(opts?: {
  qty?: string;
  reservedQty?: string;
  unitPriceMxn?: string | null;
  serials?: number;
  assignmentType?: "FREE_TO_SALE" | "PROJECT";
  projectId?: string | null;
  destExists?: boolean;
  destQtyMismatch?: boolean;
}) {
  const qty = d(opts?.qty ?? "138");
  const reservedQty = d(opts?.reservedQty ?? "0");
  const assignmentType = opts?.assignmentType ?? "FREE_TO_SALE";
  const projectId = opts?.projectId ?? null;
  const location = { id: "loc-1", code: "AN14-F", warehouse: "TULTITLAN24" };
  const product = {
    id: "prod-1",
    sku: "2223158-4",
    name: "Equipo",
    customerId: "cust-aviat",
    customer: { id: "cust-aviat", clientId: "client-aviat" }
  };
  const source = {
    id: "inv-fts",
    productId: product.id,
    locationId: location.id,
    status: "AVAILABLE",
    qty,
    reservedQty,
    assignmentType,
    assignmentKey: assignmentType === "PROJECT" && projectId ? projectAssignmentKey(projectId) : "FREE_TO_SALE",
    projectId,
    product,
    location,
    project: projectId ? { id: projectId, code: "ATT", name: "AT&T" } : null
  };
  const dest = opts?.destExists
    ? {
        id: "inv-att",
        productId: product.id,
        locationId: location.id,
        status: "AVAILABLE",
        qty: opts?.destQtyMismatch ? d("1") : d("0"),
        reservedQty: d("0"),
        assignmentType: "PROJECT" as const,
        assignmentKey: projectAssignmentKey("proj-att"),
        projectId: "proj-att",
        product,
        location,
        project: { id: "proj-att", code: "ATT", name: "AT&T" }
      }
    : null;
  return {
    source,
    dest,
    layer: {
      id: "layer-source",
      inventoryId: source.id,
      lotNumber: "L-138",
      qty,
      reservedQty,
      receivedAt: new Date("2026-06-22T00:00:00.000Z"),
      unitPriceMxn: opts?.unitPriceMxn == null ? null : d(opts.unitPriceMxn),
      unitPriceUsd: null,
      sourceReference: "IMPORT",
      sourceType: "MANUAL_IN",
      serialCount: opts?.serials ?? 0
    },
    projects: [
      { id: "proj-att", code: "ATT", name: "AT&T", active: true, clientId: "client-aviat" },
      { id: "proj-inactive", code: "OLD", name: "Inactivo", active: false, clientId: "client-aviat" },
      { id: "proj-other", code: "OTRO", name: "Otro cliente", active: true, clientId: "client-other" }
    ]
  };
}

function createValueAssignDb(seed: ReturnType<typeof makeWorld>) {
  let committed = {
    inventories: [
      {
        ...seed.source,
        qty: cloneDec(seed.source.qty)!,
        reservedQty: cloneDec(seed.source.reservedQty)!
      },
      ...(seed.dest
        ? [
            {
              ...seed.dest,
              qty: cloneDec(seed.dest.qty)!,
              reservedQty: cloneDec(seed.dest.reservedQty)!
            }
          ]
        : [])
    ],
    layers: [
      {
        ...seed.layer,
        qty: cloneDec(seed.layer.qty)!,
        reservedQty: cloneDec(seed.layer.reservedQty)!,
        unitPriceMxn: cloneDec(seed.layer.unitPriceMxn),
        unitPriceUsd: cloneDec(seed.layer.unitPriceUsd)
      }
    ],
    projects: seed.projects.map((project) => ({ ...project })),
    logs: [] as Array<Record<string, unknown>>,
    movements: [] as Array<Record<string, unknown>>,
    productProjects: [] as Array<{ productId: string; projectId: string }>,
    nextLayer: 1,
    nextInv: 1,
    nextMov: 1
  };

  function cloneState(state: typeof committed) {
    return {
      inventories: state.inventories.map((inventory) => ({
        ...inventory,
        qty: cloneDec(inventory.qty)!,
        reservedQty: cloneDec(inventory.reservedQty)!
      })),
      layers: state.layers.map((layer) => ({
        ...layer,
        qty: cloneDec(layer.qty)!,
        reservedQty: cloneDec(layer.reservedQty)!,
        unitPriceMxn: cloneDec(layer.unitPriceMxn),
        unitPriceUsd: cloneDec(layer.unitPriceUsd)
      })),
      projects: state.projects.map((project) => ({ ...project })),
      logs: [...state.logs],
      movements: state.movements.map((movement) => ({ ...movement })),
      productProjects: [...state.productProjects],
      nextLayer: state.nextLayer,
      nextInv: state.nextInv,
      nextMov: state.nextMov
    };
  }

  function hydrateLayer(layer: (typeof committed.layers)[number], inventories = committed.inventories) {
    const inventory = inventories.find((item) => item.id === layer.inventoryId) || committed.inventories[0]!;
    return {
      ...layer,
      inventory: {
        ...inventory,
        product: seed.source.product,
        location: seed.source.location,
        project: inventory.project
      },
      _count: { serials: seed.layer.serialCount }
    };
  }

  function makeTx(working: typeof committed) {
    return {
      $queryRaw: async (query: unknown, ...values: unknown[]) => {
        const { text, values: vals } = sqlParts(query, values);
        if (text.includes("FOR UPDATE")) return [];
        if (/UPDATE\s+"InventoryLayer"/.test(text) && text.includes("qty = qty -")) {
          const delta = d(String(vals[0]));
          const layerId = String(vals[1]);
          const layer = working.layers.find((item) => item.id === layerId);
          if (!layer || layer.qty.minus(layer.reservedQty).lessThan(delta) || layer.qty.lessThan(delta)) return [];
          layer.qty = layer.qty.minus(delta);
          return [{ id: layer.id, qty: layer.qty, reservedQty: layer.reservedQty }];
        }
        if (/UPDATE\s+"Inventory"/.test(text) && text.includes("qty = qty -")) {
          const delta = d(String(vals[0]));
          const id = String(vals[1]);
          const inventory = working.inventories.find((item) => item.id === id);
          if (
            !inventory ||
            inventory.qty.minus(inventory.reservedQty).lessThan(delta) ||
            inventory.qty.lessThan(delta)
          ) {
            return [];
          }
          inventory.qty = inventory.qty.minus(delta);
          return [{ id: inventory.id, qty: inventory.qty, reservedQty: inventory.reservedQty }];
        }
        if (/UPDATE\s+"Inventory"/.test(text) && text.includes("qty = qty +")) {
          const delta = d(String(vals[0]));
          const id = String(vals[1]);
          const inventory = working.inventories.find((item) => item.id === id);
          if (!inventory) return [];
          inventory.qty = inventory.qty.plus(delta);
          return [{ id: inventory.id, qty: inventory.qty }];
        }
        return [];
      },
      customer: {
        findUnique: async ({ where }: { where: { id: string } }) =>
          working.projects.find((project) => project.id === where.id) || null
      },
      productProject: {
        upsert: async ({
          where,
          create
        }: {
          where: { productId_projectId: { productId: string; projectId: string } };
          create: { productId: string; projectId: string };
        }) => {
          working.productProjects.push({
            productId: where.productId_projectId.productId,
            projectId: where.productId_projectId.projectId
          });
          return create;
        }
      },
      inventorySerial: {
        count: async ({ where }: { where: { inventoryLayerId: string } }) =>
          where.inventoryLayerId === seed.layer.id ? seed.layer.serialCount : 0
      },
      inventory: {
        findUnique: async ({ where }: { where: Record<string, unknown> }) => {
          if (typeof where.id === "string") {
            const found = working.inventories.find((item) => item.id === where.id);
            return found
              ? { ...found, product: seed.source.product, location: seed.source.location, project: found.project }
              : null;
          }
          const unique = where.productId_locationId_status_assignmentKey as
            | { productId: string; locationId: string; status: string; assignmentKey: string }
            | undefined;
          if (!unique) return null;
          const found = working.inventories.find(
            (item) =>
              item.productId === unique.productId &&
              item.locationId === unique.locationId &&
              item.status === unique.status &&
              item.assignmentKey === unique.assignmentKey
          );
          return found
            ? { ...found, product: seed.source.product, location: seed.source.location, project: found.project }
            : null;
        },
        findUniqueOrThrow: async ({ where }: { where: { id: string } }) => {
          const found = working.inventories.find((item) => item.id === where.id);
          if (!found) throw new Error("inventory not found");
          return { ...found, product: seed.source.product, location: seed.source.location };
        },
        create: async ({ data }: { data: Record<string, unknown> }) => {
          const created = {
            id: `inv-new-${working.nextInv++}`,
            productId: String(data.productId),
            locationId: String(data.locationId),
            status: String(data.status),
            qty: d(String(data.qty ?? 0)),
            reservedQty: d(String(data.reservedQty ?? 0)),
            assignmentType: data.assignmentType as "PROJECT" | "FREE_TO_SALE",
            assignmentKey: String(data.assignmentKey),
            projectId: (data.projectId as string | null) ?? null,
            product: seed.source.product,
            location: seed.source.location,
            project:
              data.projectId === "proj-att" ? { id: "proj-att", code: "ATT", name: "AT&T" } : null
          };
          working.inventories.push(created);
          return created;
        },
        update: async () => {
          throw new Error("inventory.update forbidden");
        }
      },
      inventoryLayer: {
        findUnique: async ({ where }: { where: { id: string } }) => {
          const found = working.layers.find((layer) => layer.id === where.id);
          return found ? hydrateLayer(found, working.inventories) : null;
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
          if ("unitPriceMxn" in data) {
            found.unitPriceMxn = data.unitPriceMxn == null ? null : d(String(data.unitPriceMxn));
          }
          return { ...found, qty: cloneDec(found.qty)!, reservedQty: cloneDec(found.reservedQty)! };
        },
        create: async ({ data }: { data: Record<string, unknown> }) => {
          const created = {
            id: `layer-valued-${working.nextLayer++}`,
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
        findMany: async ({
          where
        }: {
          where: { inventoryId: string; qty?: { gt: Prisma.Decimal | number } };
        }) =>
          working.layers
            .filter((layer) => layer.inventoryId === where.inventoryId)
            .filter((layer) => (where.qty?.gt != null ? layer.qty.greaterThan(where.qty.gt) : true))
            .map((layer) => ({
              id: layer.id,
              lotNumber: layer.lotNumber,
              qty: layer.qty,
              reservedQty: layer.reservedQty,
              unitPriceMxn: layer.unitPriceMxn,
              unitPriceUsd: layer.unitPriceUsd
            }))
      },
      inventoryMovement: {
        create: async ({ data }: { data: Record<string, unknown> }) => {
          const created = {
            id: `mov-${working.nextMov++}`,
            ...data,
            type: data.type,
            movementType: data.movementType
          };
          working.movements.push(created);
          return created;
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
        return found ? hydrateLayer(found, committed.inventories) : null;
      }
    },
    $transaction: async (fn: (tx: ReturnType<typeof makeTx>) => Promise<unknown>) => {
      const run = async () => {
        const working = cloneState(committed);
        const result = await fn(makeTx(working));
        committed = working;
        return result;
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

test("cantidad vacía no es 0 y destino KEEP reutiliza v64 sin movimientos", async () => {
  assert.equal(Number(""), 0);
  assert.throws(() => parseLayerQtyToValue(""), (error: LayerPriceError) => error.code === "QTY_REQUIRED");
  assert.throws(() => parseValueAssignDestinationType("NOPE"));
  assert.equal(parseLayerUnitPriceMxn("0").toString(), "0");
  const db = createValueAssignDb(makeWorld());
  const result = (await valueAndAssignUnpricedLayer(
    {
      layerId: "layer-source",
      qtyToValue: "40",
      unitPriceMxn: "100",
      destinationType: "KEEP",
      userId: "admin-1"
    },
    db as never
  )) as Awaited<ReturnType<typeof valueAndAssignUnpricedLayer>>;
  const state = db.getState();
  assert.equal(result.assignmentChanged, false);
  assert.equal(result.movementId, null);
  assert.equal(state.movements.length, 0);
  assert.equal(state.inventories[0]?.qty.toString(), "138");
  assert.equal(state.layers.length, 2);
  assert.equal(state.logs[0]?.subtype, "LAYER_PRICE_SPLIT");
});

test("destino igual al actual no transfiere y FREE_TO_SALE sobre FTS es KEEP", async () => {
  const db = createValueAssignDb(makeWorld());
  const result = (await valueAndAssignUnpricedLayer(
    {
      layerId: "layer-source",
      qtyToValue: "40",
      unitPriceMxn: "0",
      destinationType: "FREE_TO_SALE",
      userId: "admin-1"
    },
    db as never
  )) as Awaited<ReturnType<typeof valueAndAssignUnpricedLayer>>;
  assert.equal(result.assignmentChanged, false);
  assert.equal(db.getState().movements.length, 0);
  assert.equal(db.getState().inventories[0]?.qty.toString(), "138");
  assert.equal(
    db.getState().layers.find((layer) => layer.unitPriceMxn != null)?.unitPriceMxn?.toString(),
    "0"
  );
});

test("138 FTS null a 40 proyecto AT&T por 100 deja 98 null y total 138", async () => {
  const db = createValueAssignDb(makeWorld());
  const result = (await valueAndAssignUnpricedLayer(
    {
      layerId: "layer-source",
      qtyToValue: "40",
      unitPriceMxn: "100",
      destinationType: "PROJECT",
      projectId: "proj-att",
      userId: "admin-1"
    },
    db as never
  )) as Awaited<ReturnType<typeof valueAndAssignUnpricedLayer>>;
  const state = db.getState();
  const source = state.inventories.find((item) => item.id === "inv-fts")!;
  const dest = state.inventories.find((item) => item.assignmentKey === projectAssignmentKey("proj-att"))!;
  const sourceLayers = state.layers.filter((layer) => layer.inventoryId === source.id);
  const destLayers = state.layers.filter((layer) => layer.inventoryId === dest.id);
  assert.equal(source.qty.toString(), "98");
  assert.equal(source.assignmentType, "FREE_TO_SALE");
  assert.equal(sourceLayers.length, 1);
  assert.equal(sourceLayers[0]?.qty.toString(), "98");
  assert.equal(sourceLayers[0]?.unitPriceMxn, null);
  assert.equal(dest.qty.toString(), "40");
  assert.equal(dest.assignmentType, "PROJECT");
  assert.equal(dest.projectId, "proj-att");
  assert.equal(dest.locationId, "loc-1");
  assert.equal(dest.status, "AVAILABLE");
  assert.equal(dest.productId, "prod-1");
  assert.equal(destLayers.length, 1);
  assert.equal(destLayers[0]?.qty.toString(), "40");
  assert.equal(destLayers[0]?.reservedQty.toString(), "0");
  assert.equal(destLayers[0]?.unitPriceMxn?.toString(), "100");
  assert.equal(destLayers[0]?.lotNumber, "L-138");
  assert.equal(source.qty.plus(dest.qty).toString(), "138");
  assert.equal(result.valuation.totalValueMxn, "4000.00");
  assert.equal(result.valuation.qtyValued, "40");
  assert.equal(state.movements.length, 1);
  assert.equal(state.movements[0]?.type, "ASSIGNMENT_TRANSFER");
  assert.equal(state.movements[0]?.movementType, "ASSIGNMENT_TRANSFER");
  assert.doesNotMatch(String(state.movements[0]?.type), /IN|OUT|RELOCATE|ADJUST/);
  assert.equal(state.logs[0]?.subtype, "LAYER_PRICE_SPLIT_ASSIGNMENT");
  assert.equal((state.logs[0]?.metadata as { movementId: string }).movementId, state.movements[0]?.id);
  assert.equal((state.logs[0]?.metadata as { qtyRemaining: string }).qtyRemaining, "98");
  assert.equal(result.movementId, state.movements[0]?.id);
  assert.equal(result.assignmentChanged, true);
});

test("proyectos inválidos, reservas, seriales, concurrencia y rollback", async () => {
  await assert.rejects(
    () =>
      valueAndAssignUnpricedLayer(
        {
          layerId: "layer-source",
          qtyToValue: "40",
          unitPriceMxn: "100",
          destinationType: "PROJECT",
          projectId: "missing",
          userId: "admin-1"
        },
        createValueAssignDb(makeWorld()) as never
      ),
    (error: LayerPriceError) => error.code === "PROJECT_NOT_FOUND"
  );
  await assert.rejects(
    () =>
      valueAndAssignUnpricedLayer(
        {
          layerId: "layer-source",
          qtyToValue: "40",
          unitPriceMxn: "100",
          destinationType: "PROJECT",
          projectId: "proj-inactive",
          userId: "admin-1"
        },
        createValueAssignDb(makeWorld()) as never
      ),
    (error: LayerPriceError) => error.code === "PROJECT_INACTIVE"
  );
  await assert.rejects(
    () =>
      valueAndAssignUnpricedLayer(
        {
          layerId: "layer-source",
          qtyToValue: "40",
          unitPriceMxn: "100",
          destinationType: "PROJECT",
          projectId: "proj-other",
          userId: "admin-1"
        },
        createValueAssignDb(makeWorld()) as never
      ),
    (error: LayerPriceError) => error.code === "PROJECT_WRONG_CLIENT"
  );
  await assert.rejects(
    () =>
      valueAndAssignUnpricedLayer(
        {
          layerId: "layer-source",
          qtyToValue: "40",
          unitPriceMxn: "100",
          destinationType: "PROJECT",
          projectId: "proj-att",
          userId: "admin-1"
        },
        createValueAssignDb(makeWorld({ reservedQty: "100" })) as never
      ),
    (error: LayerPriceError) => error.code === "QTY_EXCEEDS_UNRESERVED"
  );
  await assert.rejects(
    () =>
      valueAndAssignUnpricedLayer(
        {
          layerId: "layer-source",
          qtyToValue: "40",
          unitPriceMxn: "100",
          destinationType: "PROJECT",
          projectId: "proj-att",
          userId: "admin-1"
        },
        createValueAssignDb(makeWorld({ serials: 2 })) as never
      ),
    (error: LayerPriceError) => error.code === "SERIAL_SELECTION_REQUIRED" && error.statusCode === 409
  );

  const concurrent = createValueAssignDb(makeWorld());
  const [first, second] = await Promise.allSettled([
    valueAndAssignUnpricedLayer(
      {
        layerId: "layer-source",
        qtyToValue: "100",
        unitPriceMxn: "100",
        destinationType: "PROJECT",
        projectId: "proj-att",
        userId: "admin-1"
      },
      concurrent as never
    ),
    valueAndAssignUnpricedLayer(
      {
        layerId: "layer-source",
        qtyToValue: "100",
        unitPriceMxn: "115",
        destinationType: "PROJECT",
        projectId: "proj-att",
        userId: "admin-2"
      },
      concurrent as never
    )
  ]);
  assert.equal([first, second].filter((item) => item.status === "fulfilled").length, 1);
  assert.equal(( [first, second].find((item) => item.status === "rejected") as PromiseRejectedResult).reason.code, "LAYER_CHANGED");
  const concurrentState = concurrent.getState();
  const destQty = concurrentState.inventories
    .filter((item) => item.assignmentKey === projectAssignmentKey("proj-att"))
    .reduce((acc, item) => acc.plus(item.qty), d(0));
  assert.ok(destQty.lessThanOrEqualTo(d(100)));
  assert.equal(
    concurrentState.inventories.reduce((acc, item) => acc.plus(item.qty), d(0)).toString(),
    "138"
  );
  assert.equal(concurrentState.movements.length, 1);

  const rollback = createValueAssignDb(makeWorld({ destExists: true, destQtyMismatch: true }));
  await assert.rejects(
    () =>
      valueAndAssignUnpricedLayer(
        {
          layerId: "layer-source",
          qtyToValue: "40",
          unitPriceMxn: "100",
          destinationType: "PROJECT",
          projectId: "proj-att",
          userId: "admin-1"
        },
        rollback as never
      ),
    (error: LayerPriceError) => error.code === "LAYER_QTY_TOTAL_MISMATCH"
  );
  const rolled = rollback.getState();
  assert.equal(rolled.inventories.find((item) => item.id === "inv-fts")?.qty.toString(), "138");
  assert.equal(rolled.layers.length, 1);
  assert.equal(rolled.layers[0]?.unitPriceMxn, null);
  assert.equal(rolled.movements.length, 0);
  assert.equal(rolled.logs.length, 0);
});

test("endpoint, PATCH y price-split intactos, roles y UI de destino", () => {
  assert.match(routes, /inventoryRouter\.patch\("\/layers\/:layerId\/price", requireRole\(\["ADMIN"\]\)/);
  assert.match(routes, /inventoryRouter\.post\("\/layers\/:layerId\/price-split", requireRole\(\["ADMIN"\]\)/);
  assert.match(routes, /inventoryRouter\.post\("\/layers\/:layerId\/value-and-assign", requireRole\(\["ADMIN"\]\)/);
  assert.match(routes, /valueAndAssignUnpricedLayer/);
  assert.equal(canExposeEconomicValuation("ADMIN"), true);
  assert.equal(canExposeEconomicValuation("SUPERVISOR"), false);
  assert.equal(canExposeEconomicValuation("OPERATOR"), false);
  assert.equal(canExposeEconomicValuation("CLIENT"), false);
  const postIdx = routes.indexOf('inventoryRouter.post("/layers/:layerId/value-and-assign"');
  const postBlock = routes.slice(
    postIdx,
    routes.indexOf("inventoryRouter.get(\"/products/:productId/valuation\"", postIdx)
  );
  assert.doesNotMatch(postBlock, /OPERATOR|SUPERVISOR|CLIENT/);
  assert.doesNotMatch(priceSrc, /value-and-assign/);
  assert.doesNotMatch(splitSrc, /value-and-assign/);
  assert.match(valueSrc, /LAYER_PRICE_SPLIT_ASSIGNMENT/);
  assert.match(valueSrc, /ASSIGNMENT_TRANSFER/);
  assert.match(valueSrc, /splitUnpricedInventoryLayerPrice/);
  assert.match(valueSrc, /buildAssignment/);
  assert.match(valueSrc, /ensureCanonicalProductProject/);
  assert.match(html, /id="priceDestType"/);
  assert.match(html, /Conservar asignación actual/);
  assert.match(html, /id="priceDestProject"/);
  assert.match(html, /dashboard\.js\?v=68/);
  assert.match(js, /\/api\/inventory\/layers\/\$\{encodeURIComponent\(layer\.id\)\}\/price-split/);
  assert.match(js, /\/api\/inventory\/layers\/\$\{encodeURIComponent\(layer\.id\)\}\/value-and-assign/);
  assert.match(js, /layerValueAssignConfirmMessage/);
  assert.match(js, /loadStockStrip/);
  const confirmStart = js.indexOf("async function confirmLayerPriceUpdate");
  const confirmEnd = js.indexOf("function wireLayerPricePanel");
  const confirmBlock = js.slice(confirmStart, confirmEnd);
  assert.doesNotMatch(confirmBlock, /location\.reload/);
  assert.match(js, /destType !== "PROJECT" \|\| Boolean\(document\.getElementById\("priceDestProject"\)/);
  const qtyStart = js.indexOf("function parseLayerQtyToValueInput");
  const qtyEnd = js.indexOf("function decimal4ToScaled");
  assert.doesNotMatch(js.slice(qtyStart, qtyEnd), /Number\(/);
  const msg = js.slice(js.indexOf("function layerValueAssignConfirmMessage"), js.indexOf("function decimal4ProductToMoney"));
  assert.match(msg, /Se valuarán \$\{formatQty\(qtyRaw\)\} piezas a \$\{priceLabel\} MXN/);
  assert.match(msg, /al proyecto \$\{toLabel\}/);
  assert.match(msg, /Quedarán \$\{formatQty\(remainingRaw\)\} piezas en \$\{remainingLabel\}/);
  assert.match(msg, /El total físico de \$\{formatQty\(totalRaw\)\} piezas no cambia/);
  assert.match(js, /logitec_active_nav/);
});
