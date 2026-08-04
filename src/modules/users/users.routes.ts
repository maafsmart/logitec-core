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
  role: z.enum(["ADMIN", "OPERATOR", "SUPERVISOR", "CLIENT"])
});

// Crear usuario (solo ADMIN)
usersRouter.post("/", requireAuth, requireRole(["ADMIN"]), async (req, res) => {
  const parsed = createUserSchema.parse(req.body);
  const email = parsed.email.trim().toLowerCase();
  const { password, fullName, role } = parsed;

  const passwordHash = await bcrypt.hash(password, 10);

  const user = await prisma.user.create({
    data: {
      email,
      fullName,
      passwordHash,
      role
    },
    select: {
      id: true,
      email: true,
      fullName: true,
      role: true,
      isActive: true,
      createdAt: true
    }
  });

  res.json(user);
});

// Listar usuarios (solo ADMIN)
usersRouter.get("/", requireAuth, requireRole(["ADMIN"]), async (req, res) => {
  const users = await prisma.user.findMany({
    orderBy: { createdAt: "desc" },
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

// Responsables para asignación de tareas (ADMIN / SUPERVISOR)
// Listado mínimo: no expone passwordHash ni abre CRUD completo.
usersRouter.get("/assignees", requireAuth, requireRole(["ADMIN", "SUPERVISOR"]), async (_req, res) => {
  const users = await prisma.user.findMany({
    where: {
      isActive: true,
      role: { in: ["ADMIN", "SUPERVISOR", "OPERATOR"] }
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