import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../db/prisma.js";
import { requireAuth, requireRole } from "../../middlewares/auth.middleware.js";

const adminRouter = Router();

const demoResetSchema = z.object({
  confirmation: z.literal("REINICIAR LOGITEC")
});

adminRouter.use(requireAuth, requireRole(["ADMIN"]));

adminRouter.post("/demo-reset", async (req, res) => {
  demoResetSchema.parse(req.body);

  const deleted = await prisma.$transaction(async (tx) => {
    const inventoryMovements = await tx.inventoryMovement.deleteMany();
    const scanEvents = await tx.scanEvent.deleteMany();
    const activityLogs = await tx.activityLog.deleteMany();
    const inventories = await tx.inventory.deleteMany();
    const inventoryStocks = await tx.inventoryStock.deleteMany();
    const incidents = await tx.incident.deleteMany();
    const tasks = await tx.task.deleteMany();
    const products = await tx.product.deleteMany();
    const customers = await tx.customer.deleteMany();
    const locations = await tx.location.deleteMany();

    return {
      inventoryMovements: inventoryMovements.count,
      scanEvents: scanEvents.count,
      activityLogs: activityLogs.count,
      inventories: inventories.count,
      inventoryStocks: inventoryStocks.count,
      incidents: incidents.count,
      tasks: tasks.count,
      products: products.count,
      customers: customers.count,
      locations: locations.count
    };
  });

  res.json({
    message: "Datos de demo reiniciados.",
    deleted
  });
});

export { adminRouter };
