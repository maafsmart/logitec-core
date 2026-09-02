const byId = (id) => document.getElementById(id);
const DB_NAME = "logitec-pda-evidence-v2";
const STORE_NAME = "pending-attempts";
const RUN_DESCRIPTOR = "logitec:pda:active-run:v2";
const MASK_DELAY_MS = 4_000;
const IDLE_LOCK_MS = 2 * 60 * 1000;

let grant = null;
let run = null;
let clientSeq = 0;
let captureMethod = "HID";
let syncBusy = false;
let paused = false;
let cameraStream = null;
let detector = null;
let cameraTimer = null;
let cameraArmedAt = null;
let maskTimer = null;
let idleTimer = null;
let counts = { total: 0, ok: 0, review: 0 };
let preexistingAdminAuth = false;

function uuid() {
  if (!crypto.randomUUID) throw new Error("Este navegador no soporta identificadores seguros.");
  return crypto.randomUUID();
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    method: options.method || "GET",
    credentials: "same-origin",
    headers: {
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {})
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    cache: "no-store",
    referrerPolicy: "no-referrer"
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.message || `Error HTTP ${response.status}`);
    error.status = response.status;
    error.code = data.code || "";
    throw error;
  }
  return data;
}

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME, { keyPath: "idempotencyKey" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function storeOperation(mode, operation) {
  const db = await openDb();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, mode);
      const request = operation(transaction.objectStore(STORE_NAME));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } finally {
    db.close();
  }
}

const queueAttempt = (record) => storeOperation("readwrite", (store) => store.put(record));
const allQueued = () => storeOperation("readonly", (store) => store.getAll());
const deleteAttempt = (key) => storeOperation("readwrite", (store) => store.delete(key));
const runQueue = async (runPublicId = run?.publicId) =>
  (await allQueued()).filter((item) =>
    item.grantPublicId === grant?.grantPublicId && item.runPublicId === runPublicId
  );

async function legacyEvidenceState() {
  if (typeof indexedDB.databases !== "function") return "UNVERIFIABLE_LEGACY_STORAGE";
  const databases = await indexedDB.databases();
  if (databases.some((database) => database.name === "logitec-pda-evidence-v1")) {
    return "UNVERIFIABLE_LEGACY_STORAGE";
  }
  return null;
}

function saveDescriptor() {
  if (!grant || !run) return;
  sessionStorage.setItem(RUN_DESCRIPTOR, JSON.stringify({
    grantPublicId: grant.grantPublicId,
    runPublicId: run.publicId,
    epoch: run.epoch,
    clientSeq,
    testId: run.session?.testId || null
  }));
}

function readDescriptor(expectedGrantId = grant?.grantPublicId) {
  try {
    const value = JSON.parse(sessionStorage.getItem(RUN_DESCRIPTOR) || "null");
    return value?.runPublicId && (!expectedGrantId || value.grantPublicId === expectedGrantId) ? value : null;
  } catch {
    return null;
  }
}

function clearDescriptor() {
  sessionStorage.removeItem(RUN_DESCRIPTOR);
}

function setSaveState(state, detail = "") {
  const status = byId("syncStatus");
  const labels = {
    saved: "Guardado",
    pending: "Pendiente de sincronizar",
    error: "Error de guardado"
  };
  status.className = `sync-status ${state}`;
  status.textContent = `${labels[state]}${detail ? ` · ${detail}` : ""}`;
}

function renderCounts() {
  byId("sessionStats").textContent =
    `${counts.total} lecturas · ${counts.ok} OK · ${counts.review} revisión`;
}

function maskVisibleReading() {
  byId("scanInput").value = "";
  const result = byId("liveResult");
  result.className = "live-result idle";
  result.innerHTML = "<strong>Lectura protegida</strong><span>Resultado guardado; el código se retiró de pantalla.</span>";
}

function showResult(reading, state) {
  window.clearTimeout(maskTimer);
  const code = reading.normalizedCode || reading.rawCode || "(sin lectura)";
  const masked = code.length <= 4 ? "••••" : `${code.slice(0, 2)}••••${code.slice(-2)}`;
  const result = byId("liveResult");
  result.className = `live-result ${reading.result === "OK" ? "ok" : "warn"}`;
  result.innerHTML = `<strong>${escapeHtml(masked)} · ${escapeHtml(reading.result)}</strong>
    <span>${escapeHtml(reading.classification)} · ${state === "saved" ? "Guardado" : "Pendiente de sincronizar"}</span>`;
  maskTimer = window.setTimeout(maskVisibleReading, MASK_DELAY_MS);
}

async function syncQueue() {
  if (syncBusy || !navigator.onLine || !run) return;
  syncBusy = true;
  try {
    const queued = (await runQueue()).sort((a, b) => a.clientSeq - b.clientSeq);
    for (const item of queued) {
      try {
        const response = await api("/api/pda/readings", { method: "POST", body: item.payload });
        await deleteAttempt(item.idempotencyKey);
        if (!item.counted) {
          counts.total += 1;
          if (response.reading.result === "OK") counts.ok += 1;
          else counts.review += 1;
          renderCounts();
        }
        showResult(response.reading, "saved");
      } catch (error) {
        setSaveState(error.status ? "error" : "pending", error.message);
        break;
      }
    }
    const remaining = await runQueue();
    if (!remaining.length) setSaveState("saved", "sin pendientes locales");
    else if (!byId("syncStatus").classList.contains("error")) {
      setSaveState("pending", `${remaining.length} intento(s)`);
    }
  } finally {
    syncBusy = false;
  }
}

function networkMetadata() {
  const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  return {
    online: navigator.onLine,
    effectiveType: connection?.effectiveType || null,
    downlink: connection?.downlink || null,
    rtt: connection?.rtt || null
  };
}

async function capture(rawCode, detectionMs = null, method = captureMethod) {
  if (!run || paused || !["ACTIVE", "DRAINING"].includes(run.status)) return;
  const code = String(rawCode ?? "").trim();
  if (!code && method !== "NO_LEIDO") {
    setSaveState("error", "captura vacía");
    return;
  }
  const attemptId = uuid();
  const idempotencyKey = uuid();
  clientSeq += 1;
  const payload = {
    runPublicId: run.publicId,
    clientSeq,
    epoch: run.epoch,
    attemptId,
    idempotencyKey,
    observedAt: new Date().toISOString(),
    rawCode: method === "NO_LEIDO" ? null : code,
    expectedType: byId("expectedType").value,
    captureMethod: method,
    physicalZone: byId("physicalZone").value.trim(),
    distance: byId("distance").value,
    detectionMs,
    notes: byId("scanNotes").value.trim() || null,
    networkMetadata: networkMetadata()
  };
  if (!payload.physicalZone) {
    clientSeq -= 1;
    setSaveState("error", "indica la zona física");
    byId("physicalZone").focus();
    return;
  }
  await queueAttempt({
    grantPublicId: grant.grantPublicId,
    runPublicId: run.publicId,
    clientSeq,
    attemptId,
    idempotencyKey,
    queuedAt: Date.now(),
    payload
  });
  saveDescriptor();
  byId("scanInput").value = "";
  byId("scanNotes").value = "";
  setSaveState("pending", `intento ${clientSeq}`);
  showResult({ rawCode: code, result: "PENDIENTE", classification: "PENDIENTE" }, "pending");
  await syncQueue();
}

async function createOrRestoreRun() {
  const restored = readDescriptor();
  if (restored?.runPublicId) {
    try {
      run = await api(`/api/pda/runs/${encodeURIComponent(restored.runPublicId)}`);
    } catch {
      clearDescriptor();
    }
  }
  if (!run || !["ACTIVE", "PAUSED", "SEALED", "DRAINING", "RECONCILED"].includes(run.status)) {
    const response = await api("/api/pda/runs", {
      method: "POST",
      body: {
        deviceType: /Android|iPhone|Mobile/i.test(navigator.userAgent) ? "MOBILE" : "PDA",
        deviceOs: navigator.platform || null,
        readerType: "CAMERA_HID_MANUAL",
        deviceMetadata: { language: navigator.language, screen: `${screen.width}x${screen.height}` }
      }
    });
    run = response.run;
    run = await api(`/api/pda/runs/${encodeURIComponent(run.publicId)}`);
  }
  const pending = await runQueue(run.publicId);
  clientSeq = Math.max(
    Number(run.lastAcceptedSeq || 0),
    Number(restored?.clientSeq || 0),
    ...pending.map((item) => Number(item.clientSeq || 0))
  );
  paused = run.status === "PAUSED";
  byId("runStatus").textContent = `${run.publicId} · ${run.status}`;
  saveDescriptor();
}

function stopCamera(message = "Cámara detenida.") {
  if (cameraTimer) window.clearTimeout(cameraTimer);
  cameraTimer = null;
  if (cameraStream) cameraStream.getTracks().forEach((track) => track.stop());
  cameraStream = null;
  cameraArmedAt = null;
  byId("cameraVideo").srcObject = null;
  byId("startCameraBtn").disabled = false;
  byId("armCameraBtn").disabled = true;
  byId("stopCameraBtn").disabled = true;
  byId("cameraStatus").textContent = message;
}

async function loadDetector() {
  if (window.BarcodeDetector) return new window.BarcodeDetector();
  await new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "/vendor/barcode-detector/3.2.2/polyfill.js";
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });
  if (window.BarcodeDetectionAPI?.prepareZXingModule) {
    await window.BarcodeDetectionAPI.prepareZXingModule({
      overrides: { locateFile: (path) => path.endsWith(".wasm") ? "/vendor/zxing-wasm/3.1.3/zxing_reader.wasm" : path }
    });
  }
  return new window.BarcodeDetector();
}

async function startCamera() {
  if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
    byId("cameraStatus").textContent = "Cámara requiere HTTPS; usa HID o manual.";
    return;
  }
  try {
    cameraStream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: { ideal: "environment" } }
    });
    byId("cameraVideo").srcObject = cameraStream;
    await byId("cameraVideo").play();
    detector = detector || await loadDetector();
    byId("armCameraBtn").disabled = false;
    byId("stopCameraBtn").disabled = false;
    byId("startCameraBtn").disabled = true;
    byId("cameraStatus").textContent = "Cámara lista; inicia una lectura.";
  } catch (error) {
    stopCamera("Cámara no disponible; usa HID o manual.");
  }
}

async function detectFrame() {
  if (!cameraStream || !cameraArmedAt || document.hidden) return;
  try {
    const found = await detector.detect(byId("cameraVideo"));
    const raw = found?.[0]?.rawValue;
    if (raw) {
      const detectionMs = Math.max(0, Math.round(performance.now() - cameraArmedAt));
      cameraArmedAt = null;
      stopCamera("Código detectado; cámara detenida.");
      await capture(raw, detectionMs, "CAMERA");
      return;
    }
  } catch {
    byId("cameraStatus").textContent = "Buscando código…";
  }
  cameraTimer = window.setTimeout(() => void detectFrame(), 180);
}

function armCamera() {
  if (!cameraStream) return;
  cameraArmedAt = performance.now();
  byId("armCameraBtn").disabled = true;
  byId("cameraStatus").textContent = "Buscando código…";
  void detectFrame();
}

function selectMode(method) {
  captureMethod = method;
  for (const [id, value] of [["hidModeBtn", "HID"], ["manualModeBtn", "MANUAL"], ["cameraModeBtn", "CAMERA"]]) {
    byId(id).classList.toggle("active", value === method);
    byId(id).setAttribute("aria-selected", String(value === method));
  }
  byId("cameraCapture").hidden = method !== "CAMERA";
  if (method !== "CAMERA") stopCamera();
  byId("scanInput").placeholder = method === "HID" ? "Barre; Enter registra" : "Escribe; Enter registra";
  byId("scanInput").focus();
}

async function pauseOrResume() {
  const action = paused ? "resume" : "pause";
  run = await api(`/api/pda/runs/${encodeURIComponent(run.publicId)}/${action}`, { method: "POST" });
  paused = !paused;
  if (paused) stopCamera("Cámara detenida por pausa.");
  byId("pauseBtn").textContent = paused ? "Reanudar" : "Pausar";
  byId("runStatus").textContent = `${run.publicId} · ${run.status}`;
}

async function sealAndReconcile() {
  stopCamera("Captura finalizada.");
  run = await api(`/api/pda/runs/${encodeURIComponent(run.publicId)}/seal`, {
    method: "POST",
    body: { sealedThroughSeq: clientSeq }
  });
  await syncQueue();
  const pending = await runQueue();
  if (pending.length) throw new Error(`${pending.length} intento(s) pendientes; reconecta antes de liberar.`);
  const result = await api(`/api/pda/runs/${encodeURIComponent(run.publicId)}/reconcile`, { method: "POST" });
  if (!result.reconciled) throw new Error(`Faltan secuencias: ${result.missing.join(", ")}`);
  run.status = "RECONCILED";
  return result;
}

async function newRound() {
  try {
    await sealAndReconcile();
    run = null;
    clientSeq = 0;
    clearDescriptor();
    await createOrRestoreRun();
    byId("runStatus").textContent = `${run.publicId} · ACTIVE`;
    setSaveState("saved", "nueva ronda preparada");
  } catch (error) {
    setSaveState("error", error.message);
  }
}

async function finalizeAndRelease() {
  const button = byId("finalizeBtn");
  button.disabled = true;
  try {
    await sealAndReconcile();
    const runId = run.publicId;
    const cleanupIssues = [];
    try {
      const local = await runQueue(runId);
      await Promise.all(local.map((item) => deleteAttempt(item.idempotencyKey)));
      if ((await runQueue(runId)).length) cleanupIssues.push("RUN_NAMESPACE_NOT_CLEAN");
      if ((await allQueued()).length) cleanupIssues.push("OTHER_PDA_QUEUE_PRESENT");
      const legacyState = await legacyEvidenceState();
      if (legacyState) cleanupIssues.push(legacyState);
    } catch {
      cleanupIssues.push("LOCAL_STORAGE_UNVERIFIABLE");
    }
    if (preexistingAdminAuth) cleanupIssues.push("PREEXISTING_ADMIN_AUTH");
    clearDescriptor();
    let result;
    try {
      result = await api(`/api/pda/runs/${encodeURIComponent(runId)}/release`, { method: "POST" });
    } catch (releaseError) {
      result = await api(`/api/pda/runs/${encodeURIComponent(runId)}/release-status`);
      if (result.status !== "SAFE_TO_RETURN") throw releaseError;
    }
    let revoked = false;
    try {
      await api("/api/pda/status");
    } catch (error) {
      revoked = error.status === 401;
    }
    if (!revoked) throw new Error("No se pudo confirmar revocación server-side.");
    maskVisibleReading();
    byId("labWorkspace").hidden = true;
    byId("finalSummary").hidden = false;
    byId("finalSummary").textContent = result.status;
    byId("accessGate").hidden = false;
    byId("accessGate").className = cleanupIssues.length ? "access-gate error" : "access-gate";
    byId("accessGate").textContent = cleanupIssues.length
      ? `UNVERIFIABLE · grant revocado y evidencia reconciliada, pero: ${cleanupIssues.join(", ")}.`
      : "SAFE_TO_RETURN · evidencia reconciliada, captura detenida, namespaces PDA limpios y grant PDA revocado. No certifica screenshots ni credenciales externas.";
  } catch (error) {
    setSaveState("error", error.message);
    byId("finalSummary").hidden = false;
    byId("finalSummary").textContent = `UNVERIFIABLE · ${error.message}`;
    button.disabled = false;
  }
}

function lockSurface() {
  stopCamera("Cámara detenida al ocultar la aplicación.");
  maskVisibleReading();
  byId("labWorkspace").hidden = true;
  byId("privacyCover").hidden = false;
}

async function unlockSurface() {
  if (!navigator.onLine && run && grant) {
    byId("privacyCover").hidden = true;
    byId("labWorkspace").hidden = false;
    setSaveState("pending", "offline; grant sin revalidar");
    resetIdleTimer();
    return;
  }
  try {
    grant = await api("/api/pda/status");
    if (run) run = await api(`/api/pda/runs/${encodeURIComponent(run.publicId)}`);
    byId("privacyCover").hidden = true;
    byId("labWorkspace").hidden = false;
    resetIdleTimer();
  } catch {
    byId("privacyCover").querySelector("span").textContent = "Grant inválido, expirado o revocado. Requiere nuevo pairing ADMIN.";
  }
}

function resetIdleTimer() {
  window.clearTimeout(idleTimer);
  idleTimer = window.setTimeout(lockSurface, IDLE_LOCK_MS);
}

async function initialize() {
  try {
    preexistingAdminAuth = Boolean(localStorage.getItem("token"));
  } catch {
    preexistingAdminAuth = true;
  }
  try {
    grant = await api("/api/pda/status");
    await createOrRestoreRun();
    byId("testId").textContent = run.session.testId;
    byId("watermark").textContent =
      `${run.publicId} · ${grant.grantPublicId} · ${new Date().toLocaleTimeString("es-MX")}`;
    byId("accessGate").hidden = true;
    byId("labWorkspace").hidden = false;
    await syncQueue();
    resetIdleTimer();
    byId("scanInput").focus();
  } catch (error) {
    const restored = readDescriptor(null);
    if (!navigator.onLine && restored) {
      grant = { grantPublicId: restored.grantPublicId };
      run = {
        publicId: restored.runPublicId,
        epoch: restored.epoch,
        status: "ACTIVE",
        lastAcceptedSeq: 0,
        session: { testId: restored.testId || "PDA · OFFLINE", status: "OPEN" }
      };
      clientSeq = Number(restored.clientSeq || 0);
      byId("testId").textContent = run.session.testId;
      byId("watermark").textContent = `${run.publicId} · OFFLINE · grant sin revalidar`;
      byId("accessGate").hidden = true;
      byId("labWorkspace").hidden = false;
      setSaveState("pending", "offline; grant sin revalidar");
      resetIdleTimer();
      return;
    }
    byId("accessGate").className = "access-gate error";
    byId("accessGate").innerHTML =
      `${escapeHtml(error.message)} <a href="/pda-pair.html">Emparejar este dispositivo</a>.`;
  }
}

byId("scanInput").addEventListener("keydown", (event) => {
  if (event.key !== "Enter") return;
  event.preventDefault();
  void capture(byId("scanInput").value);
});
byId("scanBtn").addEventListener("click", () => void capture(byId("scanInput").value));
byId("notReadBtn").addEventListener("click", () => void capture(null, null, "NO_LEIDO"));
byId("hidModeBtn").addEventListener("click", () => selectMode("HID"));
byId("manualModeBtn").addEventListener("click", () => selectMode("MANUAL"));
byId("cameraModeBtn").addEventListener("click", () => selectMode("CAMERA"));
byId("startCameraBtn").addEventListener("click", () => void startCamera());
byId("armCameraBtn").addEventListener("click", armCamera);
byId("stopCameraBtn").addEventListener("click", () => stopCamera());
byId("pauseBtn").addEventListener("click", () => void pauseOrResume());
byId("newRunBtn").addEventListener("click", () => void newRound());
byId("finalizeBtn").addEventListener("click", () => void finalizeAndRelease());
byId("unlockBtn").addEventListener("click", () => void unlockSurface());
window.addEventListener("online", () => void syncQueue());
window.addEventListener("pagehide", lockSurface);
document.addEventListener("visibilitychange", () => {
  if (document.hidden) lockSurface();
});
for (const eventName of ["pointerdown", "keydown", "touchstart"]) {
  document.addEventListener(eventName, resetIdleTimer, { passive: true });
}

void initialize();
