(function logitecRoleDemo() {
  "use strict";

  const OFFICIAL_APP =
    document.documentElement.dataset.interfaceMode === "official" ||
    window.location.pathname.replace(/\/+$/, "") === "/app.html";

  function officialLoginNextPath() {
    return OFFICIAL_APP ? "/app.html" : "/logitec-role-demo.html";
  }

  function applyOfficialAppChrome() {
    if (!OFFICIAL_APP) return;
    document.querySelectorAll(".demo-env-banner, .demo-env-badge, .demo-source-badge").forEach((el) => {
      el.classList.add("hidden");
      el.hidden = true;
    });
  }

  function officializeCopy(text) {
    if (!OFFICIAL_APP) return text;
    let out = String(text ?? "");
    const replacements = [
      ["Fuente demo: Excel oficial · solo lectura", "Fuente: BD operativa"],
      [
        "Valuación no disponible en esta fuente demo. El Excel oficial no incluye precios unitarios ni importes.",
        "Valuación no disponible en la fuente actual."
      ],
      [
        "La fuente Excel oficial no contiene precios; los registros se muestran como sin valor.",
        "La fuente actual no contiene precios; los registros se muestran como sin valor."
      ],
      ["Datos reales de la fuente demo · READ-ONLY", "Datos operativos · solo consulta"],
      ["Catálogo desde fuente demo", "Catálogo operativo"],
      ["Export CSV/Excel oficial", "Export CSV/Excel"],
      ["Disponible en sistema oficial · deshabilitado en demo.", "Disponible en el panel administrativo completo."],
      ["Disponible en sistema oficial · demo muestra tareas derivadas.", "Disponible en el panel administrativo completo."],
      ["Exportes y reportes del WMS real · READ-ONLY en demo.", "Exportes y reportes · solo consulta."],
      ["No disponible en la fuente actual de la DEMO.", "No disponible en la fuente actual."],
      ["cargue fuente demo para reconocer antecedentes históricos.", "cargue inventario operativo para reconocer antecedentes históricos."],
      ["Diferencia reportada · DEMO — supervisor notificado", "Diferencia reportada · supervisor notificado"],
      ["DEMO READ-ONLY", "Solo consulta"],
      ["deshabilitado en demo", "no disponible en esta vista"],
      ["Deshabilitado en demo", "No disponible en esta vista"],
      ["fuente demo", "fuente operativa"],
      ["Fuente demo", "Fuente operativa"],
      ["Excel oficial", "inventario"],
      [" · DEMO", ""],
      ["DEMO —", ""],
      [" en demo.", " en esta vista."],
      [" sesión DEMO.", " sesión actual."],
      [" revisión DEMO", " revisión local"],
      ["OED-DEMO-", "OED-"],
      ["OPERATOR_DEMO", "OPERADOR"],
      ["SUPERVISOR_DEMO", "SUPERVISOR"],
      ["ADMIN_DEMO", "ADMIN"]
    ];
    replacements.forEach(([from, to]) => {
      out = out.split(from).join(to);
    });
    out = out
      .replace(/\bDEMO READ-ONLY\b/gi, "Solo consulta")
      .replace(/\bsolo lectura en demo\b/gi, "solo consulta")
      .replace(/\bdeshabilitado en demo\b/gi, "no disponible en esta vista")
      .replace(/\bDEMO —/g, "")
      .replace(/\s·\s*DEMO\b/g, "")
      .replace(/\bde la DEMO\b/gi, "de la fuente actual")
      .replace(/\bsesión DEMO\b/gi, "sesión actual")
      .replace(/\brevisión DEMO\b/gi, "revisión local")
      .replace(/\bDEMO\b/g, "");
    return out
      .replace(/\s{2,}/g, " ")
      .replace(/\s·\s·+/g, " · ")
      .replace(/\s·\s*$/g, "")
      .replace(/^\s·\s*/g, "")
      .trim();
  }

  function finalizeOfficialHtml(html) {
    return OFFICIAL_APP ? officializeCopy(html) : html;
  }

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
    stopDemoCamera("Cámara detenida al cambiar de módulo.");
    state.module = moduleId;
    state.tab = tabForModule(navRoleKey(), moduleId);
    state.activeTaskId = null;
    state.taskFlow = null;
    if (state.freeScanActive && state.freeScanAnchor !== moduleId) {
      state.freeScanActive = false;
      state.freeScanSession = null;
      state.freeScanAnchor = null;
    }
    if (moduleId === "users" && isRealAdmin()) {
      loadUsersAdmin()
        .then(() => render())
        .catch((error) => {
          state.usersMessage = error.message || "No fue posible cargar usuarios.";
          render();
        });
      return;
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
          { id: "users", label: "Usuarios y accesos", desc: "Administración de fichas, roles y clientes" }
        ],
        informacion: [
          { id: "reports", label: "Reportes", desc: "Indicadores operativos" },
          { id: "exports", label: "Exportaciones", desc: "Export CSV/Excel oficial" },
          { id: "config", label: "Configuración", desc: "Accesos administrativos seguros" }
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
    sessionUser: null,
    usersCache: [],
    clientsCache: [],
    usersMessage: "",
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
    directorMobilePanelOpen: false,
    concentration: false,
    mobileScrollSnapshot: 0,
    operatorMode: false,
    supervisorReturnContext: null,
    freeScanActive: false,
    freeScanSession: null,
    freeScanAnchor: null,
    provisionalCaptures: [],
    provisionalCaptureSeq: 0,
    provisionalApiError: "",
    provisionalActionError: "",
    demoSupervisorActorId: "SUPERVISOR_DEMO",
    demoAdminActorId: "ADMIN_DEMO",
    adminTraceFilter: "all",
    digitalEntryOrders: [],
    activeDigitalEntryOrderId: null,
    preReceptionSession: null,
    identificationCorpusEntries: []
  };

  let demoCameraStream = null;
  let demoCameraTimer = null;
  let demoCameraDetector = null;
  let demoCameraDetectorKind = "";
  let demoCameraDetectionBusy = false;
  let demoCameraDetectionArmed = false;
  let demoBarcodePolyfillPromise = null;
  let demoCameraStartedAt = null;
  let demoCameraRunId = 0;
  let demoCameraCandidateState = { value: "", count: 0, firstSeenAt: null, stableValue: "" };
  let demoCameraSeenCodes = new Set();
  let demoCameraSubmitHandler = null;
  const demoCameraStabilityFrames = 3;
  const demoCameraTimedStabilityFrames = 2;
  const demoCameraStabilityMs = 200;

  const app = document.getElementById("app");
  const sidebar = document.getElementById("sidebar");
  const authHint = document.getElementById("authHint");
  const writeGuard = document.getElementById("writeGuard");
  const dataSourceFooter = document.getElementById("dataSourceFooter");
  const dataSourceBadge = document.getElementById("dataSourceBadge");
  const appDateTime = document.getElementById("appDateTime");
  let directorMobileScrollSnapshot = 0;
  let directorRoleFlashTimer = null;

  const DIRECTOR_ROLE_FLASH_LABELS = {
    ADMIN: "Administrador",
    SUPERVISOR: "Supervisor",
    OPERATOR: "Operador",
    CLIENT: "Cliente"
  };

  function isCompactDirectorLayout() {
    if (state.mobileEmulation) return true;
    return window.matchMedia("(max-width: 640px)").matches;
  }

  function getMobileScrollPosition() {
    return window.scrollY || document.documentElement.scrollTop || 0;
  }

  function restoreMobileScrollPosition(top) {
    window.scrollTo(0, Math.max(0, top || 0));
  }

  function isScanPriorityActive() {
    if (state.freeScanActive) return true;
    if (state.activeTaskId) return true;
    if (demoCameraStream) return true;
    const panel = document.getElementById("scanCameraCapture");
    return Boolean(panel && !panel.hidden);
  }

  function ensureDirectorMobilePanelClosed(restoreScroll = true) {
    const top = directorMobileScrollSnapshot || getMobileScrollPosition();
    state.directorMobilePanelOpen = false;
    const sheet = document.getElementById("directorMobileSheet");
    const backdrop = document.getElementById("directorMobileBackdrop");
    const toggle = document.getElementById("directorMobileToggle");
    if (sheet) {
      sheet.hidden = true;
      sheet.classList.add("hidden");
    }
    if (backdrop) {
      backdrop.hidden = true;
      backdrop.classList.add("hidden");
      backdrop.setAttribute("aria-hidden", "true");
    }
    if (toggle) toggle.setAttribute("aria-expanded", "false");
    document.body.classList.remove("director-mobile-panel-open");
    if (restoreScroll) {
      requestAnimationFrame(() => {
        restoreMobileScrollPosition(top);
        syncDirectorDockSpacing();
      });
    } else {
      syncDirectorDockSpacing();
    }
  }

  function syncScanPriorityUi() {
    const active = isScanPriorityActive();
    document.body.classList.toggle("scan-mode-active", active);
    if (active && isCompactDirectorLayout()) ensureDirectorMobilePanelClosed();
    syncDirectorDockSpacing();
  }

  function syncMobileLayoutUi() {
    syncScanPriorityUi();
    syncDirectorDockSpacing();
  }

  function syncConcentrationExitLabel() {
    const exitBtn = document.getElementById("concentrationExitBtn");
    if (!exitBtn) return;
    exitBtn.textContent = isCompactDirectorLayout() ? "Salir concentración" : "Salir de concentración";
  }

  function flashDirectorRole(role) {
    const flash = document.getElementById("directorRoleFlash");
    if (!flash) return;
    const label = DIRECTOR_ROLE_FLASH_LABELS[role] || role;
    flash.textContent = `Vista: ${label}`;
    flash.hidden = false;
    flash.classList.remove("hidden");
    if (directorRoleFlashTimer) window.clearTimeout(directorRoleFlashTimer);
    directorRoleFlashTimer = window.setTimeout(() => {
      flash.hidden = true;
      flash.classList.add("hidden");
    }, 2200);
  }

  function closeDirectorMobilePanel() {
    if (!state.directorMobilePanelOpen) {
      document.body.classList.remove("director-mobile-panel-open");
      return;
    }
    ensureDirectorMobilePanelClosed(true);
  }

  function openDirectorMobilePanel() {
    if (!isCompactDirectorLayout()) return;
    if (isScanPriorityActive()) return;
    directorMobileScrollSnapshot = getMobileScrollPosition();
    state.directorMobilePanelOpen = true;
    const sheet = document.getElementById("directorMobileSheet");
    const backdrop = document.getElementById("directorMobileBackdrop");
    const toggle = document.getElementById("directorMobileToggle");
    if (sheet) {
      sheet.hidden = false;
      sheet.classList.remove("hidden");
    }
    if (backdrop) {
      backdrop.hidden = false;
      backdrop.classList.remove("hidden");
      backdrop.setAttribute("aria-hidden", "false");
    }
    if (toggle) toggle.setAttribute("aria-expanded", "true");
    document.body.classList.add("director-mobile-panel-open");
    syncDirectorDockSpacing();
    requestAnimationFrame(() => {
      document.getElementById("directorMobileClose")?.focus();
    });
  }

  function toggleDirectorMobilePanel() {
    if (state.directorMobilePanelOpen) closeDirectorMobilePanel();
    else openDirectorMobilePanel();
  }

  function handleDirectorRoleSelect(role) {
    applyDirectorView(role);
    if (isCompactDirectorLayout()) {
      closeDirectorMobilePanel();
      flashDirectorRole(role);
    }
  }

  function isDirectorViewSwitchEnabled() {
    const host = String(window.location.hostname || "").toLowerCase();
    const devHost = host === "localhost" || host === "127.0.0.1";
    if (!devHost) return false;
    try {
      return new URLSearchParams(window.location.search).get("director") === "1";
    } catch (_e) {
      return false;
    }
  }

  function syncDirectorReviewChrome() {
    const enabled = isDirectorViewSwitchEnabled();
    document.body.classList.toggle("director-review-active", enabled);
    const bar = document.getElementById("directorViewBar");
    if (bar) {
      bar.hidden = !enabled;
      bar.classList.toggle("hidden", !enabled);
    }
    const footer = document.querySelector(".demo-readonly-footer");
    if (footer) {
      footer.hidden = !enabled;
      footer.classList.toggle("hidden", !enabled);
    }
    if (enabled) {
      document.body.classList.add("director-view-mode");
    } else {
      document.body.classList.remove("director-view-mode");
      ensureDirectorMobilePanelClosed(false);
    }
    syncDirectorDockSpacing();
    syncRoleViewUi();
  }

  function sessionRoleLabel() {
    const role = realSessionRole() || state.role;
    if (role === "CLIENT") return "Cliente";
    if (role === "OPERATOR") return "Operador";
    if (role === "SUPERVISOR" && state.operatorMode) return "Supervisor · Operador";
    if (role === "SUPERVISOR") return "Supervisor";
    if (role === "ADMIN") return "Administrador";
    return String(role || "—");
  }

  function syncRoleViewUi() {
    document.body.setAttribute("data-role-view", state.role.toLowerCase());
    const directorReview = isDirectorViewSwitchEnabled();
    const roleSwitch = document.getElementById("roleSwitch");
    const roleBadge = document.getElementById("sessionRoleBadge");
    if (roleSwitch) {
      roleSwitch.hidden = !directorReview;
      roleSwitch.classList.toggle("hidden", !directorReview);
    }
    if (roleBadge) {
      roleBadge.textContent = sessionRoleLabel();
      roleBadge.hidden = directorReview;
      roleBadge.classList.toggle("hidden", directorReview);
    }
  }

  function detailRowAttrs(kind, key) {
    const safeKey = encodeURIComponent(String(key ?? ""));
    return `class="detail-row" data-detail-kind="${esc(kind)}" data-detail-key="${safeKey}" tabindex="0" role="button"`;
  }

  function openDetailDrawer(title, fields, actions = []) {
    const drawer = document.getElementById("gridDetailDrawer");
    const titleEl = document.getElementById("gridDetailTitle");
    const bodyEl = document.getElementById("gridDetailBody");
    const actionsEl = document.getElementById("gridDetailActions");
    if (!drawer || !titleEl || !bodyEl || !actionsEl) return;
    titleEl.textContent = title;
    bodyEl.innerHTML = fields
      .map((f) => {
        const valueHtml = f.html ? String(f.value ?? "—") : esc(f.value ?? "—");
        return `<div class="detail-field"><label>${esc(f.label)}</label><span>${valueHtml}</span></div>`;
      })
      .join("");
    actionsEl.innerHTML = (actions || [])
      .map(
        (a) =>
          `<button type="button" class="${esc(a.className || "btn-secondary")}" data-detail-action="${esc(a.id)}">${esc(a.label)}</button>`
      )
      .join("");
    actionsEl.querySelectorAll("[data-detail-action]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const act = actions.find((a) => a.id === btn.getAttribute("data-detail-action"));
        if (act?.onClick) act.onClick();
      });
    });
    drawer.hidden = false;
    drawer.classList.add("open");
    drawer.setAttribute("aria-hidden", "false");
    document.body.classList.add("detail-drawer-open");
    titleEl.focus();
  }

  function closeDetailDrawer() {
    const drawer = document.getElementById("gridDetailDrawer");
    if (!drawer) return;
    drawer.classList.remove("open");
    drawer.hidden = true;
    drawer.setAttribute("aria-hidden", "true");
    document.body.classList.remove("detail-drawer-open");
  }

  function stockRowIndex(row) {
    return state.stock.indexOf(row);
  }

  function openStockDetail(index) {
    const row = state.stock[index];
    if (!row) return;
    const valuation = normalizedRowValuation(row);
    const fields = [
      { label: "SKU", value: row.product?.sku },
      { label: "Descripción", value: row.product?.name },
      { label: "Cantidad", value: fmtQty(row.qty) },
      { label: "Ubicación", value: row.location?.code },
      { label: "Proyecto", value: row.project?.code || row.project?.name || "Sin proyecto" },
      { label: "SAP", value: row.sap || "—" },
      { label: "Pedido", value: row.pedido || "—" },
      { label: "Partida", value: row.partida || "—" },
      { label: "Serie / lote", value: row.serialNumber || "—" }
    ];
    if ((state.role === "ADMIN" || state.role === "SUPERVISOR" || state.module === "prices") && !clientExcelDemoSource()) {
      fields.push(
        { label: "Valor total MXN", value: valuation.qtyValued > 0 ? fmtMxn(valuation.totalValueMxn) : "Sin valor" },
        { label: "Estado valuación", value: valuationStatusLabel(valuation.status) }
      );
    }
    openDetailDrawer(`Inventario · ${row.product?.sku || "Detalle"}`, fields, [
      { id: "close", label: "Cerrar", className: "btn-secondary", onClick: closeDetailDrawer }
    ]);
  }

  function openProductDetail(sku) {
    const rows = state.stock.filter((r) => r.product?.sku === sku);
    if (!rows.length) return;
    const total = rows.reduce((acc, r) => acc + Number(r.qty || 0), 0);
    const locations = new Set(rows.map((r) => r.location?.code).filter(Boolean));
    const projects = new Set(rows.map((r) => projectLabelFromStockRow(r)).filter(Boolean));
    openDetailDrawer(`Producto · ${sku}`, [
      { label: "SKU", value: sku },
      { label: "Descripción", value: rows[0]?.product?.name || "—" },
      { label: "Piezas totales", value: fmtQty(total) },
      { label: "Registros", value: rows.length },
      { label: "Ubicaciones", value: locations.size ? [...locations].slice(0, 12).join(" · ") : "—" },
      { label: "Proyectos", value: projects.size ? [...projects].slice(0, 8).join(" · ") : "—" }
    ], [{ id: "close", label: "Cerrar", className: "btn-secondary", onClick: closeDetailDrawer }]);
  }

  function openLocationDetail(loc) {
    const rows = state.stock.filter((r) => r.location?.code === loc);
    const total = rows.reduce((acc, r) => acc + Number(r.qty || 0), 0);
    const projects = new Set(rows.map((r) => projectLabelFromStockRow(r)).filter(Boolean));
    const skus = new Set(rows.map((r) => r.product?.sku).filter(Boolean));
    openDetailDrawer(`Ubicación · ${loc}`, [
      { label: "Código", value: loc },
      { label: "Piezas", value: fmtQty(total) },
      { label: "Registros", value: rows.length },
      { label: "Proyectos", value: projects.size ? [...projects].join(" · ") : "—" },
      { label: "SKUs", value: skus.size ? [...skus].slice(0, 12).join(" · ") : "—" }
    ], [{ id: "close", label: "Cerrar", className: "btn-secondary", onClick: closeDetailDrawer }]);
  }

  function openProjectDetail(project) {
    const rows = state.stock.filter((r) => (r.project?.code || r.project?.name || "Sin proyecto") === project);
    const total = rows.reduce((acc, r) => acc + Number(r.qty || 0), 0);
    const locations = new Set(rows.map((r) => r.location?.code).filter(Boolean));
    const skus = new Set(rows.map((r) => r.product?.sku).filter(Boolean));
    openDetailDrawer(`Proyecto · ${project}`, [
      { label: "Proyecto", value: project },
      { label: "Piezas", value: fmtQty(total) },
      { label: "Registros", value: rows.length },
      { label: "Ubicaciones", value: locations.size },
      { label: "SKUs", value: skus.size ? [...skus].slice(0, 12).join(" · ") : "—" }
    ], [{ id: "close", label: "Cerrar", className: "btn-secondary", onClick: closeDetailDrawer }]);
  }

  function openMovementDetail(index) {
    const movement = state.movements[index];
    if (!movement) return;
    openDetailDrawer("Detalle de movimiento", [
      { label: "Fecha", value: movement.date || movement.createdAt || "—" },
      { label: "Tipo", value: movement.type || "—" },
      { label: "Referencia", value: movement.reference || "—" },
      { label: "Producto", value: movement.product || movement.sku || "—" },
      { label: "Cantidad", value: fmtQty(movement.qty) },
      { label: "Origen", value: movement.origin || movement.fromLocation || "—" },
      { label: "Destino", value: movement.destination || movement.toLocation || "—" }
    ], [{ id: "close", label: "Cerrar", className: "btn-secondary", onClick: closeDetailDrawer }]);
  }

  function handleDetailRowActivate(el) {
    if (!el) return;
    const kind = el.getAttribute("data-detail-kind");
    const key = decodeURIComponent(el.getAttribute("data-detail-key") || "");
    if (kind === "stock") openStockDetail(Number(key));
    else if (kind === "product") openProductDetail(key);
    else if (kind === "location") openLocationDetail(key);
    else if (kind === "project") openProjectDetail(key);
    else if (kind === "movement") openMovementDetail(Number(key));
    else if (kind === "user") openUserFormDrawer("edit", findUserById(key));
  }

  function wireDetailDrawer() {
    document.querySelectorAll("[data-close-drawer]").forEach((el) => {
      if (el.dataset.drawerWired === "1") return;
      el.dataset.drawerWired = "1";
      el.addEventListener("click", () => closeDetailDrawer());
    });
    if (document.body.dataset.detailDrawerWired === "1") return;
    document.body.dataset.detailDrawerWired = "1";
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        if (isUserTempPasswordModalOpen()) {
          event.preventDefault();
          closeUserTempPasswordModal();
          return;
        }
        if (state.directorMobilePanelOpen) return;
        const drawer = document.getElementById("gridDetailDrawer");
        if (drawer?.classList.contains("open")) closeDetailDrawer();
      }
    });
    app?.addEventListener("click", (event) => {
      const row = event.target.closest("[data-detail-kind]");
      if (!row || !app.contains(row)) return;
      event.preventDefault();
      handleDetailRowActivate(row);
    });
    app?.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      const row = event.target.closest("[data-detail-kind]");
      if (!row || !app.contains(row)) return;
      event.preventDefault();
      handleDetailRowActivate(row);
    });
  }

  let deferredPwaInstallPrompt = null;

  function isPwaStandalone() {
    return (
      window.matchMedia("(display-mode: standalone)").matches ||
      window.matchMedia("(display-mode: minimal-ui)").matches ||
      window.matchMedia("(display-mode: window-controls-overlay)").matches ||
      window.navigator.standalone === true
    );
  }

  function syncAppShellActions() {
    const installBtn = document.getElementById("pwaInstallBtn");
    const fullscreenBtn = document.getElementById("fullscreenBtn");
    const standalone = isPwaStandalone();
    if (installBtn) {
      const showInstall = Boolean(deferredPwaInstallPrompt) && !standalone;
      installBtn.hidden = !showInstall;
      installBtn.classList.toggle("hidden", !showInstall);
    }
    if (fullscreenBtn) {
      const canFullscreen = typeof document.documentElement.requestFullscreen === "function";
      const showFullscreen = canFullscreen && !standalone;
      fullscreenBtn.hidden = !showFullscreen;
      fullscreenBtn.classList.toggle("hidden", !showFullscreen);
      fullscreenBtn.textContent = document.fullscreenElement ? "Salir pantalla completa" : "Pantalla completa";
    }
  }

  function wireAppShellActions() {
    const installBtn = document.getElementById("pwaInstallBtn");
    const fullscreenBtn = document.getElementById("fullscreenBtn");
    const logoutBtn = document.getElementById("logoutBtn");
    window.addEventListener("beforeinstallprompt", (event) => {
      event.preventDefault();
      deferredPwaInstallPrompt = event;
      syncAppShellActions();
    });
    window.addEventListener("appinstalled", () => {
      deferredPwaInstallPrompt = null;
      syncAppShellActions();
    });
    installBtn?.addEventListener("click", async () => {
      if (!deferredPwaInstallPrompt) return;
      deferredPwaInstallPrompt.prompt();
      await deferredPwaInstallPrompt.userChoice;
      deferredPwaInstallPrompt = null;
      syncAppShellActions();
    });
    fullscreenBtn?.addEventListener("click", async () => {
      try {
        if (document.fullscreenElement) await document.exitFullscreen();
        else await document.documentElement.requestFullscreen();
      } catch (_e) {
        /* optional */
      }
      syncAppShellActions();
    });
    document.addEventListener("fullscreenchange", syncAppShellActions);
    logoutBtn?.addEventListener("click", forceLogout);
    syncAppShellActions();
    if ("serviceWorker" in navigator) {
      const swPath = OFFICIAL_APP ? "/app-sw.js" : "/logitec-role-demo-sw.js";
      navigator.serviceWorker.register(swPath, { scope: "/" }).catch(() => {});
    }
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
      const desktop = btn.closest(".director-view-bar-actions-desktop");
      if (desktop) {
        btn.textContent = state.mobileEmulation ? "VOLVER A DESKTOP" : "MODO CELULAR";
      } else {
        btn.textContent = state.mobileEmulation ? "Volver a desktop" : "Modo celular";
      }
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
    if (next) {
      state.mobileScrollSnapshot = getMobileScrollPosition();
      if (state.concentration) applyConcentration(false);
      ensureDirectorMobilePanelClosed(false);
    }
    if (state.mobileEmulation === next) {
      syncDirectorViewUi();
      syncConcentrationUi();
      syncMobileLayoutUi();
      return;
    }
    state.mobileEmulation = next;
    syncDirectorViewUi();
    syncConcentrationUi();
    if (!next) {
      const top = state.mobileScrollSnapshot || 0;
      requestAnimationFrame(() => restoreMobileScrollPosition(top));
    }
    syncMobileLayoutUi();
  }

  function syncRoleSwitchUi() {
    syncDirectorViewUi();
  }

  function resetDemoStartupView() {
    state.sessionUser = null;
    state.usersCache = [];
    state.clientsCache = [];
    state.usersMessage = "";
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
    syncConcentrationExitLabel();
  }

  function applyConcentration(on) {
    const next = Boolean(on);
    if (next && !canUseConcentration()) return;
    ensureDirectorMobilePanelClosed(false);
    state.concentration = next;
    document.body.classList.toggle("focus-mode", state.concentration);
    syncConcentrationButton();
    syncConcentrationExitLabel();
    syncConcentrationOverlay();
    syncConcentrationUi();
    syncMobileLayoutUi();
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
    if (!isDirectorViewSwitchEnabled()) return;
    applyRoleView(role);
  }

  function cancelActiveTask() {
    stopDemoCamera("Cámara detenida al cancelar la tarea.");
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
    stopDemoCamera("Cámara detenida al cerrar la captura.");
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

  function declaredActionLabel(actionId) {
    const action = DECLARED_FLOOR_ACTIONS.find((a) => a.id === actionId);
    return action ? action.label : String(actionId || "");
  }

  function mapServerCaptureToUi(serverCapture) {
    const createdBy = serverCapture.createdBy || {};
    const reviewer = serverCapture.reviewer || null;
    const declaredActionId = String(serverCapture.declaredActionId || "");
    return {
      id: String(serverCapture.id),
      status: String(serverCapture.status || ""),
      declaredAction: declaredActionLabel(declaredActionId),
      declaredActionId,
      executor: String(createdBy.fullName || createdBy.email || ""),
      executorRole: String(createdBy.role || ""),
      executorActorId: String(serverCapture.createdById || createdBy.id || ""),
      executorOperatorMode: Boolean(serverCapture.executorOperatorMode),
      reviewer: reviewer ? String(reviewer.fullName || reviewer.email || "") : null,
      reviewerRole: reviewer ? String(reviewer.role || "") : null,
      reviewerActorId: serverCapture.reviewerId ? String(serverCapture.reviewerId) : null,
      reviewType: serverCapture.reviewType ? String(serverCapture.reviewType) : null,
      reviewHistory: (serverCapture.reviews || []).map((event) => ({
        reviewer: String(event.reviewer?.fullName || event.reviewer?.email || ""),
        reviewerRole: String(event.reviewerRole || ""),
        reviewerActorId: String(event.reviewerId || ""),
        reviewType: String(event.reviewType || ""),
        status: String(event.status || ""),
        at:
          typeof event.createdAt === "string"
            ? event.createdAt
            : event.createdAt
              ? new Date(event.createdAt).toISOString()
              : new Date().toISOString()
      })),
      device: String(serverCapture.device || "PWA oficial"),
      physicalStartedAt:
        typeof serverCapture.physicalStartedAt === "string"
          ? serverCapture.physicalStartedAt
          : new Date(serverCapture.physicalStartedAt).toISOString(),
      physicalEndedAt:
        typeof serverCapture.physicalEndedAt === "string"
          ? serverCapture.physicalEndedAt
          : new Date(serverCapture.physicalEndedAt).toISOString(),
      observation: String(serverCapture.observation || "").trim(),
      readings: Array.isArray(serverCapture.readings)
        ? serverCapture.readings.map((reading) => ({ ...reading }))
        : [],
      adminUpdatedAt: serverCapture.adminUpdatedAt
        ? typeof serverCapture.adminUpdatedAt === "string"
          ? serverCapture.adminUpdatedAt
          : new Date(serverCapture.adminUpdatedAt).toISOString()
        : null,
      projectId: serverCapture.projectId || null,
      project: serverCapture.project || null
    };
  }

  function upsertOfficialProvisionalCapture(serverCapture) {
    const mapped = mapServerCaptureToUi(serverCapture);
    const index = state.provisionalCaptures.findIndex((capture) => capture.id === mapped.id);
    if (index >= 0) state.provisionalCaptures[index] = mapped;
    else state.provisionalCaptures.unshift(mapped);
    return mapped;
  }

  function buildOfficialCapturePostBody(session, { validateNow = false } = {}) {
    return {
      declaredActionId: session.declaredAction,
      observation: String(session.observation || "").trim(),
      readings: session.readings.map((reading) => ({ ...reading })),
      physicalStartedAt: session.startedAt,
      physicalEndedAt: new Date().toISOString(),
      executorOperatorMode: Boolean(state.operatorMode),
      device: navigator.userAgent ? String(navigator.userAgent).slice(0, 160) : "PWA oficial",
      validateNow: Boolean(validateNow)
    };
  }

  async function loadOfficialProvisionalCaptures() {
    if (!OFFICIAL_APP) return;
    const result = await apiGet("/api/provisional-captures", true);
    if (result.status === 401) throw new Error("Sesión requerida.");
    if (!result.ok) {
      throw new Error(
        (result.data && result.data.message) || "No se pudieron cargar las capturas provisionales."
      );
    }
    const items = (result.data && result.data.items) || [];
    state.provisionalCaptures = items.map((capture) => mapServerCaptureToUi(capture));
    state.provisionalApiError = "";
  }

  function clearProvisionalCaptureSession() {
    state.freeScanActive = false;
    state.freeScanSession = null;
    state.freeScanAnchor = null;
    unlockScanInput();
    renderContent();
  }

  function renderProvisionalApiNotice() {
    const message = state.provisionalActionError || state.provisionalApiError;
    if (!message) return "";
    return `<div class="card-panel ops-message warn provisional-api-notice" role="alert">${esc(message)}</div>`;
  }

  function finalizeProvisionalCapture(capture) {
    state.provisionalCaptures.unshift(capture);
    state.freeScanActive = false;
    state.freeScanSession = null;
    state.freeScanAnchor = null;
    unlockScanInput();
    renderContent();
  }

  async function sendProvisionalCapture() {
    const session = state.freeScanSession;
    if (!session || !session.readings.length) return;
    if (state.role === "ADMIN" && !isPhysicalFloorAction(session.declaredAction)) return;
    if (state.role === "SUPERVISOR" && !state.operatorMode && !isPhysicalFloorAction(session.declaredAction)) {
      return;
    }
    if (OFFICIAL_APP) {
      state.provisionalActionError = "";
      try {
        const result = await apiFetch("/api/provisional-captures", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(buildOfficialCapturePostBody(session, { validateNow: false }))
        });
        upsertOfficialProvisionalCapture(result.capture);
        clearProvisionalCaptureSession();
      } catch (error) {
        state.provisionalActionError = error.message || "No se pudo guardar la captura provisional.";
        renderContent();
      }
      return;
    }
    finalizeProvisionalCapture(buildProvisionalCaptureFromSession(session));
  }

  async function validateProvisionalCaptureNow() {
    const session = state.freeScanSession;
    if (!session || !session.readings.length) return;
    if (state.operatorMode) return;
    if (state.role !== "SUPERVISOR" && state.role !== "ADMIN") return;
    if (!isPhysicalFloorAction(session.declaredAction)) return;
    if (OFFICIAL_APP) {
      state.provisionalActionError = "";
      try {
        const result = await apiFetch("/api/provisional-captures", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(buildOfficialCapturePostBody(session, { validateNow: true }))
        });
        upsertOfficialProvisionalCapture(result.capture);
        clearProvisionalCaptureSession();
      } catch (error) {
        state.provisionalActionError = error.message || "No se pudo validar la captura provisional.";
        renderContent();
      }
      return;
    }
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

  async function updateProvisionalCaptureStatus(captureId, nextStatus) {
    const capture = state.provisionalCaptures.find((c) => c.id === captureId);
    if (!capture || !canReviewProvisionalCapture()) return;
    if (!PROVISIONAL_STATUSES.includes(nextStatus)) return;
    if (capture.status === nextStatus) return;
    if (OFFICIAL_APP) {
      state.provisionalActionError = "";
      try {
        const result = await apiFetch(
          `/api/provisional-captures/${encodeURIComponent(captureId)}/review`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status: nextStatus })
          }
        );
        upsertOfficialProvisionalCapture(result.capture);
        renderContent();
      } catch (error) {
        state.provisionalActionError = error.message || "No se pudo actualizar el estado de la captura.";
        renderContent();
      }
      return;
    }
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

  function advanceDemoCameraCandidate(candidateState, rawValue, detectedAt) {
    const value = normalizeScannerRawValue(rawValue);
    if (!value) return { value: "", count: 0, firstSeenAt: null, stableValue: "" };
    if (value !== candidateState.value) {
      return { value, count: 1, firstSeenAt: detectedAt, stableValue: "" };
    }
    const count = candidateState.count + 1;
    const firstSeenAt = candidateState.firstSeenAt ?? detectedAt;
    const stableValue =
      count >= demoCameraStabilityFrames ||
      (count >= demoCameraTimedStabilityFrames && detectedAt - firstSeenAt >= demoCameraStabilityMs)
        ? value
        : "";
    return { value, count, firstSeenAt, stableValue };
  }

  function setDemoCameraStatus(message, tone = "") {
    const status = document.getElementById("scanCameraStatus");
    if (!status) return;
    status.textContent = message;
    status.className = `scan-camera-status${tone ? ` ${tone}` : ""}`;
  }

  function snapshotDemoCameraFrame() {
    const video = document.getElementById("scanCameraVideo");
    if (!video) return null;
    const width = video.videoWidth;
    const height = video.videoHeight;
    if (!width || !height) return null;
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) return null;
    context.drawImage(video, 0, 0, width, height);
    return canvas;
  }

  function haltDemoCameraCapture() {
    if (demoCameraTimer) window.clearTimeout(demoCameraTimer);
    demoCameraTimer = null;
    demoCameraRunId += 1;
    demoCameraDetectionBusy = false;
    demoCameraDetectionArmed = false;
    if (demoCameraStream) {
      demoCameraStream.getTracks().forEach((track) => track.stop());
    }
    demoCameraStream = null;
    demoCameraStartedAt = null;
    demoCameraCandidateState = { value: "", count: 0, firstSeenAt: null, stableValue: "" };
    const video = document.getElementById("scanCameraVideo");
    if (video) {
      video.pause();
      video.srcObject = null;
    }
  }

  function stopDemoCamera(message = "Cámara detenida.") {
    haltDemoCameraCapture();
    const startBtn = document.getElementById("scanStartCameraBtn");
    const armBtn = document.getElementById("scanArmCameraBtn");
    const stopBtn = document.getElementById("scanStopCameraBtn");
    if (startBtn) startBtn.disabled = false;
    if (armBtn) {
      armBtn.disabled = true;
      armBtn.textContent = "INICIAR LECTURA";
    }
    if (stopBtn) stopBtn.disabled = true;
    if (message) setDemoCameraStatus(message);
    syncScanPriorityUi();
  }

  function loadDemoBarcodeDetectorPolyfill() {
    if (window.BarcodeDetector) return Promise.resolve();
    if (demoBarcodePolyfillPromise) return demoBarcodePolyfillPromise;
    demoBarcodePolyfillPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "/vendor/barcode-detector/3.2.2/polyfill.js";
      script.dataset.barcodeDetectorPolyfill = "true";
      script.onload = () => resolve();
      script.onerror = () => {
        script.remove();
        demoBarcodePolyfillPromise = null;
        reject(new Error("No se pudo cargar el decodificador local."));
      };
      document.head.appendChild(script);
    });
    return demoBarcodePolyfillPromise;
  }

  async function createDemoCameraDetector() {
    if (window.BarcodeDetector) {
      demoCameraDetectorKind = "nativo";
      return new window.BarcodeDetector();
    }
    await loadDemoBarcodeDetectorPolyfill();
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
    demoCameraDetectorKind = "ZXing-WASM";
    return new window.BarcodeDetector();
  }

  function scheduleDemoCameraDetection() {
    if (!demoCameraStream || !demoCameraDetectionArmed) return;
    demoCameraTimer = window.setTimeout(() => void detectDemoCameraFrame(), 160);
  }

  async function detectDemoCameraFrame() {
    if (!demoCameraStream || !demoCameraDetectionArmed || demoCameraDetectionBusy || state.scanProcessing) return;
    const video = document.getElementById("scanCameraVideo");
    if (!video || video.readyState < 2) {
      scheduleDemoCameraDetection();
      return;
    }
    const runId = demoCameraRunId;
    demoCameraDetectionBusy = true;
    try {
      const cameraFrame = snapshotDemoCameraFrame();
      if (!cameraFrame) {
        scheduleDemoCameraDetection();
        return;
      }
      const detections = await demoCameraDetector.detect(cameraFrame);
      if (runId !== demoCameraRunId || !demoCameraStream || !demoCameraDetectionArmed) return;
      const detectionNow = performance.now();
      demoCameraCandidateState = advanceDemoCameraCandidate(
        demoCameraCandidateState,
        detections?.[0]?.rawValue ?? "",
        detectionNow
      );
      const rawValue = demoCameraCandidateState.stableValue;
      if (!rawValue) {
        scheduleDemoCameraDetection();
        return;
      }
      if (demoCameraSeenCodes.has(rawValue)) {
        setDemoCameraStatus("Código ya procesado en esta lectura · esperando uno distinto…", "armed");
        scheduleDemoCameraDetection();
        return;
      }
      demoCameraSeenCodes.add(rawValue);
      demoCameraDetectionArmed = false;
      const input = document.getElementById("scanValue");
      const onSubmit = demoCameraSubmitHandler;
      if (!input || typeof onSubmit !== "function") {
        scheduleDemoCameraDetection();
        return;
      }
      input.value = rawValue;
      setDemoCameraStatus(`Código detectado (${demoCameraDetectorKind}) · procesando…`, "ok");
      stopDemoCamera("Lectura enviada · cámara detenida.");
      onSubmit(input);
    } catch (error) {
      if (!demoCameraStream) return;
      setDemoCameraStatus(
        `Buscando código… ${error?.message || "ajusta distancia e iluminación"}`
      );
    } finally {
      demoCameraDetectionBusy = false;
    }
    if (demoCameraDetectionArmed && demoCameraStream) scheduleDemoCameraDetection();
  }

  function armDemoCameraDetection() {
    if (!demoCameraStream || demoCameraDetectionArmed) return;
    demoCameraCandidateState = { value: "", count: 0, firstSeenAt: null, stableValue: "" };
    demoCameraDetectionArmed = true;
    demoCameraStartedAt = performance.now();
    const armBtn = document.getElementById("scanArmCameraBtn");
    if (armBtn) {
      armBtn.disabled = true;
      armBtn.textContent = "INICIAR LECTURA";
    }
    setDemoCameraStatus(`Lectura armada · detector ${demoCameraDetectorKind}. Buscando código…`, "armed");
    scheduleDemoCameraDetection();
  }

  async function startDemoCamera() {
    if (!window.isSecureContext && window.location.hostname !== "localhost" && window.location.hostname !== "127.0.0.1") {
      setDemoCameraStatus(
        "La cámara requiere HTTPS o localhost. Use captura manual o lector teclado.",
        "error"
      );
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setDemoCameraStatus(
        "Este navegador no ofrece acceso a cámara. Use captura manual o lector teclado.",
        "error"
      );
      return;
    }
    const startBtn = document.getElementById("scanStartCameraBtn");
    const armBtn = document.getElementById("scanArmCameraBtn");
    const stopBtn = document.getElementById("scanStopCameraBtn");
    if (startBtn) startBtn.disabled = true;
    if (armBtn) armBtn.disabled = true;
    setDemoCameraStatus("Preparando cámara · solicitando permiso explícito…");
    try {
      demoCameraStream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1280 },
          height: { ideal: 720 }
        }
      });
      const video = document.getElementById("scanCameraVideo");
      if (!video) throw new Error("Vista previa no disponible.");
      video.srcObject = demoCameraStream;
      await video.play();
      demoCameraDetector = demoCameraDetector || (await createDemoCameraDetector());
      if (armBtn) armBtn.disabled = false;
      if (stopBtn) stopBtn.disabled = false;
      setDemoCameraStatus(`Cámara lista · detector ${demoCameraDetectorKind}. Presione INICIAR LECTURA.`, "ok");
      syncScanPriorityUi();
    } catch (error) {
      stopDemoCamera("Cámara no disponible.");
      const denied = error?.name === "NotAllowedError";
      setDemoCameraStatus(
        denied
          ? "Permiso de cámara denegado. Habilítelo en el navegador o use captura manual/lector teclado."
          : `No se pudo iniciar la cámara: ${error?.message || "error desconocido"}. Use captura manual/lector teclado.`,
        "error"
      );
    }
  }

  function wireDemoScannerCamera(onSubmit) {
    demoCameraSubmitHandler = onSubmit;
    if (!window.__logitecDemoCameraVisibilityWired) {
      window.__logitecDemoCameraVisibilityWired = true;
      document.addEventListener("visibilitychange", () => {
        if (document.hidden) stopDemoCamera("Pestaña oculta · cámara detenida.");
      });
    }
    const toggle = document.getElementById("scanCameraToggle");
    const panel = document.getElementById("scanCameraCapture");
    toggle?.addEventListener("click", () => {
      const opening = panel?.hidden !== false;
      if (panel) panel.hidden = !opening;
      toggle.setAttribute("aria-expanded", opening ? "true" : "false");
      if (!opening) stopDemoCamera("Cámara detenida; captura manual disponible.");
      syncScanPriorityUi();
    });
    document.getElementById("scanStartCameraBtn")?.addEventListener("click", () => {
      demoCameraSeenCodes.clear();
      void startDemoCamera();
    });
    document.getElementById("scanArmCameraBtn")?.addEventListener("click", () => armDemoCameraDetection());
    document.getElementById("scanStopCameraBtn")?.addEventListener("click", () =>
      stopDemoCamera("Cámara detenida; captura manual disponible.")
    );
  }

  function mobileTableScrollHint() {
    return `<p class="mobile-table-scroll-hint" aria-hidden="true">Desliza horizontalmente para ver todas las columnas</p>`;
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
      <div class="scan-camera-shell">
        <button type="button" class="btn-secondary btn-compact scan-camera-toggle" id="scanCameraToggle" aria-expanded="false">CÁMARA DEL CELULAR</button>
        <div id="scanCameraCapture" class="scan-camera-capture" hidden>
          <div class="scan-camera-frame">
            <video id="scanCameraVideo" muted playsinline aria-label="Vista previa de cámara"></video>
            <div class="scan-camera-guide" aria-hidden="true"></div>
          </div>
          <p id="scanCameraStatus" class="scan-camera-status" role="status">La cámara está apagada. Ábrela, encuadra el código y presione INICIAR LECTURA.</p>
          <div class="scan-camera-actions">
            <button type="button" class="btn-primary btn-compact" id="scanStartCameraBtn">ABRIR CÁMARA</button>
            <button type="button" class="btn-secondary btn-compact scan-arm-reading" id="scanArmCameraBtn" disabled>INICIAR LECTURA</button>
            <button type="button" class="btn-secondary btn-compact" id="scanStopCameraBtn" disabled>DETENER CÁMARA</button>
          </div>
          <p class="scan-camera-note">Requiere HTTPS o localhost · permiso explícito · cámara trasera preferida · BarcodeDetector nativo o ZXing-WASM local.</p>
        </div>
      </div>
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

  function shouldAutofocusScanInputOnMount() {
    try {
      if (typeof window.matchMedia === "function") {
        if (window.matchMedia("(pointer: coarse)").matches) return false;
        if (window.matchMedia("(hover: none) and (pointer: coarse)").matches) return false;
      }
      if (typeof navigator.maxTouchPoints === "number" && navigator.maxTouchPoints > 0) {
        if (typeof window.matchMedia === "function" && window.matchMedia("(hover: none)").matches) {
          return false;
        }
      }
    } catch (_error) {
      return true;
    }
    return true;
  }

  function wireScannerInput(onSubmit, manualPlaceholder) {
    const input = document.getElementById("scanValue");
    if (!input || typeof onSubmit !== "function") return;
    if (shouldAutofocusScanInputOnMount()) {
      input.focus();
      input.select();
    }
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
    wireDemoScannerCamera(onSubmit);
  }

  function enterSupervisorOperatorMode() {
    if (state.role !== "SUPERVISOR" || state.operatorMode) return;
    state.supervisorReturnContext = {
      tab: state.tab,
      module: state.module,
      scroll: getMobileScrollPosition()
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
    requestAnimationFrame(() => restoreMobileScrollPosition(ctx.scroll || 0));
  }

  function syncSupervisorOperatorModeUi() {
    const active = state.role === "SUPERVISOR" && state.operatorMode;
    document.body.classList.toggle("supervisor-operator-mode-active", active);
    const bar = document.getElementById("supervisorOperatorModeBar");
    if (bar) {
      bar.hidden = !active;
      bar.classList.toggle("hidden", !active);
    }
    syncRoleViewUi();
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
    ensureDirectorMobilePanelClosed(false);
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

  function syncDirectorDockSpacing() {
    const bar = document.getElementById("directorViewBar");
    const footer = document.querySelector(".demo-readonly-footer");
    const compact = isCompactDirectorLayout();
    const scanActive = document.body.classList.contains("scan-mode-active");
    const focusActive = state.concentration;
    let bottomSpace = 12;
    let barHeight = 0;
    if (bar && !bar.hidden && isDirectorViewSwitchEnabled() && !scanActive && !focusActive) {
      barHeight = Math.ceil(bar.getBoundingClientRect().height || 0);
      bottomSpace += barHeight;
      if (compact) {
        document.documentElement.style.setProperty("--director-mobile-dock-height", `${barHeight}px`);
      } else {
        document.documentElement.style.removeProperty("--director-mobile-dock-height");
      }
    } else if (compact) {
      document.documentElement.style.setProperty("--director-mobile-dock-height", "0px");
    } else {
      document.documentElement.style.removeProperty("--director-mobile-dock-height");
    }
    if (footer && !scanActive && !focusActive) {
      bottomSpace += Math.ceil(footer.getBoundingClientRect().height || 0);
    }
    document.documentElement.style.setProperty("--mobile-chrome-bottom-space", `${bottomSpace}px`);
    document.documentElement.style.setProperty("--director-dock-space", `${bottomSpace}px`);
  }

  function wireDirectorViewBarActions(bar) {
    bar.querySelectorAll("[data-director-role]").forEach((btn) => {
      if (btn.dataset.directorWired === "1") return;
      btn.dataset.directorWired = "1";
      btn.addEventListener("click", () => handleDirectorRoleSelect(btn.getAttribute("data-director-role") || "OPERATOR"));
    });
    bar.querySelectorAll("[data-director-mobile]").forEach((btn) => {
      if (btn.dataset.directorWired === "1") return;
      btn.dataset.directorWired = "1";
      btn.addEventListener("click", () => {
        setMobileEmulation(!state.mobileEmulation);
        if (isCompactDirectorLayout()) closeDirectorMobilePanel();
      });
    });
    bar.querySelectorAll("[data-director-system]").forEach((btn) => {
      if (btn.dataset.directorWired === "1") return;
      btn.dataset.directorWired = "1";
      btn.addEventListener("click", () => {
        if (btn.dataset.opening === "1") return;
        btn.dataset.opening = "1";
        if (isCompactDirectorLayout()) closeDirectorMobilePanel();
        window.open("/dashboard.html", "_blank", "noopener,noreferrer");
        window.setTimeout(() => {
          btn.dataset.opening = "0";
        }, 800);
      });
    });
  }

  function initDirectorViewBar() {
    syncDirectorReviewChrome();
    const bar = document.getElementById("directorViewBar");
    if (!isDirectorViewSwitchEnabled()) {
      return;
    }
    if (!bar) return;
    if (bar.dataset.wired === "1") {
      syncDirectorViewUi();
      syncConcentrationUi();
      syncDirectorDockSpacing();
      return;
    }
    bar.dataset.wired = "1";
    syncDirectorDockSpacing();
    window.addEventListener("resize", () => {
      if (!isCompactDirectorLayout() && state.directorMobilePanelOpen) closeDirectorMobilePanel();
      syncDirectorDockSpacing();
      syncConcentrationExitLabel();
    }, { passive: true });
    if (typeof ResizeObserver !== "undefined") {
      const dockObserver = new ResizeObserver(syncDirectorDockSpacing);
      dockObserver.observe(bar);
      const footer = document.querySelector(".demo-readonly-footer");
      if (footer) dockObserver.observe(footer);
      bar._dockObserver = dockObserver;
    }
    wireDirectorViewBarActions(bar);
    const toggle = document.getElementById("directorMobileToggle");
    if (toggle && toggle.dataset.wired !== "1") {
      toggle.dataset.wired = "1";
      toggle.addEventListener("click", () => toggleDirectorMobilePanel());
    }
    const closeBtn = document.getElementById("directorMobileClose");
    if (closeBtn && closeBtn.dataset.wired !== "1") {
      closeBtn.dataset.wired = "1";
      closeBtn.addEventListener("click", () => closeDirectorMobilePanel());
    }
    const backdrop = document.getElementById("directorMobileBackdrop");
    if (backdrop && backdrop.dataset.wired !== "1") {
      backdrop.dataset.wired = "1";
      backdrop.addEventListener("click", () => closeDirectorMobilePanel());
    }
    if (bar.dataset.escapeWired !== "1") {
      bar.dataset.escapeWired = "1";
      document.addEventListener("keydown", (event) => {
        if (event.key !== "Escape" || !state.directorMobilePanelOpen) return;
        if (document.getElementById("gridDetailDrawer")?.classList.contains("open")) return;
        closeDirectorMobilePanel();
      });
    }
    const restoreBtn = document.getElementById("mobileEmulationRestore");
    if (restoreBtn) {
      restoreBtn.addEventListener("click", () => setMobileEmulation(false));
    }
    syncDirectorViewUi();
    syncConcentrationExitLabel();
    requestAnimationFrame(syncDirectorDockSpacing);
  }

  function readAccessToken() {
    try {
      return String(localStorage.getItem("token") || "").trim();
    } catch (_e) {
      return "";
    }
  }

  function forceLogout() {
    stopDemoCamera("Sesión cerrada.");
    closeUserTempPasswordModal();
    closeDetailDrawer();
    ensureDirectorMobilePanelClosed(false);
    if (state.concentration) applyConcentration(false);
    applyMustChangePasswordGate(false);
    clearMustChangePasswordFields();
    state.sessionUser = null;
    state.usersCache = [];
    state.clientsCache = [];
    try {
      localStorage.removeItem("token");
    } catch (_e) {
      /* ignore private mode */
    }
    window.location.replace("/login.html?next=" + encodeURIComponent("/logitec-role-demo.html"));
  }

  function realSessionRole() {
    return state.sessionUser?.role || null;
  }

  function realSessionUserId() {
    return state.sessionUser?.id || null;
  }

  function isRealAdmin() {
    return realSessionRole() === "ADMIN";
  }

  function isBoundOperationalRole(role) {
    return role === "SUPERVISOR" || role === "OPERATOR" || role === "CLIENT";
  }

  function fetchUrlString(input) {
    if (typeof input === "string") return input;
    if (input && typeof input === "object" && "url" in input) return String(input.url || "");
    return String(input || "");
  }

  function isUsersAdminWrite(url, method) {
    const verb = String(method || "GET").toUpperCase();
    if (verb === "GET") return false;
    if (!isRealAdmin()) return false;
    try {
      const path = new URL(fetchUrlString(url), window.location.origin).pathname;
      return path === "/api/users" || path.startsWith("/api/users/");
    } catch (_e) {
      return false;
    }
  }

  function isSelfPasswordChangeWrite(url, method) {
    const verb = String(method || "GET").toUpperCase();
    if (verb !== "POST") return false;
    try {
      const path = new URL(fetchUrlString(url), window.location.origin).pathname;
      return path === "/api/auth/change-password";
    } catch (_e) {
      return false;
    }
  }

  function isOfficialProvisionalWrite(url, method) {
    if (!OFFICIAL_APP) return false;
    try {
      const path = new URL(url, window.location.origin).pathname.replace(/\/+$/, "") || "/";
      if (path === "/api/provisional-captures" && method === "POST") return true;
      if (/^\/api\/provisional-captures\/[^/]+\/review$/.test(path) && method === "PATCH") return true;
      return false;
    } catch (_e) {
      return false;
    }
  }

  function isDemoWriteAllowed(url, method) {
    return (
      isUsersAdminWrite(url, method) ||
      isSelfPasswordChangeWrite(url, method) ||
      isOfficialProvisionalWrite(url, method)
    );
  }

  function sessionMustChangePassword() {
    return Boolean(state.sessionUser?.mustChangePassword);
  }

  function applyMustChangePasswordGate(required) {
    const active = Boolean(required);
    document.body.classList.toggle("must-change-password", active);
    const banner = document.getElementById("mustChangePasswordBanner");
    if (banner) {
      banner.hidden = !active;
      banner.classList.toggle("hidden", !active);
    }
    if (active) {
      const bar = document.getElementById("wmsSectionBar");
      if (bar) {
        bar.hidden = true;
        bar.classList.add("hidden");
        bar.innerHTML = "";
      }
      if (sidebar) sidebar.innerHTML = "";
    }
  }

  function clearMustChangePasswordFields() {
    ["pwaCurrentPassword", "pwaNewPassword", "pwaConfirmPassword"].forEach((id) => {
      const input = document.getElementById(id);
      if (input) input.value = "";
    });
    const errorEl = document.getElementById("pwaChangePasswordError");
    if (errorEl) errorEl.textContent = "";
  }

  function renderMustChangePasswordPanel() {
    if (!app) return;
    app.innerHTML = `<div class="card-panel must-change-password-panel">
      <h2>Cambio de contraseña obligatorio</h2>
      <p class="module-lead">Debes establecer una contraseña nueva antes de usar LOGITEC CORE WMS. Usa la contraseña temporal que recibiste.</p>
      <form id="pwaChangePasswordForm" class="users-form-grid must-change-password-form" autocomplete="off">
        <div class="field">
          <label for="pwaCurrentPassword">Contraseña temporal actual</label>
          <input id="pwaCurrentPassword" type="password" minlength="6" required autocomplete="current-password" />
        </div>
        <div class="field">
          <label for="pwaNewPassword">Nueva contraseña</label>
          <input id="pwaNewPassword" type="password" minlength="6" required autocomplete="new-password" />
        </div>
        <div class="field">
          <label for="pwaConfirmPassword">Confirmar nueva contraseña</label>
          <input id="pwaConfirmPassword" type="password" minlength="6" required autocomplete="new-password" />
        </div>
        <p id="pwaChangePasswordError" class="must-change-password-error" role="alert"></p>
        <button id="pwaChangePasswordBtn" type="submit" class="btn-primary btn-compact">Actualizar contraseña</button>
      </form>
    </div>`;
    wireMustChangePasswordForm();
  }

  function wireMustChangePasswordForm() {
    const form = document.getElementById("pwaChangePasswordForm");
    if (!form || form.dataset.wired === "1") return;
    form.dataset.wired = "1";
    form.addEventListener("submit", submitMustChangePassword);
  }

  async function submitMustChangePassword(event) {
    event.preventDefault();
    const errorEl = document.getElementById("pwaChangePasswordError");
    const submitBtn = document.getElementById("pwaChangePasswordBtn");
    const currentInput = document.getElementById("pwaCurrentPassword");
    const newInput = document.getElementById("pwaNewPassword");
    const confirmInput = document.getElementById("pwaConfirmPassword");
    if (errorEl) errorEl.textContent = "";
    if (submitBtn) submitBtn.disabled = true;

    const currentPassword = String(currentInput?.value || "");
    const newPassword = String(newInput?.value || "");
    const confirmPassword = String(confirmInput?.value || "");

    if (!currentPassword || !newPassword || !confirmPassword) {
      if (errorEl) errorEl.textContent = "Completa todos los campos de contraseña.";
      if (submitBtn) submitBtn.disabled = false;
      return;
    }
    if (newPassword !== confirmPassword) {
      if (errorEl) errorEl.textContent = "La nueva contraseña y la confirmación deben coincidir.";
      if (submitBtn) submitBtn.disabled = false;
      return;
    }
    if (currentPassword === newPassword) {
      if (errorEl) errorEl.textContent = "La nueva contraseña debe ser diferente a la actual.";
      if (submitBtn) submitBtn.disabled = false;
      return;
    }

    try {
      const response = await guardFetch("/api/auth/change-password", {
        method: "POST",
        headers: authHeaders({ "Content-Type": "application/json" }),
        credentials: "same-origin",
        body: JSON.stringify({ currentPassword, newPassword })
      });
      let payload = null;
      try {
        payload = await response.json();
      } catch (_e) {
        payload = null;
      }
      if (!response.ok) {
        if (errorEl) errorEl.textContent = (payload && payload.message) || "No se pudo actualizar la contraseña.";
        return;
      }
      clearMustChangePasswordFields();
      await resumeBootAfterPasswordChange();
    } catch (_error) {
      if (errorEl) errorEl.textContent = "Error de red actualizando contraseña.";
    } finally {
      if (submitBtn) submitBtn.disabled = false;
    }
  }

  async function resumeBootAfterPasswordChange() {
    const sessionUser = await loadSessionUser();
    if (!sessionUser) throw new Error("No se pudo cargar la sesión.");
    if (sessionUser.mustChangePassword) {
      state.sessionUser = sessionUser;
      applyMustChangePasswordGate(true);
      renderMustChangePasswordPanel();
      const errorEl = document.getElementById("pwaChangePasswordError");
      if (errorEl) errorEl.textContent = "Debes completar el cambio de contraseña.";
      return;
    }
    state.sessionUser = sessionUser;
    applySessionFromMe(sessionUser);
    applyMustChangePasswordGate(false);
    authHint.textContent = `${sessionRoleLabel()} · ${sessionUser.email || ""}`;
    await loadOperationalSources();
    if (OFFICIAL_APP) await loadOfficialProvisionalCaptures();
    updateSourceUi();
    render();
  }

  async function continueBootAfterAuth(sessionUser) {
    applySessionFromMe(sessionUser);
    authHint.textContent = `${sessionRoleLabel()} · ${sessionUser.email || ""}`;
    if (sessionMustChangePassword()) {
      applyMustChangePasswordGate(true);
      renderMustChangePasswordPanel();
      return;
    }
    applyMustChangePasswordGate(false);
    await loadOperationalSources();
    if (OFFICIAL_APP) await loadOfficialProvisionalCaptures();
    updateSourceUi();
    render();
  }

  function authHeaders(extra) {
    const headers = { Accept: "application/json", ...(extra || {}) };
    const token = readAccessToken();
    if (token) headers.Authorization = "Bearer " + token;
    return headers;
  }

  function guardFetch(input, init) {
    const method = String((init && init.method) || "GET").toUpperCase();
    const url = fetchUrlString(input);
    if (method !== "GET" && !isDemoWriteAllowed(url, method)) {
      state.blockedWrites += 1;
      writeGuard.textContent = `Escrituras bloqueadas: ${state.blockedWrites}`;
      return Promise.reject(new Error(`Demo read-only: ${method} bloqueado`));
    }
    return fetch(input, init);
  }

  async function apiFetch(path, init, soft) {
    const response = await guardFetch(path, {
      ...(init || {}),
      headers: authHeaders((init && init.headers) || {}),
      credentials: "same-origin"
    });
    let payload = null;
    try {
      payload = await response.json();
    } catch (_e) {
      payload = null;
    }
    if (soft) return { ok: response.ok, status: response.status, data: payload };
    if (response.status === 401) throw new Error("Sesión requerida.");
    if (!response.ok) throw new Error((payload && payload.message) || `${String((init && init.method) || "GET")} ${path} → ${response.status}`);
    return payload;
  }

  async function apiGet(path, soft) {
    return apiFetch(path, { method: "GET", cache: "no-store" }, soft);
  }

  async function loadSessionUser() {
    const result = await apiGet("/api/auth/me", true);
    if (!result.ok || !result.data) return null;
    return result.data;
  }

  function applySessionFromMe(user) {
    state.sessionUser = user;
    if (!isDirectorViewSwitchEnabled()) {
      const role = user.role;
      if (NAV[role]) {
        state.role = role;
        state.tab = ROLE_TAB_DEFAULT[role] || Object.keys(NAV[role].modules)[0];
        state.module = ROLE_DEFAULT[role] || (NAV[role].modules[state.tab] || [])[0]?.id || "control";
      }
    }
    syncRoleViewUi();
  }

  function clientDisplayName(client) {
    if (!client) return "Sin cliente";
    return client.tradeName || client.name || client.code || "Cliente";
  }

  function userStatusBadges(user) {
    const badges = [];
    if (user.isActive === false) badges.push('<span class="user-status-badge is-inactive">Inactivo</span>');
    else badges.push('<span class="user-status-badge is-active">Activo</span>');
    if (user.mustChangePassword) badges.push('<span class="user-status-badge must-change">Cambio obligatorio</span>');
    return badges.join(" ");
  }

  async function ensureClientsCache() {
    if (state.clientsCache.length) return state.clientsCache;
    const data = await apiGet("/api/clients");
    state.clientsCache = Array.isArray(data) ? data : [];
    return state.clientsCache;
  }

  function renderClientSelectOptions(selectedId, emptyLabel) {
    const clients = state.clientsCache.filter((c) => c.active !== false);
    const options = [`<option value="">${esc(emptyLabel || "— Seleccionar cliente —")}</option>`]
      .concat(
        clients.map(
          (c) =>
            `<option value="${esc(c.id)}"${selectedId === c.id ? " selected" : ""}>${esc(c.code || "—")} · ${esc(
              c.tradeName || c.name || c.code || "Cliente"
            )}</option>`
        )
      )
      .join("");
    return options;
  }

  async function loadUsersAdmin() {
    if (!isRealAdmin()) {
      state.usersMessage = "Este módulo requiere permisos de ADMIN.";
      state.usersCache = [];
      return;
    }
    await ensureClientsCache();
    const users = await apiGet("/api/users");
    state.usersCache = Array.isArray(users) ? users : [];
    state.usersMessage = `${state.usersCache.length} usuarios · ficha, rol, cliente y estado`;
  }

  function findUserById(userId) {
    return state.usersCache.find((row) => row.id === userId) || null;
  }

  const USER_TEMP_PASSWORD_COPY_LABEL = "COPIAR";
  const USER_TEMP_PASSWORD_COPY_OK = "COPIADO";
  const USER_TEMP_PASSWORD_COPY_FAIL = "COPIA NO DISPONIBLE";
  let userTempPasswordCopyResetTimer = null;
  let userTempPasswordCloseHandlers = [];

  function isUserTempPasswordModalOpen() {
    const modal = document.getElementById("userTempPasswordModal");
    return Boolean(modal && !modal.hidden);
  }

  function resetUserTempPasswordCopyFeedback(copyBtn, feedbackEl) {
    if (userTempPasswordCopyResetTimer) {
      window.clearTimeout(userTempPasswordCopyResetTimer);
      userTempPasswordCopyResetTimer = null;
    }
    if (copyBtn) copyBtn.textContent = USER_TEMP_PASSWORD_COPY_LABEL;
    if (feedbackEl) {
      feedbackEl.textContent = "";
      feedbackEl.hidden = true;
      feedbackEl.classList.add("hidden");
      feedbackEl.classList.remove("ok", "warn");
    }
  }

  async function copyTextWithFallback(text) {
    const value = String(text || "");
    if (!value) return false;
    if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
      try {
        await navigator.clipboard.writeText(value);
        return true;
      } catch (_e) {
        /* fallback below */
      }
    }
    try {
      const helper = document.createElement("textarea");
      helper.value = value;
      helper.setAttribute("readonly", "");
      helper.style.position = "fixed";
      helper.style.left = "-9999px";
      helper.style.opacity = "0";
      document.body.appendChild(helper);
      helper.focus();
      helper.select();
      const ok = document.execCommand("copy");
      helper.remove();
      return ok;
    } catch (_e) {
      return false;
    }
  }

  function showUserTempPasswordCopyFeedback(copyBtn, feedbackEl, ok) {
    resetUserTempPasswordCopyFeedback(copyBtn, feedbackEl);
    if (ok) {
      copyBtn.textContent = USER_TEMP_PASSWORD_COPY_OK;
      if (feedbackEl) {
        feedbackEl.textContent = USER_TEMP_PASSWORD_COPY_OK;
        feedbackEl.hidden = false;
        feedbackEl.classList.remove("hidden", "warn");
        feedbackEl.classList.add("ok");
      }
    } else {
      copyBtn.textContent = USER_TEMP_PASSWORD_COPY_FAIL;
      if (feedbackEl) {
        feedbackEl.textContent = USER_TEMP_PASSWORD_COPY_FAIL;
        feedbackEl.hidden = false;
        feedbackEl.classList.remove("hidden", "ok");
        feedbackEl.classList.add("warn");
      }
    }
    userTempPasswordCopyResetTimer = window.setTimeout(() => {
      resetUserTempPasswordCopyFeedback(copyBtn, feedbackEl);
    }, 2500);
  }

  function unwireUserTempPasswordCloseHandlers() {
    userTempPasswordCloseHandlers.forEach(({ el, handler }) => {
      el.removeEventListener("click", handler);
    });
    userTempPasswordCloseHandlers = [];
  }

  function wireUserTempPasswordCloseHandlers(modal) {
    unwireUserTempPasswordCloseHandlers();
    modal.querySelectorAll("[data-close-temp-password]").forEach((el) => {
      const handler = () => closeUserTempPasswordModal();
      el.addEventListener("click", handler);
      userTempPasswordCloseHandlers.push({ el, handler });
    });
  }

  function closeUserTempPasswordModal() {
    const modal = document.getElementById("userTempPasswordModal");
    const valueEl = document.getElementById("userTempPasswordValue");
    const copyBtn = document.getElementById("userTempPasswordCopyBtn");
    const feedbackEl = document.getElementById("userTempPasswordCopyFeedback");
    if (!modal) return;
    modal.hidden = true;
    modal.setAttribute("hidden", "");
    modal.classList.add("hidden");
    modal.setAttribute("aria-hidden", "true");
    if (valueEl) valueEl.textContent = "";
    resetUserTempPasswordCopyFeedback(copyBtn, feedbackEl);
  }

  function openUserTempPasswordModal(tempPassword) {
    const modal = document.getElementById("userTempPasswordModal");
    const valueEl = document.getElementById("userTempPasswordValue");
    const copyBtn = document.getElementById("userTempPasswordCopyBtn");
    const feedbackEl = document.getElementById("userTempPasswordCopyFeedback");
    if (!modal || !valueEl || !copyBtn || !tempPassword) return;
    resetUserTempPasswordCopyFeedback(copyBtn, feedbackEl);
    valueEl.textContent = String(tempPassword);
    modal.hidden = false;
    modal.removeAttribute("hidden");
    modal.classList.remove("hidden");
    modal.setAttribute("aria-hidden", "false");
    wireUserTempPasswordCloseHandlers(modal);
    copyBtn.onclick = async () => {
      const ok = await copyTextWithFallback(tempPassword);
      showUserTempPasswordCopyFeedback(copyBtn, feedbackEl, ok);
    };
  }

  function wireUserTempPasswordModalGlobal() {
    if (document.body.dataset.userTempPasswordWired === "1") return;
    document.body.dataset.userTempPasswordWired = "1";
    window.addEventListener("pageshow", (event) => {
      if (!event.persisted) return;
      closeUserTempPasswordModal();
    });
  }

  function openUserFormDrawer(mode, user) {
    const isCreate = mode === "create";
    const role = isCreate ? "OPERATOR" : user?.role || "OPERATOR";
    const clientId = isCreate ? "" : user?.clientId || "";
    const showClient = isCreate || isBoundOperationalRole(role) || Boolean(clientId);
    const fields = [
      {
        label: "Nombre",
        value: `<input id="userFormFullName" type="text" required value="${esc(isCreate ? "" : user?.fullName || "")}" />`,
        html: true
      },
      {
        label: "Email",
        value: `<input id="userFormEmail" type="email" required value="${esc(isCreate ? "" : user?.email || "")}" />`,
        html: true
      }
    ];
    if (isCreate) {
      fields.push({
        label: "Contraseña inicial",
        value: `<input id="userFormPassword" type="password" minlength="6" required autocomplete="new-password" />`,
        html: true
      });
    }
    fields.push(
      {
        label: "Rol",
        value: `<select id="userFormRole">${["ADMIN", "SUPERVISOR", "OPERATOR", "CLIENT"]
          .map((r) => `<option value="${r}"${role === r ? " selected" : ""}>${r}</option>`)
          .join("")}</select>`,
        html: true
      },
      {
        label: "Cliente",
        value: `<select id="userFormClientId"${showClient ? "" : " hidden"}>${renderClientSelectOptions(
          clientId,
          isCreate ? "— Seleccionar cliente —" : "— Sin cliente (solo ADMIN) —"
        )}</select>`,
        html: true
      }
    );
    if (!isCreate) {
      fields.push({
        label: "Estado",
        value: `<label class="users-active-toggle"><input id="userFormActive" type="checkbox"${user?.isActive !== false ? " checked" : ""} /> Activo</label>`,
        html: true
      });
    }
    openDetailDrawer(isCreate ? "Nuevo usuario" : `Usuario · ${user?.fullName || user?.email || ""}`, fields, [
      {
        id: "save-user",
        label: isCreate ? "Crear usuario" : "Guardar cambios",
        className: "btn-primary",
        onClick: () => (isCreate ? submitCreateUser() : submitEditUser(user.id))
      },
      ...(isCreate
        ? []
        : [
            user?.isActive === false
              ? {
                  id: "reactivate-user",
                  label: "Reactivar",
                  className: "btn-secondary",
                  onClick: () => submitReactivateUser(user.id)
                }
              : user?.id !== realSessionUserId()
                ? {
                    id: "deactivate-user",
                    label: "Desactivar",
                    className: "btn-secondary",
                    onClick: () => submitDeactivateUser(user.id)
                  }
                : null,
            {
              id: "reset-user-password",
              label: "Restablecer contraseña",
              className: "btn-secondary",
              onClick: () => submitResetUserPassword(user.id)
            }
          ].filter(Boolean)),
      { id: "close-user", label: "Cerrar", className: "btn-secondary", onClick: closeDetailDrawer }
    ]);
    const roleEl = document.getElementById("userFormRole");
    const clientEl = document.getElementById("userFormClientId");
    if (roleEl && clientEl) {
      const syncClientVisibility = () => {
        const nextRole = roleEl.value;
        const needsClient = isBoundOperationalRole(nextRole);
        clientEl.hidden = !needsClient && nextRole !== "ADMIN";
        clientEl.closest(".detail-field")?.classList.toggle("hidden", clientEl.hidden);
      };
      roleEl.addEventListener("change", syncClientVisibility);
      syncClientVisibility();
    }
  }

  async function refreshUsersModule() {
    await loadUsersAdmin();
    if (state.module === "users") renderContent();
  }

  async function submitCreateUser() {
    const fullName = document.getElementById("userFormFullName")?.value?.trim();
    const email = document.getElementById("userFormEmail")?.value?.trim();
    const password = document.getElementById("userFormPassword")?.value || "";
    const role = document.getElementById("userFormRole")?.value;
    const clientId = document.getElementById("userFormClientId")?.value || null;
    const payload = {
      fullName,
      email,
      password,
      role,
      clientId: isBoundOperationalRole(role) ? clientId : role === "ADMIN" ? clientId || null : null
    };
    try {
      await apiFetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      closeDetailDrawer();
      await refreshUsersModule();
    } catch (error) {
      window.alert(error.message || "No se pudo crear el usuario.");
    }
  }

  async function submitEditUser(userId) {
    const role = document.getElementById("userFormRole")?.value;
    const payload = {
      fullName: document.getElementById("userFormFullName")?.value?.trim(),
      email: document.getElementById("userFormEmail")?.value?.trim(),
      role,
      clientId: document.getElementById("userFormClientId")?.value || null,
      isActive: document.getElementById("userFormActive")?.checked !== false
    };
    try {
      await apiFetch(`/api/users/${encodeURIComponent(userId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      closeDetailDrawer();
      await refreshUsersModule();
    } catch (error) {
      window.alert(error.message || "No se pudo guardar la ficha.");
    }
  }

  async function submitDeactivateUser(userId) {
    if (!window.confirm("¿Desactivar este usuario? No podrá iniciar sesión.")) return;
    try {
      await apiFetch(`/api/users/${encodeURIComponent(userId)}`, { method: "DELETE" });
      closeDetailDrawer();
      await refreshUsersModule();
    } catch (error) {
      window.alert(error.message || "No se pudo desactivar el usuario.");
    }
  }

  async function submitReactivateUser(userId) {
    try {
      await apiFetch(`/api/users/${encodeURIComponent(userId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: true })
      });
      closeDetailDrawer();
      await refreshUsersModule();
    } catch (error) {
      window.alert(error.message || "No se pudo reactivar el usuario.");
    }
  }

  async function submitResetUserPassword(userId) {
    if (!window.confirm("¿Generar contraseña temporal para este usuario?")) return;
    try {
      const data = await apiFetch(`/api/users/${encodeURIComponent(userId)}/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({})
      });
      closeDetailDrawer();
      if (data?.temporaryPassword) openUserTempPasswordModal(data.temporaryPassword);
      await refreshUsersModule();
    } catch (error) {
      window.alert(error.message || "No se pudo restablecer la contraseña.");
    }
  }

  function renderUsersModule() {
    if (!isRealAdmin()) {
      return disabledModule("Usuarios y accesos", "Administración disponible solo para ADMIN autenticado.");
    }
    const list = state.usersCache
      .map((user) => {
        const clientLabel = clientDisplayName(user.client);
        const attrs = detailRowAttrs("user", user.id).replace(
          'class="detail-row"',
          'class="user-access-card detail-row"'
        );
        return `<article ${attrs}>
          <div class="user-access-head">
            <strong>${esc(user.fullName || user.email)}</strong>
            ${userStatusBadges(user)}
          </div>
          <p class="user-access-meta">${esc(user.email)} · ${esc(user.role)} · ${esc(clientLabel)}</p>
        </article>`;
      })
      .join("");
    return `<div class="module-screen-header">
        <h3>Usuarios y accesos</h3>
        <p class="module-lead">Administración de fichas oficiales, roles y accesos · solo ADMIN real</p>
      </div>
      <div class="users-access-toolbar">
        <p class="operational-table-meta">${esc(state.usersMessage || "Cargando usuarios…")}</p>
        <button type="button" class="btn-primary btn-compact" data-users-create>NUEVO USUARIO</button>
      </div>
      <div class="users-access-list">${list || '<div class="card-panel"><p>Sin usuarios registrados.</p></div>'}</div>`;
  }

  function renderConfigModule() {
    if (!isRealAdmin()) {
      return disabledModule("Configuración", "Configuración administrativa disponible solo para ADMIN autenticado.");
    }
    return `<div class="module-screen-header">
        <h3>Configuración</h3>
        <p class="module-lead">Accesos administrativos seguros · sin acciones destructivas en demo</p>
      </div>
      <div class="card-panel config-entry-card">
        <h4>Usuarios y accesos</h4>
        <p class="module-lead">Crear, editar, activar/desactivar usuarios y restablecer contraseñas temporales.</p>
        <button type="button" class="btn-primary btn-compact" data-open-users-module>Usuarios y accesos</button>
      </div>`;
  }

  function wireUsersModule() {
    app.querySelector("[data-users-create]")?.addEventListener("click", async () => {
      try {
        await ensureClientsCache();
        openUserFormDrawer("create");
      } catch (error) {
        window.alert(error.message || "No fue posible cargar clientes.");
      }
    });
    app.querySelector("[data-open-users-module]")?.addEventListener("click", () => navigateModule("users"));
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
    // POL-004 · fuentes documentales separadas: corte histórico 22-jun-2026 vs inventario oficial 14-ago-2026.
    // No mezclar corpus histórico con stock operativo en esta demo READ-ONLY.
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
    if (OFFICIAL_APP) {
      applyOfficialAppChrome();
      if (state.dataSource === "DB") {
        if (dataSourceFooter) dataSourceFooter.textContent = "Fuente: BD operativa";
        if (dataSourceBadge) dataSourceBadge.hidden = true;
      } else if (dataSourceFooter) {
        dataSourceFooter.textContent = "Fuente: sin datos";
      }
      return;
    }
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
        ${mobileTableScrollHint()}
        <div class="wide-table-scroll-shell"><table class="data-table"><thead><tr>
          <th>SKU</th><th>Descripción</th><th>Proyecto</th><th>Ubicación</th><th>Cant.</th><th>SAP</th><th>Pedido</th><th>Partida</th>
        </tr></thead>        <tbody>${slice
          .map(
            (r) => `<tr ${detailRowAttrs("stock", stockRowIndex(r))}>
              <td>${esc(r.product?.sku)}</td><td>${esc(r.product?.name)}</td>
              <td>${esc(r.project?.code || r.project?.name || "—")}</td>
              <td>${esc(r.location?.code)}</td><td>${esc(fmtQty(r.qty))}</td>
              <td>${esc(r.sap || "—")}</td><td>${esc(r.pedido || "—")}</td><td>${esc(r.partida || "—")}</td>
            </tr>`
          )
          .join("")}</tbody></table></div>
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
    const tableHtml = `${mobileTableScrollHint()}<div class="wide-table-scroll-shell"><table class="data-table task-row-compact"><thead><tr>
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
          .join("") : `<tr><td colspan="${compact ? 12 : 11}">Sin tareas de este tipo en la demo.</td></tr>`}</tbody></table></div>`;
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
        ? `<div class="free-scan-readings-wrap">${mobileTableScrollHint()}<table class="data-table free-scan-readings"><thead><tr>
            <th>Hora</th><th>RAW</th><th>Clasificación</th><th>Coincidencia</th><th>Producto</th><th>Ubicación</th><th>Proyecto</th>
          </tr></thead><tbody>${rows}</tbody></table></div>`
        : `<p class="operational-table-meta">Escanee códigos · identificación READ-ONLY · sesión en memoria.</p>`;
    }
    return session.readings.length
      ? `<div class="free-scan-readings-wrap">${mobileTableScrollHint()}<table class="data-table free-scan-readings"><thead><tr>
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
          (m) => `<tr ${detailRowAttrs("movement", state.movements.indexOf(m))}>
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
          (m) => `<tr ${detailRowAttrs("movement", state.movements.indexOf(m))}>
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
            (r) => `<tr ${detailRowAttrs("stock", stockRowIndex(r))}>
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
              (m) => `<tr ${detailRowAttrs("movement", state.movements.indexOf(m))}>
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
          .map((p) => `<tr ${detailRowAttrs("project", p.project)}><td>${esc(p.project)}</td><td>${esc(fmtQty(p.pieces))}</td><td>${esc(p.rows)}</td><td>${esc(p.locations.size)}</td></tr>`)
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
            .map((l) => `<tr ${detailRowAttrs("location", l.loc)}><td>${esc(l.loc)}</td><td>${esc(fmtQty(l.pieces))}</td><td>${esc(l.rows)}</td></tr>`)
            .join("")}</tbody></table>
        </div>
        <div class="card-panel"><h4>Principales proyectos</h4>
          <table class="data-table"><thead><tr><th>Proyecto</th><th>Piezas</th><th>Ubicaciones</th></tr></thead><tbody>${projs
            .map((p) => `<tr ${detailRowAttrs("project", p.project)}><td>${esc(p.project)}</td><td>${esc(fmtQty(p.pieces))}</td><td>${esc(p.locations.size)}</td></tr>`)
            .join("")}</tbody></table>
        </div>
      </div>`;
  }

  function clientExcelDemoSource() {
    return state.role === "CLIENT" && state.dataSource === "EXCEL";
  }

  function valuationView() {
    if (clientExcelDemoSource()) return clientExcelValuationUnavailableView();
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
        return `<tr ${detailRowAttrs("stock", stockRowIndex(row))}>
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
        ${mobileTableScrollHint()}
        <table class="data-table valuation-table"><thead><tr>
          <th>SKU</th><th>Descripción</th><th>Proyecto</th><th>Ubicación</th><th class="numeric-cell">Piezas</th><th class="numeric-cell">Valor unitario / rango</th><th class="numeric-cell">Valor total</th><th>Estado</th>
        </tr></thead><tbody>${tableRows || '<tr><td colspan="8">Sin existencias en la fuente actual.</td></tr>'}</tbody></table>
      </div>`;
  }

  function clientExcelValuationUnavailableView() {
    const rows = state.stock || [];
    const visibleRows = rows.slice(0, 200);
    const notice = "Valuación no disponible en esta fuente demo. El Excel oficial no incluye precios unitarios ni importes.";
    const tableRows = visibleRows
      .map(
        (row) => `<tr ${detailRowAttrs("stock", stockRowIndex(row))}>
          <td>${esc(row.product?.sku || "—")}</td>
          <td>${esc(row.product?.name || "—")}</td>
          <td>${esc(row.project?.code || row.project?.name || "Sin proyecto")}</td>
          <td>${esc(row.location?.code || "—")}</td>
          <td class="numeric-cell">${esc(fmtQty(row.qty))}</td>
          <td class="numeric-cell valuation-unit">—</td>
          <td class="numeric-cell valuation-total">—</td>
          <td><span class="valuation-status none">N/D demo</span></td>
        </tr>`
      )
      .join("");
    return `<div class="module-screen-header"><h3>Precios y valuación</h3>
      <p class="module-lead">Consulta económica autorizada para el rol actual · DEMO READ-ONLY</p></div>
      <div class="card-panel ops-message warn">${esc(notice)}</div>
      <div class="valuation-summary-grid valuation-summary-unavailable">
        <div class="kpi-card accent valuation-money-card"><span class="kpi-value valuation-money-value">—</span><span class="kpi-label">Valor inventario MXN</span></div>
        <div class="kpi-card ok"><span class="kpi-value">—</span><span class="kpi-label">Piezas valuadas</span></div>
        <div class="kpi-card warn"><span class="kpi-value">—</span><span class="kpi-label">Piezas sin valor</span></div>
        <div class="kpi-card"><span class="kpi-value">—</span><span class="kpi-label">Cobertura económica</span></div>
      </div>
      <div class="card-panel valuation-table-wrap">
        <p class="operational-table-meta">${esc(rows.length)} saldos · mostrando ${esc(visibleRows.length)} · valuación económica no disponible en Excel demo</p>
        ${mobileTableScrollHint()}
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
        .map((l) => `<tr ${detailRowAttrs("location", l.loc)}><td>${esc(l.loc)}</td><td>${esc(fmtQty(l.pieces))}</td><td>${esc(l.rows)}</td><td>${esc(l.projects.size)}</td></tr>`)
        .join("")}</tbody></table></div>`;
    }
    if (m === "projects") {
      const projs = aggregateProjects();
      return `<div class="module-screen-header"><h3>Proyectos</h3></div><div class="card-panel"><table class="data-table"><thead><tr><th>Proyecto</th><th>Piezas</th><th>Registros</th><th>Ubicaciones</th></tr></thead><tbody>${projs
        .map((p) => `<tr ${detailRowAttrs("project", p.project)}><td>${esc(p.project)}</td><td>${esc(fmtQty(p.pieces))}</td><td>${esc(p.rows)}</td><td>${esc(p.locations.size)}</td></tr>`)
        .join("")}</tbody></table></div>`;
    }
    if (m === "products") {
      const prods = aggregateProducts();
      return `<div class="module-screen-header"><h3>Productos / catálogo</h3></div><div class="card-panel"><table class="data-table"><thead><tr><th>SKU</th><th>Descripción</th><th>Piezas</th><th>Registros</th></tr></thead><tbody>${prods
        .slice(0, 100)
        .map((p) => `<tr ${detailRowAttrs("product", p.sku)}><td>${esc(p.sku)}</td><td>${esc(p.name)}</td><td>${esc(fmtQty(p.pieces))}</td><td>${esc(p.rows)}</td></tr>`)
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
    if (m === "users") return renderUsersModule();
    if (m === "reports" && state.role === "CLIENT") return clientReportsView();
    if (m === "reports" || m === "exports") return disabledModule(m === "reports" ? "Reportes" : "Exportaciones", "Exportes y reportes del WMS real · READ-ONLY en demo.");
    if (m === "config") return renderConfigModule();
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
        stopDemoCamera("Cámara detenida al cambiar de sección.");
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
              <span class="module-btn-desc">${esc(officializeCopy(m.desc))}</span>
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
          fb.textContent = officializeCopy("Diferencia reportada · DEMO — supervisor notificado");
        }
      });
      return;
    }
    if (state.freeScanActive) {
      wireScannerInput((input) => submitFreeScanReading(input), "Captura manual · escriba y Enter");
    }
    wireUsersModule();
  }

  function renderContent() {
    if (!app) return;
    stopDemoCamera("");
    syncFlowTheme();
    app.innerHTML = finalizeOfficialHtml(renderProvisionalApiNotice() + renderModule());
    wireContent();
  }

  function render() {
    ensureDirectorMobilePanelClosed(false);
    syncRoleViewUi();
    syncSupervisorOperatorModeUi();
    syncFlowTheme();
    syncConcentrationUi();
    renderSectionTabs();
    renderSidebar();
    renderContent();
    syncMobileLayoutUi();
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
    btn.addEventListener("click", () => {
      if (!isDirectorViewSwitchEnabled()) return;
      applyDirectorView(btn.getAttribute("data-role") || "OPERATOR");
    });
  });

  async function loadOperationalSources() {
    if (OFFICIAL_APP) {
      if (!(await loadDbSource())) {
        throw new Error("No hay inventario operativo disponible en la base de datos.");
      }
      return;
    }
    if (!(await loadDbSource())) await loadExcelSource();
  }

  async function loadDbSource() {
    const summaryResult = await apiGet("/api/inventory/summary", true);
    if (!summaryResult.ok || !summaryResult.data || !dbHasInventory(summaryResult.data)) return false;
    const [movementsResult, stockResult] = await Promise.all([
      apiGet("/api/inventory/movements?limit=10", true),
      apiGet("/api/inventory/stock", true)
    ]);
    applyDbPayload(summaryResult.data, movementsResult.data || {}, stockResult.ok ? stockResult.data : []);
    if (OFFICIAL_APP && state.sessionUser) {
      authHint.textContent = `${sessionRoleLabel()} · ${fmtQty(summaryResult.data.qty)} piezas`;
    } else {
      authHint.textContent = `BD READ-ONLY · ${fmtQty(summaryResult.data.qty)} piezas`;
    }
    return true;
  }

  async function loadExcelSource() {
    if (OFFICIAL_APP) return false;
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
    closeUserTempPasswordModal();
    wireUserTempPasswordModalGlobal();
    applyOfficialAppChrome();
    if (appDateTime) appDateTime.textContent = new Date().toLocaleString("es-MX");
    resetDemoStartupView();
    syncDirectorReviewChrome();
    wireAppShellActions();
    wireDetailDrawer();
    initDirectorViewBar();
    wireConcentration();
    wireSupervisorOperatorMode();
    syncConcentrationUi();
    syncRoleViewUi();
    try {
      if (!readAccessToken()) {
        authHint.textContent = "Sesión requerida";
        app.innerHTML = `<div class="card-panel"><p><a href="/login.html?next=${encodeURIComponent(officialLoginNextPath())}">Iniciar sesión</a> · mismo host</p></div>`;
        renderSectionTabs();
        renderSidebar();
        return;
      }
      const sessionUser = await loadSessionUser();
      if (!sessionUser) throw new Error("No se pudo cargar la sesión.");
      await continueBootAfterAuth(sessionUser);
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
      const url = fetchUrlString(args[0]);
      if (url.includes("/api/") && method !== "GET" && !isDemoWriteAllowed(url, method)) {
        state.blockedWrites += 1;
        writeGuard.textContent = `Escrituras bloqueadas: ${state.blockedWrites}`;
        return Promise.reject(new Error("Demo read-only"));
      }
      return Reflect.apply(target, thisArg, args);
    }
  });

  boot();
})();
