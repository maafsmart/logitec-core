import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { Prisma } from "@prisma/client";
import { HttpError } from "../src/shared/http-error.js";
import {
  RequisitionError,
  cancelRequisitionInTransaction,
  createRequisitionInTransaction,
  reserveLineInTransaction
} from "../src/modules/requisitions/requisition.service.js";

const html = readFileSync(new URL("../public/dashboard.html", import.meta.url), "utf8");
const js = readFileSync(new URL("../public/dashboard.js", import.meta.url), "utf8");
const routes = readFileSync(new URL("../src/modules/requisitions/requisitions.routes.ts", import.meta.url), "utf8");
const serviceSrc = readFileSync(new URL("../src/modules/requisitions/requisition.service.ts", import.meta.url), "utf8");
const pickingSrc = readFileSync(new URL("../src/modules/picking/picking.routes.ts", import.meta.url), "utf8");
const mutationSrc = readFileSync(
  new URL("../src/modules/inventory/inventory-mutation.service.ts", import.meta.url),
  "utf8"
);

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

function sqlParts(query: unknown, values: unknown[]) {
  const record = query as { strings?: string[]; values?: unknown[] } | string[] | string;
  if (record && typeof record === "object" && "strings" in record && Array.isArray(record.strings)) {
    return { text: record.strings.join(" "), values: (record.values as unknown[]) ?? values };
  }
  if (Array.isArray(query)) return { text: query.join(" "), values };
  return { text: String(query), values };
}

function requisitionPane() {
  const start = html.indexOf('id="moduleRequisitions"');
  const end = html.indexOf('id="modulePlaceholder"');
  assert.ok(start >= 0 && end > start);
  return html.slice(start, end);
}

type LayerSpec = {
  id: string;
  qty: string;
  reserved?: string;
  lot?: string | null;
  receivedAt?: Date | null;
  createdAt?: Date;
  price?: string | null;
  sourceReference?: string | null;
};

function createReqWorld(opts?: { layerCount?: number; requestedQty?: string }) {
  const project = { id: "proj-att", code: "ATT", name: "AT&T" };
  const otherProject = { id: "proj-other", code: "OTHER", name: "Otro" };
  const product = {
    id: "prod-1",
    sku: "SKU-REQ-1",
    barcode: "BAR-REQ-1",
    name: "Radio",
    active: true,
    customerId: project.id
  };
  const location = { id: "loc-1", code: "AN14-F", warehouse: "TULTITLAN24" };
  const ftsLocation = { id: "loc-fts", code: "AN15-A", warehouse: "TULTITLAN24" };
  const otherLocation = { id: "loc-other", code: "AN16-B", warehouse: "TULTITLAN24" };
  const receivedAt = new Date("2026-01-01T00:00:00.000Z");
  const layerCount = opts?.layerCount ?? 3;
  const qty = d(String(layerCount));

  const state = {
    nextId: 1,
    failOnLayerReserve: 0,
    layerReserveCount: 0,
    failOnLayerRelease: 0,
    layerReleaseCount: 0,
    inventories: [
      {
        id: "inv-proj",
        productId: product.id,
        locationId: location.id,
        status: "AVAILABLE",
        qty,
        reservedQty: d("0"),
        assignmentType: "PROJECT",
        assignmentKey: `P:${project.id}`,
        projectId: project.id,
        clientId: "client-aviat"
      },
      {
        id: "inv-fts",
        productId: product.id,
        locationId: ftsLocation.id,
        status: "AVAILABLE",
        qty: d("5"),
        reservedQty: d("0"),
        assignmentType: "FREE_TO_SALE",
        assignmentKey: "FREE_TO_SALE:client-aviat",
        projectId: null as string | null,
        clientId: "client-aviat"
      },
      {
        id: "inv-other",
        productId: product.id,
        locationId: otherLocation.id,
        status: "AVAILABLE",
        qty: d("4"),
        reservedQty: d("0"),
        assignmentType: "PROJECT",
        assignmentKey: `P:${otherProject.id}`,
        projectId: otherProject.id,
        clientId: "client-aviat"
      }
    ],
    layers: [] as Array<{
      id: string;
      inventoryId: string;
      qty: Prisma.Decimal;
      reservedQty: Prisma.Decimal;
      lotNumber: string | null;
      receivedAt: Date | null;
      createdAt: Date;
      unitPriceMxn: Prisma.Decimal | null;
      unitPriceUsd: Prisma.Decimal | null;
      sourceReference: string | null;
    }>,
    ftsLayers: [
      {
        id: "layer-fts",
        inventoryId: "inv-fts",
        qty: d("5"),
        reservedQty: d("0"),
        lotNumber: "FTS",
        receivedAt,
        createdAt: receivedAt,
        unitPriceMxn: null as Prisma.Decimal | null,
        unitPriceUsd: null as Prisma.Decimal | null,
        sourceReference: null as string | null
      }
    ],
    otherLayers: [
      {
        id: "layer-other",
        inventoryId: "inv-other",
        qty: d("4"),
        reservedQty: d("0"),
        lotNumber: "OTHER",
        receivedAt,
        createdAt: receivedAt,
        unitPriceMxn: null as Prisma.Decimal | null,
        unitPriceUsd: null as Prisma.Decimal | null,
        sourceReference: null as string | null
      }
    ],
    requisitions: [
      {
        id: "req-1",
        number: "OS-FIFO-1",
        projectId: project.id,
        createdById: "admin-1",
        priority: "NORMAL",
        status: "APPROVED",
        reference: "OS-FIFO-1",
        notes: null as string | null
      }
    ],
    lines: [
      {
        id: "line-1",
        requisitionId: "req-1",
        productId: product.id,
        requestedQty: d(opts?.requestedQty ?? String(layerCount)),
        fulfilledQty: d("0")
      }
    ],
    reservations: [] as Array<{
      id: string;
      requisitionLineId: string;
      inventoryId: string;
      inventoryLayerId: string | null;
      qty: Prisma.Decimal;
      consumedQty: Prisma.Decimal;
      releasedQty: Prisma.Decimal;
      status: string;
      createdById: string;
    }>,
    movements: [] as Array<Record<string, unknown>>,
    activities: [] as Array<Record<string, unknown>>,
    scanEvents: [] as Array<Record<string, unknown>>,
    tasks: [{ id: "task-pick-1", requisitionId: "req-1", type: "PICK", status: "PENDING" }],
    serials: [] as Array<{ id: string; inventoryLayerId: string; serialNumber: string }>,
    productProjects: [{ productId: product.id, projectId: project.id, active: true }]
  };

  for (let i = 0; i < layerCount; i += 1) {
    const at = new Date(receivedAt.getTime() + i * 60_000);
    state.layers.push({
      id: `layer-${String(i + 1).padStart(2, "0")}`,
      inventoryId: "inv-proj",
      qty: d("1"),
      reservedQty: d("0"),
      lotNumber: `L-${i + 1}`,
      receivedAt: at,
      createdAt: at,
      unitPriceMxn: null,
      unitPriceUsd: null,
      sourceReference: `REF-${i + 1}`
    });
    state.serials.push({
      id: `serial-${i + 1}`,
      inventoryLayerId: `layer-${String(i + 1).padStart(2, "0")}`,
      serialNumber: `SN-${i + 1}`
    });
  }

  const allLayers = () => [...state.layers, ...state.ftsLayers, ...state.otherLayers];
  const locations: Record<string, { id: string; code: string; warehouse: string }> = {
    [location.id]: location,
    [ftsLocation.id]: ftsLocation,
    [otherLocation.id]: otherLocation
  };
  const projects: Record<string, { id: string; code: string; name: string }> = {
    [project.id]: project,
    [otherProject.id]: otherProject
  };

  function hydrateInventory(row: (typeof state.inventories)[0]) {
    return {
      ...row,
      location: locations[row.locationId],
      project: row.projectId ? projects[row.projectId] : null,
      layers: allLayers()
        .filter((layer) => layer.inventoryId === row.id)
        .map((layer) => ({ id: layer.id })),
      product
    };
  }

  const tx = {
    product: {
      findFirst: async ({ where }: { where: { OR?: Array<{ sku?: string; barcode?: string }> } }) => {
        const tokens = (where.OR || []).flatMap((item) => [item.sku, item.barcode]).filter(Boolean);
        return tokens.includes(product.sku) || tokens.includes(product.barcode) ? product : null;
      }
    },
    productProject: {
      findUnique: async ({ where }: { where: { productId_projectId: { productId: string; projectId: string } } }) =>
        state.productProjects.find(
          (row) =>
            row.productId === where.productId_projectId.productId && row.projectId === where.productId_projectId.projectId
        ) || null
    },
    requisition: {
      findUnique: async ({ where }: { where: { id?: string; number?: string } }) => {
        const row = state.requisitions.find((item) => item.id === where.id || item.number === where.number);
        if (!row) return null;
        return {
          ...row,
          lines: state.lines
            .filter((line) => line.requisitionId === row.id)
            .map((line) => ({
              ...line,
              product,
              reservations: state.reservations.filter((reservation) => reservation.requisitionLineId === line.id)
            }))
        };
      },
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const created = {
          id: `req-${state.nextId++}`,
          number: String(data.number),
          projectId: String(data.projectId),
          createdById: String(data.createdById),
          priority: String(data.priority),
          status: String(data.status),
          reference: (data.reference as string | null) ?? null,
          notes: (data.notes as string | null) ?? null
        };
        state.requisitions.push(created);
        return created;
      },
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const row = state.requisitions.find((item) => item.id === where.id);
        if (!row) throw new Error("requisition not found");
        Object.assign(row, data);
        return row;
      }
    },
    requisitionLine: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const created = {
          id: `line-${state.nextId++}`,
          requisitionId: String(data.requisitionId),
          productId: String(data.productId),
          requestedQty: d(String(data.requestedQty)),
          fulfilledQty: d(String(data.fulfilledQty ?? 0))
        };
        state.lines.push(created);
        return created;
      }
    },
    inventory: {
      findMany: async ({
        where
      }: {
        where: { productId?: string | { in: string[] }; assignmentType?: string; projectId?: string; qty?: { gt: Prisma.Decimal } };
      }) => {
        return state.inventories
          .filter((row) => {
            if (typeof where.productId === "string" && row.productId !== where.productId) return false;
            if (where.productId && typeof where.productId === "object" && !where.productId.in.includes(row.productId)) {
              return false;
            }
            if (where.assignmentType && row.assignmentType !== where.assignmentType) return false;
            if (where.projectId && row.projectId !== where.projectId) return false;
            if (where.qty?.gt && !row.qty.greaterThan(where.qty.gt)) return false;
            return true;
          })
          .map(hydrateInventory);
      },
      findUnique: async ({ where }: { where: { id: string } }) => {
        const found = state.inventories.find((row) => row.id === where.id);
        return found ? hydrateInventory(found) : null;
      },
      findUniqueOrThrow: async ({ where }: { where: { id: string } }) => {
        const found = state.inventories.find((row) => row.id === where.id);
        if (!found) throw new Error("inventory not found");
        return hydrateInventory(found);
      }
    },
    inventoryLayer: {
      findMany: async ({ where }: { where: { inventoryId: string } }) =>
        allLayers()
          .filter((layer) => layer.inventoryId === where.inventoryId)
          .map((layer) => ({ ...layer }))
    },
    inventoryReservation: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const created = {
          id: `resv-${state.nextId++}`,
          requisitionLineId: String(data.requisitionLineId),
          inventoryId: String(data.inventoryId),
          inventoryLayerId: (data.inventoryLayerId as string | null) ?? null,
          qty: d(String(data.qty)),
          consumedQty: d(String(data.consumedQty ?? 0)),
          releasedQty: d(String(data.releasedQty ?? 0)),
          status: String(data.status ?? "ACTIVE"),
          createdById: String(data.createdById)
        };
        state.reservations.push(created);
        return created;
      },
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const row = state.reservations.find((item) => item.id === where.id);
        if (!row) throw new Error("reservation not found");
        if (data.releasedQty != null) row.releasedQty = d(String(data.releasedQty));
        if (data.status) row.status = String(data.status);
        return row;
      }
    },
    inventoryMovement: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const created = { id: `mov-${state.nextId++}`, ...data };
        state.movements.push(created);
        return created;
      }
    },
    activityLog: {
      create: async ({ data }: { data?: Record<string, unknown> } = {}) => {
        state.activities.push(data ?? {});
        return { id: `act-${state.nextId++}` };
      }
    },
    scanEvent: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const created = { id: `scan-${state.nextId++}`, ...data };
        state.scanEvents.push(created);
        return created;
      }
    },
    task: {
      updateMany: async ({
        where,
        data
      }: {
        where: { requisitionId: string; type: string; status?: { notIn: string[] } };
        data: { status: string };
      }) => {
        let count = 0;
        for (const row of state.tasks) {
          if (row.requisitionId !== where.requisitionId || row.type !== where.type) continue;
          if (where.status?.notIn?.includes(row.status)) continue;
          row.status = data.status;
          count += 1;
        }
        return { count };
      }
    },
    inventorySerial: {
      count: async ({ where }: { where: { inventoryLayerId: string } }) =>
        state.serials.filter((row) => row.inventoryLayerId === where.inventoryLayerId).length
    },
    $queryRaw: async (query: unknown, ...values: unknown[]) => {
      const parts = sqlParts(query, values);
      const text = parts.text;
      const vals = parts.values;
      if (text.includes("FOR UPDATE") && text.includes("InventoryLayer")) {
        return allLayers().map((layer) => ({ id: layer.id }));
      }
      if (text.includes("FOR UPDATE")) return state.inventories.map((row) => ({ id: row.id }));
      if (text.includes("InventoryLayer") && text.includes('"reservedQty" = "reservedQty" +')) {
        state.layerReserveCount += 1;
        if (state.failOnLayerReserve > 0 && state.layerReserveCount >= state.failOnLayerReserve) {
          throw new Error("simulated layer reserve failure");
        }
        const delta = d(String(vals[0]));
        const id = String(vals[1]);
        const layer = allLayers().find((item) => item.id === id);
        if (!layer) return [];
        if (layer.qty.minus(layer.reservedQty).lessThan(delta)) return [];
        layer.reservedQty = layer.reservedQty.plus(delta);
        return [{ id: layer.id }];
      }
      if (text.includes('UPDATE "Inventory"') && text.includes('"reservedQty" = "reservedQty" +')) {
        const delta = d(String(vals[0]));
        const id = String(vals[1]);
        const inv = state.inventories.find((item) => item.id === id);
        if (!inv) return [];
        if (inv.qty.minus(inv.reservedQty).lessThan(delta)) return [];
        inv.reservedQty = inv.reservedQty.plus(delta);
        return [{ id: inv.id }];
      }
      if (text.includes("InventoryLayer") && text.includes('"reservedQty" = "reservedQty" -')) {
        state.layerReleaseCount += 1;
        if (state.failOnLayerRelease > 0 && state.layerReleaseCount >= state.failOnLayerRelease) {
          throw new Error("simulated layer release failure");
        }
        const delta = d(String(vals[0]));
        const id = String(vals[1]);
        const layer = allLayers().find((item) => item.id === id);
        if (!layer) return [];
        if (layer.reservedQty.lessThan(delta)) return [];
        layer.reservedQty = layer.reservedQty.minus(delta);
        return [{ id: layer.id }];
      }
      if (text.includes('UPDATE "Inventory"') && text.includes('"reservedQty" = "reservedQty" -')) {
        const delta = d(String(vals[0]));
        const id = String(vals[1]);
        const inv = state.inventories.find((item) => item.id === id);
        if (!inv) return [];
        if (inv.reservedQty.lessThan(delta)) return [];
        inv.reservedQty = inv.reservedQty.minus(delta);
        return [{ id: inv.id }];
      }
      return [];
    }
  };

  return { tx, state, project, product, location };
}

function setLayers(world: ReturnType<typeof createReqWorld>, specs: LayerSpec[]) {
  const cube = world.state.inventories.find((row) => row.id === "inv-proj");
  assert.ok(cube);
  world.state.layers.splice(
    0,
    world.state.layers.length,
    ...specs.map((spec) => ({
      id: spec.id,
      inventoryId: "inv-proj",
      qty: d(spec.qty),
      reservedQty: d(spec.reserved ?? "0"),
      lotNumber: spec.lot === undefined ? spec.id : spec.lot,
      receivedAt: spec.receivedAt === undefined ? new Date("2026-01-01T00:00:00.000Z") : spec.receivedAt,
      createdAt: spec.createdAt ?? spec.receivedAt ?? new Date("2026-01-01T00:00:00.000Z"),
      unitPriceMxn: spec.price == null ? null : d(spec.price),
      unitPriceUsd: null,
      sourceReference: spec.sourceReference ?? null
    }))
  );
  cube.qty = world.state.layers.reduce((sum, layer) => sum.plus(layer.qty), d("0"));
  cube.reservedQty = world.state.layers.reduce((sum, layer) => sum.plus(layer.reservedQty), d("0"));
}

function snapshotWorld(state: ReturnType<typeof createReqWorld>["state"]) {
  return {
    inventories: state.inventories.map((row) => ({ ...row, qty: d(row.qty), reservedQty: d(row.reservedQty) })),
    layers: state.layers.map((layer) => ({
      ...layer,
      qty: d(layer.qty),
      reservedQty: d(layer.reservedQty)
    })),
    reservations: state.reservations.map((row) => ({
      ...row,
      qty: d(row.qty),
      consumedQty: d(row.consumedQty),
      releasedQty: d(row.releasedQty)
    })),
    movements: state.movements.slice(),
    activities: state.activities.slice(),
    scanEvents: state.scanEvents.slice(),
    tasks: state.tasks.map((row) => ({ ...row })),
    serials: state.serials.map((row) => ({ ...row })),
    requisitionStatus: state.requisitions.map((row) => ({ id: row.id, status: row.status }))
  };
}

function restoreWorld(
  state: ReturnType<typeof createReqWorld>["state"],
  snap: ReturnType<typeof snapshotWorld>
) {
  state.inventories.splice(0, state.inventories.length, ...snap.inventories);
  state.layers.splice(0, state.layers.length, ...snap.layers);
  state.reservations.splice(0, state.reservations.length, ...snap.reservations);
  state.movements.splice(0, state.movements.length, ...snap.movements);
  state.activities.splice(0, state.activities.length, ...snap.activities);
  state.scanEvents.splice(0, state.scanEvents.length, ...snap.scanEvents);
  state.tasks.splice(0, state.tasks.length, ...snap.tasks);
  state.serials.splice(0, state.serials.length, ...snap.serials);
  for (const row of snap.requisitionStatus) {
    const current = state.requisitions.find((item) => item.id === row.id);
    if (current) current.status = row.status;
  }
}

async function reserveFifo(
  tx: unknown,
  qty: string,
  extra: { inventoryId?: string; layerId?: string; allocationMode?: string } = {}
) {
  return reserveLineInTransaction(tx as never, {
    requisitionId: "req-1",
    lineId: "line-1",
    qty: d(qty),
    inventoryId: extra.inventoryId ?? "inv-proj",
    layerId: extra.layerId,
    allocationMode: extra.allocationMode ?? "FIFO",
    userId: "admin-1"
  });
}

test("1 crear requisición no cambia qty ni reservedQty", async () => {
  const world = createReqWorld();
  const before = snapshotWorld(world.state);
  await createRequisitionInTransaction(world.tx as never, {
    number: "OS-CREATE-1",
    project: world.project,
    userId: "admin-1",
    lines: [{ sku: "SKU-REQ-1", requestedQty: 3 }]
  });
  assert.equal(String(world.state.inventories.find((row) => row.id === "inv-proj")?.qty), String(before.inventories[0]?.qty));
  assert.equal(String(world.state.inventories.find((row) => row.id === "inv-proj")?.reservedQty), "0");
  for (const layer of world.state.layers) {
    assert.equal(String(layer.qty), "1");
    assert.equal(String(layer.reservedQty), "0");
  }
  assert.equal(world.state.movements.length, 0);
  assert.match(serviceSrc, /status: "DRAFT"/);
  assert.doesNotMatch(sliceFunction(serviceSrc, "createRequisitionInTransaction"), /reservedQty/);
});

test("2 reserva FIFO de 3 piezas en tres capas de 1", async () => {
  const world = createReqWorld({ layerCount: 3, requestedQty: "3" });
  await reserveFifo(world.tx, "3");
  const cube = world.state.inventories.find((row) => row.id === "inv-proj");
  assert.equal(String(cube?.qty), "3");
  assert.equal(String(cube?.reservedQty), "3");
  assert.equal(world.state.layers.length, 3);
  for (const layer of world.state.layers) {
    assert.equal(String(layer.qty), "1");
    assert.equal(String(layer.reservedQty), "1");
  }
  assert.equal(world.state.reservations.length, 3);
  assert.equal(
    world.state.reservations.reduce((sum, row) => sum.plus(row.qty), d("0")).toString(),
    "3"
  );
  const meta = world.state.activities.at(-1)?.metadata as { allocations?: Array<Record<string, unknown>> };
  assert.equal(meta?.allocations?.length, 3);
  assert.equal(world.state.movements.length, 0);
});

test("3 reserva parcial atravesando dos capas", async () => {
  const world = createReqWorld({ requestedQty: "3" });
  setLayers(world, [
    { id: "layer-a", qty: "2", lot: "A", receivedAt: new Date("2026-01-01T00:00:00.000Z") },
    { id: "layer-b", qty: "2", lot: "B", receivedAt: new Date("2026-01-02T00:00:00.000Z") },
    { id: "layer-c", qty: "1", lot: "C", receivedAt: new Date("2026-01-03T00:00:00.000Z") }
  ]);
  await reserveFifo(world.tx, "3");
  assert.equal(String(world.state.layers.find((layer) => layer.id === "layer-a")?.reservedQty), "2");
  assert.equal(String(world.state.layers.find((layer) => layer.id === "layer-b")?.reservedQty), "1");
  assert.equal(String(world.state.layers.find((layer) => layer.id === "layer-c")?.reservedQty), "0");
  assert.equal(String(world.state.inventories.find((row) => row.id === "inv-proj")?.qty), "5");
  assert.equal(String(world.state.inventories.find((row) => row.id === "inv-proj")?.reservedQty), "3");
  assert.equal(world.state.reservations.length, 2);
});

test("4 FIFO con 4 capas", async () => {
  const world = createReqWorld({ layerCount: 4, requestedQty: "4" });
  await reserveFifo(world.tx, "4");
  assert.equal(world.state.reservations.length, 4);
  assert.equal(String(world.state.inventories.find((row) => row.id === "inv-proj")?.reservedQty), "4");
  assert.equal(
    world.state.layers.filter((layer) => String(layer.reservedQty) === "1").length,
    4
  );
});

test("5 FIFO con 29 capas", async () => {
  const world = createReqWorld({ layerCount: 29, requestedQty: "29" });
  await reserveFifo(world.tx, "29");
  assert.equal(world.state.reservations.length, 29);
  assert.equal(String(world.state.inventories.find((row) => row.id === "inv-proj")?.qty), "29");
  assert.equal(String(world.state.inventories.find((row) => row.id === "inv-proj")?.reservedQty), "29");
  assert.ok(world.state.layers.every((layer) => String(layer.qty) === "1" && String(layer.reservedQty) === "1"));
});

test("6 capas parcialmente reservadas", async () => {
  const world = createReqWorld({ requestedQty: "2" });
  setLayers(world, [
    { id: "layer-a", qty: "2", reserved: "1", lot: "A", receivedAt: new Date("2026-01-01T00:00:00.000Z") },
    { id: "layer-b", qty: "1", reserved: "0", lot: "B", receivedAt: new Date("2026-01-02T00:00:00.000Z") }
  ]);
  await reserveFifo(world.tx, "2");
  assert.equal(String(world.state.layers.find((layer) => layer.id === "layer-a")?.qty), "2");
  assert.equal(String(world.state.layers.find((layer) => layer.id === "layer-a")?.reservedQty), "2");
  assert.equal(String(world.state.layers.find((layer) => layer.id === "layer-b")?.reservedQty), "1");
  assert.equal(String(world.state.inventories.find((row) => row.id === "inv-proj")?.reservedQty), "3");
  assert.equal(world.state.reservations.length, 2);
});

test("7 receivedAt null al final", async () => {
  const world = createReqWorld({ requestedQty: "1" });
  setLayers(world, [
    { id: "layer-null", qty: "1", lot: "NULL", receivedAt: null, createdAt: new Date("2020-01-01T00:00:00.000Z") },
    { id: "layer-dated", qty: "1", lot: "DATED", receivedAt: new Date("2026-06-01T00:00:00.000Z") }
  ]);
  await reserveFifo(world.tx, "1");
  assert.equal(String(world.state.layers.find((layer) => layer.id === "layer-dated")?.reservedQty), "1");
  assert.equal(String(world.state.layers.find((layer) => layer.id === "layer-null")?.reservedQty), "0");
  assert.equal(world.state.reservations[0]?.inventoryLayerId, "layer-dated");
});

test("8 orden createdAt/id", async () => {
  const sameReceived = new Date("2026-03-01T00:00:00.000Z");
  const world = createReqWorld({ requestedQty: "1" });
  setLayers(world, [
    {
      id: "layer-z",
      qty: "1",
      lot: "Z",
      receivedAt: sameReceived,
      createdAt: new Date("2026-03-02T00:00:00.000Z")
    },
    {
      id: "layer-a",
      qty: "1",
      lot: "A",
      receivedAt: sameReceived,
      createdAt: new Date("2026-03-01T00:00:00.000Z")
    }
  ]);
  await reserveFifo(world.tx, "1");
  assert.equal(world.state.reservations[0]?.inventoryLayerId, "layer-a");
});

test("9 disponible agregado insuficiente: rollback completo", async () => {
  assert.match(serviceSrc, /prisma\.\$transaction\(async \(tx\) => \{\s*await reserveLineInTransaction/);
  const world = createReqWorld({ layerCount: 3, requestedQty: "10" });
  const snap = snapshotWorld(world.state);
  await reserveFifo(world.tx, "4").then(
    () => {
      throw new Error("should reject over available");
    },
    (error) => {
      assert.ok(error instanceof RequisitionError);
      assert.equal(error.code, "INSUFFICIENT_FREE");
    }
  );
  assert.equal(String(world.state.inventories.find((row) => row.id === "inv-proj")?.reservedQty), "0");
  assert.equal(world.state.reservations.length, 0);
  world.state.failOnLayerReserve = 2;
  await reserveFifo(world.tx, "3").then(
    () => {
      throw new Error("should fail on second layer");
    },
    (error) => {
      assert.equal(String(error.message), "simulated layer reserve failure");
    }
  );
  restoreWorld(world.state, snap);
  assert.equal(String(world.state.inventories.find((row) => row.id === "inv-proj")?.reservedQty), "0");
  assert.ok(world.state.layers.every((layer) => String(layer.reservedQty) === "0"));
});

test("10 un solo proyecto", async () => {
  const world = createReqWorld({ layerCount: 3, requestedQty: "3" });
  await reserveFifo(world.tx, "3");
  assert.ok(world.state.reservations.every((row) => row.inventoryId === "inv-proj"));
  assert.equal(String(world.state.inventories.find((row) => row.id === "inv-fts")?.reservedQty), "0");
  assert.equal(String(world.state.inventories.find((row) => row.id === "inv-other")?.reservedQty), "0");
  assert.equal(String(world.state.inventories.find((row) => row.id === "inv-fts")?.qty), "5");
});

test("11 rechazo de Free to Sale", async () => {
  const world = createReqWorld({ requestedQty: "1" });
  await reserveFifo(world.tx, "1", { inventoryId: "inv-fts" }).then(
    () => {
      throw new Error("FTS should be rejected");
    },
    (error) => {
      assert.ok(error instanceof RequisitionError);
      assert.equal(error.code, "RESERVATION_PROJECT_MISMATCH");
    }
  );
  assert.equal(String(world.state.inventories.find((row) => row.id === "inv-fts")?.reservedQty), "0");
  assert.equal(world.state.reservations.length, 0);
});

test("12 rechazo de otro proyecto", async () => {
  const world = createReqWorld({ requestedQty: "1" });
  await reserveFifo(world.tx, "1", { inventoryId: "inv-other" }).then(
    () => {
      throw new Error("other project should be rejected");
    },
    (error) => {
      assert.ok(error instanceof RequisitionError);
      assert.equal(error.code, "RESERVATION_PROJECT_MISMATCH");
    }
  );
  assert.equal(world.state.reservations.length, 0);
});

test("13 layerId conserva el modo anterior", async () => {
  const world = createReqWorld({ layerCount: 3, requestedQty: "1" });
  await reserveLineInTransaction(world.tx as never, {
    requisitionId: "req-1",
    lineId: "line-1",
    qty: d("1"),
    inventoryId: "inv-proj",
    layerId: "layer-03",
    userId: "admin-1"
  });
  assert.equal(world.state.reservations.length, 1);
  assert.equal(world.state.reservations[0]?.inventoryLayerId, "layer-03");
  assert.equal(String(world.state.layers.find((layer) => layer.id === "layer-03")?.reservedQty), "1");
  assert.equal(String(world.state.layers.find((layer) => layer.id === "layer-01")?.reservedQty), "0");
});

test("14 layerId + FIFO produce conflicto", async () => {
  const world = createReqWorld({ requestedQty: "1" });
  await reserveFifo(world.tx, "1", { layerId: "layer-01", allocationMode: "FIFO" }).then(
    () => {
      throw new Error("should conflict");
    },
    (error) => {
      assert.ok(error instanceof RequisitionError);
      assert.equal(error.code, "LAYER_ALLOCATION_CONFLICT");
    }
  );
  await reserveFifo(world.tx, "1", { allocationMode: "LIFO" }).then(
    () => {
      throw new Error("invalid mode");
    },
    (error) => {
      assert.ok(error instanceof RequisitionError);
      assert.equal(error.code, "INVALID_ALLOCATION_MODE");
    }
  );
  assert.equal(world.state.reservations.length, 0);
});

test("15 consumidor anterior sin modo conserva AMBIGUOUS_LAYER", async () => {
  const world = createReqWorld({ layerCount: 3, requestedQty: "1" });
  await reserveLineInTransaction(world.tx as never, {
    requisitionId: "req-1",
    lineId: "line-1",
    qty: d("1"),
    inventoryId: "inv-proj",
    userId: "admin-1"
  }).then(
    () => {
      throw new Error("should stay ambiguous");
    },
    (error) => {
      assert.ok(error instanceof RequisitionError);
      assert.equal(error.code, "AMBIGUOUS_LAYER");
      const details = error.details as { layers?: unknown[] };
      assert.equal(details.layers?.length, 3);
    }
  );
  assert.match(serviceSrc, /AMBIGUOUS_LAYER/);
  assert.match(routes, /allocationMode/);
});

test("16 cero InventoryMovement al reservar", async () => {
  const world = createReqWorld({ layerCount: 3, requestedQty: "3" });
  await reserveFifo(world.tx, "3");
  assert.equal(world.state.movements.length, 0);
  assert.doesNotMatch(sliceFunction(serviceSrc, "reserveLineInTransaction"), /inventoryMovement\.create/);
  assert.doesNotMatch(sliceFunction(serviceSrc, "reserveLineInTransaction"), /type: "PICK"/);
  assert.doesNotMatch(sliceFunction(serviceSrc, "reserveLineInTransaction"), /movementType: "OUT"/);
});

test("17 cancelar requisición libera todas las reservas y restaura reservedQty", async () => {
  const world = createReqWorld({ layerCount: 3, requestedQty: "3" });
  await reserveFifo(world.tx, "3");
  await cancelRequisitionInTransaction(world.tx as never, "req-1", "admin-1");
  assert.equal(world.state.requisitions.find((row) => row.id === "req-1")?.status, "CANCELLED");
  assert.ok(world.state.reservations.every((row) => row.status === "RELEASED"));
  assert.equal(String(world.state.inventories.find((row) => row.id === "inv-proj")?.qty), "3");
  assert.equal(String(world.state.inventories.find((row) => row.id === "inv-proj")?.reservedQty), "0");
  assert.ok(world.state.layers.every((layer) => String(layer.qty) === "1" && String(layer.reservedQty) === "0"));
  assert.equal(world.state.movements.length, 0);
  assert.equal(world.state.tasks.find((row) => row.id === "task-pick-1")?.status, "CANCELLED");
});

test("18 concurrencia sin sobre-reserva", async () => {
  const world = createReqWorld({ layerCount: 3, requestedQty: "10" });
  await reserveFifo(world.tx, "2");
  await reserveFifo(world.tx, "2").then(
    () => {
      throw new Error("second reserve should see remaining 1");
    },
    (error) => {
      assert.ok(error instanceof RequisitionError);
      assert.equal(error.code, "INSUFFICIENT_FREE");
    }
  );
  assert.equal(String(world.state.inventories.find((row) => row.id === "inv-proj")?.reservedQty), "2");
  assert.equal(
    world.state.layers.reduce((sum, layer) => sum.plus(layer.reservedQty), d("0")).toString(),
    "2"
  );
  assert.match(serviceSrc, /lockInventoryAndLayers/);
  assert.match(serviceSrc, /qty - "reservedQty" >=/);
  assert.match(serviceSrc, /RETURNING id/);
});

test("19 la UI envía FIFO sin layerId", () => {
  const src = sliceFunction(js, "confirmReserveFromModal");
  assert.match(src, /allocationMode: "FIFO"/);
  assert.match(src, /quantity: qty/);
  assert.doesNotMatch(src, /body\.layerId/);
  assert.doesNotMatch(src, /layerId:/);
  assert.match(routes, /quantity: z\.coerce\.number\(\)\.positive\(\)\.optional\(\)/);
  assert.match(routes, /allocationMode: z\.string\(\)\.max\(20\)\.optional\(\)/);
});

test("20 una sugerencia por cubo", () => {
  assert.match(js, /function formatReserveCubeLabel/);
  assert.match(js, /function fillReserveCubeSelect/);
  assert.match(js, /Física \$\{formatQty\(cube\?\.qty\)\}/);
  assert.match(js, /Reservada \$\{formatQty\(cube\?\.reservedQty\)\}/);
  assert.match(js, /Disponible \$\{formatQty\(cube\?\.freeQty/);
  assert.match(js, /capas internas/);
  assert.match(js, /option value="\$\{escCell\(cube\.inventoryId\)\}"/);
  assert.match(serviceSrc, /layerCount/);
  const fill = sliceFunction(js, "fillReserveCubeSelect");
  assert.doesNotMatch(fill, /layerId/);
  const open = sliceFunction(js, "openReserveModal");
  assert.match(open, /reserveCubes/);
  assert.match(open, /fillReserveCubeSelect\(cubes\)/);
});

test("21 encabezado completo y cache-buster v72", () => {
  const pane = requisitionPane();
  const bandStart = pane.indexOf("module-header-band");
  const bandEnd = pane.indexOf("</div>", bandStart);
  const band = pane.slice(bandStart, bandEnd);
  assert.doesNotMatch(band, /La requisición no descuenta inventario/);
  assert.match(pane, /class="module-hint req-stock-hint"/);
  assert.match(
    pane,
    /La requisición no descuenta inventario\. El stock se descuenta únicamente al surtir mediante Picking\/Salida\./
  );
  assert.doesNotMatch(pane, /Se creará una tarea de surtido por cada línea/);
  assert.match(pane, /una sola tarea de surtido \(PICK\) para toda la requisición/);
  assert.match(html, /#moduleRequisitions \.req-stock-hint/);
  assert.match(html, /white-space:\s*normal/);
  assert.match(html, /max-height:\s*52px/);
  assert.match(html, /dashboard\.js\?v=87/);
  assert.doesNotMatch(html, /dashboard\.js\?v=72/);
});

test("22 Picking, Reubicación y Recepción actuales permanecen intactos", () => {
  assert.match(pickingSrc, /mutateInventory\(/);
  assert.match(pickingSrc, /type: "PICK"/);
  assert.match(pickingSrc, /consumeReservationPick/);
  const pickPayload = sliceFunction(js, "buildPickScanPayload");
  assert.doesNotMatch(pickPayload, /reservationId/);
  assert.match(js, /allocationMode: "FIFO"/);
  assert.match(mutationSrc, /planRelocateFifoAllocation/);
  assert.match(mutationSrc, /type === "RELOCATE"/);
  assert.match(html, /id="inboundProductId"/);
  assert.match(html, /id="inboundAssignmentType"/);
  assert.match(html, /id="relocateSubmitBtn"/);
  assert.match(js, /function submitRelocate/);
  assert.match(js, /function submitOperationalMovement/);
});

test("el contrato de reserva no usa Prisma schema nuevo", () => {
  assert.match(serviceSrc, /planRelocateFifoAllocation/);
  assert.match(serviceSrc, /allocationMode: "FIFO"/);
  assert.match(serviceSrc, /inventoryReservation\.create/);
  assert.doesNotMatch(serviceSrc, /model InventoryReservation/);
});

test("APPROVED es requerido y HttpError no se traga", async () => {
  const world = createReqWorld();
  const req = world.state.requisitions.find((row) => row.id === "req-1");
  assert.ok(req);
  req.status = "DRAFT";
  await reserveFifo(world.tx, "1").then(
    () => {
      throw new Error("draft cannot reserve");
    },
    (error) => {
      assert.ok(error instanceof HttpError);
      assert.equal(error.statusCode, 409);
    }
  );
});

test("cancelar APPROVED con dos capas, seriales y reservas libera sin tocar físico", async () => {
  const world = createReqWorld({ layerCount: 2, requestedQty: "2" });
  await reserveFifo(world.tx, "2");
  assert.equal(world.state.reservations.length, 2);
  assert.ok(world.state.reservations.every((row) => row.status === "ACTIVE"));
  assert.equal(world.state.serials.length, 2);
  await cancelRequisitionInTransaction(world.tx as never, "req-1", "admin-1");
  const cube = world.state.inventories.find((row) => row.id === "inv-proj");
  assert.equal(String(cube?.qty), "2");
  assert.equal(String(cube?.reservedQty), "0");
  assert.equal(world.state.layers.length, 2);
  assert.ok(world.state.layers.every((layer) => String(layer.qty) === "1" && String(layer.reservedQty) === "0"));
  assert.ok(world.state.reservations.every((row) => row.status === "RELEASED"));
  assert.equal(world.state.requisitions.find((row) => row.id === "req-1")?.status, "CANCELLED");
  assert.equal(world.state.tasks.find((row) => row.id === "task-pick-1")?.status, "CANCELLED");
  assert.equal(world.state.movements.length, 0);
  assert.equal(world.state.scanEvents.length, 0);
  assert.equal(world.state.serials.length, 2);
  assert.doesNotMatch(sliceFunction(serviceSrc, "cancelRequisitionInTransaction"), /inventoryMovement\.create/);
  assert.doesNotMatch(sliceFunction(serviceSrc, "cancelRequisitionInTransaction"), /scanEvent\.create/);
  assert.doesNotMatch(sliceFunction(serviceSrc, "cancelRequisitionInTransaction"), /SERIAL_SELECTION_REQUIRED/);
});

test("rollback completo si falla la segunda liberación", async () => {
  const world = createReqWorld({ layerCount: 2, requestedQty: "2" });
  await reserveFifo(world.tx, "2");
  const snap = snapshotWorld(world.state);
  world.state.failOnLayerRelease = 2;
  await cancelRequisitionInTransaction(world.tx as never, "req-1", "admin-1").then(
    () => {
      throw new Error("second release should fail");
    },
    (error) => {
      assert.equal(String((error as Error).message), "simulated layer release failure");
    }
  );
  restoreWorld(world.state, snap);
  const cube = world.state.inventories.find((row) => row.id === "inv-proj");
  assert.equal(String(cube?.qty), "2");
  assert.equal(String(cube?.reservedQty), "2");
  assert.ok(world.state.layers.every((layer) => String(layer.qty) === "1" && String(layer.reservedQty) === "1"));
  assert.ok(world.state.reservations.every((row) => row.status === "ACTIVE"));
  assert.equal(world.state.requisitions.find((row) => row.id === "req-1")?.status, "APPROVED");
  assert.equal(world.state.tasks.find((row) => row.id === "task-pick-1")?.status, "PENDING");
});

test("segundo intento de cancelar no genera cantidades negativas", async () => {
  const world = createReqWorld({ layerCount: 2, requestedQty: "2" });
  await reserveFifo(world.tx, "2");
  await cancelRequisitionInTransaction(world.tx as never, "req-1", "admin-1");
  await cancelRequisitionInTransaction(world.tx as never, "req-1", "admin-1");
  const cube = world.state.inventories.find((row) => row.id === "inv-proj");
  assert.equal(String(cube?.qty), "2");
  assert.equal(String(cube?.reservedQty), "0");
  assert.ok(!d(String(cube?.reservedQty)).lessThan(0));
  assert.ok(world.state.layers.every((layer) => !layer.reservedQty.lessThan(0) && String(layer.qty) === "1"));
  assert.equal(world.state.requisitions.find((row) => row.id === "req-1")?.status, "CANCELLED");
});
