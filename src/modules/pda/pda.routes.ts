import { PdaCaptureMode } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { env } from "../../config/env.js";
import { prisma } from "../../db/prisma.js";
import {
  createPdaScannerLabGate,
  isPdaScannerLabEnabled
} from "../admin/pda-scanner-lab.feature.js";
import {
  requirePdaGrant,
  requirePdaSameOrigin
} from "./pda-auth.middleware.js";
import {
  assertPdaExchangeRate,
  clearPdaGrantCookie,
  exchangePdaPairing,
  pdaGrantCookie,
  pdaReleaseStatus
} from "./pda-auth.service.js";
import {
  confirmPdaRelease,
  createPdaRun,
  getPdaRun,
  preparePdaRelease,
  reconcilePdaRun,
  recordPdaRunReading,
  sealPdaRun
} from "./pda-run.service.js";
import {
  getPdaQaProgress,
  PDA_QA_STEPS,
  recordPdaQaStep
} from "./pda-remote-qa.service.js";

const pdaRouter = Router();
const gate = createPdaScannerLabGate(isPdaScannerLabEnabled(env.ENABLE_PDA_SCANNER_LAB));
const nullableText = (max: number) => z.string().trim().max(max).nullish();

const exchangeSchema = z.object({
  pairingId: z.string().trim().min(8).max(120),
  secret: z.string().trim().min(20).max(200),
  mode: z.enum(["QR", "MANUAL"])
});
const readingSchema = z.object({
  epoch: z.number().int().positive(),
  clientSeq: z.number().int().positive(),
  attemptId: z.string().trim().min(8).max(120),
  idempotencyKey: z.string().trim().min(8).max(120),
  observedAt: z.coerce.date(),
  rawCode: nullableText(500),
  expectedType: z.enum(["SKU", "UBICACION", "LOTE", "SERIE_IMEI", "OTRO"]),
  captureMode: z.nativeEnum(PdaCaptureMode),
  captureMethod: z.string().trim().min(1).max(120),
  physicalZone: z.string().trim().min(1).max(160),
  distance: nullableText(80),
  detectionMs: z.number().int().min(0).max(3_600_000).nullish(),
  notes: nullableText(2000),
  networkMetadata: z.record(z.unknown()).nullish()
});

pdaRouter.use(gate);
pdaRouter.use(requirePdaSameOrigin);
pdaRouter.use((_req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Pragma", "no-cache");
  next();
});

pdaRouter.post("/pairings/exchange", async (req, res) => {
  assertPdaExchangeRate(req.ip || req.socket.remoteAddress || "unknown");
  const result = await exchangePdaPairing(exchangeSchema.parse(req.body));
  res.setHeader("Set-Cookie", pdaGrantCookie(result.token));
  res.status(201).json({ grant: result.grant });
});

pdaRouter.post("/releases/status", async (req, res) => {
  const body = z.object({
    grantPublicId: z.string().trim().min(8).max(120),
    releaseNonce: z.string().trim().min(32).max(200)
  }).parse(req.body);
  res.json(await pdaReleaseStatus(body));
});

pdaRouter.use(requirePdaGrant);

pdaRouter.get("/context", async (req, res) => {
  const grant = req.pdaGrant!;
  const durableSession = await prisma.pdaTestSession.findFirst({
    where: { id: grant.sessionId, clientId: grant.clientId },
    select: { id: true, testId: true, status: true, captureEpoch: true }
  });
  if (!durableSession) {
    res.status(404).json({ message: "Sesión PDA no encontrada.", code: "PDA_SESSION_NOT_FOUND" });
    return;
  }
  const runs = await prisma.pdaCaptureRun.findMany({
    where: { grantId: grant.id },
    orderBy: { startedAt: "asc" },
    select: {
      id: true,
      publicId: true,
      epoch: true,
      version: true,
      status: true,
      sealedAtSeq: true,
      receivedCount: true
    }
  });
  res.json({
    grant: {
      publicId: grant.publicId,
      status: grant.status,
      expiresAt: grant.expiresAt
    },
    session: durableSession,
    runs
  });
});

pdaRouter.post("/runs", async (req, res) => {
  const body = z.object({
    clientRunKey: z.string().trim().min(8).max(120)
  }).parse(req.body);
  const result = await createPdaRun(req.pdaGrant!, body.clientRunKey);
  res.status(result.duplicate ? 200 : 201).json(result);
});

pdaRouter.get("/runs/:runId", async (req, res) => {
  const runId = z.string().trim().min(1).parse(req.params.runId);
  res.json(await getPdaRun(req.pdaGrant!, runId));
});

pdaRouter.post("/runs/:runId/readings", async (req, res) => {
  const runId = z.string().trim().min(1).parse(req.params.runId);
  const body = readingSchema.parse(req.body);
  const result = await recordPdaRunReading(req.pdaGrant!, runId, body);
  if (result.duplicate) {
    void recordPdaQaStep({
      grant: req.pdaGrant!,
      runId,
      step: "IDEMPOTENT_RETRY",
      status: "PASS",
      source: "SERVER",
      detail: "Retry confirmado sin crear otra lectura."
    }).catch(() => {});
  }
  res.status(result.duplicate ? 200 : 201).json(result);
});

pdaRouter.get("/runs/:runId/qa-progress", async (req, res) => {
  const runId = z.string().trim().min(1).parse(req.params.runId);
  res.json(await getPdaQaProgress(req.pdaGrant!, runId));
});

pdaRouter.put("/runs/:runId/qa-progress/:step", async (req, res) => {
  const params = z.object({
    runId: z.string().trim().min(1),
    step: z.enum(PDA_QA_STEPS)
  }).parse(req.params);
  const body = z.object({
    status: z.enum(["PASS", "FAIL", "NOT_APPLICABLE"]),
    detail: z.string().trim().max(240).optional(),
    hardwareClass: z.enum(["MOTOROLA_CAMERA", "HONEYWELL_INTEGRATED", "GENERIC_PDA", "EXTERNAL_SCANNER"]).optional(),
    readerType: z.string().trim().max(120).optional()
  }).parse(req.body);
  const clientPassSteps = new Set([
    "HARDWARE_IDENTIFIED",
    "NO_ADMIN_LOGIN",
    "NETWORK_RECONNECT",
    "BACKGROUND_LOCK",
    "RELOAD_CONTINUITY"
  ]);
  if (body.status === "PASS" && !clientPassSteps.has(params.step)) {
    res.status(409).json({
      message: "Este paso solo puede aprobarse con evidencia server-side.",
      code: "PDA_QA_SERVER_EVIDENCE_REQUIRED"
    });
    return;
  }
  if (body.status === "NOT_APPLICABLE" && params.step !== "HID_ENTER") {
    res.status(409).json({
      message: "Este paso es obligatorio para la prueba remota.",
      code: "PDA_QA_STEP_REQUIRED"
    });
    return;
  }
  res.json(await recordPdaQaStep({
    grant: req.pdaGrant!,
    runId: params.runId,
    step: params.step,
    status: body.status,
    source: "HUMAN",
    detail: body.detail,
    hardwareClass: body.hardwareClass,
    readerType: body.readerType
  }));
});

pdaRouter.post("/runs/:runId/seal", async (req, res) => {
  const runId = z.string().trim().min(1).parse(req.params.runId);
  const body = z.object({
    sealedAtSeq: z.number().int().min(0).max(100_000),
    expectedVersion: z.number().int().min(0).optional()
  }).parse(req.body);
  res.json(await sealPdaRun(req.pdaGrant!, runId, body.sealedAtSeq, body.expectedVersion));
});

pdaRouter.post("/runs/:runId/reconcile", async (req, res) => {
  const runId = z.string().trim().min(1).parse(req.params.runId);
  res.json(await reconcilePdaRun(req.pdaGrant!, runId));
});

pdaRouter.post("/release/prepare", async (req, res) => {
  const body = z.object({
    releaseNonce: z.string().trim().min(32).max(200)
  }).parse(req.body);
  res.json(await preparePdaRelease(req.pdaGrant!, body.releaseNonce));
});

pdaRouter.post("/release/confirm", async (req, res) => {
  const body = z.object({
    releaseNonce: z.string().trim().min(32).max(200),
    captureStoppedConfirmed: z.literal(true),
    localCleanupConfirmed: z.literal(true),
    noDownloadsConfirmed: z.literal(true)
  }).parse(req.body);
  const result = await confirmPdaRelease(req.pdaGrant!, body);
  res.setHeader("Set-Cookie", clearPdaGrantCookie());
  res.json(result);
});

export { pdaRouter };
