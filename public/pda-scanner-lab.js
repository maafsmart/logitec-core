const token = localStorage.getItem("token") || "";
const history = [];
const byId = (id) => document.getElementById(id);
const field = (id) => String(byId(id)?.value || "").trim();
const scanInput = byId("scanInput");
const liveResult = byId("liveResult");

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

async function processScan() {
  if (!validateRequired()) return;
  const code = field("scanInput");
  if (!code) {
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
    gate.innerHTML = 'Inicia sesión como ADMIN en el <a href="/login.html">login</a>.';
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

void initialize();
