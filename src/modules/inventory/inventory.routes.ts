import { Router } from "express";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../../db/prisma.js";
import { requireAuth, requireRole } from "../../middlewares/auth.middleware.js";
import { HttpError } from "../../shared/http-error.js";
import {
  clientInventoryWhere,
  clientLayerWhere,
  clientMovementWhere,
  clientProductWhere,
  clientSerialWhere,
  isClientRole
} from "../clients/client-scope.js";
import { parseMexicoCityDateFilter } from "../../shared/mexico-city-date.js";
import { calculateInventoryValuation } from "./inventory-valuation.service.js";
import { InventoryMutationError, mutateInventory } from "./inventory-mutation.service.js";

const inventoryRouter = Router();

const movementTypes = ["IN", "OUT", "ADJUST_SET"] as const;
const stockStatuses = ["AVAILABLE", "OPERATIONS", "HOLD", "BLOCKED", "QUARANTINE"] as const;

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
    taskId: z.string().optional(),
    inventoryId: z.string().min(1).optional(),
    layerId: z.string().min(1).optional(),
    lotNumber: z.string().min(1).max(120).optional(),
    unitPriceMxn: z.coerce.number().nonnegative().optional(),
    unitPriceUsd: z.coerce.number().nonnegative().optional()
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

function dec(n: string | number): Prisma.Decimal {
  return new Prisma.Decimal(String(n));
}

inventoryRouter.use(requireAuth);

inventoryRouter.get("/statuses", requireRole(["ADMIN", "OPERATOR", "SUPERVISOR", "CLIENT"]), async (_req, res) => {
  res.json(await prisma.inventoryStatusDefinition.findMany({ orderBy: [{ sortOrder: "asc" }, { code: "asc" }] }));
});

inventoryRouter.get("/stock/:inventoryId/layers", requireRole(["ADMIN", "OPERATOR", "SUPERVISOR", "CLIENT"]), async (req, res) => {
  const inventoryId = z.string().min(1).parse(req.params.inventoryId);
  const inventory = await prisma.inventory.findFirst({
    where: { AND: [{ id: inventoryId }, clientInventoryWhere(req.auth!)] },
    include: { layers: { orderBy: { createdAt: "asc" } } }
  });
  if (!inventory) throw new HttpError(404, "Línea de inventario no encontrada.");
  res.json(inventory.layers);
});

inventoryRouter.get("/products/:productId/layers", requireRole(["ADMIN", "OPERATOR", "SUPERVISOR", "CLIENT"]), async (req, res) => {
  const productId = z.string().min(1).parse(req.params.productId);
  const product = await prisma.product.findFirst({
    where: { AND: [{ id: productId }, clientProductWhere(req.auth!)] },
    select: { id: true }
  });
  if (!product) throw new HttpError(404, "Producto no encontrado.");
  res.json(
    await prisma.inventoryLayer.findMany({
      where: { AND: [{ inventory: { productId } }, clientLayerWhere(req.auth!)] },
      orderBy: { createdAt: "asc" }
    })
  );
});

inventoryRouter.get("/products/:productId/valuation", requireRole(["ADMIN", "OPERATOR", "SUPERVISOR", "CLIENT"]), async (req, res) => {
  const productId = z.string().min(1).parse(req.params.productId);
  const layers = await prisma.inventoryLayer.findMany({
    where: { AND: [{ inventory: { productId } }, clientLayerWhere(req.auth!)] },
    select: { qty: true, unitPriceMxn: true, unitPriceUsd: true }
  });
  const product = await prisma.product.findFirst({
    where: { AND: [{ id: productId }, clientProductWhere(req.auth!)] },
    select: { id: true }
  });
  if (!product) throw new HttpError(404, "Producto no encontrado.");
  res.json(calculateInventoryValuation(layers));
});

inventoryRouter.get("/products/:productId/serials", requireRole(["ADMIN", "OPERATOR", "SUPERVISOR", "CLIENT"]), async (req, res) => {
  const productId = z.string().min(1).parse(req.params.productId);
  const query = z.object({
    cursor: z.string().min(1).optional(),
    q: z.string().trim().min(1).max(120).optional(),
    layerId: z.string().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50)
  }).parse(req.query);
  const product = await prisma.product.findFirst({
    where: { AND: [{ id: productId }, clientProductWhere(req.auth!)] },
    select: { id: true }
  });
  if (!product) throw new HttpError(404, "Producto no encontrado.");
  const serialWhere: Prisma.InventorySerialWhereInput = {
    AND: [
      { productId, ...(query.layerId ? { inventoryLayerId: query.layerId } : {}) },
      clientSerialWhere(req.auth!),
      ...(query.q
        ? [
            {
              OR: [
                { serialNumber: { contains: query.q, mode: "insensitive" as const } },
                { imei: { contains: query.q, mode: "insensitive" as const } }
              ]
            }
          ]
        : [])
    ]
  };
  const rows = await prisma.inventorySerial.findMany({
    where: serialWhere,
    orderBy: { id: "asc" },
    take: query.limit + 1,
    ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {})
  });
  const next = rows.length > query.limit ? rows.pop() : undefined;
  res.json({ items: rows, nextCursor: next?.id ?? null });
});

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
  const query = z
    .object({
      q: z.string().trim().min(1).max(160).optional(),
      sku: z.string().trim().min(1).max(80).optional(),
      productId: z.string().min(1).optional(),
      clientId: z.string().min(1).optional(),
      projectId: z.string().min(1).optional(),
      movementType: z.string().trim().min(1).max(40).optional(),
      userId: z.string().min(1).optional(),
      from: z.string().trim().min(1).max(40).optional(),
      to: z.string().trim().min(1).max(40).optional(),
      requisition: z.string().trim().min(1).max(120).optional(),
      location: z.string().trim().min(1).max(120).optional(),
      status: z.string().trim().min(1).max(80).optional(),
      cursor: z.string().min(1).optional(),
      limit: z.coerce.number().int().min(1).max(100).default(50)
    })
    .parse(req.query);
  const dateFilter: Prisma.DateTimeFilter = {};
  if (query.from) {
    const date = parseMexicoCityDateFilter(query.from, "start");
    if (!date) throw new HttpError(400, "Fecha 'from' inválida. Usa YYYY-MM-DD o ISO-8601.");
    dateFilter.gte = date;
  }
  if (query.to) {
    const date = parseMexicoCityDateFilter(query.to, "end");
    if (!date) throw new HttpError(400, "Fecha 'to' inválida. Usa YYYY-MM-DD o ISO-8601.");
    dateFilter.lte = date;
  }
  const conditions: Prisma.InventoryMovementWhereInput[] = [
    clientMovementWhere(req.auth!),
    ...(Object.keys(dateFilter).length ? [{ createdAt: dateFilter }] : []),
    ...(query.sku ? [{ product: { sku: { equals: query.sku, mode: "insensitive" as const } } }] : []),
    ...(query.productId ? [{ productId: query.productId }] : []),
    ...(query.clientId ? [{ product: { customer: { clientId: query.clientId } } }] : []),
    ...(query.projectId ? [{ product: { customerId: query.projectId } }] : []),
    ...(query.movementType
      ? [{ movementType: { equals: query.movementType, mode: "insensitive" as const } }]
      : []),
    ...(query.userId ? [{ userId: query.userId }] : []),
    ...(query.requisition
      ? [
          {
            requisitionLine: {
              requisition: {
                OR: [
                  { id: query.requisition },
                  { number: { contains: query.requisition, mode: "insensitive" as const } }
                ]
              }
            }
          }
        ]
      : []),
    ...(query.location
      ? [
          {
            OR: [
              { fromLocation: { code: { contains: query.location, mode: "insensitive" as const } } },
              { toLocation: { code: { contains: query.location, mode: "insensitive" as const } } }
            ]
          }
        ]
      : []),
    ...(query.status ? [{ stockStatus: { equals: query.status, mode: "insensitive" as const } }] : []),
    ...(query.q
      ? [
          {
            OR: [
              { product: { sku: { contains: query.q, mode: "insensitive" as const } } },
              { product: { name: { contains: query.q, mode: "insensitive" as const } } },
              { product: { description: { contains: query.q, mode: "insensitive" as const } } },
              { reference: { contains: query.q, mode: "insensitive" as const } },
              { requisitionLine: { requisition: { number: { contains: query.q, mode: "insensitive" as const } } } },
              { inventoryLayer: { lotNumber: { contains: query.q, mode: "insensitive" as const } } },
              { inventorySerial: { serialNumber: { contains: query.q, mode: "insensitive" as const } } },
              { inventorySerial: { imei: { contains: query.q, mode: "insensitive" as const } } }
            ]
          }
        ]
      : [])
  ];
  const where: Prisma.InventoryMovementWhereInput = { AND: conditions };
  const rows = await prisma.inventoryMovement.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: query.limit + 1,
    ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    include: {
      product: {
        select: {
          id: true,
          sku: true,
          barcode: true,
          name: true,
          description: true,
          customer: {
            select: {
              id: true,
              code: true,
              name: true,
              client: { select: { id: true, name: true, legalName: true, tradeName: true } }
            }
          }
        }
      },
      user: { select: { id: true, fullName: true, email: true } },
      fromLocation: { select: { id: true, code: true, warehouse: true } },
      toLocation: { select: { id: true, code: true, warehouse: true } },
      inventoryLayer: { select: { id: true, lotNumber: true, receivedAt: true, unitPriceMxn: true, unitPriceUsd: true } },
      inventorySerial: { select: { id: true, serialNumber: true, imei: true } },
      task: { select: { id: true, type: true, reference: true } },
      requisitionLine: {
        select: {
          id: true,
          requisition: {
            select: {
              id: true,
              number: true,
              status: true,
              project: { select: { id: true, code: true, name: true } }
            }
          }
        }
      }
    }
  });
  const next = rows.length > query.limit ? rows.pop() : undefined;
  const statuses = await prisma.inventoryStatusDefinition.findMany({
    where: { code: { in: [...new Set(rows.map((row) => row.stockStatus).filter((code): code is string => Boolean(code)))] } },
    select: { code: true, label: true }
  });
  const statusLabels = new Map(statuses.map((status) => [status.code, status.label]));
  res.json({
    items: rows.map((row) => {
      const requisition = row.requisitionLine?.requisition ?? null;
      const project = requisition?.project ?? row.product.customer ?? null;
      return {
        id: row.id,
        createdAt: row.createdAt,
        client: row.product.customer?.client ?? null,
        project,
        product: {
          id: row.product.id,
          sku: row.product.sku,
          barcode: row.product.barcode,
          name: row.product.name,
          description: row.product.description
        },
        movement: {
          type: row.type,
          movementType: row.movementType,
          signedQty:
            row.movementType === "RELOCATE"
              ? null
              : row.movementType === "ADJUST_SET"
                ? row.quantityAfter.minus(row.quantityBefore).toString()
                : row.movementType === "IN"
                  ? row.qty.toString()
                  : row.qty.negated().toString(),
          quantityBefore: row.quantityBefore,
          quantityAfter: row.quantityAfter,
          stockStatus: row.stockStatus,
          stockStatusLabel: row.stockStatus ? statusLabels.get(row.stockStatus) ?? null : null
        },
        fromLocation: row.fromLocation,
        toLocation: row.toLocation,
        layer: row.inventoryLayer,
        serial: row.inventorySerial,
        user: row.user,
        requisition,
        requisitionLine: row.requisitionLine ? { id: row.requisitionLine.id } : null,
        task: row.task,
        reference: row.reference,
        notes: row.notes
      };
    }),
    nextCursor: next?.id ?? null
  });
});

inventoryRouter.post("/movements", requireRole(["ADMIN", "SUPERVISOR", "OPERATOR"]), async (req, res) => {
  const body = createMovementSchema.parse(req.body);
  const stockStatus = body.status || "AVAILABLE";
  const qtyIn = dec(body.quantity);
  const product = await prisma.product.findFirst({ where: { sku: body.sku.trim(), active: true } });
  if (!product) throw new HttpError(404, `Producto no encontrado o inactivo: ${body.sku}`);

  let inventoryId = body.inventoryId;
  let locationId: string | undefined;
  if (body.type === "IN") {
    if (!body.location) throw new HttpError(400, "La entrada requiere una ubicación explícita.");
    const location = await prisma.location.findUnique({ where: { code: body.location.trim().toUpperCase() } });
    if (!location) throw new HttpError(400, "La ubicación indicada no existe.");
    locationId = location.id;
  } else if (!inventoryId && body.location) {
    const location = await prisma.location.findUnique({ where: { code: body.location.trim().toUpperCase() } });
    if (!location) throw new HttpError(400, "La ubicación indicada no existe.");
    const stock = await prisma.inventory.findFirst({
      where: { productId: product.id, locationId: location.id, status: stockStatus }
    });
    if (!stock) throw new HttpError(404, "Línea de inventario no encontrada para esa ubicación/estado.");
    inventoryId = stock.id;
  }
  if (body.type !== "IN" && !inventoryId) {
    throw new HttpError(400, "OUT/ADJUST_SET requieren inventoryId o ubicación existente con saldo.");
  }

  try {
    const result = await mutateInventory({
      type: body.type,
      productId: product.id,
      locationId,
      status: stockStatus,
      inventoryId,
      layerId: body.layerId,
      qty: qtyIn,
      reference: body.reference?.trim() || null,
      notes: body.notes?.trim() || null,
      taskId: body.taskId?.trim() || null,
      userId: req.auth!.userId,
      lotNumber: body.lotNumber?.trim() || null,
      unitPriceMxn: body.unitPriceMxn == null ? null : dec(body.unitPriceMxn),
      unitPriceUsd: body.unitPriceUsd == null ? null : dec(body.unitPriceUsd),
      activity: {
        type: body.type === "IN" ? "RECEIVE" : body.type === "OUT" ? "OUTBOUND" : "ADJUSTMENT",
        subtype: body.type === "IN" ? "MANUAL_IN" : body.type === "OUT" ? "MANUAL_OUT" : "MANUAL_ADJUSTMENT",
        reference: body.reference?.trim() || null,
        userId: req.auth!.userId,
        result: "OK",
        taskId: body.taskId?.trim() || null
      }
    });
    res.status(201).json(result.movement);
  } catch (error) {
    if (error instanceof InventoryMutationError) {
      const status = ["AMBIGUOUS_LAYER", "INSUFFICIENT_STOCK", "SERIAL_SELECTION_REQUIRED"].includes(error.code)
        ? 409
        : 400;
      res.status(status).json({ code: error.code, message: error.message, details: error.details });
      return;
    }
    throw error;
  }
});

const relocateSchema = z.object({
  inventoryId: z.string().min(1),
  layerId: z.string().min(1).optional(),
  destinationLocation: z.string().min(1).max(120),
  quantity: z.coerce.number().positive(),
  reference: z.string().max(120).optional(),
  notes: z.string().max(500).optional(),
  taskId: z.string().optional()
});

inventoryRouter.post("/relocate", requireRole(["ADMIN", "SUPERVISOR", "OPERATOR"]), async (req, res) => {
  const body = relocateSchema.parse(req.body);
  const source = await prisma.inventory.findUnique({
    where: { id: body.inventoryId },
    include: { product: true, location: true }
  });
  if (!source) throw new HttpError(404, "Línea de inventario origen no encontrada.");
  const destination = await prisma.location.findUnique({
    where: { code: body.destinationLocation.trim().toUpperCase() }
  });
  if (!destination) throw new HttpError(400, "La ubicación destino no existe.");
  if (destination.id === source.locationId) {
    throw new HttpError(400, "Origen y destino deben ser distintos.");
  }
  try {
    const result = await mutateInventory({
      type: "RELOCATE",
      productId: source.productId,
      inventoryId: source.id,
      layerId: body.layerId,
      destinationLocationId: destination.id,
      qty: dec(body.quantity),
      reference: body.reference?.trim() || null,
      notes: body.notes?.trim() || null,
      taskId: body.taskId?.trim() || null,
      userId: req.auth!.userId,
      activity: {
        type: "RELOCATE",
        subtype: "MANUAL_RELOCATE",
        reference: body.reference?.trim() || null,
        userId: req.auth!.userId,
        result: "OK",
        taskId: body.taskId?.trim() || null
      }
    });
    res.status(201).json(result.movement);
  } catch (error) {
    if (error instanceof InventoryMutationError) {
      const status = ["AMBIGUOUS_LAYER", "INSUFFICIENT_STOCK", "SERIAL_SELECTION_REQUIRED"].includes(error.code)
        ? 409
        : 400;
      res.status(status).json({ code: error.code, message: error.message, details: error.details });
      return;
    }
    throw error;
  }
});

inventoryRouter.post("/import", requireRole(["ADMIN"]), async (req, res) => {
  void req;
  res.status(409).json({
    code: "IMPORT_DISABLED",
    message: "La importación de inventario está deshabilitada temporalmente hasta contar con un flujo consciente de capas."
  });
});

export { inventoryRouter };
