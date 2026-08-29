import { Router } from "express";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../../db/prisma.js";
import { requireAuth, requireRole } from "../../middlewares/auth.middleware.js";
import { clientScanWhere, isClientRole } from "../clients/client-scope.js";
import { logActivity } from "../activity/activity-log.service.js";
import { InventoryMutationError, mutateInventory } from "../inventory/inventory-mutation.service.js";
import { RequisitionError, consumeReservationPick, getEligiblePickSerials } from "../requisitions/requisition.service.js";
import { assertActiveInventoryStatus } from "../inventory/inventory-status.js";

const pickingRouter = Router();

const scanSchema = z.object({
  code: z.string().min(1).max(120),
  warehouse: z.string().min(1).max(80).optional(),
  location: z.string().min(1).max(120).optional(),
  status: z.string().trim().max(80).optional(),
  /** Código de proyecto (Customer.code) */
  project: z.string().min(1).max(80).optional(),
  customer: z.string().min(1).max(80).optional(),
  quantity: z.coerce.number().positive().max(1_000_000).optional().default(1),
  /** Línea exacta de inventario cuando el operador elige un candidato */
  inventoryId: z.string().min(1).optional(),
  layerId: z.string().min(1).optional(),
  reservationId: z.string().min(1).optional(),
  requisitionLineId: z.string().min(1).optional(),
  allocationMode: z.string().max(20).optional(),
  taskId: z.string().optional(),
  serialIds: z.array(z.string().min(1).max(120)).max(1_000).optional()
});

function dec(n: string | number): Prisma.Decimal {
  return new Prisma.Decimal(String(n));
}

function mapCandidate(row: {
  id: string;
  qty: Prisma.Decimal;
  reservedQty: Prisma.Decimal;
  status: string;
  assignmentType: string;
  projectId: string | null;
  location: { code: string; warehouse: string };
  project: { code: string; name: string } | null;
  product: {
    id: string;
    sku: string;
    name: string;
  };
}) {
  const unreservedQty = row.qty.minus(row.reservedQty);
  const assignmentLabel =
    row.assignmentType === "FREE_TO_SALE"
      ? "FREE TO SALE"
      : row.project
        ? `${row.project.name} (${row.project.code})`
        : row.assignmentType;
  return {
    inventoryId: row.id,
    productId: row.product.id,
    sku: row.product.sku,
    productName: row.product.name,
    assignmentType: row.assignmentType,
    assignmentLabel,
    projectId: row.projectId,
    projectCode: row.project?.code || null,
    projectName: row.project?.name || null,
    warehouse: row.location.warehouse,
    location: row.location.code,
    status: row.status,
    qty: row.qty.toString(),
    reservedQty: row.reservedQty.toString(),
    unreservedQty: unreservedQty.toString()
  };
}

pickingRouter.use(requireAuth);

pickingRouter.get("/scans", requireRole(["ADMIN", "OPERATOR", "SUPERVISOR", "CLIENT"]), async (req, res) => {
  const isAdmin = req.auth!.role === "ADMIN";
  const where = isAdmin
    ? {}
    : isClientRole(req.auth!)
      ? clientScanWhere(req.auth!)
      : { userId: req.auth!.userId };

  const scans = await prisma.scanEvent.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: isAdmin || isClientRole(req.auth!) ? 150 : 50,
    include: {
      user: {
        select: {
          id: true,
          fullName: true,
          email: true
        }
      },
      product: {
        select: {
          sku: true,
          name: true
        }
      }
    }
  });

  res.json(scans);
});

pickingRouter.use(requireRole(["ADMIN", "OPERATOR", "SUPERVISOR"]));

pickingRouter.get("/requisitions/:requisitionId/lines/:lineId/eligible-serials", async (req, res) => {
  try {
    const parsed = z
      .object({
        inventoryId: z.string().min(1),
        quantity: z.coerce.number().int().positive().max(1_000_000)
      })
      .parse(req.query);
    const result = await getEligiblePickSerials({
      requisitionId: String(req.params.requisitionId || ""),
      lineId: String(req.params.lineId || ""),
      inventoryId: parsed.inventoryId,
      quantity: parsed.quantity
    });
    res.json(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({
        message: "Datos de consulta inválidos.",
        issues: error.issues
      });
      return;
    }
    if (error instanceof RequisitionError) {
      res.status(409).json({ message: error.message, code: error.code, details: error.details });
      return;
    }
    throw error;
  }
});

pickingRouter.post("/scan", async (req, res) => {
  try {
    const parsed = scanSchema.parse(req.body);
    const {
      code,
      warehouse: warehouseInput,
      location: locationInput,
      status: statusInput,
      project: projectInput,
      customer: customerInput,
      quantity: qtyRaw,
      inventoryId: inventoryIdOpt,
      layerId: layerIdOpt,
      reservationId: reservationIdOpt,
      requisitionLineId: requisitionLineIdOpt,
      allocationMode: allocationModeOpt,
      taskId: taskIdOpt,
      serialIds: serialIdsOpt
    } = parsed;

    const taskId = taskIdOpt?.trim() || null;
    const normalizedCode = code.trim();
    const pickQty = dec(qtyRaw ?? 1);
    const normalizedWarehouse = warehouseInput?.trim().toUpperCase() || null;
    const normalizedLocation = locationInput?.trim().toUpperCase() || null;
    const projectCode = (projectInput || customerInput)?.trim() || null;
    const inventoryId = inventoryIdOpt?.trim() || null;
    const layerId = layerIdOpt?.trim() || null;
    const reservationId = reservationIdOpt?.trim() || null;
    const requisitionLineId = requisitionLineIdOpt?.trim() || null;
    const allocationMode = allocationModeOpt?.trim() || null;
    const serialIds = Array.isArray(serialIdsOpt)
      ? serialIdsOpt.map((id) => String(id || "").trim()).filter(Boolean)
      : [];
    const statusFilter = statusInput?.trim()
      ? await assertActiveInventoryStatus(statusInput)
      : null;

    if (reservationId && allocationMode) {
      res.status(409).json({
        code: "RESERVATION_ALLOCATION_CONFLICT",
        message: "No se puede indicar reservationId y allocationMode al mismo tiempo."
      });
      return;
    }
    if (serialIds.length && reservationId) {
      res.status(409).json({
        code: "RESERVATION_ALLOCATION_CONFLICT",
        message: "No se puede indicar serialIds y reservationId al mismo tiempo."
      });
      return;
    }
    if (serialIds.length && allocationMode !== "FIFO") {
      res.status(409).json({
        code: "SERIAL_IDS_REQUIRE_FIFO",
        message: "Las series solo se pueden indicar en picking FIFO."
      });
      return;
    }

    if (allocationMode || reservationId || requisitionLineId) {
      try {
        if (allocationMode) {
          const reserved = await consumeReservationPick({
            qty: pickQty,
            userId: req.auth!.userId,
            scannedCode: normalizedCode,
            requisitionLineId,
            inventoryId,
            allocationMode,
            taskId,
            serialIds
          });
          res.json({
            message: "Picking FIFO reservado OK: stock y reservas consumidos atómicamente.",
            deducted: true,
            reserved: true,
            fifo: true,
            product: {
              id: reserved.product.id,
              sku: reserved.product.sku,
              name: reserved.product.name,
              barcode: reserved.product.barcode,
              warehouse: reserved.location.warehouse,
              projectCode: reserved.project?.code || null,
              projectName: reserved.project?.name || null,
              assignmentType: reserved.assignmentType,
              assignmentKey: reserved.assignmentKey
            },
            location: reserved.location.code,
            warehouse: reserved.location.warehouse,
            status: reserved.inventoryStatus,
            quantityBefore: reserved.before.toString(),
            quantityAfter: reserved.after.toString(),
            pickedQty: pickQty.toString(),
            scanEvent: reserved.scanEvent,
            movementId: reserved.movement.id,
            movementIds: reserved.movements.map((row) => row.id),
            allocations: reserved.allocations ?? []
          });
          return;
        }

        let resolvedReservationId = reservationId;
        if (!resolvedReservationId && requisitionLineId) {
          const activeReservations = await prisma.inventoryReservation.findMany({
            where: { requisitionLineId, status: "ACTIVE" },
            select: { id: true }
          });
          if (!activeReservations.length) {
            res.status(409).json({
              code: "NO_ACTIVE_RESERVATION",
              message: "La línea de requisición no tiene reserva activa."
            });
            return;
          }
          if (activeReservations.length > 1) {
            res.status(409).json({
              code: "AMBIGUOUS_RESERVATION",
              message: "La línea tiene varias reservas activas; indica reservationId.",
              reservations: activeReservations
            });
            return;
          }
          resolvedReservationId = activeReservations[0]!.id;
        }
        const reserved = await consumeReservationPick({
          reservationId: resolvedReservationId!,
          qty: pickQty,
          userId: req.auth!.userId,
          scannedCode: normalizedCode,
          taskId,
          requisitionLineId
        });
        res.json({
          message: "Picking reservado OK: stock y reserva consumidos atómicamente.",
          deducted: true,
          reserved: true,
          product: {
            id: reserved.product.id,
            sku: reserved.product.sku,
            name: reserved.product.name,
            barcode: reserved.product.barcode,
            warehouse: reserved.location.warehouse,
            projectCode: reserved.project?.code || null,
            projectName: reserved.project?.name || null,
            assignmentType: reserved.assignmentType,
            assignmentKey: reserved.assignmentKey
          },
          location: reserved.location.code,
          warehouse: reserved.location.warehouse,
          status: reserved.inventoryStatus,
          quantityBefore: reserved.before.toString(),
          quantityAfter: reserved.after.toString(),
          pickedQty: pickQty.toString(),
          scanEvent: reserved.scanEvent,
          movementId: reserved.movement.id
        });
        return;
      } catch (error) {
        if (error instanceof RequisitionError || error instanceof InventoryMutationError) {
          res.status(409).json({ message: error.message, code: error.code, details: error.details });
          return;
        }
        throw error;
      }
    }

    const product = await prisma.product.findFirst({
      where: {
        active: true,
        OR: [{ sku: normalizedCode }, { barcode: normalizedCode }]
      },
      select: {
        id: true,
        sku: true,
        barcode: true,
        name: true,
        warehouse: true,
        customerId: true,
        customer: { select: { id: true, code: true, name: true } }
      }
    });

    if (!product) {
      const scanEvent = await prisma.scanEvent.create({
        data: {
          scannedCode: normalizedCode,
          result: "ERROR",
          userId: req.auth!.userId,
          warehouse: normalizedWarehouse,
          location: normalizedLocation,
          taskId
        },
        select: { id: true, result: true, scannedCode: true, createdAt: true }
      });
      await logActivity({
        type: "PICK",
        subtype: "PICK_ERROR_UNKNOWN_PRODUCT",
        reference: normalizedCode,
        userId: req.auth!.userId,
        warehouse: normalizedWarehouse,
        location: normalizedLocation,
        qty: null,
        result: "ERROR",
        metadata: { scanEventId: scanEvent.id },
        taskId
      });
      res.status(404).json({
        message: "Producto no existe en catálogo (SKU/código no encontrado).",
        scanEvent
      });
      return;
    }

    // Localizar cubos con stock libre. El alcance de proyecto es Inventory.assignment*, no Product.customerId.
    const stockWhere: Prisma.InventoryWhereInput = {
      productId: product.id,
      qty: { gt: new Prisma.Decimal(0) },
      ...(statusFilter ? { status: statusFilter } : {}),
      ...(inventoryId ? { id: inventoryId } : {}),
      ...(!inventoryId && projectCode
        ? {
            assignmentType: "PROJECT",
            project: {
              OR: [
                { code: { equals: projectCode, mode: "insensitive" } },
                { name: { equals: projectCode, mode: "insensitive" } }
              ]
            }
          }
        : {}),
      location: {
        ...(normalizedWarehouse ? { warehouse: normalizedWarehouse } : {}),
        ...(normalizedLocation ? { code: normalizedLocation } : {})
      }
    };

    const candidatesRaw = await prisma.inventory.findMany({
      where: stockWhere,
      orderBy: [{ status: "asc" }, { updatedAt: "asc" }],
      include: {
        location: true,
        project: { select: { id: true, code: true, name: true } },
        product: {
          select: {
            id: true,
            sku: true,
            name: true
          }
        }
      },
      take: 50
    });
    const candidates = candidatesRaw.filter((row) => row.qty.minus(row.reservedQty).greaterThan(0));

    if (candidates.length === 0) {
      const scanEvent = await prisma.scanEvent.create({
        data: {
          scannedCode: normalizedCode,
          result: "ERROR_NO_STOCK",
          userId: req.auth!.userId,
          productId: product.id,
          warehouse: normalizedWarehouse || product.warehouse,
          location: normalizedLocation,
          taskId,
          clientId: null
        },
        select: { id: true, result: true, scannedCode: true, createdAt: true }
      });
      await logActivity({
        type: "PICK",
        subtype: "PICK_ERROR_NO_STOCK",
        reference: normalizedCode,
        userId: req.auth!.userId,
        productId: product.id,
        customerId: product.customerId,
        warehouse: normalizedWarehouse || product.warehouse,
        location: normalizedLocation,
        qty: null,
        result: "ERROR_NO_STOCK",
        metadata: {
          scanEventId: scanEvent.id,
          projectCode: product.customer?.code || null,
          filters: {
            warehouse: normalizedWarehouse,
            location: normalizedLocation,
            status: statusFilter,
            project: projectCode,
            inventoryId
          }
        },
        taskId
      });
      res.status(409).json({
        message:
          "Sin stock suficiente con los filtros elegidos. Elige proyecto, ubicación y estatus de la línea correcta, o verifica existencias en Inventario.",
        code: "NO_STOCK",
        product: {
          id: product.id,
          sku: product.sku,
          name: product.name,
          projectCode: product.customer?.code || null,
          projectName: product.customer?.name || null
        },
        scanEvent
      });
      return;
    }

    if (candidates.length > 1) {
      // No descontar arbitrariamente entre múltiples cubos (proyecto / FREE TO SALE / ubicación).
      res.status(409).json({
        message:
          "Este SKU tiene stock en varios proyectos o cubos. Selecciona Proyecto / FREE TO SALE, ubicación y estatus (o elige una línea de la lista) antes de surtir.",
        code: "AMBIGUOUS_STOCK",
        product: {
          id: product.id,
          sku: product.sku,
          name: product.name
        },
        candidates: candidates.map(mapCandidate)
      });
      return;
    }

    const stock = candidates[0]!;
    const before = stock.qty;
    if (before.lessThan(pickQty)) {
      res.status(409).json({
        message: `Stock insuficiente en ${stock.location.code} (${stock.status}). Disponible: ${before.toString()}. Solicitado: ${pickQty.toString()}.`,
        code: "INSUFFICIENT_STOCK",
        available: before.toString(),
        requested: pickQty.toString(),
        candidate: mapCandidate(stock)
      });
      return;
    }

    let result;
    try {
      result = await mutateInventory({
        type: "PICK",
        productId: product.id,
        inventoryId: stock.id,
        layerId: layerId ?? undefined,
        qty: pickQty,
        reference: "PICK_SCAN",
        notes: `Picking scan ${normalizedCode} · status ${stock.status}`,
        taskId,
        userId: req.auth!.userId,
        scannedCode: normalizedCode,
        activity: {
          type: "PICK",
          subtype: "PICK_SUCCESS",
          reference: normalizedCode,
          userId: req.auth!.userId,
          customerId: stock.projectId,
          result: "OK",
          taskId
        }
      });
    } catch (error) {
      if (error instanceof InventoryMutationError) {
        res.status(409).json({ message: error.message, code: error.code, details: error.details });
        return;
      }
      res.status(409).json({
        message: "No se pudo descontar: el stock cambió o es insuficiente. Revisa inventarios e intenta de nuevo.",
        code: "INSUFFICIENT_STOCK"
      });
      return;
    }

    const picked = mapCandidate(stock);
    res.json({
      message: "Picking OK: stock descontado y trazabilidad registrada.",
      deducted: true,
      product: {
        id: product.id,
        sku: product.sku,
        name: product.name,
        barcode: product.barcode,
        warehouse: stock.location.warehouse,
        projectCode: picked.projectCode,
        projectName: picked.projectName,
        assignmentType: picked.assignmentType,
        assignmentLabel: picked.assignmentLabel
      },
      location: stock.location.code,
      warehouse: stock.location.warehouse,
      status: stock.status,
      quantityBefore: result.before.toString(),
      quantityAfter: result.after.toString(),
      pickedQty: pickQty.toString(),
      scanEvent: result.scanEvent
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({
        message: "Datos de picking inválidos.",
        issues: error.issues
      });
      return;
    }
    console.error("[picking/scan]", error);
    res.status(500).json({
      message: "Error interno al procesar picking. No se registró PICK_SUCCESS."
    });
  }
});

export { pickingRouter };
