import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../db/prisma.js";
import { requireAuth, requireRole } from "../../middlewares/auth.middleware.js";
import { HttpError } from "../../shared/http-error.js";
import { requireNonClient, requireOperationalClient } from "../clients/client-scope.js";

const incidentsRouter = Router();

const createIncidentSchema = z.object({
  type: z.enum([
    "DOUBLE_SCAN",
    "DAMAGED",
    "STOCK_MISMATCH",
    "WRONG_LOCATION",
    "MISSING_PRODUCT"
  ]),
  warehouse: z.string().max(80).optional(),
  location: z.string().max(160).optional(),
  productId: z.string().optional(),
  productSku: z.string().max(120).optional(),
  notes: z.string().min(1).max(4000)
});

const updateIncidentSchema = z.object({
  status: z.enum(["OPEN", "REVIEWING", "APPROVED", "REJECTED", "RESOLVED"]).optional(),
  resolution: z.string().max(4000).optional()
});

incidentsRouter.use(requireAuth);
incidentsRouter.use(requireOperationalClient);

incidentsRouter.get("/", async (req, res) => {
  requireNonClient(req.auth!);
  const role = req.auth!.role;
  const isElevated = role === "ADMIN" || role === "SUPERVISOR";

  const incidents = await prisma.incident.findMany({
    where: isElevated ? {} : { reportedById: req.auth!.userId },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: {
      reportedBy: { select: { id: true, fullName: true, email: true } },
      reviewedBy: { select: { id: true, fullName: true } },
      product: { select: { sku: true, name: true } }
    }
  });

  res.json(incidents);
});

incidentsRouter.post("/", requireRole(["ADMIN", "OPERATOR", "SUPERVISOR"]), async (req, res) => {
  const data = createIncidentSchema.parse(req.body);

  let productId: string | null = null;
  let notes = data.notes.trim();
  const rawProductRef = (data.productId || data.productSku || "").trim();

  if (rawProductRef) {
    const byId = await prisma.product.findUnique({ where: { id: rawProductRef } });
    if (byId) {
      productId = byId.id;
    } else {
      const bySku = await prisma.product.findFirst({
        where: {
          OR: [{ sku: rawProductRef }, { barcode: rawProductRef }]
        }
      });
      if (bySku) {
        productId = bySku.id;
      } else {
        // No romper por FK: registrar referencia en notes
        if (!notes.includes(rawProductRef)) {
          notes = `${notes}\n[SKU/ref manual: ${rawProductRef}]`;
        }
        productId = null;
      }
    }
  }

  try {
    const incident = await prisma.incident.create({
      data: {
        type: data.type,
        status: "OPEN",
        reportedById: req.auth!.userId,
        warehouse: data.warehouse?.trim() || null,
        location: data.location?.trim() || null,
        productId,
        notes
      },
      include: {
        product: { select: { sku: true, name: true } }
      }
    });

    res.status(201).json(incident);
  } catch (_err) {
    throw new HttpError(
      400,
      "No se pudo registrar la incidencia. Verifica el producto (SKU) o regístrala solo con notas."
    );
  }
});

incidentsRouter.patch("/:id", requireRole(["ADMIN", "SUPERVISOR"]), async (req, res) => {
  const id = z.string().min(1).parse(req.params.id);
  const data = updateIncidentSchema.parse(req.body);

  const existing = await prisma.incident.findUnique({ where: { id } });
  if (!existing) {
    throw new HttpError(404, "Incidencia no encontrada.");
  }

  const updates: {
    status?: string;
    resolution?: string | null;
    reviewedById?: string;
    resolvedAt?: Date | null;
  } = {};

  if (data.status) updates.status = data.status;
  if (data.resolution !== undefined) updates.resolution = data.resolution;
  if (data.status === "RESOLVED" || data.status === "APPROVED" || data.status === "REJECTED") {
    updates.reviewedById = req.auth!.userId;
    updates.resolvedAt = new Date();
  }

  const incident = await prisma.incident.update({
    where: { id },
    data: updates
  });

  res.json(incident);
});

export { incidentsRouter };
