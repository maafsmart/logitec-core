import { Router } from "express";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../../db/prisma.js";
import { requireAuth, requireRole } from "../../middlewares/auth.middleware.js";
import { logActivity } from "../activity/activity-log.service.js";
import { HttpError } from "../../shared/http-error.js";

const inventoryRouter = Router();

const movementTypes = ["IN", "OUT", "ADJUST_SET"] as const;
const movementTypeMap = {
  IN: "INBOUND",
  OUT: "OUTBOUND",
  ADJUST_SET: "ADJUSTMENT"
} as const;

const createMovementSchema = z
  .object({
    sku: z.string().min(1).max(80),
    warehouse: z.string().min(1).max(80).optional(),
    type: z.enum(movementTypes),
    quantity: z.coerce.number(),
    reference: z.string().max(120).optional(),
    notes: z.string().max(500).optional(),
    taskId: z.string().optional()
  })
  .superRefine((data, ctx) => {
    if (data.type === "ADJUST_SET") {
      if (data.quantity < 0) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Ajuste debe ser mayor o igual a 0." });
      }
    } else if (data.quantity <= 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Entrada y salida requieren cantidad mayor a 0." });
    }
  });

const importRowSchema = z.object({
  sku: z.string().min(1).max(80),
  warehouse: z.string().min(1).max(80).optional(),
  location: z.string().min(1).max(120).optional(),
  status: z.string().min(1).max(30).optional(),
  quantity: z.coerce.number().nonnegative()
});

const importSchema = z.object({
  rows: z.array(importRowSchema).optional(),
  csv: z.string().optional()
});

const DEFAULT_WH = "TULTITLAN24";

function dec(n: string | number): Prisma.Decimal {
  return new Prisma.Decimal(String(n));
}

inventoryRouter.use(requireAuth);

inventoryRouter.get("/stock", requireRole(["ADMIN", "OPERATOR", "SUPERVISOR"]), async (_req, res) => {
  const rows = await prisma.inventory.findMany({
    orderBy: [{ location: { warehouse: "asc" } }, { updatedAt: "desc" }],
    take: 500,
    include: {
      product: {
        select: { sku: true, name: true, active: true, customer: { select: { code: true, name: true } } }
      },
      location: true
    }
  });

  res.json(rows);
});

inventoryRouter.get("/locations", requireRole(["ADMIN", "OPERATOR", "SUPERVISOR"]), async (_req, res) => {
  const rows = await prisma.location.findMany({
    orderBy: [{ warehouse: "asc" }, { code: "asc" }],
    take: 500
  });
  res.json(rows);
});

const createLocationSchema = z.object({
  warehouse: z.string().min(1).max(80),
  zone: z.string().min(1).max(20),
  rack: z.string().min(1).max(20),
  level: z.string().min(1).max(20),
  position: z.string().min(1).max(20)
});

inventoryRouter.post("/locations", requireRole(["ADMIN"]), async (req, res) => {
  const data = createLocationSchema.parse(req.body);
  const code = `${data.warehouse}-${data.zone}-${data.rack}-${data.level}-${data.position}`.toUpperCase();
  const location = await prisma.location.create({
    data: {
      ...data,
      warehouse: data.warehouse.trim().toUpperCase(),
      zone: data.zone.trim().toUpperCase(),
      rack: data.rack.trim().toUpperCase(),
      level: data.level.trim().toUpperCase(),
      position: data.position.trim().toUpperCase(),
      code
    }
  });
  res.status(201).json(location);
});

inventoryRouter.get("/movements", requireRole(["ADMIN", "OPERATOR", "SUPERVISOR"]), async (_req, res) => {
  const rows = await prisma.inventoryMovement.findMany({
    orderBy: { createdAt: "desc" },
    take: 200,
    include: {
      product: { select: { sku: true, name: true } },
      user: { select: { fullName: true, email: true } }
    }
  });

  res.json(rows);
});

inventoryRouter.post("/movements", requireRole(["ADMIN"]), async (req, res) => {
  const body = createMovementSchema.parse(req.body);
  const warehouse = (body.warehouse || DEFAULT_WH).trim();
  const qtyIn = dec(body.quantity);

  const result = await prisma.$transaction(async (tx) => {
    const product = await tx.product.findFirst({
      where: { sku: body.sku.trim(), active: true }
    });
    if (!product) {
      throw new HttpError(404, `Producto no encontrado o inactivo: ${body.sku}`);
    }

    const defaultLocationCode = `${warehouse}-GEN-STAGE-01`;
    let location = await tx.location.findUnique({
      where: { code: defaultLocationCode }
    });
    if (!location) {
      location = await tx.location.create({
        data: {
          warehouse,
          zone: "GEN",
          rack: "STAGE",
          level: "01",
          position: "01",
          code: defaultLocationCode
        }
      });
    }

    let stock = await tx.inventory.findFirst({
      where: { productId: product.id, locationId: location.id, status: "AVAILABLE" }
    });

    if (!stock) {
      stock = await tx.inventory.create({
        data: {
          productId: product.id,
          locationId: location.id,
          qty: dec(0),
          reservedQty: dec(0),
          status: "AVAILABLE"
        }
      });
    }

    const before = stock.qty;
    let after: Prisma.Decimal;

    if (body.type === "IN") {
      after = before.plus(qtyIn);
    } else if (body.type === "OUT") {
      after = before.minus(qtyIn);
      if (after.lessThan(0)) {
        throw new HttpError(400, "Stock insuficiente para esta salida.");
      }
    } else {
      after = qtyIn;
    }

    await tx.inventory.update({
      where: { id: stock.id },
      data: { qty: after }
    });

    const movement = await tx.inventoryMovement.create({
      data: {
        productId: product.id,
        type: movementTypeMap[body.type],
        warehouse,
        qty: qtyIn,
        fromLocationId: body.type === "OUT" ? location.id : null,
        toLocationId: body.type === "IN" ? location.id : null,
        movementType: body.type,
        quantityBefore: before,
        quantityAfter: after,
        reference: body.reference?.trim() || null,
        notes: body.notes?.trim() || null,
        userId: req.auth!.userId,
        taskId: body.taskId?.trim() || null
      },
      include: {
        product: { select: { sku: true, name: true } }
      }
    });

    return { movement, defaultLocationCode, product };
  });

  const logType =
    body.type === "IN" ? "RECEIVE" : body.type === "OUT" ? "OUTBOUND" : "ADJUSTMENT";
  const logSubtype =
    body.type === "IN"
      ? "MANUAL_IN"
      : body.type === "OUT"
        ? "MANUAL_OUT"
        : "MANUAL_ADJUSTMENT";

  await logActivity({
    type: logType,
    subtype: logSubtype,
    reference: body.reference?.trim() || result.movement.id,
    userId: req.auth!.userId,
    productId: result.product.id,
    customerId: result.product.customerId ?? null,
    warehouse,
    location: result.defaultLocationCode,
    qty: qtyIn,
    result: "OK",
    metadata: {
      movementType: body.type,
      movementId: result.movement.id,
      notes: body.notes?.trim() || null
    },
    taskId: body.taskId?.trim() || null
  });

  res.status(201).json(result.movement);
});

inventoryRouter.post("/import", requireRole(["ADMIN"]), async (req, res) => {
  const parsed = importSchema.parse(req.body);
  let rows = parsed.rows || [];

  if (parsed.csv?.trim()) {
    const lines = parsed.csv
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    if (lines.length < 2) {
      throw new HttpError(400, "CSV debe incluir encabezado y al menos una fila.");
    }
    const header = lines[0].split(",").map((h) => h.trim().toLowerCase());
    const idxSku = header.findIndex((h) => h === "sku" || h === "codigo" || h === "clave");
    const idxWh = header.findIndex((h) => h === "warehouse" || h === "almacen" || h === "bodega");
    const idxLoc = header.findIndex((h) => h === "location" || h === "ubicacion");
    const idxStatus = header.findIndex((h) => h === "status" || h === "estado");
    const idxQty = header.findIndex((h) => h === "quantity" || h === "cantidad" || h === "saldo" || h === "qty");
    if (idxSku < 0 || idxQty < 0) {
      throw new HttpError(
        400,
        "CSV: columnas requeridas sku (o codigo/clave) y quantity (o cantidad/saldo/qty)."
      );
    }
    const parsedRows: z.infer<typeof importRowSchema>[] = [];
    for (let i = 1; i < lines.length; i++) {
      const cells = lines[i].split(",").map((c) => c.trim());
      const sku = cells[idxSku];
      const quantity = Number(cells[idxQty]?.replace(/,/g, ""));
      const warehouseCell = idxWh >= 0 ? cells[idxWh] : undefined;
      const locationCell = idxLoc >= 0 ? cells[idxLoc] : undefined;
      const statusCell = idxStatus >= 0 ? cells[idxStatus] : undefined;
      const rowParsed = importRowSchema.safeParse({
        sku,
        warehouse: warehouseCell || undefined,
        location: locationCell || undefined,
        status: statusCell || undefined,
        quantity
      });
      if (!rowParsed.success) {
        throw new HttpError(400, `Fila ${i + 1}: datos invalidos.`);
      }
      parsedRows.push(rowParsed.data);
    }
    rows = parsedRows;
  }

  if (rows.length === 0) {
    throw new HttpError(400, "No hay filas para importar.");
  }

  const errors: { sku: string; message: string }[] = [];
  let applied = 0;

  for (const row of rows) {
    const wh = (row.warehouse || DEFAULT_WH).trim();
    const locationCode = (row.location || `${wh}-GEN-STAGE-01`).trim().toUpperCase();
    const status = (row.status || "AVAILABLE").trim().toUpperCase();
    const product = await prisma.product.findFirst({
      where: { sku: row.sku.trim(), active: true }
    });
    if (!product) {
      errors.push({ sku: row.sku, message: "SKU no existe o inactivo" });
      continue;
    }

    try {
      await prisma.$transaction(async (tx) => {
        let location = await tx.location.findUnique({ where: { code: locationCode } });
        if (!location) {
          location = await tx.location.create({
            data: {
              warehouse: wh.toUpperCase(),
              zone: "GEN",
              rack: "STAGE",
              level: "01",
              position: "01",
              code: locationCode
            }
          });
        }
        let stock = await tx.inventory.findFirst({
          where: { productId: product.id, locationId: location.id, status }
        });
        if (!stock) {
          stock = await tx.inventory.create({
            data: { productId: product.id, locationId: location.id, status, qty: dec(0), reservedQty: dec(0) }
          });
        }

        const before = stock.qty;
        const target = dec(row.quantity);

        await tx.inventory.update({
          where: { id: stock.id },
          data: { qty: target }
        });

        await tx.inventoryMovement.create({
          data: {
            productId: product.id,
            type: "ADJUSTMENT",
            warehouse: wh,
            qty: target,
            toLocationId: location.id,
            movementType: "ADJUST_SET",
            quantityBefore: before,
            quantityAfter: target,
            reference: "IMPORT_INVENTORY_CSV",
            notes: "Saldo fijado por importacion",
            userId: req.auth!.userId
          }
        });
      });
      applied += 1;
    } catch (e) {
      errors.push({
        sku: row.sku,
        message: e instanceof Error ? e.message : "Error"
      });
    }
  }

  await logActivity({
    type: "IMPORT",
    subtype: "CSV_INVENTORY",
    reference: "inventory_csv_batch",
    userId: req.auth!.userId,
    metadata: {
      applied,
      skipped: errors.length,
      errors: errors.slice(0, 30)
    }
  });

  res.json({ applied, skipped: errors.length, errors });
});

export { inventoryRouter };
