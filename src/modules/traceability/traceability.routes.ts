import { Router } from "express";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "../../db/prisma.js";
import { requireAuth, requireRole } from "../../middlewares/auth.middleware.js";
import { clientActivityWhere, requireOperationalClient } from "../clients/client-scope.js";
import { parseMexicoCityDateFilter } from "../../shared/mexico-city-date.js";

const traceabilityRouter = Router();

const querySchema = z.object({
  warehouse: z.string().optional(),
  userId: z.string().optional(),
  type: z.string().optional(),
  sku: z.string().optional(),
  customer: z.string().optional(),
  cliente: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  limit: z.coerce.number().min(1).max(500).optional().default(150)
});

traceabilityRouter.use(requireAuth, requireRole(["ADMIN", "OPERATOR", "SUPERVISOR", "CLIENT"]), requireOperationalClient);

traceabilityRouter.get("/activity", async (req, res) => {
  const q = querySchema.parse(req.query);

  const where: Prisma.ActivityLogWhereInput = {};

  if (q.warehouse?.trim()) {
    where.warehouse = { equals: q.warehouse.trim(), mode: "insensitive" };
  }
  if (q.userId?.trim()) {
    where.userId = q.userId.trim();
  }
  if (q.type?.trim()) {
    where.type = { equals: q.type.trim(), mode: "insensitive" };
  }
  if (q.sku?.trim()) {
    where.product = { sku: { equals: q.sku.trim(), mode: "insensitive" } };
  }
  if (q.customer?.trim()) {
    where.customer = { code: { equals: q.customer.trim(), mode: "insensitive" } };
  } else if (q.cliente?.trim()) {
    where.customer = { name: { contains: q.cliente.trim(), mode: "insensitive" } };
  }
  if (q.from?.trim() || q.to?.trim()) {
    where.createdAt = {};
    if (q.from?.trim()) {
      const fromRaw = q.from.trim();
      const d = parseMexicoCityDateFilter(fromRaw, "start");
      if (d) where.createdAt.gte = d;
    }
    if (q.to?.trim()) {
      const toRaw = q.to.trim();
      const d = parseMexicoCityDateFilter(toRaw, "end");
      if (d) where.createdAt.lte = d;
    }
  }
  const scope = clientActivityWhere(req.auth!);
  if (Object.keys(scope).length) {
    where.AND = [scope];
  }

  const rows = await prisma.activityLog.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: q.limit,
    include: {
      user: { select: { id: true, fullName: true, email: true, role: true } },
      product: { select: { id: true, sku: true, name: true } },
      customer: { select: { id: true, code: true, name: true } },
      task: { select: { id: true, type: true, status: true, reference: true } }
    }
  });

  res.json(rows);
});

export { traceabilityRouter };
