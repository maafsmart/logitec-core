import { Router } from "express";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "../../db/prisma.js";
import { requireAuth, requireRole } from "../../middlewares/auth.middleware.js";
import { clientActivityWhere } from "../clients/client-scope.js";

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

traceabilityRouter.use(requireAuth, requireRole(["ADMIN", "OPERATOR", "SUPERVISOR", "CLIENT"]));

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
      // date-only (YYYY-MM-DD) → inicio del día local del servidor
      const fromRaw = q.from.trim();
      const d = /^\d{4}-\d{2}-\d{2}$/.test(fromRaw)
        ? new Date(`${fromRaw}T00:00:00`)
        : new Date(fromRaw);
      if (!Number.isNaN(d.getTime())) where.createdAt.gte = d;
    }
    if (q.to?.trim()) {
      // date-only → fin del día (evita excluir eventos del mismo día)
      const toRaw = q.to.trim();
      let d: Date;
      if (/^\d{4}-\d{2}-\d{2}$/.test(toRaw)) {
        d = new Date(`${toRaw}T23:59:59.999`);
      } else {
        d = new Date(toRaw);
      }
      if (!Number.isNaN(d.getTime())) where.createdAt.lte = d;
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
