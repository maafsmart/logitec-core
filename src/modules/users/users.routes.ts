import { Router } from "express";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "../../db/prisma.js";
import { requireAuth, requireRole } from "../../middlewares/auth.middleware.js";

const usersRouter = Router();

const createUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  fullName: z.string().min(1),
  role: z.enum(["ADMIN", "OPERATOR", "CLIENT"])
});

// Crear usuario (solo ADMIN)
usersRouter.post("/", requireAuth, requireRole(["ADMIN"]), async (req, res) => {
  const { email, password, fullName, role } = createUserSchema.parse(req.body);

  const passwordHash = await bcrypt.hash(password, 10);

  const user = await prisma.user.create({
    data: {
      email,
      fullName,
      passwordHash,
      role
    }
  });

  res.json(user);
});

// Listar usuarios (solo ADMIN)
usersRouter.get("/", requireAuth, requireRole(["ADMIN"]), async (req, res) => {
  const users = await prisma.user.findMany({
    select: {
      id: true,
      email: true,
      fullName: true,
      role: true,
      isActive: true,
      createdAt: true
    }
  });

  res.json(users);
});

export { usersRouter };