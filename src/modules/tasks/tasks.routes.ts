import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../db/prisma.js";
import { requireAuth, requireRole } from "../../middlewares/auth.middleware.js";
import { HttpError } from "../../shared/http-error.js";

const tasksRouter = Router();

const taskStatusEnum = z.enum(["PENDING", "ASSIGNED", "IN_PROGRESS", "COMPLETED", "REJECTED", "CANCELLED"]);
const taskTypeEnum = z.enum(["PICK", "RECEIVE", "MOVE", "ADJUSTMENT", "COUNT"]);

const createTaskSchema = z.object({
  type: taskTypeEnum,
  status: taskStatusEnum.default("PENDING"),
  assignedToId: z.string().optional(),
  warehouse: z.string().max(80).optional(),
  priority: z.coerce.number().int().min(0).max(100).default(0),
  reference: z.string().max(200).optional(),
  notes: z.string().max(10000).optional()
});

const updateTaskSchema = z.object({
  assignedToId: z.string().nullable().optional(),
  notes: z.string().max(10000).optional(),
  status: taskStatusEnum.optional(),
  priority: z.coerce.number().int().min(0).max(100).optional(),
  reference: z.string().max(200).optional(),
  warehouse: z.string().max(80).optional()
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

tasksRouter.post("/", requireRole(["ADMIN", "SUPERVISOR", "OPERATOR"]), async (req, res) => {
  const data = createTaskSchema.parse(req.body);
  const role = req.auth!.role;
  const userId = req.auth!.userId;

  let assignedToId = data.assignedToId || null;
  if (role === "OPERATOR") {
    // OPERADOR solo puede asignarse a sí mismo (o dejar sin asignar).
    if (assignedToId && assignedToId !== userId) {
      throw new HttpError(403, "No puedes asignar tareas a otros usuarios.");
    }
  }

  let status = data.status;
  if (assignedToId && status === "PENDING") {
    status = "ASSIGNED";
  }

  const task = await prisma.task.create({
    data: {
      type: data.type,
      status,
      assignedToId,
      createdById: userId,
      warehouse: data.warehouse?.trim() || null,
      priority: data.priority,
      reference: data.reference?.trim() || null,
      notes: data.notes?.trim() || null
    },
    include: {
      assignedTo: { select: { id: true, fullName: true, email: true } },
      createdBy: { select: { id: true, fullName: true, email: true } }
    }
  });
  res.status(201).json(task);
});

/** Claim / reasignación / actualización de notes sin migraciones. */
tasksRouter.patch("/:id", requireRole(["ADMIN", "SUPERVISOR", "OPERATOR"]), async (req, res) => {
  const id = z.string().min(1).parse(req.params.id);
  const body = updateTaskSchema.parse(req.body);
  const role = req.auth!.role;
  const userId = req.auth!.userId;

  const existing = await prisma.task.findUnique({ where: { id } });
  if (!existing) {
    throw new HttpError(404, "Tarea no encontrada.");
  }

  if (role === "OPERATOR") {
    const isOwner = existing.assignedToId === userId || existing.createdById === userId;
    const claimingUnassigned =
      body.assignedToId === userId && !existing.assignedToId && body.assignedToId != null;

    if (!isOwner && !claimingUnassigned) {
      throw new HttpError(403, "Solo puedes actualizar tareas asignadas a ti o creadas por ti.");
    }
    if (body.assignedToId != null && body.assignedToId !== userId) {
      throw new HttpError(403, "No puedes asignar tareas a otros usuarios.");
    }
    if (body.status === "CANCELLED" || body.status === "REJECTED") {
      throw new HttpError(403, "No puedes cancelar o rechazar tareas.");
    }
  }

  const data: {
    assignedToId?: string | null;
    notes?: string | null;
    status?: string;
    priority?: number;
    reference?: string | null;
    warehouse?: string | null;
  } = {};

  if (body.assignedToId !== undefined) {
    data.assignedToId = body.assignedToId;
    if (body.assignedToId && (!body.status || body.status === "PENDING")) {
      data.status = "ASSIGNED";
    }
  }
  if (body.notes !== undefined) data.notes = body.notes.trim() || null;
  if (body.status !== undefined) data.status = body.status;
  if (body.priority !== undefined) data.priority = body.priority;
  if (body.reference !== undefined) data.reference = body.reference.trim() || null;
  if (body.warehouse !== undefined) data.warehouse = body.warehouse.trim() || null;

  const task = await prisma.task.update({
    where: { id },
    data,
    include: {
      assignedTo: { select: { id: true, fullName: true, email: true } },
      createdBy: { select: { id: true, fullName: true, email: true } }
    }
  });
  res.json(task);
});

tasksRouter.patch("/:id/status", requireRole(["ADMIN", "SUPERVISOR", "OPERATOR"]), async (req, res) => {
  const id = z.string().min(1).parse(req.params.id);
  const body = z
    .object({
      status: taskStatusEnum
    })
    .parse(req.body);

  const existing = await prisma.task.findUnique({ where: { id } });
  if (!existing) {
    throw new HttpError(404, "Tarea no encontrada.");
  }

  if (req.auth!.role === "OPERATOR") {
    if (existing.assignedToId !== req.auth!.userId) {
      throw new HttpError(403, "Solo puedes actualizar tareas asignadas a ti.");
    }
    if (body.status === "CANCELLED" || body.status === "REJECTED") {
      throw new HttpError(403, "No puedes cancelar o rechazar tareas.");
    }
  }

  const task = await prisma.task.update({
    where: { id },
    data: { status: body.status },
    include: {
      assignedTo: { select: { id: true, fullName: true, email: true } },
      createdBy: { select: { id: true, fullName: true, email: true } }
    }
  });
  res.json(task);
});

export { tasksRouter };
