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
    if (state.freeScanActive && state.freeScanAnchor !== moduleId) {
      state.freeScanActive = false;
      state.freeScanSession = null;
      state.freeScanAnchor = null;
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
          { id: "pre_reception", label: "Pre-recepción documental", desc: "Orden de entrada digital · motor predictivo · DEMO READ-ONLY" },
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
          { id: "pre_reception", label: "Pre-recepción documental", desc: "Orden de entrada digital · cotejo documental · DEMO READ-ONLY" },
          { id: "tracking", label: "Tareas", desc: "Trabajo asignado al piso" },
          { id: "requisitions", label: "Seguimiento", desc: "Estados · avance · diferencias" },
          { id: "picking", label: "Picking / Surtido", desc: "Órdenes de surtido de salida" },
          { id: "outbound", label: "Salidas / Despacho", desc: "Preparación y despacho" },
          { id: "incidents", label: "Incidencias", desc: "Excepciones operativas" }
        ],
        inventario: [
          { id: "inventory", label: "Existencias", desc: "Consulta de saldos autorizados" },
          { id: "locations", label: "Ubicaciones", desc: "Distribución física" },
          { id: "prices", label: "Precios", desc: "Valuación autorizada · solo lectura" }
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
        consulta: [
          { id: "lookup", label: "Consulta rápida", desc: "SKU · ubicación · READ-ONLY" },
          { id: "prices", label: "Precios", desc: "Valuación autorizada · solo lectura" }
        ]
      }
    },
    CLIENT: {
      tabs: [{ id: "inicio", label: "Inicio" }, { id: "consulta", label: "Consulta" }],
      modules: {
        inicio: [{ id: "control", label: "Resumen de inventario", desc: "Inventario autorizado de sus proyectos", primary: true }],
        consulta: [
          { id: "inventory", label: "Existencias", desc: "Stock con búsqueda integrada" },
          { id: "prices", label: "Precios", desc: "Valuación autorizada · solo lectura" },
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
    freeScanAnchor: null,
    provisionalCaptures: [],
    provisionalCaptureSeq: 0,
    demoSupervisorActorId: "SUPERVISOR_DEMO",
    demoAdminActorId: "ADMIN_DEMO",
    adminTraceFilter: "all",
    digitalEntryOrders: [],
    activeDigitalEntryOrderId: null,
    preReceptionSession: null,
    identificationCorpusEntries: []
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
      btn.textContent = state.mobileEmulation ? "VOLVER A DESKTOP" : "MODO CELULAR";
      btn.setAttribute("aria-pressed", state.mobileEmulation ? "true" : "false");
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
    state.freeScanAnchor = null;
    // Demo session only. Production provisional activity must be server-persisted and ownership-filtered.
    state.provisionalCaptures = [];
    state.provisionalCaptureSeq = 0;
    state.demoSupervisorActorId = "SUPERVISOR_DEMO";
    state.demoAdminActorId = "ADMIN_DEMO";
    state.adminTraceFilter = "all";
    state.digitalEntryOrders = [];
    state.activeDigitalEntryOrderId = null;
    state.preReceptionSession = null;
    state.identificationCorpusEntries = [];
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
    state.freeScanAnchor = null;
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

  const LOGITEC_IDENTIFICATION_DICTIONARY = [
    { kind: "SKU", label: "SKU", priority: 10, description: "Identificador comercial del producto en catálogo/stock" },
    { kind: "SAP", label: "SAP", priority: 20, description: "Material SAP registrado en existencias" },
    { kind: "PEDIDO", label: "Pedido", priority: 30, description: "Número de pedido de compra documental" },
    { kind: "PARTIDA", label: "Partida", priority: 40, description: "Posición de partida en el pedido" },
    { kind: "SERIE", label: "Serie", priority: 50, description: "Número de serie unitario cuando existe" },
    {
      kind: "UBICACIÓN",
      label: "Ubicación",
      priority: 60,
      description: "Código de ubicación física · no proyecta línea OED sin contexto adicional"
    }
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
    if (state.role === "SUPERVISOR") return "Supervisor";
    if (state.role === "OPERATOR") return "Operador";
    if (state.role === "ADMIN") return "Administrador";
    return state.role;
  }

  function demoReviewerLabel(role) {
    if (role === "ADMIN") return "Administrador";
    if (role === "SUPERVISOR") return "Supervisor";
    return role;
  }

  function currentDemoActorId() {
    // Production: actor identity must come from authenticated user id
    if (state.role === "OPERATOR") return "OPERATOR_DEMO";
    if (state.role === "SUPERVISOR") return state.demoSupervisorActorId || "SUPERVISOR_DEMO";
    if (state.role === "ADMIN") return state.demoAdminActorId || "ADMIN_DEMO";
    return null;
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
    if (isPureNumericToken(normalized)) {
      return {
        raw,
        normalized,
        classification: "SIN CLASIFICAR",
        match: null,
        reason: "Valor numérico sin contexto · no se infiere como cantidad"
      };
    }
    return { raw, normalized, classification: "SIN CLASIFICAR", match: null };
  }

  function identifyWithLogitecDictionary(rawValue) {
    const classified = classifyScanCodeLocal(rawValue);
    const dictionary =
      LOGITEC_IDENTIFICATION_DICTIONARY.find((entry) => entry.kind === classified.classification) || null;
    return { ...classified, dictionary };
  }

  const DEMO_INBOUND_DOCUMENTS = [
    {
      oedId: "OED-DEMO-PROG-001",
      documentId: "DOC-EXT-PROG",
      supplierRef: "SUP-AVIAT-PROG-DEMO",
      project: "AVIAT NETWORKS",
      note: "Documentación externa recibida · digitalización DEMO · cotejo progresivo 8 → 3 → 1",
      lines: [
        { lineId: "L-01", sku: "SKU-GRP-A", description: "Radio enlace A1", qtyExpected: 10, sap: "SAP-COMMON", pedido: "PO-PROG-8", partida: "00010", lote: "LOT-A1" },
        { lineId: "L-02", sku: "SKU-GRP-B", description: "Radio enlace B1", qtyExpected: 10, sap: "SAP-COMMON", pedido: "PO-PROG-8", partida: "00010", lote: "LOT-B1" },
        { lineId: "L-03", sku: "SKU-GRP-C", description: "Radio enlace C1", qtyExpected: 8, sap: "SAP-COMMON", pedido: "PO-PROG-8", partida: "00020", lote: "LOT-C1" },
        { lineId: "L-04", sku: "SKU-GRP-D", description: "Radio enlace D1", qtyExpected: 8, sap: "SAP-COMMON", pedido: "PO-PROG-8", partida: "00020", lote: "LOT-D1" },
        { lineId: "L-05", sku: "SKU-GRP-E", description: "Radio enlace E1", qtyExpected: 6, sap: "SAP-COMMON", pedido: "PO-PROG-8", partida: "00020", lote: "LOT-E1" },
        { lineId: "L-06", sku: "SKU-GRP-F", description: "Radio enlace F1", qtyExpected: 4, sap: "SAP-COMMON", pedido: "PO-PROG-8", partida: "00030", lote: "LOT-F1" },
        { lineId: "L-07", sku: "SKU-GRP-G", description: "Radio enlace G1", qtyExpected: 4, sap: "SAP-COMMON", pedido: "PO-PROG-8", partida: "00030", lote: "LOT-G1" },
        { lineId: "L-08", sku: "SKU-GRP-H", description: "Radio enlace H1", qtyExpected: 2, sap: "SAP-COMMON", pedido: "PO-PROG-8", partida: "00040", lote: "LOT-H1" }
      ]
    },
    {
      oedId: "OED-DEMO-002",
      documentId: "DOC-EXT-002",
      supplierRef: "SUP-BETA-2409",
      project: "PROJ-BETA",
      note: "Documentación externa · segundo embarque DEMO",
      lines: [
        { lineId: "B-01", sku: "SKU-BETA-01", description: "Componente beta 01", qtyExpected: 12, sap: "SAP-BETA-01", pedido: "PO-BETA-01", partida: "00010", lote: "LOT-B01" },
        { lineId: "B-02", sku: "SKU-BETA-02", description: "Componente beta 02", qtyExpected: 6, sap: "SAP-BETA-02", pedido: "PO-BETA-01", partida: "00020", lote: "LOT-B02" }
      ]
    },
    {
      oedId: "OED-DEMO-003",
      documentId: "DOC-EXT-003",
      supplierRef: "SUP-GAMMA-2409",
      project: "PROJ-GAMMA",
      note: "Documentación externa · tercer embarque DEMO",
      lines: [
        { lineId: "G-01", sku: "SKU-GAMMA-01", description: "Equipo gamma", qtyExpected: 3, sap: "SAP-GAMMA", pedido: "PO-GAMMA-01", partida: "00010", lote: "LOT-G01" }
      ]
    }
  ];

  function digitalizeInboundDocuments() {
    // Production: OED must represent externally issued inbound documentation; LOGITEC does not administratively generate it.
    return DEMO_INBOUND_DOCUMENTS.map((doc) => ({
      id: doc.oedId,
      documentId: doc.documentId,
      project: doc.project,
      status: "DOCUMENTAL · REPRESENTACIÓN DIGITAL EXTERNA",
      supplierRef: doc.supplierRef,
      sourceNote:
        "Digitalización de documentación externa · LOGITEC CORE WMS no genera administrativamente la Orden de Entrada",
      lines: doc.lines.map((line) => ({ ...line }))
    }));
  }

  function syncDigitalEntryOrders() {
    state.digitalEntryOrders = digitalizeInboundDocuments();
    state.identificationCorpusEntries = buildIdentificationCorpusEntries();
    if (!state.digitalEntryOrders.some((order) => order.id === state.activeDigitalEntryOrderId)) {
      state.activeDigitalEntryOrderId = state.digitalEntryOrders[0]?.id || null;
    }
    if (state.preReceptionSession && !state.digitalEntryOrders.some((order) => order.id === state.preReceptionSession.oedId)) {
      state.preReceptionSession = createEmptyPreReceptionSession(state.activeDigitalEntryOrderId);
    }
  }

  function activeDigitalEntryOrder() {
    return (state.digitalEntryOrders || []).find((order) => order.id === state.activeDigitalEntryOrderId) || null;
  }

  function findDigitalEntryOrder(oedId) {
    return (state.digitalEntryOrders || []).find((order) => order.id === oedId) || null;
  }

  function findOedLine(order, lineId) {
    return (order?.lines || []).find((line) => line.lineId === lineId) || null;
  }

  function normalizedToken(rawValue) {
    return String(normalizeForClassification(rawValue) || "").trim().toUpperCase();
  }

  function oedLineMatchesToken(line, normalized) {
    const norm = String(normalized || "").trim().toUpperCase();
    if (!norm) return false;
    return [line.sku, line.sap, line.pedido, line.partida, line.serialHint, line.lote].some(
      (value) => String(value || "").trim().toUpperCase() === norm
    );
  }

  function oedCompatibleLineIds(order, normalized) {
    if (!order || !normalized) return [];
    return (order.lines || []).filter((line) => oedLineMatchesToken(line, normalized)).map((line) => line.lineId);
  }

  const OED_DOCUMENT_CLASSIFICATION_PRIORITY = ["PEDIDO", "PARTIDA", "SKU", "SAP", "LOTE", "SERIE"];

  function oedFieldTypesMatchingLine(line, normalized) {
    const norm = String(normalized || "").trim().toUpperCase();
    if (!norm) return [];
    const types = [];
    if (String(line.pedido || "").trim().toUpperCase() === norm) types.push("PEDIDO");
    if (String(line.partida || "").trim().toUpperCase() === norm) types.push("PARTIDA");
    if (String(line.sku || "").trim().toUpperCase() === norm) types.push("SKU");
    if (String(line.sap || "").trim().toUpperCase() === norm) types.push("SAP");
    if (String(line.lote || "").trim().toUpperCase() === norm) types.push("LOTE");
    if (String(line.serialHint || "").trim().toUpperCase() === norm) types.push("SERIE");
    return types;
  }

  function oedDocumentClassificationForToken(order, normalized, lineIds) {
    if (!order || !normalized || !lineIds?.length) return null;
    const lines = lineIds.map((lineId) => findOedLine(order, lineId)).filter(Boolean);
    if (!lines.length) return null;
    let commonTypes = null;
    lines.forEach((line) => {
      const types = oedFieldTypesMatchingLine(line, normalized);
      if (!types.length) return;
      commonTypes = commonTypes === null ? types.slice() : commonTypes.filter((type) => types.includes(type));
    });
    if (commonTypes?.length === 1) return commonTypes[0];
    if (commonTypes?.length > 1) {
      return OED_DOCUMENT_CLASSIFICATION_PRIORITY.find((type) => commonTypes.includes(type)) || commonTypes[0];
    }
    return (
      OED_DOCUMENT_CLASSIFICATION_PRIORITY.find((type) =>
        lines.every((line) => oedFieldTypesMatchingLine(line, normalized).includes(type))
      ) || null
    );
  }

  function resolvePreReceptionReadingClassification(order, normalized, stockClassification) {
    const compatibleLineIds = oedCompatibleLineIds(order, normalized);
    if (!compatibleLineIds.length) return stockClassification;
    return oedDocumentClassificationForToken(order, normalized, compatibleLineIds) || stockClassification;
  }

  function corpusRowsMatchingToken(normalized) {
    const norm = String(normalized || "").trim().toUpperCase();
    if (!norm) return [];
    return (state.stock || []).filter((row) =>
      [row.product?.sku, row.sap, row.pedido, row.partida, row.serialNumber, row.location?.code].some(
        (value) => String(value || "").trim().toUpperCase() === norm
      )
    );
  }

  function isKnownInCorpus(normalized) {
    return corpusRowsMatchingToken(normalized).length > 0;
  }

  function corpusEntryStatus(rows) {
    if (!rows.length) return "DESCONOCIDA";
    const projects = new Set(rows.map((row) => String(row.project?.code || row.project?.name || "").trim()).filter(Boolean));
    if (projects.size > 1) return "AMBIGUA";
    if (rows.length > 1) return "REFERENCIA SIMPLE";
    return "REFERENCIA CONSISTENTE";
  }

  function buildIdentificationCorpusEntries() {
    // Production: identification corpus must be enforced server-side from authenticated read-only master data.
    const seen = new Set();
    const entries = [];
    (state.stock || []).forEach((row) => {
      const project = String(row.project?.code || row.project?.name || "—").trim() || "—";
      const pairs = [
        ["SKU", row.product?.sku],
        ["SAP", row.sap],
        ["PEDIDO", row.pedido],
        ["PARTIDA", row.partida],
        ["SERIE", row.serialNumber],
        ["UBICACIÓN", row.location?.code]
      ];
      pairs.forEach(([type, value]) => {
        const norm = String(value || "").trim().toUpperCase();
        if (!norm) return;
        const token = `${type}|${norm}`;
        if (seen.has(token)) return;
        seen.add(token);
        const matches = corpusRowsMatchingToken(norm);
        entries.push({
          value: norm,
          type,
          project,
          relations: matches.length,
          matches: matches.length,
          status: corpusEntryStatus(matches)
        });
      });
    });
    return entries.sort((a, b) => a.type.localeCompare(b.type) || a.value.localeCompare(b.value));
  }

  function createEmptyPreReceptionSession(oedId) {
    return {
      oedId: oedId || null,
      readings: [],
      candidateLineIds: null,
      status: "ESPERANDO",
      identifiedLineId: null
    };
  }

  function ensurePreReceptionSession(oedId) {
    if (!state.preReceptionSession || state.preReceptionSession.oedId !== oedId) {
      state.preReceptionSession = createEmptyPreReceptionSession(oedId);
    }
    return state.preReceptionSession;
  }

  function resolveProgressiveStatus(candidateLineIds) {
    if (candidateLineIds === null) return "ESPERANDO";
    if (candidateLineIds.length === 1) return "IDENTIFICADO";
    if (candidateLineIds.length > 1) return "AMBIGUO";
    return "INSUFICIENTE";
  }

  function applyPreReceptionReading(rawValue, oedId) {
    const order = findDigitalEntryOrder(oedId);
    const session = ensurePreReceptionSession(oedId);
    const identified = identifyWithLogitecDictionary(rawValue);
    const normalized = normalizedToken(rawValue);
    const candidateCountBefore = session.candidateLineIds === null ? null : session.candidateLineIds.length;
    let resultStatus = "INSUFICIENTE";
    let message = "Evidencia insuficiente para identificación documental segura";

    if (!normalized) {
      resultStatus = "INSUFICIENTE";
      message = "Token vacío · no se infiere línea OED";
    } else if (identified.classification === "UBICACIÓN") {
      resultStatus = "INSUFICIENTE";
      message = "Ubicación no vincula línea OED sin contexto adicional";
    } else {
      const compatible = oedCompatibleLineIds(order, normalized);
      const numericWithoutContext =
        isPureNumericToken(normalized) &&
        identified.classification === "SIN CLASIFICAR" &&
        !compatible.length &&
        !isKnownInCorpus(normalized);
      if (numericWithoutContext) {
        resultStatus = "INSUFICIENTE";
        message = identified.reason || "Valor numérico sin contexto · no se infiere como cantidad";
      } else if (session.candidateLineIds === null) {
        if (!compatible.length) {
          resultStatus = isKnownInCorpus(normalized) ? "CONOCIDO_NO_ESPERADO" : "DESCONOCIDO";
          message = resultStatus === "CONOCIDO_NO_ESPERADO"
            ? "Referencia conocida históricamente · no pertenece a la OED activa"
            : "Referencia desconocida en diccionario/corpus y OED";
        } else {
          session.candidateLineIds = compatible;
          resultStatus = resolveProgressiveStatus(session.candidateLineIds);
          message =
            resultStatus === "IDENTIFICADO"
              ? "IDENTIFICACIÓN INEQUÍVOCA"
              : `${compatible.length} coincidencias documentales`;
        }
      } else if (!compatible.length) {
        resultStatus = isKnownInCorpus(normalized) ? "CONOCIDO_NO_ESPERADO" : "DESCONOCIDO";
        message = resultStatus === "CONOCIDO_NO_ESPERADO"
          ? "Referencia conocida históricamente · no pertenece a la OED activa"
          : "Referencia desconocida en diccionario/corpus y OED";
      } else {
        const intersection = session.candidateLineIds.filter((lineId) => compatible.includes(lineId));
        if (!intersection.length) {
          resultStatus = "CONTRADICTORIO";
          message = "Nueva lectura incompatible con candidatos acumulados";
        } else {
          session.candidateLineIds = intersection;
          resultStatus = resolveProgressiveStatus(session.candidateLineIds);
          message =
            resultStatus === "IDENTIFICADO"
              ? "IDENTIFICACIÓN INEQUÍVOCA"
              : `${intersection.length} coincidencias documentales`;
        }
      }
    }

    const candidateCountAfter = session.candidateLineIds === null ? null : session.candidateLineIds.length;
    const displayClassification = resolvePreReceptionReadingClassification(
      order,
      normalized,
      identified.classification
    );
    session.readings.push({
      raw: identified.raw,
      normalized,
      classification: displayClassification,
      timestamp: new Date().toISOString(),
      candidateCountBefore,
      candidateCountAfter,
      resultStatus,
      message
    });
    session.status = session.candidateLineIds === null ? resultStatus : resolveProgressiveStatus(session.candidateLineIds);
    session.identifiedLineId = session.status === "IDENTIFICADO" ? session.candidateLineIds[0] : null;
    return session;
  }

  function replayPreReceptionSession(oedId, rawValues) {
    state.preReceptionSession = createEmptyPreReceptionSession(oedId);
    rawValues.forEach((raw) => applyPreReceptionReading(raw, oedId));
    return state.preReceptionSession;
  }

  function discardLastPreReceptionReading() {
    const session = state.preReceptionSession;
    if (!session?.readings.length) return;
    const raws = session.readings.slice(0, -1).map((reading) => reading.raw);
    replayPreReceptionSession(session.oedId, raws);
    renderContent();
  }

  function resetPreReceptionIdentification() {
    const oedId = state.preReceptionSession?.oedId || state.activeDigitalEntryOrderId;
    state.preReceptionSession = createEmptyPreReceptionSession(oedId);
    renderContent();
  }

  function submitPreReceptionConsultation(rawValue) {
    const trimmed = String(rawValue || "").trim();
    if (!trimmed) return;
    const oedId = state.activeDigitalEntryOrderId;
    if (!oedId) return;
    applyPreReceptionReading(trimmed, oedId);
    renderContent();
  }

  function renderPreReceptionAutocompletePanel(oedId) {
    const session = state.preReceptionSession?.oedId === oedId ? state.preReceptionSession : createEmptyPreReceptionSession(oedId);
    if (session.status !== "IDENTIFICADO" || !session.identifiedLineId) return "";
    const order = findDigitalEntryOrder(oedId);
    const identifiedLine = findOedLine(order, session.identifiedLineId);
    if (!identifiedLine) return "";
    return `<div class="card-panel pre-reception-autocomplete ok-soft">
      <h5>IDENTIFICACIÓN INEQUÍVOCA</h5>
      <p><span class="client-field-label">SKU</span> ${esc(identifiedLine.sku || "—")}</p>
      <p><span class="client-field-label">Pedido</span> ${esc(identifiedLine.pedido || "—")}</p>
      <p><span class="client-field-label">SAP</span> ${esc(identifiedLine.sap || "—")}</p>
      <p><span class="client-field-label">Lote</span> ${esc(identifiedLine.lote || "—")}</p>
      <p><span class="client-field-label">Partida</span> ${esc(identifiedLine.partida || "—")}</p>
      <p><span class="client-field-label">Descripción</span> ${esc(identifiedLine.description || "—")}</p>
      <p><span class="client-field-label">Proyecto</span> ${esc(order?.project || "—")}</p>
    </div>`;
  }

  function renderPreReceptionPredictPanel() {
    return `<div class="card-panel pre-reception-predict-panel">
      <h4>Motor predictivo documental</h4>
      <p class="module-lead">Cotejo progresivo · intersección acumulada · fail-closed POL-004</p>
      <div class="pre-reception-consult-row">
        <input id="preReceptionConsultInput" class="pre-reception-consult-input" type="text" placeholder="Escanee o escriba SKU · SAP · Pedido · Partida · Serie · Lote" autocomplete="off" />
        <button type="button" class="btn-primary btn-compact" id="preReceptionConsultRun">Cotejar documentalmente</button>
      </div>
      <p class="operational-table-meta">Primera lectura: candidatos OED · siguientes: intersección · RAW conservado</p>
    </div>`;
  }

  function renderPreReceptionOedLinesTable(lines) {
    return `<table class="data-table pre-reception-oed-lines"><thead><tr>
        <th>Línea</th><th>SKU</th><th>Descripción</th><th>Cant. esp.</th><th>SAP</th><th>Pedido</th><th>Partida</th><th>Lote</th>
      </tr></thead><tbody>${lines
        .map(
          (line) => `<tr>
            <td>${esc(line.lineId)}</td>
            <td>${esc(line.sku)}</td>
            <td>${esc(line.description)}</td>
            <td>${esc(fmtQty(line.qtyExpected))}</td>
            <td>${esc(line.sap || "—")}</td>
            <td>${esc(line.pedido || "—")}</td>
            <td>${esc(line.partida || "—")}</td>
            <td>${esc(line.lote || "—")}</td>
          </tr>`
        )
        .join("")}</tbody></table>`;
  }

  function renderPreReceptionOedSelectorPanel(active, orderOptions) {
    const lines = active?.lines || [];
    const linesBlock = lines.length
      ? `<p class="operational-table-meta pre-reception-oed-summary">${esc(String(lines.length))} líneas documentales · ${esc(
          active.project || "—"
        )} · ${esc(active.documentId || "—")}</p>
        <details class="pre-reception-expand-block">
          <summary>Ver líneas completas de la OED</summary>
          ${renderPreReceptionOedLinesTable(lines)}
        </details>`
      : `<div class="card-panel ops-message warn">Sin líneas en la OED seleccionada.</div>`;
    return `<div class="card-panel pre-reception-oed-panel">
      <h4>Orden de entrada digital</h4>
      <p class="operational-table-meta">${esc(active?.status || "Sin OED activa")} · ${esc(active?.supplierRef || "—")}</p>
      <p class="operational-table-meta pre-reception-oed-note">${esc(
        active?.sourceNote || "Documentación externa digitalizada · LOGITEC no genera administrativamente la OED"
      )}</p>
      <label class="client-field-label" for="preReceptionOedSelect">OED activa</label>
      <select id="preReceptionOedSelect" class="pre-reception-oed-select">${orderOptions}</select>
      ${linesBlock}
    </div>`;
  }

  function renderPreReceptionSessionPanel(oedId, { operator = false, includeAutocomplete = true } = {}) {
    const session = state.preReceptionSession?.oedId === oedId ? state.preReceptionSession : createEmptyPreReceptionSession(oedId);
    const candidateCount = session.candidateLineIds === null ? "—" : String(session.candidateLineIds.length);
    const readingsTable = session.readings.length
      ? `<table class="data-table pre-reception-session-readings"><thead><tr>
          <th>Hora</th><th>RAW</th><th>Clasificación</th><th>Antes</th><th>Después</th><th>Resultado</th>
        </tr></thead><tbody>${session.readings
          .slice()
          .reverse()
          .map(
            (reading) => `<tr>
              <td>${esc(new Date(reading.timestamp).toLocaleTimeString("es-MX"))}</td>
              <td><code>${esc(reading.raw)}</code></td>
              <td>${esc(reading.classification)}</td>
              <td>${esc(reading.candidateCountBefore ?? "—")}</td>
              <td>${esc(reading.candidateCountAfter ?? "—")}</td>
              <td>${esc(reading.resultStatus)} · ${esc(reading.message)}</td>
            </tr>`
          )
          .join("")}</tbody></table>`
      : `<p class="operational-table-meta">Sin lecturas en la sesión predictiva actual.</p>`;
    const autocomplete = includeAutocomplete ? renderPreReceptionAutocompletePanel(oedId) : "";
    const controls = operator
      ? `<p class="operational-table-meta">Operador ejecuta cotejo · no administra OED ni diccionario</p>`
      : `<div class="pre-reception-session-controls">
          <button type="button" class="btn-secondary btn-compact" id="preReceptionDiscardLast"${session.readings.length ? "" : " disabled"}>DESCARTAR ÚLTIMA LECTURA</button>
          <button type="button" class="btn-secondary btn-compact" id="preReceptionResetSession">REINICIAR IDENTIFICACIÓN</button>
        </div>`;
    return `<div class="card-panel pre-reception-session-panel">
      <h4>Sesión predictiva · cotejo progresivo POL-004</h4>
      <p class="operational-table-meta">Estado: <strong>${esc(session.status)}</strong> · Candidatos: <strong>${esc(candidateCount)}</strong></p>
      ${readingsTable}
      ${autocomplete}
      ${controls}
    </div>`;
  }

  function renderIdentificationDictionaryPanel() {
    return `<div class="card-panel pre-reception-dictionary-panel">
      <h4>Diccionario de identificación LOGITEC CORE WMS</h4>
      <p class="module-lead">Tipos documentales · reutiliza clasificación V14 · corpus READ-ONLY separado de la OED</p>
      <table class="data-table pre-reception-dictionary-table"><thead><tr>
        <th>Prioridad</th><th>Tipo</th><th>Descripción</th>
      </tr></thead><tbody>${LOGITEC_IDENTIFICATION_DICTIONARY.map(
        (entry) =>
          `<tr><td>${esc(entry.priority)}</td><td><strong>${esc(entry.label)}</strong></td><td>${esc(entry.description)}</td></tr>`
      ).join("")}</tbody></table>
    </div>`;
  }

  function renderIdentificationCorpusPanel({ collapsible = false } = {}) {
    const entries = state.identificationCorpusEntries || [];
    if (!entries.length) {
      return `<div class="card-panel ops-message">Corpus READ-ONLY vacío · cargue fuente demo para reconocer antecedentes históricos.</div>`;
    }
    const inner = `<div class="card-panel pre-reception-corpus-panel">
      <h4>Diccionario real DEMO · corpus READ-ONLY</h4>
      <p class="module-lead">Construido en memoria desde existencias demo · no persiste · no genera expectativa de recepción</p>
      <table class="data-table"><thead><tr>
        <th>Valor</th><th>Tipo</th><th>Proyecto</th><th>Relaciones</th><th>Coincidencias</th><th>Estado</th>
      </tr></thead><tbody>${entries
        .slice(0, 120)
        .map(
          (entry) => `<tr>
            <td><code>${esc(entry.value)}</code></td>
            <td>${esc(entry.type)}</td>
            <td>${esc(entry.project)}</td>
            <td>${esc(entry.relations)}</td>
            <td>${esc(entry.matches)}</td>
            <td>${esc(entry.status)}</td>
          </tr>`
        )
        .join("")}</tbody></table>
    </div>`;
    if (!collapsible) return inner;
    return `<details class="pre-reception-expand-block pre-reception-corpus-details">
      <summary>Ver diccionario técnico / corpus histórico</summary>
      ${inner}
    </details>`;
  }

  function preReceptionDocumentalView() {
    const orders = state.digitalEntryOrders || [];
    const active = activeDigitalEntryOrder();
    const activeOedId = active?.id || null;
    if (activeOedId && (!state.preReceptionSession || state.preReceptionSession.oedId !== activeOedId)) {
      state.preReceptionSession = createEmptyPreReceptionSession(activeOedId);
    }
    const orderOptions = orders.length
      ? orders
          .map(
            (order) =>
              `<option value="${esc(order.id)}"${order.id === active?.id ? " selected" : ""}>${esc(order.id)} · ${esc(
                order.project
              )} · ${esc(order.documentId)}</option>`
          )
          .join("")
      : `<option value="">Sin órdenes documentales demo</option>`;
    const corpusPanel = state.role === "ADMIN" ? renderIdentificationCorpusPanel({ collapsible: true }) : "";
    return `<div class="module-screen-header"><h3>Pre-recepción documental</h3>
      <p class="module-lead">Orden de entrada digital · motor predictivo progresivo · cotejo documental · DEMO READ-ONLY</p></div>
      <div class="card-panel ops-message warn pre-reception-banner">
        PRE-RECEPCIÓN DOCUMENTAL · NO REGISTRA ENTRADA FÍSICA · NO CREA MOVIMIENTO OFICIAL · NO MODIFICA INVENTARIO
      </div>
      ${renderPreReceptionOedSelectorPanel(active, orderOptions)}
      ${renderPreReceptionPredictPanel()}
      ${renderPreReceptionSessionPanel(activeOedId, { includeAutocomplete: false })}
      ${renderPreReceptionAutocompletePanel(activeOedId)}
      ${renderIdentificationDictionaryPanel()}
      ${corpusPanel}`;
  }

  function operatorOedReceptionFlow(task) {
    ensurePreReceptionSession(task.oedId);
    return `<div class="operator-handheld-shell">
      ${renderScannerWorkspace({
        mode: "task",
        meta: `${task.id} · ${task.typeLabel} · ${task.oedId}`,
        instruction: "Escanee para cotejo progresivo de la OED asignada"
      })}
      ${renderPreReceptionSessionPanel(task.oedId, { operator: true })}
      <p class="ops-message">DEMO — recepción documental · no registra movimiento · Operador no administra OED</p>
    </div>`;
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

  function freeScanRoleContext() {
    if (state.role === "ADMIN" && state.module === "control") return "admin";
    if (state.role === "SUPERVISOR" && !state.operatorMode && state.module === "tasks") return "supervisor";
    if (isOperatorExperience() && state.module === "tasks") return "operator";
    return null;
  }

  function isPhysicalFloorAction(actionId) {
    return Boolean(actionId) && actionId !== "consulta";
  }

  function lookupStockRow(classified) {
    const norm = classified?.normalized;
    if (!norm) return null;
    const stock = state.stock || [];
    switch (classified.classification) {
      case "SKU":
        return stock.find((r) => String(r.product?.sku || "").toUpperCase() === norm) || null;
      case "UBICACIÓN":
        return stock.find((r) => String(r.location?.code || "").toUpperCase() === norm) || null;
      case "SAP":
        return stock.find((r) => String(r.sap || "").toUpperCase() === norm) || null;
      case "PEDIDO":
        return stock.find((r) => String(r.pedido || "").toUpperCase() === norm) || null;
      case "PARTIDA":
        return stock.find((r) => String(r.partida || "").toUpperCase() === norm) || null;
      case "SERIE":
        return stock.find((r) => String(r.serialNumber || "").toUpperCase() === norm) || null;
      default:
        return null;
    }
  }

  function enrichReadingFromClassification(classified) {
    const row = lookupStockRow(classified);
    const isLocationScan = classified.classification === "UBICACIÓN";
    return {
      at: new Date().toISOString(),
      raw: classified.raw,
      normalized: classified.normalized,
      classification: classificationDisplay(classified),
      matchLabel: matchDisplay(classified),
      product: row?.product?.sku || null,
      productName: row?.product?.name || null,
      location: row?.location?.code || null,
      officialLocation: row?.location?.code || null,
      scannedLocation: isLocationScan ? classified.match?.value || null : null,
      project: row?.project?.code || row?.project?.name || null,
      pedido: row?.pedido || null,
      sap: row?.sap || null,
      partida: row?.partida || null
    };
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
    if (!freeScanRoleContext()) return;
    state.freeScanActive = true;
    state.freeScanAnchor = state.module;
    state.freeScanSession = {
      startedAt: new Date().toISOString(),
      readings: [],
      declaredAction: freeScanRoleContext() === "admin" ? "consulta" : "consulta",
      observation: ""
    };
    unlockScanInput();
    renderContent();
  }

  function discardFreeScanSession() {
    state.freeScanActive = false;
    state.freeScanSession = null;
    state.freeScanAnchor = null;
    unlockScanInput();
    renderContent();
  }

  function buildProvisionalCaptureFromSession(session, { validateNow = false } = {}) {
    const action = DECLARED_FLOOR_ACTIONS.find((a) => a.id === session.declaredAction) || DECLARED_FLOOR_ACTIONS[0];
    const executor = demoExecutorLabel();
    const executorActorId = currentDemoActorId();
    const now = new Date().toISOString();
    const canSelfValidateNow =
      validateNow &&
      (state.role === "SUPERVISOR" || state.role === "ADMIN") &&
      !state.operatorMode &&
      executorActorId;
    const status = validateNow ? "VALIDADO · PENDIENTE DE REGISTRO" : "PENDIENTE DE SUPERVISIÓN";
    const capture = {
      id: nextProvisionalCaptureId(),
      status,
      declaredAction: action.label,
      declaredActionId: action.id,
      executor,
      executorRole: state.role,
      executorActorId,
      executorOperatorMode: Boolean(state.operatorMode),
      reviewer: null,
      reviewerActorId: null,
      reviewType: null,
      reviewHistory: [],
      device: "Dispositivo demo",
      physicalStartedAt: session.startedAt,
      physicalEndedAt: now,
      observation: String(session.observation || "").trim(),
      readings: session.readings.map((r) => ({ ...r })),
      adminUpdatedAt: null
    };
    if (canSelfValidateNow) {
      const reviewer = demoReviewerLabel(state.role);
      const reviewType = reviewTypeForStatusChange(capture, executorActorId, state.role, status);
      capture.reviewer = reviewer;
      capture.reviewerRole = state.role;
      capture.reviewerActorId = executorActorId;
      capture.reviewType = reviewType;
      capture.adminUpdatedAt = now;
      appendReviewHistory(capture, {
        reviewer,
        reviewerRole: state.role,
        reviewerActorId: executorActorId,
        reviewType,
        status,
        at: now
      });
    }
    return capture;
  }

  function finalizeProvisionalCapture(capture) {
    state.provisionalCaptures.unshift(capture);
    state.freeScanActive = false;
    state.freeScanSession = null;
    state.freeScanAnchor = null;
    unlockScanInput();
    renderContent();
  }

  function sendProvisionalCapture() {
    const session = state.freeScanSession;
    if (!session || !session.readings.length) return;
    if (state.role === "ADMIN" && !isPhysicalFloorAction(session.declaredAction)) return;
    if (state.role === "SUPERVISOR" && !state.operatorMode && !isPhysicalFloorAction(session.declaredAction)) {
      return;
    }
    finalizeProvisionalCapture(buildProvisionalCaptureFromSession(session));
  }

  function validateProvisionalCaptureNow() {
    const session = state.freeScanSession;
    if (!session || !session.readings.length) return;
    if (state.operatorMode) return;
    if (state.role !== "SUPERVISOR" && state.role !== "ADMIN") return;
    if (!isPhysicalFloorAction(session.declaredAction)) return;
    finalizeProvisionalCapture(buildProvisionalCaptureFromSession(session, { validateNow: true }));
  }

  function ensureReviewHistory(capture) {
    if (!Array.isArray(capture.reviewHistory)) capture.reviewHistory = [];
  }

  function appendReviewHistory(capture, event) {
    ensureReviewHistory(capture);
    capture.reviewHistory.push({ ...event });
  }

  function reviewTypeForStatusChange(capture, reviewerActorId, reviewerRole, nextStatus) {
    const isSelf =
      capture.executorActorId && reviewerActorId && capture.executorActorId === reviewerActorId;
    const prefix = reviewerRole === "ADMIN" ? "Administrador" : "Supervisor";
    if (nextStatus === "VALIDADO · PENDIENTE DE REGISTRO") {
      // Production: actor identity must come from authenticated user id
      return isSelf ? `Autovalidación de ${prefix}` : `Validación de ${prefix}`;
    }
    if (nextStatus === "REQUIERE ACLARACIÓN") {
      return `Revisión de ${prefix} · requiere aclaración`;
    }
    if (nextStatus === "RECHAZADO ADMINISTRATIVAMENTE") {
      return `Rechazo administrativo de ${prefix}`;
    }
    if (nextStatus === "PENDIENTE DE SUPERVISIÓN") {
      return `Reapertura administrativa de ${prefix}`;
    }
    return null;
  }

  function supervisorReviewTypeForStatusChange(capture, reviewerActorId, nextStatus) {
    return reviewTypeForStatusChange(capture, reviewerActorId, "SUPERVISOR", nextStatus);
  }

  function canReviewProvisionalCapture() {
    if (state.operatorMode) return false;
    return state.role === "SUPERVISOR" || state.role === "ADMIN";
  }

  function updateProvisionalCaptureStatus(captureId, nextStatus) {
    const capture = state.provisionalCaptures.find((c) => c.id === captureId);
    if (!capture || !canReviewProvisionalCapture()) return;
    if (!PROVISIONAL_STATUSES.includes(nextStatus)) return;
    if (capture.status === nextStatus) return;
    const now = new Date().toISOString();
    const reviewerActorId = currentDemoActorId();
    const reviewerRole = state.role;
    const reviewer = demoReviewerLabel(reviewerRole);
    const reviewType = reviewTypeForStatusChange(capture, reviewerActorId, reviewerRole, nextStatus);
    if (!reviewType) return;
    capture.status = nextStatus;
    capture.reviewer = reviewer;
    capture.reviewerRole = reviewerRole;
    capture.reviewerActorId = reviewerActorId;
    capture.reviewType = reviewType;
    capture.adminUpdatedAt = now;
    appendReviewHistory(capture, {
      reviewer,
      reviewerRole,
      reviewerActorId,
      reviewType,
      status: nextStatus,
      at: now
    });
    renderContent();
  }

  function renderScannerWorkspace({ mode, meta, instruction }) {
    let banner;
    let help;
    if (mode === "task") {
      banner = "ESCÁNER ACTIVO · ESPERANDO LECTURA";
      help = "Use el gatillo del lector · Captura manual solo como contingencia";
    } else if (mode === "admin-consult") {
      banner = "ESCÁNER LIBRE · CONSULTA ADMINISTRATIVA · READ-ONLY";
      help = "Identificación de códigos · no modifica inventario · sin captura operativa";
    } else {
      banner = "ESCÁNER ACTIVO · MODO LIBRE CONTROLADO";
      help = "Esta captura no modifica inventario";
    }
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
            : `<button type="button" class="btn-secondary btn-compact" data-discard-free-scan>${mode === "admin-consult" ? "CERRAR CONSULTA" : "DESCARTAR CAPTURA"}</button>`
        }
        <button type="button" class="scan-manual-link" id="scanManual">Captura manual</button>
      </div>
      <div id="scanFeedback" class="scan-status idle">${mode === "task" ? "Listo para lectura" : mode === "admin-consult" ? "Consulta lista" : "Escaneo libre listo"}</div>
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
    state.freeScanActive = false;
    state.freeScanSession = null;
    state.freeScanAnchor = null;
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
    // Demo session only. Production provisional activity must be server-persisted and ownership-filtered.
    // provisionalCaptures survive role switches within the same browser session (cleared only on full page init).
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

  function syncDirectorDockSpacing() {
    const bar = document.getElementById("directorViewBar");
    const footer = document.querySelector(".demo-readonly-footer");
    if (!bar || bar.hidden) return;
    const barHeight = Math.ceil(bar.getBoundingClientRect().height || 0);
    const footerHeight = Math.ceil(footer?.getBoundingClientRect().height || 0);
    document.documentElement.style.setProperty("--director-dock-space", `${barHeight + footerHeight + 12}px`);
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
    syncDirectorDockSpacing();
    window.addEventListener("resize", syncDirectorDockSpacing, { passive: true });
    if (typeof ResizeObserver !== "undefined") {
      const dockObserver = new ResizeObserver(syncDirectorDockSpacing);
      dockObserver.observe(bar);
      const footer = document.querySelector(".demo-readonly-footer");
      if (footer) dockObserver.observe(footer);
      bar._dockObserver = dockObserver;
    }
    bar.querySelectorAll("[data-director-role]").forEach((btn) => {
      btn.addEventListener("click", () => applyDirectorView(btn.getAttribute("data-director-role") || "OPERATOR"));
    });
    bar.querySelectorAll("[data-director-mobile]").forEach((btn) => {
      btn.addEventListener("click", () => setMobileEmulation(!state.mobileEmulation));
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
    requestAnimationFrame(syncDirectorDockSpacing);
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

  function fmtMxn(v) {
    if (v == null || v === "") return "Sin valor";
    const n = Number(v);
    if (!Number.isFinite(n)) return "Sin valor";
    return new Intl.NumberFormat("es-MX", {
      style: "currency",
      currency: "MXN",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(n);
  }

  function normalizedRowValuation(row) {
    const qty = Math.max(0, Number(row?.qty) || 0);
    const valuation = row?.valuation || null;
    if (!valuation) {
      return {
        qtyTotal: qty,
        qtyValued: 0,
        qtyUnvalued: qty,
        totalValueMxn: 0,
        avgUnitPriceMxn: null,
        minUnitPriceMxn: null,
        maxUnitPriceMxn: null,
        hasMixedUnitPrices: false,
        status: qty > 0 ? "NONE" : "COMPLETE"
      };
    }
    const qtyTotal = Math.max(0, Number(valuation.qtyTotal ?? qty) || 0);
    const qtyValued = Math.max(0, Number(valuation.qtyValued) || 0);
    const qtyUnvalued = Math.max(0, Number(valuation.qtyUnvalued) || 0);
    return {
      qtyTotal,
      qtyValued,
      qtyUnvalued,
      totalValueMxn: Number(valuation.totalValueMxn) || 0,
      avgUnitPriceMxn: valuation.avgUnitPriceMxn ?? null,
      minUnitPriceMxn: valuation.minUnitPriceMxn ?? null,
      maxUnitPriceMxn: valuation.maxUnitPriceMxn ?? null,
      hasMixedUnitPrices: !!valuation.hasMixedUnitPrices,
      status: String(valuation.status || (qtyUnvalued > 0 ? "PARTIAL" : "COMPLETE")).toUpperCase()
    };
  }

  function aggregateValuation(rows) {
    const totals = (rows || []).reduce(
      (acc, row) => {
        const valuation = normalizedRowValuation(row);
        acc.qtyTotal += valuation.qtyTotal;
        acc.qtyValued += valuation.qtyValued;
        acc.qtyUnvalued += valuation.qtyUnvalued;
        acc.valueCents += Math.round(valuation.totalValueMxn * 100);
        return acc;
      },
      { qtyTotal: 0, qtyValued: 0, qtyUnvalued: 0, valueCents: 0 }
    );
    return {
      ...totals,
      totalValueMxn: totals.valueCents / 100,
      coveragePct: totals.qtyTotal > 0 ? ((totals.qtyValued / totals.qtyTotal) * 100).toFixed(2) : "0.00"
    };
  }

  function valuationUnitLabel(valuation) {
    if (valuation.avgUnitPriceMxn == null || valuation.avgUnitPriceMxn === "") return "Sin valor";
    if (
      valuation.hasMixedUnitPrices &&
      valuation.minUnitPriceMxn != null &&
      valuation.maxUnitPriceMxn != null
    ) {
      return `${fmtMxn(valuation.minUnitPriceMxn)} – ${fmtMxn(valuation.maxUnitPriceMxn)}`;
    }
    return fmtMxn(valuation.avgUnitPriceMxn);
  }

  function valuationStatusLabel(status) {
    if (status === "COMPLETE") return "Completo";
    if (status === "PARTIAL") return "Parcial";
    return "Sin valor";
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
        id: "T-OED-1047",
        type: "receive",
        typeLabel: "Recepción · cotejo OED",
        reference: "OED-DEMO-PROG-001",
        oedId: "OED-DEMO-PROG-001",
        project: "AVIAT NETWORKS",
        product: "Cotejo progresivo documental",
        description: "Pre-recepción POL-004 · escaneo acumulado",
        qty: 8,
        origin: "Documentación externa digitalizada",
        destination: "Buffer de entrada",
        priority: "Alta",
        status: "pending",
        operator: null
      },
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
    syncDigitalEntryOrders();
  }

  function applyDbPayload(summary, movementsPayload, stock) {
    state.dataSource = "DB";
    state.excelItems = [];
    state.summary = summary;
    state.movements = movementsPayload?.items || [];
    state.stock = stock || [];
    state.tasks = buildTasks();
    syncDigitalEntryOrders();
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
    if (task.oedId) return operatorOedReceptionFlow(task);
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

  function renderFreeScanReadingsTable(session, ctx) {
    const rows = session.readings
      .slice()
      .reverse()
      .map((r) => {
        if (ctx === "admin") {
          return `<tr>
            <td>${esc(new Date(r.at).toLocaleTimeString("es-MX"))}</td>
            <td><code>${esc(r.raw)}</code></td>
            <td>${esc(r.classification)}</td>
            <td>${esc(r.matchLabel || "—")}</td>
            <td>${esc(r.productName || r.product || "—")}</td>
            <td>${esc(r.location || "—")}</td>
            <td>${esc(r.project || "—")}</td>
          </tr>`;
        }
        return `<tr>
          <td>${esc(new Date(r.at).toLocaleTimeString("es-MX"))}</td>
          <td><code>${esc(r.raw)}</code></td>
          <td>${esc(r.classification)}</td>
          <td>${esc(r.matchLabel || "—")}</td>
        </tr>`;
      })
      .join("");
    if (ctx === "admin") {
      return session.readings.length
        ? `<div class="free-scan-readings-wrap"><table class="data-table free-scan-readings"><thead><tr>
            <th>Hora</th><th>RAW</th><th>Clasificación</th><th>Coincidencia</th><th>Producto</th><th>Ubicación</th><th>Proyecto</th>
          </tr></thead><tbody>${rows}</tbody></table></div>`
        : `<p class="operational-table-meta">Escanee códigos · identificación READ-ONLY · sesión en memoria.</p>`;
    }
    return session.readings.length
      ? `<div class="free-scan-readings-wrap"><table class="data-table free-scan-readings"><thead><tr>
          <th>Hora</th><th>RAW</th><th>Clasificación</th><th>Coincidencia</th>
        </tr></thead><tbody>${rows}</tbody></table></div>`
      : `<p class="operational-table-meta">Escanee códigos · la evidencia RAW se conserva sin modificar inventario.</p>`;
  }

  function renderFreeScanActionsPanel(session, ctx) {
    const actionOptions = DECLARED_FLOOR_ACTIONS.map(
      (a) =>
        `<option value="${esc(a.id)}"${session.declaredAction === a.id ? " selected" : ""}>${esc(a.label)}</option>`
    ).join("");
    const hasReadings = session.readings.length > 0;
    const physical = isPhysicalFloorAction(session.declaredAction);
    if (ctx === "admin") {
      if (!physical) {
        return `<div class="card-panel free-scan-actions-panel">
          <div class="free-scan-declare-grid">
            <label class="field compact-field"><span>Acción declarada</span>
              <select id="freeScanDeclaredAction">${actionOptions}</select>
            </label>
          </div>
          <p class="operational-table-meta">Modo consulta · identificación READ-ONLY · no genera captura operativa.</p>
        </div>`;
      }
      return `<div class="card-panel free-scan-actions-panel">
        <div class="free-scan-declare-grid">
          <label class="field compact-field"><span>Acción declarada</span>
            <select id="freeScanDeclaredAction">${actionOptions}</select>
          </label>
          <label class="field compact-field field-grow"><span>Observación (opcional)</span>
            <input id="freeScanObservation" type="text" value="${esc(session.observation)}" placeholder="Contexto administrativo · contingencia" />
          </label>
        </div>
        <div class="free-scan-submit-row">
          <button type="button" class="btn-primary btn-compact" data-send-provisional${hasReadings ? "" : " disabled"}>GUARDAR PENDIENTE</button>
          <button type="button" class="btn-success btn-compact" data-validate-provisional-now${hasReadings ? "" : " disabled"}>VALIDAR AHORA</button>
          <button type="button" class="btn-secondary btn-compact" data-discard-free-scan>DESCARTAR CAPTURA</button>
        </div>
        <p class="operational-table-meta">VALIDAR AHORA · DEMO READ-ONLY · validación administrativa · no registra movimiento oficial</p>
      </div>`;
    }
    if (ctx === "supervisor" && !physical) {
      return `<div class="card-panel free-scan-actions-panel">
        <div class="free-scan-declare-grid">
          <label class="field compact-field"><span>Acción declarada</span>
            <select id="freeScanDeclaredAction">${actionOptions}</select>
          </label>
        </div>
        <p class="operational-table-meta">Modo consulta · identifique etiquetas sin generar captura operativa.</p>
      </div>`;
    }
    const operatorSend =
      ctx === "operator"
        ? `<button type="button" class="btn-primary btn-compact" data-send-provisional${hasReadings ? "" : " disabled"}>ENVIAR A SUPERVISIÓN</button>`
        : "";
    const supervisorSend = ctx === "supervisor"
      ? `<button type="button" class="btn-primary btn-compact" data-send-provisional${hasReadings ? "" : " disabled"}>ENVIAR A PENDIENTES</button>
         <button type="button" class="btn-success btn-compact" data-validate-provisional-now${hasReadings ? "" : " disabled"}>VALIDAR AHORA</button>`
      : "";
    return `<div class="card-panel free-scan-actions-panel">
      <div class="free-scan-declare-grid">
        <label class="field compact-field"><span>Acción declarada</span>
          <select id="freeScanDeclaredAction">${actionOptions}</select>
        </label>
        <label class="field compact-field field-grow"><span>Observación (opcional)</span>
          <input id="freeScanObservation" type="text" value="${esc(session.observation)}" placeholder="Contexto de piso · contingencia" />
        </label>
      </div>
      <div class="free-scan-submit-row">
        ${operatorSend}${supervisorSend}
        <button type="button" class="btn-secondary btn-compact" data-discard-free-scan>DESCARTAR CAPTURA</button>
      </div>
      ${
        ctx === "supervisor"
          ? `<p class="operational-table-meta">VALIDAR AHORA · DEMO READ-ONLY · no modifica inventario</p>`
          : ""
      }
    </div>`;
  }

  function roleFreeScanView() {
    const ctx = freeScanRoleContext();
    const session = ensureFreeScanSession();
    const adminConsult = ctx === "admin" && !isPhysicalFloorAction(session.declaredAction);
    const scannerMode = adminConsult ? "admin-consult" : "free";
    const footer = adminConsult
      ? `<p class="ops-message">DEMO READ-ONLY · consulta administrativa · no modifica inventario</p>`
      : ctx === "admin"
        ? `<p class="ops-message">DEMO READ-ONLY · captura provisional en memoria · validación administrativa · no registra movimiento oficial</p>`
        : `<p class="ops-message">DEMO READ-ONLY · captura provisional en memoria · no modifica inventario</p>`;
    return `<div class="operator-handheld-shell free-scan-shell">
      ${renderScannerWorkspace({ mode: scannerMode })}
      <div class="card-panel free-scan-evidence">
        <h4>${adminConsult ? "Identificaciones de sesión" : `Lecturas acumuladas (${esc(session.readings.length)})`}</h4>
        ${renderFreeScanReadingsTable(session, ctx)}
      </div>
      ${renderFreeScanActionsPanel(session, ctx)}
      ${footer}
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
            const executorCell =
              c.reviewType === "Autovalidación de Supervisor"
                ? `<strong>${esc(c.executor)}</strong><br><span class="badge review self-validated-badge">Ejecutado y validado por el mismo Supervisor</span>`
                : `<strong>${esc(c.executor)}</strong>`;
            return `<tr>
              <td><strong>${esc(c.id)}</strong></td>
              <td>${esc(c.declaredAction)}</td>
              <td>${executorCell}</td>
              <td>${esc(c.reviewer || "—")}</td>
              <td>${esc(c.reviewType || "—")}</td>
              <td>${esc(new Date(c.physicalStartedAt).toLocaleString("es-MX"))}</td>
              <td>${esc(c.readings.length)}</td>
              <td><ul class="provisional-evidence-list">${evidence}</ul></td>
              <td><select class="provisional-status-select" data-provisional-status="${esc(c.id)}">${statusOptions}</select></td>
            </tr>`;
          })
          .join("")
      : `<tr><td colspan="9">Sin capturas provisionales en esta sesión DEMO.</td></tr>`;
    return `<div class="module-screen-header"><h3>Pendientes de supervisión</h3>
      <p class="module-lead">Capturas provisionales de piso · revisión local DEMO · evidencia RAW conservada</p></div>
      <div class="card-panel ops-message warn">DEMO READ-ONLY · la validación no modifica inventario</div>
      <div class="card-panel"><table class="data-table provisional-captures-table"><thead><tr>
        <th>ID</th><th>Acción</th><th>Ejecutor</th><th>Revisor</th><th>Revisión</th><th>Hora física</th><th>Lecturas</th><th>Evidencia RAW</th><th>Estado</th>
      </tr></thead><tbody>${table}</tbody></table></div>`;
  }

  function movementsView() {
    if (state.role === "CLIENT") return clientMovementsView();
    if (state.role === "ADMIN") return adminMovementsView();
    if (state.role === "SUPERVISOR") return supervisorMovementsView();
    if (state.dataSource === "EXCEL" || !state.movements.length) {
      return `<div class="module-screen-header"><h3>Movimientos / Trazabilidad</h3><p class="module-lead">Consulta de historial físico</p></div>
        <div class="card-panel ops-message warn">La fuente Excel no contiene historial de movimientos.</div>`;
    }
    return `<div class="module-screen-header"><h3>Movimientos / Trazabilidad</h3></div><div class="card-panel"><table class="data-table">...</table></div>`;
  }

  function adminCaptureProjectDisplay(capture) {
    const resolved = deriveCaptureProjectLabel(capture);
    if (resolved) return resolved;
    const labels = new Set();
    (capture.readings || []).forEach((reading) => {
      const readingProject = deriveReadingProjectLabel(reading);
      if (readingProject) labels.add(readingProject);
      stockRowsMatchingReading(reading).forEach((row) => {
        labels.add(projectLabelFromStockRow(row) || "Sin proyecto");
      });
    });
    if (labels.size === 1) return [...labels][0];
    if (labels.size > 1) return `Ambiguo · ${[...labels].join(" · ")}`;
    return "Sin proyecto identificable";
  }

  function captureReadingMetadataSummary(capture) {
    const sku = new Set();
    const sap = new Set();
    const pedido = new Set();
    const partida = new Set();
    const serie = new Set();
    (capture.readings || []).forEach((reading) => {
      if (reading.product) sku.add(String(reading.product));
      if (reading.sap) sap.add(String(reading.sap));
      if (reading.pedido) pedido.add(String(reading.pedido));
      if (reading.partida) partida.add(String(reading.partida));
      if (String(reading.classification || "").toUpperCase().startsWith("SERIE")) {
        serie.add(String(reading.normalized || reading.raw || ""));
      }
    });
    return {
      sku: sku.size ? [...sku].join(" · ") : "—",
      sap: sap.size ? [...sap].join(" · ") : "—",
      pedido: pedido.size ? [...pedido].join(" · ") : "—",
      partida: partida.size ? [...partida].join(" · ") : "—",
      serie: serie.size ? [...serie].join(" · ") : "—"
    };
  }

  function renderReviewHistoryList(capture) {
    ensureReviewHistory(capture);
    if (!capture.reviewHistory.length) return `<p class="operational-table-meta">Sin revisiones administrativas registradas.</p>`;
    return `<ol class="review-history-list">${capture.reviewHistory
      .map(
        (event) =>
          `<li>${esc(new Date(event.at).toLocaleString("es-MX"))} · ${esc(event.reviewer)} · ${esc(
            event.reviewType
          )} · ${esc(event.status)}</li>`
      )
      .join("")}</ol>`;
  }

  function renderDualTraceFilterBar(currentFilter) {
    const filterButtons = ["all", "official", "physical"]
      .map(
        (id) =>
          `<button type="button" class="btn-secondary btn-compact admin-trace-filter-btn${
            currentFilter === id ? " active" : ""
          }" data-admin-trace-filter="${esc(id)}">${
            id === "all" ? "TODO" : id === "official" ? "OFICIAL" : "FÍSICA REPORTADA"
          }</button>`
      )
      .join("");
    return `<div class="card-panel admin-trace-filter-bar dual-trace-filter-bar">
      <span class="client-field-label">Mostrar</span>
      <div class="admin-trace-filter-buttons">${filterButtons}</div>
    </div>`;
  }

  function renderProvisionalReviewControls(
    capture,
    {
      controlLabel = "Resolver captura",
      controlMeta = "Autoridad operativa · validación ≠ registro oficial · misma captura en Pendientes de supervisión"
    } = {}
  ) {
    if (!canReviewProvisionalCapture()) return "";
    const statusOptions = PROVISIONAL_STATUSES.map(
      (s) => `<option value="${esc(s)}"${capture.status === s ? " selected" : ""}>${esc(s)}</option>`
    ).join("");
    return `<div class="admin-provisional-review-controls provisional-review-controls">
      <span class="client-field-label">${esc(controlLabel)}</span>
      <select class="provisional-status-select" data-provisional-status="${esc(capture.id)}">${statusOptions}</select>
      <p class="operational-table-meta">${esc(controlMeta)}</p>
    </div>`;
  }

  function renderProvisionalCaptureCard(
    capture,
    {
      reviewControlLabel,
      reviewControlMeta
    } = {}
  ) {
    const meta = captureReadingMetadataSummary(capture);
    const physicalLocation = clientCapturePhysicalLocation(capture);
    const officialLocation = clientCaptureOfficialLocation(capture);
    const locationBlock =
      physicalLocation && officialLocation && physicalLocation !== officialLocation
        ? `<p><span class="client-field-label">Ubicación física reportada</span> ${esc(physicalLocation)}</p>
           <p><span class="client-field-label">Ubicación oficial</span> ${esc(officialLocation)}</p>`
        : physicalLocation
          ? `<p><span class="client-field-label">Ubicación física reportada</span> ${esc(physicalLocation)}</p>`
          : officialLocation
            ? `<p><span class="client-field-label">Ubicación oficial</span> ${esc(officialLocation)}</p>`
            : "";
    return `<article class="admin-provisional-card client-provisional-card">
      <header class="client-provisional-card-head">
        <strong>${esc(capture.id)}</strong>
        <span class="badge client-provisional-badge">${esc(capture.status)}</span>
      </header>
      <p class="client-pol002-disclaimer">REALIDAD FÍSICA REPORTADA · NO CONSTITUYE MOVIMIENTO OFICIAL</p>
      <div class="admin-provisional-meta-grid">
        <p><span class="client-field-label">Acción</span> ${esc(capture.declaredAction)}</p>
        <p><span class="client-field-label">Proyecto</span> ${esc(adminCaptureProjectDisplay(capture))}</p>
        <p><span class="client-field-label">Ejecutor</span> ${esc(capture.executor)} · ${esc(capture.executorRole)}</p>
        <p><span class="client-field-label">Hora física</span> ${esc(
          new Date(capture.physicalStartedAt).toLocaleString("es-MX")
        )} → ${esc(new Date(capture.physicalEndedAt).toLocaleString("es-MX"))}</p>
        <p><span class="client-field-label">SKU</span> ${esc(meta.sku)}</p>
        <p><span class="client-field-label">SAP</span> ${esc(meta.sap)}</p>
        <p><span class="client-field-label">Pedido</span> ${esc(meta.pedido)}</p>
        <p><span class="client-field-label">Partida</span> ${esc(meta.partida)}</p>
        <p><span class="client-field-label">Serie</span> ${esc(meta.serie)}</p>
        ${locationBlock}
        <p><span class="client-field-label">Último revisor</span> ${esc(capture.reviewer || "—")}</p>
        <p><span class="client-field-label">Tipo de revisión</span> ${esc(capture.reviewType || "—")}</p>
        <p><span class="client-field-label">Hora administrativa</span> ${
          capture.adminUpdatedAt ? esc(new Date(capture.adminUpdatedAt).toLocaleString("es-MX")) : "—"
        }</p>
      </div>
      <div class="client-reading-block">
        <span class="client-field-label">RAW / evidencia</span>
        ${renderClientReadingEvidence(capture.readings)}
      </div>
      <div class="review-history-block">
        <span class="client-field-label">Historial de revisiones</span>
        ${renderReviewHistoryList(capture)}
      </div>
      ${renderProvisionalReviewControls(capture, {
        controlLabel: reviewControlLabel,
        controlMeta: reviewControlMeta
      })}
    </article>`;
  }

  function renderAdminProvisionalCaptureCard(capture) {
    return renderProvisionalCaptureCard(capture, {
      reviewControlLabel: "Resolver administrativamente",
      reviewControlMeta:
        "PENDIENTE DE SUPERVISIÓN · resoluble por Supervisor o Administrador · validación ≠ registro oficial"
    });
  }

  function renderSupervisorProvisionalCaptureCard(capture) {
    return renderProvisionalCaptureCard(capture, {
      reviewControlLabel: "Resolver captura",
      reviewControlMeta:
        "Autoridad operativa Supervisor · validación ≠ registro oficial · misma captura que Pendientes de supervisión"
    });
  }

  function renderAdminOfficialTraceBlock() {
    if (state.dataSource === "EXCEL" || !state.movements.length) {
      return `<div class="card-panel ops-message warn">La fuente Excel no contiene historial de movimientos oficiales.</div>`;
    }
    return `<div class="card-panel"><table class="data-table"><thead><tr>
        <th>Fecha</th><th>Tipo</th><th>Referencia</th><th>Producto</th><th>Cant.</th>
      </tr></thead><tbody>${state.movements
        .slice(0, 50)
        .map(
          (m) => `<tr>
            <td>${esc(m.date || m.createdAt || "—")}</td>
            <td>${esc(m.type || "—")}</td>
            <td>${esc(m.reference || "—")}</td>
            <td>${esc(m.product || m.sku || "—")}</td>
            <td>${esc(fmtQty(m.qty))}</td>
          </tr>`
        )
        .join("")}</tbody></table></div>`;
  }

  function supervisorMovementsView() {
    const filter = state.adminTraceFilter || "all";
    const captures = state.provisionalCaptures;
    const showOfficial = filter === "all" || filter === "official";
    const showPhysical = filter === "all" || filter === "physical";
    const physicalBlock = showPhysical
      ? `<div class="module-screen-header supervisor-physical-trace-header"><h4>Realidad física reportada</h4>
          <p class="module-lead">Capturas provisionales operativas · consulta transversal · no constituye movimiento oficial</p></div>
        ${
          captures.length
            ? `<div class="client-provisional-cards">${captures
                .map((capture) => renderSupervisorProvisionalCaptureCard(capture))
                .join("")}</div>`
            : `<div class="card-panel ops-message">Sin capturas provisionales en esta sesión DEMO.</div>`
        }`
      : "";
    const officialBlock = showOfficial
      ? `<div class="module-screen-header supervisor-official-trace-header"><h4>Trazabilidad oficial</h4>
          <p class="module-lead">Movimientos registrados oficialmente cuando la fuente los contenga · rol interno LOGITEC</p></div>
        ${renderAdminOfficialTraceBlock()}`
      : "";
    return `<div class="module-screen-header"><h3>Movimientos / Trazabilidad</h3>
      <p class="module-lead">Consulta transversal · trazabilidad dual · autoridad operativa Supervisor · DEMO READ-ONLY</p></div>
      <div class="card-panel ops-message warn">DEMO READ-ONLY · la validación no modifica inventario</div>
      ${renderDualTraceFilterBar(filter)}
      ${physicalBlock}
      ${officialBlock}`;
  }

  function adminMovementsView() {
    const filter = state.adminTraceFilter || "all";
    const captures = state.provisionalCaptures;
    const showOfficial = filter === "all" || filter === "official";
    const showPhysical = filter === "all" || filter === "physical";
    const physicalBlock = showPhysical
      ? `<div class="module-screen-header admin-physical-trace-header"><h4>Realidad física reportada</h4>
          <p class="module-lead">Alcance global · incluye ambiguas · FREE_TO_SALE · Sin proyecto · no constituye movimiento oficial</p></div>
        ${
          captures.length
            ? `<div class="client-provisional-cards">${captures
                .map((capture) => renderAdminProvisionalCaptureCard(capture))
                .join("")}</div>`
            : `<div class="card-panel ops-message">Sin capturas provisionales en esta sesión DEMO.</div>`
        }`
      : "";
    const officialBlock = showOfficial
      ? `<div class="module-screen-header admin-official-trace-header"><h4>Trazabilidad oficial</h4>
          <p class="module-lead">Movimientos registrados oficialmente cuando la fuente los contenga</p></div>
        ${renderAdminOfficialTraceBlock()}`
      : "";
    return `<div class="module-screen-header"><h3>Movimientos / Trazabilidad</h3>
      <p class="module-lead">Centro administrativo superior · trazabilidad dual · validación jerárquica · DEMO READ-ONLY</p></div>
      ${renderDualTraceFilterBar(filter)}
      ${physicalBlock}
      ${officialBlock}`;
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
      <div class="card-panel operator-free-scan-entry">
        <p class="operational-table-meta">Scanner transversal · identifique o capture desde supervisión directa</p>
        <button type="button" class="btn-secondary btn-compact" data-start-free-scan>ESCANEO LIBRE</button>
      </div>
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

  function isAuthorizedClientProject(projectLabel) {
    const p = String(projectLabel || "").trim();
    if (!p) return false;
    if (/^sin proyecto$/i.test(p)) return false;
    if (/^free[_\s-]*to[_\s-]*sale$/i.test(p)) return false;
    return true;
  }

  function clientAuthorizedProjectSet() {
    // Production: client ownership must be enforced server-side from authenticated client scope.
    const set = new Set();
    state.stock.forEach((r) => {
      const p = String(r.project?.code || r.project?.name || "").trim();
      if (isAuthorizedClientProject(p)) set.add(p);
    });
    return set;
  }

  function readingClassificationKind(reading) {
    const cls = String(reading?.classification || "").trim().toUpperCase();
    if (cls.startsWith("UBICACIÓN") || cls.startsWith("UBICACION")) return "UBICACIÓN";
    if (cls.startsWith("SKU")) return "SKU";
    if (cls.startsWith("SAP")) return "SAP";
    if (cls.startsWith("PEDIDO")) return "PEDIDO";
    if (cls.startsWith("PARTIDA")) return "PARTIDA";
    if (cls.startsWith("SERIE")) return "SERIE";
    return null;
  }

  function stockRowsMatchingReading(reading) {
    const kind = readingClassificationKind(reading);
    const norm = String(reading?.normalized || normalizeScannerRawValue(reading?.raw) || "")
      .trim()
      .toUpperCase();
    if (!norm || !kind || kind === "UBICACIÓN") return [];
    const stock = state.stock || [];
    switch (kind) {
      case "SKU":
        return stock.filter((r) => String(r.product?.sku || "").toUpperCase() === norm);
      case "SAP":
        return stock.filter((r) => String(r.sap || "").toUpperCase() === norm);
      case "PEDIDO":
        return stock.filter((r) => String(r.pedido || "").toUpperCase() === norm);
      case "PARTIDA":
        return stock.filter((r) => String(r.partida || "").toUpperCase() === norm);
      case "SERIE":
        return stock.filter((r) => String(r.serialNumber || "").toUpperCase() === norm);
      default:
        return [];
    }
  }

  function projectLabelFromStockRow(row) {
    return String(row?.project?.code || row?.project?.name || "").trim();
  }

  function authorizedProjectsFromStockRows(rows) {
    if (!rows.length) return new Set();
    const projects = new Set();
    rows.forEach((row) => {
      projects.add(projectLabelFromStockRow(row));
    });
    for (const project of projects) {
      if (!isAuthorizedClientProject(project)) return new Set();
    }
    return projects;
  }

  function deriveReadingProjectLabel(reading) {
    if (readingClassificationKind(reading) === "UBICACIÓN") return null;
    const projects = authorizedProjectsFromStockRows(stockRowsMatchingReading(reading));
    if (projects.size === 1) return [...projects][0];
    return null;
  }

  function officialLocationsFromStockRows(rows) {
    const locations = new Set();
    rows.forEach((row) => {
      const code = String(row?.location?.code || "").trim();
      if (code) locations.add(code);
    });
    return locations;
  }

  function deriveCaptureProjectLabel(capture) {
    const projects = new Set();
    (capture.readings || []).forEach((reading) => {
      const project = deriveReadingProjectLabel(reading);
      if (project) projects.add(project);
    });
    if (projects.size === 1) return [...projects][0];
    return null;
  }

  function deriveReadingOfficialLocation(reading) {
    if (readingClassificationKind(reading) === "UBICACIÓN") return null;
    const locations = officialLocationsFromStockRows(stockRowsMatchingReading(reading));
    if (locations.size === 1) return [...locations][0];
    return null;
  }

  function clientVisibleProvisionalCaptures() {
    const authorized = clientAuthorizedProjectSet();
    return state.provisionalCaptures.filter((capture) => {
      const project = deriveCaptureProjectLabel(capture);
      return Boolean(project && authorized.has(project));
    });
  }

  function movementResolutionKeys(movement) {
    return {
      project: String(movement?.project || movement?.projectCode || "").trim(),
      sku: String(movement?.sku || movement?.product || "").trim().toUpperCase(),
      reference: String(movement?.reference || "").trim().toUpperCase(),
      sap: String(movement?.sap || "").trim().toUpperCase(),
      pedido: String(movement?.pedido || "").trim().toUpperCase(),
      partida: String(movement?.partida || "").trim().toUpperCase()
    };
  }

  function stockRowsMatchingMovement(movement) {
    const keys = movementResolutionKeys(movement);
    const stock = state.stock || [];
    const hits = [];
    const seen = new Set();
    const add = (row) => {
      const token = `${row.product?.sku}|${row.location?.code}|${projectLabelFromStockRow(row)}`;
      if (seen.has(token)) return;
      seen.add(token);
      hits.push(row);
    };
    if (keys.sku) stock.filter((r) => String(r.product?.sku || "").toUpperCase() === keys.sku).forEach(add);
    if (keys.sap) stock.filter((r) => String(r.sap || "").toUpperCase() === keys.sap).forEach(add);
    if (keys.pedido) stock.filter((r) => String(r.pedido || "").toUpperCase() === keys.pedido).forEach(add);
    if (keys.partida) stock.filter((r) => String(r.partida || "").toUpperCase() === keys.partida).forEach(add);
    if (keys.reference) {
      stock.filter((r) => String(r.pedido || "").toUpperCase() === keys.reference).forEach(add);
      stock.filter((r) => String(r.sap || "").toUpperCase() === keys.reference).forEach(add);
      stock.filter((r) => String(r.partida || "").toUpperCase() === keys.reference).forEach(add);
      stock.filter((r) => String(r.product?.sku || "").toUpperCase() === keys.reference).forEach(add);
    }
    return hits;
  }

  function deriveMovementClientProject(movement) {
    const keys = movementResolutionKeys(movement);
    const rows = stockRowsMatchingMovement(movement);
    const projects = new Set();
    if (keys.project) projects.add(keys.project);
    rows.forEach((row) => projects.add(projectLabelFromStockRow(row)));
    if (!projects.size) return null;
    for (const project of projects) {
      if (!isAuthorizedClientProject(project)) return null;
    }
    if (projects.size !== 1) return null;
    const project = [...projects][0];
    if (!clientAuthorizedProjectSet().has(project)) return null;
    return project;
  }

  function clientVisibleOfficialMovements() {
    // Production: official movement ownership must be enforced server-side from authenticated client scope.
    return (state.movements || []).filter((movement) => deriveMovementClientProject(movement) !== null);
  }

  function renderClientOfficialMovementsTable(movements) {
    if (!movements.length) {
      return `<div class="card-panel ops-message warn">Sin movimientos oficiales autorizados inequívocamente para sus proyectos en esta fuente.</div>`;
    }
    return `<div class="card-panel"><table class="data-table"><thead><tr>
        <th>Fecha</th><th>Tipo</th><th>Referencia</th><th>Producto</th><th>Cant.</th>
      </tr></thead><tbody>${movements
        .slice(0, 50)
        .map(
          (m) => `<tr>
            <td>${esc(m.date || m.createdAt || "—")}</td>
            <td>${esc(m.type || "—")}</td>
            <td>${esc(m.reference || "—")}</td>
            <td>${esc(m.product || m.sku || "—")}</td>
            <td>${esc(fmtQty(m.qty))}</td>
          </tr>`
        )
        .join("")}</tbody></table></div>`;
  }

  function clientPhysicalActivityCounts(captures) {
    const counts = {
      total: captures.length,
      pending: 0,
      validated: 0,
      clarification: 0,
      rejected: 0
    };
    captures.forEach((capture) => {
      if (capture.status === "PENDIENTE DE SUPERVISIÓN") counts.pending += 1;
      else if (capture.status === "VALIDADO · PENDIENTE DE REGISTRO") counts.validated += 1;
      else if (capture.status === "REQUIERE ACLARACIÓN") counts.clarification += 1;
      else if (capture.status === "RECHAZADO ADMINISTRATIVAMENTE") counts.rejected += 1;
    });
    return counts;
  }

  function clientAdminStatusMessage(status) {
    if (status === "PENDIENTE DE SUPERVISIÓN") {
      return "Pendiente de supervisión · no registrado en inventario oficial";
    }
    if (status === "REQUIERE ACLARACIÓN") {
      return "Requiere aclaración · no registrado en inventario oficial";
    }
    if (status === "VALIDADO · PENDIENTE DE REGISTRO") {
      return "Validado administrativamente · todavía no registrado en inventario oficial";
    }
    if (status === "RECHAZADO ADMINISTRATIVAMENTE") {
      return "Rechazado administrativamente · no registrado en inventario oficial";
    }
    return "Estado administrativo · no registrado en inventario oficial";
  }

  function clientCapturePhysicalLocation(capture) {
    const scanned = new Set();
    (capture.readings || []).forEach((reading) => {
      const fromScan = String(reading.scannedLocation || "").trim();
      if (fromScan) scanned.add(fromScan);
      else if (String(reading.classification || "").toUpperCase().startsWith("UBICACIÓN")) {
        const code = String(reading.normalized || "").trim();
        if (code) scanned.add(code);
      }
    });
    return scanned.size ? [...scanned].join(" · ") : null;
  }

  function clientCaptureOfficialLocation(capture) {
    const official = new Set();
    (capture.readings || []).forEach((reading) => {
      const loc = deriveReadingOfficialLocation(reading);
      if (loc) official.add(loc);
    });
    if (official.size === 1) return [...official][0];
    return null;
  }

  function renderClientReadingEvidence(readings) {
    if (!readings?.length) return `<p class="operational-table-meta">Sin lecturas identificables.</p>`;
    return `<ul class="client-reading-evidence">${readings
      .map(
        (reading) =>
          `<li><code>${esc(reading.raw)}</code> · ${esc(reading.classification || "—")} · ${esc(
            new Date(reading.at).toLocaleString("es-MX")
          )}</li>`
      )
      .join("")}</ul>`;
  }

  function renderClientProvisionalCaptureCard(capture) {
    const project = deriveCaptureProjectLabel(capture);
    const physicalLocation = clientCapturePhysicalLocation(capture);
    const officialLocation = clientCaptureOfficialLocation(capture);
    const locationBlock =
      physicalLocation && officialLocation && physicalLocation !== officialLocation
        ? `<p><span class="client-field-label">Ubicación física reportada</span> ${esc(physicalLocation)}</p>
           <p><span class="client-field-label">Ubicación oficial</span> ${esc(officialLocation)}</p>`
        : physicalLocation
          ? `<p><span class="client-field-label">Ubicación física reportada</span> ${esc(physicalLocation)}</p>`
          : officialLocation
            ? `<p><span class="client-field-label">Ubicación oficial</span> ${esc(officialLocation)}</p>`
            : "";
    const adminTime = capture.adminUpdatedAt
      ? `<p><span class="client-field-label">Hora administrativa</span> ${esc(
          new Date(capture.adminUpdatedAt).toLocaleString("es-MX")
        )}</p>`
      : "";
    return `<article class="client-provisional-card status-${esc(capture.status.replace(/[^a-z0-9]+/gi, "-").toLowerCase())}">
      <header class="client-provisional-card-head">
        <strong>${esc(capture.id)}</strong>
        <span class="badge client-provisional-badge">${esc(capture.status)}</span>
      </header>
      <div class="client-provisional-dual">
        <section class="client-provisional-physical">
          <h5>REALIDAD FÍSICA REPORTADA</h5>
          <p class="client-pol002-disclaimer">Ejecutado físicamente · no constituye movimiento oficial</p>
          <p><span class="client-field-label">Acción declarada</span> ${esc(capture.declaredAction)}</p>
          <p><span class="client-field-label">Ejecutor</span> ${esc(capture.executor)}</p>
          <p><span class="client-field-label">Hora física</span> ${esc(
            new Date(capture.physicalStartedAt).toLocaleString("es-MX")
          )} → ${esc(new Date(capture.physicalEndedAt).toLocaleString("es-MX"))}</p>
          ${project ? `<p><span class="client-field-label">Proyecto</span> ${esc(project)}</p>` : ""}
          ${locationBlock}
          <div class="client-reading-block">
            <span class="client-field-label">Lecturas / evidencia</span>
            ${renderClientReadingEvidence(capture.readings)}
          </div>
        </section>
        <section class="client-provisional-admin">
          <h5>ESTADO ADMINISTRATIVO · NO REGISTRADO EN INVENTARIO</h5>
          <p class="client-admin-status-msg">${esc(clientAdminStatusMessage(capture.status))}</p>
          <p><span class="client-field-label">Estado actual</span> ${esc(capture.status)}</p>
          <p><span class="client-field-label">Supervisor / revisor</span> ${esc(capture.reviewer || "—")}</p>
          <p><span class="client-field-label">Tipo de revisión</span> ${esc(capture.reviewType || "—")}</p>
          ${adminTime}
          ${
            (capture.reviewHistory || []).length > 1
              ? `<div class="review-history-block"><span class="client-field-label">Historial de revisiones</span>${renderReviewHistoryList(
                  capture
                )}</div>`
              : ""
          }
        </section>
      </div>
    </article>`;
  }

  function renderClientPhysicalActivitySection({ compact = false } = {}) {
    const captures = clientVisibleProvisionalCaptures();
    if (!captures.length) {
      return `<div class="card-panel client-physical-activity${compact ? " client-physical-activity-compact" : ""}">
        <h4>Actividad física reportada</h4>
        <p class="operational-table-meta">Sin actividad física provisional reportada para sus proyectos en esta sesión.</p>
        <p class="client-pol002-note">Fuente distinta de trazabilidad oficial · DEMO READ-ONLY · sesión en memoria</p>
      </div>`;
    }
    const counts = clientPhysicalActivityCounts(captures);
    const summary = `<div class="client-physical-summary-grid">
      <div><span class="client-summary-value">${esc(counts.total)}</span><span class="client-summary-label">acciones físicas reportadas</span></div>
      <div><span class="client-summary-value">${esc(counts.pending)}</span><span class="client-summary-label">pendientes de supervisión</span></div>
      <div><span class="client-summary-value">${esc(counts.validated)}</span><span class="client-summary-label">validadas pendientes de registro</span></div>
      <div><span class="client-summary-value">${esc(counts.clarification)}</span><span class="client-summary-label">requieren aclaración</span></div>
      ${
        counts.rejected
          ? `<div><span class="client-summary-value">${esc(counts.rejected)}</span><span class="client-summary-label">rechazadas administrativamente</span></div>`
          : ""
      }
    </div>`;
    if (compact) {
      return `<div class="card-panel client-physical-activity client-physical-activity-compact">
        <h4>Actividad física reportada</h4>
        <p class="client-pol002-note">Ejecutado físicamente ≠ registrado oficialmente · no modifica inventario</p>
        ${summary}
      </div>`;
    }
    return `<div class="card-panel client-physical-activity">
      <h4>Actividad física reportada</h4>
      <p class="client-pol002-note">Fuente distinta de la trazabilidad oficial · capturas provisionales · DEMO READ-ONLY</p>
      ${summary}
      <div class="client-provisional-cards">${captures.map((capture) => renderClientProvisionalCaptureCard(capture)).join("")}</div>
    </div>`;
  }

  function clientMovementsView() {
    const officialBlock =
      state.dataSource === "EXCEL" || !state.movements.length
        ? `<div class="card-panel ops-message warn">La fuente Excel no contiene historial de movimientos.</div>`
        : renderClientOfficialMovementsTable(clientVisibleOfficialMovements());
    return `<div class="module-screen-header"><h3>Movimientos / Trazabilidad</h3>
      <p class="module-lead">Trazabilidad oficial consultable · separada de actividad física reportada</p></div>
      ${renderClientPhysicalActivitySection({ compact: false })}
      <div class="module-screen-header client-official-trace-header"><h4>Trazabilidad oficial</h4></div>
      ${officialBlock}`;
  }

  function clientReportsView() {
    // Production: report scope and exports must be enforced server-side from authenticated client ownership.
    const captures = clientVisibleProvisionalCaptures();
    const inventoryRows = filteredStock().slice(0, 100);
    const exportDisabled =
      '<button type="button" class="btn-secondary btn-compact" disabled title="Disponible en integración oficial">EXPORTAR · disponible en integración oficial</button>';
    const inventoryTable = inventoryRows.length
      ? `<table class="data-table"><thead><tr>
          <th>Proyecto</th><th>SKU</th><th>Descripción</th><th>Piezas</th><th>Ubicación</th><th>Pedido</th><th>SAP</th><th>Partida</th>
        </tr></thead><tbody>${inventoryRows
          .map(
            (r) => `<tr>
              <td>${esc(r.project?.code || r.project?.name || "—")}</td>
              <td>${esc(r.product?.sku)}</td>
              <td>${esc(r.product?.name)}</td>
              <td>${esc(fmtQty(r.qty))}</td>
              <td>${esc(r.location?.code)}</td>
              <td>${esc(r.pedido || "—")}</td>
              <td>${esc(r.sap || "—")}</td>
              <td>${esc(r.partida || "—")}</td>
            </tr>`
          )
          .join("")}</tbody></table>`
      : `<p class="operational-table-meta">Sin existencias autorizadas en la fuente actual.</p>`;
    const visibleOfficialMovements = clientVisibleOfficialMovements();
    const officialMovements =
      state.dataSource === "EXCEL" || !state.movements.length
        ? `<p class="operational-table-meta">No disponible en la fuente actual de la DEMO.</p>`
        : visibleOfficialMovements.length
          ? `<table class="data-table"><thead><tr>
            <th>Fecha</th><th>Tipo</th><th>Referencia</th><th>Producto</th><th>Cant.</th>
          </tr></thead><tbody>${visibleOfficialMovements
            .slice(0, 50)
            .map(
              (m) => `<tr>
                <td>${esc(m.date || m.createdAt || "—")}</td>
                <td>${esc(m.type || "—")}</td>
                <td>${esc(m.reference || "—")}</td>
                <td>${esc(m.product || m.sku || "—")}</td>
                <td>${esc(fmtQty(m.qty))}</td>
              </tr>`
            )
            .join("")}</tbody></table>`
          : `<p class="operational-table-meta">Sin movimientos oficiales autorizados inequívocamente para sus proyectos en esta fuente.</p>`;
    const physicalRows = captures
      .map((capture) => {
        const physicalLocation = clientCapturePhysicalLocation(capture) || "—";
        const officialLocation = clientCaptureOfficialLocation(capture) || "—";
        return `<tr>
          <td>${esc(capture.declaredAction)}</td>
          <td>${esc(physicalLocation)}</td>
          <td>${esc(officialLocation)}</td>
          <td>${esc(capture.status)}</td>
          <td>${esc(capture.executor)}</td>
          <td>${esc(capture.reviewer || "—")}</td>
          <td>${esc(new Date(capture.physicalStartedAt).toLocaleString("es-MX"))}</td>
          <td>${capture.adminUpdatedAt ? esc(new Date(capture.adminUpdatedAt).toLocaleString("es-MX")) : "—"}</td>
        </tr>`;
      })
      .join("");
    const physicalTable = captures.length
      ? `<table class="data-table"><thead><tr>
          <th>Acción</th><th>Ubic. física</th><th>Ubic. oficial</th><th>Estado</th><th>Ejecutor</th><th>Revisor</th><th>Hora física</th><th>Hora admin.</th>
        </tr></thead><tbody>${physicalRows}</tbody></table>`
      : `<p class="operational-table-meta">Sin actividad física provisional autorizada en esta sesión.</p>`;
    const pending = captures.filter((c) => c.status === "PENDIENTE DE SUPERVISIÓN");
    const clarification = captures.filter((c) => c.status === "REQUIERE ACLARACIÓN");
    const validated = captures.filter((c) => c.status === "VALIDADO · PENDIENTE DE REGISTRO");
    const rejected = captures.filter((c) => c.status === "RECHAZADO ADMINISTRATIVAMENTE");
    return `<div class="module-screen-header"><h3>Centro de reportes</h3>
      <p class="module-lead">Reportes autorizados · alcance Cliente · READ-ONLY · exportación en integración oficial</p></div>
      <div class="client-reports-grid">
        <section class="card-panel client-report-section">
          <h4>Inventario actual</h4>
          ${inventoryTable}
          <div class="client-report-export-row">${exportDisabled}</div>
        </section>
        <section class="card-panel client-report-section">
          <h4>Movimientos oficiales</h4>
          ${officialMovements}
          <div class="client-report-export-row">${exportDisabled}</div>
        </section>
        <section class="card-panel client-report-section">
          <h4>Trazabilidad física reportada</h4>
          ${physicalTable}
          <div class="client-report-export-row">${exportDisabled}</div>
        </section>
        <section class="card-panel client-report-section">
          <h4>Diferencias y pendientes</h4>
          <ul class="client-report-pending-list">
            <li>Pendiente de supervisión: ${esc(pending.length)}</li>
            <li>Requiere aclaración: ${esc(clarification.length)}</li>
            <li>Validado pendiente de registro: ${esc(validated.length)}</li>
            <li>Rechazado administrativamente: ${esc(rejected.length)}</li>
          </ul>
          <div class="client-report-export-row">${exportDisabled}</div>
        </section>
      </div>`;
  }

  function clientResumen() {
    const projs = aggregateProjects().slice(0, 6);
    return `<header class="cc-hero"><h2 class="cc-title">Resumen de inventario</h2><p class="cc-tagline">Inventario autorizado de sus proyectos · consulta READ-ONLY</p></header>
      ${kpis()}
      <div class="card-panel"><h4>Proyectos con existencias</h4>
        <table class="data-table"><thead><tr><th>Proyecto</th><th>Piezas</th><th>Registros</th><th>Ubicaciones</th></tr></thead><tbody>${projs
          .map((p) => `<tr><td>${esc(p.project)}</td><td>${esc(fmtQty(p.pieces))}</td><td>${esc(p.rows)}</td><td>${esc(p.locations.size)}</td></tr>`)
          .join("")}</tbody></table>
      </div>
      ${renderClientPhysicalActivitySection({ compact: true })}`;
  }

  function controlCenter() {
    const locs = aggregateLocations().slice(0, 5);
    const projs = aggregateProjects().slice(0, 5);
    return `<header class="cc-hero"><h2 class="cc-title">Centro de Control</h2><p class="cc-tagline">Resumen del inventario demo · READ-ONLY</p></header>
      <div class="card-panel operator-free-scan-entry">
        <p class="operational-table-meta">Scanner transversal · consulta READ-ONLY o documentación física provisional · validación administrativa</p>
        <button type="button" class="btn-secondary btn-compact" data-start-free-scan>ESCANEO LIBRE</button>
      </div>
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

  function valuationView() {
    const rows = state.stock || [];
    const totals = aggregateValuation(rows);
    const visibleRows = rows.slice(0, 200);
    const sourceNotice =
      state.dataSource === "EXCEL"
        ? "La fuente Excel oficial no contiene precios; los registros se muestran como sin valor."
        : "Valuación recibida de la base de datos · consulta protegida · sin edición en esta demo.";
    const tableRows = visibleRows
      .map((row) => {
        const valuation = normalizedRowValuation(row);
        const statusClass = valuation.status === "COMPLETE" ? "complete" : valuation.status === "PARTIAL" ? "partial" : "none";
        return `<tr>
          <td>${esc(row.product?.sku || "—")}</td>
          <td>${esc(row.product?.name || "—")}</td>
          <td>${esc(row.project?.code || row.project?.name || "Sin proyecto")}</td>
          <td>${esc(row.location?.code || "—")}</td>
          <td class="numeric-cell">${esc(fmtQty(valuation.qtyTotal))}</td>
          <td class="numeric-cell valuation-unit">${esc(valuationUnitLabel(valuation))}</td>
          <td class="numeric-cell valuation-total">${esc(valuation.qtyValued > 0 ? fmtMxn(valuation.totalValueMxn) : "Sin valor")}</td>
          <td><span class="valuation-status ${statusClass}">${esc(valuationStatusLabel(valuation.status))}</span></td>
        </tr>`;
      })
      .join("");
    return `<div class="module-screen-header"><h3>Precios y valuación</h3>
      <p class="module-lead">Consulta económica autorizada para el rol actual · DEMO READ-ONLY</p></div>
      <div class="card-panel ops-message${state.dataSource === "EXCEL" ? " warn" : ""}">${esc(sourceNotice)}</div>
      <div class="valuation-summary-grid">
        <div class="kpi-card accent valuation-money-card"><span class="kpi-value valuation-money-value">${esc(fmtMxn(totals.totalValueMxn))}</span><span class="kpi-label">Valor inventario MXN</span></div>
        <div class="kpi-card ok"><span class="kpi-value">${esc(fmtQty(totals.qtyValued))}</span><span class="kpi-label">Piezas valuadas</span></div>
        <div class="kpi-card warn"><span class="kpi-value">${esc(fmtQty(totals.qtyUnvalued))}</span><span class="kpi-label">Piezas sin valor</span></div>
        <div class="kpi-card"><span class="kpi-value">${esc(totals.coveragePct)}%</span><span class="kpi-label">Cobertura económica</span></div>
      </div>
      <div class="card-panel valuation-table-wrap">
        <p class="operational-table-meta">${esc(rows.length)} saldos · mostrando ${esc(visibleRows.length)} · valores en MXN</p>
        <table class="data-table valuation-table"><thead><tr>
          <th>SKU</th><th>Descripción</th><th>Proyecto</th><th>Ubicación</th><th class="numeric-cell">Piezas</th><th class="numeric-cell">Valor unitario / rango</th><th class="numeric-cell">Valor total</th><th>Estado</th>
        </tr></thead><tbody>${tableRows || '<tr><td colspan="8">Sin existencias en la fuente actual.</td></tr>'}</tbody></table>
      </div>`;
  }

  function renderModule() {
    const m = state.module;
    if (state.freeScanActive && state.freeScanAnchor === m && freeScanRoleContext()) {
      return roleFreeScanView();
    }
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
    if (m === "pre_reception") {
      if (state.role === "ADMIN" || (state.role === "SUPERVISOR" && !state.operatorMode)) {
        return preReceptionDocumentalView();
      }
      return disabledModule(
        "Pre-recepción documental",
        "Orden de entrada digital · disponible para Administrador y Supervisor en modo documental · DEMO READ-ONLY"
      );
    }
    if (m === "inbound")
      return disabledModule("Recepciones", "Flujo operador: recepción esperada → escaneo → cotejo → Buffer de entrada. Sin captura manual de proyecto/pedido.");
    if (m === "relocate")
      return disabledModule("Reubicaciones", "Reutiliza flujo LOGITEC de movimiento interno: escaneo producto · origen · destino · validación.");
    if ((m === "picking" || m === "outbound") && !isOperatorExperience())
      return disabledModule(m === "picking" ? "Picking" : "Salidas", "Task-driven desde órdenes existentes. Operador escanea · LOGITEC coteja · buffer salida.");
    if (m === "requisitions") return disabledModule("Órdenes / Requisiciones", "Disponible en sistema oficial · demo muestra tareas derivadas.");
    if (m === "incidents") return disabledModule("Incidencias", "Excepciones operativas · disponible en WMS oficial.");
    if (m === "prices") return valuationView();
    if (m === "imports") return disabledModule("Importaciones", "Disponible en sistema oficial · deshabilitado en demo.");
    if (m === "users") return disabledModule("Usuarios", "Administración disponible en sistema oficial.");
    if (m === "reports" && state.role === "CLIENT") return clientReportsView();
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
    if (task.oedId) {
      const input = document.getElementById("scanValue");
      const fb = document.getElementById("scanFeedback");
      if (!input || !fb || state.scanProcessing) return;
      const raw = String(input.value ?? "");
      if (!String(raw).trim()) {
        fb.className = "scan-status warn";
        fb.textContent = "No leído · escanee código";
        return;
      }
      state.scanProcessing = true;
      applyPreReceptionReading(raw, task.oedId);
      const last = state.preReceptionSession?.readings?.[state.preReceptionSession.readings.length - 1];
      fb.className = last?.resultStatus === "CONTRADICTORIO" || last?.resultStatus === "DESCONOCIDO" ? "scan-status warn" : "scan-status ok";
      fb.textContent = last ? `${last.resultStatus} · ${last.message}` : "Lectura registrada";
      if (last?.resultStatus === "IDENTIFICADO") playScanOkFeedback();
      input.value = "";
      state.scanProcessing = false;
      state.scanSuccessPlayed = false;
      renderContent();
      return;
    }
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
    session.readings.push(enrichReadingFromClassification(classified));
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
    } else if (state.freeScanActive && (state.role === "ADMIN" || state.role === "SUPERVISOR")) {
      palette = "mover";
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
        state.freeScanAnchor = null;
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
        state.freeScanAnchor = null;
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
    app.querySelectorAll("[data-validate-provisional-now]").forEach((btn) => {
      btn.addEventListener("click", () => validateProvisionalCaptureNow());
    });
    app.querySelectorAll("[data-provisional-status]").forEach((sel) => {
      sel.addEventListener("change", () => {
        updateProvisionalCaptureStatus(sel.getAttribute("data-provisional-status"), sel.value);
      });
    });
    app.querySelectorAll("[data-admin-trace-filter]").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.adminTraceFilter = btn.getAttribute("data-admin-trace-filter") || "all";
        renderContent();
      });
    });
    document.getElementById("preReceptionOedSelect")?.addEventListener("change", (event) => {
      state.activeDigitalEntryOrderId = event.target.value || null;
      state.preReceptionSession = createEmptyPreReceptionSession(state.activeDigitalEntryOrderId);
      renderContent();
    });
    document.getElementById("preReceptionConsultRun")?.addEventListener("click", () => {
      submitPreReceptionConsultation(document.getElementById("preReceptionConsultInput")?.value || "");
      const input = document.getElementById("preReceptionConsultInput");
      if (input) input.value = "";
    });
    document.getElementById("preReceptionConsultInput")?.addEventListener("keydown", (event) => {
      if (event.key !== "Enter") return;
      submitPreReceptionConsultation(event.target.value);
      event.target.value = "";
    });
    document.getElementById("preReceptionDiscardLast")?.addEventListener("click", () => discardLastPreReceptionReading());
    document.getElementById("preReceptionResetSession")?.addEventListener("click", () => resetPreReceptionIdentification());
    document.getElementById("freeScanDeclaredAction")?.addEventListener("change", (event) => {
      const session = ensureFreeScanSession();
      session.declaredAction = event.target.value;
      renderContent();
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
