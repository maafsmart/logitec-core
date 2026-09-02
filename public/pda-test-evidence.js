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
        <td>${escapeHtml(session.status === "CLOSED" ? "Cerrada" : session.status)}</td>
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
  byId("finalizeOpenBtn").hidden = session.status === "CLOSED";
  byId("pairSelectedBtn").hidden = session.status !== "OPEN";
  byId("takeoverBtn").hidden = session.status !== "OPEN";
  byId("detailTitle").textContent = session.testId;
  byId("detailSummary").textContent = `${sessionSummary(session)} · detección min/mediana/p95 ${metric(session.detectionMinMs)} / ${metric(session.detectionMedianMs)} / ${metric(session.detectionP95Ms)} · clasificación min/mediana/p95 ${metric(session.classificationMinMs)} / ${metric(session.classificationMedianMs)} / ${metric(session.classificationP95Ms)}`;
  byId("runsSummary").textContent = (session.runs || []).length
    ? `Runs: ${session.runs.map((run) => `${run.publicId} · ${run.status} · seq ${run.lastAcceptedSeq}${run.sealedThroughSeq === null ? "" : `/${run.sealedThroughSeq}`}`).join(" | ")}`
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
  byId("detailPanel").scrollIntoView({ behavior: "smooth", block: "start" });
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

function localId() {
  return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
}

async function showPairing(sessionId, testId) {
  const response = await api(`/api/admin/pda-test-sessions/${encodeURIComponent(sessionId)}/pairing`, {
    method: "POST"
  });
  const pairing = await response.json();
  byId("pairingTestId").textContent = testId || pairing.testId;
  byId("pairingChallengeId").value = pairing.challengeId;
  byId("pairingSecret").value = pairing.secret;
  byId("pairingOutput").hidden = false;
  byId("pairingOutput").scrollIntoView({ behavior: "smooth", block: "center" });
}

async function createSessionAndPairing() {
  const button = byId("createSessionBtn");
  button.disabled = true;
  try {
    const response = await api("/api/admin/pda-test-sessions", {
      method: "POST",
      body: { clientSessionKey: localId() }
    });
    const result = await response.json();
    await showPairing(result.session.id, result.session.testId);
    await loadSessions();
  } catch (error) {
    window.alert(error.message || "No se pudo crear la sesión.");
  } finally {
    button.disabled = false;
  }
}

async function pairSelectedSession() {
  if (selectedSessionId) await showPairing(selectedSessionId, selectedTestId);
}

async function forceTakeover() {
  if (!selectedSessionId || !window.confirm(`¿Marcar runs activos de ${selectedTestId} como INCOMPLETE y revocar sus grants?`)) return;
  await api(`/api/admin/pda-test-sessions/${encodeURIComponent(selectedSessionId)}/takeover`, {
    method: "POST",
    body: { confirmed: true }
  });
  await openSession(selectedTestId);
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
byId("finalizeOpenBtn").addEventListener("click", () => void finalizeOpenSession());
byId("createSessionBtn").addEventListener("click", () => void createSessionAndPairing());
byId("pairSelectedBtn").addEventListener("click", () => void pairSelectedSession());
byId("takeoverBtn").addEventListener("click", () => void forceTakeover());
byId("csvBtn").addEventListener("click", () => void downloadServerExport("csv"));
byId("jsonBtn").addEventListener("click", () => void downloadServerExport("json"));
void initialize();
