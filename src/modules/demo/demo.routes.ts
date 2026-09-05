import { Router, type NextFunction, type Request, type Response } from "express";
import { requireAuth, requireRole } from "../../middlewares/auth.middleware.js";
import { loadDemoInventoryFromExcel } from "./demo-inventory-excel.service.js";
import {
  demoInventoryExcelPath,
  demoInventoryExcelSheetName,
  isLogitecSimplePreviewEnabled
} from "./logitec-simple-preview.feature.js";

const demoRouter = Router();

function gate(_req: Request, res: Response, next: NextFunction) {
  if (!isLogitecSimplePreviewEnabled()) {
    res.status(404).json({ message: "Not Found" });
    return;
  }
  next();
}

demoRouter.use(gate);

demoRouter.get(
  "/inventory-from-excel",
  requireAuth,
  requireRole(["ADMIN", "SUPERVISOR", "OPERATOR", "CLIENT"]),
  (_req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const configuredPath = demoInventoryExcelPath();
    if (!configuredPath) {
      res.status(503).json({
        available: false,
        message: "Excel de demo no configurado en servidor."
      });
      return;
    }

    try {
      const payload = loadDemoInventoryFromExcel(configuredPath, demoInventoryExcelSheetName());
      res.json(payload);
    } catch (error) {
      const code = error instanceof Error ? error.message : "DEMO_EXCEL_READ_FAILED";
      res.status(503).json({
        available: false,
        message: "No se pudo leer el Excel configurado para la demo.",
        code
      });
    }
  }
);

export { demoRouter };
