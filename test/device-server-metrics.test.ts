import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const metricsSource = readFileSync(new URL("../public/device-server-metrics.js", import.meta.url), "utf8");
const pdaJs = readFileSync(new URL("../public/pda-scanner-lab.js", import.meta.url), "utf8");
const pdaHtml = readFileSync(new URL("../public/pda-scanner-lab.html", import.meta.url), "utf8");
const hugoJs = readFileSync(new URL("../public/hugo-buffer-inbound.js", import.meta.url), "utf8");
const hugoHtml = readFileSync(new URL("../public/hugo-buffer-inbound.html", import.meta.url), "utf8");

type MetricsApi = {
  PROVIDER_OPTIONS: string[];
  LOCATION_OPTIONS: string[];
  createMeasurementId(prefix?: string): string;
  detectConnectionProvider(): string;
  resolveNetworkProvider(manualValue?: string, autoDetected?: string): string;
  resolveLocationContext(value?: string): string;
  computeTimingFields(input: {
    detectionMs?: number | null;
    roundTripMs?: number | null;
  }): {
    detectionMs: number | null;
    roundTripMs: number | null;
    apiLatencyMs: number | null;
    classificationMs: number | null;
    totalMs: number | null;
  };
  buildMetricsRecord(input: Record<string, unknown>): Record<string, unknown>;
  safeRecordMetrics(callback: (record: Record<string, unknown>) => void, record: Record<string, unknown>): void;
};

function loadMetrics(navigator: Record<string, unknown> = {}): MetricsApi {
  const sandbox: Record<string, unknown> = {
    navigator,
    crypto: {
      randomUUID: () => "00000000-0000-4000-8000-000000000001"
    }
  };
  const run = new Function(
    "globalThis",
    `${metricsSource}\nreturn globalThis.LogitecDeviceMetrics;`
  ) as (globalThis: Record<string, unknown>) => MetricsApi;
  const api = run(sandbox);
  assert.ok(api, "LogitecDeviceMetrics must be exported");
  return api;
}

test("buildMetricsRecord calcula roundTripMs, apiLatencyMs y totalMs sin mezclar detección", () => {
  const api = loadMetrics();
  const record = api.buildMetricsRecord({
    detectionMs: 120,
    roundTripMs: 80,
    code: "SKU-1",
    endpoint: "/api/admin/pda-scanner-diagnostic/classify?code=SKU-1",
    httpStatus: 200
  });
  assert.equal(record.detectionMs, 120);
  assert.equal(record.roundTripMs, 80);
  assert.equal(record.apiLatencyMs, 80);
  assert.equal(record.classificationMs, 80);
  assert.equal(record.totalMs, 200);
});

test("ausencia de datos opcionales usa Sin dato o null de forma consistente", () => {
  const api = loadMetrics();
  const record = api.buildMetricsRecord({
    roundTripMs: 50,
    code: "X"
  });
  assert.equal(record.locationContext, "Sin dato");
  assert.equal(record.networkProvider, "Sin dato");
  assert.equal(record.detectionMs, null);
  assert.equal(record.totalMs, 50);
  assert.equal(record.errorSummary, null);
});

test("resolveNetworkProvider prioriza manual Izzi y datos móviles", () => {
  const api = loadMetrics();
  assert.equal(api.resolveNetworkProvider("Red Izzi oficina", "Sin dato"), "Izzi");
  assert.equal(api.resolveNetworkProvider("LTE celular", "Sin dato"), "Datos móviles");
  assert.equal(api.resolveNetworkProvider("", "Datos móviles"), "Datos móviles");
});

test("safeRecordMetrics no propaga errores del callback", () => {
  const api = loadMetrics();
  assert.doesNotThrow(() => {
    api.safeRecordMetrics(() => {
      throw new Error("telemetry sink failed");
    }, api.buildMetricsRecord({ roundTripMs: 1, code: "A" }));
  });
});

test("detectConnectionProvider infiere datos móviles desde Network Information API", () => {
  const api = loadMetrics({ connection: { type: "cellular", effectiveType: "4g" } });
  assert.equal(api.detectConnectionProvider(), "Datos móviles");
});

test("createMeasurementId genera identificadores con prefijo", () => {
  const api = loadMetrics();
  assert.match(api.createMeasurementId("pda"), /^pda-/);
});

test("PDA lab carga módulo compartido y usa classifyCode con métricas", () => {
  assert.match(pdaHtml, /device-server-metrics\.js\?v=1/);
  assert.match(pdaJs, /globalThis\.LogitecDeviceMetrics/);
  assert.match(pdaJs, /async function classifyCode\(/);
  assert.match(pdaJs, /await classifyCode\(code, detectionMs\)/);
  assert.match(pdaJs, /roundTripMs/);
  assert.match(pdaJs, /latencia_clasificacion_ms/);
  assert.match(pdaJs, /round_trip_ms/);
  assert.match(pdaJs, /scanSessionSeenCodes\.has\(code\)/);
  assert.match(pdaJs, /if \(scanSessionClosed \|\| scanProcessing\) return null/);
});

test("Hugo flow registra métricas sin bloquear apiFetch", () => {
  assert.match(hugoHtml, /device-server-metrics\.js/);
  assert.match(hugoJs, /LogitecDeviceMetrics/);
  assert.match(hugoJs, /state\.deviceMetrics/);
  assert.match(hugoJs, /safeRecordMetrics/);
});
