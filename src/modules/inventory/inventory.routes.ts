import { Router } from "express";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../../db/prisma.js";
import { requireAuth, requireRole } from "../../middlewares/auth.middleware.js";
import { HttpError } from "../../shared/http-error.js";

const inventoryRouter = Router();

const movementTypes = ["IN", "OUT", "ADJUST_SET"] as const;

const createMovementSchema = z
  .object({
    sku: z.string().min(1).max(80),
    warehouse: z.string().min(1).max(80).optional(),
    type: z.enum(movementTypes),
    quantity: z.coerce.number(),
    reference: z.string().max(120).optional(),
    notes: z.string().max(500).optional()
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

inventoryRouter.get("/stock", requireRole(["ADMIN", "OPERATOR"]), async (_req, res) => {
  const rows = await prisma.inventoryStock.findMany({
    orderBy: [{ warehouse: "asc" }, { updatedAt: "desc" }],
    take: 500,
    include: {
      product: {
        select: { sku: true, name: true, active: true }
      }
    }
  });

  res.json(rows);
});

inventoryRouter.get("/movements", requireRole(["ADMIN", "OPERATOR"]), async (_req, res) => {
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

    let stock = await tx.inventoryStock.findUnique({
      where: { productId_warehouse: { productId: product.id, warehouse } }
    });

    if (!stock) {
      stock = await tx.inventoryStock.create({
        data: {
          productId: product.id,
          warehouse,
          quantity: dec(0)
        }
      });
    }

    const before = stock.quantity;
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

    await tx.inventoryStock.update({
      where: { id: stock.id },
      data: { quantity: after }
    });

    const movement = await tx.inventoryMovement.create({
      data: {
        productId: product.id,
        warehouse,
        movementType: body.type,
        quantityBefore: before,
        quantityAfter: after,
        reference: body.reference?.trim() || null,
        notes: body.notes?.trim() || null,
        userId: req.auth!.userId
      },
      include: {
        product: { select: { sku: true, name: true } }
      }
    });

    return movement;
  });

  res.status(201).json(result);
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
      const rowParsed = importRowSchema.safeParse({
        sku,
        warehouse: warehouseCell || undefined,
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
    const product = await prisma.product.findFirst({
      where: { sku: row.sku.trim(), active: true }
    });
    if (!product) {
      errors.push({ sku: row.sku, message: "SKU no existe o inactivo" });
      continue;
    }

    try {
      await prisma.$transaction(async (tx) => {
        let stock = await tx.inventoryStock.findUnique({
          where: { productId_warehouse: { productId: product.id, warehouse: wh } }
        });
        if (!stock) {
          stock = await tx.inventoryStock.create({
            data: { productId: product.id, warehouse: wh, quantity: dec(0) }
          });
        }

        const before = stock.quantity;
        const target = dec(row.quantity);

        await tx.inventoryStock.update({
          where: { id: stock.id },
          data: { quantity: target }
        });

        await tx.inventoryMovement.create({
          data: {
            productId: product.id,
            warehouse: wh,
            movementType: "ADJUST_SET",
            quantityBefore: before,
            quantityAfter: target,
            reference: "IMPORT_CSV",
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

  res.json({ applied, skipped: errors.length, errors });
});

export { inventoryRouter };
