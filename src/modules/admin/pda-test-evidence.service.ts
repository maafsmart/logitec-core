import { randomBytes } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "../../db/prisma.js";
import { HttpError } from "../../shared/http-error.js";

export type PdaReadingInput = {
  idempotencyKey: string;
  observedAt: Date;
  rawCode?: string | null;
  expectedType: string;
  captureMethod: string;
  physicalZone: string;
  distance?: string | null;
  detectionMs?: number | null;
  notes?: string | null;
  networkMetadata?: Record<string, unknown> | null;
};

export type PdaSessionSummary = {
  totalReadings: number;
  okReadings: number;
  notFoundReadings: number;
  failedReadings: number;
  successRate: number;
  detectionMinMs: number | null;
  detectionMedianMs: number | null;
  detectionP95Ms: number | null;
  classificationMinMs: number | null;
  classificationMedianMs: number | null;
  classificationP95Ms: number | null;
};

const sessionInclude = {
  createdBy: { select: { id: true, fullName: true, email: true } },
  readings: { orderBy: [{ observedAt: "asc" as const }, { id: "asc" as const }] },
  runs: { orderBy: [{ startedAt: "asc" as const }, { id: "asc" as const }] }
};

async function serializableTransaction<T>(
  operation: (tx: Prisma.TransactionClient) => Promise<T>
): Promise<T> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await prisma.$transaction(operation, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable
      });
    } catch (error) {
      const retryable =
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2034";
      if (!retryable || attempt === 2) throw error;
      await new Promise((resolve) => setTimeout(resolve, 10 * (attempt + 1)));
    }
  }
  throw new Error("Unreachable serializable transaction state");
}

function commitVersion(): string | null {
  return (
    process.env.RENDER_GIT_COMMIT ||
    process.env.GIT_COMMIT_SHA ||
    process.env.VERCEL_GIT_COMMIT_SHA ||
    null
  );
}

export function createVisibleTestId(now = new Date()): string {
  const date = now.toISOString().slice(0, 10).replaceAll("-", "");
  return `PDA-${date}-${randomBytes(12).toString("hex").toUpperCase()}`;
}

function percentile(values: Array<number | null>, kind: "min" | "median" | "p95"): number | null {
  const sorted = values.filter((value): value is number => Number.isFinite(value)).sort((a, b) => a - b);
  if (!sorted.length) return null;
  if (kind === "min") return sorted[0]!;
  if (kind === "p95") return sorted[Math.max(0, Math.ceil(sorted.length * 0.95) - 1)]!;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]!
    : Math.round((sorted[middle - 1]! + sorted[middle]!) / 2);
}

export function calculatePdaSessionSummary(
  readings: Array<{ result: string; detectionMs: number | null; classificationMs: number | null }>
): PdaSessionSummary {
  const totalReadings = readings.length;
  const okReadings = readings.filter((row) => row.result === "OK").length;
  const notFoundReadings = readings.filter((row) => row.result === "RECONOCIDO_NO_ENCONTRADO").length;
  const failedReadings = totalReadings - okReadings - notFoundReadings;
  const detection = readings.map((row) => row.detectionMs);
  const classification = readings.map((row) => row.classificationMs);
  return {
    totalReadings,
    okReadings,
    notFoundReadings,
    failedReadings,
    successRate: totalReadings ? Number(((okReadings / totalReadings) * 100).toFixed(2)) : 0,
    detectionMinMs: percentile(detection, "min"),
    detectionMedianMs: percentile(detection, "median"),
    detectionP95Ms: percentile(detection, "p95"),
    classificationMinMs: percentile(classification, "min"),
    classificationMedianMs: percentile(classification, "median"),
    classificationP95Ms: percentile(classification, "p95")
  };
}

export function pdaOutcome(classification: string, expectedType: string): string {
  if (classification === "NO_LEIDO") return "NO_LEIDO";
  if (classification === "NO_ENCONTRADO") return "RECONOCIDO_NO_ENCONTRADO";
  if (classification === "AMBIGUO") return "OTRO";
  return expectedType === "OTRO" || classification === expectedType ? "OK" : "LEIDO_INCORRECTAMENTE";
}

export function normalizePdaRawCode(rawCode: string): string {
  const value = rawCode.trim();
  return value.startsWith("]C1") ? value.slice(3) : value;
}

export async function createPdaTestSession(input: {
  clientId: string;
  userId: string;
  clientSessionKey: string;
  preferredTestId?: string;
  userAgent?: string | null;
  deviceType?: string | null;
  deviceBrand?: string | null;
  deviceModel?: string | null;
  deviceOs?: string | null;
  readerType?: string | null;
  deviceMetadata?: Record<string, unknown> | null;
}) {
  const existing = await prisma.pdaTestSession.findUnique({
    where: { clientId_clientSessionKey: {
      clientId: input.clientId,
      clientSessionKey: input.clientSessionKey
    } }
  });
  if (existing) return { session: existing, duplicate: true };

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const session = await prisma.pdaTestSession.create({
        data: {
          clientId: input.clientId,
          createdById: input.userId,
          clientSessionKey: input.clientSessionKey,
          testId: attempt === 0 && input.preferredTestId ? input.preferredTestId : createVisibleTestId(),
          userAgent: input.userAgent,
          deviceType: input.deviceType,
          deviceBrand: input.deviceBrand,
          deviceModel: input.deviceModel,
          deviceOs: input.deviceOs,
          readerType: input.readerType,
          appVersion: commitVersion(),
          deviceMetadata: (input.deviceMetadata || undefined) as Prisma.InputJsonValue | undefined
        }
      });
      return { session, duplicate: false };
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") throw error;
      const raced = await prisma.pdaTestSession.findUnique({
        where: { clientId_clientSessionKey: {
          clientId: input.clientId,
          clientSessionKey: input.clientSessionKey
        } }
      });
      if (raced) return { session: raced, duplicate: true };
    }
  }
  throw new HttpError(409, "No se pudo asignar un testId único.", "PDA_TEST_ID_CONFLICT");
}

export async function listPdaTestSessions(clientId: string, limit = 100) {
  return prisma.pdaTestSession.findMany({
    where: { clientId },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true,
      testId: true,
      status: true,
      deviceType: true,
      deviceBrand: true,
      deviceModel: true,
      totalReadings: true,
      okReadings: true,
      notFoundReadings: true,
      failedReadings: true,
      successRate: true,
      startedAt: true,
      finalizedAt: true,
      createdAt: true
    }
  });
}

export async function getPdaTestSession(clientId: string, testId: string) {
  const session = await prisma.pdaTestSession.findFirst({
    where: { clientId, testId },
    include: sessionInclude
  });
  if (!session) throw new HttpError(404, "Sesión PDA no encontrada.", "PDA_SESSION_NOT_FOUND");
  return session;
}

export async function finalizePdaTestSession(clientId: string, sessionId: string) {
  await prisma.pdaTestSession.updateMany({
    where: { id: sessionId, clientId, status: "OPEN" },
    data: { status: "CLOSING", closingAt: new Date(), version: { increment: 1 } }
  });
  return serializableTransaction(async (tx) => {
    const session = await tx.pdaTestSession.findFirst({
      where: { id: sessionId, clientId },
      include: {
        readings: { select: { result: true, detectionMs: true, classificationMs: true } },
        runs: { select: { status: true, sealedAtSeq: true, receivedCount: true } }
      }
    });
    if (!session) throw new HttpError(404, "Sesión PDA no encontrada.", "PDA_SESSION_NOT_FOUND");
    if (session.status === "CLOSED" || session.status === "INCOMPLETE") return session;
    const nonTerminal = session.runs.filter(
      (run) => run.status !== "RELEASED" && run.status !== "INCOMPLETE"
    );
    if (nonTerminal.length) {
      throw new HttpError(
        409,
        "La sesión conserva rondas sin liberar.",
        "PDA_SESSION_RUNS_NOT_TERMINAL"
      );
    }
    const summary = calculatePdaSessionSummary(session.readings);
    const incompleteRuns = session.runs.filter((run) => run.status === "INCOMPLETE").length;
    const knownMissingAttempts = session.runs.reduce(
      (total, run) => total + Math.max(0, (run.sealedAtSeq ?? run.receivedCount) - run.receivedCount),
      0
    );
    return tx.pdaTestSession.update({
      where: { id: session.id },
      data: {
        status: incompleteRuns ? "INCOMPLETE" : "CLOSED",
        finalizedAt: new Date(),
        incompleteRuns,
        knownMissingAttempts,
        version: { increment: 1 },
        ...summary
      }
    });
  });
}

function csvCell(value: unknown): string {
  const raw = value === null || value === undefined ? "" : String(value);
  const safe = /^[=+\-@]/.test(raw) ? `'${raw}` : raw;
  return `"${safe.replaceAll('"', '""')}"`;
}

export function pdaSessionCsv(session: Awaited<ReturnType<typeof getPdaTestSession>>): string {
  const headers = [
    "fecha", "testId", "runId", "clientSeq", "attemptId", "dispositivo", "userAgent", "captura", "zona", "distancia", "esperado",
    "rawCode", "codigoNormalizado", "clasificacion", "resultado", "detectionMs", "classificationMs",
    "notas", "red", "version"
  ];
  const rows = session.readings.map((reading) => [
    reading.observedAt.toISOString(), session.testId,
    reading.runId, reading.clientSeq, reading.attemptId,
    [session.deviceType, session.deviceBrand, session.deviceModel, session.deviceOs].filter(Boolean).join(" "),
    session.userAgent, reading.captureMethod, reading.physicalZone, reading.distance, reading.expectedType,
    reading.rawCode, reading.normalizedCode, reading.classification, reading.result, reading.detectionMs,
    reading.classificationMs, reading.notes, JSON.stringify(reading.networkMetadata || {}), session.appVersion
  ]);
  return `\uFEFF${[headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n")}`;
}
