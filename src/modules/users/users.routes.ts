import { Router } from "express";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "../../db/prisma.js";
import { requireAuth, requireRole } from "../../middlewares/auth.middleware.js";
import { HttpError } from "../../shared/http-error.js";

const usersRouter = Router();

const createUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  fullName: z.string().min(1),
  role: z.enum(["ADMIN", "OPERATOR", "SUPERVISOR", "CLIENT"]),
  clientId: z.string().min(1).nullable().optional()
});

const updateUserSchema = z.object({
  email: z.string().email().optional(),
  fullName: z.string().min(1).optional(),
  role: z.enum(["ADMIN", "OPERATOR", "SUPERVISOR", "CLIENT"]).optional(),
  clientId: z.string().min(1).nullable().optional(),
  isActive: z.coerce.boolean().optional()
});

const userSelect = {
  id: true,
  email: true,
  fullName: true,
  role: true,
  clientId: true,
  isActive: true,
  createdAt: true,
  client: { select: { id: true, name: true, tradeName: true, active: true } }
} as const;

async function resolveClientId(role: string, clientId: string | null | undefined): Promise<string | null> {
  if (role === "ADMIN") {
    const id = clientId?.trim();
    if (!id) return null;
    const client = await prisma.client.findUnique({ where: { id }, select: { id: true, active: true } });
    if (!client?.active) {
      throw new HttpError(400, "El cliente asignado no existe o está inactivo.");
    }
    return client.id;
  }
  const id = clientId?.trim();
  if (!id) {
    throw new HttpError(400, `Los usuarios ${role} requieren un cliente asignado.`, "USER_CLIENT_REQUIRED");
  }
  const client = await prisma.client.findUnique({ where: { id }, select: { id: true, active: true } });
  if (!client?.active) {
    throw new HttpError(400, "El cliente asignado no existe o está inactivo.");
  }
  return client.id;
}

// Crear usuario (solo ADMIN)
usersRouter.post("/", requireAuth, requireRole(["ADMIN"]), async (req, res) => {
  const parsed = createUserSchema.parse(req.body);
  const email = parsed.email.trim().toLowerCase();
  const { password, fullName, role } = parsed;
  const clientId = await resolveClientId(role, parsed.clientId);

  const passwordHash = await bcrypt.hash(password, 10);

  const user = await prisma.user.create({
    data: {
      email,
      fullName,
      passwordHash,
      role,
      clientId
    },
    select: userSelect
  });

  res.json(user);
});

// Listar usuarios (solo ADMIN)
usersRouter.get("/", requireAuth, requireRole(["ADMIN"]), async (req, res) => {
  const users = await prisma.user.findMany({
    orderBy: { createdAt: "desc" },
    select: userSelect
  });

  res.json(users);
});

usersRouter.patch("/:id", requireAuth, requireRole(["ADMIN"]), async (req, res) => {
  const id = z.string().min(1).parse(req.params.id);
  const data = updateUserSchema.parse(req.body);
  const existing = await prisma.user.findUnique({ where: { id } });
  if (!existing) {
    throw new HttpError(404, "Usuario no encontrado.");
  }

  const role = data.role ?? existing.role;
  const requestedClientId = data.clientId !== undefined ? data.clientId : existing.clientId;
  const clientId = await resolveClientId(role, requestedClientId);
  const user = await prisma.user.update({
    where: { id },
    data: {
      email: data.email?.trim().toLowerCase(),
      fullName: data.fullName?.trim(),
      role,
      clientId,
      isActive: data.isActive
    },
    select: userSelect
  });
  res.json(user);
});

// Responsables para asignación de tareas (ADMIN / SUPERVISOR)
// Listado mínimo: no expone passwordHash ni abre CRUD completo.
usersRouter.get("/assignees", requireAuth, requireRole(["ADMIN", "SUPERVISOR"]), async (req, res) => {
  const scopeClientId = req.auth!.role === "SUPERVISOR" ? req.auth!.clientId : req.auth!.operationalClientId;
  const users = await prisma.user.findMany({
    where: {
      isActive: true,
      role: { in: ["ADMIN", "SUPERVISOR", "OPERATOR"] },
      ...(scopeClientId
        ? { OR: [{ clientId: scopeClientId }, { role: "ADMIN" }] }
        : req.auth!.role === "ADMIN"
          ? {}
          : { id: { in: [] } })
    },
    orderBy: [{ role: "asc" }, { fullName: "asc" }],
    select: {
      id: true,
      fullName: true,
      email: true,
      role: true,
      isActive: true
    }
  });

  res.json(users);
});

// Desactivar usuario (solo ADMIN; borrado logico para no romper escaneos/comentarios)
usersRouter.delete("/:id", requireAuth, requireRole(["ADMIN"]), async (req, res) => {
  const id = z.string().min(1).parse(req.params.id);
  if (id === req.auth!.userId) {
    res.status(400).json({ message: "No puedes desactivar tu propia cuenta desde aqui." });
    return;
  }

  const existing = await prisma.user.findUnique({ where: { id } });
  if (!existing) {
    res.status(404).json({ message: "Usuario no encontrado." });
    return;
  }

  await prisma.user.update({
    where: { id },
    data: { isActive: false }
  });

  res.json({ message: "Usuario desactivado.", id });
});

export { usersRouter };