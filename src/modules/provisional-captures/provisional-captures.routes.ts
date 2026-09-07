import { Router } from "express";
import { z } from "zod";
import { requireAuth, requireRole } from "../../middlewares/auth.middleware.js";
import {
  requireNonClient,
  requireOperationalClient
} from "../clients/client-scope.js";
import {
  PROVISIONAL_CAPTURE_STATUSES,
  PROVISIONAL_DECLARED_ACTION_IDS
} from "./provisional-capture.constants.js";
import {
  createProvisionalCapture,
  getProvisionalCapture,
  listProvisionalCaptures,
  reviewProvisionalCapture
} from "./provisional-capture.service.js";

const provisionalCapturesRouter = Router();

const readingSchema = z.object({
  raw: z.unknown().optional(),
  normalized: z.unknown().optional(),
  classification: z.unknown().optional(),
  project: z.unknown().optional()
});

const createCaptureSchema = z.object({
  declaredActionId: z.enum(PROVISIONAL_DECLARED_ACTION_IDS),
  observation: z.string().max(4000).optional(),
  readings: z.array(readingSchema).min(1),
  physicalStartedAt: z.coerce.date(),
  physicalEndedAt: z.coerce.date(),
  validateNow: z.boolean().optional(),
  executorOperatorMode: z.boolean().optional(),
  device: z.string().max(160).optional()
});

const reviewCaptureSchema = z.object({
  status: z.enum(PROVISIONAL_CAPTURE_STATUSES)
});

provisionalCapturesRouter.use(requireAuth);
provisionalCapturesRouter.use(requireOperationalClient);

provisionalCapturesRouter.get("/", async (req, res) => {
  const status = typeof req.query.status === "string" ? req.query.status : undefined;
  const mine =
    req.query.mine === "1" ||
    req.query.mine === "true" ||
    (req.auth!.role === "OPERATOR" && req.query.mine !== "0" && req.query.mine !== "false");

  const items = await listProvisionalCaptures(
    { ...req.auth!, userId: req.auth!.userId },
    { status, mine }
  );
  res.json({ items });
});

provisionalCapturesRouter.post("/", requireRole(["ADMIN", "SUPERVISOR", "OPERATOR"]), async (req, res) => {
  const body = createCaptureSchema.parse(req.body);
  const capture = await createProvisionalCapture(
    { ...req.auth!, userId: req.auth!.userId },
    body
  );
  res.status(201).json({ capture, reviewHistory: capture.reviews });
});

provisionalCapturesRouter.get("/:id", async (req, res) => {
  const id = z.string().min(1).parse(req.params.id);
  const capture = await getProvisionalCapture({ ...req.auth!, userId: req.auth!.userId }, id);
  res.json({ capture, reviewHistory: capture.reviews });
});

provisionalCapturesRouter.patch(
  "/:id/review",
  requireRole(["ADMIN", "SUPERVISOR"]),
  async (req, res) => {
    requireNonClient(req.auth!);
    const id = z.string().min(1).parse(req.params.id);
    const body = reviewCaptureSchema.parse(req.body);
    const result = await reviewProvisionalCapture(
      { ...req.auth!, userId: req.auth!.userId },
      id,
      body.status
    );
    res.json(result);
  }
);

export { provisionalCapturesRouter };
