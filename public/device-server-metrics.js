(function initDeviceServerMetrics(global) {
  const PROVIDER_OPTIONS = ["Izzi", "Datos móviles", "Otra red", "Sin dato"];
  const LOCATION_OPTIONS = [
    "Dentro de bodega",
    "Fuera de bodega",
    "Otra bodega",
    "Despacho Rodrigo Maafs",
    "Casa",
    "Casa Hugo",
    "Otro lugar",
    "Sin dato"
  ];

  function createMeasurementId(prefix) {
    const safePrefix = String(prefix || "dsm").trim() || "dsm";
    try {
      if (global.crypto?.randomUUID) return `${safePrefix}-${global.crypto.randomUUID()}`;
    } catch {
      // ignore
    }
    return `${safePrefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }

  function readConnection() {
    const nav = global.navigator;
    if (!nav) return null;
    return nav.connection || nav.mozConnection || nav.webkitConnection || null;
  }

  function detectConnectionProvider() {
    const conn = readConnection();
    if (!conn) return "Sin dato";
    const type = String(conn.type || "").toLowerCase();
    const effectiveType = String(conn.effectiveType || "").toLowerCase();
    if (type === "cellular" || ["4g", "3g", "2g", "slow-2g"].includes(effectiveType)) {
      return "Datos móviles";
    }
    if (type === "ethernet" || type === "bluetooth") return "Otra red";
    if (type === "wifi" || type === "wimax") return "Sin dato";
    return "Sin dato";
  }

  function resolveNetworkProvider(manualValue, autoDetected) {
    const manual = String(manualValue || "").trim();
    if (manual) {
      const lower = manual.toLowerCase();
      if (lower.includes("izzi")) return "Izzi";
      if (/(datos|celular|mobile|lte|4g|5g|3g)/i.test(manual)) return "Datos móviles";
      return "Otra red";
    }
    const auto = String(autoDetected || "").trim();
    return PROVIDER_OPTIONS.includes(auto) ? auto : "Sin dato";
  }

  function resolveLocationContext(value) {
    const normalized = String(value || "").trim();
    if (!normalized) return "Sin dato";
    if (LOCATION_OPTIONS.includes(normalized)) return normalized;
    return "Otro lugar";
  }

  function computeTimingFields(input) {
    const detectionMs = Number.isFinite(input.detectionMs) ? Math.max(0, Math.round(input.detectionMs)) : null;
    const roundTripMs = Number.isFinite(input.roundTripMs) ? Math.max(0, Math.round(input.roundTripMs)) : null;
    const apiLatencyMs = roundTripMs;
    const classificationMs = roundTripMs;
    const totalMs =
      detectionMs != null && roundTripMs != null
        ? detectionMs + roundTripMs
        : roundTripMs != null
          ? roundTripMs
          : null;
    return { detectionMs, roundTripMs, apiLatencyMs, classificationMs, totalMs };
  }

  function buildMetricsRecord(input) {
    const timing = computeTimingFields(input || {});
    return {
      measurementId: input?.measurementId || createMeasurementId(),
      requestSentAt: input?.requestSentAt || null,
      responseReceivedAt: input?.responseReceivedAt || null,
      sessionId: input?.sessionId || null,
      deviceType: input?.deviceType || "Sin dato",
      locationContext: resolveLocationContext(input?.locationContext),
      networkProvider: resolveNetworkProvider(input?.networkProviderManual, input?.networkProviderAuto),
      code: input?.code ?? "",
      expectedType: input?.expectedType || "Sin dato",
      classification: input?.classification || "Sin dato",
      result: input?.result || "Sin dato",
      detectionMs: timing.detectionMs,
      apiLatencyMs: timing.apiLatencyMs,
      classificationMs: timing.classificationMs,
      roundTripMs: timing.roundTripMs,
      totalMs: timing.totalMs,
      httpStatus: Number.isFinite(input?.httpStatus) ? input.httpStatus : null,
      endpoint: input?.endpoint || "",
      errorSummary: input?.errorSummary || null
    };
  }

  function safeRecordMetrics(callback, record) {
    try {
      if (typeof callback === "function") callback(record);
    } catch {
      // El registro de métricas nunca debe interrumpir el flujo operativo.
    }
  }

  global.LogitecDeviceMetrics = {
    PROVIDER_OPTIONS,
    LOCATION_OPTIONS,
    createMeasurementId,
    detectConnectionProvider,
    resolveNetworkProvider,
    resolveLocationContext,
    computeTimingFields,
    buildMetricsRecord,
    safeRecordMetrics
  };
})(globalThis);
