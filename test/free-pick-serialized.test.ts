import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { Prisma } from "@prisma/client";
import { InventoryMutationError } from "../src/modules/inventory/inventory-errors.js";
import { mutateInventoryInTransaction } from "../src/modules/inventory/inventory-mutation.service.js";

const html = readFileSync(new URL("../public/dashboard.html", import.meta.url), "utf8");
const js = readFileSync(new URL("../public/dashboard.js", import.meta.url), "utf8");
const pickingRoutes = readFileSync(new URL("../src/modules/picking/picking.routes.ts", import.meta.url), "utf8");
const mutationSrc = readFileSync(
  new URL("../src/modules/inventory/inventory-mutation.service.ts", import.meta.url),
  "utf8"
);
const guardSrc = readFileSync(new URL("../src/modules/inventory/inventory-serial-guard.ts", import.meta.url), "utf8");
const reqService = readFileSync(new URL("../src/modules/requisitions/requisition.service.ts", import.meta.url), "utf8");

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
  return { text: String(query ?? ""), values };
}

type SerialRow = {
  id: string;
  productId: string;
  clientId: string;
  inventoryLayerId: string | null;
  serialNumber: string;
  imei: string | null;
};

function createPickTx(opts?: {
  layers?: Array<{ id: string; qty: string; reserved?: string; lot?: string | null }>;
  serials?: SerialRow[];
  qty?: string;
  reserved?: string;
  clientId?: string;
  productId?: string;
}) {
  const locFrom = { id: "loc-1", code: "AN13-B", warehouse: "TULTITLAN24" };
  const product = {
    id: opts?.productId ?? "prod-1",
    sku: "W42-7H06-DPX",
    name: "Radio serializado",
    customerId: "cust-att",
    customer: { id: "cust-att", clientId: "client-att" }
  };
  const clientId = opts?.clientId ?? "client-att";
  const assignmentType = "PROJECT" as const;
  const assignmentKey = `PROJECT:proj-att`;
  const receivedAt = new Date("2026-03-01T00:00:00Z");
  const layerDefs = opts?.layers ?? [{ id: "layer-a", qty: opts?.qty ?? "6", reserved: opts?.reserved ?? "0", lot: "L-1" }];
  const totalQty = layerDefs.reduce((sum, layer) => sum.plus(d(layer.qty)), d("0"));
  const state = {
    inventories: [
      {
        id: "inv-src",
        productId: product.id,
        locationId: locFrom.id,
        status: "AVAILABLE",
        qty: totalQty,
        reservedQty: d(opts?.reserved ?? "0"),
        assignmentType,
        assignmentKey,
        projectId: "proj-att" as string | null,
        clientId
      }
    ],
    layers: layerDefs.map((layer) => ({
      id: layer.id,
      inventoryId: "inv-src",
      qty: d(layer.qty),
      reservedQty: d(layer.reserved ?? "0"),
      lotNumber: layer.lot === undefined ? "L-1" : layer.lot,
      receivedAt,
      unitPriceMxn: d("100"),
      unitPriceUsd: null as Prisma.Decimal | null,
      sourceReference: "ENTRADA_OPERATIVA",
      sourceType: "MANUAL_IN",
      createdAt: receivedAt
    })),
    serials: (opts?.serials ?? []).map((serial) => ({ ...serial })),
    movements: [] as Array<Record<string, unknown>>,
    activities: [] as Array<Record<string, unknown>>,
    scanEvents: [] as Array<Record<string, unknown>>,
    nextId: 1
  };

  function hydrateInventory(row: (typeof state.inventories)[0]) {
    return { ...row, location: locFrom, product };
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
        return null;
      },
      findUniqueOrThrow: async ({ where }: { where: { id: string } }) => {
        const found = state.inventories.find((row) => row.id === where.id);
        if (!found) throw new Error("inventory not found");
        return hydrateInventory(found);
      }
    },
    inventoryStatusDefinition: {
      findUnique: async () => ({ code: "AVAILABLE", pickable: true })
    },
    inventoryLayer: {
      findMany: async ({
        where
      }: {
        where: { inventoryId?: string; id?: { in: string[] }; qty?: { gt: Prisma.Decimal } };
      }) =>
        state.layers
          .filter((layer) => !where.inventoryId || layer.inventoryId === where.inventoryId)
          .filter((layer) => !where.id?.in || where.id.in.includes(layer.id))
          .filter((layer) => !where.qty?.gt || layer.qty.greaterThan(where.qty.gt))
          .map((layer) => ({ ...layer })),
      findUnique: async ({ where }: { where: { id: string } }) => {
        const found = state.layers.find((layer) => layer.id === where.id);
        return found ? { ...found } : null;
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
        state.serials.filter((serial) => serial.inventoryLayerId === where.inventoryLayerId).length,
      findMany: async ({
        where
      }: {
        where: { id?: { in: string[] }; inventoryLayerId?: string };
        select?: Record<string, boolean>;
      }) =>
        state.serials
          .filter((serial) => !where.id?.in || where.id.in.includes(serial.id))
          .filter((serial) => !where.inventoryLayerId || serial.inventoryLayerId === where.inventoryLayerId)
          .map((serial) => ({ ...serial })),
      updateMany: async ({
        where,
        data
      }: {
        where: { id?: string | { in: string[] }; inventoryLayerId?: string };
        data: { inventoryLayerId: string | null };
      }) => {
        const ids = typeof where.id === "string" ? [where.id] : where.id?.in || [];
        let count = 0;
        for (const serial of state.serials) {
          if (ids.length && !ids.includes(serial.id)) continue;
          if (where.inventoryLayerId && serial.inventoryLayerId !== where.inventoryLayerId) continue;
          serial.inventoryLayerId = data.inventoryLayerId;
          count += 1;
        }
        return { count };
      }
    },
    activityLog: {
      create: async ({ data }: { data?: Record<string, unknown> } = {}) => {
        state.activities.push(data ?? {});
        return { id: `act-${state.nextId++}` };
      }
    },
    scanEvent: {
      create: async ({ data }: { data?: Record<string, unknown> } = {}) => {
        const created = { id: `scan-${state.nextId++}`, ...data };
        state.scanEvents.push(created);
        return created;
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
      if (text.includes("InventorySerial") && text.includes("FOR UPDATE")) {
        return state.serials.map((serial) => ({ id: serial.id }));
      }
      if (text.includes("FOR UPDATE") && text.includes("InventoryLayer")) {
        return state.layers.map((layer) => ({ id: layer.id }));
      }
      if (text.includes("FOR UPDATE")) return state.inventories.map((row) => ({ id: row.id }));
      return [];
    }
  };

  return { tx, state, product };
}

function layerSerials(count: number, layerId = "layer-a"): SerialRow[] {
  return Array.from({ length: count }, (_, idx) => ({
    id: `ser-${idx + 1}`,
    productId: "prod-1",
    clientId: "client-att",
    inventoryLayerId: layerId,
    serialNumber: `SN-${idx + 1}`,
    imei: idx === 0 ? "IMEI-1" : null
  }));
}

async function pickQty(
  tx: unknown,
  qty: string,
  extra: { layerId?: string; serialIds?: string[]; scannedCode?: string } = {}
) {
  return mutateInventoryInTransaction(tx as never, {
    type: "PICK",
    productId: "prod-1",
    inventoryId: "inv-src",
    layerId: extra.layerId,
    serialIds: extra.serialIds,
    qty: d(qty),
    userId: "op-1",
    reference: "PICK_SCAN",
    notes: "qa free pick",
    scannedCode: extra.scannedCode ?? "W42-7H06-DPX",
    activity: { type: "PICK", subtype: "PICK_SUCCESS", userId: "op-1", result: "OK" }
  });
}

test("UI picking libre muestra checklist/escaneo de series y cache-buster v=96", () => {
  assert.match(html, /id="pickSerialOptions"/);
  assert.match(html, /dashboard\.js\?v=96/);
  assert.match(html, /Si la capa tiene series/);
  assert.match(sliceFunction(js, "loadPickSerialOptions"), /\/api\/inventory\/layers\/\$\{encodeURIComponent\(normalizedLayerId\)\}\/serials/);
  assert.match(sliceFunction(js, "loadPickSerialOptions"), /Escanear serie o IMEI/);
  assert.match(sliceFunction(js, "loadPickSerialOptions"), /data-pick-serial-id/);
  assert.match(sliceFunction(js, "applyPickSerialScan"), /pickSerialNumber/);
  assert.match(sliceFunction(js, "pickSerialsBlockConfirm"), /ids.length !== qty/);
  assert.match(sliceFunction(js, "syncFreePickConfirmEnabled"), /scanBtn.disabled = pickSerialsBlockConfirm/);
  assert.match(sliceFunction(js, "buildPickScanPayload"), /body.serialIds = serialIds.slice/);
  assert.doesNotMatch(sliceFunction(js, "buildPickScanPayload"), /allocationMode/);
  assert.doesNotMatch(sliceFunction(js, "buildPickScanPayload"), /reservationId/);
  assert.match(sliceFunction(js, "renderPickLayerOptions"), /loadPickSerialOptions/);
  assert.match(sliceFunction(js, "prefetchPickLayersForInventory"), /loadPickSerialOptions\(layerId\)/);
  assert.match(js, /pickQty[\s\S]*updatePickSerialCountHint/);
});

test("UI bloquea confirmar con selección incompleta y recupera SERIAL_SELECTION_REQUIRED", () => {
  const scanSrc = sliceFunction(js, "scanCode");
  const blockIdx = scanSrc.indexOf("pickSerialsBlockConfirm()");
  const fetchIdx = scanSrc.indexOf('authenticatedFetch("/api/picking/scan"');
  assert.ok(blockIdx >= 0 && fetchIdx > blockIdx);
  assert.match(scanSrc, /Selecciona o escanea exactamente \$\{needed\} seriales\/IMEI/);
  assert.match(scanSrc, /SERIAL_SELECTION_REQUIRED/);
  const serialErrIdx = scanSrc.indexOf('payload.code === "SERIAL_SELECTION_REQUIRED"');
  const serialReturn = scanSrc.indexOf("return;", serialErrIdx);
  const clearAfterSerial = scanSrc.indexOf("clearPickCandidates()", serialErrIdx);
  assert.ok(serialErrIdx >= 0 && serialReturn >= 0);
  assert.ok(clearAfterSerial < 0 || clearAfterSerial > serialReturn);
  assert.match(scanSrc, /loadPickSerialOptions\(layerId\)/);
  assert.match(scanSrc, /El botón Confirmar se habilita al completar la selección/);
});

test("Backend picking libre acepta serialIds exactos sin allocationMode FIFO", () => {
  assert.match(pickingRoutes, /serialIds.length && allocationMode && allocationMode !== "FIFO"/);
  assert.match(pickingRoutes, /LAYER_REQUIRED_FOR_SERIALS/);
  assert.match(pickingRoutes, /serialIds.length \? serialIds : undefined/);
  assert.match(pickingRoutes, /type: "PICK"/);
  assert.match(mutationSrc, /input.type === "OUT" \|\| input.type === "PICK"/);
  assert.match(mutationSrc, /type: input.type === "PICK" \? "PICK" : "OUTBOUND"/);
  assert.match(guardSrc, /SERIAL_SELECTION_REQUIRED/);
  assert.match(reqService, /serialIds.length && allocationMode !== "FIFO"/);
});

test("Picking libre serializado qty 1 consume esa serie, capa y ScanEvent", async () => {
  const world = createPickTx({
    layers: [{ id: "layer-a", qty: "6" }],
    serials: layerSerials(6)
  });
  const result = await pickQty(world.tx, "1", { layerId: "layer-a", serialIds: ["ser-1"] });
  assert.equal(String(result.after), "5");
  assert.equal(world.state.serials.find((serial) => serial.id === "ser-1")?.inventoryLayerId, null);
  assert.equal(world.state.serials.filter((serial) => serial.inventoryLayerId === "layer-a").length, 5);
  assert.equal(world.state.movements.length, 1);
  assert.equal(world.state.movements[0]?.type, "PICK");
  assert.equal(world.state.movements[0]?.inventorySerialId, "ser-1");
  assert.equal(world.state.movements[0]?.inventoryLayerId, "layer-a");
  assert.equal(world.state.scanEvents.length, 1);
  assert.equal(String(world.state.inventories[0]?.reservedQty), "0");
});

test("Picking libre serializado qty N consume exactamente esas series", async () => {
  const world = createPickTx({
    layers: [{ id: "layer-a", qty: "6" }],
    serials: layerSerials(6)
  });
  const result = await pickQty(world.tx, "3", { layerId: "layer-a", serialIds: ["ser-2", "ser-4", "ser-6"] });
  assert.equal(String(result.after), "3");
  assert.deepEqual(
    world.state.serials.filter((serial) => serial.inventoryLayerId == null).map((serial) => serial.id).sort(),
    ["ser-2", "ser-4", "ser-6"]
  );
  assert.equal(world.state.movements.length, 3);
  assert.ok(world.state.movements.every((row) => row.type === "PICK"));
  assert.ok(world.state.movements.every((row) => row.inventoryLayerId === "layer-a"));
  assert.equal(world.state.activities.length, 1);
});

test("Picking libre serializado sin serialIds queda bloqueado y no muta", async () => {
  const world = createPickTx({
    layers: [{ id: "layer-a", qty: "6" }],
    serials: layerSerials(6)
  });
  await pickQty(world.tx, "1", { layerId: "layer-a" }).then(
    () => {
      throw new Error("serialized free pick without serialIds should fail");
    },
    (error) => {
      assert.ok(error instanceof InventoryMutationError);
      assert.equal(error.code, "SERIAL_SELECTION_REQUIRED");
    }
  );
  assert.equal(String(world.state.inventories[0]?.qty), "6");
  assert.equal(world.state.movements.length, 0);
  assert.equal(world.state.serials.filter((serial) => serial.inventoryLayerId === "layer-a").length, 6);
});

test("Serie de otra capa o cliente se rechaza", async () => {
  const otherLayer = createPickTx({
    layers: [
      { id: "layer-a", qty: "3" },
      { id: "layer-b", qty: "3" }
    ],
    serials: [
      ...layerSerials(3, "layer-a"),
      {
        id: "ser-other-layer",
        productId: "prod-1",
        clientId: "client-att",
        inventoryLayerId: "layer-b",
        serialNumber: "SN-B",
        imei: null
      }
    ]
  });
  await pickQty(otherLayer.tx, "1", { layerId: "layer-a", serialIds: ["ser-other-layer"] }).then(
    () => {
      throw new Error("other layer should fail");
    },
    (error) => {
      assert.ok(error instanceof InventoryMutationError);
      assert.equal(error.code, "SERIAL_LAYER_MISMATCH");
    }
  );

  const otherClient = createPickTx({
    layers: [{ id: "layer-a", qty: "1" }],
    serials: [
      {
        id: "ser-x",
        productId: "prod-1",
        clientId: "client-other",
        inventoryLayerId: "layer-a",
        serialNumber: "SN-X",
        imei: null
      }
    ]
  });
  await pickQty(otherClient.tx, "1", { layerId: "layer-a", serialIds: ["ser-x"] }).then(
    () => {
      throw new Error("other client should fail");
    },
    (error) => {
      assert.ok(error instanceof InventoryMutationError);
      assert.equal(error.code, "SERIAL_SOURCE_MISMATCH");
    }
  );
  assert.equal(otherLayer.state.movements.length, 0);
  assert.equal(otherClient.state.movements.length, 0);
});

test("Qty no entera y duplicados se rechazan", async () => {
  const world = createPickTx({
    layers: [{ id: "layer-a", qty: "6" }],
    serials: layerSerials(6)
  });
  await pickQty(world.tx, "1.5", { layerId: "layer-a", serialIds: ["ser-1"] }).then(
    () => {
      throw new Error("non-integer qty should fail");
    },
    (error) => {
      assert.ok(error instanceof InventoryMutationError);
      assert.equal(error.code, "SERIAL_QTY_NOT_INTEGER");
    }
  );
  await pickQty(world.tx, "2", { layerId: "layer-a", serialIds: ["ser-1", "ser-1"] }).then(
    () => {
      throw new Error("duplicates should fail");
    },
    (error) => {
      assert.ok(error instanceof InventoryMutationError);
      assert.equal(error.code, "SERIAL_DUPLICATE");
    }
  );
  assert.equal(String(world.state.inventories[0]?.qty), "6");
  assert.equal(world.state.movements.length, 0);
});

test("Capa no serializada sigue funcionando y reservedQty no se consume", async () => {
  const plain = createPickTx({
    layers: [{ id: "layer-a", qty: "6" }],
    serials: []
  });
  const picked = await pickQty(plain.tx, "2", { layerId: "layer-a" });
  assert.equal(String(picked.after), "4");
  assert.equal(plain.state.movements.length, 1);
  assert.equal(plain.state.movements[0]?.type, "PICK");
  assert.equal(plain.state.movements[0]?.inventorySerialId, undefined);

  const reserved = createPickTx({
    reserved: "2",
    layers: [{ id: "layer-a", qty: "6", reserved: "2" }],
    serials: layerSerials(6)
  });
  await pickQty(reserved.tx, "5", { layerId: "layer-a", serialIds: ["ser-1", "ser-2", "ser-3", "ser-4", "ser-5"] }).then(
    () => {
      throw new Error("must not consume reserved qty");
    },
    (error) => {
      assert.ok(error instanceof InventoryMutationError);
      assert.equal(error.code, "INSUFFICIENT_STOCK");
    }
  );
  const ok = await pickQty(reserved.tx, "1", { layerId: "layer-a", serialIds: ["ser-1"] });
  assert.equal(String(ok.after), "5");
  assert.equal(String(reserved.state.inventories[0]?.reservedQty), "2");
  assert.equal(String(reserved.state.layers[0]?.reservedQty), "2");
});
