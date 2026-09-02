import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { Prisma } from "@prisma/client";
import { env } from "../../config/env.js";
import { prisma } from "../../db/prisma.js";
import { HttpError } from "../../shared/http-error.js";

export const PDA_COOKIE_NAME = "logitec_pda";
export const PDA_PAIRING_TTL_MS = 5 * 60 * 1000;
export const PDA_GRANT_TTL_MS = 8 * 60 * 60 * 1000;
export const PDA_SCOPES = ["pda:run", "pda:capture", "pda:release"] as const;

function pepper(): string {
  // Backward-compatible locally; production must configure an independent pepper.
  return env.PDA_GRANT_PEPPER || createHmac("sha256", env.JWT_SECRET).update("logitec:pda:v1").digest("hex");
}

export function digestPdaSecret(secret: string): string {
  return createHmac("sha256", pepper()).update(secret).digest("hex");
}

export function pdaGrantFailure(
  grant: { status: string; expiresAt: Date },
  now = new Date()
): "PDA_GRANT_REVOKED" | "PDA_GRANT_EXPIRED" | null {
  if (grant.status !== "ACTIVE") return "PDA_GRANT_REVOKED";
  if (grant.expiresAt <= now) return "PDA_GRANT_EXPIRED";
  return null;
}

function opaqueSecret(): string {
  return randomBytes(32).toString("base64url");
}

function publicId(prefix: string): string {
  return `${prefix}-${randomBytes(9).toString("base64url")}`;
}

function equalDigest(left: string, right: string): boolean {
  const a = Buffer.from(left, "hex");
  const b = Buffer.from(right, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
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

export async function createPdaPairingChallenge(input: {
  clientId: string;
  sessionId: string;
  userId: string;
}) {
  const session = await prisma.pdaTestSession.findFirst({
    where: { id: input.sessionId, clientId: input.clientId, status: "OPEN" },
    select: { id: true, testId: true }
  });
  if (!session) throw new HttpError(404, "Sesión PDA abierta no encontrada.", "PDA_SESSION_NOT_FOUND");

  const secret = opaqueSecret();
  const challenge = await prisma.pdaPairingChallenge.create({
    data: {
      publicId: publicId("PAIR"),
      clientId: input.clientId,
      sessionId: session.id,
      secretDigest: digestPdaSecret(secret),
      expiresAt: new Date(Date.now() + PDA_PAIRING_TTL_MS),
      createdById: input.userId
    },
    select: { publicId: true, expiresAt: true }
  });
  return {
    challengeId: challenge.publicId,
    secret,
    expiresAt: challenge.expiresAt,
    testId: session.testId,
    payload: JSON.stringify({ v: 1, challengeId: challenge.publicId, secret })
  };
}

export async function exchangePdaPairingChallenge(input: {
  challengeId: string;
  secret: string;
}) {
  const preflight = await prisma.pdaPairingChallenge.findUnique({
    where: { publicId: input.challengeId },
    select: {
      id: true,
      secretDigest: true,
      consumedAt: true,
      attempts: true,
      maxAttempts: true,
      expiresAt: true
    }
  });
  if (!preflight) throw new HttpError(401, "Emparejamiento inválido.", "PDA_PAIRING_INVALID");
  if (preflight.consumedAt) throw new HttpError(409, "Emparejamiento ya utilizado.", "PDA_PAIRING_REPLAY");
  if (preflight.expiresAt <= new Date() || preflight.attempts >= preflight.maxAttempts) {
    throw new HttpError(401, "Emparejamiento vencido o bloqueado.", "PDA_PAIRING_EXPIRED");
  }
  const suppliedDigest = digestPdaSecret(input.secret);
  if (!equalDigest(preflight.secretDigest, suppliedDigest)) {
    await prisma.pdaPairingChallenge.updateMany({
      where: {
        id: preflight.id,
        consumedAt: null,
        attempts: { lt: preflight.maxAttempts },
        expiresAt: { gt: new Date() }
      },
      data: { attempts: { increment: 1 } }
    });
    throw new HttpError(401, "Emparejamiento inválido.", "PDA_PAIRING_INVALID");
  }

  return serializable(async (tx) => {
    const challenge = await tx.pdaPairingChallenge.findUnique({
      where: { publicId: input.challengeId },
      include: { session: { select: { status: true, testId: true } } }
    });
    if (!challenge) throw new HttpError(401, "Emparejamiento inválido.", "PDA_PAIRING_INVALID");
    if (challenge.consumedAt) throw new HttpError(409, "Emparejamiento ya utilizado.", "PDA_PAIRING_REPLAY");
    if (challenge.expiresAt <= new Date() || challenge.attempts >= challenge.maxAttempts) {
      throw new HttpError(401, "Emparejamiento vencido o bloqueado.", "PDA_PAIRING_EXPIRED");
    }

    if (!equalDigest(challenge.secretDigest, suppliedDigest)) {
      throw new HttpError(401, "Emparejamiento inválido.", "PDA_PAIRING_INVALID");
    }
    if (challenge.session.status !== "OPEN") {
      throw new HttpError(409, "La sesión ya no admite dispositivos.", "PDA_SESSION_NOT_OPEN");
    }

    const consumed = await tx.pdaPairingChallenge.updateMany({
      where: { id: challenge.id, consumedAt: null, attempts: { lt: challenge.maxAttempts } },
      data: { consumedAt: new Date(), attempts: { increment: 1 } }
    });
    if (consumed.count !== 1) throw new HttpError(409, "Emparejamiento ya utilizado.", "PDA_PAIRING_REPLAY");

    const token = opaqueSecret();
    const grant = await tx.pdaLabGrant.create({
      data: {
        publicId: publicId("GRANT"),
        clientId: challenge.clientId,
        sessionId: challenge.sessionId,
        tokenDigest: digestPdaSecret(token),
        scopes: [...PDA_SCOPES],
        expiresAt: new Date(Date.now() + PDA_GRANT_TTL_MS),
        createdById: challenge.createdById,
        challengeId: challenge.id
      },
      select: { publicId: true, expiresAt: true, sessionId: true }
    });
    return { token, grant, testId: challenge.session.testId };
  });
}

export async function revokePdaGrant(input: {
  grantId: string;
  clientId: string;
  reason: string;
  tx?: Prisma.TransactionClient;
}) {
  const db = input.tx || prisma;
  await db.pdaLabGrant.updateMany({
    where: { id: input.grantId, clientId: input.clientId, status: "ACTIVE" },
    data: { status: "REVOKED", revokedAt: new Date(), revokeReason: input.reason }
  });
}

export async function expirePdaGrant(grantId: string) {
  await prisma.pdaLabGrant.updateMany({
    where: { id: grantId, status: "ACTIVE", expiresAt: { lte: new Date() } },
    data: { status: "EXPIRED" }
  });
}
