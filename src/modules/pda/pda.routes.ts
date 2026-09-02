import { NextFunction, Request, Response, Router } from "express";
import { z } from "zod";
import { env } from "../../config/env.js";
import { HttpError } from "../../shared/http-error.js";
import {
  createPdaScannerLabGate,
  isPdaScannerLabEnabled
} from "../admin/pda-scanner-lab.feature.js";
import {
  assertPdaSameOrigin,
  requirePdaGrant,
  requirePdaReleaseReceipt,
  requirePdaScope
} from "./pda-auth.middleware.js";
import {
  exchangePdaPairingChallenge,
  PDA_COOKIE_NAME,
  PDA_GRANT_TTL_MS
} from "./pda-auth.service.js";
import {
  createPdaCaptureRun,
  getPdaRun,
  reconcilePdaRun,
  recordPdaAttempt,
  releasePdaRun,
  sealPdaRun,
  setPdaRunPaused
} from "./pda-run.service.js";

const router = Router();
const gate = createPdaScannerLabGate(isPdaScannerLabEnabled(env.ENABLE_PDA_SCANNER_LAB));
const nullableText = (max: number) => z.string().trim().max(max).nullish();
const pairingAttempts = new Map<string, { count: number; resetAt: number }>();

function pairingRateLimit(req: Request, _res: Response, next: NextFunction) {
  const key = String(req.get("cf-connecting-ip") || req.ip);
  const now = Date.now();
  if (pairingAttempts.size > 1_000) {
    for (const [candidate, bucket] of pairingAttempts) {
      if (bucket.resetAt <= now) pairingAttempts.delete(candidate);
    }
  }
  const current = pairingAttempts.get(key);
  const bucket = !current || current.resetAt <= now
    ? { count: 0, resetAt: now + 60_000 }
    : current;
  bucket.count += 1;
  pairingAttempts.set(key, bucket);
  if (bucket.count > 10) {
    throw new HttpError(429, "Demasiados intentos de emparejamiento.", "PDA_PAIRING_RATE_LIMIT");
  }
  next();
}

const pairingSchema = z.object({
  challengeId: z.string().trim().min(8).max(100),
  secret: z.string().trim().min(40).max(100)
});
const runSchema = z.object({
  deviceType: nullableText(80),
  deviceBrand: nullableText(120),
  deviceModel: nullableText(120),
  deviceOs: nullableText(160),
  readerType: nullableText(120),
  deviceMetadata: z.record(z.unknown()).nullish()
});
const attemptSchema = z.object({
  runPublicId: z.string().trim().min(8).max(100),
  clientSeq: z.number().int().positive(),
  epoch: z.number().int().positive(),
  attemptId: z.string().uuid(),
  idempotencyKey: z.string().uuid(),
  observedAt: z.coerce.date(),
  rawCode: nullableText(500),
  expectedType: z.enum(["SKU", "UBICACION", "LOTE", "SERIE_IMEI", "OTRO"]),
  captureMethod: z.enum(["CAMERA", "HID", "MANUAL", "NO_LEIDO"]),
  physicalZone: z.string().trim().min(1).max(160),
  distance: nullableText(80),
  detectionMs: z.number().int().min(0).max(3_600_000).nullish(),
  notes: nullableText(2000),
  networkMetadata: z.record(z.unknown()).nullish()
});

function context(req: Request) {
  return {
    grantId: req.pdaAuth!.grantId,
    clientId: req.pdaAuth!.clientId,
    sessionId: req.pdaAuth!.sessionId,
    createdById: req.pdaAuth!.createdById
  };
}

router.use(gate);
router.use(assertPdaSameOrigin);

router.post("/pair/exchange", pairingRateLimit, async (req, res) => {
  const body = pairingSchema.parse(req.body);
  const result = await exchangePdaPairingChallenge(body);
  res.cookie(PDA_COOKIE_NAME, result.token, {
    httpOnly: true,
    secure: true,
    sameSite: "strict",
    path: "/api/pda",
    maxAge: PDA_GRANT_TTL_MS
  });
  res.setHeader("Cache-Control", "no-store");
  res.status(201).json({
    grantPublicId: result.grant.publicId,
    expiresAt: result.grant.expiresAt,
    sessionId: result.grant.sessionId,
    testId: result.testId,
    next: "/pda-scanner-lab.html"
  });
});

router.get("/runs/:runPublicId/release-status", requirePdaReleaseReceipt, async (req, res) => {
  const runPublicId = z.string().trim().min(8).max(100).parse(req.params.runPublicId);
  const run = await getPdaRun(context(req), runPublicId);
  if (run.status !== "RELEASED") {
    res.status(409).json({ status: "UNVERIFIABLE", runPublicId });
    return;
  }
  res.setHeader("Cache-Control", "no-store");
  res.json({ status: "SAFE_TO_RETURN", runPublicId, grantRevoked: true });
});

router.use(requirePdaGrant);

router.get("/status", async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.json({
    grantPublicId: req.pdaAuth!.grantPublicId,
    sessionId: req.pdaAuth!.sessionId,
    expiresAt: req.pdaAuth!.expiresAt,
    scopes: req.pdaAuth!.scopes
  });
});

router.post("/runs", requirePdaScope("pda:run"), async (req, res) => {
  const body = runSchema.parse(req.body);
  const result = await createPdaCaptureRun(context(req), {
    ...body,
    userAgent: req.get("user-agent") || null
  });
  res.setHeader("Cache-Control", "no-store");
  res.status(result.duplicate ? 200 : 201).json(result);
});

router.get("/runs/:runPublicId", requirePdaScope("pda:run"), async (req, res) => {
  const runPublicId = z.string().trim().min(8).max(100).parse(req.params.runPublicId);
  res.setHeader("Cache-Control", "no-store");
  res.json(await getPdaRun(context(req), runPublicId));
});

router.post("/readings", requirePdaScope("pda:capture"), async (req, res) => {
  const body = attemptSchema.parse(req.body);
  const result = await recordPdaAttempt(context(req), body);
  res.setHeader("Cache-Control", "no-store");
  res.status(result.duplicate ? 200 : 201).json(result);
});

router.post("/runs/:runPublicId/pause", requirePdaScope("pda:run"), async (req, res) => {
  const runPublicId = z.string().trim().min(8).max(100).parse(req.params.runPublicId);
  res.json(await setPdaRunPaused(context(req), runPublicId, true));
});

router.post("/runs/:runPublicId/resume", requirePdaScope("pda:run"), async (req, res) => {
  const runPublicId = z.string().trim().min(8).max(100).parse(req.params.runPublicId);
  res.json(await setPdaRunPaused(context(req), runPublicId, false));
});

router.post("/runs/:runPublicId/seal", requirePdaScope("pda:run"), async (req, res) => {
  const runPublicId = z.string().trim().min(8).max(100).parse(req.params.runPublicId);
  const body = z.object({ sealedThroughSeq: z.number().int().min(0).max(100_000) }).parse(req.body);
  res.json(await sealPdaRun(context(req), runPublicId, body.sealedThroughSeq));
});

router.post("/runs/:runPublicId/reconcile", requirePdaScope("pda:run"), async (req, res) => {
  const runPublicId = z.string().trim().min(8).max(100).parse(req.params.runPublicId);
  res.json(await reconcilePdaRun(context(req), runPublicId));
});

router.post("/runs/:runPublicId/release", requirePdaScope("pda:release"), async (req, res) => {
  const runPublicId = z.string().trim().min(8).max(100).parse(req.params.runPublicId);
  const result = await releasePdaRun(context(req), runPublicId);
  res.clearCookie(PDA_COOKIE_NAME, {
    httpOnly: true,
    secure: true,
    sameSite: "strict",
    path: "/api/pda"
  });
  res.setHeader("Clear-Site-Data", '"cache"');
  res.json(result);
});

export { router as pdaRouter };
