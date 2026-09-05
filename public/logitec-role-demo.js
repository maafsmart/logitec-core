(function logitecRoleDemo() {
  "use strict";

  const ROLE_DEFAULT = { ADMIN: "control", SUPERVISOR: "tasks", OPERATOR: "tasks", CLIENT: "control" };

  const ROLE_TAB_DEFAULT = { ADMIN: "inicio", SUPERVISOR: "operacion", OPERATOR: "operacion", CLIENT: "inicio" };

  function tabForModule(role, moduleId) {
    const cfg = NAV[role];
    if (!cfg) return ROLE_TAB_DEFAULT[role] || "inicio";
    for (const [tabId, mods] of Object.entries(cfg.modules)) {
      if (mods.some((m) => m.id === moduleId)) return tabId;
    }
    return ROLE_TAB_DEFAULT[role] || Object.keys(cfg.modules)[0];
  }

  function navigateModule(moduleId) {
    state.module = moduleId;
    state.tab = tabForModule(navRoleKey(), moduleId);
    state.activeTaskId = null;
    state.taskFlow = null;
    if (moduleId !== "tasks") {
      state.freeScanActive = false;
      state.freeScanSession = null;
    }
    render();
  }

  function navRoleKey() {
    if (state.role === "SUPERVISOR" && state.operatorMode) return "OPERATOR";
    return state.role;
  }

  function navConfig() {
    return NAV[navRoleKey()] || null;
  }

  function isOperatorExperience() {
    return state.role === "OPERATOR" || (state.role === "SUPERVISOR" && state.operatorMode);
  }

  const FLOW_PALETTE_BY_MODULE = {
    inbound: "recepcion",
    receive: "recepcion",
    movements: "mover",
    relocate: "mover",
    putaway: "mover",
    lookup: "mover",
    tasks: "mover",
    tracking: "mover",
    incidents: "mover",
    inventory: "mover",
    requisitions: "mover",
    picking: "salida",
    outbound: "salida",
    outbound_prep: "salida"
  };


  const OPERATOR_TASK_TITLES = {
    receive: "Recepción",
    putaway: "Acomodo",
    relocate: "Reubicación",
    outbound: "Preparar salida"
  };

  function taskFlowSteps(task) {
    switch (task.type) {
      case "receive":
        return [{ label: "Escanee mercancía", key: "product" }];
      case "putaway":
        return [
          { label: "Escanee mercancía", key: "product" },
          { label: "Escanee ubicación destino", key: "destination" }
        ];
      case "relocate":
        return [
          { label: "Escanee mercancía", key: "product" },
          { label: "Escanee ubicación destino", key: "destination" }
        ];
      case "outbound":
        return [
          { label: "Escanee mercancía · picking", key: "product" },
          { label: "Escanee buffer de salida", key: "destination" }
        ];
      default:
        return [{ label: "Escanee mercancía", key: "product" }];
    }
  }

  const FLOW_POS_BY_PALETTE = { recepcion: "first", mover: "middle", salida: "last" };

  const TASK_TYPE_PALETTE = {
    receive: "recepcion",
    putaway: "mover",
    relocate: "mover",
    picking: "salida",
    outbound: "salida"
  };

  const NEUTRAL_BRAND_MODULES = new Set([
    "control",
    "locations",
    "projects",
    "products",
    "prices",
    "imports",
    "users",
    "reports",
    "exports",
    "config"
  ]);

  const NAV = {
    ADMIN: {
      tabs: [
        { id: "inicio", label: "Inicio" },
        { id: "inventario", label: "Inventario" },
        { id: "operacion", label: "Operación" },
        { id: "gestion", label: "Gestión" },
        { id: "informacion", label: "Información" }
      ],
      modules: {
        inicio: [{ id: "control", label: "Centro de Control", desc: "Resumen operativo del almacén", primary: true }],
        inventario: [
          { id: "inventory", label: "Existencias", desc: "Saldos por proyecto y ubicación" },
          { id: "locations", label: "Ubicaciones", desc: "Estructura operativa de almacén" }
        ],
        operacion: [
          { id: "movements", label: "Movimientos / Trazabilidad", desc: "Historial físico de inventario" },
          { id: "inbound", label: "Recepciones", desc: "Entradas y buffer de entrada" },
          { id: "picking", label: "Picking", desc: "Surtido de salida con escaneo" },
          { id: "outbound", label: "Salidas", desc: "Preparación hacia buffer de salida" },
          { id: "requisitions", label: "Órdenes / Requisiciones", desc: "Demanda operativa" },
          { id: "relocate", label: "Reubicaciones", desc: "Movimiento interno entre ubicaciones" }
        ],
        gestion: [
          { id: "projects", label: "Proyectos", desc: "Proyectos con existencias" },
          { id: "products", label: "Productos", desc: "Catálogo desde fuente demo" },
          { id: "prices", label: "Precios", desc: "Solo lectura en demo" },
          { id: "imports", label: "Importaciones", desc: "Deshabilitado en demo" },
          { id: "users", label: "Usuarios", desc: "Administración en sistema oficial" }
        ],
        informacion: [
          { id: "reports", label: "Reportes", desc: "Indicadores operativos" },
          { id: "exports", label: "Exportaciones", desc: "Export CSV/Excel oficial" },
          { id: "config", label: "Configuración", desc: "Reglas operativas LOGITEC" }
        ]
      }
    },
    SUPERVISOR: {
      tabs: [
        { id: "operacion", label: "Operación" },
        { id: "inventario", label: "Inventario" },
        { id: "control", label: "Control" }
      ],
      modules: {
        operacion: [
          { id: "tasks", label: "Centro de operación", desc: "Operación del día · tareas y seguimiento", primary: true },
          { id: "pending_supervision", label: "Pendientes de supervisión", desc: "Capturas provisionales de piso · revisión DEMO" },
          { id: "tracking", label: "Tareas", desc: "Trabajo asignado al piso" },
          { id: "requisitions", label: "Seguimiento", desc: "Estados · avance · diferencias" },
          { id: "picking", label: "Picking / Surtido", desc: "Órdenes de surtido de salida" },
          { id: "outbound", label: "Salidas / Despacho", desc: "Preparación y despacho" },
          { id: "incidents", label: "Incidencias", desc: "Excepciones operativas" }
        ],
        inventario: [
          { id: "inventory", label: "Existencias", desc: "Consulta de saldos autorizados" },
          { id: "locations", label: "Ubicaciones", desc: "Distribución física" }
        ],
        control: [{ id: "movements", label: "Movimientos / Trazabilidad", desc: "Historial físico consultable" }]
      }
    },
    OPERATOR: {
      tabs: [
        { id: "operacion", label: "Operación" },
        { id: "consulta", label: "Consulta" }
      ],
      modules: {
        operacion: [{ id: "tasks", label: "Mis tareas", desc: "Seleccione tarea · escanee · ejecute", primary: true }],
        consulta: [{ id: "lookup", label: "Consulta rápida", desc: "SKU · ubicación · READ-ONLY" }]
      }
    },
    CLIENT: {
      tabs: [{ id: "inicio", label: "Inicio" }, { id: "consulta", label: "Consulta" }],
      modules: {
        inicio: [{ id: "control", label: "Resumen de inventario", desc: "Inventario autorizado de sus proyectos", primary: true }],
        consulta: [
          { id: "inventory", label: "Existencias", desc: "Stock con búsqueda integrada" },
          { id: "movements", label: "Movimientos / Trazabilidad", desc: "Historial consultable" },
          { id: "reports", label: "Reportes", desc: "Reportes autorizados" }
        ]
      }
    }
  };

  const state = {
    role: "ADMIN",
    tab: "inicio",
    module: "control",
    dataSource: "NONE",
    summary: null,
    stock: [],
    excelItems: [],
    movements: [],
    tasks: [],
    blockedWrites: 0,
    activeTaskId: null,
    taskFlow: null,
    inventoryFilter: { q: "", project: "", location: "" },
    page: 1,
    pageSize: 50,
    scanInputStartedAt: null,
    scanLastMetrics: null,
    scanSuccessPlayed: false,
    scanProcessing: false,
    mobileEmulation: false,
    concentration: false,
    mobileScrollSnapshot: 0,
    operatorMode: false,
    supervisorReturnContext: null,
    freeScanActive: false,
    freeScanSession: null,
    provisionalCaptures: [],
    provisionalCaptureSeq: 0
  };

  const app = document.getElementById("app");
  const sidebar = document.getElementById("sidebar");
  const authHint = document.getElementById("authHint");
  const writeGuard = document.getElementById("writeGuard");
  const dataSourceFooter = document.getElementById("dataSourceFooter");
  const dataSourceBadge = document.getElementById("dataSourceBadge");
  const appDateTime = document.getElementById("appDateTime");

  function isDirectorViewSwitchEnabled() {
    const host = String(window.location.hostname || "").toLowerCase();
    return host === "localhost" || host === "127.0.0.1";
  }

  function syncDirectorViewUi() {
    document.querySelectorAll("#roleSwitch [data-role]").forEach((btn) => {
      btn.classList.toggle("active", btn.getAttribute("data-role") === state.role);
    });
    document.querySelectorAll("#directorViewBar [data-director-role]").forEach((btn) => {
      btn.classList.toggle("active", btn.getAttribute("data-director-role") === state.role);
    });
    document.querySelectorAll("#directorViewBar [data-director-mobile]").forEach((btn) => {
      btn.classList.toggle("active", state.mobileEmulation);
    });
    document.body.classList.toggle("mobile-emulation-active", state.mobileEmulation);
    syncMobileEmulationChrome();
  }

  function syncMobileEmulationChrome() {
    const chrome = document.getElementById("mobileEmulationChrome");
    if (!chrome) return;
    chrome.hidden = !state.mobileEmulation;
    chrome.classList.toggle("hidden", !state.mobileEmulation);
  }

  function setMobileEmulation(active) {
    const next = !!active;
    const scrollHost = document.querySelector("main.content") || app;
    if (next) {
      state.mobileScrollSnapshot = scrollHost ? scrollHost.scrollTop : window.scrollY || 0;
      if (state.concentration) applyConcentration(false);
    }
    if (state.mobileEmulation === next) {
      syncDirectorViewUi();
      syncConcentrationUi();
      return;
    }
    state.mobileEmulation = next;
    syncDirectorViewUi();
    syncConcentrationUi();
    if (!next) {
      const top = state.mobileScrollSnapshot || 0;
      requestAnimationFrame(() => {
        const host = document.querySelector("main.content") || app;
        if (host) host.scrollTop = top;
        else window.scrollTo(0, top);
      });
    }
  }

  function syncRoleSwitchUi() {
    syncDirectorViewUi();
  }

  function resetDemoStartupView() {
    state.role = "ADMIN";
    state.tab = "inicio";
    state.module = "control";
    state.scanInputStartedAt = null;
    state.scanLastMetrics = null;
    state.scanSuccessPlayed = false;
    state.scanProcessing = false;
    state.activeTaskId = null;
    state.taskFlow = null;
    state.mobileEmulation = false;
    state.concentration = false;
    state.operatorMode = false;
    state.supervisorReturnContext = null;
    state.freeScanActive = false;
    state.freeScanSession = null;
    state.provisionalCaptures = [];
    state.provisionalCaptureSeq = 0;
    document.body.classList.remove("focus-mode");
    syncConcentrationOverlay();
    syncSupervisorOperatorModeUi();
  }

  function syncConcentrationOverlay() {
    const overlay = document.getElementById("concentrationOverlay");
    if (!overlay) return;
    overlay.hidden = !state.concentration;
    overlay.classList.toggle("hidden", !state.concentration);
  }

  function canUseConcentration() {
    if (state.mobileEmulation || state.operatorMode) return false;
    return state.role === "ADMIN" || state.role === "SUPERVISOR";
  }

  function syncConcentrationButton() {
    const btn = document.getElementById("focusModeBtn");
    if (!btn) return;
    btn.setAttribute("aria-pressed", state.concentration ? "true" : "false");
    btn.textContent = state.concentration ? "Salir de concentración" : "Modo concentración";
  }

  function syncConcentrationUi() {
    if (state.concentration && !canUseConcentration()) {
      state.concentration = false;
      document.body.classList.remove("focus-mode");
    }
    const btn = document.getElementById("focusModeBtn");
    if (btn) {
      const show = canUseConcentration();
      btn.hidden = !show;
      btn.classList.toggle("hidden", !show);
    }
    syncConcentrationButton();
  }

  function applyConcentration(on) {
    const next = Boolean(on);
    if (next && !canUseConcentration()) return;
    state.concentration = next;
    document.body.classList.toggle("focus-mode", state.concentration);
    syncConcentrationButton();
    syncConcentrationOverlay();
    syncConcentrationUi();
  }

  function wireConcentration() {
    const btn = document.getElementById("focusModeBtn");
    if (btn && btn.dataset.wired !== "1") {
      btn.dataset.wired = "1";
      btn.addEventListener("click", () => applyConcentration(!state.concentration));
    }
    const exitBtn = document.getElementById("concentrationExitBtn");
    if (exitBtn && exitBtn.dataset.wired !== "1") {
      exitBtn.dataset.wired = "1";
      exitBtn.addEventListener("click", () => applyConcentration(false));
    }
    syncConcentrationUi();
  }

  function applyDirectorView(role) {
    applyRoleView(role);
  }

  function cancelActiveTask() {
    state.activeTaskId = null;
    state.taskFlow = null;
    state.freeScanActive = false;
    state.freeScanSession = null;
    unlockScanInput();
    state.scanLastMetrics = null;
    state.module = "tasks";
    state.tab = "operacion";
    render();
  }

  const PROVISIONAL_STATUSES = [
    "PENDIENTE DE SUPERVISIÓN",
    "REQUIERE ACLARACIÓN",
    "VALIDADO · PENDIENTE DE REGISTRO",
    "RECHAZADO ADMINISTRATIVAMENTE"
  ];

  const DECLARED_FLOOR_ACTIONS = [
    { id: "consulta", label: "Consulta" },
    { id: "traslado", label: "Traslado / reubicación física" },
    { id: "acomodo", label: "Acomodo" },
    { id: "salida", label: "Preparar salida" },
    { id: "recepcion", label: "Recepción física" },
    { id: "etiquetado", label: "Etiquetado" },
    { id: "incidencia", label: "Incidencia / otro" }
  ];

  function demoExecutorLabel() {
    if (state.role === "SUPERVISOR" && state.operatorMode) return "Supervisor trabajando como Operador";
    if (state.role === "OPERATOR") return "Operador";
    return state.role;
  }

  function normalizeForClassification(rawValue) {
    return String(normalizeScannerRawValue(rawValue) || "").trim().toUpperCase();
  }

  function isPureNumericToken(value) {
    return /^\d+$/.test(String(value || "").trim());
  }

  function classifyScanCodeLocal(rawValue) {
    const raw = String(rawValue ?? "");
    const normalized = normalizeForClassification(raw);
    if (!normalized) {
      return { raw, normalized: "", classification: "SIN CLASIFICAR", match: null };
    }
    if (isPureNumericToken(normalized)) {
      return { raw, normalized, classification: "SIN CLASIFICAR", match: null, reason: "Valor numérico aislado" };
    }
    const stock = state.stock || [];
    const skuHit = stock.find((r) => String(r.product?.sku || "").toUpperCase() === normalized);
    if (skuHit) {
      return {
        raw,
        normalized,
        classification: "SKU",
        match: { type: "SKU", value: skuHit.product.sku, label: skuHit.product?.name || skuHit.product.sku }
      };
    }
    const locHit = stock.find((r) => String(r.location?.code || "").toUpperCase() === normalized);
    if (locHit) {
      return { raw, normalized, classification: "UBICACIÓN", match: { type: "UBICACIÓN", value: locHit.location.code } };
    }
    const sapHit = stock.find((r) => String(r.sap || "").toUpperCase() === normalized);
    if (sapHit) {
      return { raw, normalized, classification: "SAP", match: { type: "SAP", value: sapHit.sap } };
    }
    const pedidoHit = stock.find((r) => String(r.pedido || "").toUpperCase() === normalized);
    if (pedidoHit) {
      return { raw, normalized, classification: "PEDIDO", match: { type: "PEDIDO", value: pedidoHit.pedido } };
    }
    const partidaHit = stock.find((r) => String(r.partida || "").toUpperCase() === normalized);
    if (partidaHit) {
      return { raw, normalized, classification: "PARTIDA", match: { type: "PARTIDA", value: partidaHit.partida } };
    }
    const serialHit = stock.find((r) => String(r.serialNumber || "").toUpperCase() === normalized);
    if (serialHit) {
      return { raw, normalized, classification: "SERIE", match: { type: "SERIE", value: serialHit.serialNumber } };
    }
    return { raw, normalized, classification: "SIN CLASIFICAR", match: null };
  }

  function classificationDisplay(result) {
    if (!result || result.classification === "SIN CLASIFICAR") return "SIN CLASIFICAR";
    if (result.match?.value) return `${result.classification} · ${result.match.value}`;
    return result.classification;
  }

  function matchDisplay(result) {
    if (!result?.match) return "—";
    if (result.match.label) return `${result.match.type}: ${result.match.value} · ${result.match.label}`;
    return `${result.match.type}: ${result.match.value}`;
  }

  function nextProvisionalCaptureId() {
    state.provisionalCaptureSeq += 1;
    return `CP-${String(state.provisionalCaptureSeq).padStart(4, "0")}`;
  }

  function ensureFreeScanSession() {
    if (!state.freeScanSession) {
      state.freeScanSession = {
        startedAt: new Date().toISOString(),
        readings: [],
        declaredAction: "consulta",
        observation: ""
      };
    }
    return state.freeScanSession;
  }

  function startFreeScanMode() {
    if (state.activeTaskId) return;
    state.freeScanActive = true;
    state.freeScanSession = {
      startedAt: new Date().toISOString(),
      readings: [],
      declaredAction: "consulta",
      observation: ""
    };
    unlockScanInput();
    renderContent();
  }

  function discardFreeScanSession() {
    state.freeScanActive = false;
    state.freeScanSession = null;
    unlockScanInput();
    renderContent();
  }

  function sendProvisionalCapture() {
    const session = state.freeScanSession;
    if (!session || !session.readings.length) return;
    const action = DECLARED_FLOOR_ACTIONS.find((a) => a.id === session.declaredAction) || DECLARED_FLOOR_ACTIONS[0];
    const capture = {
      id: nextProvisionalCaptureId(),
      status: "PENDIENTE DE SUPERVISIÓN",
      declaredAction: action.label,
      declaredActionId: action.id,
      executor: demoExecutorLabel(),
      executorRole: state.role,
      executorOperatorMode: Boolean(state.operatorMode),
      device: "Dispositivo demo",
      physicalStartedAt: session.startedAt,
      physicalEndedAt: new Date().toISOString(),
      observation: String(session.observation || "").trim(),
      readings: session.readings.map((r) => ({ ...r })),
      adminUpdatedAt: null
    };
    state.provisionalCaptures.unshift(capture);
    state.freeScanActive = false;
    state.freeScanSession = null;
    unlockScanInput();
    renderContent();
  }

  function updateProvisionalCaptureStatus(captureId, nextStatus) {
    const capture = state.provisionalCaptures.find((c) => c.id === captureId);
    if (!capture || state.role !== "SUPERVISOR" || state.operatorMode) return;
    if (!PROVISIONAL_STATUSES.includes(nextStatus)) return;
    capture.status = nextStatus;
    capture.adminUpdatedAt = new Date().toISOString();
    renderContent();
  }

  function renderScannerWorkspace({ mode, meta, instruction }) {
    const banner =
      mode === "task" ? "ESCÁNER ACTIVO · ESPERANDO LECTURA" : "ESCÁNER ACTIVO · MODO LIBRE CONTROLADO";
    const help =
      mode === "task"
        ? "Use el gatillo del lector · Captura manual solo como contingencia"
        : "Esta captura no modifica inventario";
    return `<div class="scan-workspace operator-scan-active scan-engine-shell" data-scan-mode="${esc(mode)}">
      <p class="scan-active-banner">${esc(banner)}</p>
      ${meta ? `<p class="scan-handheld-meta">${meta}</p>` : ""}
      ${instruction ? `<h2 class="scan-handheld-instruction">${esc(instruction)}</h2>` : ""}
      <p class="scan-handheld-help">${esc(help)}</p>
      <input class="scan-input scan-handheld-input field" id="scanValue" type="text" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Escaneo · Enter" />
      <div class="scan-handheld-fallback">
        ${
          mode === "task"
            ? `<button type="button" class="btn-secondary btn-compact" data-cancel-task>Cancelar tarea</button>
          <button type="button" class="btn-secondary btn-compact" id="scanReportDiff" hidden>Reportar diferencia</button>`
            : `<button type="button" class="btn-secondary btn-compact" data-discard-free-scan>DESCARTAR CAPTURA</button>`
        }
        <button type="button" class="scan-manual-link" id="scanManual">Captura manual</button>
      </div>
      <div id="scanFeedback" class="scan-status idle">${mode === "task" ? "Listo para lectura" : "Escaneo libre listo"}</div>
    </div>`;
  }

  function wireScannerInput(onSubmit, manualPlaceholder) {
    const input = document.getElementById("scanValue");
    if (!input || typeof onSubmit !== "function") return;
    input.focus();
    input.select();
    const submitScan = () => {
      void onSubmit(input);
    };
    input.addEventListener("focus", () => {
      if (!state.scanInputStartedAt) state.scanInputStartedAt = performance.now();
    });
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        submitScan();
      }
    });
    document.getElementById("scanManual")?.addEventListener("click", () => {
      input.focus();
      input.placeholder = manualPlaceholder || "Captura manual · escriba y Enter";
    });
  }

  function enterSupervisorOperatorMode() {
    if (state.role !== "SUPERVISOR" || state.operatorMode) return;
    const scrollHost = document.querySelector("main.content") || app;
    state.supervisorReturnContext = {
      tab: state.tab,
      module: state.module,
      scroll: scrollHost ? scrollHost.scrollTop : 0
    };
    if (state.concentration) applyConcentration(false);
    state.operatorMode = true;
    state.tab = "operacion";
    state.module = "tasks";
    syncSupervisorOperatorModeUi();
    syncConcentrationUi();
    render();
  }

  function exitSupervisorOperatorMode() {
    if (state.role !== "SUPERVISOR" || !state.operatorMode) return;
    const ctx = state.supervisorReturnContext || {
      tab: ROLE_TAB_DEFAULT.SUPERVISOR,
      module: ROLE_DEFAULT.SUPERVISOR,
      scroll: 0
    };
    state.operatorMode = false;
    state.tab = ctx.tab;
    state.module = ctx.module;
    state.supervisorReturnContext = null;
    syncSupervisorOperatorModeUi();
    syncConcentrationUi();
    render();
    requestAnimationFrame(() => {
      const host = document.querySelector("main.content") || app;
      if (host) host.scrollTop = ctx.scroll || 0;
    });
  }

  function syncSupervisorOperatorModeUi() {
    const active = state.role === "SUPERVISOR" && state.operatorMode;
    document.body.classList.toggle("supervisor-operator-mode-active", active);
    const bar = document.getElementById("supervisorOperatorModeBar");
    if (bar) {
      bar.hidden = !active;
      bar.classList.toggle("hidden", !active);
    }
  }

  function wireSupervisorOperatorMode() {
    const exitBtn = document.getElementById("exitSupervisorOperatorModeBtn");
    if (exitBtn && exitBtn.dataset.wired !== "1") {
      exitBtn.dataset.wired = "1";
      exitBtn.addEventListener("click", () => exitSupervisorOperatorMode());
    }
    syncSupervisorOperatorModeUi();
  }

  function applyRoleView(role) {
    if (!NAV[role]) return;
    if (state.role === role && state.operatorMode && role === "SUPERVISOR") {
      exitSupervisorOperatorMode();
      return;
    }
    state.role = role;
    state.operatorMode = false;
    state.supervisorReturnContext = null;
    state.concentration = false;
    document.body.classList.remove("focus-mode");
    syncConcentrationOverlay();
    state.tab = ROLE_TAB_DEFAULT[role] || Object.keys(NAV[role].modules)[0];
    state.module = ROLE_DEFAULT[role] || (NAV[role].modules[state.tab] || [])[0]?.id || "control";
    state.activeTaskId = null;
    state.taskFlow = null;
    state.scanProcessing = false;
    syncDirectorViewUi();
    syncRoleViewUi();
    syncSupervisorOperatorModeUi();
    syncConcentrationUi();
    render();
  }

  function syncRoleViewUi() {
    document.body.setAttribute("data-role-view", state.role.toLowerCase());
    const roleSwitch = document.getElementById("roleSwitch");
    if (roleSwitch) {
      const hideForClient = state.role === "CLIENT";
      roleSwitch.hidden = hideForClient || isDirectorViewSwitchEnabled();
      roleSwitch.classList.toggle("hidden", roleSwitch.hidden);
    }
  }

  function initDirectorViewBar() {
    const bar = document.getElementById("directorViewBar");
    const roleSwitch = document.getElementById("roleSwitch");
    if (!isDirectorViewSwitchEnabled()) {
      if (roleSwitch) {
        roleSwitch.hidden = state.role === "CLIENT";
        roleSwitch.classList.toggle("hidden", roleSwitch.hidden);
      }
      return;
    }
    if (!bar) return;
    if (bar.dataset.wired === "1") {
      syncDirectorViewUi();
      syncConcentrationUi();
      return;
    }
    bar.dataset.wired = "1";
    bar.hidden = false;
    bar.classList.remove("hidden");
    document.body.classList.add("director-view-mode");
    bar.querySelectorAll("[data-director-role]").forEach((btn) => {
      btn.addEventListener("click", () => applyDirectorView(btn.getAttribute("data-director-role") || "OPERATOR"));
    });
    bar.querySelectorAll("[data-director-mobile]").forEach((btn) => {
      btn.addEventListener("click", () => setMobileEmulation(true));
    });
    bar.querySelectorAll("[data-director-system]").forEach((btn) => {
      btn.addEventListener("click", () => {
        if (btn.dataset.opening === "1") return;
        btn.dataset.opening = "1";
        window.open("/dashboard.html", "_blank", "noopener,noreferrer");
        window.setTimeout(() => {
          btn.dataset.opening = "0";
        }, 800);
      });
    });
    const restoreBtn = document.getElementById("mobileEmulationRestore");
    if (restoreBtn) {
      restoreBtn.addEventListener("click", () => setMobileEmulation(false));
    }
    syncDirectorViewUi();
  }

  function readAccessToken() {
    try {
      return String(localStorage.getItem("token") || "").trim();
    } catch (_e) {
      return "";
    }
  }

  function guardFetch(input, init) {
    const method = String((init && init.method) || "GET").toUpperCase();
    if (method !== "GET") {
      state.blockedWrites += 1;
      writeGuard.textContent = `Escrituras bloqueadas: ${state.blockedWrites}`;
      return Promise.reject(new Error(`Demo read-only: ${method} bloqueado`));
    }
    return fetch(input, init);
  }

  async function apiGet(path, soft) {
    const headers = { Accept: "application/json" };
    const t = readAccessToken();
    if (t) headers.Authorization = "Bearer " + t;
    const response = await guardFetch(path, { headers, cache: "no-store", credentials: "same-origin" });
    let payload = null;
    try {
      payload = await response.json();
    } catch (_e) {
      payload = null;
    }
    if (soft) return { ok: response.ok, status: response.status, data: payload };
    if (response.status === 401) throw new Error("Sesión requerida.");
    if (!response.ok) throw new Error((payload && payload.message) || `GET ${path} → ${response.status}`);
    return payload;
  }

  function esc(t) {
    return String(t ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
  }

  function fmtQty(v) {
    if (v == null || v === "") return "—";
    const n = Number(v);
    return Number.isFinite(n) ? n.toLocaleString("es-MX") : String(v);
  }

  function statusBadge(status) {
    const m = {
      pending: ["Pendiente", "pending"],
      in_progress: ["En proceso", "progress"],
      completed: ["Completada", "done"],
      difference: ["Diferencia", "difference"],
      review: ["Requiere revisión", "review"]
    };
    const hit = m[status] || ["—", "pending"];
    return `<span class="badge ${hit[1]}">${hit[0]}</span>`;
  }

  function dbHasInventory(summary) {
    return Number(summary?.qty || 0) > 0 || Number(summary?.cubes || 0) > 0;
  }

  function excelItemToStock(item) {
    return {
      product: { sku: item.sku, name: item.description || item.sku },
      location: { code: item.location },
      project: item.project ? { code: item.project, name: item.project } : null,
      qty: item.qty,
      sap: item.sap,
      pedido: item.pedido,
      partida: item.partida,
      status: item.status,
      serialNumber: item.serialNumber
    };
  }

  function buildTasks() {
    const items = state.excelItems.length ? state.excelItems : [];
    const pick = (fn, i) => items.find(fn) || items[i] || {};
    const a = pick((x) => x.location && /^AN/i.test(x.location), 0);
    const b = pick((x) => x.location && x.location !== a.location, 1);
    const c = pick((x) => x.location && x.location !== a.location && x.location !== b.location, 2);
    const pedido = a.pedido && !/^free to sale$/i.test(String(a.pedido).trim()) ? a.pedido : "45003182";
    return [
      {
        id: "T-1048",
        type: "receive",
        typeLabel: "Recibir mercancía",
        reference: pedido,
        project: String(a.project || "AVIAT NETWORKS").trim() || "AVIAT NETWORKS",
        product: a.sku,
        description: a.description,
        qty: Math.min(Number(a.qty || 1) || 1, 24),
        origin: "Documento recepción",
        destination: "Buffer de entrada",
        priority: "Alta",
        status: "pending",
        operator: null
      },
      {
        id: "T-1049",
        type: "putaway",
        typeLabel: "Acomodar mercancía",
        reference: "Post-recepción",
        project: String(b.project || a.project || "AVIAT NETWORKS").trim() || "AVIAT NETWORKS",
        product: b.sku || a.sku,
        description: b.description || a.description,
        qty: 24,
        origin: "Buffer de entrada",
        destination: b.location || "AN203",
        priority: "Normal",
        status: "pending",
        operator: null
      },
      {
        id: "T-1050",
        type: "relocate",
        typeLabel: "Reubicar mercancía",
        reference: "Movimiento interno",
        project: String(c.project || "Operaciones").trim() || "Operaciones",
        product: c.sku || b.sku || a.sku,
        description: c.description || b.description,
        qty: Math.min(Number(c.qty || 12) || 12, 12),
        origin: a.location || "AN203",
        destination: c.location && c.location !== a.location ? c.location : "AN105",
        priority: "Normal",
        status: "in_progress",
        operator: "Operador piso"
      },
      {
        id: "T-1051",
        type: "outbound",
        typeLabel: "Preparar salida",
        reference: "REQ-7781",
        project: String(a.project || "AVIAT NETWORKS").trim() || "AVIAT NETWORKS",
        product: a.sku,
        description: a.description,
        qty: 8,
        origin: a.location || "AN203",
        destination: "Buffer de salida",
        priority: "Alta",
        status: "pending",
        operator: null
      }
    ];
  }

  function applyExcelPayload(payload) {
    state.dataSource = "EXCEL";
    state.excelItems = payload.items || [];
    state.stock = state.excelItems.map(excelItemToStock);
    state.movements = [];
    state.summary = {
      qty: String(payload.summary?.pieces ?? 0),
      cubes: payload.summary?.balances ?? 0,
      locations: payload.summary?.locations ?? 0,
      projects: payload.summary?.projects ?? 0,
      products: payload.summary?.products ?? 0,
      movements: 0
    };
    state.tasks = buildTasks();
  }

  function applyDbPayload(summary, movementsPayload, stock) {
    state.dataSource = "DB";
    state.excelItems = [];
    state.summary = summary;
    state.movements = movementsPayload?.items || [];
    state.stock = stock || [];
    state.tasks = buildTasks();
  }

  function updateSourceUi() {
    const label = state.dataSource === "EXCEL" ? "Fuente demo: Excel oficial · solo lectura" : state.dataSource === "DB" ? "Fuente: BD READ-ONLY" : "Fuente: sin datos";
    if (dataSourceFooter) dataSourceFooter.textContent = label;
    if (dataSourceBadge) dataSourceBadge.textContent = label;
  }

  function kpis() {
    const s = state.summary || {};
    return `<div class="kpi-grid">
      <div class="kpi-card ok"><span class="kpi-value">${esc(fmtQty(s.qty))}</span><span class="kpi-label">Piezas</span></div>
      <div class="kpi-card accent"><span class="kpi-value">${esc(fmtQty(s.cubes))}</span><span class="kpi-label">Registros</span></div>
      <div class="kpi-card"><span class="kpi-value">${esc(fmtQty(s.locations))}</span><span class="kpi-label">Ubicaciones</span></div>
      <div class="kpi-card warn"><span class="kpi-value">${esc(fmtQty(s.projects))}</span><span class="kpi-label">Proyectos</span></div>
    </div>`;
  }

  function aggregateLocations() {
    const map = new Map();
    state.stock.forEach((r) => {
      const loc = r.location?.code;
      if (!loc) return;
      const cur = map.get(loc) || { loc, pieces: 0, rows: 0, projects: new Set() };
      cur.pieces += Number(r.qty || 0);
      cur.rows += 1;
      const p = r.project?.code || r.project?.name;
      if (p) cur.projects.add(String(p).trim());
      map.set(loc, cur);
    });
    return [...map.values()].sort((a, b) => b.pieces - a.pieces);
  }

  function aggregateProjects() {
    const map = new Map();
    state.stock.forEach((r) => {
      const p = String(r.project?.code || r.project?.name || "Sin proyecto").trim() || "Sin proyecto";
      const cur = map.get(p) || { project: p, pieces: 0, rows: 0, locations: new Set() };
      cur.pieces += Number(r.qty || 0);
      cur.rows += 1;
      if (r.location?.code) cur.locations.add(r.location.code);
      map.set(p, cur);
    });
    return [...map.values()].sort((a, b) => b.pieces - a.pieces);
  }

  function aggregateProducts() {
    const map = new Map();
    state.stock.forEach((r) => {
      const sku = r.product?.sku;
      if (!sku) return;
      const cur = map.get(sku) || { sku, name: r.product?.name, pieces: 0, rows: 0 };
      cur.pieces += Number(r.qty || 0);
      cur.rows += 1;
      map.set(sku, cur);
    });
    return [...map.values()].sort((a, b) => b.pieces - a.pieces);
  }

  function filteredStock() {
    const q = state.inventoryFilter.q.toLowerCase();
    const proj = state.inventoryFilter.project.toLowerCase();
    const loc = state.inventoryFilter.location.toLowerCase();
    return state.stock.filter((r) => {
      const sku = (r.product?.sku || "").toLowerCase();
      const name = (r.product?.name || "").toLowerCase();
      const location = (r.location?.code || "").toLowerCase();
      const project = (r.project?.code || r.project?.name || "").toLowerCase();
      const sap = (r.sap || "").toLowerCase();
      const pedido = (r.pedido || "").toLowerCase();
      return (
        (!q || sku.includes(q) || name.includes(q) || sap.includes(q) || pedido.includes(q)) &&
        (!proj || project.includes(proj)) &&
        (!loc || location.includes(loc))
      );
    });
  }

  function inventoryTable(paginate) {
    const rows = filteredStock();
    const totalPages = Math.max(1, Math.ceil(rows.length / state.pageSize));
    if (state.page > totalPages) state.page = totalPages;
    const start = paginate ? (state.page - 1) * state.pageSize : 0;
    const slice = paginate ? rows.slice(start, start + state.pageSize) : rows.slice(0, 200);
    const lead =
      state.role === "CLIENT"
        ? "Consulta autorizada · búsqueda integrada por SKU, SAP, pedido, proyecto y ubicación"
        : "Datos reales de la fuente demo · READ-ONLY";
    return `<div class="module-screen-header"><h3>Existencias</h3><p class="module-lead">${lead}</p></div>
      ${kpis()}
      <div class="card-panel">
        <div class="filters-bar">
          <div class="field"><label>Búsqueda</label><input id="invQ" value="${esc(state.inventoryFilter.q)}" placeholder="SKU, SAP, pedido, descripción" /></div>
          <div class="field"><label>Proyecto</label><input id="invProject" value="${esc(state.inventoryFilter.project)}" /></div>
          <div class="field"><label>Ubicación</label><input id="invLocation" value="${esc(state.inventoryFilter.location)}" /></div>
          <button type="button" class="btn-secondary" id="invFilterRun">Filtrar</button>
        </div>
        <p class="operational-table-meta">${esc(slice.length)} mostrados · ${esc(rows.length)} resultados · ${esc(state.stock.length)} registros fuente</p>
        <table class="data-table"><thead><tr>
          <th>SKU</th><th>Descripción</th><th>Proyecto</th><th>Ubicación</th><th>Cant.</th><th>SAP</th><th>Pedido</th><th>Partida</th>
        </tr></thead><tbody>${slice
          .map(
            (r) => `<tr>
              <td>${esc(r.product?.sku)}</td><td>${esc(r.product?.name)}</td>
              <td>${esc(r.project?.code || r.project?.name || "—")}</td>
              <td>${esc(r.location?.code)}</td><td>${esc(fmtQty(r.qty))}</td>
              <td>${esc(r.sap || "—")}</td><td>${esc(r.pedido || "—")}</td><td>${esc(r.partida || "—")}</td>
            </tr>`
          )
          .join("")}</tbody></table>
        ${
          paginate
            ? `<div class="pagination">
              <button type="button" class="btn-secondary btn-compact" id="pagePrev" ${state.page <= 1 ? "disabled" : ""}>Anterior</button>
              <span>Página ${state.page} / ${totalPages}</span>
              <button type="button" class="btn-secondary btn-compact" id="pageNext" ${state.page >= totalPages ? "disabled" : ""}>Siguiente</button>
            </div>`
            : ""
        }
      </div>`;
  }

  function tasksTable(compact, taskTypeFilter, innerOnly) {
    let rows = state.tasks.filter((t) => t.status !== "completed" || !compact);
    if (taskTypeFilter) rows = rows.filter((t) => t.type === taskTypeFilter);
    const filterTitle = taskTypeFilter ? OPERATOR_TASK_TITLES[taskTypeFilter] : "";
    const heading =
      compact && filterTitle
        ? filterTitle
        : compact
          ? "Mis tareas"
          : state.role === "SUPERVISOR"
            ? "Tareas"
            : "Centro de operación · Tareas";
    const tableHtml = `<table class="data-table task-row-compact"><thead><tr>
          <th>Tarea</th><th>Tipo</th><th>Proyecto</th><th>Referencia</th><th>Producto</th><th>Cant.</th><th>Origen</th><th>Destino</th><th>Operador</th><th>Prioridad</th><th>Estado</th>${compact ? "<th></th>" : ""}
        </tr></thead><tbody>${rows.length ? rows
          .map((t) => {
            const action = compact
              ? `<td><button type="button" class="btn-primary btn-compact block-mobile" data-start-task="${esc(t.id)}">Iniciar tarea</button></td>`
              : "";
            return `<tr>
              <td><strong>${esc(t.id)}</strong></td><td>${esc(t.typeLabel)}</td><td>${esc(t.project)}</td>
              <td>${esc(t.reference)}</td><td>${esc(t.product)}</td><td>${esc(fmtQty(t.qty))}</td>
              <td>${esc(t.origin)}</td><td>${esc(t.destination)}</td><td>${esc(t.operator || "—")}</td>
              <td>${esc(t.priority)}</td><td>${statusBadge(t.status)}</td>${action}
            </tr>`;
          })
          .join("") : `<tr><td colspan="${compact ? 12 : 11}">Sin tareas de este tipo en la demo.</td></tr>`}</tbody></table>`;
    if (innerOnly) return tableHtml;
    return `<div class="module-screen-header"><h3>${esc(heading)}</h3>
      <p class="module-lead">${compact ? "LOGITEC dirige · usted escanea y ejecuta" : "Convertir necesidad operativa en trabajo claro de piso"} <span class="badge demo-flow">EJEMPLO DE FLUJO</span></p></div>
      <div class="card-panel">${tableHtml}</div>`;
  }

  function operatorTaskFlow(task) {
    const flow = state.taskFlow || { step: 0 };
    const steps = taskFlowSteps(task);
    const current = steps[flow.step] || steps[steps.length - 1];
    return `<div class="operator-handheld-shell">
      ${renderScannerWorkspace({
        mode: "task",
        meta: `${task.id} · ${task.typeLabel} · paso ${flow.step + 1}/${steps.length}`,
        instruction: current.label
      })}
      <div id="flowResult"></div>
      <p class="ops-message">DEMO — no registra movimiento · LOGITEC conserva trazabilidad en el WMS real</p>
    </div>`;
  }

  function operatorFreeScanView() {
    const session = ensureFreeScanSession();
    const readings = session.readings
      .slice()
      .reverse()
      .map(
        (r) => `<tr>
          <td>${esc(new Date(r.at).toLocaleTimeString("es-MX"))}</td>
          <td><code>${esc(r.raw)}</code></td>
          <td>${esc(r.classification)}</td>
          <td>${esc(r.matchLabel || "—")}</td>
        </tr>`
      )
      .join("");
    const actionOptions = DECLARED_FLOOR_ACTIONS.map(
      (a) =>
        `<option value="${esc(a.id)}"${session.declaredAction === a.id ? " selected" : ""}>${esc(a.label)}</option>`
    ).join("");
    return `<div class="operator-handheld-shell free-scan-shell">
      ${renderScannerWorkspace({ mode: "free" })}
      <div class="card-panel free-scan-evidence">
        <h4>Lecturas acumuladas (${esc(session.readings.length)})</h4>
        ${
          session.readings.length
            ? `<div class="free-scan-readings-wrap"><table class="data-table free-scan-readings"><thead><tr>
              <th>Hora</th><th>RAW</th><th>Clasificación</th><th>Coincidencia</th>
            </tr></thead><tbody>${readings}</tbody></table></div>`
            : `<p class="operational-table-meta">Escanee códigos · la evidencia RAW se conserva sin modificar inventario.</p>`
        }
      </div>
      <div class="card-panel free-scan-actions-panel">
        <div class="free-scan-declare-grid">
          <label class="field compact-field"><span>Acción declarada</span>
            <select id="freeScanDeclaredAction">${actionOptions}</select>
          </label>
          <label class="field compact-field field-grow"><span>Observación (opcional)</span>
            <input id="freeScanObservation" type="text" value="${esc(session.observation)}" placeholder="Contexto de piso · contingencia" />
          </label>
        </div>
        <div class="free-scan-submit-row">
          <button type="button" class="btn-primary btn-compact" data-send-provisional${session.readings.length ? "" : " disabled"}>ENVIAR A SUPERVISIÓN</button>
          <button type="button" class="btn-secondary btn-compact" data-discard-free-scan>DESCARTAR CAPTURA</button>
        </div>
      </div>
      <p class="ops-message">DEMO READ-ONLY · captura provisional en memoria · no modifica inventario</p>
    </div>`;
  }

  function supervisorPendingSupervisionView() {
    const rows = state.provisionalCaptures;
    const table = rows.length
      ? rows
          .map((c) => {
            const statusOptions = PROVISIONAL_STATUSES.map(
              (s) => `<option value="${esc(s)}"${c.status === s ? " selected" : ""}>${esc(s)}</option>`
            ).join("");
            const evidence = c.readings
              .map(
                (r) =>
                  `<li><code>${esc(r.raw)}</code> · ${esc(r.classification)} · ${esc(
                    new Date(r.at).toLocaleTimeString("es-MX")
                  )}</li>`
              )
              .join("");
            return `<tr>
              <td><strong>${esc(c.id)}</strong></td>
              <td>${esc(c.declaredAction)}</td>
              <td>${esc(c.executor)}</td>
              <td>${esc(new Date(c.physicalStartedAt).toLocaleString("es-MX"))}</td>
              <td>${esc(c.readings.length)}</td>
              <td><ul class="provisional-evidence-list">${evidence}</ul></td>
              <td><select class="provisional-status-select" data-provisional-status="${esc(c.id)}">${statusOptions}</select></td>
            </tr>`;
          })
          .join("")
      : `<tr><td colspan="7">Sin capturas provisionales en esta sesión DEMO.</td></tr>`;
    return `<div class="module-screen-header"><h3>Pendientes de supervisión</h3>
      <p class="module-lead">Capturas provisionales de piso · revisión local DEMO · evidencia RAW conservada</p></div>
      <div class="card-panel ops-message warn">DEMO READ-ONLY · la validación no modifica inventario</div>
      <div class="card-panel"><table class="data-table provisional-captures-table"><thead><tr>
        <th>ID</th><th>Acción</th><th>Ejecutor</th><th>Hora física</th><th>Lecturas</th><th>Evidencia RAW</th><th>Estado</th>
      </tr></thead><tbody>${table}</tbody></table></div>`;
  }

  function movementsView() {
    if (state.dataSource === "EXCEL" || !state.movements.length) {
      return `<div class="module-screen-header"><h3>Movimientos / Trazabilidad</h3><p class="module-lead">Consulta de historial físico</p></div>
        <div class="card-panel ops-message warn">La fuente Excel no contiene historial de movimientos.</div>`;
    }
    return `<div class="module-screen-header"><h3>Movimientos / Trazabilidad</h3></div><div class="card-panel"><table class="data-table">...</table></div>`;
  }

  function disabledModule(title, message) {
    return `<div class="module-screen-header"><h3>${esc(title)}</h3></div><div class="card-panel ops-message">${esc(message)}</div>`;
  }

  function supervisorWorkAsOperatorBar() {
    return `<div class="view-as-operator-bar">
      <div>
        <strong>Trabajar en piso</strong>
        <p>Use la experiencia completa del Operador sin cambiar su sesión ni rol real de Supervisor.</p>
      </div>
      <button type="button" class="btn-secondary" data-enter-operator-mode>TRABAJAR COMO OPERADOR</button>
    </div>`;
  }

  function supervisorOperationCenter() {
    const pending = state.tasks.filter((t) => t.status === "pending");
    const inProgress = state.tasks.filter((t) => t.status === "in_progress");
    const review = state.tasks.filter((t) => t.status === "review" || t.status === "difference");
    const outboundTasks = state.tasks.filter((t) => t.type === "picking" || t.type === "outbound");
    const recentMovements =
      state.movements.length > 0
        ? `<div class="card-panel"><h4>Movimientos recientes</h4><p class="operational-table-meta">${esc(state.movements.length)} registros en fuente BD</p></div>`
        : `<div class="card-panel ops-message warn">Movimientos recientes no disponibles en fuente Excel · use Control → Movimientos / Trazabilidad cuando exista historial.</div>`;
    return `<div class="module-screen-header"><h3>Centro de operación</h3>
      <p class="module-lead">Organice la operación del día · delegue al piso · dé seguimiento <span class="badge demo-flow">EJEMPLO DE FLUJO</span></p></div>
      ${supervisorWorkAsOperatorBar()}
      <div class="kpi-grid">
        <div class="kpi-card warn"><span class="kpi-value">${esc(pending.length)}</span><span class="kpi-label">Pendientes</span></div>
        <div class="kpi-card accent"><span class="kpi-value">${esc(inProgress.length)}</span><span class="kpi-label">En proceso</span></div>
        <div class="kpi-card"><span class="kpi-value">${esc(review.length)}</span><span class="kpi-label">Diferencias / revisión</span></div>
        <div class="kpi-card ok"><span class="kpi-value">${esc(outboundTasks.filter((t) => t.status === "pending").length)}</span><span class="kpi-label">Picking / salida activos</span></div>
      </div>
      <div class="grid-2">
        <div class="card-panel"><h4>Operación del día</h4>
          <p class="operational-table-meta">${esc(pending.length + inProgress.length)} tareas abiertas · ${esc(state.tasks.length)} en demo</p>
        </div>
        <div class="card-panel"><h4>Picking / Salida</h4>
          <p class="operational-table-meta">${esc(outboundTasks.length)} tareas de salida en cola · picking integrado en preparar salida</p>
        </div>
      </div>
      ${recentMovements}
      <div class="card-panel"><h4>Tareas prioritarias</h4>${tasksTable(false, null, true)}</div>`;
  }

  function operatorTasksLanding() {
    const open = state.tasks.filter((t) => t.status === "pending" || t.status === "in_progress");
    const next = open.find((t) => t.status === "pending") || open[0];
    const nextBlock = next
      ? `<div class="card-panel operator-next-task">
          <p class="operational-table-meta">Siguiente acción</p>
          <h4>${esc(next.id)} · ${esc(next.typeLabel)}</h4>
          <p>${esc(next.product)} · ${esc(fmtQty(next.qty))} pzas · ${esc(next.destination)}</p>
          <button type="button" class="btn-primary block-mobile" data-start-task="${esc(next.id)}">Iniciar tarea</button>
        </div>`
      : `<div class="card-panel ops-message">No hay tareas pendientes en la demo.</div>`;
    const freeScanHint = open.length
      ? `<p class="operational-table-meta">Herramienta secundaria · no interfiere con tareas activas</p>`
      : `<p class="operational-table-meta">Sin tareas abiertas · use escaneo libre controlado para contingencias de piso</p>`;
    return `<div class="module-screen-header"><h3>Mis tareas</h3>
      <p class="module-lead">LOGITEC dirige · usted escanea y ejecuta · interfaz handheld</p></div>
      <div class="card-panel operator-free-scan-entry">
        ${freeScanHint}
        <button type="button" class="btn-secondary btn-compact" data-start-free-scan>ESCANEO LIBRE</button>
      </div>
      ${nextBlock}
      <div class="card-panel"><h4>Tareas abiertas (${esc(open.length)})</h4>${tasksTable(true, null, true)}</div>`;
  }

  function seguimientoView() {
    const rows = state.tasks.filter((t) => t.status === "in_progress" || t.status === "review" || t.status === "difference");
    return `<div class="module-screen-header"><h3>Seguimiento</h3><p class="module-lead">Estados · avance · diferencias operativas</p></div>
      <div class="card-panel"><table class="data-table task-row-compact"><thead><tr>
        <th>Tarea</th><th>Tipo</th><th>Referencia</th><th>Operador</th><th>Estado</th><th>Destino</th>
      </tr></thead><tbody>${rows.length ? rows
        .map(
          (t) => `<tr>
            <td><strong>${esc(t.id)}</strong></td><td>${esc(t.typeLabel)}</td><td>${esc(t.reference)}</td>
            <td>${esc(t.operator || "—")}</td><td>${statusBadge(t.status)}</td><td>${esc(t.destination)}</td>
          </tr>`
        )
        .join("") : `<tr><td colspan="6">Sin tareas en seguimiento activo.</td></tr>`}</tbody></table></div>`;
  }

  function clientResumen() {
    const projs = aggregateProjects().slice(0, 6);
    return `<header class="cc-hero"><h2 class="cc-title">Resumen de inventario</h2><p class="cc-tagline">Inventario autorizado de sus proyectos · consulta READ-ONLY</p></header>
      ${kpis()}
      <div class="card-panel"><h4>Proyectos con existencias</h4>
        <table class="data-table"><thead><tr><th>Proyecto</th><th>Piezas</th><th>Registros</th><th>Ubicaciones</th></tr></thead><tbody>${projs
          .map((p) => `<tr><td>${esc(p.project)}</td><td>${esc(fmtQty(p.pieces))}</td><td>${esc(p.rows)}</td><td>${esc(p.locations.size)}</td></tr>`)
          .join("")}</tbody></table>
      </div>`;
  }

  function controlCenter() {
    const locs = aggregateLocations().slice(0, 5);
    const projs = aggregateProjects().slice(0, 5);
    return `<header class="cc-hero"><h2 class="cc-title">Centro de Control</h2><p class="cc-tagline">Resumen del inventario demo · READ-ONLY</p></header>
      ${kpis()}
      <div class="grid-2">
        <div class="card-panel"><h4>Principales ubicaciones</h4>
          <table class="data-table"><thead><tr><th>Ubicación</th><th>Piezas</th><th>Registros</th></tr></thead><tbody>${locs
            .map((l) => `<tr><td>${esc(l.loc)}</td><td>${esc(fmtQty(l.pieces))}</td><td>${esc(l.rows)}</td></tr>`)
            .join("")}</tbody></table>
        </div>
        <div class="card-panel"><h4>Principales proyectos</h4>
          <table class="data-table"><thead><tr><th>Proyecto</th><th>Piezas</th><th>Ubicaciones</th></tr></thead><tbody>${projs
            .map((p) => `<tr><td>${esc(p.project)}</td><td>${esc(fmtQty(p.pieces))}</td><td>${esc(p.locations.size)}</td></tr>`)
            .join("")}</tbody></table>
        </div>
      </div>`;
  }

  function renderModule() {
    const m = state.module;
    if (isOperatorExperience() && state.freeScanActive && m === "tasks") return operatorFreeScanView();
    if (isOperatorExperience() && state.activeTaskId) {
      const task = state.tasks.find((t) => t.id === state.activeTaskId);
      return task ? operatorTaskFlow(task) : operatorTasksLanding();
    }
    if (isOperatorExperience() && m === "lookup") {
      return `<div class="module-screen-header"><h3>Consulta rápida</h3><p class="module-lead">SKU · ubicación · READ-ONLY · sin captura operativa</p></div>${inventoryTable(false)}`;
    }
    if (m === "control") return state.role === "CLIENT" ? clientResumen() : controlCenter();
    if (m === "inventory") return inventoryTable(true);
    if (m === "locations") {
      const locs = aggregateLocations();
      return `<div class="module-screen-header"><h3>Ubicaciones</h3></div><div class="card-panel"><table class="data-table"><thead><tr><th>Ubicación</th><th>Piezas</th><th>Registros</th><th>Proyectos</th></tr></thead><tbody>${locs
        .slice(0, 100)
        .map((l) => `<tr><td>${esc(l.loc)}</td><td>${esc(fmtQty(l.pieces))}</td><td>${esc(l.rows)}</td><td>${esc(l.projects.size)}</td></tr>`)
        .join("")}</tbody></table></div>`;
    }
    if (m === "projects") {
      const projs = aggregateProjects();
      return `<div class="module-screen-header"><h3>Proyectos</h3></div><div class="card-panel"><table class="data-table"><thead><tr><th>Proyecto</th><th>Piezas</th><th>Registros</th><th>Ubicaciones</th></tr></thead><tbody>${projs
        .map((p) => `<tr><td>${esc(p.project)}</td><td>${esc(fmtQty(p.pieces))}</td><td>${esc(p.rows)}</td><td>${esc(p.locations.size)}</td></tr>`)
        .join("")}</tbody></table></div>`;
    }
    if (m === "products") {
      const prods = aggregateProducts();
      return `<div class="module-screen-header"><h3>Productos / catálogo</h3></div><div class="card-panel"><table class="data-table"><thead><tr><th>SKU</th><th>Descripción</th><th>Piezas</th><th>Registros</th></tr></thead><tbody>${prods
        .slice(0, 100)
        .map((p) => `<tr><td>${esc(p.sku)}</td><td>${esc(p.name)}</td><td>${esc(fmtQty(p.pieces))}</td><td>${esc(p.rows)}</td></tr>`)
        .join("")}</tbody></table></div>`;
    }
    if (m === "tasks") {
      if (state.role === "SUPERVISOR" && !state.operatorMode) return supervisorOperationCenter();
      if (isOperatorExperience()) return operatorTasksLanding();
      return tasksTable(false);
    }
    if (m === "pending_supervision" && state.role === "SUPERVISOR" && !state.operatorMode) {
      return supervisorPendingSupervisionView();
    }
    if (m === "tracking") return tasksTable(false);
    if (m === "requisitions" && state.role === "SUPERVISOR" && !state.operatorMode) return seguimientoView();
    if (m === "movements") return movementsView();
    if (m === "inbound")
      return disabledModule("Recepciones", "Flujo operador: recepción esperada → escaneo → cotejo → Buffer de entrada. Sin captura manual de proyecto/pedido.");
    if (m === "relocate")
      return disabledModule("Reubicaciones", "Reutiliza flujo LOGITEC de movimiento interno: escaneo producto · origen · destino · validación.");
    if ((m === "picking" || m === "outbound") && !isOperatorExperience())
      return disabledModule(m === "picking" ? "Picking" : "Salidas", "Task-driven desde órdenes existentes. Operador escanea · LOGITEC coteja · buffer salida.");
    if (m === "requisitions") return disabledModule("Órdenes / Requisiciones", "Disponible en sistema oficial · demo muestra tareas derivadas.");
    if (m === "incidents") return disabledModule("Incidencias", "Excepciones operativas · disponible en WMS oficial.");
    if (m === "prices") return disabledModule("Precios", "Solo lectura en entorno demo.");
    if (m === "imports") return disabledModule("Importaciones", "Disponible en sistema oficial · deshabilitado en demo.");
    if (m === "users") return disabledModule("Usuarios", "Administración disponible en sistema oficial.");
    if (m === "reports" || m === "exports") return disabledModule(m === "reports" ? "Reportes" : "Exportaciones", "Exportes y reportes del WMS real · READ-ONLY en demo.");
    if (m === "config") return disabledModule("Configuración", "Reglas operativas LOGITEC · no editable en demo.");
    return controlCenter();
  }

  function expectedScanForTask(task, step) {
    const def = taskFlowSteps(task)[step];
    if (!def) return "";
    const raw =
      def.key === "destination"
        ? task.destination
        : def.key === "reference"
          ? task.reference
          : task.product;
    return String(raw || "").toUpperCase();
  }

  function normalizeScannerRawValue(rawValue) {
    const value = String(rawValue ?? "").trim();
    return value.startsWith("]C1") ? value.slice(3) : value;
  }

  function scanMatchesExpected(raw, expected) {
    const val = normalizeForClassification(raw);
    const exp = String(expected || "").trim().toUpperCase();
    return Boolean(val) && val === exp;
  }

  function playScanOkFeedback() {
    if (state.scanSuccessPlayed) return;
    state.scanSuccessPlayed = true;
    try {
      if (typeof navigator.vibrate === "function") navigator.vibrate(80);
    } catch (_e) {
      /* optional */
    }
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const start = () => {
        const now = ctx.currentTime;
        const frameCount = Math.max(1, Math.floor(ctx.sampleRate * 0.045));
        const buffer = ctx.createBuffer(1, frameCount, ctx.sampleRate);
        const samples = buffer.getChannelData(0);
        for (let i = 0; i < frameCount; i += 1) {
          samples[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / frameCount, 3);
        }
        const source = ctx.createBufferSource();
        const gain = ctx.createGain();
        source.buffer = buffer;
        gain.gain.setValueAtTime(0.22, now);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.045);
        source.connect(gain);
        gain.connect(ctx.destination);
        source.start(now);
        source.stop(now + 0.05);
      };
      if (ctx.state === "running") start();
      else ctx.resume().then(start).catch(() => {});
    } catch (_e) {
      /* optional */
    }
  }

  function unlockScanInput() {
    state.scanSuccessPlayed = false;
    state.scanInputStartedAt = null;
    state.scanProcessing = false;
  }

  async function submitOperatorScan(task) {
    const flow = state.taskFlow || { step: 0 };
    const input = document.getElementById("scanValue");
    const fb = document.getElementById("scanFeedback");
    if (!input || !fb || state.scanProcessing) return;
    const raw = String(input.value ?? "");
    const normalized = normalizeScannerRawValue(raw);
    if (!normalized) {
      fb.className = "scan-status warn";
      fb.textContent = "No leído · escanee código";
      return;
    }
    state.scanProcessing = true;
    const expected = expectedScanForTask(task, flow.step);
    if (!scanMatchesExpected(raw, expected)) {
      fb.className = "scan-status warn";
      fb.textContent = "DIFERENCIA · lectura no coincide";
      document.getElementById("scanReportDiff")?.removeAttribute("hidden");
      state.scanProcessing = false;
      return;
    }
    fb.className = "scan-status ok";
    fb.textContent = "OK · cotejo exacto";
    playScanOkFeedback();
    input.value = "";
    document.getElementById("scanReportDiff")?.setAttribute("hidden", "");
    const steps = taskFlowSteps(task);
    if (flow.step + 1 >= steps.length) {
      document.getElementById("flowResult").innerHTML = `<div class="card-panel" style="background:var(--ok-soft)">
        <strong>Tarea completada</strong><br>
        ${task.type === "receive" ? "Destino operativo: Buffer de entrada" : `Destino: ${esc(task.destination)}`}<br>
        <button type="button" class="btn-success btn-compact block-mobile" data-nav-module="tasks" style="margin-top:10px">Volver a Mis tareas</button>
        <p class="ops-message">DEMO — no registra movimiento</p>
      </div>`;
      unlockScanInput();
      return;
    }
    setTimeout(() => {
      flow.step += 1;
      state.taskFlow = flow;
      unlockScanInput();
      renderContent();
    }, 450);
  }

  function submitFreeScanReading(inputEl) {
    const input = inputEl || document.getElementById("scanValue");
    const fb = document.getElementById("scanFeedback");
    if (!input || !fb || state.scanProcessing || !state.freeScanActive) return;
    const raw = String(input.value ?? "");
    if (!String(raw).trim()) {
      fb.className = "scan-status warn";
      fb.textContent = "No leído · escanee código";
      return;
    }
    state.scanProcessing = true;
    const classified = classifyScanCodeLocal(raw);
    const session = ensureFreeScanSession();
    session.readings.push({
      at: new Date().toISOString(),
      raw: classified.raw,
      normalized: classified.normalized,
      classification: classificationDisplay(classified),
      matchLabel: matchDisplay(classified)
    });
    fb.className = "scan-status ok";
    fb.textContent = `OK · ${classificationDisplay(classified)}`;
    playScanOkFeedback();
    input.value = "";
    state.scanProcessing = false;
    state.scanSuccessPlayed = false;
    renderContent();
  }

  function syncFlowTheme() {
    const body = document.body;
    if (!body) return;
    let palette = null;
    if (isOperatorExperience() && (state.activeTaskId || state.freeScanActive)) {
      const task = state.activeTaskId ? state.tasks.find((t) => t.id === state.activeTaskId) : null;
      palette = task ? TASK_TYPE_PALETTE[task.type] || "mover" : "mover";
    } else if (NEUTRAL_BRAND_MODULES.has(state.module)) {
      palette = null;
    } else {
      palette = FLOW_PALETTE_BY_MODULE[state.module] || null;
    }
    body.removeAttribute("data-flow-neutral");
    body.removeAttribute("data-flow-palette");
    body.removeAttribute("data-flow-pos");
    if (!palette) {
      body.setAttribute("data-flow-neutral", "brand");
      return;
    }
    body.setAttribute("data-flow-palette", palette);
    body.setAttribute("data-flow-pos", FLOW_POS_BY_PALETTE[palette] || "middle");
  }

  function renderSectionTabs() {
    const bar = document.getElementById("wmsSectionBar");
    if (!bar) return;
    const cfg = navConfig();
    if (!cfg) {
      bar.innerHTML = "";
      bar.hidden = true;
      return;
    }
    bar.hidden = false;
    bar.classList.remove("hidden");
    const tabs = cfg.tabs
      .map(
        (t) =>
          `<button type="button" class="nav-section-tab${state.tab === t.id ? " active" : ""}" data-nav-tab="${esc(t.id)}">${esc(t.label)}</button>`
      )
      .join("");
    bar.innerHTML = `<div class="nav-section-tabs" aria-label="Secciones ${esc(state.role)}">${tabs}</div>`;
    bar.querySelectorAll("[data-nav-tab]").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.tab = btn.getAttribute("data-nav-tab") || state.tab;
        const first = (cfg.modules[state.tab] || [])[0];
        if (first) state.module = first.id;
        state.activeTaskId = null;
        state.taskFlow = null;
        state.freeScanActive = false;
        state.freeScanSession = null;
        render();
      });
    });
  }

  function renderSidebar() {
    if (!sidebar) return;
    const cfg = navConfig();
    if (!cfg) return;
    const panels = cfg.tabs
      .map((t) => {
        const mods = (cfg.modules[t.id] || [])
          .map((m) => {
            const active = state.module === m.id && state.tab === t.id ? " active" : "";
            const primary = m.primary ? " nav-primary" : "";
            return `<button type="button" class="module-btn${primary}${active}" data-nav-module="${esc(m.id)}" data-nav-tab-target="${esc(t.id)}">
              <span class="module-btn-label">${esc(m.label)}</span>
              <span class="module-btn-desc">${esc(m.desc)}</span>
            </button>`;
          })
          .join("");
        return `<div class="nav-section-panel${state.tab === t.id ? " active" : ""}" data-nav-panel="${esc(t.id)}">
          <p class="nav-section-hint">${esc(t.label)} · módulos de esta sección</p>${mods}</div>`;
      })
      .join("");
    sidebar.innerHTML = `<div class="nav-shell"><div class="nav-section-body">${panels}</div></div>`;
    sidebar.querySelectorAll("[data-nav-module]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const tabTarget = btn.getAttribute("data-nav-tab-target");
        if (tabTarget) state.tab = tabTarget;
        navigateModule(btn.getAttribute("data-nav-module") || state.module);
      });
    });
  }

  function wireContent() {
    app.querySelectorAll("[data-nav-module]").forEach((btn) => {
      btn.addEventListener("click", () => navigateModule(btn.getAttribute("data-nav-module") || state.module));
    });
    app.querySelectorAll("[data-enter-operator-mode]").forEach((btn) => {
      btn.addEventListener("click", () => enterSupervisorOperatorMode());
    });
    app.querySelectorAll("[data-start-task]").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.freeScanActive = false;
        state.freeScanSession = null;
        state.activeTaskId = btn.getAttribute("data-start-task");
        state.taskFlow = { step: 0 };
        unlockScanInput();
        renderContent();
      });
    });
    app.querySelectorAll("[data-start-free-scan]").forEach((btn) => {
      btn.addEventListener("click", () => startFreeScanMode());
    });
    app.querySelectorAll("[data-discard-free-scan]").forEach((btn) => {
      btn.addEventListener("click", () => discardFreeScanSession());
    });
    app.querySelectorAll("[data-send-provisional]").forEach((btn) => {
      btn.addEventListener("click", () => sendProvisionalCapture());
    });
    app.querySelectorAll("[data-provisional-status]").forEach((sel) => {
      sel.addEventListener("change", () => {
        updateProvisionalCaptureStatus(sel.getAttribute("data-provisional-status"), sel.value);
      });
    });
    document.getElementById("freeScanDeclaredAction")?.addEventListener("change", (event) => {
      const session = ensureFreeScanSession();
      session.declaredAction = event.target.value;
    });
    document.getElementById("freeScanObservation")?.addEventListener("input", (event) => {
      const session = ensureFreeScanSession();
      session.observation = event.target.value;
    });
    app.querySelectorAll("[data-cancel-task]").forEach((btn) => {
      btn.addEventListener("click", () => cancelActiveTask());
    });
    const runFilter = () => {
      state.inventoryFilter.q = document.getElementById("invQ")?.value?.trim() || "";
      state.inventoryFilter.project = document.getElementById("invProject")?.value?.trim() || "";
      state.inventoryFilter.location = document.getElementById("invLocation")?.value?.trim() || "";
      state.page = 1;
      renderContent();
    };
    document.getElementById("invFilterRun")?.addEventListener("click", runFilter);
    document.getElementById("pagePrev")?.addEventListener("click", () => {
      state.page = Math.max(1, state.page - 1);
      renderContent();
    });
    document.getElementById("pageNext")?.addEventListener("click", () => {
      state.page += 1;
      renderContent();
    });
    if (state.activeTaskId) {
      const task = state.tasks.find((t) => t.id === state.activeTaskId);
      if (!task) return;
      wireScannerInput(() => submitOperatorScan(task), "Captura manual · escriba y Enter");
      document.getElementById("scanReportDiff")?.addEventListener("click", () => {
        const fb = document.getElementById("scanFeedback");
        if (fb) {
          fb.className = "scan-status warn";
          fb.textContent = "Diferencia reportada · DEMO — supervisor notificado";
        }
      });
      return;
    }
    if (state.freeScanActive) {
      wireScannerInput((input) => submitFreeScanReading(input), "Captura manual · escriba y Enter");
    }
  }

  function renderContent() {
    if (!app) return;
    syncFlowTheme();
    app.innerHTML = renderModule();
    wireContent();
  }

  function render() {
    syncRoleViewUi();
    syncSupervisorOperatorModeUi();
    syncFlowTheme();
    syncConcentrationUi();
    renderSectionTabs();
    renderSidebar();
    renderContent();
  }

  function auditDemoNavDom() {
    const issues = [];
    const ids = [...document.querySelectorAll("[id]")].map((el) => el.id).filter(Boolean);
    const seen = new Set();
    const dupIds = [];
    ids.forEach((id) => {
      if (seen.has(id)) dupIds.push(id);
      seen.add(id);
    });
    if (dupIds.length) issues.push(`IDs duplicados: ${[...new Set(dupIds)].join(", ")}`);

    const sectionTabs = document.querySelectorAll("#wmsSectionBar .nav-section-tab");
    const horizontalBars = document.querySelectorAll("#wmsSectionBar .nav-section-tabs");
    const directorBars = document.querySelectorAll("#directorViewBar");
    const sidebars = document.querySelectorAll("#sidebar");
    const orphanFocus = document.querySelectorAll("#focusNavSlot *, #focusSubnavSlot *");

    const expectedTabs = navConfig()?.tabs?.length || 0;
    if (sectionTabs.length !== expectedTabs) {
      issues.push(`tabs horizontales: ${sectionTabs.length} (esperado ${expectedTabs})`);
    }
    if (horizontalBars.length > 1) issues.push(`barras horizontales: ${horizontalBars.length}`);
    if (directorBars.length !== 1) issues.push(`barras Director: ${directorBars.length}`);
    if (sidebars.length !== 1) issues.push(`sidebars: ${sidebars.length}`);
    if (orphanFocus.length) issues.push(`nodos huérfanos en focus slots: ${orphanFocus.length}`);

    return {
      ok: issues.length === 0,
      issues,
      counts: {
        sectionTabs: sectionTabs.length,
        horizontalBars: horizontalBars.length,
        moduleButtons: document.querySelectorAll("#sidebar .module-btn").length,
        directorBars: directorBars.length,
        sidebars: sidebars.length
      },
      state: {
        role: state.role,
        tab: state.tab,
        module: state.module,
        operatorMode: state.operatorMode,
        concentration: state.concentration,
        mobileEmulation: state.mobileEmulation
      }
    };
  }

  function runNavStressTest(cycles = 3) {
    const sequence = [
      () => applyRoleView("ADMIN"),
      () => applyConcentration(true),
      () => applyConcentration(false),
      () => applyConcentration(true),
      () => applyConcentration(false),
      () => applyRoleView("SUPERVISOR"),
      () => applyConcentration(true),
      () => applyConcentration(false),
      () => applyRoleView("OPERATOR"),
      () => applyRoleView("CLIENT"),
      () => applyRoleView("ADMIN"),
      () => applyConcentration(true),
      () => applyConcentration(false),
      () => setMobileEmulation(true),
      () => setMobileEmulation(false)
    ];
    const baseline = auditDemoNavDom();
    const runs = [{ label: "baseline", audit: baseline }];
    for (let i = 0; i < cycles; i += 1) {
      sequence.forEach((step, idx) => {
        step();
        runs.push({ label: `cycle-${i + 1}-step-${idx + 1}`, audit: auditDemoNavDom() });
      });
    }
    const failed = runs.filter((r) => !r.audit.ok);
    return { pass: failed.length === 0, baseline, failed, runs, cycles };
  }

  window.__logitecDemoNavAudit = auditDemoNavDom;
  window.__logitecDemoNavStress = runNavStressTest;

  document.querySelectorAll("#roleSwitch [data-role]").forEach((btn) => {
    btn.addEventListener("click", () => applyDirectorView(btn.getAttribute("data-role") || "OPERATOR"));
  });

  async function loadDbSource() {
    const summaryResult = await apiGet("/api/inventory/summary", true);
    if (!summaryResult.ok || !summaryResult.data || !dbHasInventory(summaryResult.data)) return false;
    const [movementsResult, stockResult] = await Promise.all([
      apiGet("/api/inventory/movements?limit=10", true),
      apiGet("/api/inventory/stock", true)
    ]);
    applyDbPayload(summaryResult.data, movementsResult.data || {}, stockResult.ok ? stockResult.data : []);
    authHint.textContent = `BD READ-ONLY · ${fmtQty(summaryResult.data.qty)} piezas`;
    return true;
  }

  async function loadExcelSource() {
    const excelResult = await apiGet("/api/demo/inventory-from-excel", true);
    if (excelResult.status === 401) throw new Error("Sesión requerida. Use login.html?next=/logitec-role-demo.html");
    const payload = excelResult.data || {};
    if (excelResult.ok && payload.source === "EXCEL_READ_ONLY") {
      applyExcelPayload(payload);
      authHint.textContent = `Fuente demo: Excel oficial · solo lectura · ${fmtQty(payload.summary?.pieces)} piezas`;
      return true;
    }
    throw new Error(`No se pudo cargar la fuente Excel. ${payload.message || ""}`);
  }

  async function boot() {
    if (appDateTime) appDateTime.textContent = new Date().toLocaleString("es-MX");
    resetDemoStartupView();
    initDirectorViewBar();
    wireConcentration();
    wireSupervisorOperatorMode();
    syncConcentrationUi();
    syncRoleViewUi();
    try {
      if (!readAccessToken()) {
        authHint.textContent = "Sesión requerida";
        app.innerHTML = `<div class="card-panel"><p><a href="/login.html?next=${encodeURIComponent("/logitec-role-demo.html")}">Iniciar sesión</a> · mismo host</p></div>`;
        renderSectionTabs();
        renderSidebar();
        return;
      }
      if (!(await loadDbSource())) await loadExcelSource();
      updateSourceUi();
      render();
    } catch (error) {
      authHint.textContent = error.message || "Error";
      app.innerHTML = `<div class="card-panel ops-message warn">${esc(error.message)}</div>`;
      renderSectionTabs();
      renderSidebar();
    }
  }

  window.fetch = new Proxy(fetch, {
    apply(target, thisArg, args) {
      const init = args[1] || {};
      const method = String(init.method || "GET").toUpperCase();
      if (String(args[0] || "").includes("/api/") && method !== "GET") {
        state.blockedWrites += 1;
        writeGuard.textContent = `Escrituras bloqueadas: ${state.blockedWrites}`;
        return Promise.reject(new Error("Demo read-only"));
      }
      return Reflect.apply(target, thisArg, args);
    }
  });

  boot();
})();
