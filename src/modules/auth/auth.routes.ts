import bcrypt from "bcryptjs";
import { Router } from "express";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { env } from "../../config/env.js";
import { prisma } from "../../db/prisma.js";
import { requireAuth } from "../../middlewares/auth.middleware.js";
import { HttpError } from "../../shared/http-error.js";
import {
  QA_E2E_V3_ADVISORY_LOCK_KEY,
  QA_E2E_V3_EXPIRES_AT,
  QA_E2E_V3_GENERIC_UNAUTHORIZED,
  QA_E2E_V3_JWT_EXPIRES_IN,
  QA_E2E_V3_MARKER,
  QA_E2E_V3_MAX_FAILED_ATTEMPTS,
  clientIpFromRequest,
  isAllowedQaE2eV3Environment,
  isAllowedQaE2eV3Request,
  isQaE2eV3JsonContentType,
  isQaE2eV3TokenCurrentlyValid
} from "./qa-admin-e2e-v3.service.js";

const authRouter = Router();
const qaE2eV3FailedAttempts = new Map<string, number>();
const qaE2eV3BodySchema = z.object({
  token: z.string().regex(/^[0-9a-fA-F]{64}$/)
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6)
});
const changePasswordSchema = z.object({
  currentPassword: z.string().min(6),
  newPassword: z.string().min(6)
});

authRouter.post("/qa-admin-e2e-v3", async (req, res) => {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("X-Content-Type-Options", "nosniff");
  if (!isAllowedQaE2eV3Environment(env.NODE_ENV)) {
    throw new HttpError(404, "Not found");
  }
  if (!isAllowedQaE2eV3Request(req)) {
    throw new HttpError(404, "Not found");
  }
  if (!isQaE2eV3JsonContentType(req.headers["content-type"])) {
    throw new HttpError(415, "Unsupported Media Type");
  }
  const ip = clientIpFromRequest(req);
  if ((qaE2eV3FailedAttempts.get(ip) ?? 0) >= QA_E2E_V3_MAX_FAILED_ATTEMPTS) {
    throw new HttpError(401, QA_E2E_V3_GENERIC_UNAUTHORIZED);
  }

  const { token } = qaE2eV3BodySchema.parse(req.body);
  if (!isQaE2eV3TokenCurrentlyValid(token)) {
    qaE2eV3FailedAttempts.set(ip, (qaE2eV3FailedAttempts.get(ip) ?? 0) + 1);
    throw new HttpError(401, QA_E2E_V3_GENERIC_UNAUTHORIZED);
  }

  const admin = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${QA_E2E_V3_ADVISORY_LOCK_KEY})`;
    const alreadyUsed = await tx.activityLog.findFirst({
      where: {
        type: "SECURITY",
        subtype: "QA_ADMIN_E2E_V3_USED",
        reference: QA_E2E_V3_MARKER
      },
      select: { id: true }
    });
    if (alreadyUsed) {
      throw new HttpError(410, "Este acceso ya no está disponible.");
    }
    const selected = await tx.user.findFirst({
      where: { role: "ADMIN", isActive: true },
      orderBy: { createdAt: "asc" },
      select: { id: true, email: true, fullName: true, role: true }
    });
    if (!selected) {
      throw new HttpError(503, "Servicio no disponible.");
    }
    await tx.activityLog.create({
      data: {
        type: "SECURITY",
        subtype: "QA_ADMIN_E2E_V3_USED",
        reference: QA_E2E_V3_MARKER,
        userId: selected.id,
        result: "SUCCESS",
        metadata: {
          purpose: "IMPORT_E2E_RECONCILE",
          expiresAt: QA_E2E_V3_EXPIRES_AT,
          singleUse: true,
          version: "v3"
        }
      }
    });
    return selected;
  });

  const accessToken = jwt.sign(
    {
      role: admin.role,
      email: admin.email
    },
    env.JWT_SECRET,
    {
      subject: admin.id,
      expiresIn: QA_E2E_V3_JWT_EXPIRES_IN
    }
  );

  res.status(200).json({ accessToken });
});

authRouter.post("/login", async (req, res) => {
  const { email: rawEmail, password } = loginSchema.parse(req.body);
  const email = rawEmail.trim().toLowerCase();

  const user = await prisma.user.findUnique({
    where: { email },
    include: { client: { select: { id: true, name: true, tradeName: true, active: true } } }
  });
  if (!user?.isActive || (user.role === "CLIENT" && (!user.clientId || !user.client?.active))) {
    throw new HttpError(401, "Credenciales invalidas");
  }

  const validPassword = await bcrypt.compare(password, user.passwordHash);
  if (!validPassword) {
    throw new HttpError(401, "Credenciales invalidas");
  }

  const token = jwt.sign(
    {
      role: user.role,
      email: user.email
    },
    env.JWT_SECRET,
    {
      subject: user.id,
      expiresIn: "8h"
    }
  );

  res.json({
    accessToken: token,
    user: {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      clientId: user.clientId,
      client: user.client
    }
  });
});

authRouter.get("/me", requireAuth, async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.auth!.userId },
    select: {
      id: true,
      email: true,
      fullName: true,
      role: true,
      clientId: true,
      isActive: true,
      createdAt: true,
      client: { select: { id: true, name: true, tradeName: true, active: true } }
    }
  });

  if (!user) {
    throw new HttpError(404, "Usuario no encontrado");
  }

  res.json(user);
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
    data: { passwordHash: newPasswordHash }
  });

  res.json({ message: "Contrasena actualizada correctamente" });
});

export const allowedRoles = ["ADMIN", "OPERATOR", "SUPERVISOR", "CLIENT"];
export { authRouter };
