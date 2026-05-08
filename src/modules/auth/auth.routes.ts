import bcrypt from "bcryptjs";
import { Router } from "express";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { env } from "../../config/env.js";
import { prisma } from "../../db/prisma.js";
import { requireAuth } from "../../middlewares/auth.middleware.js";
import { HttpError } from "../../shared/http-error.js";

const authRouter = Router();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6)
});
const changePasswordSchema = z.object({
  currentPassword: z.string().min(6),
  newPassword: z.string().min(6)
});

authRouter.post("/login", async (req, res) => {
  const { email: rawEmail, password } = loginSchema.parse(req.body);
  const email = rawEmail.trim().toLowerCase();

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user?.isActive) {
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
      role: user.role
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
      isActive: true,
      createdAt: true
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

export const allowedRoles = ["ADMIN", "OPERATOR", "CLIENT"];
export { authRouter };