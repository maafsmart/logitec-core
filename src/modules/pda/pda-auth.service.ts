import { createHmac, randomBytes } from "node:crypto";
import { PdaGrantStatus, PdaPairingStatus, Prisma } from "@prisma/client";
import { env } from "../../config/env.js";
import { prisma } from "../../db/prisma.js";
import { HttpError } from "../../shared/http-error.js";

export const PDA_COOKIE_NAME = "__Secure-logitec_pda";
export const PDA_SCOPE = "PDA_SESSION_CAPTURE_V1";
const PAIRING_TTL_MS = 5 * 60 * 1000;
const GRANT_TTL_MS = 8 * 60 * 60 * 1000;
const exchangeAttempts = new Map<string, { count: number; resetAt: number }>();

function opaqueId(prefix: string): string {
  return `${prefix}_${randomBytes(16).toString("hex")}`;
}

function pepper(): string {
  return env.PDA_TOKEN_PEPPER || `${env.JWT_SECRET}:pda-v1`;
}

export function digestPdaSecret(purpose: string, value: string): string {
  return createHmac("sha256", pepper()).update(`${purpose}\0${value}`).digest("hex");
}

function base32(bytes: Uint8Array): string {
  const alphabet = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
  let bits = 0;
  let value = 0;
  let output = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += alphabet[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits) output += alphabet[(value << (5 - bits)) & 31];
  return output;
}

export function formatManualSecret(value: string): string {
  return value.match(/.{1,4}/g)?.join("-") || value;
}

export function pdaGrantCookie(token: string): string {
  return `${PDA_COOKIE_NAME}=${encodeURIComponent(token)}; Path=/api/pda; HttpOnly; Secure; SameSite=Strict`;
}

export function clearPdaGrantCookie(): string {
  return `${PDA_COOKIE_NAME}=; Path=/api/pda; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;
}

export function tokenFromCookie(cookieHeader?: string): string | null {
  if (!cookieHeader) return null;
  for (const item of cookieHeader.split(";")) {
    const [name, ...parts] = item.trim().split("=");
    if (name === PDA_COOKIE_NAME) return decodeURIComponent(parts.join("="));
  }
  return null;
}

export function assertPdaExchangeRate(ip: string): void {
  const now = Date.now();
  const key = ip || "unknown";
  const current = exchangeAttempts.get(key);
  if (!current || current.resetAt <= now) {
    exchangeAttempts.set(key, { count: 1, resetAt: now + 60_000 });
    return;
  }
  current.count += 1;
  if (current.count > 10) {
    throw new HttpError(429, "Demasiados intentos de emparejamiento.", "PDA_PAIRING_RATE_LIMITED");
  }
}

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

export async function createPdaPairing(input: {
  clientId: string;
  sessionId: string;
  createdById: string;
}) {
  const session = await prisma.pdaTestSession.findFirst({
    where: { id: input.sessionId, clientId: input.clientId, status: "OPEN" },
    select: { id: true, testId: true }
  });
  if (!session) throw new HttpError(404, "Sesión PDA abierta no encontrada.", "PDA_SESSION_NOT_FOUND");

  const publicId = opaqueId("PAIR");
  const qrSecret = randomBytes(32).toString("base64url");
  const manualRaw = base32(randomBytes(17)).slice(0, 26);
  const manualSecret = formatManualSecret(manualRaw);
  const expiresAt = new Date(Date.now() + PAIRING_TTL_MS);
  await prisma.pdaPairingChallenge.create({
    data: {
      publicId,
      clientId: input.clientId,
      sessionId: input.sessionId,
      createdById: input.createdById,
      qrSecretDigest: digestPdaSecret("pairing:qr", qrSecret),
      manualSecretDigest: digestPdaSecret("pairing:manual", manualRaw),
      expiresAt
    }
  });
  return {
    pairingId: publicId,
    testId: session.testId,
    expiresAt,
    qrPayload: `LOGITEC-PDA1:${publicId}.${qrSecret}`,
    manualCode: `${publicId}.${manualSecret}`
  };
}

function normalizeManualSecret(value: string): string {
  return value.replaceAll("-", "").trim().toUpperCase();
}

export async function exchangePdaPairing(input: {
  pairingId: string;
  secret: string;
  mode: "QR" | "MANUAL";
}) {
  const now = new Date();
  const result = await serializable(async (tx): Promise<
    | { error: { status: number; message: string; code: string }; value?: never }
    | {
        error: null;
        value: {
          token: string;
          grant: {
            publicId: string;
            sessionId: string;
            testId: string;
            scope: string;
            expiresAt: Date;
          };
        };
      }
  > => {
    const pairing = await tx.pdaPairingChallenge.findUnique({
      where: { publicId: input.pairingId }
    });
    if (!pairing) {
      throw new HttpError(401, "Emparejamiento inválido o vencido.", "PDA_PAIRING_INVALID");
    }
    if (pairing.status !== PdaPairingStatus.PENDING) {
      throw new HttpError(410, "El emparejamiento ya no está disponible.", "PDA_PAIRING_CONSUMED");
    }
    if (pairing.expiresAt <= now) {
      await tx.pdaPairingChallenge.update({
        where: { id: pairing.id },
        data: { status: PdaPairingStatus.EXPIRED }
      });
      return {
        error: {
          status: 410,
          message: "El emparejamiento venció.",
          code: "PDA_PAIRING_EXPIRED"
        }
      };
    }
    const supplied = input.mode === "QR" ? input.secret.trim() : normalizeManualSecret(input.secret);
    const digest = digestPdaSecret(input.mode === "QR" ? "pairing:qr" : "pairing:manual", supplied);
    const expected = input.mode === "QR" ? pairing.qrSecretDigest : pairing.manualSecretDigest;
    if (digest !== expected) {
      const attempts = pairing.failedAttempts + 1;
      await tx.pdaPairingChallenge.update({
        where: { id: pairing.id },
        data: {
          failedAttempts: attempts,
          status: attempts >= pairing.maxAttempts ? PdaPairingStatus.LOCKED : PdaPairingStatus.PENDING
        }
      });
      return {
        error: {
          status: 401,
          message: "Emparejamiento inválido o vencido.",
          code: "PDA_PAIRING_INVALID"
        }
      };
    }

    const consumed = await tx.pdaPairingChallenge.updateMany({
      where: { id: pairing.id, status: PdaPairingStatus.PENDING, expiresAt: { gt: now } },
      data: { status: PdaPairingStatus.CONSUMED, consumedAt: now }
    });
    if (consumed.count !== 1) {
      throw new HttpError(410, "El emparejamiento ya fue utilizado.", "PDA_PAIRING_CONSUMED");
    }

    const token = randomBytes(32).toString("base64url");
    const grant = await tx.pdaLabGrant.create({
      data: {
        publicId: opaqueId("GRANT"),
        clientId: pairing.clientId,
        sessionId: pairing.sessionId,
        pairingId: pairing.id,
        tokenDigest: digestPdaSecret("grant", token),
        createdById: pairing.createdById,
        expiresAt: new Date(now.getTime() + GRANT_TTL_MS)
      },
      include: { session: { select: { testId: true } } }
    });
    return {
      error: null,
      value: {
        token,
        grant: {
          publicId: grant.publicId,
          sessionId: grant.sessionId,
          testId: grant.session.testId,
          scope: grant.scope,
          expiresAt: grant.expiresAt
        }
      }
    };
  });
  if (result.error) {
    throw new HttpError(result.error.status, result.error.message, result.error.code);
  }
  return result.value;
}

export type PdaGrantContext = {
  id: string;
  publicId: string;
  clientId: string;
  sessionId: string;
  createdById: string;
  status: PdaGrantStatus;
  expiresAt: Date;
};

async function markRevokedGrantReuse(grantId: string) {
  await prisma.$transaction(async (tx) => {
    const runs = await tx.pdaCaptureRun.findMany({
      where: { grantId },
      select: { id: true, deviceMetadata: true }
    });
    for (const run of runs) {
      const root = run.deviceMetadata && typeof run.deviceMetadata === "object" &&
        !Array.isArray(run.deviceMetadata)
        ? { ...(run.deviceMetadata as Record<string, unknown>) }
        : {};
      const current = root.remotePhysicalQa && typeof root.remotePhysicalQa === "object" &&
        !Array.isArray(root.remotePhysicalQa)
        ? { ...(root.remotePhysicalQa as Record<string, unknown>) }
        : {};
      const steps = current.steps && typeof current.steps === "object" &&
        !Array.isArray(current.steps)
        ? { ...(current.steps as Record<string, unknown>) }
        : {};
      const previous = steps.REVOKED_401 as { status?: string } | undefined;
      if (previous?.status === "PASS" || previous?.status === "FAIL") continue;
      steps.REVOKED_401 = {
        status: "PASS",
        source: "SERVER",
        recordedAt: new Date().toISOString(),
        detail: "Bearer PDA revocado presentado y rechazado con 401."
      };
      await tx.pdaCaptureRun.update({
        where: { id: run.id },
        data: {
          deviceMetadata: {
            ...root,
            remotePhysicalQa: { ...current, steps }
          } as Prisma.InputJsonValue,
          version: { increment: 1 }
        }
      });
    }
  });
}

export async function authenticatePdaGrant(token: string): Promise<PdaGrantContext> {
  const now = new Date();
  const grant = await prisma.pdaLabGrant.findUnique({
    where: { tokenDigest: digestPdaSecret("grant", token) },
    select: {
      id: true,
      publicId: true,
      clientId: true,
      sessionId: true,
      createdById: true,
      status: true,
      expiresAt: true,
      scope: true
    }
  });
  if (!grant || grant.scope !== PDA_SCOPE) {
    throw new HttpError(401, "Capacidad PDA inválida.", "PDA_GRANT_INVALID");
  }
  if (grant.status === PdaGrantStatus.REVOKED) {
    try {
      await markRevokedGrantReuse(grant.id);
    } catch {
      throw new HttpError(
        503,
        "Grant revocado; auditoría de rechazo no persistida.",
        "PDA_REVOCATION_AUDIT_FAILED"
      );
    }
    throw new HttpError(401, "Capacidad PDA revocada.", "PDA_GRANT_REVOKED");
  }
  if (grant.expiresAt <= now) {
    if (grant.status !== PdaGrantStatus.EXPIRED) {
      await prisma.pdaLabGrant.updateMany({
        where: { id: grant.id, status: { in: [PdaGrantStatus.ACTIVE, PdaGrantStatus.DRAIN_ONLY] } },
        data: { status: PdaGrantStatus.EXPIRED, revokedAt: now, revokeReason: "EXPIRED" }
      });
    }
    throw new HttpError(401, "Capacidad PDA vencida.", "PDA_GRANT_EXPIRED");
  }
  if (grant.status !== PdaGrantStatus.ACTIVE && grant.status !== PdaGrantStatus.DRAIN_ONLY) {
    throw new HttpError(401, "Capacidad PDA revocada.", "PDA_GRANT_REVOKED");
  }
  await prisma.pdaLabGrant.update({
    where: { id: grant.id },
    data: { lastUsedAt: now }
  });
  return grant;
}

export async function revokePdaGrant(input: {
  clientId: string;
  sessionId: string;
  grantId: string;
  reason: string;
}) {
  const result = await prisma.pdaLabGrant.updateMany({
    where: {
      id: input.grantId,
      clientId: input.clientId,
      sessionId: input.sessionId,
      status: { in: [PdaGrantStatus.ACTIVE, PdaGrantStatus.DRAIN_ONLY] }
    },
    data: {
      status: PdaGrantStatus.REVOKED,
      revokedAt: new Date(),
      captureRevokedAt: new Date(),
      revokeReason: input.reason,
      version: { increment: 1 }
    }
  });
  if (!result.count) throw new HttpError(404, "Grant PDA no encontrado.", "PDA_GRANT_NOT_FOUND");
}

export async function pdaReleaseStatus(input: { grantPublicId: string; releaseNonce: string }) {
  const grant = await prisma.pdaLabGrant.findUnique({
    where: { publicId: input.grantPublicId },
    select: {
      status: true,
      releaseNonceDigest: true,
      releaseReceiptId: true,
      releaseConfirmedAt: true
    }
  });
  if (
    !grant?.releaseNonceDigest ||
    grant.releaseNonceDigest !== digestPdaSecret("release", input.releaseNonce)
  ) {
    throw new HttpError(404, "Confirmación de liberación no encontrada.", "PDA_RELEASE_NOT_FOUND");
  }
  return {
    safeToReturn:
      grant.status === PdaGrantStatus.REVOKED &&
      Boolean(grant.releaseReceiptId && grant.releaseConfirmedAt),
    receiptId: grant.releaseReceiptId,
    releasedAt: grant.releaseConfirmedAt
  };
}
