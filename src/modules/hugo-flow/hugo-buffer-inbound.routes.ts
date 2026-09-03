import express, { Router } from "express";
import { requireAuth, requireRole } from "../../middlewares/auth.middleware.js";
import { requireOperationalClient } from "../clients/client-scope.js";
import {
  hugoBufferInboundPreferences,
  isHugoBufferInboundEnabled
} from "./hugo-buffer-inbound.feature.js";

const hugoBufferInboundRouter = Router();

function gate(_req: express.Request, res: express.Response, next: express.NextFunction) {
  if (!isHugoBufferInboundEnabled()) {
    res.status(404).json({ message: "Not Found" });
    return;
  }
  next();
}

hugoBufferInboundRouter.use(gate);

hugoBufferInboundRouter.get(
  "/bootstrap",
  requireAuth,
  requireRole(["ADMIN", "SUPERVISOR", "OPERATOR"]),
  requireOperationalClient,
  (_req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.json({
      ok: true,
      devOnly: true,
      flow: "buffer-inbound",
      ...hugoBufferInboundPreferences()
    });
  }
);

export { hugoBufferInboundRouter, isHugoBufferInboundEnabled };
