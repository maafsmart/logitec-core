import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../db/prisma.js";
import { requireAuth, requireRole } from "../../middlewares/auth.middleware.js";

const catalogRouter = Router();

const createProductSchema = z.object({
  sku: z.string().min(1).max(80),
  barcode: z.string().min(1).max(120).optional(),
  name: z.string().min(1).max(160),
  warehouse: z.string().min(1).max(80).default("TULTITLAN24")
});

const createClientSchema = z.object({
  name: z.string().min(1).max(160),
  email: z.string().email().optional()
});

catalogRouter.use(requireAuth);

catalogRouter.get("/products", async (_req, res) => {
  const products = await prisma.product.findMany({
    orderBy: { createdAt: "desc" },
    take: 200
  });
  res.json(products);
});

catalogRouter.post("/products", requireRole(["ADMIN"]), async (req, res) => {
  const data = createProductSchema.parse(req.body);
  const product = await prisma.product.create({
    data: {
      sku: data.sku.trim(),
      barcode: data.barcode?.trim() || null,
      name: data.name.trim(),
      warehouse: data.warehouse.trim()
    }
  });
  res.status(201).json(product);
});

catalogRouter.get("/clients", async (_req, res) => {
  const clients = await prisma.client.findMany({
    orderBy: { createdAt: "desc" },
    take: 200
  });
  res.json(clients);
});

catalogRouter.post("/clients", requireRole(["ADMIN"]), async (req, res) => {
  const data = createClientSchema.parse(req.body);
  const client = await prisma.client.create({
    data: {
      name: data.name.trim(),
      email: data.email?.trim() || null
    }
  });
  res.status(201).json(client);
});

export { catalogRouter };
