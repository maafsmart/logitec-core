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
const schemaSrc = readFileSync(
  new URL("../src/modules/inventory/inventory-movement.schema.ts", import.meta.url),
  "utf8"
);
const schemaPrisma = readFileSync(new URL("../prisma/schema.prisma", import.meta.url), "utf8");

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

function createInboundTx(opts?: {
  serialControlled?: boolean;
  existingSerials?: SerialRow[];
  failOnSerialCreate?: number;
}) {
  const location = { id: "loc-1", code: "AN1-B", warehouse: "TULTITLAN24" };
  const product = {
    id: "prod-1",
    sku: "307-000013-001",
    name: "Radio serializado",
    serialControlled: Boolean(opts?.serialControlled),
    customerId: "cust-aviat",
    customer: { id: "cust-aviat", clientId: "client-aviat" }
  };
  const aviatProject = {
    id: "proj-att",
    code: "ATT",
    name: "AT&T",
    active: true,
    clientId: "client-aviat"
  };
  const state = {
    inventories: [] as Array<{
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
    layers: [] as Array<{
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
    serials: (opts?.existingSerials ?? []).map((row) => ({ ...row })),
    movements: [] as Array<Record<string, unknown>>,
    activities: [] as Array<Record<string, unknown>>,
    nextId: 1,
    serialCreates: 0
  };

  function hydrateInventory(row: (typeof state.inventories)[0]) {
    return { ...row, location, product };
  }

  const tx = {
    product: {
      findUnique: async ({ where }: { where: { id: string } }) => (where.id === product.id ? product : null)
    },
    customer: {
      findUnique: async ({ where }: { where: { id: string } }) =>
        where.id === aviatProject.id ? aviatProject : where.id === product.customerId ? product.customer : null
    },
    client: {
      findUnique: async ({ where }: { where: { id: string } }) =>
        where.id === "client-aviat"
          ? { id: "client-aviat", code: "AVIAT", name: "AVIAT", tradeName: "AVIAT", legalName: "AVIAT", active: true }
          : null
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
          clientId: String(data.clientId || "client-aviat")
        };
        state.inventories.push(created);
        return hydrateInventory(created);
      }
    },
    inventoryLayer: {
      findMany: async ({ where }: { where: { inventoryId: string } }) =>
        state.layers.filter((layer) => layer.inventoryId === where.inventoryId).map((layer) => ({ ...layer })),
      findUnique: async ({ where }: { where: { id: string } }) =>
        state.layers.find((layer) => layer.id === where.id) || null,
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const created = {
          id: `layer-${state.nextId++}`,
          inventoryId: String(data.inventoryId),
          qty: d(String(data.qty)),
          reservedQty: d(String(data.reservedQty ?? 0)),
          lotNumber: (data.lotNumber as string | null) ?? null,
          receivedAt: (data.receivedAt as Date | null) ?? new Date(),
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
    inventorySerial: {
      findMany: async ({
        where
      }: {
        where: {
          clientId?: string;
          productId?: string;
          OR?: Array<{ serialNumber?: { equals: string }; imei?: { equals: string } }>;
        };
      }) =>
        state.serials.filter((serial) => {
          if (where.clientId && serial.clientId !== where.clientId) return false;
          if (where.productId && serial.productId !== where.productId) return false;
          if (!where.OR?.length) return true;
          return where.OR.some((clause) => {
            if (clause.serialNumber?.equals) {
              return serial.serialNumber.toUpperCase() === clause.serialNumber.equals.toUpperCase();
            }
            if (clause.imei?.equals) {
              return Boolean(serial.imei) && serial.imei!.toUpperCase() === clause.imei.equals.toUpperCase();
            }
            return false;
          });
        }),
      create: async ({ data }: { data: Record<string, unknown> }) => {
        state.serialCreates += 1;
        if (opts?.failOnSerialCreate && state.serialCreates === opts.failOnSerialCreate) {
          throw new Error("SERIAL_CREATE_FAILED");
        }
        const created: SerialRow = {
          id: `ser-${state.nextId++}`,
          productId: String(data.productId),
          clientId: String(data.clientId),
          inventoryLayerId: (data.inventoryLayerId as string | null) ?? null,
          serialNumber: String(data.serialNumber),
          imei: (data.imei as string | null) ?? null
        };
        state.serials.push(created);
        return { ...created, receivedAt: data.receivedAt ?? null };
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
    $queryRaw: async (query: unknown, ...values: unknown[]) => {
      const parts = sqlParts(query, values);
      const text = parts.text;
      const vals = parts.values;
      if (text.includes("InventoryLayer") && text.includes("qty = qty +")) {
        const delta = d(String(vals[0]));
        const id = String(vals[1]);
        const layer = state.layers.find((item) => item.id === id);
        if (!layer) return [];
        layer.qty = layer.qty.plus(delta);
        return [{ id: layer.id, qty: layer.qty, unitPriceMxn: layer.unitPriceMxn }];
      }
      if (text.includes('UPDATE "Inventory"') && text.includes("qty = qty +")) {
        const delta = d(String(vals[0]));
        const id = String(vals[1]);
        const inv = state.inventories.find((item) => item.id === id);
        if (!inv) return [];
        inv.qty = inv.qty.plus(delta);
        return [{ id: inv.id, qty: inv.qty }];
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

  return { tx, state, product, location };
}

async function receiveIn(
  tx: unknown,
  extra: {
    qty?: string;
    serials?: Array<{ serialNumber: string; imei?: string | null }>;
    lotNumber?: string | null;
  } = {}
) {
  return mutateInventoryInTransaction(tx as never, {
    type: "IN",
    productId: "prod-1",
    locationId: "loc-1",
    status: "AVAILABLE",
    qty: d(extra.qty ?? "1"),
    serials: extra.serials,
    lotNumber: extra.lotNumber ?? "LOTE-1",
    reference: "PRUEBA-ENTRADA-01092026",
    userId: "admin-1",
    assignmentType: "FREE_TO_SALE",
    projectId: null,
    clientId: "client-aviat",
    activity: { type: "RECEIVE", subtype: "MANUAL_IN", userId: "admin-1", result: "OK" }
  });
}

test("schema IN acepta serials y rechaza serialIds; OUT no acepta serials", () => {
  const inbound = createMovementSchema.safeParse({
    sku: "307-000013-001",
    type: "IN",
    quantity: 1,
    location: "AN1-B",
    assignmentType: "FREE_TO_SALE",
    clientId: "client-aviat",
    serials: [{ serialNumber: "SN-1", imei: "IMEI-1" }]
  });
  assert.equal(inbound.success, true, inbound.success ? "" : JSON.stringify(inbound.error.issues));
  const inboundIds = createMovementSchema.safeParse({
    sku: "307-000013-001",
    type: "IN",
    quantity: 1,
    location: "AN1-B",
    assignmentType: "FREE_TO_SALE",
    clientId: "client-aviat",
    serialIds: ["ser-1"]
  });
  assert.equal(inboundIds.success, false);
  const outboundSerials = createMovementSchema.safeParse({
    sku: "307-000013-001",
    type: "OUT",
    quantity: 1,
    inventoryId: "inv-1",
    serials: [{ serialNumber: "SN-1" }]
  });
  assert.equal(outboundSerials.success, false);
  assert.match(schemaSrc, /serials solo aplica a entradas/);
  assert.match(schemaSrc, /serialIds solo aplica a salidas/);
  assert.match(routes, /serials: body.type === "IN" \? body.serials : undefined/);
  assert.doesNotMatch(routes, /serialIds: body.type === "IN"/);
  assert.match(schemaPrisma, /model InventorySerial/);
});

test("UI muestra Series / IMEI, bloquea Registrar y usa Lote / Entrada", () => {
  assert.match(html, /id="inboundSerialField"/);
  assert.match(html, /Series \/ IMEI/);
  assert.match(html, /Lote \/ Entrada/);
  assert.doesNotMatch(html.slice(html.indexOf('id="moduleInbound"'), html.indexOf('id="moduleOutbound"')), />\s*capa\s*</i);
  assert.match(sliceFunction(js, "inboundSerialsBlockInbound"), /rows.length !== qty/);
  assert.match(sliceFunction(js, "inboundFormIsComplete"), /inboundSerialsBlockInbound/);
  assert.match(sliceFunction(js, "addInboundSerialFromInputs"), /Esa serie ya está en la captura/);
  assert.match(sliceFunction(js, "submitOperationalMovement"), /payload.serials = inboundCapturedSerials/);
  assert.doesNotMatch(sliceFunction(js, "submitOperationalMovement"), /payload.serialIds.*kind === "in"/);
  assert.match(sliceFunction(js, "buildInboundConfirmMessage"), /inboundPiezasLabel/);
  assert.match(sliceFunction(js, "inboundPiezasLabel"), /1 pieza/);
  assert.match(html, /Agregar pieza/);
  assert.match(mutationSrc, /prisma\.\$transaction/);
  assert.match(html, /dashboard\.js\?v=97/);
});

test("entrada normal no serial no cambia el flujo", async () => {
  const world = createInboundTx({ serialControlled: false });
  const result = await receiveIn(world.tx, { qty: "1" });
  assert.equal(String(result.after), "1");
  assert.equal(world.state.serials.length, 0);
  assert.equal(world.state.movements.length, 1);
  assert.equal(world.state.movements[0]?.movementType, "IN");
  assert.equal(world.state.movements[0]?.inventorySerialId, undefined);
  assert.equal(String(world.state.movements[0]?.qty), "1");
});

test("entrada serial qty 1 crea serie, layer y movimiento con serial individual", async () => {
  const world = createInboundTx({ serialControlled: true });
  const result = await receiveIn(world.tx, {
    qty: "1",
    serials: [{ serialNumber: "SN-1" }]
  });
  assert.equal(String(result.after), "1");
  assert.equal(world.state.serials.length, 1);
  assert.equal(world.state.serials[0]?.serialNumber, "SN-1");
  assert.equal(world.state.serials[0]?.imei, null);
  assert.equal(world.state.serials[0]?.clientId, "client-aviat");
  assert.equal(world.state.serials[0]?.productId, "prod-1");
  assert.equal(world.state.serials[0]?.inventoryLayerId, world.state.layers[0]?.id);
  assert.equal(world.state.movements.length, 1);
  assert.equal(world.state.movements[0]?.inventorySerialId, world.state.serials[0]?.id);
  assert.equal(world.state.movements[0]?.inventoryLayerId, world.state.layers[0]?.id);
  assert.equal(String(world.state.movements[0]?.qty), "1");
});

test("entrada serial qty N y Serie + IMEI quedan en el mismo Lote/Entrada", async () => {
  const world = createInboundTx({ serialControlled: true });
  await receiveIn(world.tx, {
    qty: "2",
    serials: [
      { serialNumber: "SN-A", imei: "IMEI-A" },
      { serialNumber: "SN-B" }
    ],
    lotNumber: "LOTE-ATT"
  });
  assert.equal(String(world.state.inventories[0]?.qty), "2");
  assert.equal(world.state.layers.length, 1);
  assert.equal(world.state.layers[0]?.lotNumber, "LOTE-ATT");
  assert.equal(world.state.serials.length, 2);
  assert.ok(world.state.serials.every((serial) => serial.inventoryLayerId === world.state.layers[0]?.id));
  assert.equal(world.state.serials.find((serial) => serial.serialNumber === "SN-A")?.imei, "IMEI-A");
  assert.equal(world.state.serials.find((serial) => serial.serialNumber === "SN-B")?.imei, null);
  assert.equal(world.state.movements.length, 2);
  assert.ok(world.state.movements.every((row) => row.inventorySerialId));
  assert.equal(world.state.activities.length, 1);
});

test("cantidad distinta, decimal, duplicada, serie existente e IMEI existente se rechazan sin mutar", async () => {
  const world = createInboundTx({ serialControlled: true });
  await receiveIn(world.tx, { qty: "2", serials: [{ serialNumber: "SN-1" }] }).then(
    () => {
      throw new Error("count mismatch should fail");
    },
    (error) => {
      assert.ok(error instanceof InventoryMutationError);
      assert.equal(error.code, "SERIAL_COUNT_MISMATCH");
    }
  );
  await receiveIn(world.tx, { qty: "1.5", serials: [{ serialNumber: "SN-1" }] }).then(
    () => {
      throw new Error("decimal should fail");
    },
    (error) => {
      assert.ok(error instanceof InventoryMutationError);
      assert.equal(error.code, "SERIAL_QTY_NOT_INTEGER");
    }
  );
  await receiveIn(world.tx, {
    qty: "2",
    serials: [
      { serialNumber: "SN-1" },
      { serialNumber: "sn-1" }
    ]
  }).then(
    () => {
      throw new Error("duplicate payload should fail");
    },
    (error) => {
      assert.ok(error instanceof InventoryMutationError);
      assert.equal(error.code, "SERIAL_DUPLICATE");
    }
  );

  const existing = createInboundTx({
    serialControlled: true,
    existingSerials: [
      {
        id: "ser-old",
        productId: "prod-1",
        clientId: "client-aviat",
        inventoryLayerId: "layer-old",
        serialNumber: "SN-OLD",
        imei: "IMEI-OLD"
      }
    ]
  });
  await receiveIn(existing.tx, { qty: "1", serials: [{ serialNumber: "SN-OLD" }] }).then(
    () => {
      throw new Error("existing serial should fail");
    },
    (error) => {
      assert.ok(error instanceof InventoryMutationError);
      assert.equal(error.code, "SERIAL_EXISTS");
    }
  );
  await receiveIn(existing.tx, { qty: "1", serials: [{ serialNumber: "SN-NEW", imei: "IMEI-OLD" }] }).then(
    () => {
      throw new Error("existing imei should fail");
    },
    (error) => {
      assert.ok(error instanceof InventoryMutationError);
      assert.equal(error.code, "IMEI_EXISTS");
    }
  );
  assert.equal(world.state.inventories.length, 0);
  assert.equal(world.state.movements.length, 0);
  assert.equal(existing.state.inventories.length, 0);
  assert.equal(existing.state.movements.length, 0);
});

test("aislamiento: serie de otro cliente no se consulta y no bloquea", async () => {
  const world = createInboundTx({
    serialControlled: true,
    existingSerials: [
      {
        id: "ser-other",
        productId: "prod-1",
        clientId: "client-other",
        inventoryLayerId: "layer-other",
        serialNumber: "SN-SHARED",
        imei: "IMEI-OTHER"
      }
    ]
  });
  await receiveIn(world.tx, { qty: "1", serials: [{ serialNumber: "SN-SHARED" }] });
  assert.equal(world.state.serials.filter((serial) => serial.clientId === "client-aviat").length, 1);
  assert.equal(world.state.serials.filter((serial) => serial.clientId === "client-other").length, 1);
  assert.match(mutationSrc, /clientId, productId, OR: serialOr/);
  assert.doesNotMatch(sliceFunction(mutationSrc, "assertInboundSerialsAvailable"), /clientId:\s*\{/);
});

test("error al crear serie no deja movimiento; validación ocurre antes de incrementar si ya existe", async () => {
  const existing = createInboundTx({
    serialControlled: true,
    existingSerials: [
      {
        id: "ser-old",
        productId: "prod-1",
        clientId: "client-aviat",
        inventoryLayerId: "layer-old",
        serialNumber: "SN-OLD",
        imei: null
      }
    ]
  });
  await receiveIn(existing.tx, { qty: "1", serials: [{ serialNumber: "SN-OLD" }] }).then(
    () => {
      throw new Error("should fail before mutate");
    },
    (error) => {
      assert.equal((error as InventoryMutationError).code, "SERIAL_EXISTS");
    }
  );
  assert.equal(existing.state.inventories.length, 0);
  assert.equal(existing.state.layers.length, 0);
  assert.equal(existing.state.movements.length, 0);
  assert.match(mutationSrc, /prisma\.\$transaction\(\(tx\) => mutateInventoryInTransaction/);
});
