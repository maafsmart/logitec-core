import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  classifyScannerCode,
  type ScannerDiagnosticReader
} from "../src/modules/admin/pda-scanner-diagnostic.service.js";
import {
  calculatePdaSessionSummary,
  createVisibleTestId,
  normalizePdaRawCode,
  pdaOutcome
} from "../src/modules/admin/pda-test-evidence.service.js";
import {
  digestPdaSecret,
  pdaGrantFailure
} from "../src/modules/pda/pda-auth.service.js";
import {
  fingerprintPdaAttempt,
  missingPdaSequences,
  pdaRunAcceptsAttempt,
  type PdaAttemptInput
} from "../src/modules/pda/pda-run.service.js";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const schema = read("../prisma/schema.prisma");
const migration = read("../prisma/migrations/20260902101500_pda_borrowed_device_protocol/migration.sql");
const routes = read("../src/modules/pda/pda.routes.ts");
const adminRoutes = read("../src/modules/admin/admin.routes.ts");
const middleware = read("../src/modules/pda/pda-auth.middleware.ts");
const authService = read("../src/modules/pda/pda-auth.service.ts");
const runService = read("../src/modules/pda/pda-run.service.ts");
const app = read("../src/app.ts");
const html = read("../public/pda-scanner-lab.html");
const js = read("../public/pda-scanner-lab.js");
const pairHtml = read("../public/pda-pair.html");
const pairJs = read("../public/pda-pair.js");

function reader(overrides: Partial<ScannerDiagnosticReader> = {}): ScannerDiagnosticReader {
  return {
    findProducts: async () => [],
    findLocations: async () => [],
    findLots: async () => [],
    findSerials: async () => [],
    ...overrides
  };
}

function attempt(overrides: Partial<PdaAttemptInput> = {}): PdaAttemptInput {
  return {
    runPublicId: "RUN-test",
    clientSeq: 1,
    epoch: 1,
    attemptId: "11111111-1111-4111-8111-111111111111",
    idempotencyKey: "22222222-2222-4222-8222-222222222222",
    observedAt: new Date("2026-09-02T10:00:00.000Z"),
    rawCode: "SKU-1",
    expectedType: "SKU",
    captureMethod: "HID",
    physicalZone: "AN20",
    distance: "1–2 m",
    detectionMs: 100,
    notes: null,
    networkMetadata: { online: true },
    ...overrides
  };
}

test("clasificación PDA consulta solo y conserva tenant en cada lector", async () => {
  const calls: string[] = [];
  const result = await classifyScannerCode("SKU-1", "tenant-a", reader({
    findProducts: async (code, clientId) => {
      calls.push(`${code}:${clientId}`);
      return [{ sku: "SKU-1", barcode: null, name: "Radio" }];
    },
    findLocations: async (_code, clientId) => { calls.push(`location:${clientId}`); return []; },
    findLots: async (_code, clientId) => { calls.push(`lot:${clientId}`); return []; },
    findSerials: async (_code, clientId) => { calls.push(`serial:${clientId}`); return []; }
  }));
  assert.equal(result.classification, "SKU");
  assert.ok(calls.every((call) => call.endsWith(":tenant-a")));
});

test("resumen final calcula categorías y percentiles reproducibles", () => {
  assert.deepEqual(calculatePdaSessionSummary([
    { result: "OK", detectionMs: 100, classificationMs: 20 },
    { result: "OK", detectionMs: 200, classificationMs: 40 },
    { result: "RECONOCIDO_NO_ENCONTRADO", detectionMs: 300, classificationMs: 60 },
    { result: "NO_LEIDO", detectionMs: null, classificationMs: null }
  ]), {
    totalReadings: 4,
    okReadings: 2,
    notFoundReadings: 1,
    failedReadings: 1,
    successRate: 50,
    detectionMinMs: 100,
    detectionMedianMs: 200,
    detectionP95Ms: 300,
    classificationMinMs: 20,
    classificationMedianMs: 40,
    classificationP95Ms: 60
  });
  assert.equal(pdaOutcome("SKU", "SKU"), "OK");
  assert.equal(pdaOutcome("NO_ENCONTRADO", "SKU"), "RECONOCIDO_NO_ENCONTRADO");
  assert.equal(normalizePdaRawCode(" ]C1SKU-1 "), "SKU-1");
  assert.match(createVisibleTestId(new Date("2026-09-02T00:00:00Z")), /^PDA-20260902-[A-F0-9]{24}$/);
});

test("retry conserva fingerprint y payload distinto con la misma key entra en conflicto", () => {
  const first = attempt();
  assert.equal(fingerprintPdaAttempt(first), fingerprintPdaAttempt({ ...first }));
  assert.notEqual(
    fingerprintPdaAttempt(first),
    fingerprintPdaAttempt({ ...first, rawCode: "SKU-2" })
  );
});

test("repetición intencional del mismo código produce attempts distintos", () => {
  const first = attempt();
  const repeated = attempt({
    clientSeq: 2,
    attemptId: "33333333-3333-4333-8333-333333333333",
    idempotencyKey: "44444444-4444-4444-8444-444444444444"
  });
  assert.equal(first.rawCode, repeated.rawCode);
  assert.notEqual(first.attemptId, repeated.attemptId);
  assert.notEqual(fingerprintPdaAttempt(first), fingerprintPdaAttempt(repeated));
  assert.doesNotMatch(js, /scanSessionSeenCodes|new Set\(\)/);
});

test("seal acepta retries previos, rechaza attempts posteriores y reconcile detecta huecos", () => {
  assert.equal(pdaRunAcceptsAttempt("ACTIVE", null, 99), true);
  assert.equal(pdaRunAcceptsAttempt("SEALED", 3, 3), true);
  assert.equal(pdaRunAcceptsAttempt("DRAINING", 3, 2), true);
  assert.equal(pdaRunAcceptsAttempt("SEALED", 3, 4), false);
  assert.equal(pdaRunAcceptsAttempt("RECONCILED", 3, 2), false);
  assert.deepEqual(missingPdaSequences([1, 3, 3], 4), [2, 4]);
  assert.deepEqual(missingPdaSequences([3, 2, 1], 3), []);
  assert.match(runService, /sealedThroughSeq < run\.lastAcceptedSeq \|\| sealedThroughSeq > 100_000/);
  assert.match(routes, /sealedThroughSeq: z\.number\(\)\.int\(\)\.min\(0\)\.max\(100_000\)/);
});

test("grant revocado y expirado fallan sin depender de referencia local", () => {
  const future = new Date("2026-09-02T12:00:00Z");
  const now = new Date("2026-09-02T10:00:00Z");
  assert.equal(pdaGrantFailure({ status: "ACTIVE", expiresAt: future }, now), null);
  assert.equal(pdaGrantFailure({ status: "REVOKED", expiresAt: future }, now), "PDA_GRANT_REVOKED");
  assert.equal(pdaGrantFailure({ status: "ACTIVE", expiresAt: now }, now), "PDA_GRANT_EXPIRED");
  assert.equal(digestPdaSecret("a".repeat(43)), digestPdaSecret("a".repeat(43)));
  assert.notEqual(digestPdaSecret("a".repeat(43)), digestPdaSecret("b".repeat(43)));
  assert.match(middleware, /tokenDigest: digestPdaSecret\(token\)/);
  assert.match(middleware, /grant\.clientId/);
});

test("modelo Prisma impone FKs tenant-compuestas y unicidad attempt/sequence", () => {
  for (const model of [
    "PdaTestSession", "PdaCaptureRun", "PdaTestReading", "PdaPairingChallenge", "PdaLabGrant"
  ]) assert.match(schema, new RegExp(`model ${model}`));
  assert.match(schema, /PdaCaptureRun[\s\S]*@@unique\(\[id, clientId\]\)/);
  assert.match(schema, /PdaTestReading[\s\S]*@@unique\(\[runId, clientSeq\]\)/);
  assert.match(schema, /PdaTestReading[\s\S]*@@unique\(\[runId, attemptId\]\)/);
  assert.match(schema, /run\s+PdaCaptureRun\s+@relation\(fields: \[runId, clientId\]/);
  assert.match(migration, /FOREIGN KEY \("runId", "clientId"\)/);
  assert.match(migration, /FORCED_TAKEOVER|PdaCaptureRunStatus/);
  assert.doesNotMatch(migration, /(?:ALTER|CREATE) TABLE "(?:Inventory|ScanEvent|InventoryMovement)"/);
});

test("migración incremental preserva evidencia previa con legacy run", () => {
  assert.match(migration, /INSERT INTO "PdaCaptureRun"/);
  assert.match(migration, /ROW_NUMBER\(\) OVER \(PARTITION BY "sessionId"/);
  assert.match(migration, /ALTER COLUMN "runId" SET NOT NULL/);
  assert.match(migration, /CASE WHEN s\."status" = 'CLOSED' THEN 'RELEASED'/);
});

test("rutas PDA están aisladas del bearer ADMIN y derivan tenant del grant", () => {
  assert.match(app, /app\.use\("\/api\/pda", pdaRouter\)/);
  assert.match(routes, /router\.use\(requirePdaGrant\)/);
  assert.match(routes, /req\.pdaAuth!\.clientId/);
  assert.doesNotMatch(routes, /requireAuth|requireRole|operationalClientId|Authorization/);
  assert.doesNotMatch(routes, /clientId:\s*(?:req\.body|body)|req\.query\.clientId/);
  assert.doesNotMatch(adminRoutes, /pda-test-sessions\/:sessionId\/readings/);
});

test("pairing es one-shot fuerte, no viaja por URL y cookie es restringida", () => {
  assert.match(authService, /randomBytes\(32\)\.toString\("base64url"\)/);
  assert.match(authService, /consumedAt: null/);
  assert.match(authService, /attempts: \{ lt: challenge\.maxAttempts \}/);
  assert.match(authService, /prisma\.pdaPairingChallenge\.updateMany/);
  assert.match(authService, /PDA_PAIRING_TTL_MS = 5 \* 60 \* 1000/);
  assert.match(routes, /httpOnly: true/);
  assert.match(routes, /secure: true/);
  assert.match(routes, /sameSite: "strict"/);
  assert.match(routes, /path: "\/api\/pda"/);
  assert.match(pairJs, /history\.replaceState\(null, "", "\/pda-pair\.html"\)/);
  assert.doesNotMatch(pairJs, /URLSearchParams|location\.search|location\.hash|localStorage|sessionStorage/);
  assert.doesNotMatch(pairHtml, /password|login|Credential/i);
});

test("frontend prestado no contiene ADMIN, export, imágenes ni clipboard", () => {
  assert.doesNotMatch(html, /ADMIN|inventario global|valuaci[oó]n|usuarios|export|PNG|historial/i);
  assert.doesNotMatch(html, /detectedFrame|barcodeImage|historyBody|dashboard\.html/);
  assert.doesNotMatch(js, /localStorage\.(?:setItem|removeItem)|Authorization|navigator\.clipboard|download|toDataURL|Blob/);
  assert.match(js, /preexistingAdminAuth = Boolean\(localStorage\.getItem\("token"\)\)/);
  assert.doesNotMatch(js, /purgeExpired|evidenceTtl|24 \* 60/);
  assert.match(js, /indexedDB\.open\(DB_NAME/);
  assert.match(js, /await deleteAttempt\(item\.idempotencyKey\)/);
});

test("hide/pagehide detiene captura, enmascara datos y exige revalidar grant", () => {
  assert.match(js, /function lockSurface\(\)[\s\S]*stopCamera[\s\S]*maskVisibleReading/);
  assert.match(js, /document\.addEventListener\("visibilitychange"/);
  assert.match(js, /window\.addEventListener\("pagehide", lockSurface\)/);
  assert.match(js, /async function unlockSurface\(\)[\s\S]*\/api\/pda\/status/);
  assert.match(html, /id="privacyCover"/);
});

test("release limpia solo namespace del run y confirma 401 antes de SAFE_TO_RETURN", () => {
  const release = js.slice(js.indexOf("async function finalizeAndRelease"), js.indexOf("function lockSurface"));
  assert.match(release, /runQueue\(runId\)/);
  assert.match(release, /deleteAttempt\(item\.idempotencyKey\)/);
  assert.match(release, /\/release/);
  assert.match(release, /await api\("\/api\/pda\/status"\)/);
  assert.match(release, /revoked = error\.status === 401/);
  assert.match(release, /SAFE_TO_RETURN/);
  assert.match(runService, /status: "REVOKED"[\s\S]*revokeReason: "RUN_RELEASED"/);
  assert.match(runService, /calculatePdaSessionSummary\(readings\)/);
  assert.match(runService, /status: incompleteRuns \? "INCOMPLETE" : "CLOSED"/);
});

test("takeover forzado marca run anterior INCOMPLETE y revoca solo grants afectados", () => {
  const takeover = runService.slice(runService.indexOf("export async function forceTakeoverPdaSession"));
  assert.match(takeover, /status: "INCOMPLETE"/);
  assert.match(takeover, /incompleteReason: "FORCED_TAKEOVER"/);
  assert.match(takeover, /epoch: \{ increment: 1 \}/);
  assert.match(takeover, /where: \{ clientId, sessionId, status: "ACTIVE" \}/);
  assert.doesNotMatch(takeover, /pdaLabGrant\.updateMany\(\{\s*data/);
  const createRun = runService.slice(
    runService.indexOf("export async function createPdaCaptureRun"),
    runService.indexOf("export async function getPdaRun")
  );
  assert.match(createRun, /tx\.pdaLabGrant\.findFirst/);
  assert.match(createRun, /status: "ACTIVE"/);
  assert.match(createRun, /expiresAt: \{ gt: new Date\(\) \}/);
});

test("proxy público same-origin no depende del Host interno de Render", () => {
  assert.match(middleware, /fetchSite === "same-origin"/);
  assert.match(middleware, /"www\.control\.logitec\.com\.mx"/);
  assert.doesNotMatch(middleware, /const expected = `\$\{req\.protocol\}:\/\/\$\{req\.get\("host"\)\}`/);
});

test("ACK perdido de release se recupera con recibo read-only del grant revocado", () => {
  assert.match(routes, /\/runs\/:runPublicId\/release-status/);
  assert.match(routes, /requirePdaReleaseReceipt/);
  assert.match(middleware, /grant\.status !== "REVOKED" \|\| grant\.revokeReason !== "RUN_RELEASED"/);
  assert.match(js, /release-status/);
});

test("background offline permite continuar solo como pendiente no revalidado", () => {
  assert.match(js, /!navigator\.onLine && restored/);
  assert.match(js, /offline; grant sin revalidar/);
  assert.match(js, /!navigator\.onLine && run && grant/);
});

test("cámara, HID, manual y NO_LEIDO convergen en contrato de attempt", () => {
  for (const method of ["CAMERA", "HID", "MANUAL", "NO_LEIDO"]) {
    assert.match(html + js + routes, new RegExp(method));
  }
  assert.match(js, /crypto\.randomUUID/);
  assert.match(js, /clientSeq \+= 1/);
  assert.match(js, /attemptId,[\s\S]*idempotencyKey/);
  assert.match(js, /navigator\.mediaDevices\.getUserMedia/);
  assert.match(js, /event\.key !== "Enter"/);
});
