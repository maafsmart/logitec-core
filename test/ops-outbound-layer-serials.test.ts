import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { Prisma } from "@prisma/client";
import { createMovementSchema } from "../src/modules/inventory/inventory-movement.schema.js";
import { InventoryMutationError } from "../src/modules/inventory/inventory-errors.js";
import { mutateInventoryInTransaction } from "../src/modules/inventory/inventory-mutation.service.js";

const html = readFileSync(new URL("../public/dashboard.html", import.meta.url), "utf8");
const js = readFileSync(new URL("../public/dashboard.js", import.meta.url), "utf8");
const routes = readFileSync(new URL("../src/modules/inventory/inventory.routes.ts", import.meta.url), "utf8");
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

function createOutboundTx(opts?: {
  layers?: Array<{ id: string; qty: string; reserved?: string; lot?: string | null }>;
  serials?: SerialRow[];
  qty?: string;
  reserved?: string;
  clientId?: string;
  productId?: string;
}) {
  const locFrom = { id: "loc-1", code: "AN20-B", warehouse: "TULTITLAN24" };
  const product = {
    id: opts?.productId ?? "prod-1",
    sku: "AN20-B",
    name: "Radio",
    customerId: "cust-aviat",
    customer: { id: "cust-aviat", clientId: "client-aviat" }
  };
  const clientId = opts?.clientId ?? "client-aviat";
  const assignmentType = "FREE_TO_SALE" as const;
  const assignmentKey = `FREE_TO_SALE:${clientId}`;
  const receivedAt = new Date("2026-03-01T00:00:00Z");
  const layerDefs = opts?.layers ?? [{ id: "layer-a", qty: opts?.qty ?? "10", reserved: opts?.reserved ?? "0", lot: "L-1" }];
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
        projectId: null as string | null,
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
      create: async () => ({ id: `scan-${state.nextId++}` })
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

async function outboundQty(
  tx: unknown,
  qty: string,
  extra: { layerId?: string; serialIds?: string[]; productId?: string } = {}
) {
  return mutateInventoryInTransaction(tx as never, {
    type: "OUT",
    productId: extra.productId ?? "prod-1",
    inventoryId: "inv-src",
    layerId: extra.layerId,
    serialIds: extra.serialIds,
    qty: d(qty),
    userId: "admin-1",
    reference: "OUT-TEST",
    notes: "qa",
    activity: { type: "OUTBOUND", subtype: "MANUAL_OUT", userId: "admin-1", result: "OK" }
  });
}

test("schema OUT acepta serialIds y los rechaza en IN", () => {
  const out = createMovementSchema.safeParse({
    sku: "AN20-B",
    type: "OUT",
    quantity: 2,
    inventoryId: "inv-1",
    layerId: "layer-1",
    serialIds: ["ser-a", "ser-b"]
  });
  assert.equal(out.success, true, out.success ? "" : JSON.stringify(out.error.issues));
  const inbound = createMovementSchema.safeParse({
    sku: "AN20-B",
    type: "IN",
    quantity: 1,
    location: "AN20-B",
    assignmentType: "FREE_TO_SALE",
    clientId: "client-aviat",
    serialIds: ["ser-a"]
  });
  assert.equal(inbound.success, false);
});

test("a) OUT con lote único descuenta esa capa", async () => {
  const world = createOutboundTx({ layers: [{ id: "layer-a", qty: "10", lot: "L-UNICO" }] });
  const result = await outboundQty(world.tx, "3", { layerId: "layer-a" });
  assert.equal(String(result.after), "7");
  assert.equal(String(world.state.layers[0]?.qty), "7");
  assert.equal(world.state.movements.length, 1);
  assert.equal(world.state.movements[0]?.movementType, "OUT");
  assert.equal(world.state.movements[0]?.inventoryLayerId, "layer-a");
});

test("b) OUT con 2 lotes exige layerId y usa la capa indicada", async () => {
  const world = createOutboundTx({
    layers: [
      { id: "layer-a", qty: "4", lot: "L-A" },
      { id: "layer-b", qty: "6", lot: "L-B" }
    ]
  });
  await outboundQty(world.tx, "2").then(
    () => {
      throw new Error("should require layerId");
    },
    (error) => {
      assert.ok(error instanceof InventoryMutationError);
      assert.equal(error.code, "AMBIGUOUS_LAYER");
    }
  );
  assert.equal(String(world.state.inventories[0]?.qty), "10");
  await outboundQty(world.tx, "2", { layerId: "layer-b" });
  assert.equal(String(world.state.layers.find((layer) => layer.id === "layer-a")?.qty), "4");
  assert.equal(String(world.state.layers.find((layer) => layer.id === "layer-b")?.qty), "4");
  assert.equal(String(world.state.inventories[0]?.qty), "8");
});

test("c) OUT serializado sin serialIds queda bloqueado", async () => {
  const world = createOutboundTx({
    layers: [{ id: "layer-a", qty: "2" }],
    serials: [
      { id: "ser-a", productId: "prod-1", clientId: "client-aviat", inventoryLayerId: "layer-a", serialNumber: "SN-A", imei: null },
      { id: "ser-b", productId: "prod-1", clientId: "client-aviat", inventoryLayerId: "layer-a", serialNumber: "SN-B", imei: null }
    ]
  });
  await outboundQty(world.tx, "1", { layerId: "layer-a" }).then(
    () => {
      throw new Error("serialized out without serialIds should fail");
    },
    (error) => {
      assert.ok(error instanceof InventoryMutationError);
      assert.equal(error.code, "SERIAL_SELECTION_REQUIRED");
    }
  );
  assert.equal(String(world.state.inventories[0]?.qty), "2");
  assert.equal(world.state.serials.filter((serial) => serial.inventoryLayerId === "layer-a").length, 2);
  assert.equal(world.state.movements.length, 0);
});

test("d) serialIds exactos descuentan solo esas series y conservan trazabilidad", async () => {
  const world = createOutboundTx({
    layers: [{ id: "layer-a", qty: "3" }],
    serials: [
      { id: "ser-a", productId: "prod-1", clientId: "client-aviat", inventoryLayerId: "layer-a", serialNumber: "SN-A", imei: "IMEI-A" },
      { id: "ser-b", productId: "prod-1", clientId: "client-aviat", inventoryLayerId: "layer-a", serialNumber: "SN-B", imei: null },
      { id: "ser-c", productId: "prod-1", clientId: "client-aviat", inventoryLayerId: "layer-a", serialNumber: "SN-C", imei: null }
    ]
  });
  const result = await outboundQty(world.tx, "2", { layerId: "layer-a", serialIds: ["ser-b", "ser-a"] });
  assert.equal(String(result.after), "1");
  assert.equal(world.state.serials.find((serial) => serial.id === "ser-a")?.inventoryLayerId, null);
  assert.equal(world.state.serials.find((serial) => serial.id === "ser-b")?.inventoryLayerId, null);
  assert.equal(world.state.serials.find((serial) => serial.id === "ser-c")?.inventoryLayerId, "layer-a");
  assert.equal(world.state.movements.length, 2);
  assert.ok(world.state.movements.every((row) => row.inventorySerialId));
  assert.ok(world.state.movements.every((row) => row.inventoryLayerId === "layer-a"));
  assert.ok(world.state.movements.every((row) => row.movementType === "OUT"));
  assert.deepEqual(
    world.state.movements.map((row) => row.inventorySerialId).sort(),
    ["ser-a", "ser-b"]
  );
  assert.equal(world.state.activities.length, 1);
});

test("e) serie de otra capa/cliente/SKU se rechaza", async () => {
  const otherLayer = createOutboundTx({
    layers: [
      { id: "layer-a", qty: "1" },
      { id: "layer-b", qty: "1" }
    ],
    serials: [
      { id: "ser-a", productId: "prod-1", clientId: "client-aviat", inventoryLayerId: "layer-a", serialNumber: "SN-A", imei: null },
      { id: "ser-other-layer", productId: "prod-1", clientId: "client-aviat", inventoryLayerId: "layer-b", serialNumber: "SN-B", imei: null }
    ]
  });
  await outboundQty(otherLayer.tx, "1", { layerId: "layer-a", serialIds: ["ser-other-layer"] }).then(
    () => {
      throw new Error("other layer should fail");
    },
    (error) => {
      assert.ok(error instanceof InventoryMutationError);
      assert.equal(error.code, "SERIAL_LAYER_MISMATCH");
    }
  );

  const otherClient = createOutboundTx({
    layers: [{ id: "layer-a", qty: "1" }],
    serials: [
      { id: "ser-x", productId: "prod-1", clientId: "client-other", inventoryLayerId: "layer-a", serialNumber: "SN-X", imei: null }
    ]
  });
  await outboundQty(otherClient.tx, "1", { layerId: "layer-a", serialIds: ["ser-x"] }).then(
    () => {
      throw new Error("other client should fail");
    },
    (error) => {
      assert.ok(error instanceof InventoryMutationError);
      assert.equal(error.code, "SERIAL_SOURCE_MISMATCH");
    }
  );

  const otherSku = createOutboundTx({
    layers: [{ id: "layer-a", qty: "1" }],
    serials: [
      { id: "ser-sku", productId: "prod-other", clientId: "client-aviat", inventoryLayerId: "layer-a", serialNumber: "SN-SKU", imei: null }
    ]
  });
  await outboundQty(otherSku.tx, "1", { layerId: "layer-a", serialIds: ["ser-sku"] }).then(
    () => {
      throw new Error("other sku should fail");
    },
    (error) => {
      assert.ok(error instanceof InventoryMutationError);
      assert.equal(error.code, "SERIAL_SOURCE_MISMATCH");
    }
  );
  assert.equal(otherLayer.state.movements.length, 0);
  assert.equal(otherClient.state.movements.length, 0);
  assert.equal(otherSku.state.movements.length, 0);
});

test("f) UI muestra lote y checklist, invalida stale y bloquea botón", () => {
  assert.match(html, /id="outboundLayerSelect"/);
  assert.match(html, /id="outboundLayerId"/);
  assert.match(html, /id="outboundSerialPicker"/);
  assert.match(html, /Lote \/ Entrada/);
  const loadLayersSrc = sliceFunction(js, "loadOutboundLayersForSelectedCube");
  const loadSerialsSrc = sliceFunction(js, "loadOutboundSerialsForSelectedLayer");
  const syncSrc = sliceFunction(js, "syncOutboundSubmitEnabled");
  const submitSrc = sliceFunction(js, "submitOperationalMovement");
  const clearSrc = sliceFunction(js, "clearOutboundInventorySelection");
  assert.match(loadLayersSrc, /\/api\/inventory\/stock\/\$\{encodeURIComponent\(inventoryId\)\}\/layers/);
  assert.match(loadLayersSrc, /layers\.length === 1/);
  assert.match(loadLayersSrc, /setOutboundLayerSelection\(layers\[0\]\)/);
  assert.match(loadLayersSrc, /sel\.value = ""/);
  assert.match(loadLayersSrc, /seq !== outboundCubeLoadSeq/);
  assert.doesNotMatch(loadLayersSrc, /layers\[0\].*length > 1/);
  assert.match(loadSerialsSrc, /\/api\/inventory\/layers\/\$\{encodeURIComponent\(layerId\)\}\/serials/);
  assert.match(loadSerialsSrc, /seq !== outboundLayerSerialSeq/);
  assert.match(loadSerialsSrc, /Selecciona los números de serie a despachar/);
  assert.match(js, /outboundSerialsBlockOutbound/);
  assert.match(syncSrc, /outboundLayerId/);
  assert.match(syncSrc, /outboundSerialsBlockOutbound/);
  assert.match(submitSrc, /payload\.layerId = outboundLayerId/);
  assert.match(submitSrc, /payload\.serialIds = outboundSerialIds/);
  assert.match(submitSrc, /outboundSerialsBlockOutbound/);
  assert.match(clearSrc, /bumpOutboundCubeLoadSeq/);
  assert.match(clearSrc, /clearOutboundLayerAndSerials/);
  assert.match(js, /bumpOutboundCubeLoadSeq\(\)/);
  assert.match(js, /clearOutboundLayerAndSerials\(\)/);
  assert.match(routes, /inventoryRouter\.get\("\/layers\/:layerId\/serials"/);
  assert.match(routes, /assertAccessibleSerial\(req\.auth!, serialId/);
  assert.match(routes, /serialIds: body\.type === "OUT" \? body\.serialIds/);
});

test("g) reubicación serializada, picking FIFO y salidas no serializadas siguen intactos", () => {
  assert.match(mutationSrc, /if \(input.type === "RELOCATE"\)/);
  assert.match(mutationSrc, /allocationMode === "FIFO"/);
  assert.match(mutationSrc, /moved.count !== layerSerials.length/);
  assert.match(mutationSrc, /inventorySerialId: serial.id/);
  assert.match(js, /function relocateSelectedSerialIds\(/);
  assert.match(js, /Selecciona los números de serie a reubicar/);
  assert.match(routes, /inventoryRouter.post\("\/relocate"/);
  assert.match(routes, /serialIds: body.serialIds/);
  assert.match(js, /function executeReservedFifoPick\(/);
  assert.match(html, /id="inboundAssignmentType"/);
  assert.match(html, /id="relocateSubmitBtn"/);
  assert.match(mutationSrc, /await assertNoSerialAmbiguity\(tx, layer.id\)/);
  assert.match(html, /dashboard\.js\?v=96/);
});

test("ruta de series por capa no lista otras capas y cache-buster v=96", () => {
  const start = routes.indexOf('inventoryRouter.get("/layers/:layerId/serials"');
  assert.ok(start >= 0);
  const chunk = routes.slice(start, start + 1200);
  assert.match(chunk, /inventoryLayerId: layerId/);
  assert.match(chunk, /clientSerialWhere\(req.auth!\)/);
  assert.match(chunk, /assertAccessibleLayer/);
  assert.match(html, /dashboard\.js\?v=96/);
  assert.doesNotMatch(html, /dashboard\.js\?v=94/);
  assert.doesNotMatch(html, /dashboard\.js\?v=93/);
});

test("h) FREE TO SALE no exige proyecto para habilitar submit; PROJECT sí", () => {
  const syncSrc = sliceFunction(js, "syncOutboundSubmitEnabled");
  const setCubeSrc = sliceFunction(js, "setOutboundInventoryFromCube");
  const submitSrc = sliceFunction(js, "submitOperationalMovement");
  const clearSrc = sliceFunction(js, "clearOutboundInventorySelection");
  const projectReadySrc = sliceFunction(js, "outboundProjectReady");
  const assignmentSrc = sliceFunction(js, "outboundSelectedAssignmentType");

  assert.match(setCubeSrc, /dataset\.outboundAssignmentType/);
  assert.match(setCubeSrc, /assignmentType === "FREE_TO_SALE"/);
  assert.match(setCubeSrc, /projectSel\.value = ""/);
  assert.doesNotMatch(setCubeSrc, /projectSel\.value = "[A-Z0-9_-]+"/);
  assert.match(clearSrc, /clearOutboundAssignmentType/);
  assert.match(syncSrc, /outboundProjectReady\(\)/);
  assert.doesNotMatch(syncSrc, /Boolean\(customerCode\)/);
  assert.match(submitSrc, /outboundProjectReady\(\)/);
  assert.match(submitSrc, /Seleccione un proyecto/);
  assert.match(projectReadySrc, /FREE_TO_SALE/);
  assert.match(projectReadySrc, /outboundCustomer/);
  assert.match(projectReadySrc, /SMART_OTHER/);

  const SMART_OTHER = "__OTHER__";
  const outboundProjectReady = new Function(
    "document",
    "SMART_OTHER",
    `${assignmentSrc}\n${projectReadySrc}\nreturn outboundProjectReady;`
  );

  function projectReady({ assignmentType = "", customer = "" } = {}) {
    const document = {
      getElementById(id: string) {
        if (id === "outboundInventoryId") {
          return { dataset: { outboundAssignmentType: assignmentType }, value: "inv-1" };
        }
        if (id === "outboundCustomer") return { value: customer };
        return null;
      }
    };
    return outboundProjectReady(document, SMART_OTHER)();
  }

  assert.equal(projectReady({ assignmentType: "FREE_TO_SALE", customer: "" }), true);
  assert.equal(projectReady({ assignmentType: "FREE_TO_SALE", customer: SMART_OTHER }), true);
  assert.equal(projectReady({ assignmentType: "PROJECT", customer: "" }), false);
  assert.equal(projectReady({ assignmentType: "PROJECT", customer: SMART_OTHER }), false);
  assert.equal(projectReady({ assignmentType: "PROJECT", customer: "PROJ-1" }), true);
  assert.equal(projectReady({ assignmentType: "", customer: "" }), false);
  assert.equal(projectReady({ assignmentType: "", customer: "PROJ-1" }), true);
});

test("i) serials loading/error bloquean submit; ready 0 series no exige checklist", () => {
  const loadSerialsSrc = sliceFunction(js, "loadOutboundSerialsForSelectedLayer");
  const blockSrc = sliceFunction(js, "outboundSerialsBlockOutbound");
  const bumpCubeSrc = sliceFunction(js, "bumpOutboundCubeLoadSeq");
  const bumpLayerSrc = sliceFunction(js, "bumpOutboundLayerSerialSeq");
  const selectedSrc = sliceFunction(js, "outboundSelectedSerialIds");
  const requiredSrc = sliceFunction(js, "outboundSerialsRequired");
  const syncSrc = sliceFunction(js, "syncOutboundSubmitEnabled");

  assert.match(js, /outboundSerialsLoadState = "ready"/);
  assert.match(loadSerialsSrc, /outboundSerialsLoadState = "loading"/);
  assert.match(loadSerialsSrc, /Cargando series disponibles/);
  assert.match(loadSerialsSrc, /outboundSerialsLoadState = "error"/);
  assert.match(loadSerialsSrc, /outboundSerialsLoadState = "ready"/);
  assert.match(bumpCubeSrc, /outboundSerialsLoadState = "loading"/);
  assert.match(bumpLayerSrc, /outboundSerialsLoadState = "loading"/);
  assert.match(blockSrc, /outboundSerialsLoadState === "loading"/);
  assert.match(blockSrc, /outboundSerialsLoadState === "error"/);
  assert.match(blockSrc, /outboundSerialsRequired/);
  assert.match(blockSrc, /ids\.length !== qty/);
  assert.match(syncSrc, /outboundSerialsBlockOutbound/);

  const errorIdx = loadSerialsSrc.indexOf('outboundSerialsLoadState = "error"');
  const errorSeqIdx = loadSerialsSrc.lastIndexOf("seq !== outboundLayerSerialSeq", errorIdx);
  assert.ok(errorSeqIdx >= 0 && errorSeqIdx < errorIdx, "error state must follow seq guard");
  const readyIdx = loadSerialsSrc.indexOf('outboundSerialsLoadState = "ready"');
  const readySeqIdx = loadSerialsSrc.lastIndexOf("seq !== outboundLayerSerialSeq", readyIdx);
  assert.ok(readySeqIdx >= 0 && readySeqIdx < readyIdx, "ready state must follow seq guard");

  const outboundSerialsBlockOutbound = new Function(
    "document",
    "outboundSerialsLoadState",
    `${selectedSrc}\n${requiredSrc}\n${blockSrc}\nreturn outboundSerialsBlockOutbound;`
  );

  function block({
    state,
    serialCount = 0,
    checked = 0,
    qty = "1"
  }: {
    state: "loading" | "error" | "ready";
    serialCount?: number;
    checked?: number;
    qty?: string;
  }) {
    const boxes = Array.from({ length: serialCount }, (_, i) => ({
      checked: i < checked,
      dataset: { outboundSerialId: `ser-${i}` }
    }));
    const document = {
      getElementById(id: string) {
        if (id === "outboundSerialPicker") {
          return {
            querySelectorAll(selector: string) {
              if (String(selector).includes(":checked")) return boxes.filter((row) => row.checked);
              return boxes;
            }
          };
        }
        if (id === "outboundQty") return { value: qty };
        return null;
      }
    };
    return outboundSerialsBlockOutbound(document, state)();
  }

  assert.equal(block({ state: "loading", serialCount: 0, qty: "2" }), true);
  assert.equal(block({ state: "error", serialCount: 0, qty: "2" }), true);
  assert.equal(block({ state: "ready", serialCount: 0, qty: "2" }), false);
  assert.equal(block({ state: "ready", serialCount: 2, checked: 0, qty: "2" }), true);
  assert.equal(block({ state: "ready", serialCount: 2, checked: 1, qty: "2" }), true);
  assert.equal(block({ state: "ready", serialCount: 2, checked: 2, qty: "2" }), false);
  assert.equal(block({ state: "loading", serialCount: 2, checked: 2, qty: "2" }), true);
  assert.equal(block({ state: "error", serialCount: 2, checked: 2, qty: "2" }), true);
});
