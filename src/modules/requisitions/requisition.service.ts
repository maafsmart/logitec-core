import { Prisma } from "@prisma/client";
import { prisma } from "../../db/prisma.js";
import { HttpError } from "../../shared/http-error.js";
import { logActivity } from "../activity/activity-log.service.js";
import type { UserRole } from "../../middlewares/auth.middleware.js";

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

async function loadRequisition(id: string) {
  const row = await prisma.requisition.findUnique({
    where: { id },
    include: {
      project: { include: { client: true } },
      createdBy: { select: { id: true, fullName: true, email: true } },
      lines: {
        include: {
          product: { select: { id: true, sku: true, name: true, barcode: true, customerId: true } },
          reservations: true
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
        reservations: line.reservations.map((r) => ({
          id: r.id,
          inventoryId: r.inventoryId,
          inventoryLayerId: r.inventoryLayerId,
          qty: r.qty.toString(),
          consumedQty: r.consumedQty.toString(),
          releasedQty: r.releasedQty.toString(),
          activeQty: activeReserved(r.qty, r.consumedQty, r.releasedQty).toString(),
          status: r.status,
          createdAt: r.createdAt
        }))
      };
    }),
    tasks: row.tasks
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
          reservations: true
        }
      },
      tasks: {
        include: { assignedTo: { select: { id: true, fullName: true, email: true } } }
      }
    }
  });
  return rows.map(serializeRequisition);
}

export async function getRequisition(id: string) {
  return serializeRequisition(await loadRequisition(id));
}

export async function createRequisition(input: {
  number: string;
  projectCode: string;
  priority?: string | number;
  reference?: string | null;
  notes?: string | null;
  lines: Array<{ sku: string; requestedQty: number; lotNumber?: string | null }>;
  userId: string;
}) {
  if (!input.lines.length) throw new HttpError(400, "La requisición requiere al menos una línea.");
  const project = await prisma.customer.findFirst({
    where: { OR: [{ code: { equals: input.projectCode, mode: "insensitive" } }, { name: { equals: input.projectCode, mode: "insensitive" } }] }
  });
  if (!project) throw new HttpError(404, "Proyecto no encontrado.");

  const priority = priorityFromUi(input.priority);
  const created = await prisma.$transaction(async (tx) => {
    const existing = await tx.requisition.findUnique({ where: { number: input.number.trim() } });
    if (existing) throw new HttpError(409, "Ya existe una requisición con ese folio.");

    const req = await tx.requisition.create({
      data: {
        number: input.number.trim(),
        projectId: project.id,
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
      if (product.customerId && product.customerId !== project.id) {
        throw new HttpError(400, `El producto ${product.sku} no pertenece al proyecto de la requisición.`);
      }
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
        customerId: project.id,
        result: "OK",
        metadata: { requisitionId: req.id }
      },
      tx
    );
    return req.id;
  });
  return getRequisition(created);
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
  if (product.customerId && product.customerId !== req.projectId) {
    throw new HttpError(400, "El producto no pertenece al proyecto de la requisición.");
  }
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

export async function submitRequisition(id: string, userId: string) {
  const req = await prisma.requisition.findUnique({ where: { id }, include: { lines: true } });
  if (!req) throw new HttpError(404, "Requisición no encontrada.");
  if (req.status !== "DRAFT") throw new HttpError(409, "Solo DRAFT puede enviarse.");
  if (!req.lines.length) throw new HttpError(400, "La requisición no tiene líneas.");
  await prisma.requisition.update({ where: { id }, data: { status: "SUBMITTED" } });
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

export async function approveRequisition(id: string, userId: string, role: UserRole) {
  if (role === "OPERATOR" || role === "CLIENT") throw new HttpError(403, "No autorizado para aprobar.");
  const req = await loadRequisition(id);
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
  userId: string;
  role: UserRole;
}) {
  if (input.role === "CLIENT") throw new HttpError(403, "CLIENT no puede reservar.");
  const qty = dec(input.qty);
  if (qty.lessThanOrEqualTo(0)) throw new HttpError(400, "La cantidad a reservar debe ser > 0.");

  try {
    await prisma.$transaction(async (tx) => {
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

      const candidates = await tx.inventory.findMany({
        where: {
          productId: line.productId,
          qty: { gt: 0 }
        },
        include: { location: true, layers: true }
      });
      const withFree = candidates.filter((c) => c.qty.minus(c.reservedQty).greaterThan(0));
      if (!withFree.length) throw new RequisitionError("NO_STOCK", "Sin stock libre para reservar.");

      let inventory = input.inventoryId
        ? withFree.find((c) => c.id === input.inventoryId)
        : withFree.length === 1
          ? withFree[0]
          : undefined;
      if (!inventory && !input.inventoryId && withFree.length > 1) {
        throw new RequisitionError("AMBIGUOUS_STOCK", "Hay varias ubicaciones; indica inventoryId.", {
          candidates: withFree.map((c) => ({
            inventoryId: c.id,
            location: c.location.code,
            status: c.status,
            qty: c.qty.toString(),
            reservedQty: c.reservedQty.toString(),
            freeQty: c.qty.minus(c.reservedQty).toString()
          }))
        });
      }
      if (!inventory) throw new RequisitionError("INVENTORY_NOT_FOUND", "Línea de inventario no disponible.");

      await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "Inventory" WHERE "id" = ${inventory.id} FOR UPDATE`);
      const locked = await tx.inventory.findUniqueOrThrow({ where: { id: inventory.id } });
      if (locked.qty.minus(locked.reservedQty).lessThan(qty)) {
        throw new RequisitionError("INSUFFICIENT_FREE", "Stock libre insuficiente.");
      }
      const layer = await selectFreeLayer(tx, inventory.id, input.layerId, qty);

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

      await tx.inventoryReservation.create({
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
          metadata: { requisitionId: req.id, lineId: line.id, inventoryId: inventory.id, layerId: layer.id }
        },
        tx
      );
    });
  } catch (error) {
    if (error instanceof RequisitionError || error instanceof HttpError) throw error;
    throw error;
  }
  return getRequisition(input.requisitionId);
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
        await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "InventoryLayer" WHERE "id" = ${reservation.inventoryLayerId} FOR UPDATE`);
        await tx.$executeRaw`
          UPDATE "InventoryLayer"
          SET "reservedQty" = "reservedQty" - ${active}, "updatedAt" = NOW()
          WHERE id = ${reservation.inventoryLayerId} AND "reservedQty" >= ${active}
        `;
        await tx.$executeRaw`
          UPDATE "Inventory"
          SET "reservedQty" = "reservedQty" - ${active}, "updatedAt" = NOW()
          WHERE id = ${reservation.inventoryId} AND "reservedQty" >= ${active}
        `;
        await tx.inventoryReservation.update({
          where: { id: reservation.id },
          data: { releasedQty: reservation.releasedQty.plus(active), status: "RELEASED" }
        });
      }
    }
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
  });
  return getRequisition(id);
}

export async function consumeReservationPick(input: {
  reservationId: string;
  qty: Prisma.Decimal;
  userId: string;
  scannedCode: string;
  taskId?: string | null;
}) {
  return prisma.$transaction(async (tx) => {
    const reservation = await tx.inventoryReservation.findUnique({
      where: { id: input.reservationId },
      include: {
        requisitionLine: { include: { requisition: true, product: true } },
        inventory: { include: { location: true } }
      }
    });
    if (!reservation) throw new RequisitionError("RESERVATION_NOT_FOUND", "Reserva no encontrada.");
    if (reservation.status !== "ACTIVE") throw new RequisitionError("RESERVATION_INACTIVE", "La reserva no está activa.");
    if (["CANCELLED", "REJECTED"].includes(reservation.requisitionLine.requisition.status)) {
      throw new RequisitionError("REQUISITION_CLOSED", "La requisición no permite picking.");
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

    await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "Inventory" WHERE "id" = ${reservation.inventoryId} FOR UPDATE`);
    await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "InventoryLayer" WHERE "id" = ${reservation.inventoryLayerId} FOR UPDATE`);
    await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "InventoryReservation" WHERE "id" = ${reservation.id} FOR UPDATE`);

    const before = reservation.inventory.qty;
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

    const newConsumed = reservation.consumedQty.plus(input.qty);
    const newActive = activeReserved(reservation.qty, newConsumed, reservation.releasedQty);
    await tx.inventoryReservation.update({
      where: { id: reservation.id },
      data: {
        consumedQty: newConsumed,
        status: newActive.lessThanOrEqualTo(0) ? "CONSUMED" : "ACTIVE"
      }
    });

    const newFulfilled = reservation.requisitionLine.fulfilledQty.plus(input.qty);
    await tx.requisitionLine.update({
      where: { id: reservation.requisitionLineId },
      data: { fulfilledQty: newFulfilled }
    });

    const allLines = await tx.requisitionLine.findMany({ where: { requisitionId: reservation.requisitionLine.requisitionId } });
    const fulfillment = fulfillmentState(allLines.map((l) => (l.id === reservation.requisitionLineId ? { ...l, fulfilledQty: newFulfilled } : l)));
    const nextStatus =
      fulfillment === "SURTIDA" ? "COMPLETED" : fulfillment === "PARCIAL" ? "IN_PROGRESS" : reservation.requisitionLine.requisition.status;
    if (nextStatus !== reservation.requisitionLine.requisition.status) {
      await tx.requisition.update({
        where: { id: reservation.requisitionLine.requisitionId },
        data: { status: nextStatus }
      });
    }

    const movement = await tx.inventoryMovement.create({
      data: {
        productId: reservation.requisitionLine.productId,
        type: "PICK",
        movementType: "OUT",
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
        taskId: input.taskId ?? null
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
        taskId: input.taskId ?? null
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
        taskId: input.taskId ?? null,
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
      scanEvent,
      product: reservation.requisitionLine.product,
      location: reservation.inventory.location,
      inventoryStatus: reservation.inventory.status
    };
  });
}
