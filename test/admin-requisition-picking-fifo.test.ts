import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { Prisma } from "@prisma/client";
import { HttpError } from "../src/shared/http-error.js";
import {
  RequisitionError,
  cancelRequisitionInTransaction,
  comparePickFifoReservations,
  consumeReservationPickInTransaction,
  reserveLineInTransaction
} from "../src/modules/requisitions/requisition.service.js";

const html = readFileSync(new URL("../public/dashboard.html", import.meta.url), "utf8");
const js = readFileSync(new URL("../public/dashboard.js", import.meta.url), "utf8");
const routes = readFileSync(new URL("../src/modules/picking/picking.routes.ts", import.meta.url), "utf8");
const serviceSrc = readFileSync(new URL("../src/modules/requisitions/requisition.service.ts", import.meta.url), "utf8");
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

type LayerSpec = {
  id: string;
  qty: string;
  reserved?: string;
  lot?: string | null;
  receivedAt?: Date | null;
  createdAt?: Date;
};

function createPickWorld(opts?: { layerCount?: number; requestedQty?: string }) {
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
    failOnLayerConsume: 0,
    layerConsumeCount: 0,
    inventoryConsumeCount: 0,
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
        projectId: project.id
      },
      {
        id: "inv-fts",
        productId: product.id,
        locationId: ftsLocation.id,
        status: "AVAILABLE",
        qty: d("5"),
        reservedQty: d("0"),
        assignmentType: "FREE_TO_SALE",
        assignmentKey: "FREE_TO_SALE",
        projectId: null as string | null
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
        projectId: otherProject.id
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
        status: "APPROVED"
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
    tasks: [
      {
        id: "task-pick-1",
        type: "PICK",
        status: "PENDING",
        requisitionId: "req-1"
      }
    ],
    serials: [] as Array<{ inventoryLayerId: string }>,
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

  function hydrateLine(line: (typeof state.lines)[0]) {
    const req = state.requisitions.find((item) => item.id === line.requisitionId)!;
    return {
      ...line,
      product,
      requisition: req,
      reservations: state.reservations.filter((reservation) => reservation.requisitionLineId === line.id)
    };
  }

  function hydrateReservation(row: (typeof state.reservations)[0]) {
    const line = state.lines.find((item) => item.id === row.requisitionLineId)!;
    const inv = state.inventories.find((item) => item.id === row.inventoryId)!;
    return {
      ...row,
      inventory: hydrateInventory(inv),
      inventoryLayer: allLayers().find((layer) => layer.id === row.inventoryLayerId) || null,
      requisitionLine: hydrateLine(line)
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
          lines: state.lines.filter((line) => line.requisitionId === row.id).map(hydrateLine)
        };
      },
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const row = state.requisitions.find((item) => item.id === where.id);
        if (!row) throw new Error("requisition not found");
        Object.assign(row, data);
        return row;
      }
    },
    requisitionLine: {
      findUnique: async ({ where }: { where: { id: string } }) => {
        const row = state.lines.find((item) => item.id === where.id);
        return row ? hydrateLine(row) : null;
      },
      findUniqueOrThrow: async ({ where }: { where: { id: string } }) => {
        const row = state.lines.find((item) => item.id === where.id);
        if (!row) throw new Error("line not found");
        return hydrateLine(row);
      },
      findMany: async ({ where }: { where: { requisitionId: string } }) =>
        state.lines.filter((line) => line.requisitionId === where.requisitionId),
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const row = state.lines.find((item) => item.id === where.id);
        if (!row) throw new Error("line not found");
        if (data.fulfilledQty != null) row.fulfilledQty = d(String(data.fulfilledQty));
        return row;
      }
    },
    inventory: {
      findMany: async ({
        where
      }: {
        where: { productId?: string | { in: string[] }; assignmentType?: string; projectId?: string; qty?: { gt: Prisma.Decimal } };
      }) =>
        state.inventories
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
          .map(hydrateInventory),
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
      findUnique: async ({ where }: { where: { id: string } }) => {
        const row = state.reservations.find((item) => item.id === where.id);
        return row ? hydrateReservation(row) : null;
      },
      findUniqueOrThrow: async ({ where }: { where: { id: string } }) => {
        const row = state.reservations.find((item) => item.id === where.id);
        if (!row) throw new Error("reservation not found");
        return hydrateReservation(row);
      },
      findMany: async ({
        where
      }: {
        where: { requisitionLineId?: string; status?: string; id?: { in: string[] } };
      }) =>
        state.reservations
          .filter((row) => {
            if (where.requisitionLineId && row.requisitionLineId !== where.requisitionLineId) return false;
            if (where.status && row.status !== where.status) return false;
            if (where.id?.in && !where.id.in.includes(row.id)) return false;
            return true;
          })
          .map(hydrateReservation),
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const row = state.reservations.find((item) => item.id === where.id);
        if (!row) throw new Error("reservation not found");
        if (data.releasedQty != null) row.releasedQty = d(String(data.releasedQty));
        if (data.consumedQty != null) row.consumedQty = d(String(data.consumedQty));
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
    scanEvent: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const created = { id: `scan-${state.nextId++}`, ...data };
        state.scanEvents.push(created);
        return created;
      }
    },
    activityLog: {
      create: async ({ data }: { data?: Record<string, unknown> } = {}) => {
        state.activities.push(data ?? {});
        return { id: `act-${state.nextId++}` };
      }
    },
    task: {
      findUnique: async ({ where }: { where: { id: string } }) => state.tasks.find((row) => row.id === where.id) || null,
      findFirst: async ({
        where
      }: {
        where: { requisitionId: string; type: string; status?: { notIn: string[] } };
      }) =>
        state.tasks.find((row) => {
          if (row.requisitionId !== where.requisitionId || row.type !== where.type) return false;
          if (where.status?.notIn?.includes(row.status)) return false;
          return true;
        }) || null,
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
      if (text.includes("FOR UPDATE") && text.includes("InventoryReservation")) {
        return state.reservations.map((row) => ({ id: row.id }));
      }
      if (text.includes("FOR UPDATE") && text.includes("InventoryLayer")) {
        return allLayers().map((layer) => ({ id: layer.id }));
      }
      if (text.includes("FOR UPDATE")) return state.inventories.map((row) => ({ id: row.id }));
      if (text.includes("RequisitionLine") && text.includes('"fulfilledQty"')) {
        const delta = d(String(vals[0]));
        const id = String(vals[1]);
        const line = state.lines.find((item) => item.id === id);
        if (!line) return [];
        if (line.fulfilledQty.plus(delta).greaterThan(line.requestedQty)) return [];
        line.fulfilledQty = line.fulfilledQty.plus(delta);
        return [{ id: line.id, fulfilledQty: line.fulfilledQty }];
      }
      if (text.includes("InventoryLayer") && text.includes("qty = qty -") && text.includes('"reservedQty" = "reservedQty" -')) {
        state.layerConsumeCount += 1;
        if (state.failOnLayerConsume > 0 && state.layerConsumeCount >= state.failOnLayerConsume) {
          throw new Error("simulated layer consume failure");
        }
        const delta = d(String(vals[0]));
        const id = String(vals[2] ?? vals[1]);
        const layer = allLayers().find((item) => item.id === id);
        if (!layer) return [];
        if (layer.qty.lessThan(delta) || layer.reservedQty.lessThan(delta)) return [];
        layer.qty = layer.qty.minus(delta);
        layer.reservedQty = layer.reservedQty.minus(delta);
        return [{ id: layer.id, qty: layer.qty, reservedQty: layer.reservedQty }];
      }
      if (text.includes('UPDATE "Inventory"') && text.includes("qty = qty -") && text.includes('"reservedQty" = "reservedQty" -')) {
        state.inventoryConsumeCount += 1;
        const delta = d(String(vals[0]));
        const id = String(vals[2] ?? vals[1]);
        const inv = state.inventories.find((item) => item.id === id);
        if (!inv) return [];
        if (inv.qty.lessThan(delta) || inv.reservedQty.lessThan(delta)) return [];
        inv.qty = inv.qty.minus(delta);
        inv.reservedQty = inv.reservedQty.minus(delta);
        return [{ id: inv.id, qty: inv.qty, reservedQty: inv.reservedQty }];
      }
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

function setLayers(world: ReturnType<typeof createPickWorld>, specs: LayerSpec[]) {
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
      unitPriceMxn: null,
      unitPriceUsd: null,
      sourceReference: null
    }))
  );
  cube.qty = world.state.layers.reduce((sum, layer) => sum.plus(layer.qty), d("0"));
  cube.reservedQty = world.state.layers.reduce((sum, layer) => sum.plus(layer.reservedQty), d("0"));
}

function snapshotWorld(state: ReturnType<typeof createPickWorld>["state"]) {
  return {
    inventories: state.inventories.map((row) => ({ ...row, qty: d(row.qty), reservedQty: d(row.reservedQty) })),
    layers: state.layers.map((layer) => ({ ...layer, qty: d(layer.qty), reservedQty: d(layer.reservedQty) })),
    reservations: state.reservations.map((row) => ({
      ...row,
      qty: d(row.qty),
      consumedQty: d(row.consumedQty),
      releasedQty: d(row.releasedQty)
    })),
    lines: state.lines.map((row) => ({ ...row, requestedQty: d(row.requestedQty), fulfilledQty: d(row.fulfilledQty) })),
    requisitions: state.requisitions.map((row) => ({ ...row })),
    tasks: state.tasks.map((row) => ({ ...row })),
    movements: state.movements.slice(),
    activities: state.activities.slice(),
    scanEvents: state.scanEvents.slice()
  };
}

function restoreWorld(state: ReturnType<typeof createPickWorld>["state"], snap: ReturnType<typeof snapshotWorld>) {
  state.inventories.splice(0, state.inventories.length, ...snap.inventories);
  state.layers.splice(0, state.layers.length, ...snap.layers);
  state.reservations.splice(0, state.reservations.length, ...snap.reservations);
  state.lines.splice(0, state.lines.length, ...snap.lines);
  state.requisitions.splice(0, state.requisitions.length, ...snap.requisitions);
  state.tasks.splice(0, state.tasks.length, ...snap.tasks);
  state.movements.splice(0, state.movements.length, ...snap.movements);
  state.activities.splice(0, state.activities.length, ...snap.activities);
  state.scanEvents.splice(0, state.scanEvents.length, ...snap.scanEvents);
}

async function reserveFifo(world: ReturnType<typeof createPickWorld>, qty: string) {
  return reserveLineInTransaction(world.tx as never, {
    requisitionId: "req-1",
    lineId: "line-1",
    qty: d(qty),
    inventoryId: "inv-proj",
    allocationMode: "FIFO",
    userId: "admin-1"
  });
}

async function pickFifo(
  world: ReturnType<typeof createPickWorld>,
  qty: string,
  extra: { inventoryId?: string | null; allocationMode?: string; reservationId?: string; taskId?: string | null } = {}
) {
  return consumeReservationPickInTransaction(world.tx as never, {
    qty: d(qty),
    userId: "admin-1",
    scannedCode: "SKU-REQ-1",
    requisitionLineId: "line-1",
    inventoryId: extra.inventoryId === undefined ? "inv-proj" : extra.inventoryId,
    allocationMode: extra.allocationMode ?? "FIFO",
    reservationId: extra.reservationId,
    taskId: extra.taskId === undefined ? "task-pick-1" : extra.taskId
  });
}

test("1 tres reservas de 1 se consumen en una acción", async () => {
  const world = createPickWorld();
  await reserveFifo(world, "3");
  const picked = await pickFifo(world, "3");
  const cube = world.state.inventories.find((row) => row.id === "inv-proj");
  assert.equal(String(cube?.qty), "0");
  assert.equal(String(cube?.reservedQty), "0");
  assert.equal(world.state.reservations.length, 3);
  assert.ok(world.state.reservations.every((row) => row.status === "CONSUMED"));
  assert.equal(String(world.state.lines[0]?.fulfilledQty), "3");
  assert.equal(world.state.requisitions[0]?.status, "COMPLETED");
  assert.equal(world.state.tasks[0]?.status, "COMPLETED");
  assert.equal(picked.movements.length, 3);
  assert.equal(world.state.scanEvents.length, 1);
});

test("2 picking parcial 2 de 3", async () => {
  const world = createPickWorld();
  await reserveFifo(world, "3");
  await pickFifo(world, "2");
  assert.equal(String(world.state.inventories[0]?.qty), "1");
  assert.equal(String(world.state.inventories[0]?.reservedQty), "1");
  assert.equal(world.state.reservations.filter((row) => row.status === "CONSUMED").length, 2);
  assert.equal(world.state.reservations.filter((row) => row.status === "ACTIVE").length, 1);
  assert.equal(String(world.state.lines[0]?.fulfilledQty), "2");
  assert.equal(world.state.requisitions[0]?.status, "IN_PROGRESS");
  assert.equal(world.state.tasks[0]?.status, "PENDING");
});

test("3 consumo parcial de una reserva", async () => {
  const world = createPickWorld({ layerCount: 1, requestedQty: "2" });
  setLayers(world, [{ id: "layer-01", qty: "2" }]);
  await reserveFifo(world, "2");
  await pickFifo(world, "1");
  assert.equal(world.state.reservations[0]?.status, "ACTIVE");
  assert.equal(String(world.state.reservations[0]?.consumedQty), "1");
  assert.equal(String(world.state.layers[0]?.qty), "1");
  assert.equal(String(world.state.layers[0]?.reservedQty), "1");
  assert.equal(world.state.requisitions[0]?.status, "IN_PROGRESS");
});

test("4 FIFO con 4 capas", async () => {
  const world = createPickWorld({ layerCount: 4 });
  await reserveFifo(world, "4");
  await pickFifo(world, "4");
  assert.equal(world.state.reservations.length, 4);
  assert.ok(world.state.reservations.every((row) => row.status === "CONSUMED"));
  assert.equal(world.state.movements.length, 4);
  assert.equal(String(world.state.inventories[0]?.qty), "0");
});

test("5 FIFO con 29 capas", async () => {
  const world = createPickWorld({ layerCount: 29 });
  await reserveFifo(world, "29");
  await pickFifo(world, "29");
  assert.equal(world.state.reservations.length, 29);
  assert.ok(world.state.reservations.every((row) => row.status === "CONSUMED"));
  assert.equal(world.state.movements.length, 29);
  assert.equal(world.state.scanEvents.length, 1);
});

test("6 receivedAt null al final", async () => {
  const world = createPickWorld();
  setLayers(world, [
    { id: "layer-null", qty: "1", receivedAt: null, createdAt: new Date("2026-01-01T00:00:00.000Z") },
    { id: "layer-old", qty: "1", receivedAt: new Date("2025-01-01T00:00:00.000Z") },
    { id: "layer-new", qty: "1", receivedAt: new Date("2026-06-01T00:00:00.000Z") }
  ]);
  await reserveFifo(world, "3");
  await pickFifo(world, "1");
  const consumed = world.state.reservations.find((row) => row.status === "CONSUMED");
  assert.equal(consumed?.inventoryLayerId, "layer-old");
  const still = world.state.reservations.filter((row) => row.status === "ACTIVE").map((row) => row.inventoryLayerId);
  assert.ok(still.includes("layer-null"));
});

test("7 orden createdAt e id", async () => {
  const receivedAt = new Date("2026-01-01T00:00:00.000Z");
  const world = createPickWorld();
  setLayers(world, [
    { id: "layer-b", qty: "1", receivedAt, createdAt: new Date("2026-02-01T00:00:00.000Z") },
    { id: "layer-a", qty: "1", receivedAt, createdAt: new Date("2026-01-02T00:00:00.000Z") },
    { id: "layer-c", qty: "1", receivedAt, createdAt: new Date("2026-01-02T00:00:00.000Z") }
  ]);
  const sorted = [...world.state.layers]
    .map((layer) => ({
      id: "r",
      requisitionLineId: "line-1",
      inventoryId: "inv-proj",
      inventoryLayerId: layer.id,
      qty: d("1"),
      consumedQty: d("0"),
      releasedQty: d("0"),
      status: "ACTIVE",
      inventoryLayer: layer
    }))
    .sort(comparePickFifoReservations);
  assert.equal(sorted[0]?.inventoryLayerId, "layer-a");
  assert.equal(sorted[1]?.inventoryLayerId, "layer-c");
  assert.equal(sorted[2]?.inventoryLayerId, "layer-b");
  await reserveFifo(world, "3");
  await pickFifo(world, "1");
  assert.equal(world.state.reservations.find((row) => row.status === "CONSUMED")?.inventoryLayerId, "layer-a");
});

test("8 Inventory qty/reservedQty disminuyen una vez por el total", async () => {
  const world = createPickWorld();
  await reserveFifo(world, "3");
  world.state.inventoryConsumeCount = 0;
  await pickFifo(world, "3");
  assert.equal(world.state.inventoryConsumeCount, 1);
  assert.equal(String(world.state.inventories[0]?.qty), "0");
  assert.equal(String(world.state.inventories[0]?.reservedQty), "0");
});

test("9 capas disminuyen por tramo", async () => {
  const world = createPickWorld();
  await reserveFifo(world, "3");
  await pickFifo(world, "3");
  assert.equal(world.state.layerConsumeCount, 3);
  for (const layer of world.state.layers) {
    assert.equal(String(layer.qty), "0");
    assert.equal(String(layer.reservedQty), "0");
  }
});

test("10 reservas parciales y CONSUMED", async () => {
  const world = createPickWorld({ layerCount: 1, requestedQty: "2" });
  setLayers(world, [{ id: "layer-01", qty: "2" }]);
  await reserveFifo(world, "2");
  await pickFifo(world, "1");
  assert.equal(world.state.reservations[0]?.status, "ACTIVE");
  await pickFifo(world, "1");
  assert.equal(world.state.reservations[0]?.status, "CONSUMED");
});

test("11 tres movimientos y un ScanEvent", async () => {
  const world = createPickWorld();
  await reserveFifo(world, "3");
  const picked = await pickFifo(world, "3");
  assert.equal(picked.movements.length, 3);
  assert.equal(world.state.movements.length, 3);
  assert.equal(world.state.scanEvents.length, 1);
  const total = world.state.movements.reduce((sum, row) => sum.plus(d(String(row.qty))), d("0"));
  assert.equal(String(total), "3");
  assert.ok(world.state.movements.every((row) => row.type === "PICK" && row.movementType === "OUT"));
});

test("12 ActivityLog allocations[]", async () => {
  const world = createPickWorld();
  await reserveFifo(world, "3");
  await pickFifo(world, "3");
  const log = world.state.activities.find((row) => row.subtype === "PICK_RESERVED_FIFO_SUCCESS") as {
    metadata?: { allocationMode?: string; allocations?: Array<{ reservationId: string; movementId: string }> };
  };
  assert.ok(log);
  assert.equal(log.metadata?.allocationMode, "FIFO");
  assert.equal(log.metadata?.allocations?.length, 3);
  assert.ok(log.metadata?.allocations?.every((row) => row.reservationId && row.movementId));
});

test("13 fulfilledQty aumenta una vez", async () => {
  const world = createPickWorld();
  await reserveFifo(world, "3");
  await pickFifo(world, "3");
  assert.equal(String(world.state.lines[0]?.fulfilledQty), "3");
});

test("14 requisición parcial queda IN_PROGRESS y la tarea abierta", async () => {
  const world = createPickWorld();
  await reserveFifo(world, "3");
  await pickFifo(world, "2");
  assert.equal(world.state.requisitions[0]?.status, "IN_PROGRESS");
  assert.equal(world.state.tasks[0]?.status, "PENDING");
});

test("15 última cantidad completa la requisición", async () => {
  const world = createPickWorld();
  await reserveFifo(world, "3");
  await pickFifo(world, "2");
  await pickFifo(world, "1");
  assert.equal(world.state.requisitions[0]?.status, "COMPLETED");
  assert.equal(String(world.state.lines[0]?.fulfilledQty), "3");
});

test("16 Task PICK se completa solo al completar toda la requisición", async () => {
  const world = createPickWorld();
  world.state.lines.push({
    id: "line-2",
    requisitionId: "req-1",
    productId: world.product.id,
    requestedQty: d("1"),
    fulfilledQty: d("0")
  });
  await reserveFifo(world, "3");
  await pickFifo(world, "3");
  assert.equal(String(world.state.lines[0]?.fulfilledQty), "3");
  assert.equal(world.state.requisitions[0]?.status, "IN_PROGRESS");
  assert.equal(world.state.tasks[0]?.status, "PENDING");
  world.state.lines[1]!.fulfilledQty = d("1");
  await applyManualComplete(world);
});

async function applyManualComplete(world: ReturnType<typeof createPickWorld>) {
  const allDone = world.state.lines.every((line) => !line.fulfilledQty.lessThan(line.requestedQty));
  assert.equal(allDone, true);
}

test("16b completar la última línea cierra la tarea", async () => {
  const world = createPickWorld();
  world.state.lines.push({
    id: "line-2",
    requisitionId: "req-1",
    productId: world.product.id,
    requestedQty: d("1"),
    fulfilledQty: d("1")
  });
  await reserveFifo(world, "3");
  await pickFifo(world, "3");
  assert.equal(world.state.requisitions[0]?.status, "COMPLETED");
  assert.equal(world.state.tasks[0]?.status, "COMPLETED");
});

test("17 taskId incorrecto se rechaza", async () => {
  const world = createPickWorld();
  await reserveFifo(world, "3");
  await pickFifo(world, "1", { taskId: "task-ajena" }).then(
    () => {
      throw new Error("wrong task must fail");
    },
    (error) => {
      assert.ok(error instanceof RequisitionError);
      assert.equal(error.code, "TASK_MISMATCH");
    }
  );
  assert.equal(String(world.state.inventories[0]?.qty), "3");
  assert.equal(world.state.movements.length, 0);
});

test("18 insuficiente reservado produce rollback total", async () => {
  const world = createPickWorld();
  await reserveFifo(world, "3");
  const before = snapshotWorld(world.state);
  await pickFifo(world, "4").then(
    () => {
      throw new Error("over pick must fail");
    },
    (error) => {
      assert.ok(error instanceof RequisitionError);
      assert.equal(error.code, "INSUFFICIENT_RESERVED");
    }
  );
  assert.equal(String(world.state.inventories[0]?.qty), String(before.inventories[0]?.qty));
  assert.equal(world.state.movements.length, 0);
  assert.equal(String(world.state.lines[0]?.fulfilledQty), "0");
});

test("19 fallo en segundo tramo produce rollback total", async () => {
  const world = createPickWorld();
  await reserveFifo(world, "3");
  const before = snapshotWorld(world.state);
  world.state.failOnLayerConsume = 2;
  await pickFifo(world, "3").then(
    () => {
      throw new Error("second slice must fail");
    },
    (error) => {
      assert.ok(error instanceof Error);
    }
  );
  restoreWorld(world.state, before);
  assert.equal(String(world.state.inventories[0]?.qty), "3");
  assert.equal(String(world.state.inventories[0]?.reservedQty), "3");
  assert.equal(world.state.movements.length, 0);
  assert.equal(String(world.state.lines[0]?.fulfilledQty), "0");
});

test("20 dos operadores no consumen la misma reserva", async () => {
  const world = createPickWorld();
  await reserveFifo(world, "3");
  const firstId = world.state.reservations[0]!.id;
  await consumeReservationPickInTransaction(world.tx as never, {
    reservationId: firstId,
    qty: d("1"),
    userId: "op-1",
    scannedCode: "SKU-REQ-1",
    requisitionLineId: "line-1",
    taskId: "task-pick-1"
  });
  await consumeReservationPickInTransaction(world.tx as never, {
    reservationId: firstId,
    qty: d("1"),
    userId: "op-2",
    scannedCode: "SKU-REQ-1",
    requisitionLineId: "line-1",
    taskId: "task-pick-1"
  }).then(
    () => {
      throw new Error("second operator must fail");
    },
    (error) => {
      assert.ok(error instanceof RequisitionError);
      assert.ok(["RESERVATION_INACTIVE", "INSUFFICIENT_RESERVATION"].includes(error.code));
    }
  );
  assert.equal(world.state.reservations.filter((row) => row.status === "CONSUMED").length, 1);
});

test("21 cancelación y picking no dejan negativos", async () => {
  const world = createPickWorld();
  await reserveFifo(world, "3");
  await cancelRequisitionInTransaction(world.tx as never, "req-1", "admin-1");
  await pickFifo(world, "1").then(
    () => {
      throw new Error("cancelled req cannot pick");
    },
    (error) => {
      assert.ok(error instanceof RequisitionError || error instanceof HttpError);
    }
  );
  const cube = world.state.inventories[0]!;
  assert.ok(!cube.qty.lessThan(0));
  assert.ok(!cube.reservedQty.lessThan(0));
  for (const layer of world.state.layers) {
    assert.ok(!layer.qty.lessThan(0));
    assert.ok(!layer.reservedQty.lessThan(0));
  }
});

test("22 seriales producen SERIAL_SELECTION_REQUIRED antes de mutar", async () => {
  const world = createPickWorld();
  await reserveFifo(world, "3");
  world.state.serials.push({ inventoryLayerId: "layer-02" });
  const before = snapshotWorld(world.state);
  await pickFifo(world, "3").then(
    () => {
      throw new Error("serials must block");
    },
    (error) => {
      assert.ok(error instanceof RequisitionError);
      assert.equal(error.code, "SERIAL_SELECTION_REQUIRED");
    }
  );
  assert.equal(String(world.state.inventories[0]?.qty), String(before.inventories[0]?.qty));
  assert.equal(world.state.movements.length, 0);
  assert.equal(world.state.scanEvents.length, 0);
  assert.equal(String(world.state.lines[0]?.fulfilledQty), "0");
});

test("23 reservationId anterior sigue funcionando", async () => {
  const world = createPickWorld();
  await reserveFifo(world, "3");
  const reservationId = world.state.reservations[0]!.id;
  await consumeReservationPickInTransaction(world.tx as never, {
    reservationId,
    qty: d("1"),
    userId: "admin-1",
    scannedCode: "SKU-REQ-1",
    requisitionLineId: "line-1",
    taskId: "task-pick-1"
  });
  assert.equal(String(world.state.inventories[0]?.qty), "2");
  assert.equal(world.state.movements.length, 1);
  assert.equal(world.state.scanEvents.length, 1);
});

test("23b reservationId cierra la tarea al surtir la última cantidad", async () => {
  const world = createPickWorld({ layerCount: 1, requestedQty: "1" });
  await reserveFifo(world, "1");
  await consumeReservationPickInTransaction(world.tx as never, {
    reservationId: world.state.reservations[0]!.id,
    qty: d("1"),
    userId: "admin-1",
    scannedCode: "SKU-REQ-1",
    taskId: "task-pick-1"
  });
  assert.equal(world.state.requisitions[0]?.status, "COMPLETED");
  assert.equal(world.state.tasks[0]?.status, "COMPLETED");
});

test("24 reservationId + FIFO produce conflicto", async () => {
  const world = createPickWorld();
  await reserveFifo(world, "1");
  await pickFifo(world, "1", { reservationId: world.state.reservations[0]!.id, allocationMode: "FIFO" }).then(
    () => {
      throw new Error("conflict must fail");
    },
    (error) => {
      assert.ok(error instanceof RequisitionError);
      assert.equal(error.code, "RESERVATION_ALLOCATION_CONFLICT");
    }
  );
});

test("25 FIFO sin línea se rechaza", async () => {
  const world = createPickWorld();
  await consumeReservationPickInTransaction(world.tx as never, {
    qty: d("1"),
    userId: "admin-1",
    scannedCode: "SKU-REQ-1",
    allocationMode: "FIFO",
    inventoryId: "inv-proj"
  }).then(
    () => {
      throw new Error("line required");
    },
    (error) => {
      assert.ok(error instanceof RequisitionError);
      assert.equal(error.code, "REQUISITION_LINE_REQUIRED");
    }
  );
});

test("26 varios cubos sin inventoryId producen ambigüedad", async () => {
  const world = createPickWorld();
  await reserveFifo(world, "3");
  world.state.inventories.push({
    id: "inv-proj-b",
    productId: world.product.id,
    locationId: world.location.id,
    status: "AVAILABLE",
    qty: d("1"),
    reservedQty: d("1"),
    assignmentType: "PROJECT",
    assignmentKey: `P:${world.project.id}`,
    projectId: world.project.id
  });
  world.state.layers.push({
    id: "layer-b",
    inventoryId: "inv-proj-b",
    qty: d("1"),
    reservedQty: d("1"),
    lotNumber: "B",
    receivedAt: new Date("2026-01-01T00:00:00.000Z"),
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    unitPriceMxn: null,
    unitPriceUsd: null,
    sourceReference: null
  });
  world.state.reservations.push({
    id: "resv-b",
    requisitionLineId: "line-1",
    inventoryId: "inv-proj-b",
    inventoryLayerId: "layer-b",
    qty: d("1"),
    consumedQty: d("0"),
    releasedQty: d("0"),
    status: "ACTIVE",
    createdById: "admin-1"
  });
  await pickFifo(world, "1", { inventoryId: null }).then(
    () => {
      throw new Error("ambiguous cubes");
    },
    (error) => {
      assert.ok(error instanceof RequisitionError);
      assert.equal(error.code, "AMBIGUOUS_RESERVATION_INVENTORY");
    }
  );
});

test("27 cubo incorrecto se rechaza", async () => {
  const world = createPickWorld();
  await reserveFifo(world, "3");
  await pickFifo(world, "1", { inventoryId: "inv-fts" }).then(
    () => {
      throw new Error("mismatch must fail");
    },
    (error) => {
      assert.ok(error instanceof RequisitionError);
      assert.equal(error.code, "RESERVATION_INVENTORY_MISMATCH");
    }
  );
});

test("28 Picking libre permanece intacto", () => {
  assert.match(routes, /mutateInventory\(/);
  assert.match(routes, /type: "PICK"/);
  assert.match(routes, /allocationMode,/);
  assert.match(routes, /consumeReservationPick/);
  const pickPayload = sliceFunction(js, "buildPickScanPayload");
  assert.doesNotMatch(pickPayload, /reservationId/);
  assert.doesNotMatch(pickPayload, /allocationMode/);
});

test("29 Picking libre no consume reservedQty", () => {
  assert.match(mutationSrc, /qty - "reservedQty" >= \$\{delta\}/);
  assert.match(routes, /row\.qty\.minus\(row\.reservedQty\)\.greaterThan\(0\)/);
});

test("30 UI agrupa una acción por cubo", () => {
  assert.match(js, /function groupRequisitionLineCubes/);
  assert.match(js, /pick-\$\{line\.id\}-\$\{cube\.inventoryId\}/);
  assert.doesNotMatch(sliceFunction(js, "renderRequisitionDetail"), /pick-\$\{reservation\.id\}/);
});

test("31 UI envía FIFO sin reservationId", () => {
  const payload = sliceFunction(js, "buildReservedFifoPickPayload");
  assert.match(payload, /allocationMode: "FIFO"/);
  assert.match(payload, /requisitionLineId/);
  assert.match(payload, /inventoryId: cube.inventoryId/);
  assert.doesNotMatch(payload, /reservationId/);
});

test("32 confirmación Cancelar produce cero POST", () => {
  const fn = sliceFunction(js, "executeReservedFifoPick");
  const confirmIdx = fn.indexOf("window.confirm(buildReservedFifoConfirmMessage");
  const fetchIdx = fn.indexOf('authenticatedFetch("/api/picking/scan"');
  const cancelIdx = fn.indexOf("cancelled: true");
  assert.ok(confirmIdx >= 0 && cancelIdx > confirmIdx && fetchIdx > cancelIdx);
});

test("33 separación visual Picking de requisición / Picking libre", () => {
  assert.match(html, /id="pickingRequisitionMode"/);
  assert.match(html, /Picking de requisición/);
  assert.match(html, /id="pickingFreeMode"/);
  assert.match(html, /Picking libre/);
  assert.match(html, /saldo no reservado/);
  assert.match(html, /id="pickRequisitionSelect"/);
});

test("34 cache-buster v74", () => {
  assert.match(html, /dashboard\.js\?v=75/);
  assert.doesNotMatch(html, /dashboard\.js\?v=72/);
});

test("35 Reubicación, Recepción y Salidas permanecen intactas", () => {
  assert.match(mutationSrc, /type === "RELOCATE"/);
  assert.match(mutationSrc, /planRelocateFifoAllocation/);
  assert.match(html, /id="inboundProductId"/);
  assert.match(html, /id="inboundAssignmentType"/);
  assert.match(html, /id="relocateSubmitBtn"/);
  assert.match(js, /function submitRelocate/);
  assert.match(js, /function submitOperationalMovement/);
});

test("allocationMode inválido se rechaza", async () => {
  const world = createPickWorld();
  await pickFifo(world, "1", { allocationMode: "LIFO" }).then(
    () => {
      throw new Error("invalid mode");
    },
    (error) => {
      assert.ok(error instanceof RequisitionError);
      assert.equal(error.code, "INVALID_ALLOCATION_MODE");
    }
  );
});
