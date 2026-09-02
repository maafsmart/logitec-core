import assert from "node:assert/strict";
import { after, before, test } from "node:test";

const databaseUrl = process.env.TEST_DATABASE_URL;
const prefix = `PDAQA${Date.now()}`;
const clientA = "qa-client-aviat";
const clientB = "qa-client-beta";
const adminA = "qa-admin-a";
const adminB = "qa-admin-b";

let prisma: any;
let services: any;
let operationalBefore: number[] = [];

const diagnosticReader = {
  findProducts: async () => [],
  findLocations: async () => [],
  findLots: async () => [],
  findSerials: async () => []
};

function codeOf(error: any): string | undefined {
  return error?.code;
}

async function expectCode(operation: Promise<unknown>, code: string, status?: number) {
  await assert.rejects(operation, (error: any) => {
    assert.equal(error.code, code);
    if (status !== undefined) assert.equal(error.statusCode, status);
    return true;
  });
}

async function operationalSnapshot() {
  return Promise.all([
    prisma.product.count(),
    prisma.warehouse.count(),
    prisma.location.count(),
    prisma.inventory.count(),
    prisma.inventoryLayer.count(),
    prisma.inventorySerial.count(),
    prisma.inventoryMovement.count(),
    prisma.scanEvent.count(),
    prisma.task.count(),
    prisma.requisition.count(),
    prisma.requisitionLine.count(),
    prisma.inventoryReservation.count(),
    prisma.importBatch.count(),
    prisma.importRow.count(),
    prisma.activityLog.count(),
    prisma.incident.count(),
    prisma.comment.count()
  ]);
}

async function newSession(clientId: string, userId: string, suffix: string) {
  return (await services.createPdaTestSession({
    clientId,
    userId,
    clientSessionKey: `${prefix}-${suffix}`,
    preferredTestId: `PDA-20260902-${suffix}`
  })).session;
}

async function newGrant(clientId: string, userId: string, sessionId: string) {
  const pairing = await services.createPdaPairing({
    clientId,
    sessionId,
    createdById: userId
  });
  const encoded = pairing.qrPayload.slice("LOGITEC-PDA1:".length);
  const separator = encoded.indexOf(".");
  const exchanged = await services.exchangePdaPairing({
    pairingId: encoded.slice(0, separator),
    secret: encoded.slice(separator + 1),
    mode: "QR"
  });
  return {
    token: exchanged.token,
    grant: await services.authenticatePdaGrant(exchanged.token)
  };
}

function reading(run: any, seq: number, rawCode = "QA-REPEATED") {
  const attemptId = `${prefix}-ATTEMPT-${run.id}-${seq}-${Math.random()}`;
  return {
    epoch: run.epoch,
    clientSeq: seq,
    attemptId,
    idempotencyKey: attemptId,
    observedAt: new Date(),
    rawCode,
    expectedType: "SKU",
    captureMode: "HID",
    captureMethod: "QA HID",
    physicalZone: "QA-ZONE",
    distance: "1m",
    detectionMs: 5,
    notes: "synthetic QA",
    networkMetadata: { source: "isolated-postgresql-qa" }
  };
}

async function reconcile(grant: any, run: any, sealedAtSeq: number) {
  await services.sealPdaRun(grant, run.id, sealedAtSeq);
  const result = await services.reconcilePdaRun(grant, run.id);
  assert.equal(result.reconciled, true);
  return result;
}

async function release(grant: any, run: any) {
  const nonce = `${prefix}-RELEASE-${run.id}-00000000000000000000`;
  await services.preparePdaRelease(grant, nonce);
  return services.confirmPdaRelease(
    { ...grant, status: "DRAIN_ONLY" },
    {
      releaseNonce: nonce,
      captureStoppedConfirmed: true,
      localCleanupConfirmed: true,
      noDownloadsConfirmed: true
    }
  );
}

before(async () => {
  if (!databaseUrl) return;
  process.env.NODE_ENV = "test";
  process.env.DATABASE_ENVIRONMENT = "qa";
  process.env.DATABASE_URL = databaseUrl;
  process.env.PRODUCTION_DATABASE_HOST = "production.invalid";
  process.env.JWT_SECRET ||= "qa-only-jwt-secret-not-production";
  process.env.PDA_TOKEN_PEPPER ||= "qa-only-pda-pepper-at-least-32-characters";
  prisma = (await import("../src/db/prisma.js")).prisma;
  services = {
    ...(await import("../src/modules/pda/pda-auth.service.js")),
    ...(await import("../src/modules/pda/pda-run.service.js")),
    ...(await import("../src/modules/admin/pda-test-evidence.service.js"))
  };
  operationalBefore = await operationalSnapshot();
});

after(async () => {
  if (!databaseUrl || !prisma) return;
  assert.deepEqual(
    await operationalSnapshot(),
    operationalBefore,
    "La suite PDA no debe escribir en tablas operativas."
  );
  await prisma.$disconnect();
});

test("PostgreSQL QA disponible", () => {
  assert.ok(databaseUrl);
});

test("migración conserva legacy, tenant y constraints/índices", {
  skip: databaseUrl ? false : "TEST_DB_UNAVAILABLE"
}, async () => {
  const sessions = await prisma.pdaTestSession.findMany({
    where: { id: { in: ["qa-legacy-session-a", "qa-legacy-session-b"] } },
    include: { runs: true, readings: true },
    orderBy: { id: "asc" }
  });
  assert.equal(sessions.length, 2);
  assert.deepEqual(sessions.map((row: any) => row.readings.length), [2, 1]);
  assert.deepEqual(sessions.map((row: any) => row.runs[0]?.status), ["RELEASED", "INCOMPLETE"]);
  assert.deepEqual(sessions.map((row: any) => row.status), ["CLOSED", "OPEN"]);
  assert.ok(sessions.every((session: any) =>
    session.readings.every((item: any) =>
      item.clientId === session.clientId && item.runId === session.runs[0]?.id
    )
  ));

  const constraints = await prisma.$queryRawUnsafe<Array<{ conname: string }>>(`
    SELECT conname FROM pg_constraint
    WHERE conrelid IN (
      '"PdaCaptureRun"'::regclass, '"PdaLabGrant"'::regclass,
      '"PdaPairingChallenge"'::regclass, '"PdaTestReading"'::regclass
    )
  `);
  const names = new Set(constraints.map((row) => row.conname));
  for (const expected of [
    "PdaCaptureRun_grantId_sessionId_clientId_fkey",
    "PdaCaptureRun_sessionId_clientId_fkey",
    "PdaLabGrant_sessionId_clientId_fkey",
    "PdaTestReading_runId_sessionId_clientId_fkey",
    "PdaTestReading_grantId_sessionId_clientId_fkey"
  ]) assert.ok(names.has(expected), `Falta ${expected}`);

  const indexes = await prisma.$queryRawUnsafe<Array<{ indexname: string }>>(`
    SELECT indexname FROM pg_indexes
    WHERE tablename IN ('PdaCaptureRun','PdaLabGrant','PdaPairingChallenge','PdaTestReading')
  `);
  const indexNames = new Set(indexes.map((row) => row.indexname));
  for (const expected of [
    "PdaCaptureRun_one_active_per_session",
    "PdaCaptureRun_id_sessionId_clientId_key",
    "PdaLabGrant_id_sessionId_clientId_key",
    "PdaTestReading_runId_clientSeq_key",
    "PdaTestReading_runId_attemptId_key"
  ]) assert.ok(indexNames.has(expected), `Falta ${expected}`);
});

test("pairing one-shot persiste cinco fallos y bloquea replay", {
  skip: databaseUrl ? false : "TEST_DB_UNAVAILABLE"
}, async () => {
  const session = await newSession(clientA, adminA, "PAIR01");
  const failed = await services.createPdaPairing({
    clientId: clientA,
    sessionId: session.id,
    createdById: adminA
  });
  for (let index = 0; index < 5; index += 1) {
    await expectCode(services.exchangePdaPairing({
      pairingId: failed.pairingId,
      secret: `WRONG-SECRET-${index}-WITH-SUFFICIENT-LENGTH`,
      mode: "QR"
    }), "PDA_PAIRING_INVALID", 401);
  }
  const locked = await prisma.pdaPairingChallenge.findUniqueOrThrow({
    where: { publicId: failed.pairingId }
  });
  assert.equal(locked.failedAttempts, 5);
  assert.equal(locked.status, "LOCKED");

  const valid = await services.createPdaPairing({
    clientId: clientA,
    sessionId: session.id,
    createdById: adminA
  });
  const encoded = valid.qrPayload.slice("LOGITEC-PDA1:".length);
  const separator = encoded.indexOf(".");
  const exchange = {
    pairingId: encoded.slice(0, separator),
    secret: encoded.slice(separator + 1),
    mode: "QR"
  };
  await services.exchangePdaPairing(exchange);
  await expectCode(services.exchangePdaPairing(exchange), "PDA_PAIRING_CONSUMED", 410);
});

test("grant tenant/session-bound; expirado y revocado producen 401", {
  skip: databaseUrl ? false : "TEST_DB_UNAVAILABLE"
}, async () => {
  const sessionA = await newSession(clientA, adminA, "AUTH01");
  const sessionB = await newSession(clientA, adminA, "AUTH02");
  const first = await newGrant(clientA, adminA, sessionA.id);
  await expectCode(
    services.createPdaRun({ ...first.grant, sessionId: sessionB.id }, `${prefix}-WRONG-SESSION`),
    "PDA_GRANT_REVOKED",
    401
  );

  await prisma.pdaLabGrant.update({
    where: { id: first.grant.id },
    data: { expiresAt: new Date(Date.now() - 1000) }
  });
  await expectCode(services.authenticatePdaGrant(first.token), "PDA_GRANT_EXPIRED", 401);

  const second = await newGrant(clientA, adminA, sessionA.id);
  await services.revokePdaGrant({
    clientId: clientA,
    sessionId: sessionA.id,
    grantId: second.grant.id,
    reason: "QA"
  });
  await expectCode(services.authenticatePdaGrant(second.token), "PDA_GRANT_REVOKED", 401);
});

test("retry conserva una fila; repeated scan crea otra; huecos no son silenciosos", {
  skip: databaseUrl ? false : "TEST_DB_UNAVAILABLE"
}, async () => {
  const session = await newSession(clientA, adminA, "READ01");
  const fixture = await newGrant(clientA, adminA, session.id);
  const run = (await services.createPdaRun(fixture.grant, `${prefix}-READ-RUN`)).run;
  const firstInput = reading(run, 1);
  const first = await services.recordPdaRunReading(
    fixture.grant, run.id, firstInput, diagnosticReader
  );
  const retry = await services.recordPdaRunReading(
    fixture.grant, run.id, firstInput, diagnosticReader
  );
  const repeated = await services.recordPdaRunReading(
    fixture.grant, run.id, reading(run, 3), diagnosticReader
  );
  assert.equal(first.duplicate, false);
  assert.equal(retry.duplicate, true);
  assert.equal(retry.reading.id, first.reading.id);
  assert.notEqual(repeated.reading.id, first.reading.id);
  await services.sealPdaRun(fixture.grant, run.id, 3);
  const missing = await services.reconcilePdaRun(fixture.grant, run.id);
  assert.equal(missing.reconciled, false);
  assert.deepEqual(missing.missing, [2]);
  await services.recordPdaRunReading(
    fixture.grant, run.id, reading(run, 2), diagnosticReader
  );
  assert.equal((await services.reconcilePdaRun(fixture.grant, run.id)).reconciled, true);
});

test("reading-vs-seal y seal-vs-release son deterministas", {
  skip: databaseUrl ? false : "TEST_DB_UNAVAILABLE"
}, async () => {
  const session = await newSession(clientA, adminA, "RACE01");
  const fixture = await newGrant(clientA, adminA, session.id);
  const run = (await services.createPdaRun(fixture.grant, `${prefix}-RACE-RUN`)).run;
  await expectCode(
    services.sealPdaRun(fixture.grant, run.id, 100_001),
    "PDA_SEAL_RANGE_INVALID"
  );
  const readingSeal = await Promise.allSettled([
    services.recordPdaRunReading(fixture.grant, run.id, reading(run, 1), diagnosticReader),
    services.sealPdaRun(fixture.grant, run.id, 1)
  ]);
  assert.equal(readingSeal.filter((item) => item.status === "fulfilled").length, 2);
  assert.equal(await prisma.pdaTestReading.count({ where: { runId: run.id } }), 1);

  const nonce = `${prefix}-EARLY-RELEASE-000000000000000000`;
  const sealRelease = await Promise.allSettled([
    services.sealPdaRun(fixture.grant, run.id, 1),
    services.preparePdaRelease(fixture.grant, nonce)
  ]);
  assert.equal(sealRelease[0]?.status, "fulfilled");
  assert.equal(sealRelease[1]?.status, "rejected");
  if (sealRelease[1]?.status === "rejected") {
    assert.equal(codeOf(sealRelease[1].reason), "PDA_RELEASE_NOT_RECONCILED");
  }
});

test("takeover forzado rechaza epoch viejo y cooperativo abre segunda ronda", {
  skip: databaseUrl ? false : "TEST_DB_UNAVAILABLE"
}, async () => {
  const forcedSession = await newSession(clientA, adminA, "TAKE01");
  const forcedGrant = await newGrant(clientA, adminA, forcedSession.id);
  const oldRun = (await services.createPdaRun(
    forcedGrant.grant, `${prefix}-FORCED-RUN`
  )).run;
  assert.equal((await services.forceTakeover({
    clientId: clientA,
    sessionId: forcedSession.id,
    reason: "QA_FORCED"
  })).changed, true);
  await expectCode(
    services.createPdaRun(forcedGrant.grant, `${prefix}-STALE-GRANT-RUN`),
    "PDA_GRANT_REVOKED",
    401
  );
  await expectCode(
    services.recordPdaRunReading(
      forcedGrant.grant, oldRun.id, reading(oldRun, 1), diagnosticReader
    ),
    "PDA_RUN_SEALED"
  );

  const raceSession = await newSession(clientA, adminA, "TAKE02");
  const raceGrant = await newGrant(clientA, adminA, raceSession.id);
  await services.createPdaRun(raceGrant.grant, `${prefix}-TAKE-RACE-1`);
  const takeoverRace = await Promise.allSettled([
    services.forceTakeover({
      clientId: clientA,
      sessionId: raceSession.id,
      reason: "QA_RACE"
    }),
    services.createPdaRun(raceGrant.grant, `${prefix}-TAKE-RACE-2`)
  ]);
  assert.equal(takeoverRace[0]?.status, "fulfilled");
  assert.equal(takeoverRace[1]?.status, "rejected");
  assert.equal(await prisma.pdaCaptureRun.count({
    where: { sessionId: raceSession.id, status: "ACTIVE" }
  }), 0);

  const cooperativeSession = await newSession(clientB, adminB, "COOP01");
  const cooperative = await newGrant(clientB, adminB, cooperativeSession.id);
  const first = (await services.createPdaRun(
    cooperative.grant, `${prefix}-COOP-RUN-1`
  )).run;
  await reconcile(cooperative.grant, first, 0);
  const second = (await services.createPdaRun(
    cooperative.grant, `${prefix}-COOP-RUN-2`
  )).run;
  assert.ok(second.epoch > first.epoch);
  await reconcile(cooperative.grant, second, 0);
  assert.equal((await release(cooperative.grant, second)).safeToReturn, true);
});

test("release-vs-revoke termina sin capacidad activa", {
  skip: databaseUrl ? false : "TEST_DB_UNAVAILABLE"
}, async () => {
  const session = await newSession(clientA, adminA, "REL001");
  const fixture = await newGrant(clientA, adminA, session.id);
  const run = (await services.createPdaRun(fixture.grant, `${prefix}-REL-RUN`)).run;
  await reconcile(fixture.grant, run, 0);
  const nonce = `${prefix}-CONCURRENT-RELEASE-00000000000000`;
  await services.preparePdaRelease(fixture.grant, nonce);
  await Promise.allSettled([
    services.confirmPdaRelease(
      { ...fixture.grant, status: "DRAIN_ONLY" },
      {
        releaseNonce: nonce,
        captureStoppedConfirmed: true,
        localCleanupConfirmed: true,
        noDownloadsConfirmed: true
      }
    ),
    services.revokePdaGrant({
      clientId: clientA,
      sessionId: session.id,
      grantId: fixture.grant.id,
      reason: "QA_CONCURRENT_REVOKE"
    })
  ]);
  assert.equal(
    (await prisma.pdaLabGrant.findUniqueOrThrow({ where: { id: fixture.grant.id } })).status,
    "REVOKED"
  );
  assert.equal(await prisma.pdaCaptureRun.count({
    where: { id: run.id, status: "ACTIVE" }
  }), 0);
});

test("dos grants no se revocan cruzados y tenants no se mezclan", {
  skip: databaseUrl ? false : "TEST_DB_UNAVAILABLE"
}, async () => {
  const sessionA = await newSession(clientA, adminA, "MULTIA");
  const sessionB = await newSession(clientB, adminB, "MULTIB");
  const fixtureA = await newGrant(clientA, adminA, sessionA.id);
  const fixtureB = await newGrant(clientB, adminB, sessionB.id);
  const runA = (await services.createPdaRun(fixtureA.grant, `${prefix}-MULTI-A`)).run;
  const runB = (await services.createPdaRun(fixtureB.grant, `${prefix}-MULTI-B`)).run;
  await services.recordPdaRunReading(
    fixtureA.grant, runA.id, reading(runA, 1, "TENANT-A"), diagnosticReader
  );
  await services.recordPdaRunReading(
    fixtureB.grant, runB.id, reading(runB, 1, "TENANT-B"), diagnosticReader
  );
  await services.revokePdaGrant({
    clientId: clientA,
    sessionId: sessionA.id,
    grantId: fixtureA.grant.id,
    reason: "QA_FOCAL"
  });
  assert.equal((await services.authenticatePdaGrant(fixtureB.token)).clientId, clientB);
  assert.equal(await prisma.pdaTestReading.count({
    where: { clientId: clientA, rawCode: "TENANT-B" }
  }), 0);
});

test("cierre vs POST retrasado cierra resumen sin aceptar escritura tardía", {
  skip: databaseUrl ? false : "TEST_DB_UNAVAILABLE"
}, async () => {
  const session = await newSession(clientB, adminB, "CLOSE1");
  const fixture = await newGrant(clientB, adminB, session.id);
  const run = (await services.createPdaRun(fixture.grant, `${prefix}-CLOSE-RUN`)).run;
  await services.recordPdaRunReading(
    fixture.grant, run.id, reading(run, 1), diagnosticReader
  );
  await reconcile(fixture.grant, run, 1);
  await release(fixture.grant, run);
  const race = await Promise.allSettled([
    services.finalizePdaTestSession(clientB, session.id),
    services.recordPdaRunReading(
      fixture.grant, run.id, reading(run, 2), diagnosticReader
    )
  ]);
  assert.equal(race[0]?.status, "fulfilled");
  assert.equal(race[1]?.status, "rejected");
  if (race[1]?.status === "rejected") {
    assert.equal(codeOf(race[1].reason), "PDA_RUN_SEALED");
  }
  const closed = await prisma.pdaTestSession.findUniqueOrThrow({
    where: { id: session.id }
  });
  assert.equal(closed.status, "CLOSED");
  assert.equal(closed.totalReadings, 1);
});
