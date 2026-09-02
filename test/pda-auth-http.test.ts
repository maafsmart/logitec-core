import assert from "node:assert/strict";
import { after, before, test } from "node:test";

process.env.NODE_ENV = "test";
process.env.DATABASE_ENVIRONMENT = "qa";
process.env.DATABASE_URL = "postgresql://user:pass@localhost:5432/logitec_test";
process.env.PRODUCTION_DATABASE_HOST = "production.invalid";
process.env.JWT_SECRET = "test-only-pda-secret-at-least-32-characters";
process.env.PDA_TOKEN_PEPPER = "test-only-pda-pepper-at-least-32-characters";

const { prisma } = await import("../src/db/prisma.js");
const {
  PDA_COOKIE_NAME,
  assertPdaExchangeRate,
  authenticatePdaGrant,
  createPdaPairing,
  digestPdaSecret,
  exchangePdaPairing,
  pdaGrantCookie,
  revokePdaGrant,
  tokenFromCookie
} = await import("../src/modules/pda/pda-auth.service.js");

const original = {
  transaction: prisma.$transaction,
  sessionFindFirst: prisma.pdaTestSession.findFirst,
  pairingCreate: prisma.pdaPairingChallenge.create,
  pairingFindUnique: prisma.pdaPairingChallenge.findUnique,
  pairingUpdate: prisma.pdaPairingChallenge.update,
  pairingUpdateMany: prisma.pdaPairingChallenge.updateMany,
  grantCreate: prisma.pdaLabGrant.create,
  grantFindUnique: prisma.pdaLabGrant.findUnique,
  grantUpdate: prisma.pdaLabGrant.update,
  grantUpdateMany: prisma.pdaLabGrant.updateMany
};

let pairing: any;
let grant: any;

before(() => {
  (prisma as any).$transaction = async (operation: (tx: any) => unknown) => operation(prisma);
  (prisma.pdaTestSession as any).findFirst = async ({ where }: any) =>
    where.id === "session-a" && where.clientId === "client-a"
      ? { id: "session-a", testId: "PDA-20260902-TEST01" }
      : null;
  (prisma.pdaPairingChallenge as any).create = async ({ data }: any) => {
    pairing = { id: "pair-db", ...data, status: "PENDING", failedAttempts: 0, maxAttempts: 5 };
    return pairing;
  };
  (prisma.pdaPairingChallenge as any).findUnique = async ({ where }: any) =>
    pairing?.publicId === where.publicId ? pairing : null;
  (prisma.pdaPairingChallenge as any).update = async ({ data }: any) => {
    pairing = { ...pairing, ...data };
    return pairing;
  };
  (prisma.pdaPairingChallenge as any).updateMany = async ({ where, data }: any) => {
    if (pairing?.id !== where.id || pairing.status !== where.status || pairing.expiresAt <= new Date()) {
      return { count: 0 };
    }
    pairing = { ...pairing, ...data };
    return { count: 1 };
  };
  (prisma.pdaLabGrant as any).create = async ({ data }: any) => {
    grant = {
      id: "grant-db",
      ...data,
      status: "ACTIVE",
      scope: "PDA_SESSION_CAPTURE_V1",
      session: { testId: "PDA-20260902-TEST01" }
    };
    return grant;
  };
  (prisma.pdaLabGrant as any).findUnique = async ({ where }: any) => {
    if (where.tokenDigest && grant?.tokenDigest !== where.tokenDigest) return null;
    return grant;
  };
  (prisma.pdaLabGrant as any).update = async ({ data }: any) => {
    grant = { ...grant, ...data };
    return grant;
  };
  (prisma.pdaLabGrant as any).updateMany = async ({ where, data }: any) => {
    const statuses = where.status?.in || [where.status];
    if (
      grant?.id !== where.id ||
      (where.clientId && grant.clientId !== where.clientId) ||
      (where.sessionId && grant.sessionId !== where.sessionId) ||
      (where.status && !statuses.includes(grant.status))
    ) return { count: 0 };
    grant = { ...grant, ...data };
    return { count: 1 };
  };
});

after(async () => {
  (prisma as any).$transaction = original.transaction;
  (prisma.pdaTestSession as any).findFirst = original.sessionFindFirst;
  (prisma.pdaPairingChallenge as any).create = original.pairingCreate;
  (prisma.pdaPairingChallenge as any).findUnique = original.pairingFindUnique;
  (prisma.pdaPairingChallenge as any).update = original.pairingUpdate;
  (prisma.pdaPairingChallenge as any).updateMany = original.pairingUpdateMany;
  (prisma.pdaLabGrant as any).create = original.grantCreate;
  (prisma.pdaLabGrant as any).findUnique = original.grantFindUnique;
  (prisma.pdaLabGrant as any).update = original.grantUpdate;
  (prisma.pdaLabGrant as any).updateMany = original.grantUpdateMany;
  await prisma.$disconnect();
});

test("pairing QR es one-shot y crea grant tenant/session-bound", async () => {
  const issued = await createPdaPairing({
    clientId: "client-a",
    sessionId: "session-a",
    createdById: "admin-a"
  });
  const encoded = issued.qrPayload.slice("LOGITEC-PDA1:".length);
  const separator = encoded.indexOf(".");
  const first = await exchangePdaPairing({
    pairingId: encoded.slice(0, separator),
    secret: encoded.slice(separator + 1),
    mode: "QR"
  });
  assert.equal(first.grant.sessionId, "session-a");
  assert.equal(grant.clientId, "client-a");
  assert.equal(grant.createdById, "admin-a");
  assert.equal(pairing.status, "CONSUMED");
  await assert.rejects(
    () => exchangePdaPairing({
      pairingId: issued.pairingId,
      secret: encoded.slice(separator + 1),
      mode: "QR"
    }),
    (error: any) => error.code === "PDA_PAIRING_CONSUMED"
  );
});

test("cookie es focal y el token nunca se guarda en claro en el modelo", () => {
  const cookie = pdaGrantCookie("opaque-token");
  assert.match(cookie, new RegExp(`^${PDA_COOKIE_NAME}=`));
  assert.match(cookie, /Path=\/api\/pda; HttpOnly; Secure; SameSite=Strict/);
  assert.equal(tokenFromCookie(`other=x; ${cookie.split(";")[0]}`), "opaque-token");
  assert.notEqual(digestPdaSecret("grant", "opaque-token"), "opaque-token");
  assert.notEqual(digestPdaSecret("grant", "same"), digestPdaSecret("pairing:qr", "same"));
});

test("grant revocado y revocación cross-tenant fallan", async () => {
  const token = "known-token";
  grant = {
    ...grant,
    id: "grant-db",
    tokenDigest: digestPdaSecret("grant", token),
    clientId: "client-a",
    sessionId: "session-a",
    createdById: "admin-a",
    publicId: "GRANT_PUBLIC",
    scope: "PDA_SESSION_CAPTURE_V1",
    status: "ACTIVE",
    expiresAt: new Date(Date.now() + 60_000)
  };
  assert.equal((await authenticatePdaGrant(token)).clientId, "client-a");
  await assert.rejects(
    () => revokePdaGrant({
      clientId: "client-b",
      sessionId: "session-a",
      grantId: "grant-db",
      reason: "wrong tenant"
    }),
    (error: any) => error.code === "PDA_GRANT_NOT_FOUND"
  );
  await revokePdaGrant({
    clientId: "client-a",
    sessionId: "session-a",
    grantId: "grant-db",
    reason: "test release"
  });
  await assert.rejects(
    () => authenticatePdaGrant(token),
    (error: any) => error.code === "PDA_GRANT_REVOKED"
  );
});

test("cinco secretos incorrectos persisten y bloquean el pairing", async () => {
  const issued = await createPdaPairing({
    clientId: "client-a",
    sessionId: "session-a",
    createdById: "admin-a"
  });
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    await assert.rejects(
      () => exchangePdaPairing({
        pairingId: issued.pairingId,
        secret: `INCORRECT-SECRET-${attempt}-LONG`,
        mode: "QR"
      }),
      (error: any) => error.code === "PDA_PAIRING_INVALID"
    );
    assert.equal(pairing.failedAttempts, attempt);
  }
  assert.equal(pairing.status, "LOCKED");
});

test("rate limit bloquea brute force por origen", () => {
  for (let index = 0; index < 10; index += 1) assertPdaExchangeRate("192.0.2.10");
  assert.throws(
    () => assertPdaExchangeRate("192.0.2.10"),
    (error: any) => error.code === "PDA_PAIRING_RATE_LIMITED"
  );
});
