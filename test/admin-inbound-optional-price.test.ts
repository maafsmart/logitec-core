import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { Prisma } from "@prisma/client";
import { HttpError } from "../src/shared/http-error.js";
import { InventoryMutationError } from "../src/modules/inventory/inventory-errors.js";
import {
  LayerPriceError,
  inboundUnitPriceWasProvided,
  parseOptionalUnitPriceMxn,
  parseLayerUnitPriceMxn
} from "../src/modules/inventory/inventory-layer-price.service.js";
import { createMovementSchema } from "../src/modules/inventory/inventory-movement.schema.js";
import {
  inboundLayerAttributesMatch,
  mutateInventoryInTransaction
} from "../src/modules/inventory/inventory-mutation.service.js";
import { calculateInventoryValuation } from "../src/modules/inventory/inventory-valuation.service.js";

const html = readFileSync(new URL("../public/dashboard.html", import.meta.url), "utf8");
const js = readFileSync(new URL("../public/dashboard.js", import.meta.url), "utf8");
const routes = readFileSync(new URL("../src/modules/inventory/inventory.routes.ts", import.meta.url), "utf8");
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

function createInboundTx(opts?: { existing?: boolean; existingPrice?: string | null; otherClient?: boolean }) {
  const location = { id: "loc-1", code: "AN22-A", warehouse: "TULTITLAN24" };
  const product = {
    id: "prod-1",
    sku: "SKU-X",
    name: "Radio",
    customerId: "cust-aviat",
    customer: { id: "cust-aviat", clientId: "client-aviat" }
  };
  const aviatProject = {
    id: "proj-att",
    code: "ATT_COMUNICACIONES_DIGITALES",
    name: "AT&T",
    active: true,
    clientId: "client-aviat"
  };
  const otherProject = {
    id: "proj-other",
    code: "OTHER",
    name: "Otro",
    active: true,
    clientId: "client-other"
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
    movements: [] as Array<Record<string, unknown>>,
    nextId: 1
  };
  if (opts?.existing) {
    state.inventories.push({
      id: "inv-1",
      productId: product.id,
      locationId: location.id,
      status: "AVAILABLE",
      qty: d("10"),
      reservedQty: d("0"),
      assignmentType: "FREE_TO_SALE",
      assignmentKey: "FREE_TO_SALE",
      projectId: null
    });
    state.layers.push({
      id: "layer-old",
      inventoryId: "inv-1",
      qty: d("10"),
      reservedQty: d("0"),
      lotNumber: null,
      receivedAt: new Date("2026-01-01T00:00:00Z"),
      unitPriceMxn: opts.existingPrice === undefined ? d("100") : opts.existingPrice == null ? null : d(opts.existingPrice),
      unitPriceUsd: null,
      sourceReference: "ENTRADA_OPERATIVA",
      sourceType: "MANUAL_IN",
      createdAt: new Date("2026-01-01T00:00:00Z")
    });
  }

  function hydrateInventory(row: (typeof state.inventories)[0]) {
    return { ...row, location, product };
  }

  const tx = {
    product: {
      findUnique: async ({ where }: { where: { id: string } }) => (where.id === product.id ? product : null)
    },
    customer: {
      findUnique: async ({ where }: { where: { id: string } }) => {
        if (where.id === aviatProject.id) return aviatProject;
        if (where.id === otherProject.id) return otherProject;
        if (where.id === product.customerId) return product.customer;
        return null;
      }
    },
    inventory: {
      findUnique: async ({ where }: { where: Record<string, unknown> }) => {
        if (where.id) return state.inventories.find((row) => row.id === where.id) ? hydrateInventory(state.inventories.find((row) => row.id === where.id)!) : null;
        const key = (where as { productId_locationId_status_assignmentKey?: { productId: string; locationId: string; status: string; assignmentKey: string } })
          .productId_locationId_status_assignmentKey;
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
          projectId: (data.projectId as string | null) ?? null
        };
        state.inventories.push(created);
        return hydrateInventory(created);
      }
    },
    inventoryLayer: {
      findMany: async ({ where }: { where: { inventoryId: string } }) =>
        state.layers.filter((layer) => layer.inventoryId === where.inventoryId).map((layer) => ({ ...layer })),
      findUnique: async ({ where }: { where: { id: string } }) => state.layers.find((layer) => layer.id === where.id) || null,
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
    inventoryMovement: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const created = { id: `mov-${state.nextId++}`, ...data };
        state.movements.push(created);
        return created;
      }
    },
    activityLog: {
      create: async () => ({ id: `act-${state.nextId++}` })
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
      if (text.includes("FOR UPDATE") && text.includes("InventoryLayer")) return state.layers.map((layer) => ({ id: layer.id }));
      if (text.includes("FOR UPDATE")) return state.inventories.map((row) => ({ id: row.id }));
      return [];
    }
  };

  return { tx, state, location, product, aviatProject, otherProject, opts };
}

async function receiveIn(
  tx: unknown,
  opts: {
    qty?: string;
    unitPriceMxn?: Prisma.Decimal | null;
    assignmentType?: "FREE_TO_SALE" | "PROJECT";
    projectId?: string | null;
    lotNumber?: string | null;
    reference?: string | null;
  } = {}
) {
  return mutateInventoryInTransaction(tx as never, {
    type: "IN",
    productId: "prod-1",
    locationId: "loc-1",
    status: "AVAILABLE",
    qty: d(opts.qty ?? "50"),
    userId: "admin-1",
    lotNumber: opts.lotNumber ?? null,
    reference: opts.reference ?? "ENTRADA_OPERATIVA",
    notes: null,
    unitPriceMxn: opts.unitPriceMxn === undefined ? null : opts.unitPriceMxn,
    assignmentType: opts.assignmentType ?? "FREE_TO_SALE",
    projectId: opts.projectId ?? null,
    activity: { type: "RECEIVE", subtype: "MANUAL_IN", userId: "admin-1", result: "OK" }
  });
}

function loadInboundUi() {
  const src = [
    sliceFunction(js, "parseLayerPriceMxnInput"),
    sliceFunction(js, "normalizeLayerPriceMxn"),
    sliceFunction(js, "formatLayerPriceMxnExact"),
    sliceFunction(js, "formatMxn"),
    sliceFunction(js, "parseInboundUnitPriceMxn"),
    sliceFunction(js, "inboundEntryQtyValue"),
    sliceFunction(js, "formatInboundQtyLabel"),
    sliceFunction(js, "multiplyInboundQtyPrice"),
    sliceFunction(js, "inboundEntryValueLabel"),
    sliceFunction(js, "buildInboundConfirmMessage"),
    sliceFunction(js, "inboundHasSystemSkuSelection"),
    sliceFunction(js, "inboundAssignmentTypeValue"),
    sliceFunction(js, "inboundSelectedProjectId"),
    sliceFunction(js, "inboundFormIsComplete")
  ].join("\n");
  return src;
}

test("la UI de recepción tiene precio opcional, valor y ayuda", () => {
  const inbound = inboundHtml();
  assert.match(inbound, /id="inboundUnitPriceMxn"/);
  assert.match(inbound, /placeholder="Sin precio por ahora"/);
  assert.match(inbound, /id="inboundEntryValue"/);
  assert.match(inbound, /value="Pendiente"/);
  assert.match(
    inbound,
    /Si todavía no conoces el precio, puedes dejarlo vacío y asignarlo posteriormente desde Existencias\./
  );
  assert.match(html, /#inboundSubmitBtn:disabled/);
  assert.match(html, /background:\s*#94a3b8/);
  assert.match(html, /cursor:\s*not-allowed/);
  assert.match(html, /dashboard\.js\?v=71/);
});

test("vacío, null y espacios son null; 0 explícito no se convierte desde vacío", () => {
  assert.equal(parseOptionalUnitPriceMxn(undefined), null);
  assert.equal(parseOptionalUnitPriceMxn(null), null);
  assert.equal(parseOptionalUnitPriceMxn(""), null);
  assert.equal(parseOptionalUnitPriceMxn("   "), null);
  assert.equal(inboundUnitPriceWasProvided(""), false);
  assert.equal(inboundUnitPriceWasProvided("0"), true);
  assert.equal(parseOptionalUnitPriceMxn("0")?.toString(), "0");
  assert.equal(parseLayerUnitPriceMxn("0").toString(), "0");
  assert.equal(parseOptionalUnitPriceMxn("100")?.toString(), "100");
  assert.throws(() => parseOptionalUnitPriceMxn("-1"), LayerPriceError);
  assert.throws(() => parseOptionalUnitPriceMxn("100.12345"), LayerPriceError);
  const emptyParsed = createMovementSchema.parse({
    sku: "SKU-X",
    type: "IN",
    quantity: 50,
    location: "AN22-A",
    assignmentType: "FREE_TO_SALE",
    projectId: null,
    unitPriceMxn: ""
  });
  assert.equal(parseOptionalUnitPriceMxn(emptyParsed.unitPriceMxn), null);
  assert.notEqual(parseOptionalUnitPriceMxn(emptyParsed.unitPriceMxn)?.toString(), "0");
});

test("ADMIN recibe 50 FTS a 100 y 50 de proyecto a 100 con un movimiento IN", async () => {
  const fts = createInboundTx();
  const ftsResult = await receiveIn(fts.tx, { unitPriceMxn: d("100"), assignmentType: "FREE_TO_SALE" });
  assert.equal(fts.state.inventories[0]?.qty.toString(), "50");
  assert.equal(fts.state.layers[0]?.unitPriceMxn?.toString(), "100");
  assert.equal(fts.state.layers[0]?.qty.toString(), "50");
  assert.equal(fts.state.movements.length, 1);
  assert.equal(fts.state.movements[0]?.movementType, "IN");
  assert.equal(ftsResult.movement.toAssignmentType, "FREE_TO_SALE");
  const ftsVal = calculateInventoryValuation(fts.state.layers);
  assert.equal(ftsVal.totalValueMxn, "5000.00");

  const projectWorld = createInboundTx();
  const projectResult = await receiveIn(projectWorld.tx, {
    unitPriceMxn: d("100"),
    assignmentType: "PROJECT",
    projectId: "proj-att"
  });
  assert.equal(projectWorld.state.inventories[0]?.qty.toString(), "50");
  assert.equal(projectWorld.state.layers[0]?.unitPriceMxn?.toString(), "100");
  assert.equal(projectWorld.state.movements.length, 1);
  assert.equal(projectWorld.state.movements[0]?.movementType, "IN");
  assert.equal(projectResult.movement.toAssignmentType, "PROJECT");
  assert.equal(projectResult.movement.toProjectId, "proj-att");
  const projectVal = calculateInventoryValuation(projectWorld.state.layers);
  assert.equal(projectVal.totalValueMxn, "5000.00");
});

test("precio vacío queda null y precio 0 cuenta como valuado", async () => {
  const empty = createInboundTx();
  await receiveIn(empty.tx, { unitPriceMxn: null });
  assert.equal(empty.state.layers[0]?.unitPriceMxn, null);
  const emptyVal = calculateInventoryValuation(empty.state.layers);
  assert.equal(emptyVal.qtyUnvalued, "50");
  assert.equal(emptyVal.totalValueMxn, null);

  const zero = createInboundTx();
  await receiveIn(zero.tx, { unitPriceMxn: d("0") });
  assert.equal(zero.state.layers[0]?.unitPriceMxn?.toString(), "0");
  const zeroVal = calculateInventoryValuation(zero.state.layers);
  assert.equal(zeroVal.qtyValued, "50");
  assert.equal(zeroVal.qtyUnvalued, "0");
});

test("precio distinto crea capa separada y el mismo precio combina atributos canónicos", async () => {
  assert.equal(
    inboundLayerAttributesMatch(
      { lotNumber: null, sourceReference: "ENTRADA_OPERATIVA", unitPriceMxn: null, unitPriceUsd: null },
      { lotNumber: null, sourceReference: "ENTRADA_OPERATIVA", unitPriceMxn: d("0"), unitPriceUsd: null }
    ),
    false
  );

  const split = createInboundTx({ existing: true, existingPrice: "50" });
  await receiveIn(split.tx, { unitPriceMxn: d("100"), reference: "ENTRADA_OPERATIVA" });
  assert.equal(split.state.layers.length, 2);
  assert.equal(split.state.layers[0]?.unitPriceMxn?.toString(), "50");
  assert.equal(split.state.layers[0]?.qty.toString(), "10");
  assert.equal(split.state.layers[1]?.unitPriceMxn?.toString(), "100");
  assert.equal(split.state.inventories[0]?.qty.toString(), "60");
  assert.equal(split.state.movements.length, 1);
  assert.ok(split.state.movements.every((row) => row.movementType === "IN"));

  const combine = createInboundTx({ existing: true, existingPrice: "100" });
  await receiveIn(combine.tx, { unitPriceMxn: d("100"), reference: "ENTRADA_OPERATIVA" });
  assert.equal(combine.state.layers.length, 1);
  assert.equal(combine.state.layers[0]?.qty.toString(), "60");
  assert.equal(combine.state.layers[0]?.unitPriceMxn?.toString(), "100");
  assert.equal(combine.state.inventories[0]?.qty.toString(), "60");
});

test("proyecto de otro cliente se rechaza y no hay movimientos ajenos", async () => {
  const world = createInboundTx();
  await assert.rejects(
    () => receiveIn(world.tx, { assignmentType: "PROJECT", projectId: "proj-other", unitPriceMxn: d("100") }),
    (err: unknown) => err instanceof InventoryMutationError && err.code === "PROJECT_WRONG_CLIENT"
  );
  assert.equal(world.state.movements.length, 0);
  assert.equal(world.state.layers.length, 0);
});

test("OPERATOR y SUPERVISOR no pueden enviar precio; entrada sin precio sigue permitida", () => {
  assert.match(routes, /inboundUnitPriceWasProvided/);
  assert.match(routes, /req\.auth!\.role !== "ADMIN"/);
  assert.match(routes, /HttpError\(403/);
  assert.equal(inboundUnitPriceWasProvided("100"), true);
  assert.equal(inboundUnitPriceWasProvided(0), true);
  assert.equal(inboundUnitPriceWasProvided(""), false);
  assert.equal(inboundUnitPriceWasProvided(null), false);
  const role = "OPERATOR";
  const sent = inboundUnitPriceWasProvided("100") && role !== "ADMIN";
  assert.equal(sent, true);
  const empty = inboundUnitPriceWasProvided("") && role !== "ADMIN";
  assert.equal(empty, false);
  const err = new HttpError(403, "Solo ADMIN puede asignar precio unitario MXN en la entrada.");
  assert.equal(err.statusCode, 403);
});

test("el valor de entrada y la confirmación muestran precio o pendiente", () => {
  const fields: Record<string, { value: string; options?: Array<{ value: string; textContent: string; getAttribute: (n: string) => string }> }> = {
    inboundQty: { value: "50" },
    inboundUnitPriceMxn: { value: "100" },
    inboundSku: { value: "SKU-X" },
    inboundProduct: { value: "Radio" }
  };
  const fns = new Function(
    "document",
    `${loadInboundUi()}; return { inboundEntryValueLabel, buildInboundConfirmMessage, inboundFormIsComplete, parseInboundUnitPriceMxn };`
  )({ getElementById: (id: string) => fields[id] || null });
  assert.equal(fns.inboundEntryValueLabel(), "50 × $100.00 = $5,000.00 MXN");
  const withPrice = fns.buildInboundConfirmMessage({
    sku: "SKU-X",
    productName: "Radio",
    qty: "50",
    assignmentType: "PROJECT",
    projectId: "proj-att",
    projectLabel: "AT&T",
    warehouse: "TULTITLAN24",
    location: "AN22-A",
    lote: "",
    priceEmpty: false,
    priceValue: "100"
  });
  assert.match(withPrice, /50 piezas del SKU SKU-X/);
  assert.match(withPrice, /al proyecto AT&T/);
  assert.match(withPrice, /ubicación AN22-A/);
  assert.match(withPrice, /\$100\.0000 MXN/);
  assert.match(withPrice, /\$5,000\.00 MXN/);
  assert.match(withPrice, /¿Deseas continuar\?/);

  fields.inboundUnitPriceMxn.value = "";
  assert.equal(fns.inboundEntryValueLabel(), "Pendiente");
  const pending = fns.buildInboundConfirmMessage({
    sku: "SKU-X",
    productName: "Radio",
    qty: "50",
    assignmentType: "FREE_TO_SALE",
    projectId: null,
    projectLabel: "",
    warehouse: "TULTITLAN24",
    location: "AN22-A",
    lote: "",
    priceEmpty: true,
    priceValue: null
  });
  assert.match(pending, /como Free to Sale/);
  assert.match(pending, /sin precio asignado/);
  assert.match(pending, /Podrá valuarse posteriormente desde Existencias/);
});

test("el botón se habilita sin precio y se desactiva con precio inválido", () => {
  const fields: Record<string, { value: string }> = {
    inboundProductId: { value: "prod-1" },
    inboundAssignmentType: { value: "FREE_TO_SALE" },
    inboundProjectId: { value: "" },
    inboundQty: { value: "50" },
    inboundWarehouse: { value: "TULTITLAN24" },
    inboundLocation: { value: "AN22-A" },
    inboundStatus: { value: "AVAILABLE" },
    inboundUnitPriceMxn: { value: "" }
  };
  const inboundFormIsComplete = new Function(
    "document",
    `${sliceFunction(js, "inboundHasSystemSkuSelection")}\n${sliceFunction(js, "inboundAssignmentTypeValue")}\n${sliceFunction(js, "inboundSelectedProjectId")}\n${sliceFunction(js, "inboundFormIsComplete")}; return inboundFormIsComplete;`
  )({ getElementById: (id: string) => fields[id] || null });
  assert.equal(inboundFormIsComplete(), true, "vacío no bloquea");
  fields.inboundUnitPriceMxn.value = "100";
  assert.equal(inboundFormIsComplete(), true, "precio válido");
  fields.inboundUnitPriceMxn.value = "-1";
  assert.equal(inboundFormIsComplete(), false, "negativo bloquea");
  fields.inboundUnitPriceMxn.value = "1.23456";
  assert.equal(inboundFormIsComplete(), false, "más de 4 decimales bloquea");
  fields.inboundUnitPriceMxn.value = "0";
  assert.equal(inboundFormIsComplete(), true, "cero explícito habilita");
});

test("cancelar la confirmación no ejecuta POST", () => {
  const submitSrc = sliceFunction(js, "submitOperationalMovement");
  const confirmIdx = submitSrc.indexOf("window.confirm");
  const postIdx = submitSrc.indexOf('authenticatedFetch("/api/inventory/movements"');
  assert.ok(confirmIdx >= 0 && postIdx > confirmIdx);
  assert.match(submitSrc, /!window\.confirm\(confirmMsg\)/);
  const afterConfirm = submitSrc.slice(confirmIdx, postIdx);
  assert.match(afterConfirm, /return;/);
  assert.doesNotMatch(afterConfirm, /authenticatedFetch/);
  assert.match(submitSrc, /lotNumber/);
  assert.match(submitSrc, /unitPriceMxn/);
});

test("esta entrega no escribe inventario de producción", () => {
  assert.doesNotMatch(thisFile, /prisma\.(inventory|inventoryLayer|inventoryMovement)\.(create|update|delete)/);
  assert.match(js, /function buildInboundConfirmMessage/);
  assert.match(routes, /parseOptionalUnitPriceMxn\(body\.unitPriceMxn\)/);
  assert.match(routes, /inboundUnitPriceWasProvided/);
  assert.doesNotMatch(readFileSync(new URL("../src/modules/inventory/inventory-movement.schema.ts", import.meta.url), "utf8"), /unitPriceMxn:\s*z\.coerce\.number/);
});
