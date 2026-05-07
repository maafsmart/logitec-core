import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../db/prisma.js";
import { requireAuth, requireRole } from "../../middlewares/auth.middleware.js";

const pickingRouter = Router();

const scanSchema = z.object({
  code: z.string().min(1).max(120)
});

pickingRouter.use(requireAuth, requireRole(["ADMIN", "OPERATOR"]));

pickingRouter.post("/scan", async (req, res) => {
  const { code } = scanSchema.parse(req.body);
  const normalizedCode = code.trim();

  const product = await prisma.product.findFirst({
    where: {
      active: true,
      OR: [{ sku: normalizedCode }, { barcode: normalizedCode }]
    },
    select: {
      id: true,
      sku: true,
      barcode: true,
      name: true,
      warehouse: true
    }
  });

  const result = product ? "OK" : "ERROR";
  const scanEvent = await prisma.scanEvent.create({
    data: {
      scannedCode: normalizedCode,
      result,
      userId: req.auth!.userId,
      productId: product?.id
    },
    select: {
      id: true,
      result: true,
      scannedCode: true,
      createdAt: true
    }
  });

  if (!product) {
    res.status(404).json({
      message: "Producto no existe",
      scanEvent
    });
    return;
  }

  res.json({
    message: "Producto encontrado",
    product,
    scanEvent
  });
});

pickingRouter.get("/scans", async (req, res) => {
  const scans = await prisma.scanEvent.findMany({
    where: { userId: req.auth!.userId },
    orderBy: { createdAt: "desc" },
    take: 20,
    include: {
      product: {
        select: {
          sku: true,
          name: true
        }
      }
    }
  });

  res.json(scans);
});

export { pickingRouter };
