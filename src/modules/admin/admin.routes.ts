import { NextFunction, Request, Response, Router } from "express";
import { z } from "zod";
import { requireAuth, requireRole } from "../../middlewares/auth.middleware.js";
import { assertLabResetAvailable, executeLabReset, previewLabReset } from "./lab-reset.service.js";

const adminRouter = Router();

const labResetSchema = z.object({
  confirmed: z.literal(true)
});

function hideLabResetInProduction(_req: Request, _res: Response, next: NextFunction) {
  try {
    assertLabResetAvailable();
    next();
  } catch (error) {
    next(error);
  }
}

adminRouter.get("/lab-reset", hideLabResetInProduction, requireAuth, requireRole(["ADMIN"]), async (_req, res) => {
  const preview = await previewLabReset();
  res.json(preview);
});

adminRouter.post("/lab-reset", hideLabResetInProduction, requireAuth, requireRole(["ADMIN"]), async (req, res) => {
  labResetSchema.parse(req.body);
  const result = await executeLabReset(req.auth!.userId);
  res.json(result);
});

export { adminRouter };
