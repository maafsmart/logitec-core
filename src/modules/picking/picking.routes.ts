import { Router } from "express";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../../db/prisma.js";
import { requireAuth, requireRole } from "../../middlewares/auth.middleware.js";
import { logActivity } from "../activity/activity-log.service.js";

const pickingRouter = Router();

const stockStatuses = ["AVAILABLE", "OPERATIONS", "HOLD", "BLOCKED", "QUARANTINE"] as const;

const scanSchema = z.object({
  code: z.string().min(1).max(120),
  warehouse: z.string().min(1).max(80).optional(),
  location: z.string().min(1).max(120).optional(),
  status: z.enum(stockStatuses).optional(),
  /** Código de proyecto (Customer.code) */
  project: z.string().min(1).max(80).optional(),
  customer: z.string().min(1).max(80).optional(),
  quantity: z.coerce.number().positive().max(1_000_000).optional().default(1),
  /** Línea exacta de inventario cuando el operador elige un candidato */
  inventoryId: z.string().min(1).optional(),
  taskId: z.string().optional()
});

function dec(n: string | number): Prisma.Decimal {
  return new Prisma.Decimal(String(n));
}

function mapCandidate(row: {
  id: string;
  qty: Prisma.Decimal;
  status: string;
  location: { code: string; warehouse: string };
  product: {
    id: string;
    sku: string;
    name: string;
    customer: { code: string; name: string } | null;
  };
}) {
  return {
    inventoryId: row.id,
    productId: row.product.id,
    sku: row.product.sku,
    productName: row.product.name,
    projectCode: row.product.customer?.code || null,
    projectName: row.product.customer?.name || null,
    warehouse: row.location.warehouse,
    location: row.location.code,
    status: row.status,
    qty: row.qty.toString()
  };
}

pickingRouter.use(requireAuth, requireRole(["ADMIN", "OPERATOR", "SUPERVISOR"]));

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
      taskId: taskIdOpt
    } = parsed;

    const taskId = taskIdOpt?.trim() || null;
    const normalizedCode = code.trim();
    const pickQty = dec(qtyRaw ?? 1);
    const normalizedWarehouse = warehouseInput?.trim().toUpperCase() || null;
    const normalizedLocation = locationInput?.trim().toUpperCase() || null;
    const projectCode = (projectInput || customerInput)?.trim() || null;
    const inventoryId = inventoryIdOpt?.trim() || null;

    const product = await prisma.product.findFirst({
      where: {
        active: true,
        OR: [{ sku: normalizedCode }, { barcode: normalizedCode }],
        // Si ya eligió inventoryId, no filtrar producto por proyecto aquí (evita falsos 404).
        ...(!inventoryId && projectCode
          ? {
              customer: {
                OR: [
                  { code: { equals: projectCode, mode: "insensitive" } },
                  { name: { equals: projectCode, mode: "insensitive" } }
                ]
              }
            }
          : {})
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

    // Localizar líneas con stock > 0 (cualquier estatus operativo con saldo).
    const stockWhere: Prisma.InventoryWhereInput = {
      productId: product.id,
      qty: { gt: new Prisma.Decimal(0) },
      ...(statusInput ? { status: statusInput } : {}),
      ...(inventoryId ? { id: inventoryId } : {}),
      location: {
        ...(normalizedWarehouse ? { warehouse: normalizedWarehouse } : {}),
        ...(normalizedLocation ? { code: normalizedLocation } : {})
      }
    };

    const candidates = await prisma.inventory.findMany({
      where: stockWhere,
      orderBy: [{ status: "asc" }, { updatedAt: "asc" }],
      include: {
        location: true,
        product: {
          select: {
            id: true,
            sku: true,
            name: true,
            customer: { select: { code: true, name: true } }
          }
        }
      },
      take: 50
    });

    if (candidates.length === 0) {
      const scanEvent = await prisma.scanEvent.create({
        data: {
          scannedCode: normalizedCode,
          result: "ERROR_NO_STOCK",
          userId: req.auth!.userId,
          productId: product.id,
          warehouse: normalizedWarehouse || product.warehouse,
          location: normalizedLocation,
          taskId
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
            status: statusInput || null,
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
      // No descontar arbitrariamente entre múltiples líneas.
      res.status(409).json({
        message:
          "Este SKU tiene stock en varias ubicaciones o estatus. Selecciona proyecto, ubicación y estatus (o elige una línea de la lista) antes de surtir.",
        code: "AMBIGUOUS_STOCK",
        product: {
          id: product.id,
          sku: product.sku,
          name: product.name,
          projectCode: product.customer?.code || null,
          projectName: product.customer?.name || null
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

    const after = before.minus(pickQty);

    const result = await prisma.$transaction(async (tx) => {
      // Re-leer y bloquear implícitamente vía update condicional
      const fresh = await tx.inventory.findFirst({
        where: {
          id: stock.id,
          qty: { gte: pickQty }
        },
        include: {
          location: true,
          product: {
            select: {
              id: true,
              sku: true,
              name: true,
              customerId: true,
              customer: { select: { id: true, code: true, name: true } }
            }
          }
        }
      });

      if (!fresh) {
        return { ok: false as const, reason: "RACE_OR_INSUFFICIENT" as const };
      }

      const qtyBefore = fresh.qty;
      const qtyAfter = qtyBefore.minus(pickQty);

      await tx.inventory.update({
        where: { id: fresh.id },
        data: { qty: qtyAfter }
      });

      const movement = await tx.inventoryMovement.create({
        data: {
          type: "PICK",
          movementType: "OUT",
          productId: product.id,
          qty: pickQty,
          warehouse: fresh.location.warehouse,
          fromLocationId: fresh.location.id,
          quantityBefore: qtyBefore,
          quantityAfter: qtyAfter,
          reference: "PICK_SCAN",
          notes: `Picking scan ${normalizedCode} · status ${fresh.status}`,
          userId: req.auth!.userId,
          taskId
        }
      });

      const scanEvent = await tx.scanEvent.create({
        data: {
          scannedCode: normalizedCode,
          result: "OK",
          userId: req.auth!.userId,
          productId: product.id,
          warehouse: fresh.location.warehouse,
          location: fresh.location.code,
          taskId
        },
        select: { id: true, result: true, scannedCode: true, createdAt: true }
      });

      return {
        ok: true as const,
        qtyBefore,
        qtyAfter,
        movementId: movement.id,
        scanEvent,
        warehouse: fresh.location.warehouse,
        locationCode: fresh.location.code,
        status: fresh.status,
        projectCode: fresh.product.customer?.code || product.customer?.code || null,
        projectName: fresh.product.customer?.name || product.customer?.name || null,
        customerId: fresh.product.customerId || product.customerId
      };
    });

    if (!result.ok) {
      res.status(409).json({
        message: "No se pudo descontar: el stock cambió o es insuficiente. Revisa inventarios e intenta de nuevo.",
        code: "INSUFFICIENT_STOCK"
      });
      return;
    }

    // Solo registrar PICK_SUCCESS después de descuento real en transacción.
    await logActivity({
      type: "PICK",
      subtype: "PICK_SUCCESS",
      reference: normalizedCode,
      userId: req.auth!.userId,
      productId: product.id,
      customerId: result.customerId,
      warehouse: result.warehouse,
      location: result.locationCode,
      qty: pickQty,
      result: "OK",
      metadata: {
        scanEventId: result.scanEvent.id,
        movementId: result.movementId,
        inventoryId: stock.id,
        projectCode: result.projectCode,
        projectName: result.projectName,
        productName: product.name,
        status: result.status,
        quantityBefore: result.qtyBefore.toString(),
        quantityAfter: result.qtyAfter.toString(),
        pickedQty: pickQty.toString(),
        quantityMoved: pickQty.toString()
      },
      taskId
    });

    res.json({
      message: "Picking OK: stock descontado y trazabilidad registrada.",
      deducted: true,
      product: {
        id: product.id,
        sku: product.sku,
        name: product.name,
        barcode: product.barcode,
        warehouse: result.warehouse,
        projectCode: result.projectCode,
        projectName: result.projectName
      },
      location: result.locationCode,
      warehouse: result.warehouse,
      status: result.status,
      quantityBefore: result.qtyBefore.toString(),
      quantityAfter: result.qtyAfter.toString(),
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

pickingRouter.get("/scans", async (req, res) => {
  const isAdmin = req.auth!.role === "ADMIN";

  const scans = await prisma.scanEvent.findMany({
    where: isAdmin ? {} : { userId: req.auth!.userId },
    orderBy: { createdAt: "desc" },
    take: isAdmin ? 150 : 50,
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

export { pickingRouter };
