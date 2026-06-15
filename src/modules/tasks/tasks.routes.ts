import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../db/prisma.js";
import { requireAuth, requireRole } from "../../middlewares/auth.middleware.js";
import { HttpError } from "../../shared/http-error.js";

const tasksRouter = Router();

const createTaskSchema = z.object({
  type: z.enum(["PICK", "RECEIVE", "MOVE", "ADJUSTMENT", "COUNT"]),
  status: z.enum(["PENDING", "ASSIGNED", "IN_PROGRESS", "COMPLETED", "REJECTED", "CANCELLED"]).default("PENDING"),
  assignedToId: z.string().optional(),
  warehouse: z.string().max(80).optional(),
  priority: z.coerce.number().int().min(0).max(100).default(0),
  reference: z.string().max(200).optional(),
  notes: z.string().max(2000).optional()
});

tasksRouter.use(requireAuth);

tasksRouter.get("/", async (req, res) => {
  const role = req.auth!.role;
  const userId = req.auth!.userId;

  const where =
    role === "ADMIN" || role === "SUPERVISOR"
      ? {}
      : {
          OR: [{ assignedToId: userId }, { createdById: userId }]
        };

  const tasks = await prisma.task.findMany({
    where,
    orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
    take: 100,
    include: {
      assignedTo: { select: { id: true, fullName: true, email: true } },
      createdBy: { select: { id: true, fullName: true, email: true } }
    }
  });

  res.json(tasks);
});

tasksRouter.post("/", requireRole(["ADMIN", "SUPERVISOR"]), async (req, res) => {
  const data = createTaskSchema.parse(req.body);
  const task = await prisma.task.create({
    data: {
      type: data.type,
      status: data.status,
      assignedToId: data.assignedToId || null,
      createdById: req.auth!.userId,
      warehouse: data.warehouse?.trim() || null,
      priority: data.priority,
      reference: data.reference?.trim() || null,
      notes: data.notes?.trim() || null
    },
    include: {
      assignedTo: { select: { id: true, fullName: true } },
      createdBy: { select: { id: true, fullName: true } }
    }
  });
  res.status(201).json(task);
});

tasksRouter.patch("/:id/status", requireRole(["ADMIN", "SUPERVISOR", "OPERATOR"]), async (req, res) => {
  const id = z.string().min(1).parse(req.params.id);
  const body = z
    .object({
      status: z.enum(["PENDING", "ASSIGNED", "IN_PROGRESS", "COMPLETED", "REJECTED", "CANCELLED"])
    })
    .parse(req.body);

  const existing = await prisma.task.findUnique({ where: { id } });
  if (!existing) {
    throw new HttpError(404, "Tarea no encontrada.");
  }

  if (req.auth!.role === "OPERATOR" && existing.assignedToId !== req.auth!.userId) {
    throw new HttpError(403, "Solo puedes actualizar tareas asignadas a ti.");
  }

  const task = await prisma.task.update({
    where: { id },
    data: { status: body.status }
  });
  res.json(task);
});

export { tasksRouter };
