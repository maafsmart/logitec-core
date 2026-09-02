import { NextFunction, Request, Response, Router } from "express";
import { z } from "zod";
import { env } from "../../config/env.js";
import { requireAuth, requireRole } from "../../middlewares/auth.middleware.js";
import { requireOperationalClient } from "../clients/client-scope.js";
import { assertLabResetAvailable, executeLabReset, previewLabReset } from "./lab-reset.service.js";
import {
  executeOperationalHistoryCleanup,
  previewOperationalHistoryCleanup
} from "./operational-history.service.js";
import { classifyScannerCode } from "./pda-scanner-diagnostic.service.js";
import {
  createPdaScannerLabGate,
  isPdaScannerLabEnabled
} from "./pda-scanner-lab.feature.js";
import {
  createPdaTestSession,
  finalizePdaTestSession,
  getPdaTestSession,
  listPdaTestSessions,
  pdaSessionCsv,
  recordPdaTestReading
} from "./pda-test-evidence.service.js";

const adminRouter = Router();
const pdaScannerLabApiGate = createPdaScannerLabGate(
  isPdaScannerLabEnabled(env.ENABLE_PDA_SCANNER_LAB)
);

const labResetSchema = z.object({
  confirmed: z.literal(true)
});
const nullableText = (max: number) => z.string().trim().max(max).nullish();
const pdaSessionSchema = z.object({
  clientSessionKey: z.string().trim().min(8).max(120),
  preferredTestId: z.string().trim().regex(/^PDA-\d{8}-[A-Z0-9]{6,24}$/).optional(),
  deviceType: nullableText(80),
  deviceBrand: nullableText(120),
  deviceModel: nullableText(120),
  deviceOs: nullableText(160),
  readerType: nullableText(120),
  deviceMetadata: z.record(z.unknown()).nullish()
});
const pdaReadingSchema = z.object({
  idempotencyKey: z.string().trim().min(8).max(120),
  observedAt: z.coerce.date(),
  rawCode: nullableText(500),
  expectedType: z.enum(["SKU", "UBICACION", "LOTE", "SERIE_IMEI", "OTRO"]),
  captureMethod: z.string().trim().min(1).max(120),
  physicalZone: z.string().trim().min(1).max(160),
  distance: nullableText(80),
  detectionMs: z.number().int().min(0).max(3_600_000).nullish(),
  notes: nullableText(2000),
  networkMetadata: z.record(z.unknown()).nullish()
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

adminRouter.get(
  "/pda-scanner-diagnostic/classify",
  pdaScannerLabApiGate,
  requireAuth,
  requireRole(["ADMIN"]),
  requireOperationalClient,
  async (req, res) => {
    const query = z.object({
      code: z.string().trim().min(1).max(240)
    }).parse(req.query);
    const result = await classifyScannerCode(query.code, req.auth!.operationalClientId!);
    res.setHeader("Cache-Control", "no-store");
    res.json(result);
  }
);

adminRouter.post(
  "/pda-test-sessions",
  pdaScannerLabApiGate,
  requireAuth,
  requireRole(["ADMIN"]),
  requireOperationalClient,
  async (req, res) => {
    const body = pdaSessionSchema.parse(req.body);
    const result = await createPdaTestSession({
      ...body,
      clientId: req.auth!.operationalClientId!,
      userId: req.auth!.userId,
      userAgent: req.get("user-agent") || null
    });
    res.setHeader("Cache-Control", "no-store");
    res.status(result.duplicate ? 200 : 201).json(result);
  }
);

adminRouter.get(
  "/pda-test-sessions",
  pdaScannerLabApiGate,
  requireAuth,
  requireRole(["ADMIN"]),
  requireOperationalClient,
  async (req, res) => {
    const query = z.object({ limit: z.coerce.number().int().min(1).max(250).default(100) }).parse(req.query);
    res.setHeader("Cache-Control", "no-store");
    res.json(await listPdaTestSessions(req.auth!.operationalClientId!, query.limit));
  }
);

adminRouter.post(
  "/pda-test-sessions/:sessionId/readings",
  pdaScannerLabApiGate,
  requireAuth,
  requireRole(["ADMIN"]),
  requireOperationalClient,
  async (req, res) => {
    const sessionId = z.string().trim().min(1).parse(req.params.sessionId);
    const body = pdaReadingSchema.parse(req.body);
    const result = await recordPdaTestReading({
      clientId: req.auth!.operationalClientId!,
      userId: req.auth!.userId,
      sessionId
    }, body);
    res.setHeader("Cache-Control", "no-store");
    res.status(result.duplicate ? 200 : 201).json(result);
  }
);

adminRouter.post(
  "/pda-test-sessions/:sessionId/finalize",
  pdaScannerLabApiGate,
  requireAuth,
  requireRole(["ADMIN"]),
  requireOperationalClient,
  async (req, res) => {
    const sessionId = z.string().trim().min(1).parse(req.params.sessionId);
    res.setHeader("Cache-Control", "no-store");
    res.json(await finalizePdaTestSession(req.auth!.operationalClientId!, sessionId));
  }
);

adminRouter.get(
  "/pda-test-sessions/:testId/export.csv",
  pdaScannerLabApiGate,
  requireAuth,
  requireRole(["ADMIN"]),
  requireOperationalClient,
  async (req, res) => {
    const testId = z.string().trim().min(1).max(80).parse(req.params.testId);
    const session = await getPdaTestSession(req.auth!.operationalClientId!, testId);
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${session.testId}.csv"`);
    res.send(pdaSessionCsv(session));
  }
);

adminRouter.get(
  "/pda-test-sessions/:testId/export.json",
  pdaScannerLabApiGate,
  requireAuth,
  requireRole(["ADMIN"]),
  requireOperationalClient,
  async (req, res) => {
    const testId = z.string().trim().min(1).max(80).parse(req.params.testId);
    const session = await getPdaTestSession(req.auth!.operationalClientId!, testId);
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Content-Disposition", `attachment; filename="${session.testId}.json"`);
    res.json(session);
  }
);

adminRouter.get(
  "/pda-test-sessions/:testId",
  pdaScannerLabApiGate,
  requireAuth,
  requireRole(["ADMIN"]),
  requireOperationalClient,
  async (req, res) => {
    const testId = z.string().trim().min(1).max(80).parse(req.params.testId);
    res.setHeader("Cache-Control", "no-store");
    res.json(await getPdaTestSession(req.auth!.operationalClientId!, testId));
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
