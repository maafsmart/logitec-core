import { Router } from "express";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../../db/prisma.js";
import { requireAuth, requireRole } from "../../middlewares/auth.middleware.js";
import { logActivity } from "../activity/activity-log.service.js";

const pickingRouter = Router();

const scanSchema = z.object({
  code: z.string().min(1).max(120),
  warehouse: z.string().min(1).max(80).optional(),
  location: z.string().min(1).max(120).optional(),
  taskId: z.string().optional()
});

pickingRouter.use(requireAuth, requireRole(["ADMIN", "OPERATOR", "SUPERVISOR"]));

pickingRouter.post("/scan", async (req, res) => {
  const parsed = scanSchema.parse(req.body);
  const { code, warehouse: warehouseInput, location: locationInput, taskId: taskIdOpt } = parsed;
  const taskId = taskIdOpt?.trim() || null;
  const normalizedCode = code.trim();
  const normalizedWarehouse = warehouseInput?.trim().toUpperCase() || null;
  const normalizedLocation = locationInput?.trim().toUpperCase() || null;

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
      warehouse: true
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
      select: {
        id: true,
        result: true,
        scannedCode: true,
        createdAt: true
      }
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
      message: "Producto no existe",
      scanEvent
    });
    return;
  }

  const stockResult = await prisma.$transaction(async (tx) => {
    const stock = await tx.inventory.findFirst({
      where: {
        productId: product.id,
        status: "AVAILABLE",
        qty: { gt: new Prisma.Decimal(0) },
        location: {
          ...(normalizedWarehouse ? { warehouse: normalizedWarehouse } : {}),
          ...(normalizedLocation ? { code: normalizedLocation } : {})
        }
      },
      orderBy: { updatedAt: "asc" },
      include: { location: true }
    });

    if (!stock) {
      const scanEvent = await tx.scanEvent.create({
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
      return { ok: false as const, scanEvent };
    }

    const before = stock.qty;
    const after = stock.qty.minus(new Prisma.Decimal(1));
    await tx.inventory.update({
      where: { id: stock.id },
      data: { qty: after }
    });
    await tx.inventoryMovement.create({
      data: {
        type: "PICK",
        movementType: "OUT",
        productId: product.id,
        qty: new Prisma.Decimal(1),
        warehouse: stock.location.warehouse,
        fromLocationId: stock.location.id,
        quantityBefore: before,
        quantityAfter: after,
        reference: "PICK_SCAN",
        notes: `Picking scan ${normalizedCode}`,
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
        warehouse: stock.location.warehouse,
        location: stock.location.code,
        taskId
      },
      select: { id: true, result: true, scannedCode: true, createdAt: true }
    });
    return {
      ok: true as const,
      scanEvent,
      locationCode: stock.location.code,
      warehouse: stock.location.warehouse
    };
  });

  if (!stockResult.ok) {
    await logActivity({
      type: "PICK",
      subtype: "PICK_ERROR_NO_STOCK",
      reference: normalizedCode,
      userId: req.auth!.userId,
      productId: product.id,
      warehouse: normalizedWarehouse || product.warehouse,
      location: normalizedLocation,
      qty: null,
      result: "ERROR_NO_STOCK",
      metadata: { scanEventId: stockResult.scanEvent.id },
      taskId
    });
    res.status(409).json({
      message: "Producto existe pero sin stock disponible",
      product,
      scanEvent: stockResult.scanEvent
    });
    return;
  }

  await logActivity({
    type: "PICK",
    subtype: "PICK_SUCCESS",
    reference: normalizedCode,
    userId: req.auth!.userId,
    productId: product.id,
    warehouse: stockResult.warehouse,
    location: stockResult.locationCode,
    qty: 1,
    result: "OK",
    metadata: { scanEventId: stockResult.scanEvent.id },
    taskId
  });

  res.json({
    message: "Producto encontrado",
    product,
    location: stockResult.locationCode,
    scanEvent: stockResult.scanEvent
  });
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
