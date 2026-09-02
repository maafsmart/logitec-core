import { createHash, randomBytes } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "../../db/prisma.js";
import { HttpError } from "../../shared/http-error.js";
import {
  calculatePdaSessionSummary,
  normalizePdaRawCode,
  pdaOutcome,
  type PdaReadingInput
} from "../admin/pda-test-evidence.service.js";
import {
  classifyScannerCode,
  type ScannerDiagnosticReader
} from "../admin/pda-scanner-diagnostic.service.js";

export type PdaAttemptInput = PdaReadingInput & {
  runPublicId: string;
  clientSeq: number;
  epoch: number;
  attemptId: string;
};

type PdaContext = {
  grantId: string;
  clientId: string;
  sessionId: string;
  createdById: string;
};

function runPublicId(): string {
  return `RUN-${randomBytes(9).toString("base64url")}`;
}

export function fingerprintPdaAttempt(input: PdaAttemptInput): string {
  return createHash("sha256").update(JSON.stringify({
    ...input,
    observedAt: input.observedAt.toISOString(),
    networkMetadata: input.networkMetadata || null
  })).digest("hex");
}

export function pdaRunAcceptsAttempt(
  status: string,
  sealedThroughSeq: number | null,
  clientSeq: number
): boolean {
  return status === "ACTIVE" ||
    (["SEALED", "DRAINING"].includes(status) &&
      sealedThroughSeq !== null &&
      clientSeq <= sealedThroughSeq);
}

export function missingPdaSequences(sequences: number[], sealedThroughSeq: number): number[] {
  const seen = new Set(sequences);
  const missing: number[] = [];
  for (let seq = 1; seq <= sealedThroughSeq; seq += 1) {
    if (!seen.has(seq)) missing.push(seq);
  }
  return missing;
}

async function serializable<T>(operation: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await prisma.$transaction(operation, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable
      });
    } catch (error) {
      const retryable = error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034";
      if (!retryable || attempt === 2) throw error;
    }
  }
  throw new Error("Unreachable transaction state");
}

export async function createPdaCaptureRun(context: PdaContext, input: {
  deviceType?: string | null;
  deviceBrand?: string | null;
  deviceModel?: string | null;
  deviceOs?: string | null;
  readerType?: string | null;
  userAgent?: string | null;
  deviceMetadata?: Record<string, unknown> | null;
}) {
  return serializable(async (tx) => {
    const grant = await tx.pdaLabGrant.findFirst({
      where: {
        id: context.grantId,
        clientId: context.clientId,
        sessionId: context.sessionId,
        status: "ACTIVE",
        expiresAt: { gt: new Date() }
      },
      select: { id: true }
    });
    if (!grant) throw new HttpError(401, "Grant PDA revocado o expirado.", "PDA_GRANT_REVOKED");
    const session = await tx.pdaTestSession.findFirst({
      where: { id: context.sessionId, clientId: context.clientId, status: "OPEN" },
      select: { id: true }
    });
    if (!session) throw new HttpError(409, "Sesión PDA no disponible.", "PDA_SESSION_NOT_OPEN");
    const existing = await tx.pdaCaptureRun.findFirst({
      where: {
        grantId: context.grantId,
        clientId: context.clientId,
        status: { in: ["ACTIVE", "PAUSED", "SEALED", "DRAINING"] }
      },
      orderBy: { createdAt: "desc" }
    });
    if (existing) return { run: existing, duplicate: true };
    const run = await tx.pdaCaptureRun.create({
      data: {
        publicId: runPublicId(),
        clientId: context.clientId,
        sessionId: context.sessionId,
        grantId: context.grantId,
        createdById: context.createdById,
        userAgent: input.userAgent,
        deviceType: input.deviceType,
        deviceBrand: input.deviceBrand,
        deviceModel: input.deviceModel,
        deviceOs: input.deviceOs,
        readerType: input.readerType,
        deviceMetadata: (input.deviceMetadata || undefined) as Prisma.InputJsonValue | undefined
      }
    });
    return { run, duplicate: false };
  });
}

export async function getPdaRun(context: PdaContext, publicId: string) {
  const run = await prisma.pdaCaptureRun.findFirst({
    where: {
      publicId,
      clientId: context.clientId,
      sessionId: context.sessionId,
      grantId: context.grantId
    },
    select: {
      publicId: true,
      status: true,
      epoch: true,
      version: true,
      lastAcceptedSeq: true,
      sealedThroughSeq: true,
      session: { select: { testId: true, status: true } }
    }
  });
  if (!run) throw new HttpError(404, "Run PDA no encontrado.", "PDA_RUN_NOT_FOUND");
  return run;
}

export async function recordPdaAttempt(
  context: PdaContext,
  input: PdaAttemptInput,
  reader?: ScannerDiagnosticReader
) {
  const requestFingerprint = fingerprintPdaAttempt(input);
  const existing = await prisma.pdaTestReading.findUnique({
    where: { clientId_idempotencyKey: { clientId: context.clientId, idempotencyKey: input.idempotencyKey } }
  });
  if (existing) {
    if (existing.requestFingerprint !== requestFingerprint) {
      throw new HttpError(409, "Clave idempotente reutilizada con otro payload.", "PDA_IDEMPOTENCY_CONFLICT");
    }
    return { reading: existing, duplicate: true };
  }

  const rawCode = input.rawCode?.trim() || null;
  let normalizedCode: string | null = null;
  let classification = "NO_LEIDO";
  let classificationMs: number | null = null;
  if (rawCode) {
    const startedAt = performance.now();
    const diagnostic = await classifyScannerCode(normalizePdaRawCode(rawCode), context.clientId, reader);
    classificationMs = Math.max(0, Math.round(performance.now() - startedAt));
    normalizedCode = diagnostic.code;
    classification = diagnostic.classification;
  }

  return serializable(async (tx) => {
    const duplicate = await tx.pdaTestReading.findUnique({
      where: { clientId_idempotencyKey: { clientId: context.clientId, idempotencyKey: input.idempotencyKey } }
    });
    if (duplicate) {
      if (duplicate.requestFingerprint !== requestFingerprint) {
        throw new HttpError(409, "Clave idempotente reutilizada con otro payload.", "PDA_IDEMPOTENCY_CONFLICT");
      }
      return { reading: duplicate, duplicate: true };
    }
    const run = await tx.pdaCaptureRun.findFirst({
      where: {
        publicId: input.runPublicId,
        clientId: context.clientId,
        sessionId: context.sessionId,
        grantId: context.grantId
      }
    });
    if (!run) throw new HttpError(404, "Run PDA no encontrado.", "PDA_RUN_NOT_FOUND");
    if (!pdaRunAcceptsAttempt(run.status, run.sealedThroughSeq, input.clientSeq)) {
      throw new HttpError(409, "Run PDA no acepta lecturas.", "PDA_RUN_NOT_ACTIVE");
    }
    if (run.epoch !== input.epoch) throw new HttpError(409, "Lease PDA obsoleto.", "PDA_RUN_EPOCH_STALE");

    const reading = await tx.pdaTestReading.create({
      data: {
        sessionId: context.sessionId,
        runId: run.id,
        clientId: context.clientId,
        createdById: context.createdById,
        clientSeq: input.clientSeq,
        epoch: input.epoch,
        attemptId: input.attemptId,
        idempotencyKey: input.idempotencyKey,
        requestFingerprint,
        observedAt: input.observedAt,
        rawCode,
        normalizedCode,
        expectedType: input.expectedType,
        classification,
        result: pdaOutcome(classification, input.expectedType),
        captureMethod: input.captureMethod,
        physicalZone: input.physicalZone,
        distance: input.distance,
        detectionMs: input.detectionMs,
        classificationMs,
        notes: input.notes,
        networkMetadata: (input.networkMetadata || undefined) as Prisma.InputJsonValue | undefined
      }
    });
    if (input.clientSeq > run.lastAcceptedSeq) {
      await tx.pdaCaptureRun.update({
        where: { id: run.id },
        data: { lastAcceptedSeq: input.clientSeq, version: { increment: 1 } }
      });
    }
    return { reading, duplicate: false };
  }).catch(async (error) => {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const raced = await prisma.pdaTestReading.findUnique({
        where: { clientId_idempotencyKey: { clientId: context.clientId, idempotencyKey: input.idempotencyKey } }
      });
      if (raced?.requestFingerprint === requestFingerprint) return { reading: raced, duplicate: true };
    }
    throw error;
  });
}

export async function setPdaRunPaused(context: PdaContext, publicId: string, paused: boolean) {
  const from = paused ? "ACTIVE" : "PAUSED";
  const to = paused ? "PAUSED" : "ACTIVE";
  const result = await prisma.pdaCaptureRun.updateMany({
    where: {
      publicId,
      clientId: context.clientId,
      sessionId: context.sessionId,
      grantId: context.grantId,
      status: from
    },
    data: {
      status: to,
      pausedAt: paused ? new Date() : null,
      version: { increment: 1 }
    }
  });
  if (result.count !== 1) throw new HttpError(409, "Transición de pausa inválida.", "PDA_RUN_TRANSITION");
  return getPdaRun(context, publicId);
}

export async function sealPdaRun(context: PdaContext, publicId: string, sealedThroughSeq: number) {
  return serializable(async (tx) => {
    const run = await tx.pdaCaptureRun.findFirst({
      where: { publicId, clientId: context.clientId, sessionId: context.sessionId, grantId: context.grantId }
    });
    if (!run) throw new HttpError(404, "Run PDA no encontrado.", "PDA_RUN_NOT_FOUND");
    if (!["ACTIVE", "PAUSED", "SEALED", "DRAINING"].includes(run.status)) {
      throw new HttpError(409, "Run PDA no puede sellarse.", "PDA_RUN_TRANSITION");
    }
    if (sealedThroughSeq < run.lastAcceptedSeq || sealedThroughSeq > 100_000) {
      throw new HttpError(409, "Límite de sellado inválido.", "PDA_SEAL_RANGE_INVALID");
    }
    if (run.sealedThroughSeq !== null && run.sealedThroughSeq !== sealedThroughSeq) {
      throw new HttpError(409, "El límite sellado no puede cambiar.", "PDA_SEAL_CONFLICT");
    }
    return tx.pdaCaptureRun.update({
      where: { id: run.id },
      data: {
        status: run.status === "DRAINING" ? "DRAINING" : "SEALED",
        sealedThroughSeq,
        sealedAt: run.sealedAt || new Date(),
        version: { increment: 1 }
      }
    });
  });
}

export async function reconcilePdaRun(context: PdaContext, publicId: string) {
  return serializable(async (tx) => {
    const run = await tx.pdaCaptureRun.findFirst({
      where: { publicId, clientId: context.clientId, sessionId: context.sessionId, grantId: context.grantId }
    });
    if (!run) throw new HttpError(404, "Run PDA no encontrado.", "PDA_RUN_NOT_FOUND");
    if (!["SEALED", "DRAINING", "RECONCILED"].includes(run.status) || run.sealedThroughSeq === null) {
      throw new HttpError(409, "Run PDA debe estar sellado.", "PDA_RUN_NOT_SEALED");
    }
    const rows = await tx.pdaTestReading.findMany({
      where: { runId: run.id, clientId: context.clientId },
      select: { clientSeq: true },
      orderBy: { clientSeq: "asc" }
    });
    const missing = missingPdaSequences(rows.map((row) => row.clientSeq), run.sealedThroughSeq);
    if (missing.length) {
      await tx.pdaCaptureRun.update({
        where: { id: run.id },
        data: { status: "DRAINING", version: { increment: 1 } }
      });
      return { reconciled: false, missing };
    }
    await tx.pdaCaptureRun.update({
      where: { id: run.id },
      data: { status: "RECONCILED", reconciledAt: new Date(), version: { increment: 1 } }
    });
    return { reconciled: true, missing: [] };
  });
}

export async function releasePdaRun(context: PdaContext, publicId: string) {
  return serializable(async (tx) => {
    const run = await tx.pdaCaptureRun.findFirst({
      where: { publicId, clientId: context.clientId, sessionId: context.sessionId, grantId: context.grantId }
    });
    if (!run) throw new HttpError(404, "Run PDA no encontrado.", "PDA_RUN_NOT_FOUND");
    if (run.status !== "RECONCILED") {
      throw new HttpError(409, "Evidencia no reconciliada.", "PDA_RELEASE_UNVERIFIABLE");
    }
    const releasedAt = new Date();
    await tx.pdaCaptureRun.updateMany({
      where: {
        grantId: context.grantId,
        clientId: context.clientId,
        status: "RECONCILED"
      },
      data: { status: "RELEASED", releasedAt, version: { increment: 1 } }
    });
    await tx.pdaLabGrant.updateMany({
      where: { id: context.grantId, clientId: context.clientId, status: "ACTIVE" },
      data: { status: "REVOKED", revokedAt: new Date(), revokeReason: "RUN_RELEASED" }
    });
    const nonTerminalRuns = await tx.pdaCaptureRun.count({
      where: {
        sessionId: context.sessionId,
        clientId: context.clientId,
        status: { notIn: ["RELEASED", "INCOMPLETE"] }
      }
    });
    let sessionClosed = false;
    let summary = null;
    if (nonTerminalRuns === 0) {
      const [readings, incompleteRuns] = await Promise.all([
        tx.pdaTestReading.findMany({
          where: { sessionId: context.sessionId, clientId: context.clientId },
          select: { result: true, detectionMs: true, classificationMs: true }
        }),
        tx.pdaCaptureRun.count({
          where: { sessionId: context.sessionId, clientId: context.clientId, status: "INCOMPLETE" }
        })
      ]);
      summary = calculatePdaSessionSummary(readings);
      await tx.pdaTestSession.update({
        where: { id: context.sessionId },
        data: {
          status: incompleteRuns ? "INCOMPLETE" : "CLOSED",
          finalizedAt: releasedAt,
          version: { increment: 1 },
          ...summary
        }
      });
      sessionClosed = true;
    }
    return {
      status: "SAFE_TO_RETURN" as const,
      runPublicId: run.publicId,
      grantRevoked: true,
      sessionClosed,
      summary,
      limits: "Solo confirma evidencia LOGITEC reconciliada, captura detenida, namespace local limpiable y grant revocado."
    };
  });
}

export async function forceTakeoverPdaSession(clientId: string, sessionId: string) {
  return serializable(async (tx) => {
    const runs = await tx.pdaCaptureRun.findMany({
      where: {
        clientId,
        sessionId,
        status: { in: ["ACTIVE", "PAUSED", "SEALED", "DRAINING", "RECONCILED"] }
      },
      select: { id: true, grantId: true }
    });
    const now = new Date();
    await tx.pdaCaptureRun.updateMany({
      where: { id: { in: runs.map((run) => run.id) }, clientId },
      data: {
        status: "INCOMPLETE",
        incompleteAt: now,
        incompleteReason: "FORCED_TAKEOVER",
        epoch: { increment: 1 },
        version: { increment: 1 }
      }
    });
    const revoked = await tx.pdaLabGrant.updateMany({
      where: { clientId, sessionId, status: "ACTIVE" },
      data: { status: "REVOKED", revokedAt: now, revokeReason: "FORCED_TAKEOVER" }
    });
    return { incompleteRuns: runs.length, revokedGrants: revoked.count };
  });
}
