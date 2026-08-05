/* LOGITEC CORE WMS — Dashboard V2
   Interfaz paralela. Usa APIs y token existentes. No depende del dashboard v1. */

(function () {
  "use strict";

  const token = localStorage.getItem("token");
  if (!token) {
    window.location.replace("/login.html");
    return;
  }

  /** @type {{ id?: string, fullName?: string, email?: string, role?: string } | null} */
  let currentUser = null;

  /** @type {any[]} */
  let stockRows = [];
  /** @type {any[]} */
  let products = [];
  /** @type {any[]} */
  let movements = [];
  /** @type {any[]} */
  let incidents = [];
  /** @type {any[]} */
  let tasks = [];
  /** @type {any[]} */
  let activity = [];
  /** @type {any[]} */
  let usersList = [];
  /** @type {any[]} */
  let assignees = [];

  let selectedProject = "";
  let loadedHome = false;
  let loadedInventory = false;
  let loadedControl = false;
  let loadedSystem = false;

  const INTERNAL_NOTICE_LABEL = "Aviso interno";

  const TRACE_LABELS = {
    inventory_csv_batch: "Carga de inventario",
    catalog_bulk: "Carga de catálogo",
    CSV_CATALOG: "Importación de catálogo",
    CSV_INVENTORY: "Importación de inventario",
    MANUAL_IN: "Entrada manual",
    MANUAL_OUT: "Salida manual",
    PICK: "Picking / surtido",
    "N/D": "No especificado",
    ND: "No especificado",
    IN: "Entrada",
    OUT: "Salida",
    OUTBOUND: "Salida",
    INBOUND: "Entrada",
    IMPORT: "Importación",
    ADJUSTMENT: "Ajuste",
    MOVE: "Movimiento",
    COUNT: "Conteo",
    RECEIVE: "Recepción"
  };

  const INCIDENT_LABELS = {
    DOUBLE_SCAN: "Doble escaneo",
    DAMAGED: "Producto dañado",
    STOCK_MISMATCH: "Diferencia de inventario",
    WRONG_LOCATION: "Ubicación incorrecta",
    MISSING_PRODUCT: "Producto faltante"
  };

  const STATUS_LABELS = {
    PENDING: "Pendiente",
    ASSIGNED: "Asignada",
    IN_PROGRESS: "En proceso",
    COMPLETED: "Completada",
    REJECTED: "Rechazada",
    CANCELLED: "Cancelada",
    OPEN: "Abierta",
    REVIEWING: "En revisión",
    APPROVED: "Aprobada",
    RESOLVED: "Resuelta"
  };

  /* ——— helpers ——— */

  function $(id) {
    return document.getElementById(id);
  }

  function esc(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function toast(message, kind) {
    const stack = $("toastStack");
    if (!stack) return;
    const el = document.createElement("div");
    el.className = "toast" + (kind === "ok" ? " ok" : kind === "err" ? " err" : "");
    el.textContent = message;
    stack.appendChild(el);
    setTimeout(() => el.remove(), 4200);
  }

  function setBanner(id, text, kind) {
    const el = $(id);
    if (!el) return;
    if (!text) {
      el.classList.add("hidden");
      el.textContent = "";
      return;
    }
    el.className = "banner banner-" + (kind || "info");
    el.textContent = text;
    el.classList.remove("hidden");
  }

  function logout() {
    localStorage.removeItem("token");
    window.location.replace("/login.html");
  }

  async function api(path, options) {
    const opts = options || {};
    const headers = Object.assign(
      { Authorization: "Bearer " + token },
      opts.headers || {}
    );
    let response;
    try {
      response = await fetch(path, Object.assign({}, opts, { headers }));
    } catch (_e) {
      throw new Error("Error de red. Verifica tu conexión.");
    }
    if (response.status === 401) {
      logout();
      throw new Error("Sesión expirada");
    }
    return response;
  }

  async function apiJson(path, options) {
    const response = await api(path, options);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const msg = data.message || data.error || "No se pudo completar la solicitud (" + response.status + ").";
      const err = new Error(msg);
      err.status = response.status;
      throw err;
    }
    return data;
  }

  function parseNotes(notes) {
    if (!notes) return {};
    if (typeof notes === "object") return notes;
    try {
      const parsed = JSON.parse(notes);
      return parsed && typeof parsed === "object" ? parsed : { description: String(notes) };
    } catch (_e) {
      return { description: String(notes) };
    }
  }

  function isInternalNotice(task) {
    const notes = parseNotes(task.notes);
    const label = String(notes.taskLabel || "").trim().toLowerCase();
    return label === INTERNAL_NOTICE_LABEL.toLowerCase();
  }

  function translateTraceType(raw) {
    if (raw == null || raw === "") return TRACE_LABELS["N/D"];
    const key = String(raw).trim();
    if (TRACE_LABELS[key]) return TRACE_LABELS[key];
    const lower = key.toLowerCase();
    for (const [k, v] of Object.entries(TRACE_LABELS)) {
      if (k.toLowerCase() === lower) return v;
    }
    return key.replace(/_/g, " ");
  }

  function statusBadgeHtml(status) {
    const s = String(status || "").toUpperCase();
    let cls = "badge-gray";
    if (s === "OPEN" || s === "PENDING" || s === "ASSIGNED") cls = "badge-amber";
    if (s === "IN_PROGRESS" || s === "REVIEWING") cls = "badge-blue";
    if (s === "COMPLETED" || s === "RESOLVED" || s === "APPROVED") cls = "badge-green";
    if (s === "REJECTED" || s === "CANCELLED") cls = "badge-red";
    const label = STATUS_LABELS[s] || status || "—";
    return '<span class="badge ' + cls + '">' + esc(label) + "</span>";
  }

  function formatDate(value) {
    if (!value) return "—";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "—";
    return d.toLocaleString("es-MX", {
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit"
    });
  }

  function uniqueSorted(values) {
    const set = new Set();
    for (const v of values) {
      const s = String(v || "").trim();
      if (s) set.add(s);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, "es"));
  }

  function projectFromStock(row) {
    return (
      row?.product?.customer?.code ||
      row?.product?.customer?.name ||
      row?.customerCode ||
      row?.customerName ||
      ""
    );
  }

  function warehouseFromStock(row) {
    return row?.location?.warehouse || row?.warehouse || "";
  }

  function locationFromStock(row) {
    return row?.location?.code || row?.locationCode || row?.location || "";
  }

  function qtyFromStock(row) {
    const q = row?.quantity ?? row?.qty ?? row?.onHand;
    const n = Number(q);
    return Number.isFinite(n) ? n : 0;
  }

  function statusFromStock(row) {
    return row?.status || row?.stockStatus || "AVAILABLE";
  }

  /* ——— navigation ——— */

  const TAB_ORDER = ["inicio", "operacion", "inventario", "control", "sistema"];

  /**
   * El scroll vive en .app-stage (no en window).
   * Al cambiar de pestaña SIEMPRE arrancar desde arriba.
   */
  function resetV2Scroll() {
    const stage = document.querySelector(".app-stage");
    if (stage) {
      stage.scrollTop = 0;
      stage.scrollLeft = 0;
    }
    try {
      window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    } catch (_e) {
      window.scrollTo(0, 0);
    }
    if (document.documentElement) document.documentElement.scrollTop = 0;
    if (document.body) document.body.scrollTop = 0;
  }

  function setTab(tabId) {
    document.querySelectorAll(".app-tab").forEach((tab) => {
      const active = tab.getAttribute("data-tab") === tabId;
      tab.classList.toggle("active", active);
      tab.setAttribute("aria-selected", active ? "true" : "false");
    });
    document.querySelectorAll(".view, .section-view").forEach((view) => {
      view.classList.toggle("active", view.getAttribute("data-view") === tabId);
    });
    const panel = $("stagePanel");
    if (panel) {
      const idx = TAB_ORDER.indexOf(tabId);
      let corner = "mid";
      if (idx <= 0) corner = "first";
      else if (idx === TAB_ORDER.length - 1) corner = "last";
      panel.setAttribute("data-corner", corner);
    }
    // Reset scroll ANTES de cargar datos async: la vista nueva se ve desde el top.
    resetV2Scroll();
    void onTabEnter(tabId).finally(() => {
      // Por si el DOM creció con datos, re-asegurar inicio de vista.
      resetV2Scroll();
    });
  }

  async function onTabEnter(tabId) {
    if (tabId === "inicio") await loadHome(false);
    if (tabId === "operacion") {
      // Mantener detalle si ya hay uno; si no, no force nada
    }
    if (tabId === "inventario") await loadInventory(false);
    if (tabId === "control") await loadControl(false);
    if (tabId === "sistema") await loadSystem(false);
  }

  function setControlSub(sub) {
    document.querySelectorAll("#controlSubnav button").forEach((btn) => {
      btn.classList.toggle("active", btn.getAttribute("data-control-sub") === sub);
    });
    $("controlSub-incidents")?.classList.toggle("hidden", sub !== "incidents");
    $("controlSub-trace")?.classList.toggle("hidden", sub !== "trace");
  }

  function setSystemSub(sub) {
    document.querySelectorAll("#systemSubnav button").forEach((btn) => {
      btn.classList.toggle("active", btn.getAttribute("data-system-sub") === sub);
    });
    $("systemSub-notices")?.classList.toggle("hidden", sub !== "notices");
    $("systemSub-users")?.classList.toggle("hidden", sub !== "users");
    $("systemSub-account")?.classList.toggle("hidden", sub !== "account");
  }

  /**
   * Navegación segura hacia el dashboard clásico.
   * Siempre en pestaña nueva: no rompe la sesión visual de V2.
   */
  function openClassicInNewTab(module) {
    const base = "/dashboard.html";
    const url = module ? base + "#module=" + encodeURIComponent(module) : base;
    window.open(url, "_blank", "noopener,noreferrer");
  }

  /** @deprecated usar openClassicInNewTab — se mantiene por compatibilidad de nombres internos */
  function openStable(module) {
    openClassicInNewTab(module);
  }

  const OPS_MODULES = {
    inbound: {
      id: "inbound",
      title: "Entradas / Recepción",
      effect: "Aumenta inventario",
      summary:
        "Registra mercancía recibida y aumenta existencias por proyecto, lote y ubicación. Es el ingreso formal al almacén.",
      steps: [
        "Identifica proyecto y SKU (o código de barras).",
        "Indica cantidad, almacén y ubicación destino.",
        "Confirma la entrada; el saldo disponible se incrementa."
      ],
      classicModule: "inbound",
      classicLabel: "Abrir captura clásica"
    },
    requisitions: {
      id: "requisitions",
      title: "Órdenes de surtido",
      effect: "Solicita trabajo (no mueve stock sola)",
      summary:
        "Crea solicitudes / requisiciones para preparar mercancía de salida. No descuenta existencias por sí sola: alimenta la cola de trabajo y el picking.",
      steps: [
        "Define folio, proyecto y líneas (SKU + cantidad).",
        "La orden queda como tarea operativa de surtido.",
        "El stock se mueve al ejecutar picking o salida."
      ],
      classicModule: "requisitions",
      classicLabel: "Abrir captura clásica"
    },
    picking: {
      id: "picking",
      title: "Picking / Surtido de salida",
      effect: "Ejecuta surtido con escaneo",
      summary:
        "Prepara productos para despacho mediante escaneo y validación. Es la ejecución operativa del surtido, no una entrada de mercancía.",
      steps: [
        "Escanea códigos de barras o captura SKU.",
        "Valida producto y ubicación disponibles.",
        "Registra el progreso de surtido y trazabilidad."
      ],
      classicModule: "picking",
      classicLabel: "Abrir captura clásica"
    },
    relocate: {
      id: "relocate",
      title: "Movimiento interno / Reubicación",
      effect: "Solicitud segura (no mueve stock automática)",
      summary:
        "Crea una orden de reubicación entre ubicaciones. Por seguridad en V2, la captura clásica genera la solicitud operativa; el stock real se confirma en el flujo validado.",
      steps: [
        "Define SKU, cantidad, almacén, origen y destino.",
        "Se genera una solicitud / tarea de tipo movimiento.",
        "No se ejecuta OUT+IN automático sin control."
      ],
      classicModule: "relocate",
      classicLabel: "Abrir captura clásica"
    },
    outbound: {
      id: "outbound",
      title: "Salidas / Despacho",
      effect: "Descuenta inventarios",
      summary:
        "Confirma la salida final de mercancía del almacén. Descuenta existencias y registra el despacho operativo.",
      steps: [
        "Identifica proyecto, SKU y ubicación origen.",
        "Indica cantidad y referencia de despacho.",
        "Confirma la salida; el saldo se reduce."
      ],
      classicModule: "outbound",
      classicLabel: "Abrir captura clásica"
    }
  };

  function showOpsDetail(moduleId) {
    const data = OPS_MODULES[moduleId];
    const panel = $("opsDetailPanel");
    if (!panel || !data) return;
    panel.classList.remove("hidden");
    const title = $("opsDetailTitle");
    const effect = $("opsDetailEffect");
    const summary = $("opsDetailSummary");
    const steps = $("opsDetailSteps");
    const classic = $("opsDetailClassicBtn");
    if (title) title.textContent = data.title;
    if (effect) effect.textContent = data.effect;
    if (summary) summary.textContent = data.summary;
    if (steps) {
      steps.innerHTML = data.steps.map((s) => "<li>" + esc(s) + "</li>").join("");
    }
    if (classic) {
      classic.setAttribute("data-open-classic", data.classicModule);
      classic.textContent = data.classicLabel;
    }
    // Scroll panel into view inside app-stage
    try {
      panel.scrollIntoView({ block: "nearest", behavior: "smooth" });
    } catch (_e) {
      /* ignore */
    }
  }

  function openOpsInV2(moduleId) {
    setTab("operacion");
    // Tras setTab/reset, pintar el detalle y quedar en V2.
    window.requestAnimationFrame(() => {
      showOpsDetail(moduleId || "inbound");
    });
  }

  /* ——— data loads ——— */

  async function loadSession() {
    try {
      currentUser = await apiJson("/api/auth/me");
      const displayName = currentUser.fullName || currentUser.email || "Usuario";
      const firstName = String(displayName).split(/\s+/)[0] || displayName;
      if ($("sessionName")) $("sessionName").textContent = firstName;
      if ($("sessionRoleChip")) $("sessionRoleChip").textContent = currentUser.role || "—";
      if ($("sessionMeta")) $("sessionMeta").textContent = currentUser.email || "—";
      if ($("accountName")) $("accountName").value = currentUser.fullName || "";
      if ($("accountEmail")) $("accountEmail").value = currentUser.email || "";
      if ($("accountRole")) $("accountRole").value = currentUser.role || "";
    } catch (e) {
      toast(e.message || "No se pudo cargar la sesión", "err");
      throw e;
    }
  }

  async function safeGet(path, fallback) {
    try {
      return await apiJson(path);
    } catch (_e) {
      return fallback;
    }
  }

  async function loadCoreData(force) {
    if (!force && stockRows.length) {
      return;
    }
    const [stockRes, productsRes, movRes, incidentsRes, tasksRes] = await Promise.all([
      safeGet("/api/inventory/stock", []),
      safeGet("/api/catalog/products", []),
      safeGet("/api/inventory/movements?limit=200", []),
      safeGet("/api/incidents", []),
      safeGet("/api/tasks", [])
    ]);
    stockRows = Array.isArray(stockRes) ? stockRes : [];
    products = Array.isArray(productsRes) ? productsRes : [];
    movements = Array.isArray(movRes) ? movRes : [];
    incidents = Array.isArray(incidentsRes) ? incidentsRes : [];
    tasks = Array.isArray(tasksRes) ? tasksRes : [];
  }

  /* ——— Inicio ——— */

  async function loadHome(force) {
    if (loadedHome && !force) return;
    setBanner("homeBanner", "");
    try {
      await loadCoreData(force);
      const projects = uniqueSorted(stockRows.map(projectFromStock).concat(products.map((p) => p.customer?.code || p.customerCode)));
      const locations = uniqueSorted(stockRows.map(locationFromStock));
      const openIncidents = incidents.filter((i) => {
        const s = String(i.status || "").toUpperCase();
        return s === "OPEN" || s === "REVIEWING" || !s;
      });
      const pendingTasks = tasks.filter((t) => {
        if (isInternalNotice(t)) return false;
        const s = String(t.status || "").toUpperCase();
        return s === "PENDING" || s === "ASSIGNED" || s === "IN_PROGRESS";
      });
      const openNotices = tasks.filter((t) => {
        if (!isInternalNotice(t)) return false;
        const s = String(t.status || "").toUpperCase();
        return s !== "COMPLETED" && s !== "CANCELLED" && s !== "REJECTED";
      });

      $("kpiProducts").textContent = String(products.length);
      $("kpiProjects").textContent = String(projects.length);
      $("kpiLocations").textContent = String(locations.length);
      $("kpiStock").textContent = String(stockRows.length);
      $("kpiMovements").textContent = String(movements.length);
      $("kpiIncidents").textContent = String(openIncidents.length);
      $("kpiTasks").textContent = String(pendingTasks.length);
      $("kpiNotices").textContent = String(openNotices.length);
      loadedHome = true;
    } catch (e) {
      setBanner("homeBanner", e.message || "No se pudo cargar el resumen.", "error");
    }
  }

  /* ——— Inventario ——— */

  function projectStats(code) {
    const rows = stockRows.filter((r) => projectFromStock(r) === code);
    const qty = rows.reduce((sum, r) => sum + qtyFromStock(r), 0);
    return { lines: rows.length, qty };
  }

  function selectProject(code) {
    selectedProject = code || "";
    buildProjectChips();
    renderInventoryTable();
  }

  function buildProjectChips() {
    const wrap = $("projectChips");
    const cards = $("projectCards");
    const projects = uniqueSorted(stockRows.map(projectFromStock));
    if ($("projectsCountMeta")) {
      $("projectsCountMeta").textContent = projects.length + " proyecto(s)";
    }

    if (wrap) {
      const chips = [
        { value: "", label: "Todos" },
        ...projects.map((p) => ({ value: p, label: p }))
      ];
      wrap.innerHTML = chips
        .map(
          (c) =>
            '<button type="button" class="chip' +
            (selectedProject === c.value ? " active" : "") +
            '" data-project="' +
            esc(c.value) +
            '" title="' +
            esc(c.label) +
            '">' +
            esc(c.label) +
            "</button>"
        )
        .join("");
      wrap.querySelectorAll(".chip").forEach((btn) => {
        btn.addEventListener("click", () => {
          selectProject(btn.getAttribute("data-project") || "");
        });
      });
    }

    if (cards) {
      if (!projects.length) {
        cards.innerHTML =
          '<div class="empty-state" style="grid-column:1/-1">No hay proyectos detectados en inventario.</div>';
        return;
      }
      cards.innerHTML = projects
        .map((code) => {
          const stats = projectStats(code);
          const pretty = code.replace(/_/g, " ");
          return (
            '<button type="button" class="project-card' +
            (selectedProject === code ? " active" : "") +
            '" data-project="' +
            esc(code) +
            '" title="' +
            esc(code) +
            '">' +
            '<span class="proj-name">' +
            esc(pretty) +
            "</span>" +
            '<span class="proj-code">' +
            esc(code) +
            "</span>" +
            '<span class="proj-meta">' +
            esc(String(stats.lines)) +
            " líneas · qty " +
            esc(String(Math.round(stats.qty * 1000) / 1000)) +
            "</span>" +
            "</button>"
          );
        })
        .join("");
      cards.querySelectorAll(".project-card").forEach((btn) => {
        btn.addEventListener("click", () => {
          const code = btn.getAttribute("data-project") || "";
          selectProject(selectedProject === code ? "" : code);
        });
      });
    }
  }

  function fillSelect(select, values, emptyLabel) {
    if (!select) return;
    const prev = select.value;
    const opts = ['<option value="">' + esc(emptyLabel || "Todos") + "</option>"].concat(
      values.map((v) => '<option value="' + esc(v) + '">' + esc(v) + "</option>")
    );
    select.innerHTML = opts.join("");
    if (prev && values.includes(prev)) select.value = prev;
  }

  function filteredStock() {
    const wh = $("invFilterWarehouse")?.value || "";
    const loc = $("invFilterLocation")?.value || "";
    const st = $("invFilterStatus")?.value || "";
    const q = ($("invFilterText")?.value || "").trim().toLowerCase();

    return stockRows.filter((row) => {
      const project = projectFromStock(row);
      if (selectedProject && project !== selectedProject) return false;
      if (wh && warehouseFromStock(row) !== wh) return false;
      if (loc && locationFromStock(row) !== loc) return false;
      if (st && statusFromStock(row) !== st) return false;
      if (q) {
        const hay = [
          row?.product?.sku,
          row?.product?.name,
          row?.product?.barcode,
          project,
          locationFromStock(row)
        ]
          .join(" ")
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }

  function renderInventoryTable() {
    const body = $("inventoryBody");
    if (!body) return;
    const rows = filteredStock();
    $("inventoryMeta").textContent =
      rows.length + " de " + stockRows.length + " líneas · filtro activo de proyectos";

    if (!rows.length) {
      body.innerHTML =
        '<tr><td colspan="7"><div class="empty-state">No hay existencias con los filtros actuales.</div></td></tr>';
      return;
    }

    body.innerHTML = rows
      .slice(0, 300)
      .map((row) => {
        const project = projectFromStock(row) || "—";
        const wh = warehouseFromStock(row) || "—";
        const loc = locationFromStock(row) || "—";
        const sku = row?.product?.sku || "—";
        const name = row?.product?.name || "—";
        const qty = qtyFromStock(row);
        const status = statusFromStock(row);
        return (
          "<tr>" +
          '<td class="cell-ellip" title="' +
          esc(project) +
          '">' +
          esc(project) +
          "</td>" +
          '<td class="cell-ellip">' +
          esc(wh) +
          "</td>" +
          '<td class="cell-ellip" title="' +
          esc(loc) +
          '">' +
          esc(loc) +
          "</td>" +
          '<td class="cell-ellip"><span class="qty">' +
          esc(sku) +
          "</span></td>" +
          '<td class="cell-ellip" title="' +
          esc(name) +
          '">' +
          esc(name) +
          "</td>" +
          '<td><span class="qty">' +
          esc(String(qty)) +
          "</span></td>" +
          "<td>" +
          '<span class="badge badge-blue">' +
          esc(status) +
          "</span></td>" +
          "</tr>"
        );
      })
      .join("");
  }

  async function loadInventory(force) {
    if (loadedInventory && !force) {
      renderInventoryTable();
      return;
    }
    setBanner("inventoryBanner", "");
    $("inventoryMeta").textContent = "Cargando existencias…";
    try {
      await loadCoreData(force);
      buildProjectChips();
      fillSelect($("invFilterWarehouse"), uniqueSorted(stockRows.map(warehouseFromStock)), "Todos");
      fillSelect($("invFilterLocation"), uniqueSorted(stockRows.map(locationFromStock)), "Todas");
      fillSelect($("invFilterStatus"), uniqueSorted(stockRows.map(statusFromStock)), "Todos");
      renderInventoryTable();
      loadedInventory = true;
      if (!stockRows.length) {
        setBanner(
          "inventoryBanner",
          "No hay saldos de inventario visibles para tu rol o aún no hay datos cargados.",
          "warn"
        );
      }
    } catch (e) {
      setBanner("inventoryBanner", e.message || "No se pudo cargar inventario.", "error");
      $("inventoryMeta").textContent = "Error al cargar";
    }
  }

  /* ——— Control ——— */

  function renderIncidents() {
    const body = $("incidentsBody");
    if (!body) return;
    $("incidentsMeta").textContent = incidents.length + " registros";
    if (!incidents.length) {
      body.innerHTML =
        '<tr><td colspan="8"><div class="empty-state">Sin incidencias registradas.</div></td></tr>';
      return;
    }
    body.innerHTML = incidents
      .slice(0, 100)
      .map((i) => {
        const typeLabel = INCIDENT_LABELS[i.type] || i.type || "—";
        const product = i.product?.sku || "—";
        const notes = (i.notes || "").replace(/\s+/g, " ").slice(0, 80);
        return (
          "<tr>" +
          '<td class="cell-muted">' +
          esc(formatDate(i.createdAt)) +
          "</td>" +
          "<td>" +
          esc(typeLabel) +
          "</td>" +
          "<td>" +
          statusBadgeHtml(i.status) +
          "</td>" +
          '<td class="cell-ellip">' +
          esc(i.warehouse || "—") +
          "</td>" +
          '<td class="cell-ellip">' +
          esc(i.location || "—") +
          "</td>" +
          '<td class="cell-ellip">' +
          esc(product) +
          "</td>" +
          '<td class="cell-ellip" title="' +
          esc(i.notes || "") +
          '">' +
          esc(notes || "—") +
          "</td>" +
          '<td class="cell-ellip">' +
          esc(i.reportedBy?.fullName || "—") +
          "</td>" +
          "</tr>"
        );
      })
      .join("");
  }

  function renderTrace() {
    const body = $("traceBody");
    if (!body) return;
    $("traceMeta").textContent = activity.length + " eventos";
    if (!activity.length) {
      body.innerHTML =
        '<tr><td colspan="7"><div class="empty-state">Sin actividad reciente.</div></td></tr>';
      return;
    }
    body.innerHTML = activity
      .slice(0, 150)
      .map((row) => {
        const rawType = row.type || row.action || row.reference || "N/D";
        const label = translateTraceType(rawType);
        const detail = row.detail || row.notes || row.message || row.reference || "";
        return (
          "<tr>" +
          '<td class="cell-muted">' +
          esc(formatDate(row.createdAt)) +
          "</td>" +
          "<td><span class=\"badge badge-teal\">" +
          esc(label) +
          "</span></td>" +
          '<td class="cell-ellip cell-muted" title="' +
          esc(rawType) +
          " · " +
          esc(detail) +
          '">' +
          esc(String(rawType)) +
          "</td>" +
          '<td class="cell-ellip">' +
          esc(row.product?.sku || "—") +
          "</td>" +
          '<td class="cell-ellip">' +
          esc(row.customer?.code || row.customer?.name || "—") +
          "</td>" +
          '<td class="cell-ellip">' +
          esc(row.user?.fullName || "—") +
          "</td>" +
          '<td class="cell-ellip">' +
          esc(row.warehouse || "—") +
          "</td>" +
          "</tr>"
        );
      })
      .join("");
  }

  async function loadControl(force) {
    if (loadedControl && !force) {
      renderIncidents();
      renderTrace();
      return;
    }
    setBanner("incidentsBanner", "");
    setBanner("traceBanner", "");
    try {
      await loadCoreData(force);
      renderIncidents();
      try {
        const rows = await apiJson("/api/traceability/activity?limit=150");
        activity = Array.isArray(rows) ? rows : [];
      } catch (e) {
        activity = [];
        setBanner("traceBanner", e.message || "No se pudo cargar trazabilidad.", "error");
      }
      renderTrace();
      loadedControl = true;
    } catch (e) {
      setBanner("incidentsBanner", e.message || "No se pudieron cargar incidencias.", "error");
    }
  }

  /* ——— Sistema / avisos ——— */

  function priorityLabel(n) {
    const p = Number(n);
    if (p >= 70) return "Alta";
    if (p >= 40) return "Media";
    return "Baja";
  }

  function renderNotices() {
    const body = $("noticesBody");
    if (!body) return;
    const notices = tasks.filter(isInternalNotice);
    $("noticesMeta").textContent = notices.length + " avisos";
    if (!notices.length) {
      body.innerHTML =
        '<tr><td colspan="5"><div class="empty-state">Aún no hay avisos internos.</div></td></tr>';
      return;
    }
    body.innerHTML = notices
      .slice(0, 80)
      .map((t) => {
        const notes = parseNotes(t.notes);
        const subject = notes.title || t.reference || "Sin asunto";
        const from = t.createdBy?.fullName || "—";
        const to = t.assignedTo?.fullName || "Sin destinatario";
        return (
          "<tr>" +
          '<td class="cell-ellip" title="' +
          esc(notes.description || "") +
          '"><strong>' +
          esc(subject) +
          "</strong></td>" +
          '<td class="cell-ellip">' +
          esc(from) +
          " → " +
          esc(to) +
          "</td>" +
          "<td>" +
          esc(priorityLabel(t.priority)) +
          "</td>" +
          "<td>" +
          statusBadgeHtml(t.status) +
          "</td>" +
          '<td class="cell-muted">' +
          esc(formatDate(t.createdAt)) +
          "</td>" +
          "</tr>"
        );
      })
      .join("");
  }

  function fillAssigneesSelect() {
    const sel = $("noticeTo");
    if (!sel) return;
    const prev = sel.value;
    const opts = ['<option value="">Selecciona un destinatario…</option>'].concat(
      assignees.map(
        (u) =>
          '<option value="' +
          esc(u.id) +
          '">' +
          esc(u.fullName || u.email) +
          " (" +
          esc(u.role || "") +
          ")</option>"
      )
    );
    sel.innerHTML = opts.join("");
    if (prev) sel.value = prev;
  }

  function renderUsers() {
    const body = $("usersBody");
    if (!body) return;
    const source = usersList.length ? usersList : assignees;
    $("usersMeta").textContent = source.length + " usuarios";
    if (!source.length) {
      body.innerHTML =
        '<tr><td colspan="4"><div class="empty-state">No hay usuarios para listar con tu rol. Usa el dashboard clásico (ADMIN) para gestionar.</div></td></tr>';
      return;
    }
    body.innerHTML = source
      .map((u) => {
        const active = u.isActive === false ? "No" : "Sí";
        return (
          "<tr>" +
          '<td class="cell-ellip">' +
          esc(u.fullName || "—") +
          "</td>" +
          '<td class="cell-ellip">' +
          esc(u.email || "—") +
          "</td>" +
          "<td>" +
          '<span class="badge badge-gray">' +
          esc(u.role || "—") +
          "</span></td>" +
          "<td>" +
          esc(active) +
          "</td>" +
          "</tr>"
        );
      })
      .join("");
  }

  async function loadAssigneesAndUsers() {
    assignees = [];
    usersList = [];
    try {
      const a = await apiJson("/api/users/assignees");
      assignees = Array.isArray(a) ? a : [];
    } catch (_e) {
      assignees = [];
    }
    try {
      const u = await apiJson("/api/users");
      usersList = Array.isArray(u) ? u : [];
    } catch (_e) {
      usersList = [];
    }
    // Fallback: si assignees falla o viene vacío, usar usuarios activos del listado.
    if (!assignees.length && usersList.length) {
      assignees = usersList.filter(
        (u) =>
          u &&
          u.isActive !== false &&
          ["ADMIN", "SUPERVISOR", "OPERATOR"].includes(String(u.role || "").toUpperCase())
      );
    }
    fillAssigneesSelect();
    if (!assignees.length) {
      setBanner(
        "noticeBanner",
        "No hay destinatarios disponibles. Verifica usuarios activos o usa el dashboard clásico.",
        "warn"
      );
    }
  }

  async function loadSystem(force) {
    if (loadedSystem && !force) {
      renderNotices();
      renderUsers();
      fillAssigneesSelect();
      return;
    }
    setBanner("noticeBanner", "");
    setBanner("usersBanner", "");
    $("noticesMeta") && ($("noticesMeta").textContent = "Cargando…");
    try {
      await loadCoreData(force);
      await loadAssigneesAndUsers();
      if (!usersList.length && currentUser?.role !== "ADMIN" && !assignees.length) {
        setBanner(
          "usersBanner",
          "Listado completo de usuarios disponible para ADMIN. Se muestran responsables operativos si tu rol lo permite.",
          "info"
        );
      }
      renderNotices();
      renderUsers();
      loadedSystem = true;
    } catch (e) {
      setBanner("noticeBanner", e.message || "No se pudo cargar el módulo sistema.", "error");
      $("noticesMeta") && ($("noticesMeta").textContent = "Error al cargar");
    }
  }

  async function submitNotice(event) {
    event.preventDefault();
    setBanner("noticeBanner", "");
    const to = $("noticeTo")?.value;
    const subject = $("noticeSubject")?.value?.trim();
    const message = $("noticeBody")?.value?.trim();
    const priority = Number($("noticePriority")?.value || 50);
    const due = $("noticeDue")?.value || "";

    if (!to) {
      setBanner("noticeBanner", "Selecciona un destinatario.", "error");
      return;
    }
    if (!subject) {
      setBanner("noticeBanner", "Indica el asunto del aviso.", "error");
      return;
    }
    if (!message) {
      setBanner("noticeBanner", "Escribe el mensaje.", "error");
      return;
    }

    const notesPayload = {
      title: subject,
      description: message,
      taskLabel: INTERNAL_NOTICE_LABEL,
      dueDate: due || null,
      followUp: [
        {
          text: "Aviso interno enviado desde Panel V2.",
          at: new Date().toISOString(),
          by: currentUser?.id || null
        }
      ]
    };

    const btn = $("noticeSubmitBtn");
    if (btn) btn.disabled = true;
    try {
      await apiJson("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "ADJUSTMENT",
          status: "PENDING",
          priority: Number.isFinite(priority) ? priority : 50,
          reference: subject,
          assignedToId: to,
          notes: JSON.stringify(notesPayload)
        })
      });
      $("noticeSubject").value = "";
      $("noticeBody").value = "";
      $("noticeDue").value = "";
      setBanner("noticeBanner", "Aviso enviado. No se registró como operación de almacén.", "ok");
      toast("Aviso interno enviado", "ok");
      const fresh = await safeGet("/api/tasks", tasks);
      tasks = Array.isArray(fresh) ? fresh : tasks;
      renderNotices();
      loadedHome = false;
    } catch (e) {
      setBanner("noticeBanner", e.message || "No se pudo enviar el aviso.", "error");
      toast(e.message || "Error al enviar aviso", "err");
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  /* ——— wire UI ——— */

  function wire() {
    document.querySelectorAll(".app-tab").forEach((tab) => {
      tab.addEventListener("click", () => {
        const id = tab.getAttribute("data-tab");
        if (id) setTab(id);
      });
    });

    $("logoutBtn")?.addEventListener("click", logout);
    $("openStableBtn")?.addEventListener("click", () => openClassicInNewTab());
    $("footerClassicLink")?.addEventListener("click", (e) => {
      e.preventDefault();
      openClassicInNewTab();
    });
    $("accountPasswordLink")?.addEventListener("click", (e) => {
      e.preventDefault();
      openClassicInNewTab("account");
    });

    // Navegación V2 (se queda en dashboard-v2.html)
    document.querySelectorAll("[data-v2-op]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-v2-op");
        openOpsInV2(id);
      });
    });
    document.querySelectorAll("[data-v2-goto]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const tab = btn.getAttribute("data-v2-goto");
        const sub = btn.getAttribute("data-sub");
        if (tab) setTab(tab);
        if (tab === "control" && sub) setControlSub(sub);
        if (tab === "sistema" && sub) setSystemSub(sub);
        if (tab === "inventario") resetV2Scroll();
      });
    });

    // Clásico SOLO bajo demanda y en nueva pestaña
    document.querySelectorAll("[data-open-classic], [data-open-stable]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        const mod =
          btn.getAttribute("data-open-classic") ||
          btn.getAttribute("data-open-stable") ||
          "";
        openClassicInNewTab(mod || undefined);
      });
    });

    $("opsDetailCloseBtn")?.addEventListener("click", () => {
      $("opsDetailPanel")?.classList.add("hidden");
    });

    // Compat: data-goto-tab (ya en V2)
    document.querySelectorAll("[data-goto-tab]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const tab = btn.getAttribute("data-goto-tab");
        const sub = btn.getAttribute("data-sub");
        if (tab) setTab(tab);
        if (tab === "control" && sub) setControlSub(sub);
      });
    });

    $("refreshHomeBtn")?.addEventListener("click", () => {
      loadedHome = false;
      void loadHome(true);
    });
    $("refreshInventoryBtn")?.addEventListener("click", () => {
      loadedInventory = false;
      void loadInventory(true);
    });
    $("refreshControlBtn")?.addEventListener("click", () => {
      loadedControl = false;
      void loadControl(true);
    });
    $("refreshNoticesBtn")?.addEventListener("click", () => {
      loadedSystem = false;
      void loadSystem(true);
    });

    ["invFilterWarehouse", "invFilterLocation", "invFilterStatus"].forEach((id) => {
      $(id)?.addEventListener("change", renderInventoryTable);
    });
    $("invFilterText")?.addEventListener("input", () => {
      window.clearTimeout($("invFilterText")._t);
      $("invFilterText")._t = window.setTimeout(renderInventoryTable, 180);
    });

    document.querySelectorAll("#controlSubnav button").forEach((btn) => {
      btn.addEventListener("click", () => setControlSub(btn.getAttribute("data-control-sub")));
    });
    document.querySelectorAll("#systemSubnav button").forEach((btn) => {
      btn.addEventListener("click", () => setSystemSub(btn.getAttribute("data-system-sub")));
    });

    $("noticeForm")?.addEventListener("submit", (e) => void submitNotice(e));
  }

  async function boot() {
    wire();
    try {
      await loadSession();
      await loadHome(true);
    } catch (_e) {
      /* sesión redirige en 401 */
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => void boot());
  } else {
    void boot();
  }
})();
