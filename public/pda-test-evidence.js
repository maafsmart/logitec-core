const token = localStorage.getItem("token") || "";
const byId = (id) => document.getElementById(id);
let selectedTestId = "";

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function api(path, accept = "application/json") {
  const response = await fetch(path, {
    headers: { Authorization: `Bearer ${token}`, Accept: accept },
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
        <td>${escapeHtml(session.status === "FINALIZED" ? "Finalizada" : "Abierta")}</td>
        <td>${escapeHtml([session.deviceType, session.deviceBrand, session.deviceModel].filter(Boolean).join(" ") || "—")}</td>
        <td>${escapeHtml(sessionSummary(session))}</td>
        <td><button class="button secondary open-session" type="button" data-test-id="${escapeHtml(session.testId)}">Abrir</button></td>
      </tr>`).join("")
    : '<tr><td colspan="6" class="empty">No hay sesiones guardadas para este cliente.</td></tr>';
}

async function openSession(testId) {
  const session = await (await api(`/api/admin/pda-test-sessions/${encodeURIComponent(testId)}`)).json();
  selectedTestId = session.testId;
  byId("detailTitle").textContent = session.testId;
  byId("detailSummary").textContent = `${sessionSummary(session)} · detección min/mediana/p95 ${metric(session.detectionMinMs)} / ${metric(session.detectionMedianMs)} / ${metric(session.detectionP95Ms)} · clasificación min/mediana/p95 ${metric(session.classificationMinMs)} / ${metric(session.classificationMedianMs)} / ${metric(session.classificationP95Ms)}`;
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
    format === "csv" ? "text/csv" : "application/json"
  );
  const url = URL.createObjectURL(await response.blob());
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${selectedTestId}.${format}`;
  anchor.click();
  URL.revokeObjectURL(url);
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
byId("csvBtn").addEventListener("click", () => void downloadServerExport("csv"));
byId("jsonBtn").addEventListener("click", () => void downloadServerExport("json"));
void initialize();
