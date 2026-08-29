import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../db/prisma.js";
import { requireAuth, requireRole } from "../../middlewares/auth.middleware.js";
import { HttpError } from "../../shared/http-error.js";
import { clientInventoryWhere, isClientRole } from "../clients/client-scope.js";
import {
  createWarehouseRecord,
  setWarehouseActive,
  updateWarehouseRecord,
  warehouseOperationalStats
} from "./master-data.service.js";

const warehousesRouter = Router();

const warehouseFieldsSchema = z.object({
  code: z.string().min(1).max(80).optional(),
  name: z.string().min(1).max(160).optional(),
  address: z.string().max(500).nullable().optional(),
  manager: z.string().max(160).nullable().optional(),
  phone: z.string().max(40).nullable().optional(),
  email: z.string().email().max(250).nullable().optional(),
  hours: z.string().max(120).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  active: z.coerce.boolean().optional()
});

const createWarehouseSchema = warehouseFieldsSchema.extend({
  code: z.string().min(1).max(80),
  name: z.string().min(1).max(160)
});

warehousesRouter.use(requireAuth);

warehousesRouter.get("/", requireRole(["ADMIN", "OPERATOR", "SUPERVISOR", "CLIENT"]), async (req, res) => {
  let where: { id?: { in: string[] } } = {};
  if (isClientRole(req.auth!)) {
    const visible = await prisma.location.findMany({
      where: { inventories: { some: clientInventoryWhere(req.auth!) } },
      distinct: ["warehouseId"],
      select: { warehouseId: true }
    });
    where = { id: { in: visible.map((row) => row.warehouseId) } };
  }
  const rows = await prisma.warehouse.findMany({
    where,
    orderBy: [{ active: "desc" }, { code: "asc" }],
    take: 200
  });
  const withStats = await Promise.all(
    rows.map(async (row) => ({
      ...row,
      stats: await warehouseOperationalStats(prisma as never, row)
    }))
  );
  res.json(withStats);
});

warehousesRouter.post("/", requireRole(["ADMIN"]), async (req, res) => {
  const data = createWarehouseSchema.parse(req.body);
  const warehouse = await createWarehouseRecord(prisma as never, data);
  res.status(201).json(warehouse);
});

warehousesRouter.get("/:id", requireRole(["ADMIN", "OPERATOR", "SUPERVISOR", "CLIENT"]), async (req, res) => {
  const id = z.string().min(1).parse(req.params.id);
  const warehouse = await prisma.warehouse.findUnique({ where: { id } });
  if (!warehouse) throw new HttpError(404, "Almacén no encontrado.");
  if (isClientRole(req.auth!)) {
    const visible = await prisma.location.count({
      where: { warehouseId: warehouse.id, inventories: { some: clientInventoryWhere(req.auth!) } }
    });
    if (!visible) throw new HttpError(404, "Almacén no encontrado.");
  }
  res.json({
    ...warehouse,
    stats: await warehouseOperationalStats(prisma as never, warehouse)
  });
});

warehousesRouter.put("/:id", requireRole(["ADMIN"]), async (req, res) => {
  const id = z.string().min(1).parse(req.params.id);
  const data = warehouseFieldsSchema.parse(req.body);
  res.json(await updateWarehouseRecord(prisma as never, id, data));
});

warehousesRouter.patch("/:id/active", requireRole(["ADMIN"]), async (req, res) => {
  const id = z.string().min(1).parse(req.params.id);
  const { active } = z.object({ active: z.coerce.boolean() }).parse(req.body);
  res.json(await setWarehouseActive(prisma as never, id, active));
});

export { warehousesRouter };
