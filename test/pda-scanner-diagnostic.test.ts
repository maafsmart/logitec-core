import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  classifyScannerCode,
  scannerLocationWhere,
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
const migration = [
  read("../prisma/migrations/20260902101500_pda_borrowed_device_protocol/migration.sql"),
  read("../prisma/migrations/20260902103000_harden_pda_borrowed_device_protocol/migration.sql")
].join("\n");
const adminRoutes = read("../src/modules/admin/admin.routes.ts");
const pdaRoutes = read("../src/modules/pda/pda.routes.ts");
const pdaAuth = read("../src/modules/pda/pda-auth.service.ts");
const pdaMiddleware = read("../src/modules/pda/pda-auth.middleware.ts");
const pdaRun = read("../src/modules/pda/pda-run.service.ts");
const appSource = read("../src/app.ts");
const labHtml = read("../public/pda-scanner-lab.html");
const labJs = read("../public/pda-scanner-lab.js");
const pairHtml = read("../public/pda-pair.html");
const pairJs = read("../public/pda-pair.js");
const adminHtml = read("../public/pda-test-evidence.html");
const adminJs = read("../public/pda-test-evidence.js");

function reader(overrides: Partial<ScannerDiagnosticReader> = {}) {
  const calls: Array<{ operation: string; code: string; clientId: string }> = [];
  const wrap = <T>(operation: string, value: T[]) =>
    async (code: string, clientId: string): Promise<T[]> => {
      calls.push({ operation, code, clientId });
      return value;
    };
  const diagnosticReader: ScannerDiagnosticReader = {
    findProducts: wrap("products", []),
    findLocations: wrap("locations", []),
    findLots: wrap("lots", []),
    findSerials: wrap("serials", []),
    ...overrides
  };
  return { diagnosticReader, calls };
}

test("clasificación PDA es solo lectura y tenant-scoped", async () => {
  const mock = reader({
    findProducts: async (code, clientId) => {
      assert.equal(code, "037-579419-002");
      assert.equal(clientId, "client-aviat");
      return [{ sku: code, barcode: null, name: "Radio" }];
    }
  });
  const result = await classifyScannerCode("037-579419-002", "client-aviat", mock.diagnosticReader);
  assert.equal(result.classification, "SKU");
  assert.ok(mock.calls.every((call) => call.clientId === "client-aviat"));
  assert.deepEqual(scannerLocationWhere("an20"), {
    code: { equals: "an20", mode: "insensitive" },
    active: true
  });
});

test("resumen y normalización de evidencia siguen siendo reproducibles", () => {
  const summary = calculatePdaSessionSummary([
    { result: "OK", detectionMs: 100, classificationMs: 20 },
    { result: "OK", detectionMs: 200, classificationMs: 40 },
    { result: "RECONOCIDO_NO_ENCONTRADO", detectionMs: 300, classificationMs: 60 },
    { result: "NO_LEIDO", detectionMs: null, classificationMs: null }
  ]);
  assert.equal(summary.totalReadings, 4);
  assert.equal(summary.okReadings, 2);
  assert.equal(summary.notFoundReadings, 1);
  assert.equal(summary.failedReadings, 1);
  assert.equal(summary.successRate, 50);
  assert.equal(pdaOutcome("SKU", "SKU"), "OK");
  assert.equal(pdaOutcome("SKU", "LOTE"), "LEIDO_INCORRECTAMENTE");
  assert.equal(normalizePdaRawCode(" ]C1ABC "), "ABC");
  assert.match(createVisibleTestId(new Date("2026-09-02T00:00:00Z")), /^PDA-20260902-[A-F0-9]{24}$/);
});

test("schema congela tenant, run, secuencia, intento e idempotencia", () => {
  assert.match(schema, /enum PdaSessionStatus[\s\S]*OPEN[\s\S]*CLOSING[\s\S]*CLOSED[\s\S]*INCOMPLETE/);
  assert.match(schema, /model PdaCaptureRun[\s\S]*@@unique\(\[id, sessionId, clientId\]\)/);
  assert.match(schema, /model PdaCaptureRun[\s\S]*@@unique\(\[clientId, sessionId, epoch\]\)/);
  assert.match(schema, /model PdaTestReading[\s\S]*@@unique\(\[runId, clientSeq\]\)/);
  assert.match(schema, /model PdaTestReading[\s\S]*@@unique\(\[runId, attemptId\]\)/);
  assert.match(schema, /model PdaTestReading[\s\S]*@@unique\(\[clientId, idempotencyKey\]\)/);
  assert.match(schema, /model PdaLabGrant[\s\S]*tokenDigest\s+String\s+@unique/);
  assert.match(schema, /model PdaPairingChallenge[\s\S]*qrSecretDigest\s+String\s+@unique/);
});

test("migración es incremental, conserva evidencia y no toca inventario", () => {
  assert.match(migration, /FINALIZED' THEN 'CLOSED'/);
  assert.match(migration, /'legacy-' \|\| s\."id"/);
  assert.match(migration, /ROW_NUMBER\(\) OVER/);
  assert.match(migration, /PdaCaptureRun_one_active_per_session/);
  assert.match(migration, /WHERE "status" = 'ACTIVE'/);
  assert.match(migration, /FOREIGN KEY \("runId", "sessionId", "clientId"\)/);
  assert.doesNotMatch(migration, /(?:ALTER|CREATE|DROP|DELETE FROM) "(?:Inventory|ScanEvent|Movement)/);
});

test("pairing usa secretos de alta entropía, HMAC, one-shot y límites", () => {
  assert.match(pdaAuth, /randomBytes\(32\)\.toString\("base64url"\)/);
  assert.match(pdaAuth, /base32\(randomBytes\(17\)\)\.slice\(0, 26\)/);
  assert.match(pdaAuth, /createHmac\("sha256", pepper\(\)\)/);
  assert.match(pdaAuth, /PAIRING_TTL_MS = 5 \* 60 \* 1000/);
  assert.match(pdaAuth, /GRANT_TTL_MS = 8 \* 60 \* 60 \* 1000/);
  assert.match(pdaAuth, /failedAttempts: attempts/);
  assert.match(pdaAuth, /updateMany\([\s\S]*status: PdaPairingStatus\.PENDING/);
  assert.match(pdaAuth, /PDA_PAIRING_CONSUMED/);
  assert.doesNotMatch(schema, /\bqrSecret\b|\bmanualSecret\b|\btoken\s+String/);
});

test("cookie PDA es HttpOnly/restringida y nunca acepta bearer ADMIN", () => {
  assert.match(pdaAuth, /__Secure-logitec_pda/);
  assert.match(pdaAuth, /Path=\/api\/pda; HttpOnly; Secure; SameSite=Strict/);
  assert.match(pdaMiddleware, /tokenFromCookie\(req\.headers\.cookie\)/);
  assert.match(pdaMiddleware, /PDA_ORIGIN_FORBIDDEN/);
  assert.match(pdaMiddleware, /fetchSite !== "same-origin"/);
  assert.doesNotMatch(pdaMiddleware, /authorization|Bearer|requireAuth/);
  assert.doesNotMatch(pdaRoutes, /requireAuth|requireRole|Authorization/);
});

test("rutas PDA quedan aisladas y montadas detrás del feature flag", () => {
  for (const route of [
    "/pairings/exchange",
    "/context",
    "/runs",
    "/runs/:runId/readings",
    "/runs/:runId/seal",
    "/runs/:runId/reconcile",
    "/release/prepare",
    "/release/confirm",
    "/releases/status"
  ]) assert.match(pdaRoutes, new RegExp(route.replaceAll("/", "\\/")));
  assert.match(pdaRoutes, /pdaRouter\.use\(gate\)/);
  assert.match(appSource, /app\.use\("\/api\/pda", pdaRouter\)/);
  assert.match(appSource, /app\.get\("\/pda-pair\.html", pdaScannerLabPageGate/);
  assert.match(appSource, /Referrer-Policy", "no-referrer"/);
});

test("retries conservan un registro y los intentos repetidos usan identidad nueva", () => {
  assert.match(pdaRun, /clientId_idempotencyKey/);
  assert.match(pdaRun, /existing\.requestFingerprint !== requestFingerprint/);
  assert.match(pdaRun, /PDA_IDEMPOTENCY_CONFLICT/);
  assert.match(pdaRun, /runId,[\s\S]*clientSeq: input\.clientSeq/);
  assert.match(pdaRun, /status: PdaRunStatus\.DRAINING,[\s\S]*sealedAtSeq: \{ gte: input\.clientSeq \}/);
  assert.doesNotMatch(pdaRun, /normalizedCode.*unique|rawCode.*unique/);
  assert.match(labJs, /const candidateSeq = nextClientSeq \+ 1/);
  assert.ok(labJs.indexOf("await queueAttempt({") < labJs.indexOf("nextClientSeq = candidateSeq"));
  assert.match(labJs, /const attemptId = crypto\.randomUUID\(\)/);
  assert.match(labJs, /idempotencyKey: attemptId/);
  assert.doesNotMatch(labJs, /SeenCodes|new Set\(\).*code|has\(raw/);
});

test("cámara sella un frame estable por armado y permite repetir tras rearme", () => {
  assert.match(labJs, /cameraCandidate\.count >= 3/);
  assert.match(labJs, /cameraArmed = false/);
  assert.match(labJs, /await enqueueAttempt\(raw, "CAMERA", detectionMs\)/);
  assert.match(labJs, /armCameraBtn"\)\.addEventListener\("click", armCamera\)/);
  assert.match(labJs, /cameraStream\?\.getTracks\(\)\.forEach\(\(track\) => track\.stop\(\)\)/);
  assert.match(labJs, /submitCurrentInput\("HID"\)/);
  assert.match(labJs, /const rawCode = field\("scanInput"\);[\s\S]*scanInput"\)\.value = ""/);
  assert.match(labJs, /enqueueAttempt\("", "NO_LEIDO"\)/);
});

test("outbox no tiene TTL y solo borra evidencia tras ACK o release", () => {
  assert.match(labJs, /indexedDB\.open\(evidenceDbName, 2\)/);
  assert.match(labJs, /transaction\.oncomplete = \(\) => resolve\(result\)/);
  assert.match(labJs, /await deleteQueued\(item\.idempotencyKey\)/);
  assert.match(labJs, /window\.addEventListener\("online"/);
  assert.doesNotMatch(labJs, /TTL|ttl|purgeExpired|24 \* 60 \* 60/);
  assert.doesNotMatch(labJs, /dataUrl|toDataURL|detectedFrame|download|clipboard/);
  assert.doesNotMatch(labHtml, /historial|Descargar|Exportar|Copiar|PNG|dashboard|login/i);
});

test("SAFE_TO_RETURN exige reconcile, limpieza, revocación y 401 posterior", () => {
  assert.match(pdaRun, /Todas las rondas deben estar reconciliadas/);
  assert.match(pdaRun, /status: PdaGrantStatus\.REVOKED/);
  assert.match(pdaRun, /releaseReceiptId: receiptId/);
  assert.match(labJs, /localQueueEmpty/);
  assert.match(labJs, /markerCleared/);
  assert.match(labJs, /knownTabsClean/);
  assert.match(labJs, /HELLO_ACK/);
  assert.match(labJs, /Boolean\(channel\)/);
  assert.match(labJs, /saveReleaseState/);
  assert.match(labJs, /recoverCompletedRelease/);
  assert.match(labJs, /releaseState\.grantPublicId !== expectedGrantPublicId/);
  assert.match(labJs, /clearActiveGrantMarker\(\)/);
  assert.match(labJs, /contextRejected = error\.status === 401/);
  assert.match(labJs, /safe \? "SAFE_TO_RETURN" : "UNVERIFIABLE"/);
  assert.match(labJs, /preexistingAdminAuth/);
});

test("PDA prestado no presenta ni invoca credenciales o capacidades ADMIN", () => {
  assert.doesNotMatch(pairHtml + labHtml, /type="password"|loginForm|ADMIN ·|inventario|valuación/i);
  assert.doesNotMatch(pairJs + labJs, /PasswordCredential|navigator\.credentials|\/api\/admin|Authorization|Bearer/);
  assert.match(pairJs, /history\.replaceState\(null, "", "\/pda-pair\.html"\)/);
  assert.match(pairJs, /LOGITEC-PDA1:/);
  assert.match(pairJs, /localStorage\.setItem\(activeGrantMarkerKey, data\.grant\.publicId\)/);
  assert.match(pairHtml, /no solicita usuario, contraseña ni acceso ADMIN/);
});

test("ocultar o abandonar detiene captura y exige revalidación", () => {
  assert.match(labJs, /document\.addEventListener\("visibilitychange"/);
  assert.match(labJs, /window\.addEventListener\("pagehide"/);
  assert.match(labJs, /function lockPrivacy/);
  assert.match(labJs, /stopCamera\(\)/);
  assert.match(labJs, /await api\("\/api\/pda\/context"\)/);
  assert.match(labJs, /Bloqueo por inactividad/);
});

test("ADMIN conserva creación, pairing, takeover, cierre y export server-side", () => {
  for (const fragment of [
    '"/pda-test-sessions"',
    '"/pda-test-sessions/:sessionId/pairings"',
    '"/pda-test-sessions/:sessionId/takeover"',
    '"/pda-test-sessions/:sessionId/finalize"',
    '"/pda-test-sessions/:testId/export.csv"',
    '"/pda-test-sessions/:testId/export.json"'
  ]) assert.match(adminRoutes, new RegExp(fragment.replaceAll("/", "\\/")));
  assert.match(adminRoutes, /requireOperationalClient/);
  assert.match(adminHtml, /id="pairBtn"/);
  assert.match(adminJs, /format: "QRCode"/);
  assert.match(adminJs, /crypto\.randomUUID\(\)/);
});
