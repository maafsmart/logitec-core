const byId = (id) => document.getElementById(id);
const evidenceDbName = "logitec-pda-evidence-v2";
const outboxStoreName = "outbox";
const releaseStoreName = "release-state";
const dirtyMarkerKey = "logitec:pda:dirty";
const activeGrantMarkerKey = "logitec:pda:active-grant";
const tabId = crypto.randomUUID();
const peers = new Set();
const releaseAcks = new Set();
const channel = typeof BroadcastChannel === "function"
  ? new BroadcastChannel("logitec-pda-release-v1")
  : null;

let context = null;
let currentRun = null;
let nextClientSeq = 0;
let savedCount = 0;
let captureEnabled = false;
let sealed = false;
let attemptChain = Promise.resolve();
let syncInProgress = null;
let cameraStream = null;
let cameraDetector = null;
let cameraTimer = null;
let cameraGeneration = 0;
let cameraArmed = false;
let cameraBusy = false;
let cameraStartedAt = null;
let cameraCandidate = { value: "", count: 0, firstSeenAt: null };
let activeMode = "HID";
let idleTimer = null;
const preexistingAdminAuth = (() => {
  try {
    return localStorage.getItem("token") !== null;
  } catch {
    return true;
  }
})();

function field(id) {
  return String(byId(id)?.value || "").trim();
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
    cache: "no-store",
    headers: {
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {})
    },
    body: options.body ? JSON.stringify(options.body) : undefined
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

function openEvidenceDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(evidenceDbName, 2);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(outboxStoreName)) {
        const store = request.result.createObjectStore(outboxStoreName, { keyPath: "idempotencyKey" });
        store.createIndex("grantPublicId", "grantPublicId", { unique: false });
        store.createIndex("runId", "runId", { unique: false });
      }
      if (!request.result.objectStoreNames.contains(releaseStoreName)) {
        request.result.createObjectStore(releaseStoreName, { keyPath: "grantPublicId" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function useStore(storeName, mode, operation) {
  const db = await openEvidenceDb();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = db.transaction(storeName, mode);
      const request = operation(transaction.objectStore(storeName));
      let result;
      request.onsuccess = () => { result = request.result; };
      request.onerror = () => reject(request.error);
      transaction.oncomplete = () => resolve(result);
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error || new Error("IndexedDB transaction aborted"));
    });
  } finally {
    db.close();
  }
}

const queueAttempt = (record) => useStore(outboxStoreName, "readwrite", (store) => store.put(record));
const allQueued = () => useStore(outboxStoreName, "readonly", (store) => store.getAll());
const deleteQueued = (key) => useStore(outboxStoreName, "readwrite", (store) => store.delete(key));
const saveReleaseState = (record) =>
  useStore(releaseStoreName, "readwrite", (store) => store.put(record));
const getReleaseState = (grantPublicId) =>
  useStore(releaseStoreName, "readonly", (store) => store.get(grantPublicId));
const allReleaseStates = () =>
  useStore(releaseStoreName, "readonly", (store) => store.getAll());
const deleteReleaseState = (grantPublicId) =>
  useStore(releaseStoreName, "readwrite", (store) => store.delete(grantPublicId));

async function queuedForGrant() {
  const all = await allQueued();
  return all.filter((item) => item.grantPublicId === context?.grant?.publicId);
}

async function deleteGrantRecords(grantPublicId) {
  const all = await allQueued();
  await Promise.all(
    all.filter((item) => item.grantPublicId === grantPublicId)
      .map((item) => deleteQueued(item.idempotencyKey))
  );
}

function setDirtyMarker() {
  if (!context?.grant?.publicId || !currentRun?.publicId) return;
  try {
    localStorage.setItem(activeGrantMarkerKey, context.grant.publicId);
    localStorage.setItem(dirtyMarkerKey, JSON.stringify({
      grantPublicId: context.grant.publicId,
      runPublicId: currentRun.publicId,
      state: sealed ? "SEALED" : "CAPTURING"
    }));
  } catch {
    // Failure is handled conservatively during release verification.
  }
}

function activeGrantMarker() {
  try {
    return localStorage.getItem(activeGrantMarkerKey);
  } catch {
    return null;
  }
}

function clearActiveGrantMarker() {
  try {
    localStorage.removeItem(activeGrantMarkerKey);
    return localStorage.getItem(activeGrantMarkerKey) === null;
  } catch {
    return false;
  }
}

function clearDirtyMarker() {
  try {
    localStorage.removeItem(dirtyMarkerKey);
    return localStorage.getItem(dirtyMarkerKey) === null;
  } catch {
    return false;
  }
}

function maskCode(value) {
  const code = String(value || "");
  if (!code) return "Sin lectura";
  if (code.length <= 4) return `${"*".repeat(Math.max(1, code.length - 2))}${code.slice(-2)}`;
  return `${"*".repeat(Math.min(10, code.length - 4))}${code.slice(-4)} · ${code.length} caracteres`;
}

async function refreshCounters() {
  const queued = context ? await queuedForGrant() : [];
  byId("totalCount").textContent = `${nextClientSeq} intento${nextClientSeq === 1 ? "" : "s"}`;
  byId("savedCount").textContent = `${savedCount} guardado${savedCount === 1 ? "" : "s"}`;
  byId("pendingCount").textContent = `${queued.length} pendiente${queued.length === 1 ? "" : "s"}`;
  const state = queued.some((item) => item.blocked)
    ? "error"
    : queued.length ? "pending" : "saved";
  byId("syncStatus").className = `sync-status ${state}`;
  byId("syncStatus").textContent =
    state === "saved" ? "Guardado" : state === "pending" ? "Pendiente de sincronizar" : "Error de guardado";
}

function showResult(reading) {
  const result = byId("liveResult");
  result.className = `live-result ${reading.result === "OK" ? "ok" : "warn"}`;
  result.innerHTML = `<strong>${escapeHtml(reading.result)}</strong><span>${escapeHtml(maskCode(reading.normalizedCode || reading.rawCode))} · ${escapeHtml(reading.classification)}</span>`;
  window.setTimeout(() => {
    if (!captureEnabled) return;
    result.className = "live-result idle";
    result.innerHTML = "<strong>Listo</strong><span>Arma o registra el siguiente intento.</span>";
  }, 3000);
}

async function syncOutbox() {
  if (syncInProgress) return syncInProgress;
  syncInProgress = (async () => {
    if (!context || !navigator.onLine) {
      await refreshCounters();
      return;
    }
    const queued = (await queuedForGrant()).sort((a, b) => a.clientSeq - b.clientSeq);
    for (const item of queued) {
      if (item.blocked) continue;
      try {
        const response = await api(`/api/pda/runs/${encodeURIComponent(item.runId)}/readings`, {
          method: "POST",
          body: item.payload
        });
        await deleteQueued(item.idempotencyKey);
        savedCount += 1;
        showResult(response.reading);
      } catch (error) {
        if (error.status && error.status < 500) {
          await queueAttempt({ ...item, blocked: true, errorCode: error.code || "HTTP_ERROR" });
        }
        break;
      }
    }
    await refreshCounters();
  })();
  try {
    return await syncInProgress;
  } finally {
    syncInProgress = null;
  }
}

function attemptPayload(rawCode, captureMode, clientSeq, detectionMs = null) {
  const attemptId = crypto.randomUUID();
  return {
    epoch: currentRun.epoch,
    clientSeq,
    attemptId,
    idempotencyKey: attemptId,
    observedAt: new Date().toISOString(),
    rawCode: rawCode || null,
    expectedType: field("expectedType"),
    captureMode,
    captureMethod:
      captureMode === "CAMERA" ? "Cámara de celular"
        : captureMode === "HID" ? "Scanner keyboard wedge"
          : captureMode === "NO_LEIDO" ? "Registro no leído"
            : "Entrada manual",
    physicalZone: field("physicalZone"),
    distance: field("distance") || null,
    detectionMs,
    notes: field("scanNotes") || null,
    networkMetadata: {
      online: navigator.onLine,
      effectiveType: navigator.connection?.effectiveType || null,
      downlink: navigator.connection?.downlink || null,
      rtt: navigator.connection?.rtt || null
    }
  };
}

async function registerAttempt(rawCode, captureMode, detectionMs = null) {
  if (!field("physicalZone")) {
    byId("liveResult").innerHTML = "<strong>Falta zona</strong><span>Indica la zona física antes de capturar.</span>";
    return;
  }
  const normalizedInput = String(rawCode || "").trim();
  if (captureMode !== "NO_LEIDO" && !normalizedInput) return;
  try {
    const candidateSeq = nextClientSeq + 1;
    const payload = attemptPayload(normalizedInput, captureMode, candidateSeq, detectionMs);
    await queueAttempt({
      grantPublicId: context.grant.publicId,
      runId: currentRun.id,
      clientSeq: payload.clientSeq,
      idempotencyKey: payload.idempotencyKey,
      payload,
      queuedAt: Date.now()
    });
    nextClientSeq = candidateSeq;
    setDirtyMarker();
    byId("scanNotes").value = "";
    byId("liveResult").className = "live-result idle";
    byId("liveResult").innerHTML = "<strong>Pendiente</strong><span>Intento creado; sincronizando.</span>";
    await refreshCounters();
    void syncOutbox();
  } catch (error) {
    byId("liveResult").className = "live-result error";
    byId("liveResult").innerHTML = `<strong>No guardado</strong><span>${escapeHtml(error.message)}</span>`;
  } finally {
    if (captureEnabled && activeMode !== "CAMERA") byId("scanInput").focus();
  }
}

function enqueueAttempt(rawCode, captureMode, detectionMs = null) {
  if (!captureEnabled || sealed) return Promise.resolve();
  attemptChain = attemptChain
    .then(() => registerAttempt(rawCode, captureMode, detectionMs))
    .catch((error) => {
      byId("liveResult").className = "live-result error";
      byId("liveResult").innerHTML = `<strong>No guardado</strong><span>${escapeHtml(error.message)}</span>`;
    });
  return attemptChain;
}

async function createRun() {
  const response = await api("/api/pda/runs", {
    method: "POST",
    body: { clientRunKey: crypto.randomUUID() }
  });
  currentRun = response.run;
  nextClientSeq = 0;
  savedCount = 0;
  sealed = false;
  captureEnabled = true;
  byId("runId").textContent = currentRun.publicId;
  byId("watermark").textContent = `${currentRun.publicId} · ${context.grant.publicId} · LOGITEC`;
  byId("newRunBtn").hidden = true;
  byId("sealBtn").disabled = false;
  setDirtyMarker();
  await refreshCounters();
}

async function restoreRun(run) {
  currentRun = run;
  const latest = await api(`/api/pda/runs/${encodeURIComponent(run.id)}`);
  const queued = (await queuedForGrant()).filter((item) => item.runId === run.id);
  nextClientSeq = Math.max(
    0,
    ...latest.readings.map((item) => item.clientSeq),
    ...queued.map((item) => item.clientSeq)
  );
  savedCount = latest.readings.length;
  sealed = latest.status !== "ACTIVE";
  captureEnabled = !sealed;
  byId("runId").textContent = latest.publicId;
  byId("watermark").textContent = `${latest.publicId} · ${context.grant.publicId} · LOGITEC`;
  byId("newRunBtn").hidden = latest.status !== "RECONCILED";
  byId("sealBtn").disabled = sealed;
  setDirtyMarker();
  await refreshCounters();
  await syncOutbox();
}

async function sealRun() {
  if (!currentRun || sealed) return true;
  captureEnabled = false;
  stopCamera();
  await attemptChain;
  await syncOutbox();
  const queued = (await queuedForGrant()).filter((item) => item.runId === currentRun.id);
  if (queued.length) {
    captureEnabled = true;
    byId("releaseStatus").textContent = `No se puede sellar: ${queued.length} intento(s) sin ACK.`;
    return false;
  }
  await api(`/api/pda/runs/${encodeURIComponent(currentRun.id)}/seal`, {
    method: "POST",
    body: { sealedAtSeq: nextClientSeq }
  });
  const reconciliation = await api(`/api/pda/runs/${encodeURIComponent(currentRun.id)}/reconcile`, {
    method: "POST",
    body: {}
  });
  if (!reconciliation.reconciled) {
    byId("releaseStatus").textContent = `Faltan secuencias: ${reconciliation.missing.join(", ")}.`;
    return false;
  }
  currentRun = reconciliation.run;
  sealed = true;
  byId("newRunBtn").hidden = false;
  byId("sealBtn").disabled = true;
  byId("releaseStatus").textContent = "Ronda reconciliada; puede iniciar otra o liberar.";
  setDirtyMarker();
  return true;
}

function stopCamera(message = "Cámara detenida.") {
  cameraGeneration += 1;
  cameraArmed = false;
  cameraBusy = false;
  if (cameraTimer) clearTimeout(cameraTimer);
  cameraTimer = null;
  cameraStream?.getTracks().forEach((track) => track.stop());
  cameraStream = null;
  byId("cameraVideo").srcObject = null;
  byId("armCameraBtn").disabled = true;
  byId("stopCameraBtn").disabled = true;
  byId("startCameraBtn").disabled = !captureEnabled;
  byId("cameraStatus").textContent = message;
}

async function loadCameraDetector() {
  if (window.BarcodeDetector) return new window.BarcodeDetector();
  await new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "/vendor/barcode-detector/3.2.2/polyfill.js";
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });
  const prepare = window.BarcodeDetectionAPI?.prepareZXingModule;
  if (prepare) {
    await prepare({ overrides: { locateFile: (path, prefix) =>
      path.endsWith(".wasm") ? "/vendor/zxing-wasm/3.1.3/zxing_reader.wasm" : `${prefix}${path}` } });
  }
  return new window.BarcodeDetector();
}

async function startCamera() {
  if (!captureEnabled || !navigator.mediaDevices?.getUserMedia) return;
  try {
    cameraStream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: { ideal: "environment" } }
    });
    byId("cameraVideo").srcObject = cameraStream;
    await byId("cameraVideo").play();
    cameraDetector ||= await loadCameraDetector();
    byId("armCameraBtn").disabled = false;
    byId("stopCameraBtn").disabled = false;
    byId("startCameraBtn").disabled = true;
    byId("cameraStatus").textContent = "Cámara lista; arma un intento.";
  } catch (error) {
    stopCamera("Cámara no disponible; usa PDA/manual.");
  }
}

function normalizeScannerRawValue(value) {
  const code = String(value || "").trim();
  return code.startsWith("]C1") ? code.slice(3) : code;
}

function scheduleDetection() {
  if (!cameraArmed || !cameraStream) return;
  cameraTimer = setTimeout(() => void detectFrame(), 160);
}

async function detectFrame() {
  if (!cameraArmed || !cameraStream || cameraBusy) return;
  const generation = cameraGeneration;
  cameraBusy = true;
  try {
    const detections = await cameraDetector.detect(byId("cameraVideo"));
    if (!cameraArmed || generation !== cameraGeneration) return;
    const raw = normalizeScannerRawValue(detections?.[0]?.rawValue);
    const now = performance.now();
    if (!raw) cameraCandidate = { value: "", count: 0, firstSeenAt: null };
    else if (raw !== cameraCandidate.value) cameraCandidate = { value: raw, count: 1, firstSeenAt: now };
    else cameraCandidate.count += 1;
    if (raw && cameraCandidate.count >= 3) {
      cameraArmed = false;
      const detectionMs = Math.max(0, Math.round(now - cameraStartedAt));
      byId("armCameraBtn").disabled = false;
      byId("cameraStatus").textContent = "Intento detectado; rearma para repetir.";
      await enqueueAttempt(raw, "CAMERA", detectionMs);
      return;
    }
  } catch {
    byId("cameraStatus").textContent = "Buscando código…";
  } finally {
    cameraBusy = false;
  }
  scheduleDetection();
}

function armCamera() {
  if (!captureEnabled || !cameraStream || cameraArmed) return;
  cameraCandidate = { value: "", count: 0, firstSeenAt: null };
  cameraStartedAt = performance.now();
  cameraArmed = true;
  byId("armCameraBtn").disabled = true;
  byId("cameraStatus").textContent = "Intento armado; buscando código…";
  scheduleDetection();
}

function setMode(mode) {
  activeMode = mode;
  const camera = mode === "CAMERA";
  byId("cameraCapture").hidden = !camera;
  byId("handheldModeBtn").classList.toggle("active", !camera);
  byId("cameraModeBtn").classList.toggle("active", camera);
  if (!camera) {
    stopCamera();
    byId("scanInput").focus();
  }
}

function lockPrivacy(reason = "La aplicación dejó de estar visible.") {
  captureEnabled = false;
  stopCamera();
  byId("scanInput").value = "";
  byId("scanNotes").value = "";
  byId("scanInput").disabled = true;
  byId("scanBtn").disabled = true;
  byId("notReadBtn").disabled = true;
  byId("labWorkspace").hidden = true;
  byId("privacyLock").hidden = false;
  byId("privacyLock").querySelector("p").textContent = reason;
}

async function resumeAfterLock() {
  try {
    context = await api("/api/pda/context");
    const run = context.runs.find((item) => item.id === currentRun?.id);
    if (!run || run.status !== "ACTIVE") throw new Error("La ronda ya no está activa.");
    currentRun = run;
    captureEnabled = true;
    byId("scanInput").disabled = false;
    byId("scanBtn").disabled = false;
    byId("notReadBtn").disabled = false;
    byId("privacyLock").hidden = true;
    byId("labWorkspace").hidden = false;
    byId("scanInput").focus();
    resetIdle();
  } catch (error) {
    byId("privacyLock").querySelector("p").textContent = error.message;
  }
}

function resetIdle() {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(() => lockPrivacy("Bloqueo por inactividad."), 5 * 60 * 1000);
}

async function releaseDevice() {
  byId("releaseBtn").disabled = true;
  try {
    if (!(await sealRun())) return;
    let releaseState = await getReleaseState(context.grant.publicId);
    if (!releaseState) {
      releaseState = {
        grantPublicId: context.grant.publicId,
        releaseNonce: `${crypto.randomUUID()}${crypto.randomUUID()}`,
        createdAt: Date.now()
      };
      await saveReleaseState(releaseState);
    }
    const prepared = await api("/api/pda/release/prepare", {
      method: "POST",
      body: { releaseNonce: releaseState.releaseNonce }
    });
    releaseAcks.clear();
    channel?.postMessage({ type: "RELEASE_REQUEST", from: tabId, grantPublicId: context.grant.publicId });
    stopCamera();
    await deleteGrantRecords(context.grant.publicId);
    await new Promise((resolve) => setTimeout(resolve, 350));
    const localQueueEmpty = (await queuedForGrant()).length === 0;
    const markerCleared = clearDirtyMarker();
    const knownTabsClean = Boolean(channel) && [...peers].every((peer) => releaseAcks.has(peer));
    releaseState = {
      ...releaseState,
      localVerificationPassed:
        localQueueEmpty && markerCleared && knownTabsClean && !preexistingAdminAuth
    };
    await saveReleaseState(releaseState);
    if (!localQueueEmpty || !markerCleared) throw new Error("No se pudo verificar la limpieza local.");
    let confirmed = null;
    try {
      confirmed = await api("/api/pda/release/confirm", {
        method: "POST",
        body: {
          releaseNonce: releaseState.releaseNonce,
          captureStoppedConfirmed: true,
          localCleanupConfirmed: true,
          noDownloadsConfirmed: true
        }
      });
    } catch (error) {
      if (error.status && error.status !== 401 && error.status < 500) {
        throw error;
      }
    }
    const status = await api("/api/pda/releases/status", {
      method: "POST",
      body: { grantPublicId: prepared.grantPublicId, releaseNonce: releaseState.releaseNonce }
    });
    let contextRejected = false;
    try {
      await api("/api/pda/context");
    } catch (error) {
      contextRejected = error.status === 401;
    }
    lockPrivacy("Dispositivo liberado.");
    byId("resumeBtn").hidden = true;
    const safe = (confirmed?.safeToReturn !== false) && status.safeToReturn && contextRejected &&
      releaseState.localVerificationPassed;
    const finalSafe = safe && clearActiveGrantMarker();
    if (finalSafe) await deleteReleaseState(prepared.grantPublicId);
    byId("privacyLock").querySelector("h2").textContent = finalSafe ? "SAFE_TO_RETURN" : "UNVERIFIABLE";
    byId("privacyLock").querySelector("p").textContent = finalSafe
      ? `Grant revocado y evidencia reconciliada. Recibo ${status.receiptId}.`
      : "Grant revocado, pero existe auth ADMIN previa o una superficie local no verificable.";
  } catch (error) {
    byId("releaseStatus").textContent = `Liberación bloqueada: ${error.message}`;
    byId("releaseBtn").disabled = false;
  }
}

async function recoverCompletedRelease() {
  const expectedGrantPublicId = activeGrantMarker();
  if (!expectedGrantPublicId) return false;
  let states;
  try {
    states = await allReleaseStates();
  } catch {
    return false;
  }
  for (const releaseState of states) {
    if (releaseState.grantPublicId !== expectedGrantPublicId) continue;
    try {
      const status = await api("/api/pda/releases/status", {
        method: "POST",
        body: {
          grantPublicId: releaseState.grantPublicId,
          releaseNonce: releaseState.releaseNonce
        }
      });
      if (!status.safeToReturn) continue;
      byId("accessGate").hidden = true;
      byId("labWorkspace").hidden = true;
      byId("privacyLock").hidden = false;
      byId("resumeBtn").hidden = true;
      const safe =
        Boolean(releaseState.localVerificationPassed) &&
        !preexistingAdminAuth &&
        clearActiveGrantMarker();
      if (safe) await deleteReleaseState(releaseState.grantPublicId);
      byId("privacyLock").querySelector("h2").textContent = safe ? "SAFE_TO_RETURN" : "UNVERIFIABLE";
      byId("privacyLock").querySelector("p").textContent = !safe
        ? "Grant revocado; la limpieza local completa no quedó demostrada."
        : `Grant revocado y confirmado. Recibo ${status.receiptId}.`;
      return true;
    } catch {
      // A prepared but unfinished release is resumed after cookie authentication.
    }
  }
  return false;
}

channel?.addEventListener("message", async (event) => {
  const message = event.data || {};
  if (message.type === "HELLO" && message.from !== tabId) {
    peers.add(message.from);
    channel.postMessage({ type: "HELLO_ACK", from: tabId, to: message.from });
  }
  if (message.type === "HELLO_ACK" && message.to === tabId) peers.add(message.from);
  if (message.type === "RELEASE_ACK" && message.to === tabId) releaseAcks.add(message.from);
  if (
    message.type === "RELEASE_REQUEST" &&
    message.from !== tabId &&
    message.grantPublicId === context?.grant?.publicId
  ) {
    lockPrivacy("Liberación solicitada desde otra pestaña.");
    await deleteGrantRecords(message.grantPublicId);
    channel.postMessage({ type: "RELEASE_ACK", from: tabId, to: message.from });
  }
});
channel?.postMessage({ type: "HELLO", from: tabId });

async function initialize() {
  const gate = byId("accessGate");
  try {
    context = await api("/api/pda/context");
    byId("testId").textContent = context.session.testId;
    gate.hidden = true;
    byId("labWorkspace").hidden = false;
    const resumable = [...context.runs].reverse().find((run) =>
      run.status === "ACTIVE" || run.status === "DRAINING" || run.status === "RECONCILED"
    );
    if (resumable) await restoreRun(resumable);
    else await createRun();
    if (resumable?.status === "DRAINING") {
      await syncOutbox();
      const reconciliation = await api(`/api/pda/runs/${encodeURIComponent(resumable.id)}/reconcile`, {
        method: "POST",
        body: {}
      });
      currentRun = reconciliation.run;
      sealed = reconciliation.reconciled;
      byId("newRunBtn").hidden = !reconciliation.reconciled;
      byId("releaseStatus").textContent = reconciliation.reconciled
        ? "Ronda recuperada y reconciliada."
        : `Faltan secuencias: ${reconciliation.missing.join(", ")}.`;
    }
    if (context.grant.status === "DRAIN_ONLY") {
      captureEnabled = false;
      byId("releaseStatus").textContent = "Liberación preparada; pulse Liberar dispositivo para continuar.";
    }
    if (preexistingAdminAuth) {
      byId("releaseStatus").textContent =
        "Advertencia: se detectó autenticación LOGITEC previa; SAFE_TO_RETURN será UNVERIFIABLE.";
    }
    resetIdle();
  } catch (error) {
    if (error.status === 401) {
      if (await recoverCompletedRelease()) return;
      window.location.replace("/pda-pair.html");
      return;
    }
    gate.className = "access-gate error";
    gate.textContent = error.message;
  }
}

function submitCurrentInput(mode) {
  const rawCode = field("scanInput");
  byId("scanInput").value = "";
  return enqueueAttempt(rawCode, mode);
}

byId("scanInput").addEventListener("keydown", (event) => {
  resetIdle();
  if (event.key !== "Enter") return;
  event.preventDefault();
  void submitCurrentInput("HID");
});
byId("scanBtn").addEventListener("click", () => void submitCurrentInput("MANUAL"));
byId("notReadBtn").addEventListener("click", () => void enqueueAttempt("", "NO_LEIDO"));
byId("handheldModeBtn").addEventListener("click", () => setMode("HID"));
byId("cameraModeBtn").addEventListener("click", () => setMode("CAMERA"));
byId("startCameraBtn").addEventListener("click", () => void startCamera());
byId("armCameraBtn").addEventListener("click", armCamera);
byId("stopCameraBtn").addEventListener("click", () => stopCamera());
byId("retryBtn").addEventListener("click", () => void syncOutbox());
byId("sealBtn").addEventListener("click", () => void sealRun());
byId("newRunBtn").addEventListener("click", () => void createRun());
byId("releaseBtn").addEventListener("click", () => void releaseDevice());
byId("resumeBtn").addEventListener("click", () => void resumeAfterLock());
window.addEventListener("online", () => void syncOutbox());
window.addEventListener("pagehide", () => lockPrivacy("La pestaña se cerró u ocultó."));
document.addEventListener("visibilitychange", () => {
  if (document.hidden) lockPrivacy();
});
for (const eventName of ["pointerdown", "keydown", "touchstart"]) {
  document.addEventListener(eventName, resetIdle, { passive: true });
}

void initialize();
