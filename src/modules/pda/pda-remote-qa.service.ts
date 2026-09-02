import { PdaGrantStatus, PdaRunStatus, Prisma } from "@prisma/client";
import { prisma } from "../../db/prisma.js";
import { HttpError } from "../../shared/http-error.js";
import type { PdaGrantContext } from "./pda-auth.service.js";

export const PDA_QA_STEPS = [
  "HARDWARE_IDENTIFIED",
  "NO_ADMIN_LOGIN",
  "VALID_READ",
  "REPEATED_READ",
  "NOT_FOUND_OR_NOT_READ",
  "IDEMPOTENT_RETRY",
  "HID_ENTER",
  "MANUAL_FALLBACK",
  "NETWORK_RECONNECT",
  "BACKGROUND_LOCK",
  "RELOAD_CONTINUITY",
  "SEALED_RECONCILED",
  "ZERO_PENDING_COMPLETE",
  "SAFE_TO_RETURN",
  "REVOKED_401"
] as const;

export type PdaQaStepId = typeof PDA_QA_STEPS[number];
export type PdaQaStepStatus = "PENDING" | "PASS" | "FAIL" | "NOT_APPLICABLE";

type StoredStep = {
  status: PdaQaStepStatus;
  source: "HUMAN" | "BROWSER" | "SERVER";
  recordedAt: string;
  detail?: string;
};

type RemoteQaMetadata = {
  hardwareClass?: string;
  readerType?: string;
  steps?: Partial<Record<PdaQaStepId, StoredStep>>;
};

function metadataObject(value: Prisma.JsonValue | null): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? { ...(value as Record<string, unknown>) }
    : {};
}

function remoteQaFrom(value: Prisma.JsonValue | null): RemoteQaMetadata {
  const root = metadataObject(value);
  const remote = root.remotePhysicalQa;
  return remote && typeof remote === "object" && !Array.isArray(remote)
    ? { ...(remote as RemoteQaMetadata), steps: { ...((remote as RemoteQaMetadata).steps || {}) } }
    : { steps: {} };
}

async function serializable<T>(operation: (tx: Prisma.TransactionClient) => Promise<T>) {
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

export async function recordPdaQaStep(input: {
  grant: PdaGrantContext;
  runId: string;
  step: PdaQaStepId;
  status: Exclude<PdaQaStepStatus, "PENDING">;
  source: StoredStep["source"];
  detail?: string;
  hardwareClass?: string;
  readerType?: string;
}) {
  return serializable(async (tx) => {
    const run = await tx.pdaCaptureRun.findFirst({
      where: {
        id: input.runId,
        grantId: input.grant.id,
        clientId: input.grant.clientId,
        sessionId: input.grant.sessionId
      }
    });
    if (!run) throw new HttpError(404, "Ronda QA no encontrada.", "PDA_RUN_NOT_FOUND");
    const root = metadataObject(run.deviceMetadata);
    const remote = remoteQaFrom(run.deviceMetadata);
    const existing = remote.steps![input.step];
    if (existing?.status === "FAIL" && input.status !== "FAIL") return existing;
    remote.steps![input.step] = {
      status: input.status,
      source: input.source,
      recordedAt: new Date().toISOString(),
      ...(input.detail ? { detail: input.detail.slice(0, 240) } : {})
    };
    if (input.hardwareClass) remote.hardwareClass = input.hardwareClass;
    if (input.readerType) remote.readerType = input.readerType.slice(0, 120);
    await tx.pdaCaptureRun.update({
      where: { id: run.id },
      data: {
        deviceMetadata: {
          ...root,
          remotePhysicalQa: remote
        } as Prisma.InputJsonValue,
        ...(input.readerType ? { readerType: input.readerType.slice(0, 120) } : {}),
        version: { increment: 1 }
      }
    });
    return remote.steps![input.step];
  });
}

function automaticStep(
  status: PdaQaStepStatus,
  detail?: string
): StoredStep {
  return {
    status,
    source: "SERVER",
    recordedAt: new Date().toISOString(),
    ...(detail ? { detail } : {})
  };
}

function deriveRunProgress(run: {
  id: string;
  publicId: string;
  status: PdaRunStatus;
  sealedAtSeq: number | null;
  receivedCount: number;
  captureStoppedConfirmedAt: Date | null;
  localCleanupConfirmedAt: Date | null;
  deviceMetadata: Prisma.JsonValue | null;
  grant: {
    publicId: string;
    status: PdaGrantStatus;
    releaseReceiptId: string | null;
    releaseConfirmedAt: Date | null;
  } | null;
  readings: Array<{
    rawCode: string | null;
    normalizedCode: string | null;
    result: string;
    captureMode: string;
    observedAt: Date;
  }>;
}) {
  const remote = remoteQaFrom(run.deviceMetadata);
  const steps: Partial<Record<PdaQaStepId, StoredStep>> = { ...(remote.steps || {}) };
  const setAutomatic = (id: PdaQaStepId, status: PdaQaStepStatus, detail?: string) => {
    if (steps[id]?.status !== "FAIL") steps[id] = automaticStep(status, detail);
  };
  const readings = run.readings;
  const codeCounts = new Map<string, number>();
  for (const reading of readings) {
    const code = reading.normalizedCode || reading.rawCode;
    if (code) codeCounts.set(code, (codeCounts.get(code) || 0) + 1);
  }
  if (readings.some((row) => row.rawCode && row.result !== "NO_LEIDO")) {
    setAutomatic("VALID_READ", "PASS", "Lectura física persistida.");
  }
  if ([...codeCounts.values()].some((count) => count >= 2)) {
    setAutomatic("REPEATED_READ", "PASS", "Mismo código persistido como intentos distintos.");
  }
  if (readings.some((row) =>
    row.result === "NO_LEIDO" || row.result === "RECONOCIDO_NO_ENCONTRADO"
  )) setAutomatic("NOT_FOUND_OR_NOT_READ", "PASS");
  if (readings.some((row) => row.captureMode === "HID")) {
    setAutomatic("HID_ENTER", "PASS");
  }
  if (readings.some((row) => row.captureMode === "MANUAL")) {
    setAutomatic("MANUAL_FALLBACK", "PASS");
  }
  if (run.status === PdaRunStatus.RECONCILED || run.status === PdaRunStatus.RELEASED) {
    setAutomatic("SEALED_RECONCILED", "PASS");
  }
  if (
    (run.status === PdaRunStatus.RECONCILED || run.status === PdaRunStatus.RELEASED) &&
    run.sealedAtSeq !== null &&
    run.receivedCount === run.sealedAtSeq
  ) setAutomatic("ZERO_PENDING_COMPLETE", "PASS");
  if (
    run.status === PdaRunStatus.RELEASED &&
    run.grant?.status === PdaGrantStatus.REVOKED &&
    run.grant.releaseReceiptId &&
    run.grant.releaseConfirmedAt &&
    run.captureStoppedConfirmedAt &&
    run.localCleanupConfirmedAt
  ) {
    setAutomatic("SAFE_TO_RETURN", "PASS");
  }
  if (run.status === PdaRunStatus.INCOMPLETE) {
    setAutomatic("SAFE_TO_RETURN", "FAIL", "Ronda incompleta.");
  }
  const ordered = PDA_QA_STEPS.map((id) => ({
    id,
    ...(steps[id] || automaticStep("PENDING"))
  }));
  const statuses = ordered.map((item) => item.status);
  const verdict = statuses.includes("FAIL")
    ? "FAIL"
    : statuses.every((status) => status === "PASS" || status === "NOT_APPLICABLE")
      ? "PASS"
      : run.status === PdaRunStatus.RELEASED
        ? "UNVERIFIABLE"
        : "PENDING";
  return {
    runId: run.id,
    runPublicId: run.publicId,
    hardwareClass: remote.hardwareClass || null,
    readerType: remote.readerType || null,
    runStatus: run.status,
    grantPublicId: run.grant?.publicId || null,
    grantStatus: run.grant?.status || null,
    readingCount: readings.length,
    receivedCount: run.receivedCount,
    sealedAtSeq: run.sealedAtSeq,
    lastEvidence: readings.length
      ? {
          result: readings[readings.length - 1]!.result,
          captureMode: readings[readings.length - 1]!.captureMode,
          observedAt: readings[readings.length - 1]!.observedAt
        }
      : null,
    currentStep: ordered.find((item) => item.status === "PENDING")?.id || null,
    verdict,
    steps: ordered
  };
}

const progressInclude = {
  grant: {
    select: {
      publicId: true,
      status: true,
      releaseReceiptId: true,
      releaseConfirmedAt: true
    }
  },
  readings: {
    orderBy: { observedAt: "asc" as const },
    select: {
      rawCode: true,
      normalizedCode: true,
      result: true,
      captureMode: true,
      observedAt: true
    }
  }
};

export async function getPdaQaProgress(grant: PdaGrantContext, runId: string) {
  const run = await prisma.pdaCaptureRun.findFirst({
    where: {
      id: runId,
      grantId: grant.id,
      clientId: grant.clientId,
      sessionId: grant.sessionId
    },
    include: progressInclude
  });
  if (!run) throw new HttpError(404, "Ronda QA no encontrada.", "PDA_RUN_NOT_FOUND");
  return deriveRunProgress(run);
}

export async function getPdaSessionQaProgress(clientId: string, sessionId: string) {
  const session = await prisma.pdaTestSession.findFirst({
    where: { id: sessionId, clientId },
    select: { id: true, testId: true }
  });
  if (!session) throw new HttpError(404, "Sesión PDA no encontrada.", "PDA_SESSION_NOT_FOUND");
  const runs = await prisma.pdaCaptureRun.findMany({
    where: { sessionId, clientId, legacyImported: false },
    orderBy: { startedAt: "asc" },
    include: progressInclude
  });
  return {
    session,
    runs: runs.map(deriveRunProgress)
  };
}
