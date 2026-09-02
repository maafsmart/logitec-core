import { createHash, randomBytes } from "node:crypto";
import {
  PdaCaptureMode,
  PdaGrantStatus,
  PdaRunStatus,
  PdaSessionStatus,
  Prisma
} from "@prisma/client";
import { prisma } from "../../db/prisma.js";
import { HttpError } from "../../shared/http-error.js";
import {
  classifyScannerCode,
  type ScannerDiagnosticReader
} from "../admin/pda-scanner-diagnostic.service.js";
import {
  digestPdaSecret,
  type PdaGrantContext
} from "./pda-auth.service.js";

export type PdaAttemptInput = {
  epoch: number;
  clientSeq: number;
  attemptId: string;
  idempotencyKey: string;
  observedAt: Date;
  rawCode?: string | null;
  expectedType: string;
  captureMode: PdaCaptureMode;
  captureMethod: string;
  physicalZone: string;
  distance?: string | null;
  detectionMs?: number | null;
  notes?: string | null;
  networkMetadata?: Record<string, unknown> | null;
};

async function serializable<T>(operation: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await prisma.$transaction(operation, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable
      });
    } catch (error) {
      if (
        !(error instanceof Prisma.PrismaClientKnownRequestError) ||
        error.code !== "P2034" ||
        attempt === 2
      ) throw error;
    }
  }
  throw new Error("Unreachable transaction state");
}

function runPublicId(): string {
  return `RUN-${randomBytes(8).toString("hex").toUpperCase()}`;
}

function canonicalFingerprint(context: {
  clientId: string;
  sessionId: string;
  runId: string;
}, input: PdaAttemptInput): string {
  return createHash("sha256").update(JSON.stringify({
    clientId: context.clientId,
    sessionId: context.sessionId,
    runId: context.runId,
    epoch: input.epoch,
    clientSeq: input.clientSeq,
    attemptId: input.attemptId,
    idempotencyKey: input.idempotencyKey,
    observedAt: input.observedAt.toISOString(),
    rawCode: input.rawCode?.trim() || null,
    expectedType: input.expectedType,
    captureMode: input.captureMode,
    captureMethod: input.captureMethod,
    physicalZone: input.physicalZone,
    distance: input.distance || null,
    detectionMs: input.detectionMs ?? null,
    notes: input.notes || null,
    networkMetadata: input.networkMetadata || null
  })).digest("hex");
}

function outcome(classification: string, expectedType: string): string {
  if (classification === "NO_LEIDO") return "NO_LEIDO";
  if (classification === "NO_ENCONTRADO") return "RECONOCIDO_NO_ENCONTRADO";
  if (classification === "AMBIGUO") return "OTRO";
  return expectedType === "OTRO" || classification === expectedType
    ? "OK"
    : "LEIDO_INCORRECTAMENTE";
}

function normalizeRawCode(rawCode: string): string {
  const value = rawCode.trim();
  return value.startsWith("]C1") ? value.slice(3) : value;
}

export async function createPdaRun(
  grant: PdaGrantContext,
  clientRunKey: string
) {
  if (grant.status !== PdaGrantStatus.ACTIVE) {
    throw new HttpError(409, "El grant solo permite drenar lecturas.", "PDA_GRANT_DRAIN_ONLY");
  }
  try {
    return await serializable(async (tx) => {
      const existing = await tx.pdaCaptureRun.findFirst({
        where: { grantId: grant.id, clientRunKey }
      });
      if (existing) return { run: existing, duplicate: true };

      const session = await tx.pdaTestSession.findFirst({
        where: {
          id: grant.sessionId,
          clientId: grant.clientId,
          status: PdaSessionStatus.OPEN
        }
      });
      if (!session) {
        throw new HttpError(409, "La sesión no acepta nuevas rondas.", "PDA_SESSION_NOT_OPEN");
      }
      const active = await tx.pdaCaptureRun.findFirst({
        where: { sessionId: session.id, status: PdaRunStatus.ACTIVE },
        select: { id: true, publicId: true }
      });
      if (active) {
        throw new HttpError(409, `Ya existe una ronda activa: ${active.publicId}.`, "PDA_RUN_ALREADY_ACTIVE");
      }
      const updated = await tx.pdaTestSession.update({
        where: { id: session.id },
        data: { captureEpoch: { increment: 1 }, version: { increment: 1 } },
        select: { captureEpoch: true }
      });
      const run = await tx.pdaCaptureRun.create({
        data: {
          publicId: runPublicId(),
          clientId: grant.clientId,
          sessionId: grant.sessionId,
          grantId: grant.id,
          clientRunKey,
          epoch: updated.captureEpoch
        }
      });
      return { run, duplicate: false };
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new HttpError(409, "Otra ronda obtuvo el lease de captura.", "PDA_RUN_ALREADY_ACTIVE");
    }
    throw error;
  }
}

export async function getPdaRun(grant: PdaGrantContext, runId: string) {
  const run = await prisma.pdaCaptureRun.findFirst({
    where: {
      id: runId,
      grantId: grant.id,
      clientId: grant.clientId,
      sessionId: grant.sessionId
    },
    include: {
      readings: {
        orderBy: { clientSeq: "asc" },
        select: { clientSeq: true, attemptId: true, result: true, createdAt: true }
      }
    }
  });
  if (!run) throw new HttpError(404, "Ronda PDA no encontrada.", "PDA_RUN_NOT_FOUND");
  return run;
}

export async function recordPdaRunReading(
  grant: PdaGrantContext,
  runId: string,
  input: PdaAttemptInput,
  reader?: ScannerDiagnosticReader
) {
  const requestFingerprint = canonicalFingerprint({
    clientId: grant.clientId,
    sessionId: grant.sessionId,
    runId
  }, input);
  const existing = await prisma.pdaTestReading.findUnique({
    where: {
      clientId_idempotencyKey: {
        clientId: grant.clientId,
        idempotencyKey: input.idempotencyKey
      }
    }
  });
  if (existing) {
    if (existing.requestFingerprint !== requestFingerprint) {
      throw new HttpError(409, "La clave idempotente fue reutilizada con otro payload.", "PDA_IDEMPOTENCY_CONFLICT");
    }
    return { reading: existing, duplicate: true };
  }

  const rawCode = input.rawCode?.trim() || null;
  let normalizedCode: string | null = null;
  let classification = "NO_LEIDO";
  let classificationMs: number | null = null;
  if (rawCode) {
    const startedAt = performance.now();
    const diagnostic = await classifyScannerCode(normalizeRawCode(rawCode), grant.clientId, reader);
    classificationMs = Math.max(0, Math.round(performance.now() - startedAt));
    normalizedCode = diagnostic.code;
    classification = diagnostic.classification;
  }

  try {
    return await serializable(async (tx) => {
      const duplicate = await tx.pdaTestReading.findUnique({
        where: {
          clientId_idempotencyKey: {
            clientId: grant.clientId,
            idempotencyKey: input.idempotencyKey
          }
        }
      });
      if (duplicate) {
        if (duplicate.requestFingerprint !== requestFingerprint) {
          throw new HttpError(409, "La clave idempotente fue reutilizada con otro payload.", "PDA_IDEMPOTENCY_CONFLICT");
        }
        return { reading: duplicate, duplicate: true };
      }
      const run = await tx.pdaCaptureRun.findFirst({
        where: {
          id: runId,
          grantId: grant.id,
          clientId: grant.clientId,
          sessionId: grant.sessionId,
          epoch: input.epoch,
          OR: [
            { status: PdaRunStatus.ACTIVE },
            {
              status: PdaRunStatus.DRAINING,
              sealedAtSeq: { gte: input.clientSeq }
            }
          ]
        }
      });
      if (!run) {
        throw new HttpError(409, "La ronda está sellada o el epoch es obsoleto.", "PDA_RUN_SEALED");
      }
      const reading = await tx.pdaTestReading.create({
        data: {
          sessionId: grant.sessionId,
          clientId: grant.clientId,
          runId,
          grantId: grant.id,
          clientSeq: input.clientSeq,
          attemptId: input.attemptId,
          idempotencyKey: input.idempotencyKey,
          requestFingerprint,
          observedAt: input.observedAt,
          rawCode,
          normalizedCode,
          expectedType: input.expectedType,
          classification,
          result: outcome(classification, input.expectedType),
          captureMode: input.captureMode,
          captureMethod: input.captureMethod,
          physicalZone: input.physicalZone,
          distance: input.distance,
          detectionMs: input.detectionMs,
          classificationMs,
          notes: input.notes,
          networkMetadata: (input.networkMetadata || undefined) as Prisma.InputJsonValue | undefined,
          createdById: grant.createdById
        }
      });
      await tx.pdaCaptureRun.update({
        where: { id: run.id },
        data: { receivedCount: { increment: 1 }, version: { increment: 1 } }
      });
      return { reading, duplicate: false };
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const raced = await prisma.pdaTestReading.findUnique({
        where: {
          clientId_idempotencyKey: {
            clientId: grant.clientId,
            idempotencyKey: input.idempotencyKey
          }
        }
      });
      if (raced?.requestFingerprint === requestFingerprint) return { reading: raced, duplicate: true };
      throw new HttpError(409, "Secuencia, intento o idempotencia en conflicto.", "PDA_ATTEMPT_CONFLICT");
    }
    throw error;
  }
}

export async function sealPdaRun(
  grant: PdaGrantContext,
  runId: string,
  sealedAtSeq: number,
  expectedVersion?: number
) {
  return serializable(async (tx) => {
    const run = await tx.pdaCaptureRun.findFirst({
      where: {
        id: runId,
        grantId: grant.id,
        clientId: grant.clientId,
        sessionId: grant.sessionId
      }
    });
    if (!run) throw new HttpError(404, "Ronda PDA no encontrada.", "PDA_RUN_NOT_FOUND");
    if (run.sealedAtSeq !== null) {
      if (run.sealedAtSeq !== sealedAtSeq) {
        throw new HttpError(409, "La ronda ya fue sellada con otra secuencia.", "PDA_SEAL_CONFLICT");
      }
      return run;
    }
    if (run.status !== PdaRunStatus.ACTIVE || (expectedVersion !== undefined && run.version !== expectedVersion)) {
      throw new HttpError(409, "La versión de la ronda es obsoleta.", "PDA_RUN_VERSION_CONFLICT");
    }
    const beyond = await tx.pdaTestReading.count({
      where: { runId, clientSeq: { gt: sealedAtSeq } }
    });
    if (beyond) throw new HttpError(409, "Existen lecturas posteriores al sello.", "PDA_SEAL_BELOW_RECEIVED");
    return tx.pdaCaptureRun.update({
      where: { id: run.id },
      data: {
        status: PdaRunStatus.DRAINING,
        sealedAtSeq,
        sealedAt: new Date(),
        captureStoppedConfirmedAt: new Date(),
        version: { increment: 1 }
      }
    });
  });
}

function missingSequences(received: number[], sealedAtSeq: number): number[] {
  const seen = new Set(received);
  const missing: number[] = [];
  for (let seq = 1; seq <= sealedAtSeq; seq += 1) {
    if (!seen.has(seq)) missing.push(seq);
  }
  return missing;
}

export async function reconcilePdaRun(grant: PdaGrantContext, runId: string) {
  return serializable(async (tx) => {
    const run = await tx.pdaCaptureRun.findFirst({
      where: {
        id: runId,
        grantId: grant.id,
        clientId: grant.clientId,
        sessionId: grant.sessionId
      }
    });
    if (!run) throw new HttpError(404, "Ronda PDA no encontrada.", "PDA_RUN_NOT_FOUND");
    if (run.sealedAtSeq === null) {
      throw new HttpError(409, "La ronda debe sellarse antes de reconciliar.", "PDA_RUN_NOT_SEALED");
    }
    const readings = await tx.pdaTestReading.findMany({
      where: { runId },
      orderBy: { clientSeq: "asc" },
      select: { clientSeq: true }
    });
    const missing = missingSequences(readings.map((row) => row.clientSeq), run.sealedAtSeq);
    if (missing.length) {
      return { run, missing, reconciled: false };
    }
    const reconciled = run.status === PdaRunStatus.RECONCILED
      ? run
      : await tx.pdaCaptureRun.update({
          where: { id: run.id },
          data: {
            status: PdaRunStatus.RECONCILED,
            receivedCount: readings.length,
            version: { increment: 1 }
          }
        });
    return { run: reconciled, missing: [], reconciled: true };
  });
}

export async function preparePdaRelease(grant: PdaGrantContext, releaseNonce: string) {
  const releaseNonceDigest = digestPdaSecret("release", releaseNonce);
  const result = await serializable(async (tx) => {
    const current = await tx.pdaLabGrant.findUnique({ where: { id: grant.id } });
    if (!current) throw new HttpError(401, "Capacidad PDA inválida.", "PDA_GRANT_INVALID");
    if (
      current.status === PdaGrantStatus.DRAIN_ONLY &&
      current.releaseNonceDigest === releaseNonceDigest
    ) {
      const existingRuns = await tx.pdaCaptureRun.findMany({
        where: { grantId: grant.id },
        orderBy: { id: "asc" },
        select: { publicId: true }
      });
      return { grantPublicId: grant.publicId, runs: existingRuns.map((run) => run.publicId) };
    }
    if (current.status !== PdaGrantStatus.ACTIVE) {
      throw new HttpError(409, "La liberación ya fue preparada con otra identidad.", "PDA_RELEASE_ALREADY_PREPARED");
    }
    const runs = await tx.pdaCaptureRun.findMany({
      where: { grantId: grant.id },
      orderBy: { id: "asc" }
    });
    if (!runs.length || runs.some((run) => run.status !== PdaRunStatus.RECONCILED)) {
      throw new HttpError(409, "Todas las rondas deben estar reconciliadas.", "PDA_RELEASE_NOT_RECONCILED");
    }
    const updated = await tx.pdaLabGrant.updateMany({
      where: { id: grant.id, status: PdaGrantStatus.ACTIVE },
      data: {
        status: PdaGrantStatus.DRAIN_ONLY,
        captureRevokedAt: new Date(),
        releaseNonceDigest,
        version: { increment: 1 }
      }
    });
    if (updated.count !== 1) {
      throw new HttpError(409, "El grant cambió durante la liberación.", "PDA_GRANT_VERSION_CONFLICT");
    }
    return { grantPublicId: grant.publicId, runs: runs.map((run) => run.publicId) };
  });
  return { ...result, releaseNonce };
}

export async function confirmPdaRelease(
  grant: PdaGrantContext,
  input: {
    releaseNonce: string;
    captureStoppedConfirmed: true;
    localCleanupConfirmed: true;
    noDownloadsConfirmed: true;
  }
) {
  const now = new Date();
  return serializable(async (tx) => {
    const current = await tx.pdaLabGrant.findUnique({ where: { id: grant.id } });
    if (
      !current ||
      current.status !== PdaGrantStatus.DRAIN_ONLY ||
      current.releaseNonceDigest !== digestPdaSecret("release", input.releaseNonce)
    ) {
      throw new HttpError(409, "Confirmación de liberación inválida.", "PDA_RELEASE_INVALID");
    }
    const unresolved = await tx.pdaCaptureRun.count({
      where: { grantId: grant.id, status: { not: PdaRunStatus.RECONCILED } }
    });
    if (unresolved) {
      throw new HttpError(409, "Persisten rondas no reconciliadas.", "PDA_RELEASE_NOT_RECONCILED");
    }
    const receiptId = `REL_${randomBytes(16).toString("hex")}`;
    await tx.pdaCaptureRun.updateMany({
      where: { grantId: grant.id, status: PdaRunStatus.RECONCILED },
      data: {
        status: PdaRunStatus.RELEASED,
        releasedAt: now,
        captureStoppedConfirmedAt: now,
        localCleanupConfirmedAt: now,
        version: { increment: 1 }
      }
    });
    await tx.pdaLabGrant.update({
      where: { id: grant.id },
      data: {
        status: PdaGrantStatus.REVOKED,
        revokedAt: now,
        revokeReason: "DEVICE_RELEASE_CONFIRMED",
        releaseReceiptId: receiptId,
        releaseConfirmedAt: now,
        version: { increment: 1 }
      }
    });
    return { safeToReturn: true, receiptId, releasedAt: now };
  });
}

export async function forceTakeover(input: {
  clientId: string;
  sessionId: string;
  reason: string;
}) {
  return serializable(async (tx) => {
    const run = await tx.pdaCaptureRun.findFirst({
      where: {
        clientId: input.clientId,
        sessionId: input.sessionId,
        status: PdaRunStatus.ACTIVE
      }
    });
    if (!run) return { changed: false };
    const now = new Date();
    await tx.pdaCaptureRun.update({
      where: { id: run.id },
      data: {
        status: PdaRunStatus.INCOMPLETE,
        incompleteAt: now,
        incompleteReason: input.reason,
        version: { increment: 1 }
      }
    });
    if (run.grantId) {
      await tx.pdaLabGrant.updateMany({
        where: { id: run.grantId, status: PdaGrantStatus.ACTIVE },
        data: {
          status: PdaGrantStatus.DRAIN_ONLY,
          captureRevokedAt: now,
          revokeReason: "FORCED_TAKEOVER",
          version: { increment: 1 }
        }
      });
    }
    await tx.pdaTestSession.update({
      where: { id: input.sessionId },
      data: {
        captureEpoch: { increment: 1 },
        incompleteRuns: { increment: 1 },
        version: { increment: 1 }
      }
    });
    return { changed: true, runId: run.id, runPublicId: run.publicId };
  });
}
