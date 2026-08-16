import { Router } from "express";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../../db/prisma.js";
import { requireAuth, requireRole } from "../../middlewares/auth.middleware.js";
import { logActivity } from "../activity/activity-log.service.js";
import { HttpError } from "../../shared/http-error.js";
import { clientInventoryWhere, clientMovementWhere, isClientRole } from "../clients/client-scope.js";

const inventoryRouter = Router();

const movementTypes = ["IN", "OUT", "ADJUST_SET"] as const;
const stockStatuses = ["AVAILABLE", "OPERATIONS", "HOLD", "BLOCKED", "QUARANTINE"] as const;
const movementTypeMap = {
  IN: "INBOUND",
  OUT: "OUTBOUND",
  ADJUST_SET: "ADJUSTMENT"
} as const;

const createMovementSchema = z
  .object({
    sku: z.string().min(1).max(80),
    warehouse: z.string().min(1).max(80).optional(),
    location: z.string().min(1).max(120).optional(),
    status: z.enum(stockStatuses).optional().default("AVAILABLE"),
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
  customer: z.string().max(60).optional(),
  warehouse: z.string().min(1).max(80).optional(),
  location: z.string().min(1).max(120).optional(),
  status: z.string().min(1).max(30).optional(),
  quantity: z.coerce.number().nonnegative(),
  reference: z.string().max(120).optional(),
  notes: z.string().max(500).optional()
});

const importSchema = z.object({
  rows: z.array(importRowSchema).optional(),
  csv: z.string().optional(),
  reconcileFullInventory: z.coerce.boolean().optional().default(false)
});

const DEFAULT_WH = "TULTITLAN24";
const RECONCILE_REFERENCE = "RECONCILE_INVENTORY_NOT_IN_FILE";

function dec(n: string | number): Prisma.Decimal {
  return new Prisma.Decimal(String(n));
}

function stockCompositeKey(productId: string, locationId: string, status: string): string {
  return `${productId}|${locationId}|${status}`;
}

async function resolveOrCreateLocation(
  tx: Prisma.TransactionClient,
  warehouse: string,
  locationCode?: string
) {
  const wh = warehouse.trim().toUpperCase();
  const code = (locationCode || `${wh}-GEN-STAGE-01`).trim().toUpperCase();
  let location = await tx.location.findUnique({ where: { code } });
  if (!location) {
    location = await tx.location.create({
      data: {
        warehouse: wh,
        zone: "GEN",
        rack: "STAGE",
        level: "01",
        position: "01",
        code
      }
    });
  }
  return location;
}

inventoryRouter.use(requireAuth);

inventoryRouter.get("/stock", requireRole(["ADMIN", "OPERATOR", "SUPERVISOR", "CLIENT"]), async (req, res) => {
  const rows = await prisma.inventory.findMany({
    where: clientInventoryWhere(req.auth!),
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

inventoryRouter.get("/locations", requireRole(["ADMIN", "OPERATOR", "SUPERVISOR", "CLIENT"]), async (req, res) => {
  const rows = await prisma.location.findMany({
    where: isClientRole(req.auth!)
      ? { inventories: { some: clientInventoryWhere(req.auth!) } }
      : {},
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

inventoryRouter.get("/movements", requireRole(["ADMIN", "OPERATOR", "SUPERVISOR", "CLIENT"]), async (req, res) => {
  const rawLimit = req.query.limit;
  let take = 200;
  if (rawLimit === "all") {
    take = 10000;
  } else if (rawLimit != null) {
    const parsedLimit = Number(rawLimit);
    if (!Number.isNaN(parsedLimit) && parsedLimit > 0) {
      take = Math.min(parsedLimit, 10000);
    }
  }

  const rows = await prisma.inventoryMovement.findMany({
    where: clientMovementWhere(req.auth!),
    orderBy: { createdAt: "desc" },
    take,
    include: {
      product: { select: { sku: true, name: true, customer: { select: { code: true, name: true } } } },
      user: { select: { fullName: true, email: true } },
      fromLocation: { select: { code: true } },
      toLocation: { select: { code: true } }
    }
  });

  res.json(rows);
});

inventoryRouter.post("/movements", requireRole(["ADMIN", "SUPERVISOR", "OPERATOR"]), async (req, res) => {
  const body = createMovementSchema.parse(req.body);
  const warehouse = (body.warehouse || DEFAULT_WH).trim();
  const stockStatus = body.status || "AVAILABLE";
  const qtyIn = dec(body.quantity);

  const result = await prisma.$transaction(async (tx) => {
    const product = await tx.product.findFirst({
      where: { sku: body.sku.trim(), active: true }
    });
    if (!product) {
      throw new HttpError(404, `Producto no encontrado o inactivo: ${body.sku}`);
    }

    const location = await resolveOrCreateLocation(tx, warehouse, body.location);

    let stock = await tx.inventory.findFirst({
      where: { productId: product.id, locationId: location.id, status: stockStatus }
    });

    if (!stock) {
      stock = await tx.inventory.create({
        data: {
          productId: product.id,
          locationId: location.id,
          qty: dec(0),
          reservedQty: dec(0),
          status: stockStatus
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
        throw new HttpError(400, `Stock insuficiente. Disponible: ${before.toString()}.`);
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
        toLocationId: body.type === "IN" || body.type === "ADJUST_SET" ? location.id : null,
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

    return { movement, locationCode: location.code, product };
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
    location: result.locationCode,
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
  const reconcileFullInventory = parsed.reconcileFullInventory === true;
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
    const idxCustomer = header.findIndex((h) => h === "customer" || h === "cliente" || h === "customer_code");
    const idxReference = header.findIndex((h) => h === "reference" || h === "referencia");
    const idxNotes = header.findIndex((h) => h === "notes" || h === "notas");
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
        customer: idxCustomer >= 0 ? cells[idxCustomer] : undefined,
        warehouse: warehouseCell || undefined,
        location: locationCell || undefined,
        status: statusCell || undefined,
        quantity,
        reference: idxReference >= 0 ? cells[idxReference] : undefined,
        notes: idxNotes >= 0 ? cells[idxNotes] : undefined
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
  const receivedRows = rows.length;
  let created = 0;
  let updated = 0;
  let unchanged = 0;
  let zeroed = 0;
  let omitted = 0;

  const keysInFile = new Set<string>();
  const scopeCustomerCodes = new Set<string>();
  const scopeProductIds = new Set<string>();
  const scopeStatuses = new Set<string>();
  const scopeWarehouses = new Set<string>([DEFAULT_WH]);

  for (const row of rows) {
    const wh = (row.warehouse || DEFAULT_WH).trim();
    const locationCode = (row.location || `${wh}-GEN-STAGE-01`).trim().toUpperCase();
    const status = (row.status || "AVAILABLE").trim().toUpperCase();
    scopeWarehouses.add(wh.toUpperCase());
    scopeStatuses.add(status);
    if (row.customer?.trim()) {
      scopeCustomerCodes.add(row.customer.trim().toUpperCase());
    }
    const product = await prisma.product.findFirst({
      where: { sku: row.sku.trim(), active: true },
      include: { customer: { select: { code: true, name: true } } }
    });
    if (!product) {
      omitted += 1;
      errors.push({ sku: row.sku, message: "SKU no existe o inactivo" });
      continue;
    }

    scopeProductIds.add(product.id);
    if (!row.customer?.trim() && product.customer?.code) {
      scopeCustomerCodes.add(product.customer.code.toUpperCase());
    }

    if (row.customer?.trim()) {
      const expectedCode = row.customer.trim().toUpperCase();
      const actualCode = product.customer?.code?.toUpperCase();
      if (!actualCode || actualCode !== expectedCode) {
        omitted += 1;
        errors.push({
          sku: row.sku,
          message: `Cliente no coincide: esperado ${expectedCode}, producto ligado a ${actualCode || "sin cliente"}`
        });
        continue;
      }
    }

    try {
      const outcome = await prisma.$transaction(async (tx) => {
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
        const isNewStock = !stock;
        if (!stock) {
          stock = await tx.inventory.create({
            data: { productId: product.id, locationId: location.id, status, qty: dec(0), reservedQty: dec(0) }
          });
        }

        const before = stock.qty;
        const target = dec(row.quantity);

        const compositeKey = stockCompositeKey(product.id, location.id, status);
        keysInFile.add(compositeKey);

        if (before.equals(target)) {
          return "unchanged" as const;
        }

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
            reference: (row.reference || "IMPORT_INVENTORY_CSV").trim().slice(0, 120),
            notes: (row.notes || "Saldo fijado por importacion").trim().slice(0, 500),
            userId: req.auth!.userId
          }
        });

        return isNewStock ? ("created" as const) : ("updated" as const);
      });

      if (outcome === "unchanged") unchanged += 1;
      else if (outcome === "created") created += 1;
      else updated += 1;
    } catch (e) {
      omitted += 1;
      errors.push({
        sku: row.sku,
        message: e instanceof Error ? e.message : "Error"
      });
    }
  }

  if (reconcileFullInventory && scopeProductIds.size > 0) {
    const reconcileWhere: Prisma.InventoryWhereInput = {
      location: { warehouse: { in: [...scopeWarehouses] } },
      productId: { in: [...scopeProductIds] },
      status: { in: [...scopeStatuses] }
    };
    if (scopeCustomerCodes.size > 0) {
      reconcileWhere.product = {
        customer: { code: { in: [...scopeCustomerCodes] } }
      };
    }

    const existingStocks = await prisma.inventory.findMany({
      where: reconcileWhere,
      include: {
        product: { select: { id: true, sku: true } },
        location: { select: { id: true, code: true, warehouse: true } }
      }
    });

    for (const stock of existingStocks) {
      const compositeKey = stockCompositeKey(stock.productId, stock.locationId, stock.status);
      if (keysInFile.has(compositeKey)) continue;
      if (stock.qty.equals(dec(0))) continue;

      try {
        await prisma.$transaction(async (tx) => {
          const before = stock.qty;
          await tx.inventory.update({
            where: { id: stock.id },
            data: { qty: dec(0) }
          });
          await tx.inventoryMovement.create({
            data: {
              productId: stock.productId,
              type: "ADJUSTMENT",
              warehouse: stock.location.warehouse,
              qty: dec(0),
              fromLocationId: stock.locationId,
              movementType: "ADJUST_SET",
              quantityBefore: before,
              quantityAfter: dec(0),
              reference: RECONCILE_REFERENCE,
              notes: "Saldo ajustado a cero por reconciliacion de inventario fisico completo",
              userId: req.auth!.userId
            }
          });
        });
        zeroed += 1;
      } catch (e) {
        errors.push({
          sku: stock.product.sku,
          message: e instanceof Error ? e.message : "Error al reconciliar saldo"
        });
      }
    }
  }

  const applied = created + updated + unchanged;

  await logActivity({
    type: "IMPORT",
    subtype: reconcileFullInventory ? "CSV_INVENTORY_RECONCILE" : "CSV_INVENTORY",
    reference: "inventory_csv_batch",
    userId: req.auth!.userId,
    metadata: {
      receivedRows,
      applied,
      created,
      updated,
      unchanged,
      zeroed,
      omitted,
      reconcileFullInventory,
      errors: errors.slice(0, 30)
    }
  });

  res.json({
    receivedRows,
    applied,
    created,
    updated,
    unchanged,
    zeroed,
    omitted,
    skipped: omitted,
    errors
  });
});

export { inventoryRouter };
