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

authRouter.post("/login", async (req, res) => {
  const { email, password } = loginSchema.parse(req.body);

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

export const allowedRoles = ["ADMIN", "OPERATOR", "CLIENT"];
export { authRouter };