const token = localStorage.getItem("token") || "";
const byId = (id) => document.getElementById(id);
let selectedTestId = "";
let selectedSessionId = "";

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
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: options.accept || "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {})
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    cache: "no-store"
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.message || `Error HTTP ${response.status}`);
  }
  return response;
}

function metric(value) {
  return Number.isFinite(value) ? `${value} ms` : "—";
}

function sessionSummary(session) {
  return `${session.totalReadings} total · ${session.okReadings} OK · ${session.notFoundReadings} no encontrados · ${session.failedReadings} fallos · ${session.successRate ?? 0}% éxito`;
}

async function loadSessions() {
  const sessions = await (await api("/api/admin/pda-test-sessions")).json();
  byId("sessionsBody").innerHTML = sessions.length
    ? sessions.map((session) => `<tr>
        <td><strong>${escapeHtml(session.testId)}</strong></td>
        <td>${escapeHtml(new Date(session.startedAt).toLocaleString("es-MX"))}</td>
        <td>${escapeHtml(session.status)}</td>
        <td>${escapeHtml([session.deviceType, session.deviceBrand, session.deviceModel].filter(Boolean).join(" ") || "—")}</td>
        <td>${escapeHtml(sessionSummary(session))}</td>
        <td><button class="button secondary open-session" type="button" data-test-id="${escapeHtml(session.testId)}">Abrir</button></td>
      </tr>`).join("")
    : '<tr><td colspan="6" class="empty">No hay sesiones guardadas para este cliente.</td></tr>';
}

async function openSession(testId) {
  const session = await (await api(`/api/admin/pda-test-sessions/${encodeURIComponent(testId)}`)).json();
  selectedTestId = session.testId;
  selectedSessionId = session.id;
  byId("finalizeOpenBtn").hidden = session.status === "CLOSED" || session.status === "INCOMPLETE";
  byId("pairBtn").hidden = session.status !== "OPEN";
  byId("pairingPanel").hidden = true;
  byId("detailTitle").textContent = session.testId;
  byId("detailSummary").textContent = `${sessionSummary(session)} · detección min/mediana/p95 ${metric(session.detectionMinMs)} / ${metric(session.detectionMedianMs)} / ${metric(session.detectionP95Ms)} · clasificación min/mediana/p95 ${metric(session.classificationMinMs)} / ${metric(session.classificationMedianMs)} / ${metric(session.classificationP95Ms)}`;
  byId("runsSummary").textContent = (session.runs || []).length
    ? `Runs: ${session.runs.map((run) => `${run.publicId} · ${run.status} · recibidas ${run.receivedCount}${run.sealedAtSeq === null ? "" : `/${run.sealedAtSeq}`}`).join(" | ")}`
    : "Sin runs.";
  byId("readingsBody").innerHTML = session.readings.length
    ? session.readings.map((reading) => `<tr>
        <td>${escapeHtml(new Date(reading.observedAt).toLocaleString("es-MX"))}</td>
        <td><strong>${escapeHtml(reading.rawCode || "(sin lectura)")}</strong><br>${escapeHtml(reading.normalizedCode || "—")}</td>
        <td>${escapeHtml(reading.physicalZone)}<br>${escapeHtml(reading.captureMethod)} · ${escapeHtml(reading.distance || "—")}</td>
        <td>${escapeHtml(reading.classification)}<br>Esperado: ${escapeHtml(reading.expectedType)}</td>
        <td>${escapeHtml(reading.result)}</td>
        <td>${escapeHtml(metric(reading.detectionMs))}</td>
        <td>${escapeHtml(metric(reading.classificationMs))}</td>
        <td>${escapeHtml(reading.notes || "—")}<br>${escapeHtml(JSON.stringify(reading.networkMetadata || {}))}</td>
      </tr>`).join("")
    : '<tr><td colspan="8" class="empty">Sin lecturas.</td></tr>';
  byId("detailPanel").hidden = false;
  await loadRemoteQaProgress();
  byId("detailPanel").scrollIntoView({ behavior: "smooth", block: "start" });
}

const qaStepLabels = {
  HARDWARE_IDENTIFIED: "Hardware identificado",
  NO_ADMIN_LOGIN: "Sin login ADMIN",
  VALID_READ: "Lectura física válida",
  REPEATED_READ: "Repetición intencional",
  NOT_FOUND_OR_NOT_READ: "No encontrado / No leído",
  IDEMPOTENT_RETRY: "Retry idempotente",
  HID_ENTER: "HID + Enter",
  MANUAL_FALLBACK: "Fallback manual",
  NETWORK_RECONNECT: "Pérdida y reconexión",
  BACKGROUND_LOCK: "Bloqueo en background",
  RELOAD_CONTINUITY: "Continuidad tras reload",
  SEALED_RECONCILED: "Seal y reconcile",
  ZERO_PENDING_COMPLETE: "Cobertura completa",
  SAFE_TO_RETURN: "Devolución segura",
  REVOKED_401: "Grant rechazado con 401"
};

async function loadRemoteQaProgress() {
  if (!selectedSessionId) return;
  try {
    const progress = await (await api(
      `/api/admin/pda-test-sessions/${encodeURIComponent(selectedSessionId)}/remote-qa`
    )).json();
    byId("remoteQaProgress").innerHTML = progress.runs.length
      ? progress.runs.map((run) => `<article class="qa-run-card">
          <strong>${escapeHtml(run.runPublicId)} · ${escapeHtml(run.verdict)}</strong>
          <span>${escapeHtml(run.hardwareClass || "Hardware pendiente")} · ${escapeHtml(run.readerType || "readerType pendiente")}</span>
          <span>${escapeHtml(`${run.readingCount} evidencias · recibidas ${run.receivedCount}${run.sealedAtSeq === null ? "" : `/${run.sealedAtSeq}`}`)}</span>
          <span>${run.lastEvidence ? `Última: ${escapeHtml(run.lastEvidence.result)} · ${escapeHtml(run.lastEvidence.captureMode)} · ${escapeHtml(new Date(run.lastEvidence.observedAt).toLocaleTimeString("es-MX"))}` : "Sin evidencia todavía"}</span>
          <div class="qa-step-grid">${run.steps.map((step) => `<span class="qa-step qa-${step.status.toLowerCase()}">${escapeHtml(qaStepLabels[step.id] || step.id)}: ${escapeHtml(step.status)}</span>`).join("")}</div>
        </article>`).join("")
      : "Sin ronda remota.";
  } catch (error) {
    byId("remoteQaProgress").textContent = `Progreso no disponible: ${error.message}`;
  }
}

async function downloadServerExport(format) {
  if (!selectedTestId) return;
  const response = await api(
    `/api/admin/pda-test-sessions/${encodeURIComponent(selectedTestId)}/export.${format}`,
    { accept: format === "csv" ? "text/csv" : "application/json" }
  );
  const url = URL.createObjectURL(await response.blob());
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${selectedTestId}.${format}`;
  anchor.click();
  URL.revokeObjectURL(url);
}

async function finalizeOpenSession() {
  if (!selectedSessionId) return;
  const button = byId("finalizeOpenBtn");
  if (!window.confirm(`¿Finalizar la sesión ${selectedTestId}?`)) return;
  button.disabled = true;
  try {
    await api(`/api/admin/pda-test-sessions/${encodeURIComponent(selectedSessionId)}/finalize`, {
      method: "POST"
    });
    await loadSessions();
    await openSession(selectedTestId);
  } catch (error) {
    window.alert(error.message || "No se pudo finalizar la sesión.");
  } finally {
    button.disabled = false;
  }
}

async function createSession() {
  const button = byId("createSessionBtn");
  button.disabled = true;
  try {
    const response = await api("/api/admin/pda-test-sessions", {
      method: "POST",
      body: {
        clientSessionKey: crypto.randomUUID(),
        deviceType: byId("newDeviceType").value.trim() || null,
        deviceModel: byId("newDeviceModel").value.trim() || null,
        deviceMetadata: { borrowedDeviceFlow: true }
      }
    });
    const data = await response.json();
    await loadSessions();
    await openSession(data.session.testId);
  } catch (error) {
    window.alert(error.message || "No se pudo crear la sesión.");
  } finally {
    button.disabled = false;
  }
}

function loadBarcodeWriter() {
  if (window.ZXingWASM?.writeBarcode) return Promise.resolve(window.ZXingWASM);
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "/vendor/zxing-wasm/3.1.3/writer.js";
    script.onload = async () => {
      const writer = window.ZXingWASM;
      await writer.prepareZXingModule({
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
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("No se pudo renderizar el QR."));
    reader.readAsDataURL(blob);
  });
}

async function createPairing() {
  if (!selectedSessionId) return;
  const button = byId("pairBtn");
  button.disabled = true;
  try {
    const response = await api(
      `/api/admin/pda-test-sessions/${encodeURIComponent(selectedSessionId)}/pairings`,
      { method: "POST", body: {} }
    );
    const pairing = await response.json();
    byId("manualPairingCode").value = pairing.manualCode;
    byId("remoteInviteUrl").value =
      `${window.location.origin}/pda-pair.html#p=${encodeURIComponent(pairing.qrPayload)}`;
    const writer = await loadBarcodeWriter();
    const output = await writer.writeBarcode(pairing.qrPayload, {
      format: "QRCode",
      scale: 4,
      addQuietZones: true
    });
    if (output.error || !output.image) throw new Error(output.error || "No se pudo crear QR.");
    const image = document.createElement("img");
    image.alt = "QR de pairing efímero";
    image.src = await blobToDataUrl(output.image);
    byId("pairingQr").replaceChildren(image);
    byId("pairingPanel").hidden = false;
  } catch (error) {
    window.alert(error.message || "No se pudo emitir pairing.");
  } finally {
    button.disabled = false;
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
    const me = await (await api("/api/auth/me")).json();
    if (me.role !== "ADMIN") throw new Error("Esta evidencia está restringida a ADMIN.");
    if (!me.operationalClient) throw new Error("Selecciona primero un cliente activo en el panel.");
    const clientName = me.operationalClient.tradeName || me.operationalClient.name || me.operationalClient.code;
    byId("sessionContext").textContent = `${me.fullName || me.email} · cliente ${clientName}`;
    gate.hidden = true;
    byId("evidenceWorkspace").hidden = false;
    await loadSessions();
  } catch (error) {
    gate.className = "access-gate error";
    gate.textContent = error.message;
  }
}

byId("sessionsBody").addEventListener("click", (event) => {
  const button = event.target.closest(".open-session");
  if (button) void openSession(button.dataset.testId);
});
byId("refreshBtn").addEventListener("click", () => void loadSessions());
byId("createSessionBtn").addEventListener("click", () => void createSession());
byId("finalizeOpenBtn").addEventListener("click", () => void finalizeOpenSession());
byId("pairBtn").addEventListener("click", () => void createPairing());
byId("refreshQaBtn").addEventListener("click", () => void loadRemoteQaProgress());
byId("csvBtn").addEventListener("click", () => void downloadServerExport("csv"));
byId("jsonBtn").addEventListener("click", () => void downloadServerExport("json"));
window.setInterval(() => {
  if (selectedSessionId && !document.hidden) void loadRemoteQaProgress();
}, 5000);
void initialize();
