import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const js = readFileSync(new URL("../public/logitec-role-demo.js", import.meta.url), "utf8");

function sliceFunction(source: string, name: string) {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `missing function ${name}`);
  let depth = 0;
  for (let i = start; i < source.length; i += 1) {
    if (source[i] === "{") depth += 1;
    if (source[i] === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  throw new Error(`unterminated function ${name}`);
}

const asyncSlice = (name: string) => {
  const token = `async function ${name}(`;
  const start = js.indexOf(token);
  assert.ok(start >= 0, `missing async function ${name}`);
  let depth = 0;
  for (let i = start; i < js.length; i += 1) {
    if (js[i] === "{") depth += 1;
    if (js[i] === "}") {
      depth -= 1;
      if (depth === 0) return js.slice(start, i + 1);
    }
  }
  throw new Error(`unterminated async function ${name}`);
};

test("boot oficial hidrata capturas desde GET /api/provisional-captures", () => {
  assert.match(js, /async function loadOfficialProvisionalCaptures\(/);
  assert.match(js, /await loadOfficialProvisionalCaptures\(\)/);
  assert.match(sliceFunction(js, "loadOfficialProvisionalCaptures"), /apiGet\("\/api\/provisional-captures"/);
  assert.match(asyncSlice("continueBootAfterAuth"), /if \(OFFICIAL_APP\) await loadOfficialProvisionalCaptures\(\)/);
});

test("sendProvisionalCapture oficial usa POST servidor, demo conserva local", () => {
  const send = asyncSlice("sendProvisionalCapture");
  const officialBlock = send.slice(send.indexOf("if (OFFICIAL_APP)"), send.indexOf("finalizeProvisionalCapture"));
  assert.match(send, /apiFetch\("\/api\/provisional-captures"/);
  assert.match(officialBlock, /upsertOfficialProvisionalCapture\(result\.capture\)/);
  assert.doesNotMatch(officialBlock, /finalizeProvisionalCapture/);
  assert.match(send, /finalizeProvisionalCapture\(buildProvisionalCaptureFromSession\(session\)\)/);
});

test("validateProvisionalCaptureNow oficial usa POST validateNow", () => {
  const validate = asyncSlice("validateProvisionalCaptureNow");
  assert.match(validate, /buildOfficialCapturePostBody\(session, \{ validateNow: true \}\)/);
  assert.match(validate, /apiFetch\("\/api\/provisional-captures"/);
});

test("updateProvisionalCaptureStatus oficial usa PATCH review", () => {
  const update = asyncSlice("updateProvisionalCaptureStatus");
  assert.match(update, /\/api\/provisional-captures\/\$\{encodeURIComponent\(captureId\)\}\/review/);
  assert.match(update, /method: "PATCH"/);
  assert.match(update, /upsertOfficialProvisionalCapture\(result\.capture\)/);
});

test("fallo API no crea captura fantasma en official", () => {
  const send = asyncSlice("sendProvisionalCapture");
  const catchStart = send.indexOf("} catch (error) {");
  const catchEnd = send.indexOf("renderContent();", catchStart) + "renderContent();".length;
  const catchBlock = send.slice(catchStart, catchEnd);
  assert.match(catchBlock, /provisionalActionError/);
  assert.doesNotMatch(catchBlock, /upsertOfficialProvisionalCapture/);
  assert.doesNotMatch(catchBlock, /finalizeProvisionalCapture/);
});

test("write guard permite solo rutas provisional en OFFICIAL_APP", () => {
  assert.match(sliceFunction(js, "isOfficialProvisionalWrite"), /OFFICIAL_APP/);
  assert.match(sliceFunction(js, "isDemoWriteAllowed"), /isOfficialProvisionalWrite\(url, method\)/);
  assert.match(js, /window\.fetch = new Proxy\(fetch[\s\S]*isDemoWriteAllowed\(url, method\)/);
});

test("mapServerCaptureToUi usa identidad real del servidor", () => {
  const mapFn = new Function(
    "DECLARED_FLOOR_ACTIONS",
    `${sliceFunction(js, "declaredActionLabel")}${sliceFunction(js, "mapServerCaptureToUi")}; return mapServerCaptureToUi;`
  )([
    { id: "traslado", label: "Traslado / reubicación física" }
  ]) as (capture: Record<string, unknown>) => Record<string, unknown>;

  const mapped = mapFn({
    id: "cp-1",
    declaredActionId: "traslado",
    status: "PENDIENTE DE SUPERVISIÓN",
    createdById: "u-op-1",
    createdBy: { id: "u-op-1", fullName: "Operador Real", role: "OPERATOR" },
    readings: [{ raw: "SKU-1" }],
    physicalStartedAt: "2026-09-06T18:00:00.000Z",
    physicalEndedAt: "2026-09-06T18:05:00.000Z",
    reviews: []
  });

  assert.equal(mapped.executor, "Operador Real");
  assert.equal(mapped.executorActorId, "u-op-1");
  assert.doesNotMatch(String(mapped.executorActorId), /DEMO/);
});

test("loadOfficialProvisionalCaptures reemplaza state desde servidor sin fallback local", () => {
  const loadSrc = sliceFunction(js, "loadOfficialProvisionalCaptures");
  assert.match(loadSrc, /state\.provisionalCaptures = items\.map/);
  assert.doesNotMatch(loadSrc, /provisionalCaptureSeq/);
  assert.match(loadSrc, /throw new Error/);
});

test("demo route no invoca loadOfficialProvisionalCaptures condicionalmente solo en OFFICIAL_APP", () => {
  assert.match(sliceFunction(js, "loadOfficialProvisionalCaptures"), /if \(!OFFICIAL_APP\) return/);
});

test("integración mock: upsertOfficialProvisionalCapture sincroniza state", () => {
  const DECLARED_FLOOR_ACTIONS = [{ id: "traslado", label: "Traslado / reubicación física" }];
  const upsertFn = new Function(
    "state",
    "DECLARED_FLOOR_ACTIONS",
    `${sliceFunction(js, "declaredActionLabel")}${sliceFunction(js, "mapServerCaptureToUi")}${sliceFunction(
      js,
      "upsertOfficialProvisionalCapture"
    )}; return upsertOfficialProvisionalCapture;`
  )({ provisionalCaptures: [] as Record<string, unknown>[] }, DECLARED_FLOOR_ACTIONS) as (
    capture: Record<string, unknown>
  ) => Record<string, unknown>;

  const mapped = upsertFn({
    id: "cp-server",
    declaredActionId: "traslado",
    status: "PENDIENTE DE SUPERVISIÓN",
    createdById: "u-1",
    createdBy: { id: "u-1", fullName: "Server User", role: "OPERATOR" },
    readings: [{ raw: "A" }],
    physicalStartedAt: "2026-09-06T18:00:00.000Z",
    physicalEndedAt: "2026-09-06T18:01:00.000Z",
    reviews: []
  });

  assert.equal(mapped.id, "cp-server");
});
