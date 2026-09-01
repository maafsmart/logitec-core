const token = localStorage.getItem("token") || "";
const history = [];
const byId = (id) => document.getElementById(id);
const field = (id) => String(byId(id)?.value || "").trim();
const scanInput = byId("scanInput");
const liveResult = byId("liveResult");
const cameraVideo = byId("cameraVideo");
let captureMode = "handheld";
let cameraStream = null;
let cameraTimer = null;
let cameraDetector = null;
let cameraDetectorKind = "";
let cameraDetectionBusy = false;
let barcodePolyfillPromise = null;

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function api(path) {
  const response = await fetch(path, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    cache: "no-store"
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.message || `Error HTTP ${response.status}`);
    error.code = data.code || "";
    error.status = response.status;
    throw error;
  }
  return data;
}

function deviceSnapshot() {
  return {
    testId: field("testId"),
    deviceType: field("deviceType"),
    brand: field("deviceBrand"),
    model: field("deviceModel"),
    os: field("deviceOs"),
    readerType: field("readerType"),
    total: field("deviceTotal"),
    concurrent: field("deviceConcurrent"),
    month: field("deviceMonth"),
    yearEnd: field("deviceYearEnd")
  };
}

function networkSnapshot() {
  return {
    provider: field("networkProvider"),
    zone: field("networkZone"),
    ping: field("networkPing"),
    down: field("networkDown"),
    up: field("networkUp"),
    stability: field("networkStability"),
    reference: field("networkReference")
  };
}

function networkSummary(network) {
  const speed = [
    network.ping ? `ping ${network.ping} ms` : "",
    network.down ? `${network.down} Mbps down` : "",
    network.up ? `${network.up} Mbps up` : ""
  ].filter(Boolean).join(" / ");
  return [network.provider, network.zone, speed].filter(Boolean).join(" · ") || "Sin dato";
}

function resultLabel(result) {
  return ({
    OK: "OK",
    NO_LEIDO: "No leído",
    LEIDO_INCORRECTAMENTE: "Leído incorrectamente",
    RECONOCIDO_NO_ENCONTRADO: "Reconocido pero no encontrado",
    OTRO: "Otro / ambiguo"
  })[result] || result;
}

function classificationLabel(value) {
  return ({
    SKU: "SKU",
    UBICACION: "Ubicación",
    LOTE: "Lote",
    SERIE_IMEI: "Serie / IMEI",
    AMBIGUO: "AMBIGUO",
    NO_ENCONTRADO: "No encontrado",
    NO_LEIDO: "No leído"
  })[value] || value;
}

function outcomeFor(classification, expected) {
  if (classification === "NO_ENCONTRADO") return "RECONOCIDO_NO_ENCONTRADO";
  if (classification === "AMBIGUO") return "OTRO";
  if (expected === "OTRO" || classification === expected) return "OK";
  return "LEIDO_INCORRECTAMENTE";
}

function renderLive(entry, details = []) {
  const css = entry.result === "OK" ? "ok" : entry.result === "NO_LEIDO" ? "error" : "warn";
  liveResult.className = `live-result ${css}`;
  const matchText = details.length
    ? details.map((match) => `${classificationLabel(match.type)}: ${match.label} (${match.detail})`).join(" · ")
    : "Sin coincidencias en el cliente activo.";
  liveResult.innerHTML = `<strong>${escapeHtml(entry.code)} · ${escapeHtml(classificationLabel(entry.classification))}</strong>
    <span>${escapeHtml(matchText)}</span>
    <span>Resultado: ${escapeHtml(resultLabel(entry.result))} · ${escapeHtml(String(entry.latencyMs))} ms</span>`;
}

function sessionLine(entry) {
  return `${entry.device.testId || "Sin ID"} | ${entry.zone || "Sin zona"} | ${entry.distance} | ${classificationLabel(entry.classification)} | ${entry.code} | ${resultLabel(entry.result)} | ${entry.latencyMs} ms | ${networkSummary(entry.network)}`;
}

function renderHistory() {
  const body = byId("historyBody");
  if (!history.length) {
    body.innerHTML = '<tr><td colspan="7" class="empty">Sin lecturas en esta sesión.</td></tr>';
  } else {
    body.innerHTML = history.map((entry) => `<tr>
      <td>${escapeHtml(entry.timeLabel)}</td>
      <td>${escapeHtml(entry.device.testId || "—")}<br>${escapeHtml(entry.zone || "—")} · ${escapeHtml(entry.distance)}</td>
      <td><strong>${escapeHtml(entry.code)}</strong><br>${escapeHtml(entry.captureMethod)}</td>
      <td>${escapeHtml(classificationLabel(entry.classification))}<br>Esperado: ${escapeHtml(classificationLabel(entry.expectedType))}</td>
      <td>${escapeHtml(resultLabel(entry.result))}${entry.notes ? `<br>${escapeHtml(entry.notes)}` : ""}</td>
      <td>${escapeHtml(String(entry.latencyMs))} ms</td>
      <td>${escapeHtml(networkSummary(entry.network))}</td>
    </tr>`).join("");
  }
  const ok = history.filter((entry) => entry.result === "OK").length;
  byId("sessionStats").textContent = `${history.length} lectura${history.length === 1 ? "" : "s"} · ${ok} OK · ${history.length - ok} con revisión`;
}

function makeEntry(overrides) {
  const now = new Date();
  return {
    id: `${now.getTime()}-${history.length}`,
    timestamp: now.toISOString(),
    timeLabel: now.toLocaleTimeString("es-MX"),
    device: deviceSnapshot(),
    network: networkSnapshot(),
    zone: field("physicalZone"),
    distance: field("distance"),
    expectedType: field("expectedType"),
    captureMethod: field("captureMethod"),
    notes: field("scanNotes"),
    ...overrides
  };
}

function validateRequired() {
  const missing = [];
  if (!field("testId")) missing.push("identificador de prueba");
  if (!field("physicalZone")) missing.push("zona física");
  if (missing.length) {
    liveResult.className = "live-result error";
    liveResult.innerHTML = `<strong>Faltan datos</strong><span>Completa ${escapeHtml(missing.join(" y "))}.</span>`;
    return false;
  }
  return true;
}

async function processScan(rawCode) {
  if (!validateRequired()) return;
  const code = rawCode === undefined ? String(scanInput.value || "") : String(rawCode);
  if (!code.trim()) {
    liveResult.className = "live-result error";
    liveResult.innerHTML = "<strong>Sin código</strong><span>Barre un código o usa “Registrar no leído”.</span>";
    scanInput.focus();
    return;
  }
  byId("scanBtn").disabled = true;
  const started = performance.now();
  liveResult.className = "live-result idle";
  liveResult.innerHTML = `<strong>Consultando ${escapeHtml(code)}…</strong><span>Solo lectura.</span>`;
  try {
    const data = await api(`/api/admin/pda-scanner-diagnostic/classify?code=${encodeURIComponent(code)}`);
    const latencyMs = Math.max(0, Math.round(performance.now() - started));
    const entry = makeEntry({
      code: data.code,
      classification: data.classification,
      result: outcomeFor(data.classification, field("expectedType")),
      latencyMs
    });
    history.unshift(entry);
    renderLive(entry, data.matches || []);
    renderHistory();
    byId("scanNotes").value = "";
    scanInput.value = "";
  } catch (error) {
    liveResult.className = "live-result error";
    liveResult.innerHTML = `<strong>No se pudo clasificar</strong><span>${escapeHtml(error.message)}</span>`;
  } finally {
    byId("scanBtn").disabled = false;
    scanInput.focus();
  }
}

function setCameraStatus(message, tone = "") {
  const status = byId("cameraStatus");
  status.textContent = message;
  status.className = `camera-status${tone ? ` ${tone}` : ""}`;
}

function stopCamera(message = "Cámara detenida.") {
  if (cameraTimer) window.clearTimeout(cameraTimer);
  cameraTimer = null;
  cameraDetectionBusy = false;
  if (cameraStream) {
    cameraStream.getTracks().forEach((track) => track.stop());
  }
  cameraStream = null;
  cameraVideo.pause();
  cameraVideo.srcObject = null;
  byId("startCameraBtn").disabled = false;
  byId("stopCameraBtn").disabled = true;
  setCameraStatus(message);
}

function setCaptureMode(mode) {
  captureMode = mode === "camera" ? "camera" : "handheld";
  const camera = captureMode === "camera";
  byId("handheldModeBtn").classList.toggle("active", !camera);
  byId("handheldModeBtn").setAttribute("aria-selected", String(!camera));
  byId("cameraModeBtn").classList.toggle("active", camera);
  byId("cameraModeBtn").setAttribute("aria-selected", String(camera));
  byId("handheldCapture").hidden = camera;
  byId("cameraCapture").hidden = !camera;
  if (camera) {
    byId("deviceType").value = "Teléfono";
    byId("readerType").value = "Cámara";
    byId("captureMethod").value = "Cámara de celular";
  } else {
    if (cameraStream) stopCamera("Cámara detenida; captura manual disponible.");
    if (field("captureMethod") === "Cámara de celular") {
      byId("captureMethod").value = "Scanner como teclado";
    }
    scanInput.focus();
  }
}

function loadBarcodeDetectorPolyfill() {
  if (window.BarcodeDetector) return Promise.resolve();
  if (barcodePolyfillPromise) return barcodePolyfillPromise;
  barcodePolyfillPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "/vendor/barcode-detector/3.2.2/polyfill.js";
    script.dataset.barcodeDetectorPolyfill = "true";
    script.onload = resolve;
    script.onerror = () => {
      script.remove();
      barcodePolyfillPromise = null;
      reject(new Error("No se pudo cargar el decodificador local."));
    };
    document.head.appendChild(script);
  });
  return barcodePolyfillPromise;
}

async function createCameraDetector() {
  if (window.BarcodeDetector) {
    cameraDetectorKind = "nativo";
    return new window.BarcodeDetector();
  }
  await loadBarcodeDetectorPolyfill();
  const prepare = window.BarcodeDetectionAPI?.prepareZXingModule;
  if (typeof prepare === "function") {
    await prepare({
      overrides: {
        locateFile(path, prefix) {
          return path.endsWith(".wasm")
            ? "/vendor/zxing-wasm/3.1.3/zxing_reader.wasm"
            : `${prefix}${path}`;
        }
      }
    });
  }
  if (!window.BarcodeDetector) throw new Error("El decodificador de códigos no está disponible.");
  cameraDetectorKind = "ZXing-WASM";
  return new window.BarcodeDetector();
}

function scheduleCameraDetection() {
  if (!cameraStream) return;
  cameraTimer = window.setTimeout(() => void detectCameraFrame(), 160);
}

async function detectCameraFrame() {
  if (!cameraStream || cameraDetectionBusy) return;
  if (cameraVideo.readyState < 2) {
    scheduleCameraDetection();
    return;
  }
  cameraDetectionBusy = true;
  try {
    const detections = await cameraDetector.detect(cameraVideo);
    const rawValue = String(detections?.[0]?.rawValue ?? "");
    if (rawValue) {
      scanInput.value = rawValue;
      stopCamera(`Código detectado con ${cameraDetectorKind}. Clasificando…`);
      await processScan(rawValue);
      return;
    }
  } catch (error) {
    if (!cameraStream) return;
    setCameraStatus(`Buscando código… ${error?.message || "ajusta distancia e iluminación"}`);
  } finally {
    cameraDetectionBusy = false;
  }
  scheduleCameraDetection();
}

async function startCamera() {
  if (!window.isSecureContext && window.location.hostname !== "localhost") {
    setCameraStatus("La cámara requiere HTTPS. Usa captura manual/lector teclado.", "error");
    return;
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    setCameraStatus("Este navegador no ofrece acceso a cámara. Usa captura manual/lector teclado.", "error");
    return;
  }
  byId("startCameraBtn").disabled = true;
  setCameraStatus("Solicitando permiso explícito de cámara…");
  try {
    cameraStream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        facingMode: { ideal: "environment" },
        width: { ideal: 1280 },
        height: { ideal: 720 }
      }
    });
    cameraVideo.srcObject = cameraStream;
    await cameraVideo.play();
    cameraDetector = cameraDetector || await createCameraDetector();
    byId("stopCameraBtn").disabled = false;
    setCameraStatus(`Cámara activa · detector ${cameraDetectorKind}. Centra un código de barras o QR.`, "ok");
    scheduleCameraDetection();
  } catch (error) {
    stopCamera("Cámara no disponible.");
    const denied = error?.name === "NotAllowedError";
    setCameraStatus(
      denied
        ? "Permiso de cámara denegado. Habilítalo en el navegador o usa captura manual/lector teclado."
        : `No se pudo iniciar la cámara: ${error?.message || "error desconocido"}. Usa captura manual/lector teclado.`,
      "error"
    );
  }
}

function registerNotRead() {
  if (!validateRequired()) return;
  const entry = makeEntry({
    code: field("scanInput") || "(sin lectura)",
    classification: "NO_LEIDO",
    result: "NO_LEIDO",
    latencyMs: 0
  });
  history.unshift(entry);
  renderLive(entry);
  renderHistory();
  byId("scanNotes").value = "";
  scanInput.value = "";
  scanInput.focus();
}

function csvCell(value) {
  let text = String(value ?? "");
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

function exportCsv() {
  if (!history.length) return;
  const headers = ["fecha", "prueba", "dispositivo", "marca", "modelo", "so", "lector", "zona", "distancia", "esperado", "codigo", "clasificacion", "resultado", "latencia_ms", "captura", "red", "ping_ms", "down_mbps", "up_mbps", "observaciones"];
  const rows = history.map((entry) => [
    entry.timestamp, entry.device.testId, entry.device.deviceType, entry.device.brand, entry.device.model,
    entry.device.os, entry.device.readerType, entry.zone, entry.distance, classificationLabel(entry.expectedType),
    entry.code, classificationLabel(entry.classification), resultLabel(entry.result), entry.latencyMs,
    entry.captureMethod, entry.network.provider, entry.network.ping, entry.network.down, entry.network.up, entry.notes
  ]);
  const csv = [headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `laboratorio-pda-${field("testId") || "sesion"}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}

async function copySummary() {
  if (!history.length) return;
  const text = history.map(sessionLine).join("\n");
  try {
    await navigator.clipboard.writeText(text);
    byId("copyBtn").textContent = "Resumen copiado";
    setTimeout(() => { byId("copyBtn").textContent = "Copiar resumen"; }, 1400);
  } catch (_error) {
    window.prompt("Copia el resumen:", text);
  }
}

async function initialize() {
  const gate = byId("accessGate");
  if (!token) {
    gate.className = "access-gate error";
    gate.innerHTML = 'Inicia sesión como ADMIN en el <a href="/login.html?next=/pda-scanner-lab.html">login</a>.';
    return;
  }
  try {
    const me = await api("/api/auth/me");
    if (me.role !== "ADMIN") throw new Error("Este laboratorio está restringido a ADMIN.");
    if (!me.operationalClient) {
      throw new Error("Selecciona primero un cliente activo en el panel y vuelve a abrir el laboratorio.");
    }
    const clientName = me.operationalClient.tradeName || me.operationalClient.name || me.operationalClient.code;
    byId("sessionContext").textContent = `${me.fullName || me.email} · cliente ${clientName}`;
    gate.hidden = true;
    byId("labWorkspace").hidden = false;
    byId("testId").value = `PDA-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-01`;
    scanInput.focus();
  } catch (error) {
    gate.className = "access-gate error";
    gate.innerHTML = `${escapeHtml(error.message)} <a href="/dashboard.html">Ir al panel</a>.`;
  }
}

scanInput.addEventListener("keydown", (event) => {
  if (event.key !== "Enter") return;
  event.preventDefault();
  void processScan();
});
byId("scanBtn").addEventListener("click", () => void processScan());
byId("handheldModeBtn").addEventListener("click", () => setCaptureMode("handheld"));
byId("cameraModeBtn").addEventListener("click", () => setCaptureMode("camera"));
byId("startCameraBtn").addEventListener("click", () => void startCamera());
byId("stopCameraBtn").addEventListener("click", () => stopCamera());
byId("cameraFallbackBtn").addEventListener("click", () => setCaptureMode("handheld"));
byId("notReadBtn").addEventListener("click", registerNotRead);
byId("repeatBtn").addEventListener("click", () => { scanInput.value = ""; scanInput.focus(); });
byId("copyBtn").addEventListener("click", () => void copySummary());
byId("exportBtn").addEventListener("click", exportCsv);
byId("clearBtn").addEventListener("click", () => {
  if (!history.length || window.confirm("¿Limpiar únicamente el historial temporal de esta pestaña?")) {
    history.splice(0);
    renderHistory();
    liveResult.className = "live-result idle";
    liveResult.innerHTML = "<strong>Sesión limpia</strong><span>No se modificó inventario.</span>";
  }
});
window.addEventListener("pagehide", () => {
  if (cameraStream) stopCamera();
});
document.addEventListener("visibilitychange", () => {
  if (document.hidden && cameraStream) stopCamera("Cámara detenida al ocultar la pestaña.");
});

void initialize();
