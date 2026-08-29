import { InventoryAssignmentType, Prisma } from "@prisma/client";
import { prisma } from "../../db/prisma.js";
import { HttpError } from "../../shared/http-error.js";
import { logActivity } from "../activity/activity-log.service.js";
import type { UserRole } from "../../middlewares/auth.middleware.js";
import { assignmentFromInventory, outboundAssignmentFields } from "../inventory/inventory-assignment.js";
import { InventoryMutationError } from "../inventory/inventory-errors.js";
import { isForbiddenInventoryProjectRecord, isOperationalProjectRecord } from "../inventory/inventory-project-rules.js";
import { planRelocateFifoAllocation } from "../inventory/inventory-mutation.service.js";
import { assertNoSerialAmbiguity } from "../inventory/inventory-serial-guard.js";

export class RequisitionError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly details?: unknown
  ) {
    super(message);
  }
}

const PRIORITY_LABEL: Record<string, string> = {
  LOW: "Baja",
  NORMAL: "Normal",
  HIGH: "Alta"
};

function dec(n: string | number | Prisma.Decimal): Prisma.Decimal {
  return n instanceof Prisma.Decimal ? n : new Prisma.Decimal(String(n));
}

function activeReserved(qty: Prisma.Decimal, consumed: Prisma.Decimal, released: Prisma.Decimal) {
  return qty.minus(consumed).minus(released);
}

function fulfillmentState(lines: Array<{ requestedQty: Prisma.Decimal; fulfilledQty: Prisma.Decimal }>) {
  if (!lines.length) return "SIN SURTIR";
  const allDone = lines.every((l) => l.fulfilledQty.greaterThanOrEqualTo(l.requestedQty));
  if (allDone) return "SURTIDA";
  const any = lines.some((l) => l.fulfilledQty.greaterThan(0));
  return any ? "PARCIAL" : "SIN SURTIR";
}

function priorityFromUi(value: string | number | undefined): string {
  if (typeof value === "string" && ["LOW", "NORMAL", "HIGH"].includes(value.toUpperCase())) {
    return value.toUpperCase();
  }
  const n = Number(value);
  if (n >= 70) return "HIGH";
  if (n > 0 && n < 40) return "LOW";
  return "NORMAL";
}

function taskPriority(priority: string): number {
  if (priority === "HIGH") return 80;
  if (priority === "LOW") return 20;
  return 50;
}

type OperationalProjectRecord = {
  id: string;
  code: string;
  name: string;
  active?: boolean | null;
};

export function requireOperationalProject<T extends OperationalProjectRecord | null | undefined>(
  project: T
): asserts project is Exclude<T, null | undefined> {
  if (!project) {
    throw new RequisitionError("PROJECT_NOT_FOUND", "Proyecto no encontrado.");
  }
  if (project.active === false || isForbiddenInventoryProjectRecord(project)) {
    throw new RequisitionError(
      "PROJECT_NOT_AVAILABLE",
      "El proyecto no está disponible para operaciones nuevas."
    );
  }
}

type RequisitionDb = Pick<typeof prisma, "customer" | "requisition" | "$transaction">;

type StockBreakdown = {
  projectAvailable: Prisma.Decimal;
  freeToSaleAvailable: Prisma.Decimal;
  otherProjectsAvailable: Prisma.Decimal;
};

function emptyStockBreakdown(): StockBreakdown {
  return {
    projectAvailable: new Prisma.Decimal(0),
    freeToSaleAvailable: new Prisma.Decimal(0),
    otherProjectsAvailable: new Prisma.Decimal(0)
  };
}

function serializeStockBreakdown(stock: StockBreakdown) {
  return {
    projectAvailable: stock.projectAvailable.toString(),
    freeToSaleAvailable: stock.freeToSaleAvailable.toString(),
    otherProjectsAvailable: stock.otherProjectsAvailable.toString()
  };
}

function accumulateStockBreakdown(
  rows: Array<{
    productId: string;
    assignmentType: string;
    projectId: string | null;
    qty: Prisma.Decimal;
    reservedQty: Prisma.Decimal;
  }>,
  productId: string,
  projectId: string
): StockBreakdown {
  const stock = emptyStockBreakdown();
  for (const row of rows) {
    if (row.productId !== productId) continue;
    const free = row.qty.minus(row.reservedQty);
    if (free.lessThanOrEqualTo(0)) continue;
    if (row.assignmentType === "PROJECT" && row.projectId === projectId) {
      stock.projectAvailable = stock.projectAvailable.plus(free);
    } else if (row.assignmentType === "FREE_TO_SALE") {
      stock.freeToSaleAvailable = stock.freeToSaleAvailable.plus(free);
    } else if (row.assignmentType === "PROJECT") {
      stock.otherProjectsAvailable = stock.otherProjectsAvailable.plus(free);
    }
  }
  return stock;
}

async function assertProductInProject(
  tx: { productProject: Prisma.TransactionClient["productProject"] },
  productId: string,
  projectId: string,
  sku: string
) {
  const link = await tx.productProject.findUnique({
    where: { productId_projectId: { productId, projectId } },
    select: { active: true }
  });
  if (!link?.active) {
    throw new RequisitionError(
      "PRODUCT_NOT_IN_PROJECT",
      `El SKU ${sku} no está autorizado para el proyecto de la requisición.`
    );
  }
}

async function loadInventoriesForProducts(productIds: string[]) {
  if (!productIds.length) return [];
  return prisma.inventory.findMany({
    where: { productId: { in: productIds } },
    select: {
      productId: true,
      assignmentType: true,
      projectId: true,
      qty: true,
      reservedQty: true
    }
  });
}

function mapReservationCandidate(row: {
  id: string;
  productId?: string;
  status: string;
  qty: Prisma.Decimal;
  reservedQty: Prisma.Decimal;
  assignmentType: string;
  projectId: string | null;
  location: { code: string; warehouse: string };
  project: { id: string; code: string; name: string } | null;
  layers?: Array<{ id: string }>;
  _count?: { layers?: number };
}) {
  const freeQty = row.qty.minus(row.reservedQty);
  const layerCount = row._count?.layers ?? row.layers?.length ?? 0;
  return {
    inventoryId: row.id,
    productId: row.productId || null,
    location: row.location.code,
    warehouse: row.location.warehouse,
    status: row.status,
    assignmentType: row.assignmentType,
    projectId: row.projectId,
    projectCode: row.project?.code || null,
    projectName: row.project?.name || null,
    qty: row.qty.toString(),
    reservedQty: row.reservedQty.toString(),
    freeQty: freeQty.toString(),
    unreservedQty: freeQty.toString(),
    layerCount
  };
}

function parseAllocationMode(value: string | undefined): "FIFO" | undefined {
  const mode = String(value || "").trim();
  if (!mode) return undefined;
  if (mode === "FIFO") return "FIFO";
  throw new RequisitionError("INVALID_ALLOCATION_MODE", "allocationMode debe ser FIFO.");
}

async function lockInventoryAndLayers(tx: Prisma.TransactionClient, inventoryId: string) {
  await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "Inventory" WHERE "id" = ${inventoryId} FOR UPDATE`);
  await tx.$queryRaw(
    Prisma.sql`SELECT "id" FROM "InventoryLayer" WHERE "inventoryId" = ${inventoryId} ORDER BY "id" FOR UPDATE`
  );
}

async function loadRequisition(id: string, db: RequisitionDb = prisma) {
  const row = await db.requisition.findUnique({
    where: { id },
    include: {
      project: { include: { client: true } },
      createdBy: { select: { id: true, fullName: true, email: true } },
      lines: {
        include: {
          product: { select: { id: true, sku: true, name: true, barcode: true, customerId: true } },
          reservations: {
            include: {
              inventoryLayer: { select: { id: true, lotNumber: true, receivedAt: true, createdAt: true } },
              inventory: {
                select: {
                  id: true,
                  status: true,
                  location: { select: { code: true, warehouse: true } }
                }
              }
            }
          }
        },
        orderBy: { createdAt: "asc" }
      },
      tasks: {
        include: {
          assignedTo: { select: { id: true, fullName: true, email: true } }
        },
        orderBy: { createdAt: "asc" }
      }
    }
  });
  if (!row) throw new HttpError(404, "Requisición no encontrada.");
  return row;
}

function serializeRequisition(row: Awaited<ReturnType<typeof loadRequisition>>) {
  const requested = row.lines.reduce((t, l) => t.plus(l.requestedQty), new Prisma.Decimal(0));
  const fulfilled = row.lines.reduce((t, l) => t.plus(l.fulfilledQty), new Prisma.Decimal(0));
  const reserved = row.lines.reduce(
    (t, l) =>
      t.plus(
        l.reservations.reduce(
          (rt, r) => rt.plus(activeReserved(r.qty, r.consumedQty, r.releasedQty)),
          new Prisma.Decimal(0)
        )
      ),
    new Prisma.Decimal(0)
  );
  const pending = requested.minus(fulfilled);
  return {
    id: row.id,
    number: row.number,
    status: row.status,
    priority: row.priority,
    priorityLabel: PRIORITY_LABEL[row.priority] || row.priority,
    reference: row.reference,
    notes: row.notes,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    fulfillmentStatus: fulfillmentState(row.lines),
    totals: {
      requestedQty: requested.toString(),
      reservedQty: reserved.toString(),
      fulfilledQty: fulfilled.toString(),
      pendingQty: pending.toString()
    },
    project: {
      id: row.project.id,
      code: row.project.code,
      name: row.project.name
    },
    client: row.project.client
      ? {
          id: row.project.client.id,
          name: row.project.client.name,
          tradeName: row.project.client.tradeName,
          legalName: row.project.client.legalName
        }
      : null,
    createdBy: row.createdBy,
    lines: row.lines.map((line) => {
      const lineReserved = line.reservations.reduce(
        (t, r) => t.plus(activeReserved(r.qty, r.consumedQty, r.releasedQty)),
        new Prisma.Decimal(0)
      );
      return {
        id: line.id,
        productId: line.productId,
        product: line.product,
        requestedQty: line.requestedQty.toString(),
        fulfilledQty: line.fulfilledQty.toString(),
        reservedQty: lineReserved.toString(),
        pendingQty: line.requestedQty.minus(line.fulfilledQty).toString(),
        fulfillmentStatus: fulfillmentState([line]),
        stock: {
          projectAvailable: "0",
          freeToSaleAvailable: "0",
          otherProjectsAvailable: "0"
        },
        reserveCubes: [] as ReturnType<typeof mapReservationCandidate>[],
        reservations: line.reservations.map((r) => ({
          id: r.id,
          inventoryId: r.inventoryId,
          inventoryLayerId: r.inventoryLayerId,
          qty: r.qty.toString(),
          consumedQty: r.consumedQty.toString(),
          releasedQty: r.releasedQty.toString(),
          activeQty: activeReserved(r.qty, r.consumedQty, r.releasedQty).toString(),
          status: r.status,
          createdAt: r.createdAt,
          lotNumber: r.inventoryLayer?.lotNumber ?? null,
          receivedAt: r.inventoryLayer?.receivedAt ? r.inventoryLayer.receivedAt.toISOString() : null,
          location: r.inventory?.location?.code ?? null,
          warehouse: r.inventory?.location?.warehouse ?? null,
          inventoryStatus: r.inventory?.status ?? null
        }))
      };
    }),
    tasks: row.tasks
  };
}

async function withLineStock<T extends { project: { id: string }; lines: Array<{ productId: string; stock?: unknown }> }>(
  row: T
): Promise<T> {
  const inventories = await loadInventoriesForProducts(row.lines.map((line) => line.productId));
  return {
    ...row,
    lines: row.lines.map((line) => ({
      ...line,
      stock: serializeStockBreakdown(accumulateStockBreakdown(inventories, line.productId, row.project.id))
    }))
  };
}

async function withLineStockMany<T extends { project: { id: string }; lines: Array<{ productId: string; stock?: unknown }> }>(
  rows: T[]
): Promise<T[]> {
  const productIds = [...new Set(rows.flatMap((row) => row.lines.map((line) => line.productId)))];
  const inventories = await loadInventoriesForProducts(productIds);
  return rows.map((row) => ({
    ...row,
    lines: row.lines.map((line) => ({
      ...line,
      stock: serializeStockBreakdown(accumulateStockBreakdown(inventories, line.productId, row.project.id))
    }))
  }));
}

async function withReserveCubes<
  T extends {
    project: { id: string };
    lines: Array<{ productId: string; reserveCubes?: unknown }>;
  }
>(row: T): Promise<T> {
  const productIds = [...new Set(row.lines.map((line) => line.productId))];
  if (!productIds.length) return row;
  const cubes = await prisma.inventory.findMany({
    where: {
      productId: { in: productIds },
      assignmentType: "PROJECT",
      projectId: row.project.id,
      qty: { gt: 0 }
    },
    include: {
      location: true,
      project: { select: { id: true, code: true, name: true } },
      layers: { select: { id: true } }
    }
  });
  return {
    ...row,
    lines: row.lines.map((line) => ({
      ...line,
      reserveCubes: cubes
        .filter((cube) => cube.productId === line.productId && cube.qty.minus(cube.reservedQty).greaterThan(0))
        .map(mapReservationCandidate)
    }))
  };
}

export async function listRequisitions() {
  const rows = await prisma.requisition.findMany({
    orderBy: [{ createdAt: "desc" }],
    take: 200,
    include: {
      project: { include: { client: true } },
      createdBy: { select: { id: true, fullName: true, email: true } },
      lines: {
        include: {
          product: { select: { id: true, sku: true, name: true, barcode: true, customerId: true } },
          reservations: {
            include: {
              inventoryLayer: { select: { id: true, lotNumber: true, receivedAt: true, createdAt: true } },
              inventory: {
                select: {
                  id: true,
                  status: true,
                  location: { select: { code: true, warehouse: true } }
                }
              }
            }
          }
        }
      },
      tasks: {
        include: { assignedTo: { select: { id: true, fullName: true, email: true } } }
      }
    }
  });
  return withLineStockMany(rows.map(serializeRequisition));
}

export async function getRequisition(id: string) {
  return withReserveCubes(await withLineStock(serializeRequisition(await loadRequisition(id))));
}

export async function createRequisition(
  input: {
    number: string;
    projectCode: string;
    priority?: string | number;
    reference?: string | null;
    notes?: string | null;
    lines: Array<{ sku: string; requestedQty: number; lotNumber?: string | null }>;
    userId: string;
  },
  db: RequisitionDb = prisma
) {
  if (!input.lines.length) throw new HttpError(400, "La requisición requiere al menos una línea.");
  const project = await db.customer.findFirst({
    where: {
      OR: [
        { code: { equals: input.projectCode, mode: "insensitive" } },
        { name: { equals: input.projectCode, mode: "insensitive" } }
      ]
    }
  });
  requireOperationalProject(project);

  const created = await db.$transaction(async (tx) => createRequisitionInTransaction(tx, { ...input, project }));
  return getRequisition(created);
}

export async function createRequisitionInTransaction(
  tx: Prisma.TransactionClient,
  input: {
    number: string;
    priority?: string | number;
    reference?: string | null;
    notes?: string | null;
    lines: Array<{ sku: string; requestedQty: number; lotNumber?: string | null }>;
    userId: string;
    project: { id: string };
  }
) {
  const priority = priorityFromUi(input.priority);
  const existing = await tx.requisition.findUnique({ where: { number: input.number.trim() } });
  if (existing) throw new HttpError(409, "Ya existe una requisición con ese folio.");

  const req = await tx.requisition.create({
    data: {
      number: input.number.trim(),
      projectId: input.project.id,
      createdById: input.userId,
      priority,
      status: "DRAFT",
      reference: input.reference?.trim() || input.number.trim(),
      notes: input.notes?.trim() || null
    }
  });

  for (const line of input.lines) {
    const product = await tx.product.findFirst({
      where: {
        active: true,
        OR: [{ sku: line.sku.trim() }, { barcode: line.sku.trim() }]
      }
    });
    if (!product) throw new HttpError(404, `Producto no encontrado: ${line.sku}`);
    await assertProductInProject(tx, product.id, input.project.id, product.sku);
    const qty = dec(line.requestedQty);
    if (qty.lessThanOrEqualTo(0)) throw new HttpError(400, "requestedQty debe ser mayor a 0.");
    await tx.requisitionLine.create({
      data: {
        requisitionId: req.id,
        productId: product.id,
        requestedQty: qty,
        fulfilledQty: 0
      }
    });
  }
  await logActivity(
    {
      type: "REQUISITION",
      subtype: "CREATED",
      reference: req.number,
      userId: input.userId,
      customerId: input.project.id,
      result: "OK",
      metadata: { requisitionId: req.id }
    },
    tx
  );
  return req.id;
}

export async function addRequisitionLine(
  requisitionId: string,
  input: { sku: string; requestedQty: number },
  userId: string
) {
  const req = await prisma.requisition.findUnique({ where: { id: requisitionId } });
  if (!req) throw new HttpError(404, "Requisición no encontrada.");
  if (!["DRAFT", "SUBMITTED"].includes(req.status)) {
    throw new HttpError(409, "Solo se pueden agregar líneas en DRAFT/SUBMITTED.");
  }
  const product = await prisma.product.findFirst({
    where: { active: true, OR: [{ sku: input.sku.trim() }, { barcode: input.sku.trim() }] }
  });
  if (!product) throw new HttpError(404, "Producto no encontrado.");
  await assertProductInProject(prisma, product.id, req.projectId, product.sku);
  const qty = dec(input.requestedQty);
  if (qty.lessThanOrEqualTo(0)) throw new HttpError(400, "requestedQty debe ser mayor a 0.");
  await prisma.requisitionLine.create({
    data: { requisitionId, productId: product.id, requestedQty: qty, fulfilledQty: 0 }
  });
  await logActivity({
    type: "REQUISITION",
    subtype: "LINE_ADDED",
    reference: req.number,
    userId,
    productId: product.id,
    customerId: req.projectId,
    qty,
    result: "OK",
    metadata: { requisitionId }
  });
  return getRequisition(requisitionId);
}

export async function submitRequisition(id: string, userId: string, db: RequisitionDb = prisma) {
  const req = await db.requisition.findUnique({
    where: { id },
    include: { lines: true, project: true }
  });
  if (!req) throw new HttpError(404, "Requisición no encontrada.");
  if (req.status !== "DRAFT") throw new HttpError(409, "Solo DRAFT puede enviarse.");
  if (!req.lines.length) throw new HttpError(400, "La requisición no tiene líneas.");
  requireOperationalProject(req.project);
  await db.requisition.update({ where: { id }, data: { status: "SUBMITTED" } });
  await logActivity({
    type: "REQUISITION",
    subtype: "SUBMITTED",
    reference: req.number,
    userId,
    customerId: req.projectId,
    result: "OK",
    metadata: { requisitionId: id }
  });
  return getRequisition(id);
}

export async function approveRequisition(id: string, userId: string, role: UserRole, db: RequisitionDb = prisma) {
  if (role === "OPERATOR" || role === "CLIENT") throw new HttpError(403, "No autorizado para aprobar.");
  const req = await loadRequisition(id, db);
  if (!["SUBMITTED", "APPROVED"].includes(req.status) && req.status !== "DRAFT") {
    // allow SUBMITTED primarily; DRAFT can be approved after auto-submit convenience? Spec: submit then approve.
  }
  if (req.status === "CANCELLED" || req.status === "COMPLETED" || req.status === "REJECTED") {
    throw new HttpError(409, "La requisición no puede aprobarse en su estado actual.");
  }
  if (req.status === "DRAFT") {
    throw new HttpError(409, "Envía la requisición (SUBMITTED) antes de aprobar.");
  }
  if (!req.lines.length) throw new HttpError(400, "Sin líneas.");
  if (req.status === "SUBMITTED") {
    requireOperationalProject(req.project);
  }

  await prisma.$transaction(async (tx) => {
    if (req.status !== "APPROVED") {
      await tx.requisition.update({ where: { id }, data: { status: "APPROVED" } });
    }
    const existingPick = await tx.task.findFirst({
      where: { requisitionId: id, type: "PICK" }
    });
    if (!existingPick) {
      await tx.task.create({
        data: {
          type: "PICK",
          status: "PENDING",
          createdById: userId,
          approvedById: userId,
          warehouse: "TULTITLAN24",
          priority: taskPriority(req.priority),
          reference: req.number,
          requisitionId: id,
          notes: JSON.stringify({
            taskLabel: "Orden de surtido",
            orderFolio: req.number,
            requisitionId: id,
            projectCode: req.project.code,
            projectName: req.project.name,
            clientName: req.project.client?.tradeName || req.project.client?.name || null,
            priority: req.priority,
            fulfillmentStatus: fulfillmentState(req.lines)
          })
        }
      });
    }
    await logActivity(
      {
        type: "REQUISITION",
        subtype: "APPROVED",
        reference: req.number,
        userId,
        customerId: req.projectId,
        result: "OK",
        metadata: { requisitionId: id }
      },
      tx
    );
  });
  return getRequisition(id);
}

async function selectFreeLayer(
  tx: Prisma.TransactionClient,
  inventoryId: string,
  layerId: string | undefined,
  qty: Prisma.Decimal
) {
  await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "InventoryLayer" WHERE "inventoryId" = ${inventoryId} ORDER BY "id" FOR UPDATE`);
  const layers = await tx.inventoryLayer.findMany({
    where: { inventoryId },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }]
  });
  const free = layers.filter((l) => l.qty.minus(l.reservedQty).greaterThan(0));
  if (!free.length) throw new RequisitionError("NO_LAYER_STOCK", "No hay capas con saldo libre.");
  if (layerId) {
    const layer = free.find((l) => l.id === layerId);
    if (!layer) throw new RequisitionError("LAYER_NOT_AVAILABLE", "La capa no tiene saldo libre.");
    if (layer.qty.minus(layer.reservedQty).lessThan(qty)) {
      throw new RequisitionError("INSUFFICIENT_FREE", "Saldo libre insuficiente en la capa.");
    }
    return layer;
  }
  if (free.length !== 1) {
    throw new RequisitionError("AMBIGUOUS_LAYER", "Hay varias capas libres; indica layerId.", {
      layers: free.map((l) => ({
        layerId: l.id,
        lotNumber: l.lotNumber,
        qty: l.qty.toString(),
        reservedQty: l.reservedQty.toString(),
        freeQty: l.qty.minus(l.reservedQty).toString()
      }))
    });
  }
  const only = free[0]!;
  if (only.qty.minus(only.reservedQty).lessThan(qty)) {
    throw new RequisitionError("INSUFFICIENT_FREE", "Saldo libre insuficiente.");
  }
  return only;
}

export async function reserveLine(input: {
  requisitionId: string;
  lineId: string;
  qty: number;
  inventoryId?: string;
  layerId?: string;
  allocationMode?: string;
  userId: string;
  role: UserRole;
}) {
  if (input.role === "CLIENT") throw new HttpError(403, "CLIENT no puede reservar.");
  const qty = dec(input.qty);
  if (qty.lessThanOrEqualTo(0)) throw new HttpError(400, "La cantidad a reservar debe ser > 0.");

  try {
    await prisma.$transaction(async (tx) => {
      await reserveLineInTransaction(tx, { ...input, qty });
    });
  } catch (error) {
    if (error instanceof RequisitionError || error instanceof HttpError) throw error;
    throw error;
  }
  return getRequisition(input.requisitionId);
}

export async function reserveLineInTransaction(
  tx: Prisma.TransactionClient,
  input: {
    requisitionId: string;
    lineId: string;
    qty: Prisma.Decimal;
    inventoryId?: string;
    layerId?: string;
    allocationMode?: string;
    userId: string;
  }
) {
  const qty = dec(input.qty);
  const layerId = input.layerId?.trim() || "";
  const allocationMode = parseAllocationMode(input.allocationMode);
  if (layerId && allocationMode) {
    throw new RequisitionError(
      "LAYER_ALLOCATION_CONFLICT",
      "No se puede indicar layerId y allocationMode al mismo tiempo."
    );
  }

  const req = await tx.requisition.findUnique({
    where: { id: input.requisitionId },
    include: { lines: { include: { reservations: true, product: true } } }
  });
  if (!req) throw new HttpError(404, "Requisición no encontrada.");
  if (!["APPROVED", "IN_PROGRESS"].includes(req.status)) {
    throw new HttpError(409, "Solo se puede reservar en APPROVED/IN_PROGRESS.");
  }
  const line = req.lines.find((l) => l.id === input.lineId);
  if (!line) throw new HttpError(404, "Línea no encontrada.");

  const alreadyReserved = line.reservations.reduce(
    (t, r) => t.plus(activeReserved(r.qty, r.consumedQty, r.releasedQty)),
    new Prisma.Decimal(0)
  );
  const pending = line.requestedQty.minus(line.fulfilledQty);
  const reservable = pending.minus(alreadyReserved);
  if (qty.greaterThan(reservable)) {
    throw new RequisitionError("OVER_LINE_RESERVE", "No se puede reservar más que el pendiente de la línea.");
  }

  const allInventories = await tx.inventory.findMany({
    where: { productId: line.productId },
    select: { productId: true, assignmentType: true, projectId: true, qty: true, reservedQty: true }
  });
  const stockInfo = serializeStockBreakdown(accumulateStockBreakdown(allInventories, line.productId, req.projectId));
  const informational = {
    ...stockInfo,
    hint:
      new Prisma.Decimal(stockInfo.freeToSaleAvailable).greaterThan(0)
        ? `FREE TO SALE disponible: ${stockInfo.freeToSaleAvailable} — requiere reasignación`
        : undefined
  };

  if (input.inventoryId) {
    const target = await tx.inventory.findUnique({
      where: { id: input.inventoryId },
      include: { location: true, project: { select: { id: true, code: true, name: true } }, layers: { select: { id: true } } }
    });
    if (!target) throw new RequisitionError("INVENTORY_NOT_FOUND", "Línea de inventario no disponible.");
    if (target.productId !== line.productId || target.assignmentType !== "PROJECT" || target.projectId !== req.projectId) {
      throw new RequisitionError(
        "RESERVATION_PROJECT_MISMATCH",
        "El inventario no pertenece al proyecto de la requisición.",
        informational
      );
    }
  }

  const candidates = await tx.inventory.findMany({
    where: {
      productId: line.productId,
      assignmentType: "PROJECT",
      projectId: req.projectId,
      qty: { gt: 0 }
    },
    include: { location: true, project: { select: { id: true, code: true, name: true } }, layers: { select: { id: true } } }
  });
  const withFree = candidates.filter((c) => c.qty.minus(c.reservedQty).greaterThan(0));
  if (!withFree.length) {
    throw new RequisitionError("NO_STOCK", "Sin stock libre del proyecto para reservar.", informational);
  }

  let inventory = input.inventoryId
    ? withFree.find((c) => c.id === input.inventoryId)
    : withFree.length === 1
      ? withFree[0]
      : undefined;
  if (!inventory && !input.inventoryId && withFree.length > 1) {
    throw new RequisitionError("AMBIGUOUS_STOCK", "Hay varias ubicaciones; indica inventoryId.", {
      ...informational,
      candidates: withFree.map(mapReservationCandidate)
    });
  }
  if (!inventory) throw new RequisitionError("INVENTORY_NOT_FOUND", "Línea de inventario no disponible.");

  await lockInventoryAndLayers(tx, inventory.id);
  const locked = await tx.inventory.findUniqueOrThrow({ where: { id: inventory.id } });
  if (locked.productId !== line.productId || locked.assignmentType !== "PROJECT" || locked.projectId !== req.projectId) {
    throw new RequisitionError(
      "RESERVATION_PROJECT_MISMATCH",
      "El inventario no pertenece al proyecto de la requisición."
    );
  }
  if (locked.qty.minus(locked.reservedQty).lessThan(qty)) {
    throw new RequisitionError("INSUFFICIENT_FREE", "Stock libre insuficiente en el proyecto.", informational);
  }

  const layersReloaded = await tx.inventoryLayer.findMany({ where: { inventoryId: inventory.id } });

  if (allocationMode === "FIFO") {
    const planned = planRelocateFifoAllocation(layersReloaded, qty);
    if (planned.remaining.greaterThan(0) || !planned.allocations.length) {
      throw new RequisitionError("INSUFFICIENT_FREE", "Las capas no tienen saldo libre suficiente.", informational);
    }

    const invRows = await tx.$queryRaw<Array<{ id: string }>>`
      UPDATE "Inventory"
      SET "reservedQty" = "reservedQty" + ${qty}, "updatedAt" = NOW()
      WHERE id = ${inventory.id}
        AND qty - "reservedQty" >= ${qty}
      RETURNING id
    `;
    if (!invRows.length) throw new RequisitionError("INSUFFICIENT_FREE", "Conflicto de reserva en inventario.");

    const allocations: Prisma.InputJsonValue[] = [];
    for (const slice of planned.allocations) {
      const layerRows = await tx.$queryRaw<Array<{ id: string }>>`
        UPDATE "InventoryLayer"
        SET "reservedQty" = "reservedQty" + ${slice.qty}, "updatedAt" = NOW()
        WHERE id = ${slice.layer.id}
          AND qty - "reservedQty" >= ${slice.qty}
        RETURNING id
      `;
      if (!layerRows.length) throw new RequisitionError("INSUFFICIENT_FREE", "Conflicto de reserva en capa.");
      const reservation = await tx.inventoryReservation.create({
        data: {
          requisitionLineId: line.id,
          inventoryId: inventory.id,
          inventoryLayerId: slice.layer.id,
          qty: slice.qty,
          consumedQty: 0,
          releasedQty: 0,
          status: "ACTIVE",
          createdById: input.userId
        }
      });
      allocations.push({
        reservationId: reservation.id,
        inventoryLayerId: slice.layer.id,
        qty: slice.qty.toString(),
        lotNumber: slice.layer.lotNumber,
        receivedAt: slice.layer.receivedAt ? slice.layer.receivedAt.toISOString() : null
      });
    }

    await logActivity(
      {
        type: "REQUISITION",
        subtype: "RESERVED",
        reference: req.number,
        userId: input.userId,
        productId: line.productId,
        customerId: req.projectId,
        qty,
        result: "OK",
        metadata: {
          requisitionId: req.id,
          lineId: line.id,
          inventoryId: inventory.id,
          allocationMode: "FIFO",
          requestedQty: qty.toString(),
          allocations
        }
      },
      tx
    );
    return;
  }

  const layer = await selectFreeLayer(tx, inventory.id, layerId || undefined, qty);

  const layerRows = await tx.$queryRaw<Array<{ id: string }>>`
    UPDATE "InventoryLayer"
    SET "reservedQty" = "reservedQty" + ${qty}, "updatedAt" = NOW()
    WHERE id = ${layer.id}
      AND qty - "reservedQty" >= ${qty}
    RETURNING id
  `;
  if (!layerRows.length) throw new RequisitionError("INSUFFICIENT_FREE", "Conflicto de reserva en capa.");
  const invRows = await tx.$queryRaw<Array<{ id: string }>>`
    UPDATE "Inventory"
    SET "reservedQty" = "reservedQty" + ${qty}, "updatedAt" = NOW()
    WHERE id = ${inventory.id}
      AND qty - "reservedQty" >= ${qty}
    RETURNING id
  `;
  if (!invRows.length) throw new RequisitionError("INSUFFICIENT_FREE", "Conflicto de reserva en inventario.");

  const reservation = await tx.inventoryReservation.create({
    data: {
      requisitionLineId: line.id,
      inventoryId: inventory.id,
      inventoryLayerId: layer.id,
      qty,
      consumedQty: 0,
      releasedQty: 0,
      status: "ACTIVE",
      createdById: input.userId
    }
  });
  await logActivity(
    {
      type: "REQUISITION",
      subtype: "RESERVED",
      reference: req.number,
      userId: input.userId,
      productId: line.productId,
      customerId: req.projectId,
      qty,
      result: "OK",
      metadata: {
        requisitionId: req.id,
        lineId: line.id,
        inventoryId: inventory.id,
        layerId: layer.id,
        reservationId: reservation.id
      }
    },
    tx
  );
}

export async function releaseReservation(reservationId: string, userId: string, role: UserRole, releaseQty?: number) {
  if (role === "CLIENT") throw new HttpError(403, "CLIENT no puede liberar.");
  if (role === "OPERATOR") throw new HttpError(403, "OPERATOR no puede liberar reservas administrativas.");

  await prisma.$transaction(async (tx) => {
    const reservation = await tx.inventoryReservation.findUnique({
      where: { id: reservationId },
      include: { requisitionLine: { include: { requisition: true } } }
    });
    if (!reservation) throw new HttpError(404, "Reserva no encontrada.");
    if (reservation.status !== "ACTIVE") throw new HttpError(409, "La reserva no está activa.");
    const active = activeReserved(reservation.qty, reservation.consumedQty, reservation.releasedQty);
    const qty = releaseQty == null ? active : dec(releaseQty);
    if (qty.lessThanOrEqualTo(0) || qty.greaterThan(active)) {
      throw new RequisitionError("INVALID_RELEASE", "Cantidad de liberación inválida.");
    }
    if (!reservation.inventoryLayerId) throw new HttpError(409, "La reserva no tiene capa asociada.");

    await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "Inventory" WHERE "id" = ${reservation.inventoryId} FOR UPDATE`);
    await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "InventoryLayer" WHERE "id" = ${reservation.inventoryLayerId} FOR UPDATE`);

    const layerRows = await tx.$queryRaw<Array<{ id: string }>>`
      UPDATE "InventoryLayer"
      SET "reservedQty" = "reservedQty" - ${qty}, "updatedAt" = NOW()
      WHERE id = ${reservation.inventoryLayerId}
        AND "reservedQty" >= ${qty}
      RETURNING id
    `;
    if (!layerRows.length) throw new RequisitionError("RELEASE_CONFLICT", "No se pudo liberar reservedQty de capa.");
    const invRows = await tx.$queryRaw<Array<{ id: string }>>`
      UPDATE "Inventory"
      SET "reservedQty" = "reservedQty" - ${qty}, "updatedAt" = NOW()
      WHERE id = ${reservation.inventoryId}
        AND "reservedQty" >= ${qty}
      RETURNING id
    `;
    if (!invRows.length) throw new RequisitionError("RELEASE_CONFLICT", "No se pudo liberar reservedQty de inventario.");

    const newReleased = reservation.releasedQty.plus(qty);
    const newActive = activeReserved(reservation.qty, reservation.consumedQty, newReleased);
    await tx.inventoryReservation.update({
      where: { id: reservation.id },
      data: {
        releasedQty: newReleased,
        status: newActive.lessThanOrEqualTo(0) ? "RELEASED" : "ACTIVE"
      }
    });
    await logActivity(
      {
        type: "REQUISITION",
        subtype: "RESERVATION_RELEASED",
        reference: reservation.requisitionLine.requisition.number,
        userId,
        productId: reservation.requisitionLine.productId,
        qty,
        result: "OK",
        metadata: { reservationId, requisitionId: reservation.requisitionLine.requisitionId }
      },
      tx
    );
  });
  const reservation = await prisma.inventoryReservation.findUniqueOrThrow({
    where: { id: reservationId },
    include: { requisitionLine: true }
  });
  return getRequisition(reservation.requisitionLine.requisitionId);
}

export async function cancelRequisition(id: string, userId: string, role: UserRole) {
  if (role === "CLIENT") throw new HttpError(403, "CLIENT no puede cancelar.");
  if (role === "OPERATOR") throw new HttpError(403, "OPERATOR no puede cancelar una requisición aprobada.");

  await prisma.$transaction(async (tx) => {
    await cancelRequisitionInTransaction(tx, id, userId);
  });
  return getRequisition(id);
}

export async function cancelRequisitionInTransaction(tx: Prisma.TransactionClient, id: string, userId: string) {
  const req = await tx.requisition.findUnique({
    where: { id },
    include: { lines: { include: { reservations: true } } }
  });
  if (!req) throw new HttpError(404, "Requisición no encontrada.");
  if (req.status === "CANCELLED") return;
  if (req.status === "COMPLETED") throw new HttpError(409, "No se puede cancelar una requisición COMPLETADA.");

  for (const line of req.lines) {
    for (const reservation of line.reservations.filter((r) => r.status === "ACTIVE")) {
      const active = activeReserved(reservation.qty, reservation.consumedQty, reservation.releasedQty);
      if (active.lessThanOrEqualTo(0) || !reservation.inventoryLayerId) continue;
      await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "Inventory" WHERE "id" = ${reservation.inventoryId} FOR UPDATE`);
      await tx.$queryRaw(
        Prisma.sql`SELECT "id" FROM "InventoryLayer" WHERE "id" = ${reservation.inventoryLayerId} FOR UPDATE`
      );
      const layerRows = await tx.$queryRaw<Array<{ id: string }>>`
        UPDATE "InventoryLayer"
        SET "reservedQty" = "reservedQty" - ${active}, "updatedAt" = NOW()
        WHERE id = ${reservation.inventoryLayerId} AND "reservedQty" >= ${active}
        RETURNING id
      `;
      if (!layerRows.length) throw new RequisitionError("RELEASE_CONFLICT", "No se pudo liberar reservedQty de capa.");
      const invRows = await tx.$queryRaw<Array<{ id: string }>>`
        UPDATE "Inventory"
        SET "reservedQty" = "reservedQty" - ${active}, "updatedAt" = NOW()
        WHERE id = ${reservation.inventoryId} AND "reservedQty" >= ${active}
        RETURNING id
      `;
      if (!invRows.length) {
        throw new RequisitionError("RELEASE_CONFLICT", "No se pudo liberar reservedQty de inventario.");
      }
      await tx.inventoryReservation.update({
        where: { id: reservation.id },
        data: { releasedQty: reservation.releasedQty.plus(active), status: "RELEASED" }
      });
    }
  }
  await tx.task.updateMany({
    where: {
      requisitionId: id,
      type: "PICK",
      status: { notIn: ["CANCELLED", "COMPLETED", "REJECTED"] }
    },
    data: { status: "CANCELLED" }
  });
  await tx.requisition.update({ where: { id }, data: { status: "CANCELLED" } });
  await logActivity(
    {
      type: "REQUISITION",
      subtype: "CANCELLED",
      reference: req.number,
      userId,
      customerId: req.projectId,
      result: "OK",
      metadata: { requisitionId: id }
    },
    tx
  );
}

export type ConsumeReservationPickInput = {
  qty: Prisma.Decimal;
  userId: string;
  scannedCode: string;
  reservationId?: string | null;
  requisitionLineId?: string | null;
  inventoryId?: string | null;
  allocationMode?: string;
  taskId?: string | null;
  serialIds?: string[] | null;
};

type PickFifoReservation = {
  id: string;
  requisitionLineId: string;
  inventoryId: string;
  inventoryLayerId: string | null;
  qty: Prisma.Decimal;
  consumedQty: Prisma.Decimal;
  releasedQty: Prisma.Decimal;
  status: string;
  inventoryLayer: { id: string; lotNumber: string | null; receivedAt: Date | null; createdAt: Date } | null;
};

export function comparePickFifoReservations(a: PickFifoReservation, b: PickFifoReservation) {
  const aReceived = a.inventoryLayer?.receivedAt ? a.inventoryLayer.receivedAt.getTime() : Number.POSITIVE_INFINITY;
  const bReceived = b.inventoryLayer?.receivedAt ? b.inventoryLayer.receivedAt.getTime() : Number.POSITIVE_INFINITY;
  if (aReceived !== bReceived) return aReceived - bReceived;
  const aCreated = a.inventoryLayer?.createdAt.getTime() ?? 0;
  const bCreated = b.inventoryLayer?.createdAt.getTime() ?? 0;
  if (aCreated !== bCreated) return aCreated - bCreated;
  const layerCmp = String(a.inventoryLayerId || a.inventoryLayer?.id || "").localeCompare(
    String(b.inventoryLayerId || b.inventoryLayer?.id || "")
  );
  if (layerCmp !== 0) return layerCmp;
  return a.id.localeCompare(b.id);
}

function planFifoReservationConsumption(reservations: PickFifoReservation[], requested: Prisma.Decimal) {
  const allocations: Array<{ reservation: PickFifoReservation; qty: Prisma.Decimal }> = [];
  let remaining = requested;
  for (const reservation of [...reservations].sort(comparePickFifoReservations)) {
    if (remaining.lessThanOrEqualTo(0)) break;
    if (reservation.status !== "ACTIVE") continue;
    const active = activeReserved(reservation.qty, reservation.consumedQty, reservation.releasedQty);
    if (active.lessThanOrEqualTo(0)) continue;
    const take = active.lessThan(remaining) ? active : remaining;
    allocations.push({ reservation, qty: take });
    remaining = remaining.minus(take);
  }
  return { allocations, remaining };
}

async function lockReservationsById(tx: Prisma.TransactionClient, ids: string[]) {
  if (!ids.length) return;
  const sorted = [...new Set(ids)].sort((a, b) => a.localeCompare(b));
  await tx.$queryRaw(
    Prisma.sql`SELECT "id" FROM "InventoryReservation" WHERE "id" IN (${Prisma.join(sorted)}) ORDER BY "id" FOR UPDATE`
  );
}

async function lockSerialsById(tx: Prisma.TransactionClient, ids: string[]) {
  if (!ids.length) return;
  const sorted = [...new Set(ids)].sort((a, b) => a.localeCompare(b));
  await tx.$queryRaw(
    Prisma.sql`SELECT "id" FROM "InventorySerial" WHERE "id" IN (${Prisma.join(sorted)}) ORDER BY "id" FOR UPDATE`
  );
}

function assertPositiveIntegerQty(qty: Prisma.Decimal) {
  if (qty.lessThanOrEqualTo(0) || !qty.isInteger()) {
    throw new RequisitionError("INVALID_QTY", "La cantidad serializada debe ser un entero positivo.");
  }
}

function normalizeSerialIds(raw: string[] | null | undefined) {
  return (Array.isArray(raw) ? raw : []).map((id) => String(id || "").trim()).filter(Boolean);
}

function assertDistinctSerialIds(ids: string[], qty: Prisma.Decimal) {
  if (ids.length !== Number(qty)) {
    throw new RequisitionError(
      "SERIAL_COUNT_MISMATCH",
      "La cantidad de series no coincide con las piezas a surtir."
    );
  }
  if (new Set(ids).size !== ids.length) {
    throw new RequisitionError("SERIAL_DUPLICATE", "Hay series duplicadas.");
  }
}

type SerialLookupDb = {
  inventorySerial: {
    findMany: Prisma.TransactionClient["inventorySerial"]["findMany"];
  };
};

async function countSerialsByLayer(db: SerialLookupDb, layerIds: string[]) {
  const unique = [...new Set(layerIds.filter(Boolean))];
  const counts = new Map<string, number>();
  for (const id of unique) counts.set(id, 0);
  if (!unique.length) return counts;
  const rows = await db.inventorySerial.findMany({
    where: { inventoryLayerId: { in: unique } },
    select: { id: true, inventoryLayerId: true }
  });
  for (const row of rows) {
    const layerId = row.inventoryLayerId || "";
    if (!layerId) continue;
    counts.set(layerId, (counts.get(layerId) || 0) + 1);
  }
  return counts;
}

type PickSerialRow = {
  id: string;
  productId: string;
  inventoryLayerId: string | null;
  serialNumber: string;
  imei: string | null;
};

function assignSerialsToFifoSlices(
  serials: PickSerialRow[],
  productId: string,
  allocations: Array<{ reservation: PickFifoReservation; qty: Prisma.Decimal }>
) {
  const planLayerIds = allocations
    .map((slice) => slice.reservation.inventoryLayerId)
    .filter((id): id is string => Boolean(id));
  const planSet = new Set(planLayerIds);
  for (const serial of serials) {
    if (serial.productId !== productId) {
      throw new RequisitionError("SERIAL_PRODUCT_MISMATCH", "La serie no pertenece al SKU de la línea.");
    }
    if (!serial.inventoryLayerId) {
      throw new RequisitionError("SERIAL_ALREADY_SHIPPED", "La serie ya fue surtida.");
    }
    if (!planSet.has(serial.inventoryLayerId)) {
      throw new RequisitionError(
        "SERIAL_NOT_IN_RESERVED_LAYER",
        "La serie no está en las capas reservadas de este cubo."
      );
    }
  }
  const grouped = new Map<string, PickSerialRow[]>();
  for (const layerId of planLayerIds) grouped.set(layerId, []);
  for (const serial of serials) {
    const list = grouped.get(serial.inventoryLayerId!) || [];
    list.push(serial);
    grouped.set(serial.inventoryLayerId!, list);
  }
  return allocations.map((slice) => {
    const layerId = slice.reservation.inventoryLayerId!;
    const have = [...(grouped.get(layerId) || [])].sort((a, b) => a.id.localeCompare(b.id));
    if (have.length !== Number(slice.qty)) {
      throw new RequisitionError(
        "SERIAL_FIFO_LAYER_MISMATCH",
        "Las series no respetan el orden FIFO de las capas reservadas."
      );
    }
    return { slice, serials: have };
  });
}

function classifyFifoSerialization(
  allocations: Array<{ reservation: PickFifoReservation; qty: Prisma.Decimal }>,
  serialCounts: Map<string, number>,
  serialControlled: boolean
) {
  const layerIds = allocations
    .map((slice) => slice.reservation.inventoryLayerId)
    .filter((id): id is string => Boolean(id));
  if (layerIds.length !== allocations.length) {
    throw new RequisitionError("LAYER_REQUIRED", "Una reserva FIFO no tiene capa.");
  }
  const serialized = layerIds.filter((id) => (serialCounts.get(id) || 0) > 0);
  const unserialized = layerIds.filter((id) => (serialCounts.get(id) || 0) === 0);
  if (serialized.length && unserialized.length) {
    throw new RequisitionError(
      "MIXED_SERIALIZATION_NOT_SUPPORTED",
      "No se puede surtir un plan FIFO que mezcla capas serializadas y no serializadas."
    );
  }
  if (serialControlled) {
    for (const slice of allocations) {
      const layerId = slice.reservation.inventoryLayerId!;
      if ((serialCounts.get(layerId) || 0) === 0) {
        throw new RequisitionError(
          "SERIALS_MISSING_ON_LAYER",
          "El producto es serializado y la capa no tiene series registradas."
        );
      }
      if (new Prisma.Decimal(serialCounts.get(layerId) || 0).lessThan(slice.qty)) {
        throw new RequisitionError(
          "SERIALS_MISSING_ON_LAYER",
          "El producto es serializado y la capa no tiene series suficientes para el tramo FIFO."
        );
      }
    }
  }
  return {
    layerIds,
    serialRequired: serialized.length > 0 || serialControlled
  };
}

type EligiblePickDb = {
  requisitionLine: {
    findUnique: Prisma.TransactionClient["requisitionLine"]["findUnique"];
  };
  inventory: {
    findUnique: Prisma.TransactionClient["inventory"]["findUnique"];
  };
  inventoryReservation: {
    findMany: Prisma.TransactionClient["inventoryReservation"]["findMany"];
  };
  inventorySerial: {
    findMany: Prisma.TransactionClient["inventorySerial"]["findMany"];
  };
};

async function loadActiveFifoReservations(db: EligiblePickDb, lineId: string) {
  return (await db.inventoryReservation.findMany({
    where: { requisitionLineId: lineId },
    include: {
      inventoryLayer: { select: { id: true, lotNumber: true, receivedAt: true, createdAt: true } }
    }
  })) as PickFifoReservation[];
}

function selectCubeReservations(
  reservations: PickFifoReservation[],
  requestedInventoryId: string,
  qty: Prisma.Decimal,
  pending: Prisma.Decimal
) {
  const activeReservations = reservations.filter(
    (row) => row.status === "ACTIVE" && activeReserved(row.qty, row.consumedQty, row.releasedQty).greaterThan(0)
  );
  if (!activeReservations.length) {
    throw new RequisitionError("NO_ACTIVE_RESERVATION", "La línea de requisición no tiene reserva activa.");
  }
  const cubeIds = [...new Set(activeReservations.map((row) => row.inventoryId))];
  const requested = requestedInventoryId.trim();
  if (!requested) {
    if (cubeIds.length > 1) {
      throw new RequisitionError(
        "AMBIGUOUS_RESERVATION_INVENTORY",
        "Hay reservas activas en varios cubos; indica inventoryId.",
        { inventoryIds: cubeIds }
      );
    }
  } else if (!cubeIds.includes(requested)) {
    throw new RequisitionError("RESERVATION_INVENTORY_MISMATCH", "El cubo no tiene reservas activas de esta línea.");
  }
  const inventoryId = requested || cubeIds[0]!;
  const cubeReservations = activeReservations.filter((row) => row.inventoryId === inventoryId);
  const reservedActive = cubeReservations.reduce(
    (sum, row) => sum.plus(activeReserved(row.qty, row.consumedQty, row.releasedQty)),
    new Prisma.Decimal(0)
  );
  if (qty.greaterThan(reservedActive)) {
    throw new RequisitionError("INSUFFICIENT_RESERVED", "La cantidad supera el reservado activo del cubo.");
  }
  if (qty.greaterThan(pending)) {
    throw new RequisitionError("LINE_FULFILLMENT_EXCEEDED", "La cantidad excede el pendiente de la línea.");
  }
  const planned = planFifoReservationConsumption(cubeReservations, qty);
  if (planned.remaining.greaterThan(0) || !planned.allocations.length) {
    throw new RequisitionError("INSUFFICIENT_RESERVED", "La cantidad supera el reservado activo del cubo.");
  }
  return { inventoryId, cubeReservations, planned };
}

export async function getEligiblePickSerials(
  input: { requisitionId: string; lineId: string; inventoryId: string; quantity: Prisma.Decimal | string | number },
  db: EligiblePickDb = prisma
) {
  const qty = dec(input.quantity);
  assertPositiveIntegerQty(qty);
  const inventoryId = String(input.inventoryId || "").trim();
  if (!inventoryId) {
    throw new RequisitionError("INVENTORY_REQUIRED", "Indica el cubo de inventario.");
  }
  const line = await db.requisitionLine.findUnique({
    where: { id: input.lineId },
    include: { requisition: { include: { project: true } }, product: true }
  });
  if (!line || line.requisitionId !== input.requisitionId) {
    throw new RequisitionError("LINE_NOT_FOUND", "Línea de requisición no encontrada.");
  }
  assertRequisitionAllowsPick(line.requisition.status);
  if (!isOperationalProjectRecord(line.requisition.project)) {
    throw new RequisitionError("PROJECT_NOT_AVAILABLE", "El proyecto de la requisición no es operativo.");
  }
  const inventory = await db.inventory.findUnique({
    where: { id: inventoryId },
    include: { location: true, project: { select: { id: true, code: true, name: true } } }
  });
  if (!inventory) throw new RequisitionError("INVENTORY_NOT_FOUND", "Línea de inventario no disponible.");
  if (
    inventory.productId !== line.productId ||
    inventory.assignmentType !== "PROJECT" ||
    inventory.projectId !== line.requisition.projectId
  ) {
    throw new RequisitionError(
      "PICK_PROJECT_MISMATCH",
      "La reserva no corresponde a inventario PROJECT del proyecto de la requisición."
    );
  }
  const reservations = await loadActiveFifoReservations(db, line.id);
  const pending = line.requestedQty.minus(line.fulfilledQty);
  const { planned } = selectCubeReservations(reservations, inventoryId, qty, pending);
  const layerIds = planned.allocations
    .map((slice) => slice.reservation.inventoryLayerId)
    .filter((id): id is string => Boolean(id));
  const serialCounts = await countSerialsByLayer(db, layerIds);
  const serialControlled = Boolean(line.product.serialControlled);
  const classified = classifyFifoSerialization(planned.allocations, serialCounts, serialControlled);
  const serials = classified.serialRequired
    ? await db.inventorySerial.findMany({
        where: { productId: line.productId, inventoryLayerId: { in: classified.layerIds } },
        select: { id: true, serialNumber: true, imei: true, inventoryLayerId: true }
      })
    : [];
  const serialsByLayer = new Map<string, Array<{ id: string; serialNumber: string; imei: string | null }>>();
  for (const serial of serials) {
    const layerId = serial.inventoryLayerId || "";
    if (!layerId) continue;
    const list = serialsByLayer.get(layerId) || [];
    list.push({ id: serial.id, serialNumber: serial.serialNumber, imei: serial.imei });
    serialsByLayer.set(layerId, list);
  }
  for (const list of serialsByLayer.values()) {
    list.sort((a, b) => a.serialNumber.localeCompare(b.serialNumber, "es"));
  }
  return {
    serialRequired: classified.serialRequired,
    serialControlled,
    quantity: qty.toString(),
    inventoryId,
    layers: planned.allocations.map((slice) => {
      const layerId = slice.reservation.inventoryLayerId!;
      const layer = slice.reservation.inventoryLayer;
      return {
        reservationId: slice.reservation.id,
        inventoryLayerId: layerId,
        lotNumber: layer?.lotNumber ?? null,
        receivedAt: layer?.receivedAt ? layer.receivedAt.toISOString() : null,
        requiredQty: slice.qty.toString(),
        serials: serialsByLayer.get(layerId) || []
      };
    })
  };
}

function assertRequisitionAllowsPick(status: string) {
  if (!["APPROVED", "IN_PROGRESS"].includes(status)) {
    throw new RequisitionError("REQUISITION_CLOSED", "La requisición no permite picking.");
  }
}

function scannedCodeMatchesProduct(code: string, product: { sku: string; barcode: string | null }) {
  const token = code.trim();
  if (!token) return true;
  const sku = String(product.sku || "").trim();
  const barcode = String(product.barcode || "").trim();
  return token.toUpperCase() === sku.toUpperCase() || (barcode && token.toUpperCase() === barcode.toUpperCase());
}

async function resolvePickTaskId(
  tx: Prisma.TransactionClient,
  requisitionId: string,
  clientTaskId: string | null | undefined
) {
  const requested = clientTaskId?.trim() || "";
  if (requested) {
    const claimed = await tx.task.findUnique({
      where: { id: requested },
      select: { id: true, type: true, requisitionId: true }
    });
    if (!claimed || claimed.type !== "PICK" || claimed.requisitionId !== requisitionId) {
      throw new RequisitionError("TASK_MISMATCH", "El taskId no pertenece a la requisición de esta reserva.");
    }
  }
  const open = await tx.task.findFirst({
    where: {
      requisitionId,
      type: "PICK",
      status: { notIn: ["COMPLETED", "CANCELLED", "REJECTED"] }
    },
    orderBy: { createdAt: "asc" },
    select: { id: true }
  });
  return open?.id ?? null;
}

async function completeOpenPickTasks(tx: Prisma.TransactionClient, requisitionId: string) {
  await tx.task.updateMany({
    where: {
      requisitionId,
      type: "PICK",
      status: { notIn: ["COMPLETED", "CANCELLED", "REJECTED"] }
    },
    data: { status: "COMPLETED" }
  });
}

async function assertLayersHaveNoSerials(tx: Prisma.TransactionClient, layerIds: string[]) {
  const unique = [...new Set(layerIds.filter(Boolean))];
  for (const layerId of unique) {
    try {
      await assertNoSerialAmbiguity(tx, layerId);
    } catch (error) {
      if (error instanceof InventoryMutationError && error.code === "SERIAL_SELECTION_REQUIRED") {
        throw new RequisitionError(
          "SERIAL_SELECTION_REQUIRED",
          "No se puede surtir: hay series en una o más capas FIFO y el picking de requisición aún no admite seleccionar seriales. No se modificó inventario."
        );
      }
      throw error;
    }
  }
}

async function applyLineFulfillment(
  tx: Prisma.TransactionClient,
  lineId: string,
  requisitionId: string,
  previousStatus: string,
  total: Prisma.Decimal
) {
  const lineRows = await tx.$queryRaw<Array<{ id: string; fulfilledQty: Prisma.Decimal }>>`
    UPDATE "RequisitionLine"
    SET "fulfilledQty" = "fulfilledQty" + ${total}, "updatedAt" = NOW()
    WHERE id = ${lineId}
      AND "fulfilledQty" + ${total} <= "requestedQty"
    RETURNING id, "fulfilledQty"
  `;
  if (!lineRows.length) {
    throw new RequisitionError("LINE_FULFILLMENT_EXCEEDED", "La cantidad excede el pendiente de la línea.");
  }
  const allLines = await tx.requisitionLine.findMany({ where: { requisitionId } });
  const fulfillment = fulfillmentState(allLines);
  const nextStatus = fulfillment === "SURTIDA" ? "COMPLETED" : fulfillment === "PARCIAL" ? "IN_PROGRESS" : previousStatus;
  if (nextStatus !== previousStatus) {
    await tx.requisition.update({ where: { id: requisitionId }, data: { status: nextStatus } });
  }
  if (nextStatus === "COMPLETED") {
    await completeOpenPickTasks(tx, requisitionId);
  }
  return { newFulfilled: lineRows[0]!.fulfilledQty, nextStatus, fulfillment };
}

export async function consumeReservationPick(input: ConsumeReservationPickInput) {
  return prisma.$transaction(async (tx) => consumeReservationPickInTransaction(tx, input));
}

export async function consumeReservationPickInTransaction(
  tx: Prisma.TransactionClient,
  input: ConsumeReservationPickInput
) {
  const allocationMode = parseAllocationMode(input.allocationMode);
  const reservationId = input.reservationId?.trim() || "";
  if (reservationId && allocationMode) {
    throw new RequisitionError(
      "RESERVATION_ALLOCATION_CONFLICT",
      "No se puede indicar reservationId y allocationMode al mismo tiempo."
    );
  }
  const serialIds = normalizeSerialIds(input.serialIds);
  if (serialIds.length && reservationId) {
    throw new RequisitionError(
      "RESERVATION_ALLOCATION_CONFLICT",
      "No se puede indicar serialIds y reservationId al mismo tiempo."
    );
  }
  if (serialIds.length && allocationMode !== "FIFO") {
    throw new RequisitionError("SERIAL_IDS_REQUIRE_FIFO", "Las series solo se pueden indicar en picking FIFO.");
  }
  if (allocationMode === "FIFO") {
    return consumeFifoReservationPickInTransaction(tx, input);
  }
  if (!reservationId) {
    throw new RequisitionError("RESERVATION_REQUIRED", "Indica reservationId o allocationMode FIFO.");
  }
  return consumeSingleReservationPickInTransaction(tx, { ...input, reservationId });
}

async function finishSerializedFifoPick(
  tx: Prisma.TransactionClient,
  args: {
    input: ConsumeReservationPickInput;
    qty: Prisma.Decimal;
    inventoryId: string;
    lockedInventory: {
      qty: Prisma.Decimal;
      status: string;
      locationId: string;
      assignmentType: InventoryAssignmentType;
      projectId: string | null;
      assignmentKey: string;
      location: { code: string; warehouse: string };
      project: { id: string; code: string; name: string } | null;
    };
    lockedLine: {
      id: string;
      productId: string;
      requisitionId: string;
      product: { id: string; sku: string; name: string; barcode: string | null };
      requisition: { number: string; status: string; projectId: string };
    };
    movementTaskId: string | null;
    assigned: Array<{
      slice: { reservation: PickFifoReservation; qty: Prisma.Decimal };
      serials: PickSerialRow[];
    }>;
  }
) {
  const { input, qty, inventoryId, lockedInventory, lockedLine, movementTaskId, assigned } = args;
  const before = lockedInventory.qty;
  const invRows = await tx.$queryRaw<Array<{ id: string; qty: Prisma.Decimal; reservedQty: Prisma.Decimal }>>`
    UPDATE "Inventory"
    SET qty = qty - ${qty}, "reservedQty" = "reservedQty" - ${qty}, "updatedAt" = NOW()
    WHERE id = ${inventoryId}
      AND qty >= ${qty}
      AND "reservedQty" >= ${qty}
    RETURNING id, qty, "reservedQty"
  `;
  if (!invRows.length) throw new RequisitionError("INSUFFICIENT_STOCK", "No se pudo consumir la reserva en inventario.");

  for (const { slice } of assigned) {
    const layerId = slice.reservation.inventoryLayerId!;
    const layerRows = await tx.$queryRaw<Array<{ id: string; qty: Prisma.Decimal; reservedQty: Prisma.Decimal }>>`
      UPDATE "InventoryLayer"
      SET qty = qty - ${slice.qty}, "reservedQty" = "reservedQty" - ${slice.qty}, "updatedAt" = NOW()
      WHERE id = ${layerId}
        AND qty >= ${slice.qty}
        AND "reservedQty" >= ${slice.qty}
      RETURNING id, qty, "reservedQty"
    `;
    if (!layerRows.length) throw new RequisitionError("INSUFFICIENT_STOCK", "No se pudo consumir la reserva en la capa.");
    const newConsumed = slice.reservation.consumedQty.plus(slice.qty);
    const newActive = activeReserved(slice.reservation.qty, newConsumed, slice.reservation.releasedQty);
    await tx.inventoryReservation.update({
      where: { id: slice.reservation.id },
      data: {
        consumedQty: newConsumed,
        status: newActive.lessThanOrEqualTo(0) ? "CONSUMED" : "ACTIVE"
      }
    });
  }

  const movements: Array<{ id: string }> = [];
  const allocations: Prisma.InputJsonValue[] = [];
  const serialMetadata: Prisma.InputJsonValue[] = [];
  let runningQty = before;
  for (const { slice, serials } of assigned) {
    const layerId = slice.reservation.inventoryLayerId!;
    const sliceSerialIds: string[] = [];
    const sliceMovementIds: string[] = [];
    for (const serial of serials) {
      await tx.inventorySerial.update({
        where: { id: serial.id },
        data: { inventoryLayerId: null }
      });
      const quantityBefore = runningQty;
      runningQty = runningQty.minus(1);
      const movement = await tx.inventoryMovement.create({
        data: {
          productId: lockedLine.productId,
          type: "PICK",
          movementType: "OUT",
          stockStatus: lockedInventory.status,
          qty: new Prisma.Decimal(1),
          warehouse: lockedInventory.location.warehouse,
          fromLocationId: lockedInventory.locationId,
          inventoryLayerId: layerId,
          inventorySerialId: serial.id,
          requisitionLineId: lockedLine.id,
          quantityBefore,
          quantityAfter: runningQty,
          reference: lockedLine.requisition.number,
          notes: `PICK FIFO reserved ${slice.reservation.id}`,
          userId: input.userId,
          taskId: movementTaskId,
          ...outboundAssignmentFields(assignmentFromInventory(lockedInventory))
        }
      });
      movements.push(movement);
      sliceSerialIds.push(serial.id);
      sliceMovementIds.push(movement.id);
      serialMetadata.push({
        id: serial.id,
        serialNumber: serial.serialNumber,
        imei: serial.imei,
        inventoryLayerId: layerId,
        movementId: movement.id
      });
    }
    allocations.push({
      reservationId: slice.reservation.id,
      inventoryLayerId: layerId,
      qty: slice.qty.toString(),
      lotNumber: slice.reservation.inventoryLayer?.lotNumber ?? null,
      receivedAt: slice.reservation.inventoryLayer?.receivedAt
        ? slice.reservation.inventoryLayer.receivedAt.toISOString()
        : null,
      serialIds: sliceSerialIds,
      movementIds: sliceMovementIds
    });
  }

  await applyLineFulfillment(tx, lockedLine.id, lockedLine.requisitionId, lockedLine.requisition.status, qty);

  const scanEvent = await tx.scanEvent.create({
    data: {
      scannedCode: input.scannedCode,
      result: "OK",
      userId: input.userId,
      productId: lockedLine.productId,
      warehouse: lockedInventory.location.warehouse,
      location: lockedInventory.location.code,
      taskId: movementTaskId
    }
  });
  await logActivity(
    {
      type: "PICK",
      subtype: "PICK_RESERVED_FIFO_SUCCESS",
      reference: input.scannedCode,
      userId: input.userId,
      productId: lockedLine.productId,
      customerId: lockedLine.requisition.projectId,
      warehouse: lockedInventory.location.warehouse,
      location: lockedInventory.location.code,
      qty,
      result: "OK",
      taskId: movementTaskId,
      metadata: {
        allocationMode: "FIFO",
        requisitionId: lockedLine.requisitionId,
        requisitionLineId: lockedLine.id,
        inventoryId,
        requestedPickQty: qty.toString(),
        taskId: movementTaskId,
        scanEventId: scanEvent.id,
        serialIds: assigned.flatMap((row) => row.serials.map((serial) => serial.id)),
        serials: serialMetadata,
        allocations
      }
    },
    tx
  );

  return {
    before,
    after: invRows[0]!.qty,
    movement: movements[0]!,
    movements,
    scanEvent,
    product: lockedLine.product,
    location: lockedInventory.location,
    inventoryStatus: lockedInventory.status,
    assignmentType: lockedInventory.assignmentType,
    projectId: lockedInventory.projectId,
    assignmentKey: lockedInventory.assignmentKey,
    project: lockedInventory.project,
    fifo: true as const,
    allocations
  };
}

async function consumeFifoReservationPickInTransaction(
  tx: Prisma.TransactionClient,
  input: ConsumeReservationPickInput
) {
  const lineId = input.requisitionLineId?.trim() || "";
  if (!lineId) {
    throw new RequisitionError("REQUISITION_LINE_REQUIRED", "El picking FIFO requiere requisitionLineId.");
  }
  const qty = dec(input.qty);
  if (qty.lessThanOrEqualTo(0)) {
    throw new RequisitionError("INVALID_QTY", "La cantidad a surtir debe ser mayor a 0.");
  }

  const line = await tx.requisitionLine.findUnique({
    where: { id: lineId },
    include: { requisition: { include: { project: true } }, product: true }
  });
  if (!line) throw new RequisitionError("LINE_NOT_FOUND", "Línea de requisición no encontrada.");
  assertRequisitionAllowsPick(line.requisition.status);
  if (!isOperationalProjectRecord(line.requisition.project)) {
    throw new RequisitionError("PROJECT_NOT_AVAILABLE", "El proyecto de la requisición no es operativo.");
  }
  if (!scannedCodeMatchesProduct(input.scannedCode, line.product)) {
    throw new RequisitionError("SKU_MISMATCH", "El código escaneado no corresponde al SKU de la línea.");
  }

  const loadedReservations = (await tx.inventoryReservation.findMany({
    where: { requisitionLineId: lineId },
    include: {
      inventoryLayer: { select: { id: true, lotNumber: true, receivedAt: true, createdAt: true } }
    }
  })) as PickFifoReservation[];
  const activeReservations = loadedReservations.filter(
    (row) => row.status === "ACTIVE" && activeReserved(row.qty, row.consumedQty, row.releasedQty).greaterThan(0)
  );
  if (!activeReservations.length) {
    throw new RequisitionError("NO_ACTIVE_RESERVATION", "La línea de requisición no tiene reserva activa.");
  }

  const cubeIds = [...new Set(activeReservations.map((row) => row.inventoryId))];
  const requestedInventoryId = input.inventoryId?.trim() || "";
  if (!requestedInventoryId) {
    if (cubeIds.length > 1) {
      throw new RequisitionError(
        "AMBIGUOUS_RESERVATION_INVENTORY",
        "Hay reservas activas en varios cubos; indica inventoryId.",
        { inventoryIds: cubeIds }
      );
    }
  } else if (!cubeIds.includes(requestedInventoryId)) {
    throw new RequisitionError("RESERVATION_INVENTORY_MISMATCH", "El cubo no tiene reservas activas de esta línea.");
  }
  const inventoryId = requestedInventoryId || cubeIds[0]!;
  const cubeReservations = activeReservations.filter((row) => row.inventoryId === inventoryId);
  const reservedActive = cubeReservations.reduce(
    (sum, row) => sum.plus(activeReserved(row.qty, row.consumedQty, row.releasedQty)),
    new Prisma.Decimal(0)
  );
  if (qty.greaterThan(reservedActive)) {
    throw new RequisitionError("INSUFFICIENT_RESERVED", "La cantidad supera el reservado activo del cubo.");
  }
  const pending = line.requestedQty.minus(line.fulfilledQty);
  if (qty.greaterThan(pending)) {
    throw new RequisitionError("LINE_FULFILLMENT_EXCEEDED", "La cantidad excede el pendiente de la línea.");
  }

  const inventoryPreview = await tx.inventory.findUnique({
    where: { id: inventoryId },
    include: { location: true, project: { select: { id: true, code: true, name: true } } }
  });
  if (!inventoryPreview) throw new RequisitionError("INVENTORY_NOT_FOUND", "Línea de inventario no disponible.");
  if (
    inventoryPreview.productId !== line.productId ||
    inventoryPreview.assignmentType !== "PROJECT" ||
    inventoryPreview.projectId !== line.requisition.projectId
  ) {
    throw new RequisitionError(
      "PICK_PROJECT_MISMATCH",
      "La reserva no corresponde a inventario PROJECT del proyecto de la requisición."
    );
  }

  const movementTaskId = await resolvePickTaskId(tx, line.requisitionId, input.taskId);

  await lockInventoryAndLayers(tx, inventoryId);
  await lockReservationsById(
    tx,
    cubeReservations.map((row) => row.id)
  );

  const lockedInventory = await tx.inventory.findUniqueOrThrow({
    where: { id: inventoryId },
    include: { location: true, project: { select: { id: true, code: true, name: true } } }
  });
  if (
    lockedInventory.productId !== line.productId ||
    lockedInventory.assignmentType !== "PROJECT" ||
    lockedInventory.projectId !== line.requisition.projectId
  ) {
    throw new RequisitionError(
      "PICK_PROJECT_MISMATCH",
      "La reserva no corresponde a inventario PROJECT del proyecto de la requisición."
    );
  }

  const lockedLine = await tx.requisitionLine.findUniqueOrThrow({
    where: { id: line.id },
    include: { requisition: { include: { project: true } }, product: true }
  });
  assertRequisitionAllowsPick(lockedLine.requisition.status);
  if (!isOperationalProjectRecord(lockedLine.requisition.project)) {
    throw new RequisitionError("PROJECT_NOT_AVAILABLE", "El proyecto de la requisición no es operativo.");
  }
  const lockedPending = lockedLine.requestedQty.minus(lockedLine.fulfilledQty);
  if (qty.greaterThan(lockedPending)) {
    throw new RequisitionError("LINE_FULFILLMENT_EXCEEDED", "La cantidad excede el pendiente de la línea.");
  }

  const lockedReservations = (await tx.inventoryReservation.findMany({
    where: { id: { in: cubeReservations.map((row) => row.id) } },
    include: {
      inventoryLayer: { select: { id: true, lotNumber: true, receivedAt: true, createdAt: true } }
    }
  })) as PickFifoReservation[];
  const stillActive = lockedReservations.filter(
    (row) =>
      row.status === "ACTIVE" &&
      row.inventoryId === inventoryId &&
      row.requisitionLineId === line.id &&
      activeReserved(row.qty, row.consumedQty, row.releasedQty).greaterThan(0)
  );
  const planned = planFifoReservationConsumption(stillActive, qty);
  if (planned.remaining.greaterThan(0) || !planned.allocations.length) {
    throw new RequisitionError("INSUFFICIENT_RESERVED", "La cantidad supera el reservado activo del cubo.");
  }

  const participatingLayerIds = planned.allocations
    .map((slice) => slice.reservation.inventoryLayerId)
    .filter((id): id is string => Boolean(id));
  if (participatingLayerIds.length !== planned.allocations.length) {
    throw new RequisitionError("LAYER_REQUIRED", "Una reserva FIFO no tiene capa.");
  }
  const serialCounts = await countSerialsByLayer(tx, participatingLayerIds);
  const classified = classifyFifoSerialization(
    planned.allocations,
    serialCounts,
    Boolean(lockedLine.product.serialControlled)
  );
  const serialIds = normalizeSerialIds(input.serialIds);
  if (classified.serialRequired) {
    assertPositiveIntegerQty(qty);
    if (!serialIds.length) {
      throw new RequisitionError(
        "SERIAL_SELECTION_REQUIRED",
        "Debes seleccionar las series a surtir. No se modificó inventario."
      );
    }
    assertDistinctSerialIds(serialIds, qty);
    await lockSerialsById(tx, serialIds);
    const relockedReservations = (await tx.inventoryReservation.findMany({
      where: { id: { in: cubeReservations.map((row) => row.id) } },
      include: {
        inventoryLayer: { select: { id: true, lotNumber: true, receivedAt: true, createdAt: true } }
      }
    })) as PickFifoReservation[];
    const relockedActive = relockedReservations.filter(
      (row) =>
        row.status === "ACTIVE" &&
        row.inventoryId === inventoryId &&
        row.requisitionLineId === line.id &&
        activeReserved(row.qty, row.consumedQty, row.releasedQty).greaterThan(0)
    );
    const replanned = planFifoReservationConsumption(relockedActive, qty);
    if (replanned.remaining.greaterThan(0) || !replanned.allocations.length) {
      throw new RequisitionError("INSUFFICIENT_RESERVED", "La cantidad supera el reservado activo del cubo.");
    }
    const relockedLayerIds = replanned.allocations
      .map((slice) => slice.reservation.inventoryLayerId)
      .filter((id): id is string => Boolean(id));
    const relockedCounts = await countSerialsByLayer(tx, relockedLayerIds);
    classifyFifoSerialization(
      replanned.allocations,
      relockedCounts,
      Boolean(lockedLine.product.serialControlled)
    );
    const lockedSerials = (await tx.inventorySerial.findMany({
      where: { id: { in: serialIds } },
      select: { id: true, productId: true, inventoryLayerId: true, serialNumber: true, imei: true }
    })) as PickSerialRow[];
    if (lockedSerials.length !== serialIds.length) {
      throw new RequisitionError("SERIAL_NOT_FOUND", "Una o más series no existen.");
    }
    const serialById = new Map(lockedSerials.map((row) => [row.id, row]));
    const orderedSerials = serialIds.map((id) => serialById.get(id)!);
    const assigned = assignSerialsToFifoSlices(orderedSerials, lockedLine.productId, replanned.allocations);
    return finishSerializedFifoPick(tx, {
      input,
      qty,
      inventoryId,
      lockedInventory,
      lockedLine,
      movementTaskId,
      assigned
    });
  }
  if (serialIds.length) {
    throw new RequisitionError(
      "SERIAL_COUNT_MISMATCH",
      "La cantidad de series no coincide con las piezas a surtir."
    );
  }
  await assertLayersHaveNoSerials(tx, participatingLayerIds);

  const before = lockedInventory.qty;
  const invRows = await tx.$queryRaw<Array<{ id: string; qty: Prisma.Decimal; reservedQty: Prisma.Decimal }>>`
    UPDATE "Inventory"
    SET qty = qty - ${qty}, "reservedQty" = "reservedQty" - ${qty}, "updatedAt" = NOW()
    WHERE id = ${inventoryId}
      AND qty >= ${qty}
      AND "reservedQty" >= ${qty}
    RETURNING id, qty, "reservedQty"
  `;
  if (!invRows.length) throw new RequisitionError("INSUFFICIENT_STOCK", "No se pudo consumir la reserva en inventario.");

  const movements = [];
  const allocations: Prisma.InputJsonValue[] = [];
  let runningQty = before;
  for (const slice of planned.allocations) {
    const layerId = slice.reservation.inventoryLayerId!;
    const layerRows = await tx.$queryRaw<Array<{ id: string; qty: Prisma.Decimal; reservedQty: Prisma.Decimal }>>`
      UPDATE "InventoryLayer"
      SET qty = qty - ${slice.qty}, "reservedQty" = "reservedQty" - ${slice.qty}, "updatedAt" = NOW()
      WHERE id = ${layerId}
        AND qty >= ${slice.qty}
        AND "reservedQty" >= ${slice.qty}
      RETURNING id, qty, "reservedQty"
    `;
    if (!layerRows.length) throw new RequisitionError("INSUFFICIENT_STOCK", "No se pudo consumir la reserva en la capa.");

    const newConsumed = slice.reservation.consumedQty.plus(slice.qty);
    const newActive = activeReserved(slice.reservation.qty, newConsumed, slice.reservation.releasedQty);
    await tx.inventoryReservation.update({
      where: { id: slice.reservation.id },
      data: {
        consumedQty: newConsumed,
        status: newActive.lessThanOrEqualTo(0) ? "CONSUMED" : "ACTIVE"
      }
    });

    const quantityBefore = runningQty;
    runningQty = runningQty.minus(slice.qty);
    const movement = await tx.inventoryMovement.create({
      data: {
        productId: lockedLine.productId,
        type: "PICK",
        movementType: "OUT",
        stockStatus: lockedInventory.status,
        qty: slice.qty,
        warehouse: lockedInventory.location.warehouse,
        fromLocationId: lockedInventory.locationId,
        inventoryLayerId: layerId,
        requisitionLineId: lockedLine.id,
        quantityBefore,
        quantityAfter: runningQty,
        reference: lockedLine.requisition.number,
        notes: `PICK FIFO reserved ${slice.reservation.id}`,
        userId: input.userId,
        taskId: movementTaskId,
        ...outboundAssignmentFields(assignmentFromInventory(lockedInventory))
      }
    });
    movements.push(movement);
    allocations.push({
      reservationId: slice.reservation.id,
      inventoryLayerId: layerId,
      qty: slice.qty.toString(),
      lotNumber: slice.reservation.inventoryLayer?.lotNumber ?? null,
      receivedAt: slice.reservation.inventoryLayer?.receivedAt
        ? slice.reservation.inventoryLayer.receivedAt.toISOString()
        : null,
      movementId: movement.id
    });
  }

  await applyLineFulfillment(tx, lockedLine.id, lockedLine.requisitionId, lockedLine.requisition.status, qty);

  const scanEvent = await tx.scanEvent.create({
    data: {
      scannedCode: input.scannedCode,
      result: "OK",
      userId: input.userId,
      productId: lockedLine.productId,
      warehouse: lockedInventory.location.warehouse,
      location: lockedInventory.location.code,
      taskId: movementTaskId
    }
  });
  await logActivity(
    {
      type: "PICK",
      subtype: "PICK_RESERVED_FIFO_SUCCESS",
      reference: input.scannedCode,
      userId: input.userId,
      productId: lockedLine.productId,
      customerId: lockedLine.requisition.projectId,
      warehouse: lockedInventory.location.warehouse,
      location: lockedInventory.location.code,
      qty,
      result: "OK",
      taskId: movementTaskId,
      metadata: {
        allocationMode: "FIFO",
        requisitionId: lockedLine.requisitionId,
        requisitionLineId: lockedLine.id,
        inventoryId,
        requestedPickQty: qty.toString(),
        taskId: movementTaskId,
        scanEventId: scanEvent.id,
        allocations
      }
    },
    tx
  );

  return {
    before,
    after: invRows[0]!.qty,
    movement: movements[0]!,
    movements,
    scanEvent,
    product: lockedLine.product,
    location: lockedInventory.location,
    inventoryStatus: lockedInventory.status,
    assignmentType: lockedInventory.assignmentType,
    projectId: lockedInventory.projectId,
    assignmentKey: lockedInventory.assignmentKey,
    project: lockedInventory.project,
    fifo: true as const,
    allocations
  };
}

async function consumeSingleReservationPickInTransaction(
  tx: Prisma.TransactionClient,
  input: ConsumeReservationPickInput & { reservationId: string }
) {
  const reservation = await tx.inventoryReservation.findUnique({
    where: { id: input.reservationId },
    include: {
      requisitionLine: { include: { requisition: true, product: true } },
      inventory: { include: { location: true, project: { select: { id: true, code: true, name: true } } } },
      inventoryLayer: { select: { id: true, lotNumber: true, receivedAt: true, createdAt: true } }
    }
  });
  if (!reservation) throw new RequisitionError("RESERVATION_NOT_FOUND", "Reserva no encontrada.");
  if (input.requisitionLineId && reservation.requisitionLineId !== input.requisitionLineId) {
    throw new RequisitionError("LINE_MISMATCH", "La reserva no corresponde a la línea indicada.");
  }
  if (reservation.status !== "ACTIVE") throw new RequisitionError("RESERVATION_INACTIVE", "La reserva no está activa.");
  assertRequisitionAllowsPick(reservation.requisitionLine.requisition.status);
  const projectId = reservation.requisitionLine.requisition.projectId;
  if (
    reservation.inventory.productId !== reservation.requisitionLine.productId ||
    reservation.inventory.assignmentType !== "PROJECT" ||
    reservation.inventory.projectId !== projectId
  ) {
    throw new RequisitionError(
      "PICK_PROJECT_MISMATCH",
      "La reserva no corresponde a inventario PROJECT del proyecto de la requisición."
    );
  }
  const active = activeReserved(reservation.qty, reservation.consumedQty, reservation.releasedQty);
  if (input.qty.greaterThan(active)) {
    throw new RequisitionError("INSUFFICIENT_RESERVATION", "La reserva activa es insuficiente.");
  }
  const pending = reservation.requisitionLine.requestedQty.minus(reservation.requisitionLine.fulfilledQty);
  if (input.qty.greaterThan(pending)) {
    throw new RequisitionError("LINE_FULFILLED", "La línea ya está surtida o la cantidad excede el pendiente.");
  }
  if (!reservation.inventoryLayerId) {
    throw new RequisitionError("LAYER_REQUIRED", "La reserva no tiene capa.");
  }

  const movementTaskId = await resolvePickTaskId(tx, reservation.requisitionLine.requisitionId, input.taskId);

  await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "Inventory" WHERE "id" = ${reservation.inventoryId} FOR UPDATE`);
  await tx.$queryRaw(
    Prisma.sql`SELECT "id" FROM "InventoryLayer" WHERE "id" = ${reservation.inventoryLayerId} FOR UPDATE`
  );
  await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "InventoryReservation" WHERE "id" = ${reservation.id} FOR UPDATE`);

  const lockedReservation = await tx.inventoryReservation.findUniqueOrThrow({
    where: { id: reservation.id }
  });
  if (lockedReservation.status !== "ACTIVE") {
    throw new RequisitionError("RESERVATION_INACTIVE", "La reserva no está activa.");
  }
  const lockedActive = activeReserved(
    lockedReservation.qty,
    lockedReservation.consumedQty,
    lockedReservation.releasedQty
  );
  if (input.qty.greaterThan(lockedActive)) {
    throw new RequisitionError("INSUFFICIENT_RESERVATION", "La reserva activa es insuficiente.");
  }

  const lockedInventory = await tx.inventory.findUniqueOrThrow({ where: { id: reservation.inventoryId } });
  if (
    lockedInventory.productId !== reservation.requisitionLine.productId ||
    lockedInventory.assignmentType !== "PROJECT" ||
    lockedInventory.projectId !== projectId
  ) {
    throw new RequisitionError(
      "PICK_PROJECT_MISMATCH",
      "La reserva no corresponde a inventario PROJECT del proyecto de la requisición."
    );
  }

  const lockedLine = await tx.requisitionLine.findUniqueOrThrow({
    where: { id: reservation.requisitionLineId },
    include: { requisition: true }
  });
  assertRequisitionAllowsPick(lockedLine.requisition.status);
  if (input.qty.greaterThan(lockedLine.requestedQty.minus(lockedLine.fulfilledQty))) {
    throw new RequisitionError("LINE_FULFILLED", "La línea ya está surtida o la cantidad excede el pendiente.");
  }

  await assertLayersHaveNoSerials(tx, [reservation.inventoryLayerId]);

  const before = lockedInventory.qty;
  const layerRows = await tx.$queryRaw<Array<{ id: string; qty: Prisma.Decimal; reservedQty: Prisma.Decimal }>>`
    UPDATE "InventoryLayer"
    SET qty = qty - ${input.qty}, "reservedQty" = "reservedQty" - ${input.qty}, "updatedAt" = NOW()
    WHERE id = ${reservation.inventoryLayerId}
      AND qty >= ${input.qty}
      AND "reservedQty" >= ${input.qty}
    RETURNING id, qty, "reservedQty"
  `;
  if (!layerRows.length) throw new RequisitionError("INSUFFICIENT_STOCK", "No se pudo consumir la reserva en la capa.");
  const invRows = await tx.$queryRaw<Array<{ id: string; qty: Prisma.Decimal; reservedQty: Prisma.Decimal }>>`
    UPDATE "Inventory"
    SET qty = qty - ${input.qty}, "reservedQty" = "reservedQty" - ${input.qty}, "updatedAt" = NOW()
    WHERE id = ${reservation.inventoryId}
      AND qty >= ${input.qty}
      AND "reservedQty" >= ${input.qty}
    RETURNING id, qty, "reservedQty"
  `;
  if (!invRows.length) throw new RequisitionError("INSUFFICIENT_STOCK", "No se pudo consumir la reserva en inventario.");

  const newConsumed = lockedReservation.consumedQty.plus(input.qty);
  const newActive = activeReserved(lockedReservation.qty, newConsumed, lockedReservation.releasedQty);
  await tx.inventoryReservation.update({
    where: { id: reservation.id },
    data: {
      consumedQty: newConsumed,
      status: newActive.lessThanOrEqualTo(0) ? "CONSUMED" : "ACTIVE"
    }
  });

  await applyLineFulfillment(
    tx,
    reservation.requisitionLineId,
    reservation.requisitionLine.requisitionId,
    lockedLine.requisition.status,
    input.qty
  );

  const movement = await tx.inventoryMovement.create({
    data: {
      productId: reservation.requisitionLine.productId,
      type: "PICK",
      movementType: "OUT",
      stockStatus: reservation.inventory.status,
      qty: input.qty,
      warehouse: reservation.inventory.location.warehouse,
      fromLocationId: reservation.inventory.locationId,
      inventoryLayerId: reservation.inventoryLayerId,
      requisitionLineId: reservation.requisitionLineId,
      quantityBefore: before,
      quantityAfter: invRows[0]!.qty,
      reference: reservation.requisitionLine.requisition.number,
      notes: `PICK reserved ${input.reservationId}`,
      userId: input.userId,
      taskId: movementTaskId,
      ...outboundAssignmentFields(assignmentFromInventory(lockedInventory))
    }
  });
  const scanEvent = await tx.scanEvent.create({
    data: {
      scannedCode: input.scannedCode,
      result: "OK",
      userId: input.userId,
      productId: reservation.requisitionLine.productId,
      warehouse: reservation.inventory.location.warehouse,
      location: reservation.inventory.location.code,
      taskId: movementTaskId
    }
  });
  await logActivity(
    {
      type: "PICK",
      subtype: "PICK_RESERVED_SUCCESS",
      reference: input.scannedCode,
      userId: input.userId,
      productId: reservation.requisitionLine.productId,
      customerId: reservation.requisitionLine.requisition.projectId,
      warehouse: reservation.inventory.location.warehouse,
      location: reservation.inventory.location.code,
      qty: input.qty,
      result: "OK",
      taskId: movementTaskId,
      metadata: {
        reservationId: reservation.id,
        requisitionId: reservation.requisitionLine.requisitionId,
        requisitionLineId: reservation.requisitionLineId,
        movementId: movement.id,
        scanEventId: scanEvent.id
      }
    },
    tx
  );
  return {
    before,
    after: invRows[0]!.qty,
    movement,
    movements: [movement],
    scanEvent,
    product: reservation.requisitionLine.product,
    location: reservation.inventory.location,
    inventoryStatus: reservation.inventory.status,
    assignmentType: lockedInventory.assignmentType,
    projectId: lockedInventory.projectId,
    assignmentKey: lockedInventory.assignmentKey,
    project: reservation.inventory.project,
    fifo: false as const,
    allocations: [] as Prisma.InputJsonValue[]
  };
}
