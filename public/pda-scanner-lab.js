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
let cameraDetectionArmed = false;
let barcodePolyfillPromise = null;
let cameraStartedAt = null;
let detectedFrameUrl = "";
let detectedFrameGeneration = 0;
let barcodeWriterPromise = null;
let generatedBarcodeDataUrl = "";

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

function metricMs(value) {
  return Number.isFinite(value) ? `${value} ms` : "—";
}

function renderLive(entry, details = []) {
  const css = entry.result === "OK" ? "ok" : entry.result === "NO_LEIDO" ? "error" : "warn";
  liveResult.className = `live-result ${css}`;
  const matchText = details.length
    ? details.map((match) => `${classificationLabel(match.type)}: ${match.label} (${match.detail})`).join(" · ")
    : "Sin coincidencias en el cliente activo.";
  liveResult.innerHTML = `<strong>${escapeHtml(entry.code)} · ${escapeHtml(classificationLabel(entry.classification))}</strong>
    <span>${escapeHtml(matchText)}</span>
    <span>Resultado: ${escapeHtml(resultLabel(entry.result))}</span>
    <span>Tiempo hasta detección: ${escapeHtml(metricMs(entry.detectionMs))} · Latencia de clasificación API: ${escapeHtml(metricMs(entry.classificationMs))}</span>`;
}

function sessionLine(entry) {
  return `${entry.device.testId || "Sin ID"} | ${entry.zone || "Sin zona"} | ${entry.distance} | ${classificationLabel(entry.classification)} | ${entry.code} | ${resultLabel(entry.result)} | detección ${metricMs(entry.detectionMs)} | clasificación ${metricMs(entry.classificationMs)} | ${networkSummary(entry.network)}`;
}

function renderHistory() {
  const body = byId("historyBody");
  if (!history.length) {
    body.innerHTML = '<tr><td colspan="8" class="empty">Sin lecturas en esta sesión.</td></tr>';
  } else {
    body.innerHTML = history.map((entry) => `<tr>
      <td>${escapeHtml(entry.timeLabel)}</td>
      <td>${escapeHtml(entry.device.testId || "—")}<br>${escapeHtml(entry.zone || "—")} · ${escapeHtml(entry.distance)}</td>
      <td><strong>${escapeHtml(entry.code)}</strong><br>${escapeHtml(entry.captureMethod)}</td>
      <td>${escapeHtml(classificationLabel(entry.classification))}<br>Esperado: ${escapeHtml(classificationLabel(entry.expectedType))}</td>
      <td>${escapeHtml(resultLabel(entry.result))}${entry.notes ? `<br>${escapeHtml(entry.notes)}` : ""}</td>
      <td>${escapeHtml(metricMs(entry.detectionMs))}</td>
      <td>${escapeHtml(metricMs(entry.classificationMs))}</td>
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

async function processScan(rawCode, metrics = {}) {
  if (!validateRequired()) return;
  const code = rawCode === undefined ? String(scanInput.value || "") : String(rawCode);
  if (!code.trim()) {
    liveResult.className = "live-result error";
    liveResult.innerHTML = "<strong>Sin código</strong><span>Barre un código o usa “Registrar no leído”.</span>";
    scanInput.focus();
    return;
  }
  byId("scanBtn").disabled = true;
  const classificationStartedAt = performance.now();
  liveResult.className = "live-result idle";
  liveResult.innerHTML = `<strong>Consultando ${escapeHtml(code)}…</strong><span>Solo lectura.</span>`;
  try {
    const data = await api(`/api/admin/pda-scanner-diagnostic/classify?code=${encodeURIComponent(code)}`);
    const classificationMs = Math.max(0, Math.round(performance.now() - classificationStartedAt));
    const entry = makeEntry({
      code: data.code,
      classification: data.classification,
      result: outcomeFor(data.classification, field("expectedType")),
      detectionMs: Number.isFinite(metrics.detectionMs) ? metrics.detectionMs : null,
      classificationMs
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

function clearDetectedFrame() {
  detectedFrameGeneration += 1;
  if (detectedFrameUrl) URL.revokeObjectURL(detectedFrameUrl);
  detectedFrameUrl = "";
  byId("detectedFrameImage").removeAttribute("src");
  byId("detectedFrameEvidence").hidden = true;
}

async function captureDetectedFrame(rawValue) {
  const width = cameraVideo.videoWidth;
  const height = cameraVideo.videoHeight;
  if (!width || !height) return false;

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) return false;
  context.drawImage(cameraVideo, 0, 0, width, height);

  clearDetectedFrame();
  const captureGeneration = detectedFrameGeneration;
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.88));
  if (!blob || captureGeneration !== detectedFrameGeneration) return false;

  detectedFrameUrl = URL.createObjectURL(blob);
  byId("detectedFrameImage").src = detectedFrameUrl;
  byId("detectedFrameCaption").textContent =
    `Frame capturado al detectar “${rawValue}”. Solo memoria de esta pestaña; no se carga ni se guarda.`;
  byId("detectedFrameEvidence").hidden = false;
  return true;
}

function stopCamera(message = "Cámara detenida.") {
  if (cameraTimer) window.clearTimeout(cameraTimer);
  cameraTimer = null;
  cameraDetectionBusy = false;
  cameraDetectionArmed = false;
  if (cameraStream) {
    cameraStream.getTracks().forEach((track) => track.stop());
  }
  cameraStream = null;
  cameraStartedAt = null;
  cameraVideo.pause();
  cameraVideo.srcObject = null;
  byId("startCameraBtn").disabled = false;
  byId("armCameraBtn").disabled = true;
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
  if (!cameraStream || !cameraDetectionArmed) return;
  cameraTimer = window.setTimeout(() => void detectCameraFrame(), 160);
}

async function detectCameraFrame() {
  if (!cameraStream || !cameraDetectionArmed || cameraDetectionBusy) return;
  if (cameraVideo.readyState < 2) {
    scheduleCameraDetection();
    return;
  }
  cameraDetectionBusy = true;
  try {
    const detections = await cameraDetector.detect(cameraVideo);
    if (!cameraStream || !cameraDetectionArmed) return;
    const rawValue = String(detections?.[0]?.rawValue ?? "");
    if (rawValue) {
      const detectionMs = Number.isFinite(cameraStartedAt)
        ? Math.max(0, Math.round(performance.now() - cameraStartedAt))
        : null;
      cameraDetectionArmed = false;
      cameraStartedAt = null;
      scanInput.value = rawValue;
      setCameraStatus(`Código detectado con ${cameraDetectorKind}. Clasificando…`, "ok");
      await captureDetectedFrame(rawValue).catch(() => false);
      await processScan(rawValue, { detectionMs });
      if (cameraStream) {
        byId("armCameraBtn").disabled = false;
        setCameraStatus(`Cámara lista para enfocar · detector ${cameraDetectorKind}.`, "ok");
      }
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

function armCameraDetection() {
  if (!cameraStream || cameraDetectionArmed) return;
  cameraDetectionArmed = true;
  cameraStartedAt = performance.now();
  byId("armCameraBtn").disabled = true;
  setCameraStatus(`Lectura armada · detector ${cameraDetectorKind}. Buscando código…`, "armed");
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
  byId("armCameraBtn").disabled = true;
  setCameraStatus("Preparando cámara · solicitando permiso explícito…");
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
    byId("armCameraBtn").disabled = false;
    byId("stopCameraBtn").disabled = false;
    setCameraStatus(`Cámara lista para enfocar · detector ${cameraDetectorKind}.`, "ok");
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

function setBarcodeGeneratorStatus(message, tone = "") {
  const status = byId("barcodeGeneratorStatus");
  status.textContent = message;
  status.className = `barcode-generator-status${tone ? ` ${tone}` : ""}`;
}

function loadBarcodeWriter() {
  if (window.ZXingWASM?.writeBarcode) return Promise.resolve(window.ZXingWASM);
  if (barcodeWriterPromise) return barcodeWriterPromise;
  barcodeWriterPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "/vendor/zxing-wasm/3.1.3/writer.js";
    script.dataset.zxingWriter = "true";
    script.onload = () => {
      const writer = window.ZXingWASM;
      if (!writer?.writeBarcode || typeof writer.prepareZXingModule !== "function") {
        reject(new Error("El generador Code 128 no está disponible."));
        return;
      }
      writer.prepareZXingModule({
        overrides: {
          locateFile(path, prefix) {
            return path.endsWith(".wasm")
              ? "/vendor/zxing-wasm/3.1.3/zxing_writer.wasm"
              : `${prefix}${path}`;
          }
        }
      });
      resolve(writer);
    };
    script.onerror = () => {
      script.remove();
      barcodeWriterPromise = null;
      reject(new Error("No se pudo cargar el generador local."));
    };
    document.head.appendChild(script);
  });
  return barcodeWriterPromise;
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("No se pudo preparar la imagen generada."));
    reader.readAsDataURL(blob);
  });
}

async function generateTestBarcode() {
  const value = field("barcodeSampleInput");
  if (!value) {
    setBarcodeGeneratorStatus("Escribe un texto o SKU real conocido.", "error");
    byId("barcodeSampleInput").focus();
    return;
  }
  const button = byId("generateBarcodeBtn");
  button.disabled = true;
  setBarcodeGeneratorStatus("Generando Code 128 localmente…");
  try {
    const writer = await loadBarcodeWriter();
    const output = await writer.writeBarcode(value, {
      format: "Code128",
      scale: 3,
      addHRT: true,
      addQuietZones: true
    });
    if (output.error || !output.image) {
      throw new Error(output.error || "ZXing no produjo una imagen.");
    }
    generatedBarcodeDataUrl = await blobToDataUrl(output.image);
    byId("barcodeImage").src = generatedBarcodeDataUrl;
    byId("barcodePreview").hidden = false;
    byId("downloadBarcodeBtn").hidden = false;
    setBarcodeGeneratorStatus(`Code 128 generado para “${value}”. No se consultó ni modificó la base de datos.`, "ok");
  } catch (error) {
    setBarcodeGeneratorStatus(`No se pudo generar: ${error?.message || "error desconocido"}.`, "error");
  } finally {
    button.disabled = false;
  }
}

function useLastScannedCode() {
  const last = history.find((entry) => entry.code && entry.code !== "(sin lectura)");
  if (!last) {
    setBarcodeGeneratorStatus("Aún no hay un código leído en esta sesión.", "error");
    return;
  }
  byId("barcodeSampleInput").value = last.code;
  byId("barcodeSampleInput").focus();
  setBarcodeGeneratorStatus("Último código copiado. Presiona “Generar Code 128”.");
}

function downloadTestBarcode() {
  if (!generatedBarcodeDataUrl) return;
  const anchor = document.createElement("a");
  anchor.href = generatedBarcodeDataUrl;
  anchor.download = "logitec-code128-prueba.png";
  anchor.click();
}

function registerNotRead() {
  if (!validateRequired()) return;
  const entry = makeEntry({
    code: field("scanInput") || "(sin lectura)",
    classification: "NO_LEIDO",
    result: "NO_LEIDO",
    detectionMs: null,
    classificationMs: null
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
  const headers = ["fecha", "prueba", "dispositivo", "marca", "modelo", "so", "lector", "zona", "distancia", "esperado", "codigo", "clasificacion", "resultado", "tiempo_deteccion_ms", "latencia_clasificacion_ms", "captura", "red", "ping_ms", "down_mbps", "up_mbps", "observaciones"];
  const rows = history.map((entry) => [
    entry.timestamp, entry.device.testId, entry.device.deviceType, entry.device.brand, entry.device.model,
    entry.device.os, entry.device.readerType, entry.zone, entry.distance, classificationLabel(entry.expectedType),
    entry.code, classificationLabel(entry.classification), resultLabel(entry.result), entry.detectionMs ?? "",
    entry.classificationMs ?? "",
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
byId("armCameraBtn").addEventListener("click", armCameraDetection);
byId("stopCameraBtn").addEventListener("click", () => stopCamera());
byId("cameraFallbackBtn").addEventListener("click", () => setCaptureMode("handheld"));
byId("discardDetectedFrameBtn").addEventListener("click", clearDetectedFrame);
byId("generateBarcodeBtn").addEventListener("click", () => void generateTestBarcode());
byId("useLastScanBtn").addEventListener("click", useLastScannedCode);
byId("downloadBarcodeBtn").addEventListener("click", downloadTestBarcode);
byId("notReadBtn").addEventListener("click", registerNotRead);
byId("repeatBtn").addEventListener("click", () => { scanInput.value = ""; scanInput.focus(); });
byId("copyBtn").addEventListener("click", () => void copySummary());
byId("exportBtn").addEventListener("click", exportCsv);
byId("clearBtn").addEventListener("click", () => {
  if (!history.length || window.confirm("¿Limpiar únicamente el historial temporal de esta pestaña?")) {
    history.splice(0);
    clearDetectedFrame();
    renderHistory();
    liveResult.className = "live-result idle";
    liveResult.innerHTML = "<strong>Sesión limpia</strong><span>No se modificó inventario.</span>";
  }
});
window.addEventListener("pagehide", () => {
  if (cameraStream) stopCamera();
  clearDetectedFrame();
});
document.addEventListener("visibilitychange", () => {
  if (document.hidden && cameraStream) stopCamera("Cámara detenida al ocultar la pestaña.");
});

void initialize();
