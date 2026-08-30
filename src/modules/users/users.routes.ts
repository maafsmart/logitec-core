import { Router } from "express";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "../../db/prisma.js";
import { requireAuth, requireRole } from "../../middlewares/auth.middleware.js";
import { HttpError } from "../../shared/http-error.js";
import {
  generateTemporaryPassword,
  profileDataFromParsed,
  publicUserJson,
  USER_PUBLIC_SELECT,
  userProfileSchema
} from "./user-profile.js";

const usersRouter = Router();

const createUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  fullName: z.string().min(1),
  role: z.enum(["ADMIN", "OPERATOR", "SUPERVISOR", "CLIENT"]),
  clientId: z.string().min(1).nullable().optional()
}).merge(userProfileSchema);

const updateUserSchema = z.object({
  email: z.string().email().optional(),
  fullName: z.string().min(1).optional(),
  role: z.enum(["ADMIN", "OPERATOR", "SUPERVISOR", "CLIENT"]).optional(),
  clientId: z.string().min(1).nullable().optional(),
  isActive: z.coerce.boolean().optional()
}).merge(userProfileSchema);

const resetPasswordSchema = z.object({
  newPassword: z.preprocess(
    (value) => (typeof value === "string" ? value.trim() : value),
    z.string().min(6).max(128).optional()
  )
});

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
      clientId,
      ...profileDataFromParsed(parsed)
    },
    select: USER_PUBLIC_SELECT
  });

  res.json(publicUserJson(user));
});

// Listar usuarios (solo ADMIN)
usersRouter.get("/", requireAuth, requireRole(["ADMIN"]), async (_req, res) => {
  const users = await prisma.user.findMany({
    orderBy: { createdAt: "desc" },
    select: USER_PUBLIC_SELECT
  });

  res.json(users.map((user) => publicUserJson(user)));
});

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

usersRouter.post("/:id/reset-password", requireAuth, requireRole(["ADMIN"]), async (req, res) => {
  const id = z.string().min(1).parse(req.params.id);
  const body = resetPasswordSchema.parse(req.body ?? {});
  const existing = await prisma.user.findUnique({
    where: { id },
    select: { id: true, email: true, isActive: true, fullName: true }
  });
  if (!existing) {
    throw new HttpError(404, "Usuario no encontrado.");
  }

  const requestedPassword = typeof body.newPassword === "string" ? body.newPassword : undefined;
  const temporaryPassword = requestedPassword ?? generateTemporaryPassword();
  const passwordHash = await bcrypt.hash(temporaryPassword, 10);
  await prisma.user.update({
    where: { id },
    data: {
      passwordHash,
      mustChangePassword: true
    }
  });

  res.json({
    id: existing.id,
    email: existing.email,
    fullName: existing.fullName,
    isActive: existing.isActive,
    temporaryPassword,
    mustChangePassword: true,
    shownOnce: true,
    message: "Contraseña temporal asignada. Se muestra solo ahora; no se puede volver a leer."
  });
});

usersRouter.patch("/:id", requireAuth, requireRole(["ADMIN"]), async (req, res) => {
  const id = z.string().min(1).parse(req.params.id);
  if ("password" in (req.body || {}) || "passwordHash" in (req.body || {})) {
    throw new HttpError(400, "Usa Restablecer contraseña. No se acepta passwordHash ni lectura de la actual.", "USE_PASSWORD_RESET");
  }
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
      isActive: data.isActive,
      ...profileDataFromParsed(data)
    },
    select: USER_PUBLIC_SELECT
  });
  res.json(publicUserJson(user));
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

  res.json({ message: "Usuario desactivado.", id, isActive: false });
});

export { usersRouter };
