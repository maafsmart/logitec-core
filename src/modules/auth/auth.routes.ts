import bcrypt from "bcryptjs";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../db/prisma.js";
import { requireAuth, requireRole, signAccessToken } from "../../middlewares/auth.middleware.js";
import { HttpError } from "../../shared/http-error.js";
import { isClientScopedRole } from "../clients/client-scope.js";
import { isForbiddenInventoryProjectRecord } from "../inventory/inventory-project-rules.js";
import {
  profileDataFromParsed,
  publicUserJson,
  selfProfileSchema,
  USER_PUBLIC_SELECT
} from "../users/user-profile.js";

const authRouter = Router();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6)
});
const changePasswordSchema = z.object({
  currentPassword: z.string().min(6),
  newPassword: z.string().min(6)
});
const selectClientSchema = z.object({
  clientId: z.string().min(1)
});

const clientPublicSelect = {
  id: true,
  code: true,
  name: true,
  tradeName: true,
  legalName: true,
  active: true
} as const;

function serializeUser(
  user: {
    id: string;
    email: string;
    fullName: string;
    role: string;
    clientId: string | null;
    isActive?: boolean;
    mustChangePassword?: boolean;
    phone?: string | null;
    alternatePhone?: string | null;
    address?: string | null;
    city?: string | null;
    state?: string | null;
    postalCode?: string | null;
    jobTitle?: string | null;
    notes?: string | null;
    avatarUrl?: string | null;
    client: {
      id: string;
      code?: string;
      name: string;
      tradeName: string | null;
      legalName?: string | null;
      active: boolean;
    } | null;
  },
  operationalClient: {
    id: string;
    code: string;
    name: string;
    tradeName: string | null;
    legalName: string | null;
    active: boolean;
  } | null
) {
  return publicUserJson({
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    role: user.role,
    clientId: user.clientId,
    isActive: user.isActive !== false,
    mustChangePassword: Boolean(user.mustChangePassword),
    phone: user.phone ?? null,
    alternatePhone: user.alternatePhone ?? null,
    address: user.address ?? null,
    city: user.city ?? null,
    state: user.state ?? null,
    postalCode: user.postalCode ?? null,
    jobTitle: user.jobTitle ?? null,
    notes: user.notes ?? null,
    avatarUrl: user.avatarUrl ?? null,
    client: user.client,
    operationalClientId: operationalClient?.id ?? null,
    operationalClient
  });
}

authRouter.post("/login", async (req, res) => {
  const { email: rawEmail, password } = loginSchema.parse(req.body);
  const email = rawEmail.trim().toLowerCase();

  const user = await prisma.user.findUnique({
    where: { email },
    include: { client: { select: clientPublicSelect } }
  });
  if (!user?.isActive) {
    throw new HttpError(401, "Credenciales invalidas");
  }

  const validPassword = await bcrypt.compare(password, user.passwordHash);
  if (!validPassword) {
    throw new HttpError(401, "Credenciales invalidas");
  }

  if (isClientScopedRole(user.role) && (!user.clientId || !user.client?.active)) {
    throw new HttpError(403, "El usuario no tiene un cliente activo asignado.", "USER_CLIENT_REQUIRED");
  }

  const operationalClient = isClientScopedRole(user.role) ? user.client : null;
  const accessToken = signAccessToken({
    userId: user.id,
    role: user.role as "ADMIN" | "OPERATOR" | "SUPERVISOR" | "CLIENT",
    email: user.email,
    operationalClientId: isClientScopedRole(user.role) ? operationalClient?.id ?? null : null
  });

  res.json({
    accessToken,
    user: serializeUser(user, operationalClient)
  });
});

authRouter.get("/me", requireAuth, async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.auth!.userId },
    select: {
      ...USER_PUBLIC_SELECT,
      client: { select: clientPublicSelect }
    }
  });

  if (!user) {
    throw new HttpError(404, "Usuario no encontrado");
  }

  let operationalClient = null;
  if (req.auth!.operationalClientId) {
    operationalClient = await prisma.client.findUnique({
      where: { id: req.auth!.operationalClientId },
      select: clientPublicSelect
    });
  } else if (isClientScopedRole(user.role)) {
    operationalClient = user.client;
  }

  res.json({
    ...serializeUser(user, operationalClient),
    operationalClientInvalid: Boolean(req.auth!.operationalClientInvalid)
  });
});

authRouter.patch("/me", requireAuth, async (req, res) => {
  const parsed = selfProfileSchema.parse(req.body ?? {});
  if (
    "role" in (req.body || {}) ||
    "clientId" in (req.body || {}) ||
    "isActive" in (req.body || {}) ||
    "email" in (req.body || {}) ||
    "password" in (req.body || {}) ||
    "passwordHash" in (req.body || {}) ||
    "mustChangePassword" in (req.body || {})
  ) {
    throw new HttpError(403, "No puedes cambiar rol, cliente, permisos ni credenciales desde Mi cuenta.", "SELF_ESCALATION_FORBIDDEN");
  }

  const user = await prisma.user.update({
    where: { id: req.auth!.userId },
    data: {
      ...profileDataFromParsed(parsed),
      ...(typeof parsed.fullName === "string" && parsed.fullName ? { fullName: parsed.fullName } : {})
    },
    select: {
      ...USER_PUBLIC_SELECT,
      client: { select: clientPublicSelect }
    }
  });

  let operationalClient = null;
  if (req.auth!.operationalClientId) {
    operationalClient = await prisma.client.findUnique({
      where: { id: req.auth!.operationalClientId },
      select: clientPublicSelect
    });
  } else if (isClientScopedRole(user.role)) {
    operationalClient = user.client;
  }

  res.json(serializeUser(user, operationalClient));
});

authRouter.post("/select-client", requireAuth, requireRole(["ADMIN"]), async (req, res) => {
  const { clientId } = selectClientSchema.parse(req.body);
  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: { ...clientPublicSelect, _count: { select: { projects: true } } }
  });
  if (!client || isForbiddenInventoryProjectRecord({ code: client.code, name: client.name })) {
    throw new HttpError(403, "El cliente seleccionado no existe o está inactivo.", "CLIENT_CONTEXT_INVALID");
  }
  if (!client.active) {
    throw new HttpError(403, "El cliente seleccionado no existe o está inactivo.", "CLIENT_CONTEXT_INVALID");
  }
  const accessToken = signAccessToken({
    userId: req.auth!.userId,
    role: "ADMIN",
    email: req.auth!.email,
    operationalClientId: client.id
  });
  res.json({
    accessToken,
    client,
    operationalClient: {
      id: client.id,
      code: client.code,
      name: client.name,
      tradeName: client.tradeName,
      legalName: client.legalName,
      active: client.active
    }
  });
});

authRouter.post("/clear-client", requireAuth, requireRole(["ADMIN"]), async (req, res) => {
  const accessToken = signAccessToken({
    userId: req.auth!.userId,
    role: "ADMIN",
    email: req.auth!.email,
    operationalClientId: null
  });
  res.json({ accessToken, operationalClient: null, operationalClientId: null });
});

authRouter.post("/change-password", requireAuth, async (req, res) => {
  const { currentPassword, newPassword } = changePasswordSchema.parse(req.body);
  if (currentPassword === newPassword) {
    res.status(400).json({ message: "La nueva contrasena debe ser diferente a la actual" });
    return;
  }

  const user = await prisma.user.findUnique({ where: { id: req.auth!.userId } });
  if (!user || !user.isActive) {
    res.status(404).json({ message: "Usuario no encontrado" });
    return;
  }

  const validCurrentPassword = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!validCurrentPassword) {
    res.status(401).json({ message: "Contrasena actual incorrecta" });
    return;
  }

  const newPasswordHash = await bcrypt.hash(newPassword, 10);
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: newPasswordHash, mustChangePassword: false }
  });

  res.json({ message: "Contrasena actualizada correctamente", mustChangePassword: false });
});

export const allowedRoles = ["ADMIN", "OPERATOR", "SUPERVISOR", "CLIENT"];
export { authRouter };
