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
import { canExposeEconomicValuation } from "./inventory-economic-access.js";
import { calculateInventoryValuation } from "./inventory-valuation.service.js";
import { InventoryMutationError, mutateInventory } from "./inventory-mutation.service.js";
import {
  assertCanTransferAssignment,
  transferAssignment
} from "./inventory-assignment-transfer.service.js";
import { assertActiveInventoryStatus } from "./inventory-status.js";
import { hasInventoryScope, inventoryScopeWhere, movementScopeWhere } from "./inventory-scope.js";
import {
  assertPhysicalResetConfirmation,
  executePhysicalInventoryReset
} from "./physical-reset.service.js";
import { isForbiddenInventoryProjectRecord } from "./inventory-project-rules.js";

const inventoryRouter = Router();

const optionalId = z.preprocess(
  (value) => (value == null || String(value).trim() === "" ? undefined : String(value).trim()),
  z.string().min(1).optional()
);
const inventoryScopeQuerySchema = z.object({
  projectId: optionalId,
  assignmentType: z.preprocess(
    (value) => (value == null || String(value).trim() === "" ? undefined : String(value).trim().toUpperCase()),
    z.enum(["PROJECT", "FREE_TO_SALE"]).optional()
  )
});

const movementTypes = ["IN", "OUT", "ADJUST_SET"] as const;

const createMovementSchema = z
  .object({
    sku: z.string().min(1).max(80),
    warehouse: z.string().min(1).max(80).optional(),
    location: z.string().min(1).max(120).optional(),
    status: z.string().trim().max(80).optional(),
    type: z.enum(movementTypes),
    quantity: z.coerce.number(),
    reference: z.string().max(120).optional(),
    notes: z.string().max(500).optional(),
    taskId: z.string().optional(),
    inventoryId: z.string().min(1).optional(),
    layerId: z.string().min(1).optional(),
    lotNumber: z.string().min(1).max(120).optional(),
    unitPriceMxn: z.coerce.number().nonnegative().optional(),
    unitPriceUsd: z.coerce.number().nonnegative().optional(),
    assignmentType: z.enum(["PROJECT", "FREE_TO_SALE"]).optional(),
    projectId: z.string().min(1).nullable().optional()
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

inventoryRouter.get("/summary", requireRole(["ADMIN", "OPERATOR", "SUPERVISOR", "CLIENT"]), async (req, res) => {
  const scope = inventoryScopeQuerySchema.parse(req.query);
  const inventoryWhere: Prisma.InventoryWhereInput = {
    AND: [clientInventoryWhere(req.auth!), inventoryScopeWhere(scope), { qty: { gt: 0 } }]
  };
  const movementWhere: Prisma.InventoryMovementWhereInput = {
    AND: [clientMovementWhere(req.auth!), movementScopeWhere(scope)]
  };
  const [cubes, qtyAgg, productIds, locationIds, projectIds, movements, catalogProducts, layers, serials, activeReservations, layersForValuation] = await Promise.all([
    prisma.inventory.count({ where: inventoryWhere }),
    prisma.inventory.aggregate({ where: inventoryWhere, _sum: { qty: true } }),
    prisma.inventory.findMany({ where: inventoryWhere, distinct: ["productId"], select: { productId: true } }),
    prisma.inventory.findMany({ where: inventoryWhere, distinct: ["locationId"], select: { locationId: true } }),
    prisma.inventory.findMany({
      where: {
        AND: [inventoryWhere, { assignmentType: "PROJECT", projectId: { not: null } }]
      },
      distinct: ["projectId"],
      select: { projectId: true }
    }),
    prisma.inventoryMovement.count({ where: movementWhere }),
    prisma.product.count({ where: clientProductWhere(req.auth!) }),
    prisma.inventoryLayer.count({
      where: { AND: [clientLayerWhere(req.auth!), { qty: { gt: 0 } }] }
    }),
    prisma.inventorySerial.count({ where: clientSerialWhere(req.auth!) }),
    prisma.inventoryReservation.count({
      where: { AND: [{ status: "ACTIVE" }, { inventory: clientInventoryWhere(req.auth!) }] }
    }),
    prisma.inventoryLayer.findMany({
      where: { AND: [clientLayerWhere(req.auth!), { qty: { gt: 0 }, inventory: inventoryWhere }] },
      select: { qty: true, reservedQty: true, unitPriceMxn: true, unitPriceUsd: true }
    })
  ]);
  const distinctInventoryProducts = productIds.length;
  const exposeEconomic = canExposeEconomicValuation(req.auth!.role);
  const valuation = exposeEconomic ? calculateInventoryValuation(layersForValuation) : undefined;
  res.json({
    cubes,
    qty: qtyAgg._sum.qty?.toString() ?? "0",
    distinctInventoryProducts,
    locations: locationIds.length,
    projects: projectIds.length,
    movements,
    products: hasInventoryScope(scope) ? distinctInventoryProducts : catalogProducts,
    layers,
    serials,
    activeReservations,
    ...(valuation ? { valuation } : {})
  });
});

inventoryRouter.get("/projects", requireRole(["ADMIN", "OPERATOR", "SUPERVISOR", "CLIENT"]), async (req, res) => {
  const grouped = await prisma.inventory.groupBy({
    by: ["projectId"],
    where: {
      AND: [
        clientInventoryWhere(req.auth!),
        { assignmentType: "PROJECT", projectId: { not: null }, qty: { gt: 0 } }
      ]
    },
    _sum: { qty: true },
    _count: { _all: true }
  });
  const ids = grouped.map((row) => row.projectId).filter((id): id is string => Boolean(id));
  const customers = ids.length
    ? await prisma.customer.findMany({
        where: { id: { in: ids } },
        select: { id: true, code: true, name: true }
      })
    : [];
  const qtyById = new Map(grouped.map((row) => [row.projectId, row]));
  const exposeEconomic = canExposeEconomicValuation(req.auth!.role);
  const projectLayers = exposeEconomic && ids.length
    ? await prisma.inventory.findMany({
        where: {
          AND: [
            clientInventoryWhere(req.auth!),
            { assignmentType: "PROJECT", projectId: { in: ids }, qty: { gt: 0 } }
          ]
        },
        select: {
          projectId: true,
          layers: {
            where: { qty: { gt: 0 } },
            select: { qty: true, reservedQty: true, unitPriceMxn: true, unitPriceUsd: true }
          }
        }
      })
    : [];
  const layersByProject = new Map<string, Array<{ qty: Prisma.Decimal; reservedQty: Prisma.Decimal; unitPriceMxn: Prisma.Decimal | null; unitPriceUsd: Prisma.Decimal | null }>>();
  for (const row of projectLayers) {
    if (!row.projectId) continue;
    const current = layersByProject.get(row.projectId) || [];
    current.push(...row.layers);
    layersByProject.set(row.projectId, current);
  }
  const projects = customers
    .filter((project) => !isForbiddenInventoryProjectRecord(project))
    .map((project) => {
      const stats = qtyById.get(project.id);
      const valuation = exposeEconomic
        ? calculateInventoryValuation(layersByProject.get(project.id) || [])
        : undefined;
      return {
        id: project.id,
        code: project.code,
        name: project.name,
        cubes: stats?._count._all ?? 0,
        qty: stats?._sum.qty?.toString() ?? "0",
        ...(valuation
          ? {
              valuation,
              inventoryValueMxn: valuation.totalValueMxn,
              qtyUnvalued: valuation.qtyUnvalued,
              coveragePct: valuation.coveragePct
            }
          : {})
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, "es"));
  res.json(projects);
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
    select: { qty: true, reservedQty: true, unitPriceMxn: true, unitPriceUsd: true }
  });
  const product = await prisma.product.findFirst({
    where: { AND: [{ id: productId }, clientProductWhere(req.auth!)] },
    select: { id: true }
  });
  if (!product) throw new HttpError(404, "Producto no encontrado.");
  if (!canExposeEconomicValuation(req.auth!.role)) {
    throw new HttpError(403, "No autorizado para consultar valuación económica.");
  }
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
  const scope = inventoryScopeQuerySchema.parse(req.query);
  const rows = await prisma.inventory.findMany({
    where: {
      AND: [clientInventoryWhere(req.auth!), inventoryScopeWhere(scope), { qty: { gt: 0 } }]
    },
    orderBy: [{ location: { warehouse: "asc" } }, { updatedAt: "desc" }],
    take: 20000,
    include: {
      product: {
        select: { sku: true, name: true, active: true, barcode: true }
      },
      location: true,
      project: {
        select: {
          id: true,
          code: true,
          name: true,
          client: { select: { id: true, name: true, tradeName: true, legalName: true } }
        }
      },
      layers: {
        where: { qty: { gt: 0 } },
        select: {
          id: true,
          lotNumber: true,
          qty: true,
          reservedQty: true,
          unitPriceMxn: true,
          unitPriceUsd: true
        }
      }
    }
  });

  const exposeEconomic = canExposeEconomicValuation(req.auth!.role);
  res.json(
    rows.map((row) => {
      const { layers, ...rest } = row;
      if (!exposeEconomic) return rest;
      const valuation = calculateInventoryValuation(layers);
      return { ...rest, valuation };
    })
  );
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
      projectId: optionalId,
      assignmentType: z.preprocess(
        (value) => (value == null || String(value).trim() === "" ? undefined : String(value).trim().toUpperCase()),
        z.enum(["PROJECT", "FREE_TO_SALE"]).optional()
      ),
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
    ...(() => {
      const scoped = movementScopeWhere({
        projectId: query.projectId,
        assignmentType: query.assignmentType
      });
      return Object.keys(scoped).length ? [scoped] : [];
    })(),
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
  const [rows, total] = await Promise.all([
    prisma.inventoryMovement.findMany({
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
      fromProject: { select: { id: true, code: true, name: true } },
      toProject: { select: { id: true, code: true, name: true } },
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
  }),
    prisma.inventoryMovement.count({ where })
  ]);
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
        qty: row.qty.toString(),
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
            row.movementType === "RELOCATE" || row.movementType === "ASSIGNMENT_TRANSFER"
              ? null
              : row.movementType === "ADJUST_SET"
                ? row.quantityAfter.minus(row.quantityBefore).toString()
                : row.movementType === "IN"
                  ? row.qty.toString()
                  : row.qty.negated().toString(),
          quantityBefore: row.quantityBefore,
          quantityAfter: row.quantityAfter,
          stockStatus: row.stockStatus,
          stockStatusLabel: row.stockStatus ? statusLabels.get(row.stockStatus) ?? null : null,
          fromAssignmentType: row.fromAssignmentType,
          fromProjectId: row.fromProjectId,
          fromAssignmentKey: row.fromAssignmentKey,
          toAssignmentType: row.toAssignmentType,
          toProjectId: row.toProjectId,
          toAssignmentKey: row.toAssignmentKey
        },
        fromProject: row.fromProject,
        toProject: row.toProject,
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
    nextCursor: next?.id ?? null,
    total
  });
});

inventoryRouter.post("/movements", requireRole(["ADMIN", "SUPERVISOR", "OPERATOR"]), async (req, res) => {
  const body = createMovementSchema.parse(req.body);
  const stockStatus = await assertActiveInventoryStatus(body.status || "AVAILABLE");
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
    const stockRows = await prisma.inventory.findMany({
      where: { productId: product.id, locationId: location.id, status: stockStatus }
    });
    if (stockRows.length > 1) {
      throw new HttpError(409, "Hay varias asignaciones para esa ubicación/estado; indica inventoryId.");
    }
    const stock = stockRows[0];
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
      assignmentType: body.assignmentType,
      projectId: body.projectId === undefined ? undefined : body.projectId,
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

const assignmentTransferSchema = z
  .object({
    sourceInventoryId: z.string().min(1),
    sourceLayerId: z.string().min(1).optional(),
    qty: z.coerce.number().positive(),
    destinationAssignmentType: z.enum(["PROJECT", "FREE_TO_SALE"]),
    destinationProjectId: z.string().min(1).nullable().optional(),
    reference: z.string().max(120).optional(),
    notes: z.string().max(500).optional()
  })
  .superRefine((data, ctx) => {
    if (data.destinationAssignmentType === "PROJECT" && !data.destinationProjectId) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "La reasignación PROJECT requiere destinationProjectId." });
    }
    if (data.destinationAssignmentType === "FREE_TO_SALE" && data.destinationProjectId) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "FREE TO SALE no admite destinationProjectId." });
    }
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

inventoryRouter.post("/assignment-transfer", requireRole(["ADMIN", "SUPERVISOR"]), async (req, res) => {
  assertCanTransferAssignment(req.auth!.role);
  const body = assignmentTransferSchema.parse(req.body);
  try {
    const result = await transferAssignment({
      sourceInventoryId: body.sourceInventoryId,
      sourceLayerId: body.sourceLayerId,
      qty: dec(body.qty),
      destinationAssignmentType: body.destinationAssignmentType,
      destinationProjectId: body.destinationProjectId ?? null,
      userId: req.auth!.userId,
      reference: body.reference?.trim() || null,
      notes: body.notes?.trim() || null
    });
    res.status(201).json({
      source: result.source,
      destination: result.destination,
      transferredQty: result.transferredQty,
      movementId: result.movementId,
      totalBefore: result.totalBefore,
      totalAfter: result.totalAfter
    });
  } catch (error) {
    if (error instanceof InventoryMutationError) {
      const status = [
        "INSUFFICIENT_UNRESERVED_FOR_TRANSFER",
        "INSUFFICIENT_LAYER_UNRESERVED",
        "LAYER_SELECTION_REQUIRED",
        "SERIAL_SELECTION_REQUIRED",
        "SAME_ASSIGNMENT",
        "INSUFFICIENT_STOCK"
      ].includes(error.code)
        ? 409
        : 400;
      res.status(status).json({ code: error.code, message: error.message, details: error.details });
      return;
    }
    throw error;
  }
});

inventoryRouter.post("/physical/reset", requireRole(["ADMIN"]), async (req, res) => {
  const body = z.object({ confirmation: z.string().optional() }).parse(req.body ?? {});
  assertPhysicalResetConfirmation(body.confirmation);
  const result = await executePhysicalInventoryReset({ userId: req.auth!.userId });
  res.json(result);
});

inventoryRouter.post("/import", requireRole(["ADMIN"]), async (req, res) => {
  void req;
  res.status(409).json({
    code: "IMPORT_DISABLED",
    message: "La importación de inventario está deshabilitada temporalmente hasta contar con un flujo consciente de capas."
  });
});

export { inventoryRouter };
