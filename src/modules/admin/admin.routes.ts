import { NextFunction, Request, Response, Router } from "express";
import { z } from "zod";
import { requireAuth, requireRole } from "../../middlewares/auth.middleware.js";
import { requireOperationalClient } from "../clients/client-scope.js";
import { assertLabResetAvailable, executeLabReset, previewLabReset } from "./lab-reset.service.js";
import {
  executeOperationalHistoryCleanup,
  previewOperationalHistoryCleanup
} from "./operational-history.service.js";

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

adminRouter.get(
  "/operational-history/preview",
  requireAuth,
  requireRole(["ADMIN"]),
  requireOperationalClient,
  async (req, res) => {
    const preview = await previewOperationalHistoryCleanup({
      clientId: req.auth!.operationalClientId!
    });
    res.json(preview);
  }
);

adminRouter.post(
  "/operational-history/cleanup",
  requireAuth,
  requireRole(["ADMIN"]),
  requireOperationalClient,
  async (req, res) => {
    const result = await executeOperationalHistoryCleanup(
      {
        userId: req.auth!.userId,
        clientId: req.auth!.operationalClientId!
      },
      req.body ?? {}
    );
    res.json(result);
  }
);

export { adminRouter };
