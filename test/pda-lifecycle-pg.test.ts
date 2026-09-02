import assert from "node:assert/strict";
import { after, before, test } from "node:test";

const databaseUrl = process.env.TEST_DATABASE_URL;
const ids = {
  client: "pda-pg-client-a194",
  user: "pda-pg-admin-a194",
  sessionKey: "pda-pg-session-a194"
};

let prisma: any;
let services: any;

before(async () => {
  if (!databaseUrl) return;
  process.env.NODE_ENV = "test";
  process.env.DATABASE_ENVIRONMENT = "qa";
  process.env.DATABASE_URL = databaseUrl;
  process.env.PRODUCTION_DATABASE_HOST = "production.invalid";
  process.env.JWT_SECRET ||= "test-only-pda-secret-at-least-32-characters";
  process.env.PDA_TOKEN_PEPPER ||= "test-only-pda-pepper-at-least-32-characters";
  prisma = (await import("../src/db/prisma.js")).prisma;
  const auth = await import("../src/modules/pda/pda-auth.service.js");
  const run = await import("../src/modules/pda/pda-run.service.js");
  const evidence = await import("../src/modules/admin/pda-test-evidence.service.js");
  services = { ...auth, ...run, ...evidence };
  await prisma.client.upsert({
    where: { id: ids.client },
    update: { active: true },
    create: {
      id: ids.client,
      code: "PDA-PG-A194",
      name: "PDA PG Test",
      active: true
    }
  });
  await prisma.user.upsert({
    where: { id: ids.user },
    update: { isActive: true },
    create: {
      id: ids.user,
      email: "pda-pg-a194@test.local",
      passwordHash: "not-used",
      fullName: "PDA PG Test",
      role: "ADMIN",
      isActive: true
    }
  });
});

after(async () => {
  if (!databaseUrl || !prisma) return;
  const sessions = await prisma.pdaTestSession.findMany({
    where: { clientId: ids.client },
    select: { id: true }
  });
  const sessionIds = sessions.map((row: any) => row.id);
  await prisma.pdaTestReading.deleteMany({ where: { clientId: ids.client } });
  await prisma.pdaCaptureRun.deleteMany({ where: { clientId: ids.client } });
  await prisma.pdaLabGrant.deleteMany({ where: { clientId: ids.client } });
  await prisma.pdaPairingChallenge.deleteMany({ where: { clientId: ids.client } });
  await prisma.pdaTestSession.deleteMany({ where: { id: { in: sessionIds } } });
  await prisma.user.deleteMany({ where: { id: ids.user } });
  await prisma.client.deleteMany({ where: { id: ids.client } });
  await prisma.$disconnect();
});

test("PostgreSQL: concurrencia, repetición, retry, reconcile y revocación", {
  skip: databaseUrl ? false : "TEST_DB_UNAVAILABLE"
}, async () => {
  const created = await services.createPdaTestSession({
    clientId: ids.client,
    userId: ids.user,
    clientSessionKey: ids.sessionKey,
    preferredTestId: "PDA-20260902-PGTEST"
  });
  const pairing = await services.createPdaPairing({
    clientId: ids.client,
    sessionId: created.session.id,
    createdById: ids.user
  });
  const qr = pairing.qrPayload.slice("LOGITEC-PDA1:".length);
  const separator = qr.indexOf(".");
  const exchanged = await services.exchangePdaPairing({
    pairingId: qr.slice(0, separator),
    secret: qr.slice(separator + 1),
    mode: "QR"
  });
  const grant = await services.authenticatePdaGrant(exchanged.token);

  const competing = await Promise.allSettled([
    services.createPdaRun(grant, "run-key-a194-0001"),
    services.createPdaRun(grant, "run-key-a194-0002")
  ]);
  assert.equal(competing.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(competing.filter((result) => result.status === "rejected").length, 1);
  const fulfilled = competing.find((result) => result.status === "fulfilled") as PromiseFulfilledResult<any>;
  const run = fulfilled.value.run;

  const diagnosticReader = {
    findProducts: async () => [],
    findLocations: async () => [],
    findLots: async () => [],
    findSerials: async () => []
  };
  const base = {
    epoch: run.epoch,
    observedAt: new Date("2026-09-02T10:00:00Z"),
    rawCode: "SAME-CODE",
    expectedType: "SKU",
    captureMode: "HID",
    captureMethod: "Scanner keyboard wedge",
    physicalZone: "AN20"
  };
  const firstInput = {
    ...base,
    clientSeq: 1,
    attemptId: "attempt-a194-0001",
    idempotencyKey: "attempt-a194-0001"
  };
  const first = await services.recordPdaRunReading(grant, run.id, firstInput, diagnosticReader);
  const retry = await services.recordPdaRunReading(grant, run.id, firstInput, diagnosticReader);
  const second = await services.recordPdaRunReading(grant, run.id, {
    ...base,
    clientSeq: 2,
    attemptId: "attempt-a194-0002",
    idempotencyKey: "attempt-a194-0002"
  }, diagnosticReader);
  assert.equal(first.duplicate, false);
  assert.equal(retry.duplicate, true);
  assert.equal(second.duplicate, false);
  assert.equal(await prisma.pdaTestReading.count({ where: { runId: run.id } }), 2);

  await services.sealPdaRun(grant, run.id, 2);
  const reconciled = await services.reconcilePdaRun(grant, run.id);
  assert.equal(reconciled.reconciled, true);
  assert.deepEqual(reconciled.missing, []);

  const releaseNonce = "release-a194-00000000000000000000000000000000";
  await services.preparePdaRelease(grant, releaseNonce);
  const released = await services.confirmPdaRelease(
    { ...grant, status: "DRAIN_ONLY" },
    {
      releaseNonce,
      captureStoppedConfirmed: true,
      localCleanupConfirmed: true,
      noDownloadsConfirmed: true
    }
  );
  assert.equal(released.safeToReturn, true);
  await assert.rejects(
    () => services.authenticatePdaGrant(exchanged.token),
    (error: any) => error.code === "PDA_GRANT_REVOKED"
  );
});
