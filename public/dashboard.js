const token = localStorage.getItem("token");
const statusBox = document.getElementById("statusBox");
const usersSummary = document.getElementById("usersSummary");
const logoutBtn = document.getElementById("logoutBtn");
const sessionDisplayName = document.getElementById("sessionDisplayName");
const sessionEmailInline = document.getElementById("sessionEmailInline");
const sessionRoleInline = document.getElementById("sessionRoleInline");
const environmentBadge = document.getElementById("environmentBadge");
const currentUserFullName = document.getElementById("currentUserFullName");
const currentUserEmail = document.getElementById("currentUserEmail");
const currentUserRoleText = document.getElementById("currentUserRole");
const currentUrl = document.getElementById("currentUrl");
const usersList = document.getElementById("usersList");
const usersMessage = document.getElementById("usersMessage");
const createUserForm = document.getElementById("createUserForm");
const createUserBtn = document.getElementById("createUserBtn");
const createUserError = document.getElementById("createUserError");
const moduleUsers = document.getElementById("moduleUsers");
const moduleControlCenter = document.getElementById("moduleControlCenter");
const moduleClients = document.getElementById("moduleClients");
const moduleReports = document.getElementById("moduleReports");
const clientsModuleList = document.getElementById("clientsModuleList");
const clientsAdminList = document.getElementById("clientsAdminList");
const ccInventoryList = document.getElementById("ccInventoryList");
const modulePicking = document.getElementById("modulePicking");
const moduleInventory = document.getElementById("moduleInventory");
const moduleCatalog = document.getElementById("moduleCatalog");
const moduleAccount = document.getElementById("moduleAccount");
const moduleInbound = document.getElementById("moduleInbound");
const moduleOutbound = document.getElementById("moduleOutbound");
const moduleRequisitions = document.getElementById("moduleRequisitions");
const moduleRelocate = document.getElementById("moduleRelocate");
const moduleBulkInbound = document.getElementById("moduleBulkInbound");
const moduleProjects = document.getElementById("moduleProjects");
const moduleWarehouses = document.getElementById("moduleWarehouses");
const moduleLocations = document.getElementById("moduleLocations");
const moduleConfig = document.getElementById("moduleConfig");
const modulePlaceholder = document.getElementById("modulePlaceholder");
const moduleButtons = document.querySelectorAll(".module-btn");
let assigneesLoadError = false;
const newFullName = document.getElementById("newFullName");
const newEmail = document.getElementById("newEmail");
const newPassword = document.getElementById("newPassword");
const newRole = document.getElementById("newRole");
const changePasswordForm = document.getElementById("changePasswordForm");
const changePasswordBtn = document.getElementById("changePasswordBtn");
const changePasswordError = document.getElementById("changePasswordError");
const currentPassword = document.getElementById("currentPassword");
const newAccountPassword = document.getElementById("newAccountPassword");
const scanForm = document.getElementById("scanForm");
const scanInput = document.getElementById("scanInput");
const scanBtn = document.getElementById("scanBtn");
const scanHint = document.getElementById("scanHint");
const scanResult = document.getElementById("scanResult");
const scanEventsList = document.getElementById("scanEventsList");
const pickingFlow = document.getElementById("pickingFlow");
const createProductForm = document.getElementById("createProductForm");
const createProductBtn = document.getElementById("createProductBtn");
const createProductError = document.getElementById("createProductError");
const createCustomerForm = document.getElementById("createCustomerForm");
const createCustomerBtn = document.getElementById("createCustomerBtn");
const createCustomerError = document.getElementById("createCustomerError");
const customerCode = document.getElementById("customerCode");
const customerName = document.getElementById("customerName");
const productCustomerCode = document.getElementById("productCustomerCode");
const productSku = document.getElementById("productSku");
const productBarcode = document.getElementById("productBarcode");
const productName = document.getElementById("productName");
const productWarehouse = document.getElementById("productWarehouse");
const productsList = document.getElementById("productsList");
const clientsList = document.getElementById("clientsList");
const inventoryList = document.getElementById("inventoryList");
const movementForm = document.getElementById("movementForm");
const movementBtn = document.getElementById("movementBtn");
const movementError = document.getElementById("movementError");
const moveSku = document.getElementById("moveSku");
const moveWarehouse = document.getElementById("moveWarehouse");
const moveType = document.getElementById("moveType");
const moveQty = document.getElementById("moveQty");
const moveRef = document.getElementById("moveRef");
const moveNotes = document.getElementById("moveNotes");
const importSection = document.getElementById("importSection");
const importCsv = document.getElementById("importCsv");
const importBtn = document.getElementById("importBtn");
const importResult = document.getElementById("importResult");
const reconcileFullInventoryChk = document.getElementById("reconcileFullInventory");
const inventoryMovementsList = document.getElementById("inventoryMovementsList");
const catalogImportSection = document.getElementById("catalogImportSection");
const catalogImportCsv = document.getElementById("catalogImportCsv");
const catalogImportResult = document.getElementById("catalogImportResult");
const catalogPreviewBtn = document.getElementById("catalogPreviewBtn");
const catalogApplyBtn = document.getElementById("catalogApplyBtn");
const catalogImportFile = document.getElementById("catalogImportFile");
const catalogImportFileStatus = document.getElementById("catalogImportFileStatus");
const inventoryImportFile = document.getElementById("inventoryImportFile");
const inventoryImportFileStatus = document.getElementById("inventoryImportFileStatus");
const moduleTraceability = document.getElementById("moduleTraceability");
const moduleTasks = document.getElementById("moduleTasks");
const moduleIncidents = document.getElementById("moduleIncidents");
const traceLoadBtn = document.getElementById("traceLoadBtn");
const traceList = document.getElementById("traceList");
const traceMessage = document.getElementById("traceMessage");
const taskList = document.getElementById("taskList");
const taskMessage = document.getElementById("taskMessage");
const taskCreateWrap = document.getElementById("taskCreateWrap");
const taskCreateBtn = document.getElementById("taskCreateBtn");
const taskCreateError = document.getElementById("taskCreateError");
const incidentList = document.getElementById("incidentList");
const incidentMessage = document.getElementById("incidentMessage");
const incidentCreateBtn = document.getElementById("incidentCreateBtn");
const incidentCreateError = document.getElementById("incidentCreateError");
const exportStockBtn = document.getElementById("exportStockBtn");
const exportMovementsBtn = document.getElementById("exportMovementsBtn");
const exportTraceBtn = document.getElementById("exportTraceBtn");
const exportProductsBtn = document.getElementById("exportProductsBtn");
const demoAdminZone = document.getElementById("demoAdminZone");
const demoResetOpenBtn = document.getElementById("demoResetOpenBtn");
const demoResetPanel = document.getElementById("demoResetPanel");
const demoResetConfirmInput = document.getElementById("demoResetConfirmInput");
const demoResetStatus = document.getElementById("demoResetStatus");
const demoResetCancelBtn = document.getElementById("demoResetCancelBtn");
const demoResetExecuteBtn = document.getElementById("demoResetExecuteBtn");
const DEMO_RESET_CONFIRM_TEXT = "REINICIAR LOGITEC";

let currentRole = null;
let currentUserId = null;
let catalogApplyCompleted = false;
let stockRowsCache = [];
let productsCache = [];
let movementsCountCache = 0;
let movementsRowsCache = [];
let pendingConflictsCache = 0;

let clientsCache = [];

const PRIMARY_CLIENT_AVIAT = "AVIAT";
const PRIMARY_CLIENT_AVIAT_NAME = "AVIAT";
const AVIAT_PROJECT_FILTER_KEY = "logitec_aviat_project_filter";
const AVIAT_PROJECT_ALL = "ALL";
let aviatProjectFilterFallback = false;

function getActiveAviatProject() {
  const raw = localStorage.getItem(AVIAT_PROJECT_FILTER_KEY);
  if (!raw || String(raw).trim().toUpperCase() === AVIAT_PROJECT_ALL) return AVIAT_PROJECT_ALL;
  return String(raw).trim().toUpperCase();
}

function setActiveAviatProject(code) {
  const value = code && String(code).trim() ? String(code).trim().toUpperCase() : AVIAT_PROJECT_ALL;
  localStorage.setItem(AVIAT_PROJECT_FILTER_KEY, value);
  aviatProjectFilterFallback = false;
  updateAviatHeaderUi();
  refreshAviatScopedViews();
}

/** Metadatos de proyecto (código + nombre) para navegación y filtros. */
function resolveAviatProjectMeta(code) {
  if (!code || String(code).trim().toUpperCase() === AVIAT_PROJECT_ALL) {
    return { code: AVIAT_PROJECT_ALL, name: "Todos los proyectos" };
  }
  const normalized = normalizeProjectCode(code);
  const fromData = collectAviatProjectsFromData().find(
    (p) => normalizeProjectCode(p.code) === normalized || normalizeProjectToken(p.name) === normalizeProjectToken(code)
  );
  if (fromData) return { code: fromData.code, name: fromData.name || fromData.code };
  const fromCustomers = getCustomersForSelect().find((p) => normalizeProjectCode(p.code) === normalized);
  if (fromCustomers) return { code: fromCustomers.code, name: fromCustomers.name || fromCustomers.code };
  return { code: String(code).trim(), name: String(code).trim() };
}

/** Rellena filtros de texto de catálogo/existencias (además del filtro global Aviat). */
function setProjectTextFilters(code, name) {
  const clear = !code || String(code).toUpperCase() === AVIAT_PROJECT_ALL;
  const setVal = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.value = clear ? "" : val || "";
  };
  setVal("invFilterCustomer", clear ? "" : code);
  setVal("invFilterCliente", clear ? "" : name || code);
  setVal("catFilterCustomer", clear ? "" : code);
  setVal("catFilterCliente", clear ? "" : name || code);
}

function clearAviatProjectScope() {
  setActiveAviatProject(AVIAT_PROJECT_ALL);
  setProjectTextFilters(AVIAT_PROJECT_ALL, "");
}

/** Selecciona proyecto y abre Catálogo y productos filtrado. */
function openProjectCatalogView(projectCode) {
  const meta = resolveAviatProjectMeta(projectCode);
  setActiveAviatProject(meta.code);
  setProjectTextFilters(meta.code, meta.name);
  navigateTo("inventario", "catalog");
}

/** Selecciona proyecto y abre Inventario / Existencias filtrado. */
function openProjectInventoryView(projectCode) {
  const meta = resolveAviatProjectMeta(projectCode);
  setActiveAviatProject(meta.code);
  setProjectTextFilters(meta.code, meta.name);
  navigateTo("inventario", "inventory");
}

function normalizeProjectToken(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, " ");
}

function normalizeProjectCode(value) {
  return normalizeProjectToken(value).replace(/\s+/g, "_");
}

function getAviatProjectFromRow(row) {
  const code =
    row?.product?.customer?.code ||
    row?.customer?.code ||
    (typeof row?.customer === "string" ? row.customer : "") ||
    row?.project?.code ||
    (typeof row?.project === "string" ? row.project : "") ||
    row?.codigo_proyecto ||
    row?.code ||
    parseRequisitionNotes(row?.notes)?.customerCode ||
    "";
  const name =
    row?.product?.customer?.name ||
    row?.customer?.name ||
    row?.project?.name ||
    row?.customerName ||
    row?.proyecto ||
    row?.name ||
    parseRequisitionNotes(row?.notes)?.customerName ||
    code ||
    "";
  const normalizedCode = String(code || "").trim();
  const normalizedName = String(name || normalizedCode || "").trim();
  return {
    code: normalizedCode,
    name: normalizedName || normalizedCode
  };
}

function getAviatProjectDisplayFromRow(row) {
  const project = getAviatProjectFromRow(row);
  return project.name || project.code || "—";
}

function aviatProjectTokensFromRow(row) {
  const tokens = new Set();
  const add = (value) => {
    if (value == null || value === "") return;
    tokens.add(normalizeProjectToken(value));
    tokens.add(normalizeProjectCode(value));
  };
  const project = getAviatProjectFromRow(row);
  add(project.code);
  add(project.name);
  add(row?.customerName);
  add(row?.codigo_proyecto);
  add(row?.proyecto);
  if (typeof row?.customer === "string") add(row.customer);
  return tokens;
}

function rowMatchesAviatProject(row) {
  const activeProject = getActiveAviatProject();
  if (activeProject === AVIAT_PROJECT_ALL) return true;
  const tokens = aviatProjectTokensFromRow(row);
  const target = normalizeProjectToken(activeProject);
  const targetCode = normalizeProjectCode(activeProject);
  return tokens.has(target) || tokens.has(targetCode);
}

function filterRowsByAviatProject(rows) {
  const source = Array.isArray(rows) ? rows : [];
  if (getActiveAviatProject() === AVIAT_PROJECT_ALL) {
    return source;
  }
  const filtered = source.filter((row) => rowMatchesAviatProject(row));
  if (source.length > 0 && filtered.length === 0) {
    localStorage.setItem(AVIAT_PROJECT_FILTER_KEY, AVIAT_PROJECT_ALL);
    aviatProjectFilterFallback = true;
    queueMicrotask(() => updateAviatHeaderUi());
    return source;
  }
  aviatProjectFilterFallback = false;
  return filtered;
}

function collectAviatProjectsFromData() {
  const map = new Map();
  const add = (code, name) => {
    const normalizedCode = String(code || "").trim();
    if (!normalizedCode || normalizedCode === "—") return;
    const upper = normalizedCode.toUpperCase();
    if (upper === PRIMARY_CLIENT_AVIAT) return;
    const label = String(name || normalizedCode).trim() || normalizedCode;
    const existing = map.get(upper);
    if (!existing || label.length > String(existing.name || "").length) {
      map.set(upper, { code: normalizedCode, name: label });
    }
  };
  for (const c of clientsCache) add(c.code, c.name || c.code);
  for (const p of productsCache) add(p.customer?.code, p.customer?.name);
  for (const row of stockRowsCache) {
    const project = getAviatProjectFromRow(row);
    add(project.code, project.name);
  }
  for (const m of movementsRowsCache) {
    const project = getAviatProjectFromRow(m);
    add(project.code, project.name);
  }
  return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name, "es"));
}

function getActiveAviatProjectDisplayLabel() {
  const active = getActiveAviatProject();
  if (active === AVIAT_PROJECT_ALL) return "Todos los proyectos";
  const match = collectAviatProjectsFromData().find((p) => normalizeProjectCode(p.code) === normalizeProjectCode(active));
  return match?.name || active;
}

function getAviatScopeSummaryText() {
  // Un solo mensaje de fallback vive en #aviatFilterFallbackNotice (evitar duplicar aquí).
  if (getActiveAviatProject() === AVIAT_PROJECT_ALL) {
    return "Mostrando todos los proyectos de AVIAT";
  }
  return `Mostrando proyecto ${getActiveAviatProjectDisplayLabel()} de AVIAT`;
}

function getAviatExportBasename(kind) {
  const project = getActiveAviatProject();
  if (project === AVIAT_PROJECT_ALL) return `${kind}_AVIAT`;
  return `${kind}_AVIAT_${project}`;
}

function updateAviatHeaderUi() {
  const scopeText = getAviatScopeSummaryText();
  const projectLabel = getActiveAviatProjectDisplayLabel();
  document.querySelectorAll("[data-aviat-primary-label]").forEach((el) => {
    el.textContent = PRIMARY_CLIENT_AVIAT_NAME;
  });
  document.querySelectorAll("[data-aviat-project-label]").forEach((el) => {
    el.textContent = projectLabel;
  });
  ["aviatScopeControl", "aviatScopeInventory", "aviatScopeCatalog", "aviatScopeTrace"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.textContent = scopeText;
  });
  const ccTitle = document.getElementById("ccModuleTitle");
  if (ccTitle) ccTitle.textContent = `Centro de Control — ${PRIMARY_CLIENT_AVIAT_NAME}`;
  const invTitle = document.getElementById("inventoryModuleTitle");
  if (invTitle) invTitle.textContent = `Inventario de ${PRIMARY_CLIENT_AVIAT_NAME}`;
  const catTitle = document.getElementById("catalogModuleTitle");
  if (catTitle) catTitle.textContent = `Catálogo de ${PRIMARY_CLIENT_AVIAT_NAME}`;
  const notice = document.getElementById("aviatFilterFallbackNotice");
  if (notice) {
    if (aviatProjectFilterFallback) {
      notice.textContent = "No hay registros para este proyecto. Se muestran todos los proyectos de AVIAT.";
      notice.classList.remove("hidden");
    } else {
      notice.textContent = "No hay registros para este proyecto. Se muestran todos los proyectos de AVIAT.";
      notice.classList.add("hidden");
    }
  }
  renderAviatProjectChips(document.getElementById("ccAviatProjectChips"));
}

/**
 * Chips de proyecto Aviat.
 * @param {HTMLElement|null} container
 * @param {{ mode?: "filter"|"catalog" }} [options]
 *   filter (default): solo cambia el alcance global (Centro de control, etc.).
 *   catalog: chip de proyecto abre catálogo filtrado; "Todos" limpia el alcance.
 */
function renderAviatProjectChips(container, options = {}) {
  if (!container) return;
  const mode = options.mode === "catalog" ? "catalog" : "filter";
  const projects = collectAviatProjectsFromData();
  const activeProject = getActiveAviatProject();
  const allTitle =
    mode === "catalog"
      ? "Quitar filtro y mostrar todos los proyectos"
      : "Mostrar todos los proyectos";
  const chipTitle =
    mode === "catalog"
      ? "Abrir catálogo filtrado por este proyecto"
      : "Filtrar vistas por este proyecto";
  const allChip = `<button type="button" class="project-chip${
    activeProject === AVIAT_PROJECT_ALL ? " active" : ""
  }" data-pick-aviat-project="${AVIAT_PROJECT_ALL}" title="${escCell(allTitle)}">Todos los proyectos</button>`;
  const projectChips = projects
    .map((p) => {
      const isActive = normalizeProjectCode(activeProject) === normalizeProjectCode(p.code);
      return `<button type="button" class="project-chip${isActive ? " active" : ""}" data-pick-aviat-project="${escCell(
        p.code
      )}" title="${escCell(`${chipTitle}: ${p.name} (${p.code})`)}">${escCell(p.name)}</button>`;
    })
    .join("");
  const emptyMsg =
    productsCache.length || stockRowsCache.length
      ? "No se detectaron proyectos. Revisa carga de catálogo."
      : "Cargando proyectos de AVIAT…";
  const navHint =
    mode === "catalog"
      ? `<p class="project-chips-hint">Selecciona un proyecto para ver su catálogo filtrado.</p>`
      : "";
  container.innerHTML = `<div class="project-chips-label">Proyectos de ${escCell(
    PRIMARY_CLIENT_AVIAT_NAME
  )}</div>${navHint}<div class="project-chips-row">${allChip}${
    projectChips || `<span class="filter-hint">${emptyMsg}</span>`
  }</div>`;
  container.querySelectorAll("[data-pick-aviat-project]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const code = btn.getAttribute("data-pick-aviat-project") || AVIAT_PROJECT_ALL;
      if (code === AVIAT_PROJECT_ALL) {
        clearAviatProjectScope();
        return;
      }
      if (mode === "catalog") {
        openProjectCatalogView(code);
        return;
      }
      setActiveAviatProject(code);
    });
  });
}

function refreshAviatScopedViews() {
  updateAviatHeaderUi();
  if (moduleControlCenter && !moduleControlCenter.classList.contains("hidden")) refreshControlCenter();
  if (moduleInventory && !moduleInventory.classList.contains("hidden")) {
    applyInventoryFilters();
    void loadInventoryMovements();
  }
  if (moduleCatalog && !moduleCatalog.classList.contains("hidden")) applyCatalogFilters();
  if (moduleClients && !moduleClients.classList.contains("hidden")) renderClientsModule();
  if (moduleTraceability && !moduleTraceability.classList.contains("hidden")) void loadTraceability();
  if (moduleInbound && !moduleInbound.classList.contains("hidden")) void loadInboundList();
  if (moduleOutbound && !moduleOutbound.classList.contains("hidden")) void loadOutboundList();
  if (moduleRequisitions && !moduleRequisitions.classList.contains("hidden")) void loadRequisitionsList();
}

function wireAviatProjectUi() {
  if (!localStorage.getItem(AVIAT_PROJECT_FILTER_KEY)) {
    localStorage.setItem(AVIAT_PROJECT_FILTER_KEY, AVIAT_PROJECT_ALL);
  }
  updateAviatHeaderUi();
}

function extractLoteFromText(text) {
  if (!text) return "";
  const match = String(text).match(/LOTE:([^|]+)/i);
  return match ? match[1].trim() : "";
}

function extractLoteFromRow(row) {
  const fromRef = extractLoteFromText(row?.reference);
  if (fromRef) return fromRef;
  const fromNotes = extractLoteFromText(row?.notes);
  if (fromNotes) return fromNotes;
  const parsed = parseRequisitionNotes(row?.notes);
  if (parsed?.lote) return String(parsed.lote);
  return "N/D";
}

function formatSkuBarcode(product) {
  const p = product || {};
  const sku = p.sku || "—";
  const barcode = p.barcode;
  if (barcode && barcode !== sku) return `${sku} / ${barcode}`;
  return sku;
}

function buildOpsReference(lote, referenceRaw, kind) {
  const base = referenceRaw || (kind === "in" ? "ENTRADA_OPERATIVA" : "SALIDA_OPERATIVA");
  if (lote) return `LOTE:${lote} | ${base}`;
  return base;
}

const roleModules = {
  ADMIN: [
    "control", "tasks", "picking", "inbound", "bulk-inbound", "relocate", "requisitions", "outbound",
    "incidents", "inventory", "catalog", "projects", "warehouses", "locations", "clients",
    "traceability", "reports", "users", "config", "account"
  ],
  SUPERVISOR: [
    "control", "tasks", "picking", "inbound", "bulk-inbound", "relocate", "requisitions", "outbound",
    "incidents", "inventory", "catalog", "projects", "warehouses", "locations", "clients",
    "traceability", "reports", "config", "account"
  ],
  OPERATOR: [
    "control", "tasks", "picking", "inbound", "bulk-inbound", "relocate", "requisitions", "outbound",
    "incidents", "inventory", "catalog", "projects", "warehouses", "locations", "traceability", "config", "account"
  ],
  CLIENT: ["catalog", "account", "config"]
};

/** Secciones de menú. clients se mantiene en registry pero fuera del menú principal. */
const NAV_SECTION_MODULES = {
  inicio: ["control", "tasks", "picking", "incidents"],
  operacion: ["inbound", "bulk-inbound", "requisitions", "picking", "relocate", "outbound"],
  inventario: ["inventory", "catalog", "projects", "warehouses", "locations"],
  control: ["incidents", "traceability", "reports"],
  sistema: ["users", "config", "account"]
};

/** Módulo landing al clic en cada pestaña principal (v41). */
const NAV_SECTION_DEFAULTS = {
  inicio: "control",
  operacion: "inbound",
  inventario: "inventory",
  control: "incidents",
  sistema: "users"
};

let currentNavSection = "inicio";
let currentModuleName = null;

/**
 * Tipos de tarea visibles en UI.
 * value = tipo backend (PICK|RECEIVE|MOVE|ADJUSTMENT|COUNT).
 * label se guarda en notes.taskLabel.
 * Preparado para v40 mover a configuración persistente.
 */
const TASK_TYPE_OPTIONS = [
  { id: "PICK", label: "Picking", value: "PICK" },
  { id: "INVENTORY", label: "Inventario", value: "COUNT" },
  { id: "REVIEW", label: "Revisión", value: "COUNT" },
  { id: "INCIDENT", label: "Incidencia", value: "ADJUSTMENT" },
  { id: "MOVE", label: "Movimiento", value: "MOVE" },
  { id: "VALIDATION", label: "Validación", value: "COUNT" },
  { id: "GENERAL", label: "General", value: "ADJUSTMENT" },
  { id: "INTERNAL_NOTICE", label: "Aviso interno", value: "ADJUSTMENT" }
];

/** @deprecated alias de compatibilidad; usar TASK_TYPE_OPTIONS */
const TASK_TYPE_UI_MAP = Object.fromEntries(
  TASK_TYPE_OPTIONS.map((opt) => [opt.id, { type: opt.value, label: opt.label }])
);
// Claves legacy del formulario v38
TASK_TYPE_UI_MAP.COUNT = { type: "COUNT", label: "Inventario" };
TASK_TYPE_UI_MAP.COUNT_REV = { type: "COUNT", label: "Revisión" };
TASK_TYPE_UI_MAP.COUNT_VAL = { type: "COUNT", label: "Validación" };
TASK_TYPE_UI_MAP.ADJUSTMENT = { type: "ADJUSTMENT", label: "Incidencia" };
TASK_TYPE_UI_MAP.RECEIVE = { type: "RECEIVE", label: "Recepción" };

/**
 * Tipos de incidencia visibles en UI (español).
 * value = enum backend válido.
 */
const INCIDENT_TYPE_OPTIONS = [
  { id: "DOUBLE_SCAN", label: "Doble escaneo", value: "DOUBLE_SCAN" },
  { id: "DAMAGED", label: "Producto dañado", value: "DAMAGED" },
  { id: "STOCK_MISMATCH", label: "Diferencia de inventario", value: "STOCK_MISMATCH" },
  { id: "WRONG_LOCATION", label: "Ubicación incorrecta", value: "WRONG_LOCATION" },
  { id: "MISSING_PRODUCT", label: "Producto faltante", value: "MISSING_PRODUCT" },
  { id: "WRONG_PRODUCT", label: "Producto equivocado", value: "STOCK_MISMATCH" },
  { id: "OTHER", label: "Otro", value: "STOCK_MISMATCH" }
];

const defaultLandingModule = {
  ADMIN: "control",
  SUPERVISOR: "control",
  OPERATOR: "tasks",
  CLIENT: "catalog"
};

const MODULE_REGISTRY = {
  control: moduleControlCenter,
  clients: moduleClients,
  catalog: moduleCatalog,
  inventory: moduleInventory,
  inbound: moduleInbound,
  "bulk-inbound": moduleBulkInbound,
  relocate: moduleRelocate,
  projects: moduleProjects,
  warehouses: moduleWarehouses,
  locations: moduleLocations,
  config: moduleConfig,
  requisitions: moduleRequisitions,
  picking: modulePicking,
  outbound: moduleOutbound,
  traceability: moduleTraceability,
  incidents: moduleIncidents,
  tasks: moduleTasks,
  reports: moduleReports,
  users: moduleUsers,
  account: moduleAccount
};

function closeMovementsPanel() {
  const panel = document.getElementById("movementsPanel");
  const btn = document.getElementById("toggleMovementsBtn");
  if (panel) panel.classList.remove("open");
  if (btn) btn.textContent = "Ver movimientos";
}

function hideAllModules() {
  // Ocultar TODOS los paneles de módulo (evita contenido residual de secciones previas).
  document.querySelectorAll(".module-pane").forEach((el) => {
    el.classList.add("hidden");
  });
  Object.values(MODULE_REGISTRY).forEach((el) => {
    if (el) el.classList.add("hidden");
  });
  if (modulePlaceholder) modulePlaceholder.classList.add("hidden");
  closeMovementsPanel();
}

function resetContentScroll() {
  const content =
    document.querySelector("main.content") ||
    document.querySelector(".content") ||
    document.querySelector("main");
  if (content) content.scrollTop = 0;
  try {
    window.scrollTo(0, 0);
  } catch (_e) {
    /* ignore */
  }
}

currentUrl && (currentUrl.textContent = window.location.href);

function forceLogout() {
  localStorage.removeItem("token");
  window.location.replace("/login.html");
}

if (!token) {
  forceLogout();
}

function getDefaultModuleForSection(sectionId) {
  const allowed = roleModules[currentRole] || [];
  const sectionMods = NAV_SECTION_MODULES[sectionId] || [];

  if (sectionId === "sistema") {
    if (currentRole === "ADMIN" && allowed.includes("users")) return "users";
    if (allowed.includes("account")) return "account";
    if (allowed.includes("config")) return "config";
  }

  const preferred = NAV_SECTION_DEFAULTS[sectionId];
  if (preferred && allowed.includes(preferred) && sectionMods.includes(preferred)) {
    return preferred;
  }
  const firstAllowed = sectionMods.find((m) => allowed.includes(m));
  return firstAllowed || preferred || null;
}

function resolveSectionForModule(moduleName, preferredSection) {
  if (
    preferredSection &&
    (NAV_SECTION_MODULES[preferredSection] || []).includes(moduleName)
  ) {
    return preferredSection;
  }
  if (
    currentNavSection &&
    (NAV_SECTION_MODULES[currentNavSection] || []).includes(moduleName)
  ) {
    return currentNavSection;
  }
  const activePanel = document.querySelector(".nav-section-panel.active");
  if (activePanel) {
    const sid = activePanel.getAttribute("data-nav-section-panel");
    if (sid && (NAV_SECTION_MODULES[sid] || []).includes(moduleName)) return sid;
  }
  for (const [section, modules] of Object.entries(NAV_SECTION_MODULES)) {
    if (modules.includes(moduleName)) return section;
  }
  return preferredSection || currentNavSection || "inicio";
}

/**
 * Navegación única v41: una pestaña, un módulo, sin contenido residual.
 * navigateTo(section, module) — si module es null, usa landing de la sección.
 */
function isNavModuleCardActive(btn, mod) {
  if (!btn || btn.dataset.module !== mod) return false;
  if (mod !== "tasks") return true;
  const view = btn.getAttribute("data-task-view");
  const pref = btn.getAttribute("data-task-pref-type");
  const isNoticesCard = view === "notices" || pref === "INTERNAL_NOTICE";
  if (taskViewMode === "notices") return isNoticesCard;
  // ops: solo la tarjeta de tareas operativas (no la de avisos)
  return !isNoticesCard;
}

function syncNavModuleCardActiveState() {
  const mod = currentModuleName;
  moduleButtons.forEach((btn) => {
    btn.classList.toggle("active", Boolean(mod) && isNavModuleCardActive(btn, mod));
  });
}

/**
 * Navegación única v41: una pestaña, un módulo, sin contenido residual.
 * navigateTo(section, module) — si module es null, usa landing de la sección.
 */
function navigateTo(sectionId, moduleName) {
  if (!currentRole) return;

  const allowed = roleModules[currentRole] || [];
  let section = sectionId || null;
  let mod = moduleName || null;

  if (mod && !section) {
    section = resolveSectionForModule(mod, null);
  }
  if (!section || !NAV_SECTION_MODULES[section]) {
    section = currentNavSection && NAV_SECTION_MODULES[currentNavSection] ? currentNavSection : "inicio";
  }
  if (!mod) {
    mod = getDefaultModuleForSection(section);
  }
  if (mod && !allowed.includes(mod)) {
    mod = getDefaultModuleForSection(section);
  }
  if (!mod || !allowed.includes(mod)) {
    // Sin módulo permitido en la sección: solo limpia y muestra tarjetas.
    hideAllModules();
    setNavSection(section);
    currentNavSection = section;
    currentModuleName = null;
    moduleButtons.forEach((btn) => btn.classList.remove("active"));
    resetContentScroll();
    return;
  }

  // Alinear sección con el módulo si la sección explícita no lo contiene.
  if (!(NAV_SECTION_MODULES[section] || []).includes(mod)) {
    section = resolveSectionForModule(mod, section);
  }

  moduleButtons.forEach((btn) => {
    btn.classList.toggle("active", isNavModuleCardActive(btn, mod));
  });

  hideAllModules();
  setNavSection(section);
  currentNavSection = section;
  currentModuleName = mod;

  const activeEl = MODULE_REGISTRY[mod];
  if (activeEl) activeEl.classList.remove("hidden");

  const showUsers = mod === "users";
  const showControl = mod === "control";
  const showClients = mod === "clients";
  const showReports = mod === "reports";
  const showPicking = mod === "picking";
  const showInventory = mod === "inventory";
  const showCatalog = mod === "catalog";
  const showAccount = mod === "account";
  const showTraceability = mod === "traceability";
  const showTasks = mod === "tasks";
  const showIncidents = mod === "incidents";
  const showInbound = mod === "inbound";
  const showOutbound = mod === "outbound";
  const showRequisitions = mod === "requisitions";
  const showRelocate = mod === "relocate";
  const showBulkInbound = mod === "bulk-inbound";
  const showProjects = mod === "projects";
  const showWarehouses = mod === "warehouses";
  const showLocations = mod === "locations";
  const showConfig = mod === "config";

  const hasKnownModule =
    showUsers ||
    showControl ||
    showClients ||
    showReports ||
    showPicking ||
    showInventory ||
    showCatalog ||
    showAccount ||
    showTraceability ||
    showTasks ||
    showIncidents ||
    showInbound ||
    showOutbound ||
    showRequisitions ||
    showRelocate ||
    showBulkInbound ||
    showProjects ||
    showWarehouses ||
    showLocations ||
    showConfig;

  if (modulePlaceholder) modulePlaceholder.classList.toggle("hidden", hasKnownModule);

  if (showControl) refreshControlCenter();
  if (showClients) renderClientsModule();
  if (showInventory) {
    updateAviatHeaderUi();
    applyInventoryFilters();
  }
  if (showCatalog) {
    updateAviatHeaderUi();
    applyCatalogFilters();
  }
  if (showInbound) {
    populateOperationalSelects();
    applyOperationalPrefillToForm("inbound");
    void loadInboundList();
  }
  if (showOutbound) {
    populateOperationalSelects();
    applyOperationalPrefillToForm("outbound");
    void loadOutboundList();
  }
  if (showRequisitions) {
    populateOperationalSelects();
    void loadRequisitionsList();
  }
  if (showRelocate) {
    populateOperationalSelects();
  }
  if (showProjects) renderProjectsModule();
  if (showWarehouses) renderWarehousesModule();
  if (showLocations) renderLocationsModule();
  if (showTraceability) void loadTraceability();
  if (showTasks) {
    wireTasksModuleUi();
    void loadTasks();
  }
  if (showIncidents) {
    populateOperationalSelects();
    void loadIncidents();
  }
  if (showPicking) {
    resetPickingFlow();
    populatePickContextSelects();
    clearPickCandidates();
    setTimeout(() => scanInput?.focus(), 0);
  }

  resetContentScroll();
}

/** Compatibilidad: activa un módulo y sincroniza su pestaña. */
function activateModule(moduleName) {
  if (!moduleName || !currentRole) return;
  const allowed = roleModules[currentRole] || [];
  if (!allowed.includes(moduleName)) return;
  const section = resolveSectionForModule(moduleName, null);
  navigateTo(section, moduleName);
}

/**
 * Deep-link: #module=inbound (también tolera #module=inbound&x=1).
 * Se aplica solo tras sesión/role listos.
 */
function parseModuleFromLocationHash(hash = window.location.hash) {
  const raw = String(hash || "")
    .replace(/^#/, "")
    .trim();
  if (!raw) return null;
  // Formatos: module=inbound | module=inbound&foo=1 | ?module=inbound (si se coló query en hash)
  let candidate = null;
  if (/^module=/i.test(raw)) {
    candidate = raw.slice(raw.indexOf("=") + 1);
  } else if (raw.includes("module=")) {
    try {
      candidate = new URLSearchParams(raw).get("module");
    } catch (_e) {
      candidate = null;
    }
  }
  if (!candidate) return null;
  const moduleName = String(candidate).split("&")[0].split("/")[0].trim();
  if (!moduleName) return null;
  return moduleName;
}

function isRegisteredDashboardModule(moduleName) {
  return Boolean(moduleName && Object.prototype.hasOwnProperty.call(MODULE_REGISTRY, moduleName));
}

/**
 * Activa módulo desde hash o cae a Centro de Control / landing seguro.
 * @returns {boolean} true si se intentó navegar por hash (válido o fallback por hash inválido/sin permiso)
 */
function applyModuleDeepLinkFromHash() {
  if (!currentRole) return false;
  const moduleName = parseModuleFromLocationHash();
  if (!moduleName) return false;

  const allowed = roleModules[currentRole] || [];
  const canOpen =
    isRegisteredDashboardModule(moduleName) && allowed.includes(moduleName);

  if (!canOpen) {
    const fallback =
      allowed.includes("control")
        ? "control"
        : defaultLandingModule[currentRole] || roleModules[currentRole]?.[0] || "account";
    navigateTo(resolveSectionForModule(fallback, "inicio"), fallback);
    return true;
  }

  if (moduleName === "tasks") {
    taskViewMode = "ops";
  }

  navigateTo(resolveSectionForModule(moduleName, null), moduleName);

  if (moduleName === "tasks" && typeof applyTaskViewModeUi === "function") {
    applyTaskViewModeUi();
    updateTaskKpis(getTasksPoolForView());
    if (typeof renderTasksTable === "function") renderTasksTable();
    const typeSel = document.getElementById("taskType");
    if (typeSel && taskViewMode === "notices") typeSel.value = "INTERNAL_NOTICE";
  }

  return true;
}

function wireHashModuleNavigation() {
  if (window.__logitecHashNavWired) return;
  window.__logitecHashNavWired = true;
  window.addEventListener("hashchange", () => {
    if (!currentRole) return;
    // Hash vacío o sin module=: no forzar navegación (respeta clicks sin reescribir URL).
    if (!parseModuleFromLocationHash()) return;
    applyModuleDeepLinkFromHash();
  });
}

async function authenticatedFetch(path, options = {}) {
  const response = await fetch(path, {
    method: "GET",
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(options.headers || {})
    }
  });

  if (response.status === 401) {
    forceLogout();
    return null;
  }

  return response;
}

async function loadEnvironmentBadge() {
  if (!environmentBadge) return;
  try {
    const response = await fetch("/health", { cache: "no-store" });
    const payload = await response.json().catch(() => ({}));
    const environment = String(payload?.environment || "").toLowerCase();
    const isNonProduction = environment === "development" || environment === "qa";
    environmentBadge.classList.toggle("hidden", !isNonProduction);
    environmentBadge.textContent = environment === "qa" ? "ENTORNO QA" : "ENTORNO DEV";
  } catch {
    environmentBadge.classList.add("hidden");
  }
}

function renderUsersSummary(text) {
  usersSummary.innerHTML = `<li>${text}</li>`;
}

function formatScanDate(iso) {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return d.toLocaleString("es-MX", {
      dateStyle: "short",
      timeStyle: "medium"
    });
  } catch (_e) {
    return iso;
  }
}

function formatDateShort(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("es-MX", {
      dateStyle: "short",
      timeStyle: "short"
    });
  } catch (_e) {
    return iso;
  }
}

function renderCellEllipsis(value, maxWidth = 220) {
  const raw = value == null || value === "" ? "—" : String(value);
  return `<span class="cell-ellipsis" style="max-width:${maxWidth}px" title="${escCell(raw)}">${escCell(raw)}</span>`;
}

function updateTableCountMeta(elementId, shown, total, unit) {
  const el = document.getElementById(elementId);
  if (!el) return;
  el.textContent = `Mostrando ${shown} de ${total} ${unit}`;
}

const GRID_WIDTHS_PREFIX = "logitec_grid_widths_";
const GRID_SORT_PREFIX = "logitec_grid_sort_";
const GRID_DENSITY_KEY = "logitec_grid_density";
const GRID_SELECTION_PREFIX = "logitec_grid_sel_";

const GRID_DEFAULT_WIDTHS = {
  inventory: [140, 90, 170, 260, 110, 140, 110, 90],
  catalog: [140, 90, 170, 260, 110, 150],
  clients: [200, 120, 100, 120, 100],
  stock_cc: [140, 90, 170, 260, 140, 110, 90],
  movements: [130, 140, 90, 90, 170, 220, 80, 80, 120, 120, 140],
  traceability: [130, 140, 90, 90, 170, 220, 80, 80, 120, 120, 140],
  inbound: [140, 90, 170, 90, 90, 120, 120, 90],
  outbound: [140, 90, 170, 90, 90, 120, 120, 90],
  requisitions: [120, 140, 90, 200, 110, 100],
  tasks: [90, 110, 110, 180, 130, 110, 110, 120, 90, 100],
  incidents: [130, 100, 110, 140, 120, 200],
  picking: [140, 120, 90, 200],
  picking_op: [140, 120, 120, 90, 200]
};

const gridSortState = {};

function initGridDensity() {
  const mode = localStorage.getItem(GRID_DENSITY_KEY) || "comfortable";
  document.documentElement.dataset.gridDensity = mode;
  document.querySelectorAll(".grid-density-toggle").forEach((group) => {
    group.querySelectorAll("button[data-density]").forEach((btn) => {
      btn.classList.toggle("active", btn.getAttribute("data-density") === mode);
    });
  });
}

function setGridDensity(mode) {
  localStorage.setItem(GRID_DENSITY_KEY, mode);
  document.documentElement.dataset.gridDensity = mode;
  document.querySelectorAll(".grid-density-toggle button[data-density]").forEach((btn) => {
    btn.classList.toggle("active", btn.getAttribute("data-density") === mode);
  });
}

function loadGridColumnWidths(gridId, colCount) {
  try {
    const raw = localStorage.getItem(GRID_WIDTHS_PREFIX + gridId);
    const parsed = raw ? JSON.parse(raw) : null;
    if (Array.isArray(parsed) && parsed.length === colCount) return parsed;
  } catch (_e) {
    /* ignore */
  }
  const defaults = GRID_DEFAULT_WIDTHS[gridId];
  if (Array.isArray(defaults) && defaults.length === colCount) return [...defaults];
  return Array.from({ length: colCount }, () => 120);
}

function saveGridColumnWidths(gridId, widths) {
  localStorage.setItem(GRID_WIDTHS_PREFIX + gridId, JSON.stringify(widths));
}

function resetGridSettings(gridId) {
  localStorage.removeItem(GRID_WIDTHS_PREFIX + gridId);
  localStorage.removeItem(GRID_SORT_PREFIX + gridId);
  delete gridSortState[gridId];
}

function loadGridSort(gridId) {
  if (gridSortState[gridId]) return gridSortState[gridId];
  try {
    const raw = localStorage.getItem(GRID_SORT_PREFIX + gridId);
    if (raw) gridSortState[gridId] = JSON.parse(raw);
  } catch (_e) {
    /* ignore */
  }
  return gridSortState[gridId] || null;
}

function saveGridSort(gridId, sort) {
  gridSortState[gridId] = sort;
  if (sort) localStorage.setItem(GRID_SORT_PREFIX + gridId, JSON.stringify(sort));
  else localStorage.removeItem(GRID_SORT_PREFIX + gridId);
}

function compareSortValues(a, b, sortType) {
  if (sortType === "number") {
    return (Number(a) || 0) - (Number(b) || 0);
  }
  if (sortType === "date") {
    return (a ? new Date(a).getTime() : 0) - (b ? new Date(b).getTime() : 0);
  }
  return String(a ?? "").localeCompare(String(b ?? ""), "es", { sensitivity: "base" });
}

function sortRowDataList(rows, columns, gridId) {
  const sort = loadGridSort(gridId);
  if (!sort || sort.col == null || !columns[sort.col]?.sortKey) return rows;
  const col = columns[sort.col];
  const mult = sort.dir === "desc" ? -1 : 1;
  return [...rows].sort((a, b) => mult * compareSortValues(col.sortKey(a), col.sortKey(b), col.sortType || "text"));
}

function gridTemplateColumns(widths) {
  return widths.map((w) => `${Math.max(60, w)}px`).join(" ");
}

function sortIndicatorHtml(colIdx, gridId) {
  const sort = loadGridSort(gridId);
  if (!sort || sort.col !== colIdx) return "";
  return sort.dir === "desc" ? "↓" : "↑";
}

function wireDataGridScrollSync(gridRoot) {
  if (!gridRoot || gridRoot.dataset.scrollSync === "1") return;
  const body = gridRoot.querySelector(".data-grid-body-scroll");
  const headerX = gridRoot.querySelector(".data-grid-header-x");
  if (!body || !headerX) return;
  gridRoot.dataset.scrollSync = "1";
  body.addEventListener("scroll", () => {
    headerX.scrollLeft = body.scrollLeft;
  });
}

function wireColumnResizers(gridRoot, gridId, colCount, onResize) {
  if (!gridRoot) return;
  gridRoot.querySelectorAll(".col-resizer").forEach((handle) => {
    if (handle.dataset.resizeWired === "1") return;
    handle.dataset.resizeWired = "1";
    handle.addEventListener("mousedown", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const col = Number(handle.getAttribute("data-col"));
      const widths = loadGridColumnWidths(gridId, colCount);
      const startX = e.clientX;
      const startW = widths[col];
      const onMove = (ev) => {
        widths[col] = Math.max(60, startW + (ev.clientX - startX));
        onResize(widths);
      };
      const onUp = () => {
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
        saveGridColumnWidths(gridId, widths);
      };
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    });
  });
}

function applyGridTemplate(gridRoot, widths) {
  const tpl = gridTemplateColumns(widths);
  gridRoot.querySelectorAll(".data-grid-row").forEach((row) => {
    row.style.gridTemplateColumns = tpl;
    row.style.minWidth = `${widths.reduce((a, b) => a + b, 0)}px`;
  });
}

function wireGridSortHeaders(gridRoot, gridId, columns, onSortChange) {
  gridRoot.querySelectorAll(".head-cell[data-col]").forEach((cell) => {
    if (cell.dataset.sortWired === "1") return;
    cell.dataset.sortWired = "1";
    cell.addEventListener("click", (e) => {
      if (e.target.classList.contains("col-resizer")) return;
      const col = Number(cell.getAttribute("data-col"));
      if (!columns[col]?.sortKey) return;
      const cur = loadGridSort(gridId);
      let dir = "asc";
      if (cur && cur.col === col) dir = cur.dir === "asc" ? "desc" : "asc";
      saveGridSort(gridId, { col, dir });
      onSortChange();
    });
  });
}

function wireGridRowSelection(gridRoot, gridId, rowDataList, onSelect) {
  gridRoot.querySelectorAll(".data-grid-row.body[data-row-idx]").forEach((row) => {
    if (row.dataset.selectWired === "1") return;
    row.dataset.selectWired = "1";
    row.addEventListener("click", (e) => {
      if (e.target.closest("button")) return;
      gridRoot.querySelectorAll(".data-grid-row.body.row-selected").forEach((r) => r.classList.remove("row-selected"));
      row.classList.add("row-selected");
      const idx = Number(row.getAttribute("data-row-idx"));
      const data = rowDataList[idx];
      if (data && onSelect) onSelect(data, idx);
    });
  });
}

function reloadGridById(gridId) {
  if (gridId === "inventory") applyInventoryFilters();
  else if (gridId === "catalog") applyCatalogFilters();
  else if (gridId === "clients") renderClientsModule();
  else if (gridId === "stock_cc") refreshControlCenter();
  else if (gridId === "movements") void loadInventoryMovements();
  else if (gridId === "traceability") void loadTraceability();
  else if (gridId === "inbound") void loadInboundList();
  else if (gridId === "outbound") void loadOutboundList();
  else if (gridId === "requisitions") void loadRequisitionsList();
  else if (gridId === "tasks") void loadTasks();
  else if (gridId === "incidents") void loadIncidents();
  else if (gridId === "picking" || gridId === "picking_op") void loadScanEvents();
}

function openDetailDrawer(title, fields, actions) {
  const drawer = document.getElementById("gridDetailDrawer");
  const titleEl = document.getElementById("gridDetailTitle");
  const bodyEl = document.getElementById("gridDetailBody");
  const actionsEl = document.getElementById("gridDetailActions");
  if (!drawer || !titleEl || !bodyEl || !actionsEl) return;
  titleEl.textContent = title;
  bodyEl.innerHTML = fields
    .map(
      (f) =>
        `<div class="detail-field"><label>${escCell(f.label)}</label><span>${escCell(f.value ?? "—")}</span></div>`
    )
    .join("");
  actionsEl.innerHTML = actions
    .map((a) => `<button type="button" class="${a.className || "btn-secondary"}" data-detail-action="${escCell(a.id)}">${escCell(a.label)}</button>`)
    .join("");
  actionsEl.querySelectorAll("[data-detail-action]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const act = actions.find((a) => a.id === btn.getAttribute("data-detail-action"));
      if (act?.onClick) act.onClick();
    });
  });
  drawer.classList.add("open");
  drawer.setAttribute("aria-hidden", "false");
}

function closeDetailDrawer() {
  const drawer = document.getElementById("gridDetailDrawer");
  if (!drawer) return;
  drawer.classList.remove("open");
  drawer.setAttribute("aria-hidden", "true");
}

function setOperationalPrefill(data) {
  try {
    sessionStorage.setItem("logitec_ops_prefill", JSON.stringify(data));
  } catch (_e) {
    /* ignore */
  }
}

function readOperationalPrefill() {
  try {
    const raw = sessionStorage.getItem("logitec_ops_prefill");
    return raw ? JSON.parse(raw) : null;
  } catch (_e) {
    return null;
  }
}

function applyOperationalPrefillToForm(prefix) {
  const data = readOperationalPrefill();
  if (!data) return;
  const map = {
    customer: `${prefix}Customer`,
    cliente: `${prefix}Cliente`,
    sku: `${prefix}Sku`,
    product: `${prefix}Product`,
    warehouse: `${prefix}Warehouse`,
    location: `${prefix}Location`,
    status: `${prefix}Status`
  };
  Object.entries(map).forEach(([key, id]) => {
    const el = document.getElementById(id);
    if (el && data[key] != null) {
      if (el.tagName === "SELECT") el.value = data[key];
      else el.value = data[key];
    }
  });
  populateOperationalSelects();
  if (data.sku) {
    const skuEl = document.getElementById(`${prefix}Sku`);
    if (skuEl) skuEl.value = data.sku;
    const prodEl = document.getElementById(`${prefix}Product`);
    const prod = findProductBySku(data.sku);
    if (prodEl && prod) prodEl.value = prod.name || "";
  }
  sessionStorage.removeItem("logitec_ops_prefill");
}

function openInventoryDetail(row) {
  const p = row.product || {};
  openDetailDrawer("Detalle de inventario", [
    { label: "Cliente principal", value: PRIMARY_CLIENT_AVIAT_NAME },
    { label: "Proyecto", value: getAviatProjectDisplayFromRow(row) },
    { label: "Lote", value: extractLoteFromRow(row) },
    { label: "SKU / Código de barras", value: formatSkuBarcode(p) },
    { label: "Producto", value: p.name },
    { label: "Almacén", value: row.location?.warehouse },
    { label: "Ubicación", value: row.location?.code },
    { label: "Estatus", value: formatInventoryStatus(row.status) },
    { label: "Cantidad", value: formatQty(row.qty) }
  ], [
    {
      id: "inbound",
      label: "Registrar entrada",
      className: "btn-primary",
      onClick: () => {
        setOperationalPrefill({
          customer: p.customer?.code,
          cliente: p.customer?.name,
          sku: p.sku,
          warehouse: row.location?.warehouse || "TULTITLAN24",
          location: row.location?.code,
          status: row.status || "AVAILABLE"
        });
        closeDetailDrawer();
        activateModule("inbound");
      }
    },
    {
      id: "outbound",
      label: "Registrar salida",
      className: "btn-secondary",
      onClick: () => {
        setOperationalPrefill({
          customer: p.customer?.code,
          cliente: p.customer?.name,
          sku: p.sku,
          warehouse: row.location?.warehouse || "TULTITLAN24",
          location: row.location?.code,
          status: row.status || "AVAILABLE"
        });
        closeDetailDrawer();
        activateModule("outbound");
      }
    },
    {
      id: "trace",
      label: "Ver trazabilidad",
      className: "btn-secondary",
      onClick: () => {
        const traceSku = document.getElementById("traceSku");
        if (traceSku) traceSku.value = p.sku || "";
        closeDetailDrawer();
        activateModule("traceability");
      }
    },
    {
      id: "incident",
      label: "Reportar incidencia",
      className: "btn-secondary",
      onClick: () => {
        const wh = document.getElementById("incidentWarehouse");
        const loc = document.getElementById("incidentLocation");
        if (wh) wh.value = row.location?.warehouse || "";
        if (loc) loc.value = row.location?.code || "";
        closeDetailDrawer();
        activateModule("incidents");
      }
    }
  ]);
}

function openCatalogDetail(product) {
  openDetailDrawer("Detalle de producto", [
    { label: "Cliente principal", value: PRIMARY_CLIENT_AVIAT_NAME },
    { label: "Proyecto", value: getAviatProjectDisplayFromRow(product) },
    { label: "Lote", value: "N/D" },
    { label: "SKU / Código de barras", value: formatSkuBarcode(product) },
    { label: "Producto", value: product.name },
    { label: "Almacén", value: product.warehouse },
    { label: "Código de barras", value: product.barcode }
  ], [
    {
      id: "inventory",
      label: "Ver inventario",
      className: "btn-primary",
      onClick: () => {
        const fSku = document.getElementById("invFilterSku");
        if (fSku) fSku.value = product.sku || "";
        closeDetailDrawer();
        activateModule("inventory");
        applyInventoryFilters();
      }
    },
    {
      id: "trace",
      label: "Ver trazabilidad",
      className: "btn-secondary",
      onClick: () => {
        const traceSku = document.getElementById("traceSku");
        if (traceSku) traceSku.value = product.sku || "";
        closeDetailDrawer();
        activateModule("traceability");
      }
    }
  ]);
}

function renderDataGrid(container, opts) {
  if (!container) return;
  const {
    gridId,
    columns,
    rowDataList = [],
    rowCellsFn,
    rowCellsList,
    colsClass = "",
    sizeClass = "data-grid-size-inventory",
    emptyMessage = "Sin registros.",
    selectable = true,
    onRowSelect,
    detailType
  } = opts;

  const sorted = sortRowDataList(rowDataList, columns, gridId);
  const cellsList = rowCellsFn
    ? sorted.map((row) => rowCellsFn(row))
    : rowCellsList || [];

  if (!cellsList.length) {
    container.innerHTML = `<div class="data-grid ${sizeClass}"><div class="data-grid-empty">${escCell(emptyMessage)}</div></div>`;
    return;
  }

  const widths = loadGridColumnWidths(gridId, columns.length);
  const tpl = gridTemplateColumns(widths);

  const headerHtml = columns
    .map((col, ci) => {
      const extra = col.align === "right" ? " numeric-cell" : "";
      const sortable = col.sortKey ? " sortable" : "";
      return `<div class="data-grid-cell head-cell${extra}${sortable}" data-col="${ci}" title="Ordenar"><span class="head-label">${escCell(col.label)}</span><span class="sort-indicator">${sortIndicatorHtml(ci, gridId)}</span><span class="col-resizer" data-col="${ci}"></span></div>`;
    })
    .join("");

  const bodyHtml = cellsList
    .map((cells, idx) => {
      const rowCells = cells
        .map((cellHtml, ci) => {
          const extra = columns[ci]?.align === "right" ? " numeric-cell" : "";
          return `<div class="data-grid-cell${extra}">${cellHtml}</div>`;
        })
        .join("");
      return `<div class="data-grid-row body ${colsClass}${idx % 2 === 1 ? " row-alt" : ""}" data-row-idx="${idx}" style="grid-template-columns:${tpl};min-width:${widths.reduce((a, b) => a + b, 0)}px">${rowCells}</div>`;
    })
    .join("");

  container.innerHTML = `
    <div class="data-grid ${sizeClass}" data-grid-id="${escCell(gridId)}">
      <div class="data-grid-header-x">
        <div class="data-grid-row head ${colsClass}" style="grid-template-columns:${tpl};min-width:${widths.reduce((a, b) => a + b, 0)}px">${headerHtml}</div>
      </div>
      <div class="data-grid-body-scroll">${bodyHtml}</div>
    </div>`;

  const gridRoot = container.firstElementChild;
  wireDataGridScrollSync(gridRoot);
  wireColumnResizers(gridRoot, gridId, columns.length, (w) => applyGridTemplate(gridRoot, w));
  wireGridSortHeaders(gridRoot, gridId, columns, () => {
    renderDataGrid(container, opts);
  });
  if (selectable) {
    const selectHandler =
      onRowSelect ||
      (detailType === "inventory"
        ? openInventoryDetail
        : detailType === "catalog"
          ? openCatalogDetail
          : null);
    wireGridRowSelection(gridRoot, gridId, sorted, selectHandler);
  }
}

function renderExcelTable(container, opts) {
  if (!container) return;
  const {
    gridId,
    columns,
    rows = [],
    emptyMessage = "Sin registros operativos aún",
    selectable = true,
    onRowSelect,
    allowActions = false
  } = opts;

  if (!rows.length) {
    container.innerHTML = `<div class="data-grid-empty" style="padding:24px;border:1px solid var(--line);border-radius:12px;background:var(--panel-solid)">${escCell(emptyMessage)}</div>`;
    return;
  }

  const sorted = sortRowDataList(rows, columns, gridId);
  const widths = loadGridColumnWidths(gridId, columns.length);
  const colgroup = widths.map((w) => `<col style="width:${Math.max(60, w)}px">`).join("");

  const thead = `<tr>${columns
    .map(
      (col, ci) =>
        `<th data-col="${ci}" title="Ordenar">${escCell(col.label)}<span class="sort-indicator">${sortIndicatorHtml(ci, gridId)}</span><span class="col-resizer" data-col="${ci}"></span></th>`
    )
    .join("")}${allowActions ? "<th style=\"width:90px\">Acción</th>" : ""}</tr>`;

  const tbody = sorted
    .map((row, idx) => {
      const cells = columns
        .map((col) => {
          const raw = col.render ? col.render(row) : "—";
          const align = col.align === "right" ? ' class="numeric"' : "";
          const title = col.title ? col.title(row) : typeof raw === "string" ? raw.replace(/<[^>]+>/g, "") : "";
          return `<td${align} title="${escCell(title)}">${raw}</td>`;
        })
        .join("");
      const actionCell = allowActions && row._actionHtml ? `<td>${row._actionHtml}</td>` : allowActions ? "<td>—</td>" : "";
      return `<tr data-row-idx="${idx}" data-selectable="${selectable ? "1" : "0"}">${cells}${actionCell}</tr>`;
    })
    .join("");

  container.innerHTML = `<div class="table-wrap excel-table-wrap" data-grid-id="${escCell(gridId)}"><table class="excel-table scan-table"><colgroup>${colgroup}</colgroup><thead>${thead}</thead><tbody>${tbody}</tbody></table></div>`;

  const wrap = container.firstElementChild;
  const table = wrap.querySelector("table");

  wrap.querySelectorAll(".col-resizer").forEach((handle) => {
    if (handle.dataset.resizeWired === "1") return;
    handle.dataset.resizeWired = "1";
    handle.addEventListener("mousedown", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const col = Number(handle.getAttribute("data-col"));
      const w = loadGridColumnWidths(gridId, columns.length);
      const startX = e.clientX;
      const startW = w[col];
      const cols = table.querySelectorAll("colgroup col");
      const onMove = (ev) => {
        w[col] = Math.max(60, startW + (ev.clientX - startX));
        if (cols[col]) cols[col].style.width = `${w[col]}px`;
      };
      const onUp = () => {
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
        saveGridColumnWidths(gridId, w);
      };
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    });
  });

  wrap.querySelectorAll("th[data-col]").forEach((th) => {
    if (th.dataset.sortWired === "1") return;
    th.dataset.sortWired = "1";
    th.addEventListener("click", (e) => {
      if (e.target.classList.contains("col-resizer")) return;
      const col = Number(th.getAttribute("data-col"));
      if (!columns[col]?.sortKey) return;
      const cur = loadGridSort(gridId);
      let dir = "asc";
      if (cur && cur.col === col) dir = cur.dir === "asc" ? "desc" : "asc";
      saveGridSort(gridId, { col, dir });
      renderExcelTable(container, opts);
    });
  });

  if (selectable) {
    wrap.querySelectorAll("tbody tr[data-row-idx]").forEach((tr) => {
      tr.addEventListener("click", (e) => {
        if (e.target.closest("button")) return;
        wrap.querySelectorAll("tbody tr.row-selected").forEach((r) => r.classList.remove("row-selected"));
        tr.classList.add("row-selected");
        const idx = Number(tr.getAttribute("data-row-idx"));
        if (onRowSelect) onRowSelect(sorted[idx], idx);
      });
    });
  }
}

function wireGridToolbars() {
  document.querySelectorAll("[data-reset-grid]").forEach((btn) => {
    if (btn.dataset.toolbarWired === "1") return;
    btn.dataset.toolbarWired = "1";
    btn.addEventListener("click", () => {
      const gridId = btn.getAttribute("data-reset-grid");
      if (!gridId) return;
      resetGridSettings(gridId);
      if (gridId === "picking") resetGridSettings("picking_op");
      reloadGridById(gridId);
    });
  });
  document.querySelectorAll(".grid-density-toggle button[data-density]").forEach((btn) => {
    if (btn.dataset.densityWired === "1") return;
    btn.dataset.densityWired = "1";
    btn.addEventListener("click", () => setGridDensity(btn.getAttribute("data-density") || "comfortable"));
  });
  document.querySelectorAll("[data-close-drawer]").forEach((el) => {
    if (el.dataset.drawerWired === "1") return;
    el.dataset.drawerWired = "1";
    el.addEventListener("click", closeDetailDrawer);
  });
}

/** Etiquetas visibles de estatus de inventario (el valor API permanece en inglés). */
const INVENTORY_STATUS_LABELS_ES = {
  AVAILABLE: "Disponible",
  OPERATIONS: "Operaciones",
  HOLD: "Retenido",
  BLOCKED: "Bloqueado",
  QUARANTINE: "Cuarentena"
};

/**
 * Traduce códigos de estatus de inventario a español para UI.
 * No modifica el valor usado en API/BD.
 */
function formatInventoryStatus(status) {
  if (status == null || status === "") return "—";
  const upper = String(status).trim().toUpperCase();
  return INVENTORY_STATUS_LABELS_ES[upper] || String(status);
}

function inventoryStatusSearchBlob(status) {
  const raw = status == null ? "" : String(status);
  return `${raw} ${formatInventoryStatus(raw)}`.toLowerCase();
}

function inventoryStatusBadge(value) {
  const raw = value == null || value === "" ? "—" : String(value);
  const upper = raw.toUpperCase();
  const inventoryTones = {
    AVAILABLE: "available",
    OPERATIONS: "operations",
    HOLD: "hold",
    BLOCKED: "blocked",
    QUARANTINE: "quarantine"
  };
  if (inventoryTones[upper]) {
    const label = formatInventoryStatus(upper);
    return `<span class="badge status-badge ${inventoryTones[upper]}" title="${escCell(upper)}">${escCell(label)}</span>`;
  }
  return statusBadge(raw);
}

function renderCellWithClamp(value, className = "", maxLen = 32) {
  const raw = value == null || value === "" ? "—" : String(value);
  const display = raw.length > maxLen ? `${raw.slice(0, maxLen)}…` : raw;
  const safeDisplay = escCell(display);
  const safeTitle = escCell(raw);
  return `<span class="${className}" title="${safeTitle}">${safeDisplay}</span>`;
}

function statusBadge(value) {
  const raw = value == null || value === "" ? "—" : String(value);
  const upper = raw.toUpperCase();
  const inventoryTones = {
    AVAILABLE: "available",
    OPERATIONS: "operations",
    HOLD: "hold",
    BLOCKED: "blocked",
    QUARANTINE: "quarantine"
  };
  if (inventoryTones[upper]) {
    const label = formatInventoryStatus(upper);
    return `<span class="badge ${inventoryTones[upper]}" title="${escCell(upper)}">${escCell(label)}</span>`;
  }
  const tone =
    raw.includes("COMPLETED") || raw.includes("RESOLVED") || raw === "OK"
      ? "success"
      : raw.includes("IN_PROGRESS")
        ? "warn"
        : raw.includes("ERROR") || raw.includes("REJECTED")
          ? "error"
          : "info";
  return `<span class="badge ${tone}">${escCell(raw)}</span>`;
}

function taskStatusBadge(status) {
  const key = String(status || "").toUpperCase();
  const label = TASK_STATUS_LABELS[key] || status || "—";
  const toneMap = {
    PENDING: "status-pending",
    ASSIGNED: "status-assigned",
    IN_PROGRESS: "status-progress",
    COMPLETED: "status-done",
    REJECTED: "status-rejected",
    CANCELLED: "status-cancelled"
  };
  return `<span class="badge ${toneMap[key] || "info"}">${escCell(label)}</span>`;
}

function priorityBadge(priority) {
  const n = Number(priority) || 0;
  if (n >= 80) return `<span class="badge prio-alta">${n >= 100 ? "Urgente" : "Alta"}</span>`;
  if (n >= 40) return `<span class="badge prio-media">Media</span>`;
  return `<span class="badge prio-baja">Baja</span>`;
}

/** Parser dual: notes de tareas operativas y de requisiciones (PICK). */
function parseTaskNotes(notes) {
  if (!notes) return {};
  if (typeof notes === "object" && notes !== null) return notes;
  try {
    const parsed = JSON.parse(notes);
    return parsed && typeof parsed === "object" ? parsed : { description: String(notes) };
  } catch (_e) {
    return { description: String(notes) };
  }
}

function enrichTaskRow(t) {
  const notes = parseTaskNotes(t.notes);
  const title = notes.title || t.reference || "Sin título";
  const taskLabel =
    notes.taskLabel ||
    (notes.customerCode || notes.customerName || notes.qty != null
      ? notes.orderMode
        ? "Orden de surtido"
        : "Picking (req.)"
      : null) ||
    (t.type === "PICK"
      ? "Picking"
      : t.type === "COUNT"
        ? "Inventario"
        : t.type === "MOVE"
          ? "Movimiento interno / Reubicación"
          : t.type === "ADJUSTMENT"
            ? "General"
            : t.type === "RECEIVE"
              ? "Recepción"
              : t.type || "—");
  const dueDate = notes.dueDate || "";
  const project = notes.project || notes.customerName || notes.customerCode || "";
  const lote = notes.lote || "";
  const sku = notes.sku || "";
  const location = notes.location || "";
  const description = notes.description || notes.detail || "";
  const followUp = Array.isArray(notes.followUp) ? notes.followUp : [];
  return {
    ...t,
    _notes: notes,
    _title: title,
    _taskLabel: taskLabel,
    _dueDate: dueDate,
    _project: project,
    _lote: lote,
    _sku: sku,
    _location: location,
    _description: description,
    _followUp: followUp,
    _assignName: t.assignedTo?.fullName || "—",
    _creatorName: t.createdBy?.fullName || "—"
  };
}

function isTaskOverdue(task) {
  if (!task._dueDate) return false;
  if (task.status === "COMPLETED" || task.status === "CANCELLED" || task.status === "REJECTED") return false;
  const due = new Date(task._dueDate);
  if (Number.isNaN(due.getTime())) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  due.setHours(0, 0, 0, 0);
  return due < today;
}

function canManageAllTasks() {
  return currentRole === "ADMIN" || currentRole === "SUPERVISOR";
}

function canCreateTasks() {
  return currentRole === "ADMIN" || currentRole === "SUPERVISOR" || currentRole === "OPERATOR";
}

function canAssignTasks() {
  return currentRole === "ADMIN" || currentRole === "SUPERVISOR";
}

function canCancelOrRejectTasks() {
  return currentRole === "ADMIN" || currentRole === "SUPERVISOR";
}

function canActOnTask(task) {
  if (canManageAllTasks()) return true;
  if (currentRole === "OPERATOR") {
    return task.assignedToId === currentUserId || task.createdById === currentUserId || !task.assignedToId;
  }
  return false;
}

let tasksCache = [];
let assigneesCache = [];
let taskActiveTab = "mine";
/** "ops" = tareas operativas; "notices" = avisos internos (misma capa Task, vista separada). */
let taskViewMode = "ops";
let reqOrderMode = "simple";

const INTERNAL_NOTICE_LABEL = "Aviso interno";

function isInternalNoticeTask(t) {
  if (!t) return false;
  const notes = t._notes || parseTaskNotes(t.notes);
  if (notes?.isInternalNotice === true) return true;
  const label = String(t._taskLabel || notes?.taskLabel || "").trim().toLowerCase();
  return label === INTERNAL_NOTICE_LABEL.toLowerCase();
}

function getTasksPoolForView() {
  const list = Array.isArray(tasksCache) ? tasksCache : [];
  if (taskViewMode === "notices") return list.filter((t) => isInternalNoticeTask(t));
  return list.filter((t) => !isInternalNoticeTask(t));
}

function updateTaskKpis(rows) {
  const list = Array.isArray(rows) ? rows : getTasksPoolForView();
  const set = (id, n) => {
    const el = document.getElementById(id);
    if (el) el.textContent = String(n);
  };
  set("taskKpiPending", list.filter((t) => t.status === "PENDING").length);
  set("taskKpiAssigned", list.filter((t) => t.status === "ASSIGNED").length);
  set("taskKpiInProgress", list.filter((t) => t.status === "IN_PROGRESS").length);
  set("taskKpiCompleted", list.filter((t) => t.status === "COMPLETED").length);
  set("taskKpiOverdue", list.filter((t) => isTaskOverdue(t)).length);
  set(
    "taskKpiMine",
    list.filter((t) => t.assignedToId === currentUserId || t.createdById === currentUserId).length
  );
}

function filterTasksForTab(rows, tab) {
  const list = Array.isArray(rows) ? rows : [];
  if (taskViewMode === "notices") {
    if (tab === "notices-sent") return list.filter((t) => t.createdById === currentUserId);
    // Avisos recibidos: asignados a mí o creados por mí sin asignar
    return list.filter(
      (t) => t.assignedToId === currentUserId || (!t.assignedToId && t.createdById === currentUserId)
    );
  }
  if (tab === "mine") {
    return list.filter((t) => t.assignedToId === currentUserId || (!t.assignedToId && t.createdById === currentUserId));
  }
  if (tab === "created") return list.filter((t) => t.createdById === currentUserId);
  if (tab === "completed") return list.filter((t) => t.status === "COMPLETED");
  return list;
}

function applyTaskViewModeUi() {
  const notices = taskViewMode === "notices";
  const title = document.getElementById("tasksModuleTitle");
  const lead = document.getElementById("tasksModuleLead");
  const createTitle = document.getElementById("taskCreateTitle");
  const createBtn = document.getElementById("taskCreateBtn");
  const hint = document.getElementById("taskInternalNoticeHint");
  const typeSel = document.getElementById("taskType");
  const typeField = typeSel?.closest(".field");
  const filterTypeField = document.getElementById("taskFilterTypeField");
  const filtersTitle = document.getElementById("taskFiltersTitle");
  const filtersHint = document.getElementById("taskFiltersHint");
  const refLabel = document.getElementById("taskRefLabel");
  const descLabel = document.getElementById("taskDescriptionLabel");
  const assigneeLabel = document.getElementById("taskAssigneeLabel");
  const dueLabel = document.getElementById("taskDueDateLabel");
  const refInput = document.getElementById("taskRef");
  const descInput = document.getElementById("taskDescription");
  const filterText = document.getElementById("taskFilterText");
  const kpiMineLabel = document.querySelector('#taskKpiMine')?.parentElement?.querySelector(".kpi-label");
  const kpiDoneLabel = document.querySelector('#taskKpiCompleted')?.parentElement?.querySelector(".kpi-label");

  if (title) title.textContent = notices ? "Avisos internos" : "Mis tareas operativas";
  if (lead) {
    lead.textContent = notices
      ? "Comunicación operativa entre administrador, supervisor y operadores."
      : "Trabajo asignado para almacén, inventario, surtido, incidencias y movimientos.";
  }
  if (createTitle) createTitle.textContent = notices ? "Enviar aviso" : "Crear tarea";
  if (createBtn) createBtn.textContent = notices ? "Enviar aviso" : "Crear tarea";
  if (hint) hint.classList.toggle("hidden", !notices);
  if (filtersTitle) {
    filtersTitle.textContent = notices ? "Buscar y filtrar avisos" : "Buscar y filtrar tareas";
  }
  if (filtersHint) {
    filtersHint.textContent = notices
      ? "Filtra por estado, destinatario, prioridad o texto del aviso."
      : "Filtra por tipo, estatus, responsable, prioridad, fecha objetivo o texto.";
  }
  if (filterTypeField) filterTypeField.style.display = notices ? "none" : "";

  if (refLabel) refLabel.textContent = notices ? "Asunto" : "Título / folio";
  if (descLabel) descLabel.textContent = notices ? "Mensaje" : "Descripción";
  if (assigneeLabel) assigneeLabel.textContent = notices ? "Destinatario / responsable" : "Responsable asignado";
  if (dueLabel) dueLabel.textContent = notices ? "Fecha objetivo (opcional)" : "Fecha objetivo";
  if (refInput) {
    refInput.placeholder = notices ? "Asunto del aviso" : "Ej. INV-COUNT-014 o REVISIÓN PASILLO B";
  }
  if (descInput) {
    descInput.placeholder = notices ? "Escribe el mensaje para el destinatario" : "Detalle operativo de la tarea";
    descInput.rows = notices ? 4 : 2;
  }
  if (filterText) {
    filterText.placeholder = notices ? "Buscar por asunto o mensaje…" : "Buscar por título, SKU, lote…";
  }
  if (kpiMineLabel) kpiMineLabel.textContent = notices ? "Mis avisos" : "Mis tareas";
  if (kpiDoneLabel) kpiDoneLabel.textContent = notices ? "Atendidos" : "Completadas";

  document.querySelectorAll("#taskCreateWrap [data-ops-field]").forEach((el) => {
    el.classList.toggle("hidden", notices);
  });

  document.querySelectorAll("#taskTabs [data-ops-only]").forEach((el) => {
    el.classList.toggle("hidden", notices);
  });
  document.querySelectorAll("#taskTabs [data-notices-only]").forEach((el) => {
    el.classList.toggle("hidden", !notices);
  });

  const tabAll = document.getElementById("taskTabAll");
  if (tabAll && !notices) {
    const showAll = canManageAllTasks();
    tabAll.style.display = showAll ? "" : "none";
  }

  if (notices) {
    if (typeSel) {
      typeSel.value = "INTERNAL_NOTICE";
      typeSel.disabled = true;
    }
    if (typeField) typeField.classList.add("hidden");
    taskActiveTab = taskActiveTab === "notices-sent" ? "notices-sent" : "notices";
  } else {
    if (typeSel) {
      typeSel.disabled = false;
      if (typeSel.value === "INTERNAL_NOTICE") typeSel.value = "GENERAL";
    }
    if (typeField) typeField.classList.remove("hidden");
    if (taskActiveTab === "notices" || taskActiveTab === "notices-sent") taskActiveTab = "mine";
  }

  document.querySelectorAll("#taskTabs .tasks-tab").forEach((btn) => {
    btn.classList.toggle("active", btn.getAttribute("data-task-tab") === taskActiveTab);
  });
  syncNavModuleCardActiveState();
}

function setTaskViewMode(mode) {
  taskViewMode = mode === "notices" ? "notices" : "ops";
  applyTaskViewModeUi();
  updateTaskKpis(getTasksPoolForView());
  renderTasksTable();
}

function applyTaskFilters(rows) {
  let list = Array.isArray(rows) ? rows.slice() : [];
  const type = document.getElementById("taskFilterType")?.value || "";
  const status = document.getElementById("taskFilterStatus")?.value || "";
  const assignee = document.getElementById("taskFilterAssignee")?.value || "";
  const priority = document.getElementById("taskFilterPriority")?.value || "";
  const due = document.getElementById("taskFilterDue")?.value || "";
  const text = (document.getElementById("taskFilterText")?.value || "").trim().toLowerCase();

  if (type) list = list.filter((t) => t.type === type);
  if (status) list = list.filter((t) => t.status === status);
  if (assignee) list = list.filter((t) => t.assignedToId === assignee);
  if (priority === "low") list = list.filter((t) => (t.priority ?? 0) < 40);
  if (priority === "mid") list = list.filter((t) => (t.priority ?? 0) >= 40 && (t.priority ?? 0) < 80);
  if (priority === "high") list = list.filter((t) => (t.priority ?? 0) >= 80);
  if (due) list = list.filter((t) => String(t._dueDate || "").slice(0, 10) === due);
  if (text) {
    list = list.filter((t) => {
      const hay = [t._title, t.reference, t._description, t._sku, t._lote, t._project, t._taskLabel, t._assignName]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(text);
    });
  }
  return list;
}

function buildTaskActionHtml(t) {
  const buttons = [];
  const id = escCell(t.id);
  const terminal = t.status === "COMPLETED" || t.status === "CANCELLED" || t.status === "REJECTED";

  // Avisos internos: comunicación, no workflow operativo
  if (taskViewMode === "notices" || isInternalNoticeTask(t)) {
    buttons.push(
      `<button type="button" class="btn-table btn-compact task-view" data-task-id="${id}" data-task-action="view">Abrir</button>`
    );
    if (!terminal && (canActOnTask(t) || t.assignedToId === currentUserId || canManageAllTasks())) {
      buttons.push(
        `<button type="button" class="btn-table btn-compact task-act" data-task-id="${id}" data-task-action="complete">Marcar atendido</button>`
      );
    }
    return `<div class="task-actions-cell">${buttons.join("")}</div>`;
  }

  buttons.push(
    `<button type="button" class="btn-table btn-compact task-view" data-task-id="${id}" data-task-action="view">Abrir</button>`
  );

  if (terminal) {
    return `<div class="task-actions-cell">${buttons.join("")}</div>`;
  }

  if (!t.assignedToId && (canAssignTasks() || (currentRole === "OPERATOR" && t.createdById === currentUserId))) {
    if (canActOnTask(t) || canAssignTasks()) {
      buttons.push(
        `<button type="button" class="btn-table btn-compact task-act" data-task-id="${id}" data-task-action="claim">Tomar</button>`
      );
    }
  }

  if (canActOnTask(t) && (t.assignedToId === currentUserId || canManageAllTasks())) {
    if (t.status === "PENDING" || t.status === "ASSIGNED") {
      buttons.push(
        `<button type="button" class="btn-table btn-compact task-act" data-task-id="${id}" data-task-action="start">Iniciar</button>`
      );
    }
    if (t.status === "IN_PROGRESS" || t.status === "ASSIGNED" || t.status === "PENDING") {
      buttons.push(
        `<button type="button" class="btn-table btn-compact task-act" data-task-id="${id}" data-task-action="complete">Completar</button>`
      );
    }
  }

  if (canCancelOrRejectTasks()) {
    buttons.push(
      `<button type="button" class="btn-table btn-compact btn-danger task-act" data-task-id="${id}" data-task-action="cancel">Cancelar</button>`
    );
    buttons.push(
      `<button type="button" class="btn-table btn-compact btn-danger task-act" data-task-id="${id}" data-task-action="reject">Rechazar</button>`
    );
  }

  return `<div class="task-actions-cell">${buttons.join("")}</div>`;
}

function renderTasksTable() {
  if (!taskList) return;
  const pool = getTasksPoolForView();
  const tabbed = filterTasksForTab(pool, taskActiveTab);
  const filtered = applyTaskFilters(tabbed);
  if (taskMessage) {
    const unit = taskViewMode === "notices" ? "aviso" : "tarea";
    taskMessage.textContent = `${filtered.length} ${unit}(s) en vista · ${pool.length} en esta sección · ${tasksCache.length} total.`;
  }
  const columns = taskViewMode === "notices" ? NOTICE_COLUMNS : TASK_COLUMNS;
  const taskRows = filtered.map((t) => ({
    ...t,
    _actionHtml: buildTaskActionHtml(t)
  }));
  renderExcelTable(taskList, {
    gridId: "tasks",
    columns,
    rows: taskRows,
    emptyMessage:
      taskViewMode === "notices" ? "Sin avisos internos en esta vista" : "Sin tareas en esta vista",
    selectable: false,
    allowActions: true
  });
}

async function loadAssigneesForTasks() {
  const assigneeSelect = document.getElementById("taskAssignee");
  const filterSelect = document.getElementById("taskFilterAssignee");
  const hint = document.getElementById("taskAssigneeHint");
  const createUserBtn = document.getElementById("taskCreateUserBtn");
  const setHint = (text, cls = "") => {
    if (!hint) return;
    hint.textContent = text || "";
    hint.classList.remove("warn", "error");
    if (cls) hint.classList.add(cls);
  };
  if (createUserBtn) {
    createUserBtn.classList.toggle("hidden", currentRole !== "ADMIN");
  }
  if (!canAssignTasks()) {
    assigneesCache = [];
    assigneesLoadError = false;
    if (assigneeSelect) {
      assigneeSelect.innerHTML = `<option value="${escCell(currentUserId || "")}">Yo</option>`;
    }
    if (filterSelect) filterSelect.innerHTML = '<option value="">Todos</option>';
    setHint("");
    return;
  }
  try {
    const response = await authenticatedFetch("/api/users/assignees");
    if (!response?.ok) {
      assigneesCache = [];
      assigneesLoadError = true;
      if (assigneeSelect) assigneeSelect.innerHTML = '<option value="">Sin asignar</option>';
      if (filterSelect) filterSelect.innerHTML = '<option value="">Todos</option>';
      setHint("No se pudieron cargar responsables. Revisa usuarios activos.", "error");
      return;
    }
    const users = await response.json();
    assigneesCache = Array.isArray(users) ? users : [];
    assigneesLoadError = false;
    if (assigneesCache.length === 0) {
      if (assigneeSelect) assigneeSelect.innerHTML = '<option value="">Sin asignar</option>';
      if (filterSelect) filterSelect.innerHTML = '<option value="">Todos</option>';
      setHint("No hay operadores o supervisores activos para asignar.", "warn");
      return;
    }
    const opts = ['<option value="">Sin asignar</option>']
      .concat(
        assigneesCache.map(
          (u) =>
            `<option value="${escCell(u.id)}">${escCell(u.fullName)} (${escCell(u.role)})</option>`
        )
      )
      .join("");
    if (assigneeSelect) assigneeSelect.innerHTML = opts;
    if (filterSelect) {
      filterSelect.innerHTML =
        '<option value="">Todos</option>' +
        assigneesCache
          .map((u) => `<option value="${escCell(u.id)}">${escCell(u.fullName)}</option>`)
          .join("");
    }
    setHint(`${assigneesCache.length} responsable(s) disponibles para asignar.`);
  } catch (_e) {
    assigneesCache = [];
    assigneesLoadError = true;
    if (assigneeSelect) assigneeSelect.innerHTML = '<option value="">Sin asignar</option>';
    setHint("No se pudieron cargar responsables. Revisa usuarios activos.", "error");
  }
}

async function loadTasks() {
  if (!taskList) return;
  if (taskMessage) taskMessage.textContent = "Cargando…";
  try {
    await loadAssigneesForTasks();
    const response = await authenticatedFetch("/api/tasks");
    if (!response) return;
    if (!response.ok) {
      if (taskMessage) taskMessage.textContent = "No se pudieron cargar tareas.";
      taskList.innerHTML = "";
      return;
    }
    const rows = await response.json();
    tasksCache = (Array.isArray(rows) ? rows : []).map(enrichTaskRow);
    applyTaskViewModeUi();
    updateTaskKpis(getTasksPoolForView());
    renderTasksTable();
  } catch (_e) {
    if (taskMessage) taskMessage.textContent = "Error de red.";
  }
}

async function patchTask(taskId, body) {
  const response = await authenticatedFetch(`/api/tasks/${encodeURIComponent(taskId)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  return response;
}

async function setTaskStatus(taskId, status) {
  const response = await authenticatedFetch(`/api/tasks/${encodeURIComponent(taskId)}/status`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status })
  });
  if (!response?.ok) {
    const data = await response?.json().catch(() => ({}));
    window.alert(data.message || "No se pudo actualizar el estatus.");
    return false;
  }
  return true;
}

async function claimTask(taskId) {
  const response = await patchTask(taskId, { assignedToId: currentUserId, status: "ASSIGNED" });
  if (!response?.ok) {
    const data = await response?.json().catch(() => ({}));
    window.alert(data.message || "No se pudo tomar la tarea.");
    return false;
  }
  return true;
}

async function appendTaskFollowUp(task, comment) {
  if (!comment) return true;
  const notes = { ...parseTaskNotes(task.notes) };
  const followUp = Array.isArray(notes.followUp) ? notes.followUp.slice() : [];
  followUp.push({
    at: new Date().toISOString(),
    by: currentUserId,
    text: comment
  });
  notes.followUp = followUp;
  const response = await patchTask(task.id, { notes: JSON.stringify(notes) });
  return Boolean(response?.ok);
}

function openTaskDetail(taskId) {
  const t = tasksCache.find((x) => x.id === taskId);
  if (!t) return;
  const isNotice = isInternalNoticeTask(t) || taskViewMode === "notices";
  const followLines = (t._followUp || [])
    .map((f) => {
      const when = f.at ? formatDateShort(f.at) : "";
      return `${when}: ${f.text || ""}`;
    })
    .filter(Boolean);

  const fields = isNotice
    ? [
        { label: "Asunto", value: t._title },
        { label: "Mensaje", value: t._description || "—" },
        { label: "Responsable", value: t._assignName },
        {
          label: "Estado",
          value:
            t.status === "COMPLETED"
              ? "Atendido"
              : TASK_STATUS_LABELS[t.status] || t.status
        },
        { label: "Prioridad", value: "" },
        {
          label: "Fecha",
          value: t._dueDate ? formatDateShort(t._dueDate) : formatDateShort(t.createdAt)
        },
        { label: "Enviado por", value: t._creatorName },
        {
          label: "Seguimiento",
          value: followLines.length ? followLines.join(" | ") : "Sin comentarios"
        }
      ]
    : [
        { label: "Título", value: t._title },
        { label: "Descripción", value: t._description || "—" },
        { label: "Tipo", value: t._taskLabel },
        { label: "Estatus", value: TASK_STATUS_LABELS[t.status] || t.status },
        { label: "Responsable", value: t._assignName },
        { label: "Fecha objetivo", value: t._dueDate ? formatDateShort(t._dueDate) : "—" },
        { label: "Proyecto", value: t._project || "—" },
        { label: "Lote", value: t._lote || "—" },
        { label: "SKU", value: t._sku || "—" },
        { label: "Ubicación", value: t._location || "—" },
        { label: "Creador", value: t._creatorName },
        { label: "Fecha creación", value: formatDateShort(t.createdAt) },
        {
          label: "Seguimiento",
          value: followLines.length ? followLines.join(" | ") : "Sin comentarios"
        }
      ];

  // Prioridad como texto legible en detalle de aviso
  if (isNotice) {
    const p = Number(t.priority ?? 0);
    const pLabel = p >= 80 ? "Alta" : p >= 50 ? "Media" : "Baja";
    const prioField = fields.find((f) => f.label === "Prioridad");
    if (prioField) prioField.value = `${pLabel} (${p})`;
  }

  const actions = [];
  const terminal = t.status === "COMPLETED" || t.status === "CANCELLED" || t.status === "REJECTED";
  if (!terminal) {
    if (isNotice) {
      if (canActOnTask(t) || t.assignedToId === currentUserId || canManageAllTasks()) {
        actions.push({
          id: "complete",
          label: "Marcar atendido",
          className: "btn-primary btn-compact",
          onClick: async () => {
            if (await setTaskStatus(t.id, "COMPLETED")) {
              closeDetailDrawer();
              await loadTasks();
            }
          }
        });
      }
    } else {
      if (!t.assignedToId && (canAssignTasks() || canActOnTask(t))) {
        actions.push({
          id: "claim",
          label: "Tomar tarea",
          className: "btn-primary btn-compact",
          onClick: async () => {
            if (await claimTask(t.id)) {
              closeDetailDrawer();
              await loadTasks();
            }
          }
        });
      }
      if (canActOnTask(t) && (t.assignedToId === currentUserId || canManageAllTasks())) {
        if (t.status !== "IN_PROGRESS") {
          actions.push({
            id: "start",
            label: "Iniciar",
            className: "btn-secondary btn-compact",
            onClick: async () => {
              if (await setTaskStatus(t.id, "IN_PROGRESS")) {
                closeDetailDrawer();
                await loadTasks();
              }
            }
          });
        }
        actions.push({
          id: "complete",
          label: "Completar",
          className: "btn-primary btn-compact",
          onClick: async () => {
            if (await setTaskStatus(t.id, "COMPLETED")) {
              closeDetailDrawer();
              await loadTasks();
            }
          }
        });
      }
      if (canCancelOrRejectTasks()) {
        actions.push({
          id: "cancel",
          label: "Cancelar",
          className: "btn-secondary btn-compact",
          onClick: async () => {
            if (await setTaskStatus(t.id, "CANCELLED")) {
              closeDetailDrawer();
              await loadTasks();
            }
          }
        });
        actions.push({
          id: "reject",
          label: "Rechazar",
          className: "btn-danger btn-compact",
          onClick: async () => {
            if (await setTaskStatus(t.id, "REJECTED")) {
              closeDetailDrawer();
              await loadTasks();
            }
          }
        });
      }
    }
  }
  if (!isNotice) {
    actions.push({
      id: "follow",
      label: "Añadir seguimiento",
      className: "btn-secondary btn-compact",
      onClick: async () => {
        const text = window.prompt("Comentario de seguimiento:", "");
        if (text === null || !text.trim()) return;
        if (await appendTaskFollowUp(t, text.trim())) {
          await loadTasks();
          openTaskDetail(taskId);
        } else {
          window.alert("No se pudo guardar el seguimiento.");
        }
      }
    });
  }

  openDetailDrawer(isNotice ? t._title || "Detalle del aviso" : t._title || "Detalle de tarea", fields, actions);
}

async function handleTaskAction(taskId, action) {
  if (!taskId || !action) return;
  if (action === "view") {
    openTaskDetail(taskId);
    return;
  }
  if (action === "claim") {
    if (await claimTask(taskId)) await loadTasks();
    return;
  }
  if (action === "start") {
    if (await setTaskStatus(taskId, "IN_PROGRESS")) await loadTasks();
    return;
  }
  if (action === "complete") {
    if (await setTaskStatus(taskId, "COMPLETED")) await loadTasks();
    return;
  }
  if (action === "cancel") {
    if (!canCancelOrRejectTasks()) return;
    if (await setTaskStatus(taskId, "CANCELLED")) await loadTasks();
    return;
  }
  if (action === "reject") {
    if (!canCancelOrRejectTasks()) return;
    if (await setTaskStatus(taskId, "REJECTED")) await loadTasks();
  }
}

function resolveTaskTypeFromUi(uiValue) {
  if (!uiValue) return { type: "ADJUSTMENT", label: "General" };
  const fromOptions = TASK_TYPE_OPTIONS.find((o) => o.id === uiValue);
  if (fromOptions) return { type: fromOptions.value, label: fromOptions.label };
  return TASK_TYPE_UI_MAP[uiValue] || { type: uiValue, label: uiValue };
}

function resolveIncidentTypeFromUi(uiValue) {
  if (!uiValue) return { value: "STOCK_MISMATCH", label: "Otro" };
  const fromOptions = INCIDENT_TYPE_OPTIONS.find((o) => o.id === uiValue);
  if (fromOptions) return { value: fromOptions.value, label: fromOptions.label };
  return { value: uiValue, label: incidentTypeLabel(uiValue) };
}

function incidentTypeLabel(type) {
  if (!type) return "—";
  const match = INCIDENT_TYPE_OPTIONS.find((o) => o.value === type || o.id === type);
  return match?.label || String(type);
}

function incidentTypeBadge(type) {
  return `<span class="badge info">${escCell(incidentTypeLabel(type))}</span>`;
}

function fillSelectOptions(selectEl, options, { valueKey = "id", labelKey = "label", emptyLabel } = {}) {
  if (!selectEl) return;
  const current = selectEl.value;
  selectEl.innerHTML = "";
  if (emptyLabel != null) {
    const empty = document.createElement("option");
    empty.value = "";
    empty.textContent = emptyLabel;
    selectEl.appendChild(empty);
  }
  options.forEach((opt) => {
    const option = document.createElement("option");
    option.value = opt[valueKey];
    option.textContent = opt[labelKey];
    selectEl.appendChild(option);
  });
  if (current && Array.from(selectEl.options).some((o) => o.value === current)) {
    selectEl.value = current;
  }
}

function populateOperationalTypeSelects() {
  fillSelectOptions(document.getElementById("taskType"), TASK_TYPE_OPTIONS);
  fillSelectOptions(document.getElementById("incidentType"), INCIDENT_TYPE_OPTIONS);
}

function setNavSection(sectionId) {
  if (!sectionId) return;
  currentNavSection = sectionId;
  document.querySelectorAll(".nav-section-tab").forEach((tab) => {
    const active = tab.getAttribute("data-nav-section") === sectionId;
    tab.classList.toggle("active", active);
    tab.setAttribute("aria-selected", active ? "true" : "false");
  });
  document.querySelectorAll(".nav-section-panel").forEach((panel) => {
    const match = panel.getAttribute("data-nav-section-panel") === sectionId;
    const roleHidden = panel.dataset.roleHidden === "1";
    const show = match && !roleHidden;
    panel.classList.toggle("active", show);
    panel.style.display = show ? "flex" : "none";
  });
}

function findNavSectionForModule(moduleName) {
  return resolveSectionForModule(moduleName, null);
}

function syncNavSectionForModule(moduleName) {
  const section = findNavSectionForModule(moduleName);
  if (section) setNavSection(section);
}

function wireNavSectionTabs() {
  document.querySelectorAll(".nav-section-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      const section = tab.getAttribute("data-nav-section");
      if (!section) return;
      // Siempre abre el módulo default de la sección y limpia el anterior.
      navigateTo(section, null);
    });
  });
}

async function createTaskClick() {
  if (!taskCreateBtn || !taskCreateError) return;
  taskCreateError.textContent = "";
  taskCreateError.classList.remove("success");
  const reference = document.getElementById("taskRef")?.value?.trim();
  if (!reference) {
    taskCreateError.textContent =
      taskViewMode === "notices" ? "Indica el asunto del aviso." : "Indica un título o folio.";
    return;
  }
  const uiType = document.getElementById("taskType")?.value || "GENERAL";
  const mapped = resolveTaskTypeFromUi(uiType);
  const isNotice =
    taskViewMode === "notices" ||
    uiType === "INTERNAL_NOTICE" ||
    mapped.label === INTERNAL_NOTICE_LABEL;
  const description = document.getElementById("taskDescription")?.value?.trim() || "";
  if (isNotice && !description) {
    taskCreateError.textContent = "Indica el mensaje del aviso.";
    return;
  }
  const priority = Number(document.getElementById("taskPriority")?.value || 50);
  const warehouse = isNotice
    ? ""
    : readSmartFieldValue("taskWarehouse") || document.getElementById("taskWarehouse")?.value?.trim();
  const dueDate = document.getElementById("taskDueDate")?.value || "";
  const project = isNotice
    ? ""
    : readSmartFieldValue("taskProject") || document.getElementById("taskProject")?.value?.trim() || "";
  const lote = isNotice ? "" : document.getElementById("taskLote")?.value?.trim() || "";
  const sku = isNotice ? "" : document.getElementById("taskSku")?.value?.trim() || "";
  const location = isNotice
    ? ""
    : readSmartFieldValue("taskLocation") || document.getElementById("taskLocation")?.value?.trim() || "";
  const follow = isNotice ? "" : document.getElementById("taskFollowUp")?.value?.trim() || "";
  let assignedToId = document.getElementById("taskAssignee")?.value || "";

  if (!canAssignTasks()) {
    assignedToId = currentUserId || "";
  }
  if (isNotice && canAssignTasks() && !assignedToId) {
    taskCreateError.textContent = "Selecciona un destinatario para el aviso.";
    return;
  }

  const notesPayload = {
    title: reference,
    description,
    dueDate: dueDate || null,
    project: project || null,
    lote: lote || null,
    sku: sku || null,
    location: location || null,
    taskLabel: isNotice ? INTERNAL_NOTICE_LABEL : mapped.label,
    isInternalNotice: isNotice,
    followUp: follow
      ? [{ at: new Date().toISOString(), by: currentUserId, text: follow }]
      : []
  };

  taskCreateBtn.disabled = true;
  try {
    const response = await authenticatedFetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: isNotice ? "ADJUSTMENT" : mapped.type,
        warehouse: warehouse || undefined,
        reference,
        priority: Number.isFinite(priority) ? priority : 50,
        assignedToId: assignedToId || undefined,
        notes: JSON.stringify(notesPayload)
      })
    });
    if (!response) return;
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      taskCreateError.textContent = data.message || "No se pudo crear.";
      return;
    }
    const formIds = [
      "taskRef",
      "taskDescription",
      "taskDueDate",
      "taskProject",
      "taskLote",
      "taskSku",
      "taskLocation",
      "taskFollowUp"
    ];
    formIds.forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.value = "";
    });
    const prio = document.getElementById("taskPriority");
    if (prio) prio.value = "50";
    const asn = document.getElementById("taskAssignee");
    if (asn) asn.value = "";
    if (taskViewMode === "notices" || isNotice) {
      const typeSel = document.getElementById("taskType");
      if (typeSel) typeSel.value = "INTERNAL_NOTICE";
      taskCreateError.textContent = "Aviso interno enviado correctamente.";
      taskCreateError.classList.add("success");
    }
    await loadTasks();
  } catch (_e) {
    taskCreateError.textContent = "Error de red.";
  } finally {
    taskCreateBtn.disabled = false;
  }
}

function wireTasksModuleUi() {
  const tabs = document.getElementById("taskTabs");
  if (tabs && tabs.dataset.wired !== "1") {
    tabs.dataset.wired = "1";
    tabs.addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      const tab = target.getAttribute("data-task-tab");
      if (!tab) return;
      if (tab === "all" && !canManageAllTasks()) return;
      taskActiveTab = tab;
      tabs.querySelectorAll(".tasks-tab").forEach((btn) => {
        btn.classList.toggle("active", btn.getAttribute("data-task-tab") === tab);
      });
      renderTasksTable();
    });
  }
  const typeSel = document.getElementById("taskType");
  if (typeSel && typeSel.dataset.noticeHintWired !== "1") {
    typeSel.dataset.noticeHintWired = "1";
    typeSel.addEventListener("change", () => {
      if (taskViewMode === "notices") return;
      const hint = document.getElementById("taskInternalNoticeHint");
      if (hint) hint.classList.toggle("hidden", typeSel.value !== "INTERNAL_NOTICE");
    });
  }
  ["taskFilterType", "taskFilterStatus", "taskFilterAssignee", "taskFilterPriority", "taskFilterDue", "taskFilterText"].forEach(
    (id) => {
      const el = document.getElementById(id);
      if (el && el.dataset.wired !== "1") {
        el.dataset.wired = "1";
        el.addEventListener("input", () => renderTasksTable());
        el.addEventListener("change", () => renderTasksTable());
      }
    }
  );
  const clearBtn = document.getElementById("taskFilterClearBtn");
  if (clearBtn && clearBtn.dataset.wired !== "1") {
    clearBtn.dataset.wired = "1";
    clearBtn.addEventListener("click", () => {
      ["taskFilterType", "taskFilterStatus", "taskFilterAssignee", "taskFilterPriority", "taskFilterDue", "taskFilterText"].forEach(
        (id) => {
          const el = document.getElementById(id);
          if (el) el.value = "";
        }
      );
      renderTasksTable();
    });
  }
}

function resetPickingFlow() {
  if (!pickingFlow) return;
  pickingFlow.querySelectorAll(".picking-step").forEach((step) => {
    step.classList.remove("active", "done");
  });
}

function clearPickCandidates() {
  const box = document.getElementById("pickCandidates");
  if (!box) return;
  box.innerHTML = "";
  box.classList.add("hidden");
}

function populatePickContextSelects() {
  const projectSel = document.getElementById("pickProject");
  const whSel = document.getElementById("pickWarehouse");
  const locSel = document.getElementById("pickLocation");
  if (projectSel) {
    const prev = projectSel.value;
    const projects = new Map();
    (Array.isArray(productsCache) ? productsCache : []).forEach((p) => {
      const code = p?.customer?.code || "";
      const name = p?.customer?.name || code;
      if (code) projects.set(String(code).toUpperCase(), name || code);
    });
    (Array.isArray(stockRowsCache) ? stockRowsCache : []).forEach((row) => {
      const pr = getAviatProjectFromRow(row);
      if (pr.code) projects.set(String(pr.code).toUpperCase(), pr.name || pr.code);
    });
    projectSel.innerHTML =
      '<option value="">— Si hay varias líneas, elige proyecto —</option>' +
      [...projects.entries()]
        .sort((a, b) => String(a[1]).localeCompare(String(b[1]), "es"))
        .map(([code, name]) => `<option value="${escCell(code)}">${escCell(name)} (${escCell(code)})</option>`)
        .join("");
    if (prev && [...projectSel.options].some((o) => o.value === prev)) projectSel.value = prev;
  }
  if (whSel) {
    const prev = whSel.value;
    const whs = new Set(["TULTITLAN24"]);
    (Array.isArray(stockRowsCache) ? stockRowsCache : []).forEach((row) => {
      const w = row?.location?.warehouse;
      if (w) whs.add(String(w).toUpperCase());
    });
    whSel.innerHTML =
      '<option value="">— Opcional —</option>' +
      [...whs].sort().map((w) => `<option value="${escCell(w)}">${escCell(w)}</option>`).join("");
    if (prev && [...whSel.options].some((o) => o.value === prev)) whSel.value = prev;
  }
  if (locSel) {
    const prev = locSel.value;
    const locs = new Set();
    (Array.isArray(stockRowsCache) ? stockRowsCache : []).forEach((row) => {
      const c = row?.location?.code;
      if (c) locs.add(String(c).toUpperCase());
    });
    locSel.innerHTML =
      '<option value="">— Si hay varias líneas, elige ubicación —</option>' +
      [...locs]
        .sort()
        .map((c) => `<option value="${escCell(c)}">${escCell(c)}</option>`)
        .join("");
    if (prev && [...locSel.options].some((o) => o.value === prev)) locSel.value = prev;
  }
}

function renderPickCandidates(candidates) {
  const box = document.getElementById("pickCandidates");
  if (!box) return;
  if (!Array.isArray(candidates) || !candidates.length) {
    clearPickCandidates();
    return;
  }
  box.classList.remove("hidden");
  box.innerHTML = `
    <p class="module-hint" style="margin:0 0 8px">Líneas con stock. Elige una para descontar exactamente esa ubicación/estatus:</p>
    <div style="display:flex;flex-direction:column;gap:6px;max-height:220px;overflow:auto">
      ${candidates
        .map((c, idx) => {
          const label = `${c.projectCode || "—"} · ${c.location || "—"} · ${formatInventoryStatus(c.status)} · qty ${c.qty ?? "—"}`;
          return `<button type="button" class="btn-secondary btn-compact" data-pick-candidate="${idx}" style="text-align:left;justify-content:flex-start">${escCell(label)}</button>`;
        })
        .join("")}
    </div>`;
  box.querySelectorAll("[data-pick-candidate]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const i = Number(btn.getAttribute("data-pick-candidate"));
      const c = candidates[i];
      if (!c) return;
      const projectSel = document.getElementById("pickProject");
      const statusSel = document.getElementById("pickStatus");
      const whSel = document.getElementById("pickWarehouse");
      const locSel = document.getElementById("pickLocation");
      if (projectSel && c.projectCode) {
        if (![...projectSel.options].some((o) => o.value === c.projectCode)) {
          const opt = document.createElement("option");
          opt.value = c.projectCode;
          opt.textContent = c.projectName || c.projectCode;
          projectSel.appendChild(opt);
        }
        projectSel.value = c.projectCode;
      }
      if (statusSel && c.status) statusSel.value = c.status;
      if (whSel && c.warehouse) {
        if (![...whSel.options].some((o) => o.value === c.warehouse)) {
          const opt = document.createElement("option");
          opt.value = c.warehouse;
          opt.textContent = c.warehouse;
          whSel.appendChild(opt);
        }
        whSel.value = c.warehouse;
      }
      if (locSel && c.location) {
        if (![...locSel.options].some((o) => o.value === c.location)) {
          const opt = document.createElement("option");
          opt.value = c.location;
          opt.textContent = c.location;
          locSel.appendChild(opt);
        }
        locSel.value = c.location;
      }
      box.dataset.inventoryId = c.inventoryId || "";
      setScanResult(
        `Línea seleccionada: ${c.location} / ${formatInventoryStatus(c.status)} (qty ${c.qty}). Confirma de nuevo el surtido.`,
        "ok"
      );
    });
  });
}

function buildPickScanPayload(code) {
  const project = document.getElementById("pickProject")?.value?.trim() || "";
  const status = document.getElementById("pickStatus")?.value?.trim() || "";
  const warehouse = document.getElementById("pickWarehouse")?.value?.trim() || "";
  const location = document.getElementById("pickLocation")?.value?.trim() || "";
  const qtyRaw = document.getElementById("pickQty")?.value;
  const qty = qtyRaw === "" || qtyRaw == null ? 1 : Number(qtyRaw);
  const invBox = document.getElementById("pickCandidates");
  const inventoryId = invBox?.dataset?.inventoryId || "";
  /** @type {Record<string, unknown>} */
  const body = { code };
  if (project) body.project = project;
  if (status) body.status = status;
  if (warehouse) body.warehouse = warehouse;
  if (location) body.location = location;
  if (Number.isFinite(qty) && qty > 0) body.quantity = qty;
  if (inventoryId) body.inventoryId = inventoryId;
  return body;
}

function setPickingFlowState(state) {
  if (!pickingFlow) return;
  const order = ["read", "validate", "stock", "trace"];
  const idx = order.indexOf(state);
  pickingFlow.querySelectorAll(".picking-step").forEach((step) => {
    const key = step.getAttribute("data-step");
    const stepIdx = order.indexOf(key || "");
    step.classList.remove("active", "done");
    if (state === "success") {
      step.classList.add("done");
      return;
    }
    if (stepIdx >= 0 && stepIdx < idx) step.classList.add("done");
    if (stepIdx === idx) step.classList.add("active");
  });
}

function renderScanOperator(scan) {
  if (!scan.user) return "—";
  if (currentUserId && scan.user.id === currentUserId) return "Tú";
  return scan.user.fullName || scan.user.email || "—";
}

function setScanResult(message, tone = "") {
  if (!scanResult) return;
  scanResult.textContent = message;
  scanResult.className = "scan-result-box";
  if (tone) scanResult.classList.add(tone);
}

function csvEscapeCell(value) {
  if (value == null) return "";
  const s = String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function getImportFileExtension(filename) {
  if (!filename || typeof filename !== "string") return "";
  const idx = filename.lastIndexOf(".");
  return idx >= 0 ? filename.slice(idx).toLowerCase() : "";
}

function setFileStatus(el, message, isError = false) {
  if (!el) return;
  el.classList.toggle("error", isError);
  const text = message == null ? "" : String(message);
  if (!text) {
    el.textContent = "";
    return;
  }
  if (text.length > 140 || text.includes("Conflictos") || text.includes("Filas leídas")) {
    const short = text.length > 120 ? `${text.slice(0, 110).trim()}…` : text.split(".")[0] + ".";
    renderOperationalMessage(el, {
      short: isError ? text.split(".")[0] + "." : short,
      details: text,
      isError
    });
    return;
  }
  el.textContent = text;
}

function setButtonLoading(button, isLoading, loadingLabel, idleLabel) {
  if (!button) return;
  if (!button.dataset.idleLabel) button.dataset.idleLabel = idleLabel || button.textContent || "";
  if (isLoading) {
    button.disabled = true;
    button.textContent = loadingLabel;
  } else {
    button.disabled = false;
    button.textContent = button.dataset.idleLabel;
  }
}

function setImportProcessingMessage(element, message, active) {
  if (!element) return;
  element.classList.toggle("import-processing", active);
  if (active) {
    element.textContent = message;
    return;
  }
  element.textContent = message || "";
}

function renderOperationalMessage(container, { short, details, isError = false, downloadRows = null, downloadName = "logitec_reporte" }) {
  if (!container) return;
  const detailId = `op-detail-${Math.random().toString(36).slice(2, 9)}`;
  const hasDetails = details && String(details).trim() && String(details).trim() !== String(short).trim();
  const downloadBtn =
    Array.isArray(downloadRows) && downloadRows.length
      ? `<button type="button" data-op-download="${escCell(downloadName)}">Descargar reporte</button>`
      : "";
  container.classList.toggle("error", isError);
  container.innerHTML = `
    <div class="op-message${isError ? " error" : ""}">
      <p class="op-message-short">${escCell(short)}</p>
      <div class="op-message-actions">
        ${hasDetails ? `<button type="button" data-op-toggle="${detailId}">Ver detalles técnicos</button>` : ""}
        ${downloadBtn}
      </div>
      ${hasDetails ? `<pre class="op-message-details" id="${detailId}">${escCell(details)}</pre>` : ""}
    </div>`;
  if (Array.isArray(downloadRows) && downloadRows.length) {
    container._opDownloadRows = downloadRows;
  }
  wireOperationalMessageClicks(container);
}

function wireOperationalMessageClicks(root) {
  if (!root || root.dataset.opWired === "1") return;
  root.dataset.opWired = "1";
  root.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const toggleId = target.getAttribute("data-op-toggle");
    if (toggleId) {
      const pre = document.getElementById(toggleId);
      if (pre) {
        const open = pre.classList.toggle("open");
        target.textContent = open ? "Ocultar detalles técnicos" : "Ver detalles técnicos";
      }
      return;
    }
    const downloadName = target.getAttribute("data-op-download");
    if (downloadName && Array.isArray(root._opDownloadRows)) {
      exportToCsv(downloadName, root._opDownloadRows, [
        { label: "detalle", value: (r) => (typeof r === "string" ? r : r.detail || JSON.stringify(r)) }
      ]);
    }
  });
}

function matchesFilter(value, query) {
  if (!query) return true;
  return String(value ?? "")
    .toLowerCase()
    .includes(String(query).toLowerCase());
}

function getInventoryFilterValues() {
  return {
    cliente: document.getElementById("invFilterCliente")?.value?.trim() || "",
    customer: document.getElementById("invFilterCustomer")?.value?.trim() || "",
    lote: document.getElementById("invFilterLote")?.value?.trim() || "",
    sku: document.getElementById("invFilterSku")?.value?.trim() || "",
    producto: document.getElementById("invFilterProducto")?.value?.trim() || "",
    ubicacion: document.getElementById("invFilterUbicacion")?.value?.trim() || "",
    status: document.getElementById("invFilterStatus")?.value?.trim() || ""
  };
}

function getCatalogFilterValues() {
  return {
    cliente: document.getElementById("catFilterCliente")?.value?.trim() || "",
    customer: document.getElementById("catFilterCustomer")?.value?.trim() || "",
    lote: document.getElementById("catFilterLote")?.value?.trim() || "",
    sku: document.getElementById("catFilterSku")?.value?.trim() || "",
    producto: document.getElementById("catFilterProducto")?.value?.trim() || ""
  };
}

function countStockConflicts(rows) {
  if (!Array.isArray(rows)) return 0;
  return rows.filter((row) => {
    const status = String(row.status || "").toUpperCase();
    const ref = String(row.reference || row.notes || "");
    return status.includes("HOLD") || status.includes("CONFLICT") || /conflicto|conflict/i.test(ref);
  }).length;
}

function updateInventorySummary(rows) {
  const list = Array.isArray(rows) ? rows : [];
  const products = new Set(list.map((r) => r.product?.sku).filter(Boolean));
  const customers = new Set(
    list.map((r) => r.product?.customer?.code || r.product?.customer?.name).filter(Boolean)
  );
  const locations = new Set(list.map((r) => r.location?.code).filter(Boolean));
  pendingConflictsCache = countStockConflicts(list);
  const elProducts = document.getElementById("sumProducts");
  const elCustomers = document.getElementById("sumCustomers");
  const elLocations = document.getElementById("sumLocations");
  const elMovements = document.getElementById("sumMovements");
  const elConflicts = document.getElementById("sumConflicts");
  if (elProducts) elProducts.textContent = String(products.size);
  if (elCustomers) elCustomers.textContent = String(customers.size);
  if (elLocations) elLocations.textContent = String(locations.size);
  if (elMovements) elMovements.textContent = String(movementsCountCache);
  if (elConflicts) elConflicts.textContent = String(pendingConflictsCache);
  const elStockTotal = document.getElementById("sumStockTotal");
  if (elStockTotal) elStockTotal.textContent = list.length ? formatQty(sumStockQty(list)) : "0";
  updateControlCenterKpis();
}

function getControlCenterFilterValues() {
  return {
    cliente: document.getElementById("ccFilterCliente")?.value?.trim() || "",
    customer: document.getElementById("ccFilterCustomer")?.value?.trim() || "",
    sku: document.getElementById("ccFilterSku")?.value?.trim() || "",
    producto: document.getElementById("ccFilterProducto")?.value?.trim() || "",
    ubicacion: document.getElementById("ccFilterUbicacion")?.value?.trim() || "",
    status: document.getElementById("ccFilterStatus")?.value?.trim() || ""
  };
}

function filterStockRowsWithFilters(rows, filters) {
  return (Array.isArray(rows) ? rows : []).filter((row) => {
    const p = row.product || {};
    const project = getAviatProjectFromRow(row);
    const lote = extractLoteFromRow(row);
    const skuOk =
      !filters.sku ||
      matchesFilter(p.sku, filters.sku) ||
      matchesSkuFlexible(p.sku, filters.sku) ||
      matchesFilter(p.barcode, filters.sku) ||
      matchesSkuFlexible(p.barcode, filters.sku);
    return (
      matchesFilter(project.name, filters.cliente) &&
      matchesFilter(project.code, filters.customer) &&
      matchesFilter(lote, filters.lote) &&
      skuOk &&
      matchesFilter(p.name, filters.producto) &&
      matchesFilter(row.location?.code, filters.ubicacion) &&
      matchesFilter(inventoryStatusSearchBlob(row.status), filters.status)
    );
  });
}

function sumStockQty(rows) {
  return (Array.isArray(rows) ? rows : []).reduce((acc, row) => {
    const n = typeof row.qty === "string" ? Number(row.qty.replace(",", ".")) : Number(row.qty);
    return acc + (Number.isNaN(n) ? 0 : n);
  }, 0);
}

function updateControlCenterKpis() {
  const list = filterRowsByAviatProject(Array.isArray(stockRowsCache) ? stockRowsCache : []);
  const scopedProducts = filterRowsByAviatProject(productsCache);
  const productCount =
    scopedProducts.length > 0
      ? scopedProducts.length
      : new Set(list.map((r) => r.product?.sku).filter(Boolean)).size;
  const projects = new Set();
  list.forEach((r) => {
    const code = getAviatProjectFromRow(r).code;
    if (code) projects.add(code);
  });
  collectAviatProjectsFromData().forEach((p) => {
    if (p.code) projects.add(p.code);
  });
  const locations = new Set(list.map((r) => r.location?.code).filter(Boolean));
  const stockTotal = sumStockQty(list);
  const setKpi = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  };
  setKpi("ccKpiProducts", productCount > 0 ? String(productCount) : list.length ? String(new Set(list.map((r) => r.product?.sku).filter(Boolean)).size) : "0");
  setKpi("ccKpiCustomers", projects.size ? String(projects.size) : "0");
  setKpi("ccKpiLocations", locations.size ? String(locations.size) : "0");
  setKpi("ccKpiStock", list.length ? formatQty(stockTotal) : "0");
  setKpi("ccKpiMovements", String(filterRowsByAviatProject(movementsRowsCache).length || movementsCountCache));
  setKpi("ccKpiConflicts", String(countStockConflicts(list)));
}

function stockRowCells(row, { includeWarehouse = true } = {}) {
  const p = row.product || {};
  const cells = [
    renderCellEllipsis(getAviatProjectDisplayFromRow(row)),
    renderCellEllipsis(extractLoteFromRow(row)),
    `<strong class="cell-nowrap">${escCell(formatSkuBarcode(p))}</strong>`,
    renderCellEllipsis(p.name || "—")
  ];
  if (includeWarehouse) cells.push(renderCellEllipsis(row.location?.warehouse || "—"));
  cells.push(
    renderCellEllipsis(row.location?.code || "—"),
    inventoryStatusBadge(row.status || "—"),
    formatQty(row.qty)
  );
  return cells;
}

function catalogRowCells(product) {
  return [
    renderCellEllipsis(getAviatProjectDisplayFromRow(product)),
    renderCellEllipsis("N/D"),
    `<strong class="cell-nowrap">${escCell(formatSkuBarcode(product))}</strong>`,
    renderCellEllipsis(product.name || "—"),
    `<span class="cell-nowrap">${renderCellEllipsis(product.warehouse || "—")}</span>`,
    `<span class="cell-nowrap">${escCell(product.barcode || "—")}</span>`
  ];
}

const STOCK_COLUMNS_FULL = [
  { label: "Proyecto", sortKey: (r) => getAviatProjectDisplayFromRow(r), sortType: "text" },
  { label: "Lote", sortKey: (r) => extractLoteFromRow(r), sortType: "text" },
  { label: "SKU / Código de barras", sortKey: (r) => r.product?.sku || "", sortType: "text" },
  { label: "Producto", sortKey: (r) => r.product?.name || "", sortType: "text" },
  { label: "Almacén", sortKey: (r) => r.location?.warehouse || "", sortType: "text" },
  { label: "Ubicación", sortKey: (r) => r.location?.code || "", sortType: "text" },
  { label: "Estatus", sortKey: (r) => r.status || "", sortType: "text" },
  { label: "Cantidad", align: "right", sortKey: (r) => Number(r.qty) || 0, sortType: "number" }
];

const STOCK_COLUMNS_CC = [
  { label: "Proyecto", sortKey: (r) => getAviatProjectDisplayFromRow(r) },
  { label: "Lote", sortKey: (r) => extractLoteFromRow(r) },
  { label: "SKU / Código de barras", sortKey: (r) => r.product?.sku || "" },
  { label: "Producto", sortKey: (r) => r.product?.name || "" },
  { label: "Ubicación", sortKey: (r) => r.location?.code || "" },
  { label: "Estatus", sortKey: (r) => r.status || "" },
  { label: "Cantidad", align: "right", sortKey: (r) => Number(r.qty) || 0, sortType: "number" }
];

const CATALOG_COLUMNS = [
  { label: "Proyecto", sortKey: (p) => getAviatProjectDisplayFromRow(p) },
  { label: "Lote", sortKey: () => "N/D" },
  { label: "SKU / Código de barras", sortKey: (p) => p.sku || "" },
  { label: "Producto", sortKey: (p) => p.name || "" },
  { label: "Almacén", sortKey: (p) => p.warehouse || "" },
  { label: "Código de barras", sortKey: (p) => p.barcode || "" }
];

const CLIENTS_COLUMNS = [
  { label: "Proyecto", sortKey: (r) => r.name || "" },
  { label: "Código", sortKey: (r) => r.code || "" },
  { label: "Productos", align: "right", sortKey: (r) => r.products || 0, sortType: "number" },
  { label: "Saldos asociados", align: "right", sortKey: (r) => r.stock || 0, sortType: "number" },
  { label: "Estado", sortKey: (r) => (r.products > 0 ? "Activo" : "Sin catálogo") }
];

const TRACE_COLUMNS = [
  { label: "Fecha", sortKey: (r) => r.createdAt, sortType: "date", render: (r) => formatDateShort(r.createdAt), title: (r) => formatDateShort(r.createdAt) },
  { label: "Proyecto", sortKey: (r) => getAviatProjectDisplayFromRow(r), render: (r) => renderCellWithClamp(getAviatProjectDisplayFromRow(r), "cell-truncate", 22), title: (r) => getAviatProjectDisplayFromRow(r) },
  { label: "Lote", sortKey: (r) => extractLoteFromRow(r), render: (r) => renderCellEllipsis(extractLoteFromRow(r)), title: (r) => extractLoteFromRow(r) },
  { label: "Tipo", sortKey: (r) => r.type || r.subtype || "", render: (r) => statusBadge(r.subtype || r.type) },
  { label: "SKU / Código", sortKey: (r) => r.product?.sku || "", render: (r) => escCell(formatSkuBarcode(r.product)), title: (r) => r.product?.sku || "" },
  { label: "Producto", sortKey: (r) => r.product?.name || "", render: (r) => renderCellWithClamp(r.product?.name || "—", "cell-truncate", 28), title: (r) => r.product?.name || "" },
  {
    label: "Antes",
    align: "right",
    sortKey: (r) => Number(activityMetaQty(r, "before")) || 0,
    sortType: "number",
    render: (r) => formatQty(activityMetaQty(r, "before")),
    title: (r) => `Saldo anterior: ${formatQty(activityMetaQty(r, "before"))}`
  },
  {
    label: "Movimiento",
    align: "right",
    sortKey: (r) => Number(activityMovedQty(r)) || 0,
    sortType: "number",
    render: (r) => formatQty(activityMovedQty(r)),
    title: (r) => `Cantidad del movimiento: ${formatQty(activityMovedQty(r))}`
  },
  {
    label: "Después",
    align: "right",
    sortKey: (r) => Number(activityMetaQty(r, "after")) || 0,
    sortType: "number",
    render: (r) => formatQty(activityMetaQty(r, "after")),
    title: (r) => `Saldo posterior: ${formatQty(activityMetaQty(r, "after"))}`
  },
  { label: "Ubicación", sortKey: (r) => r.location || r.warehouse || "", render: (r) => renderCellWithClamp(r.location || r.warehouse, "cell-truncate", 22), title: (r) => r.location || r.warehouse || "" },
  { label: "Usuario", sortKey: (r) => r.user?.fullName || "", render: (r) => renderCellWithClamp(r.user?.fullName || "—", "cell-truncate", 20), title: (r) => r.user?.fullName || "" },
  { label: "Referencia", sortKey: (r) => r.reference || "", render: (r) => renderCellWithClamp(r.reference, "cell-truncate", 24), title: (r) => r.reference || "" }
];

/** Cantidad de saldo en metadata de actividad (antes/después del movimiento). */
function activityMetaQty(row, which) {
  const meta = row?.metadata && typeof row.metadata === "object" ? row.metadata : {};
  if (which === "before") {
    return meta.quantityBefore ?? meta.qtyBefore ?? meta.before ?? null;
  }
  return meta.quantityAfter ?? meta.qtyAfter ?? meta.after ?? null;
}

/** Cantidad movida/pickeada en el evento. */
function activityMovedQty(row) {
  const meta = row?.metadata && typeof row.metadata === "object" ? row.metadata : {};
  if (meta.pickedQty != null) return meta.pickedQty;
  if (meta.quantityMoved != null) return meta.quantityMoved;
  return row?.qty ?? null;
}

const TASK_COLUMNS = [
  {
    label: "Prioridad",
    sortKey: (t) => t.priority ?? 0,
    sortType: "number",
    render: (t) => priorityBadge(t.priority)
  },
  {
    label: "Estatus",
    sortKey: (t) => t.status || "",
    render: (t) => taskStatusBadge(t.status)
  },
  {
    label: "Tipo",
    sortKey: (t) => t._taskLabel || t.type || "",
    render: (t) => statusBadge(t._taskLabel || t.type)
  },
  {
    label: "Título",
    sortKey: (t) => t._title || t.reference || "",
    render: (t) => renderCellWithClamp(t._title || t.reference, "cell-truncate", 28),
    title: (t) => t._title || t.reference || ""
  },
  {
    label: "Responsable",
    sortKey: (t) => t._assignName || "",
    render: (t) => renderCellWithClamp(t._assignName || "—", "cell-truncate", 18),
    title: (t) => t._assignName || ""
  },
  {
    label: "Fecha objetivo",
    sortKey: (t) => t._dueDate || "",
    sortType: "date",
    render: (t) => (t._dueDate ? formatDateShort(t._dueDate) : "—")
  },
  {
    label: "Creada",
    sortKey: (t) => t.createdAt,
    sortType: "date",
    render: (t) => formatDateShort(t.createdAt)
  },
  {
    label: "Proyecto",
    sortKey: (t) => t._project || "",
    render: (t) => renderCellWithClamp(t._project || "—", "cell-truncate", 18),
    title: (t) => t._project || ""
  },
  {
    label: "Lote",
    sortKey: (t) => t._lote || "",
    render: (t) => renderCellEllipsis(t._lote || "—"),
    title: (t) => t._lote || ""
  },
  {
    label: "SKU",
    sortKey: (t) => t._sku || "",
    render: (t) => escCell(t._sku || "—"),
    title: (t) => t._sku || ""
  }
];

const NOTICE_COLUMNS = [
  {
    label: "Prioridad",
    sortKey: (t) => t.priority ?? 0,
    sortType: "number",
    render: (t) => priorityBadge(t.priority)
  },
  {
    label: "Estado",
    sortKey: (t) => t.status || "",
    render: (t) =>
      t.status === "COMPLETED"
        ? `<span class="badge status-done">Atendido</span>`
        : taskStatusBadge(t.status)
  },
  {
    label: "Asunto",
    sortKey: (t) => t._title || t.reference || "",
    render: (t) => renderCellWithClamp(t._title || t.reference, "cell-truncate", 36),
    title: (t) => [t._title, t._description].filter(Boolean).join(" — ")
  },
  {
    label: "Responsable",
    sortKey: (t) => t._assignName || "",
    render: (t) => renderCellWithClamp(t._assignName || "—", "cell-truncate", 18),
    title: (t) => t._assignName || ""
  },
  {
    label: "Fecha",
    sortKey: (t) => t._dueDate || t.createdAt,
    sortType: "date",
    render: (t) => formatDateShort(t._dueDate || t.createdAt)
  }
];

const TASK_STATUS_LABELS = {
  PENDING: "Pendiente",
  ASSIGNED: "Asignada",
  IN_PROGRESS: "En proceso",
  COMPLETED: "Completada",
  REJECTED: "Rechazada",
  CANCELLED: "Cancelada"
};

/** Etiquetas de avance de surtido (columna en órdenes / requisiciones). */
const REQ_PICKING_STATUS_LABELS = {
  PENDING: "Pendiente de surtido",
  ASSIGNED: "Pendiente de surtido",
  IN_PROGRESS: "En surtido",
  COMPLETED: "Surtido completado",
  REJECTED: "Surtido rechazado",
  CANCELLED: "Surtido cancelado"
};

function formatReqPriorityLabel(priority) {
  const n = Number(priority);
  if (!Number.isFinite(n)) return "—";
  if (n >= 70) return "Alta";
  if (n >= 40) return "Normal";
  return "Baja";
}

function reqPickingStatusBadge(status) {
  const key = String(status || "").toUpperCase();
  const label = REQ_PICKING_STATUS_LABELS[key] || TASK_STATUS_LABELS[key] || status || "—";
  const toneMap = {
    PENDING: "status-pending",
    ASSIGNED: "status-assigned",
    IN_PROGRESS: "status-progress",
    COMPLETED: "status-done",
    REJECTED: "status-rejected",
    CANCELLED: "status-cancelled"
  };
  return `<span class="badge ${toneMap[key] || "info"}" title="${escCell(key || "—")}">${escCell(label)}</span>`;
}

const MOVEMENT_COLUMNS = [
  { label: "Fecha", sortKey: (m) => m.createdAt, sortType: "date", render: (m) => formatDateShort(m.createdAt) },
  { label: "Proyecto", sortKey: (m) => getAviatProjectDisplayFromRow(m), render: (m) => renderCellWithClamp(getAviatProjectDisplayFromRow(m), "cell-truncate", 22), title: (m) => getAviatProjectDisplayFromRow(m) },
  { label: "Lote", sortKey: (m) => extractLoteFromRow(m), render: (m) => renderCellEllipsis(extractLoteFromRow(m)), title: (m) => extractLoteFromRow(m) },
  { label: "Tipo", sortKey: (m) => m.movementType || "", render: (m) => statusBadge(m.movementType) },
  { label: "SKU / Código", sortKey: (m) => m.product?.sku || "", render: (m) => escCell(formatSkuBarcode(m.product)), title: (m) => m.product?.sku || "" },
  { label: "Producto", sortKey: (m) => m.product?.name || "", render: (m) => renderCellWithClamp(m.product?.name, "cell-truncate", 28), title: (m) => m.product?.name || "" },
  { label: "Antes", align: "right", sortKey: (m) => Number(m.quantityBefore) || 0, sortType: "number", render: (m) => formatQty(m.quantityBefore) },
  { label: "Después", align: "right", sortKey: (m) => Number(m.quantityAfter) || 0, sortType: "number", render: (m) => formatQty(m.quantityAfter) },
  { label: "Ubicación", sortKey: (m) => m.toLocation?.code || m.fromLocation?.code || "", render: (m) => renderCellWithClamp(m.toLocation?.code || m.fromLocation?.code || m.warehouse, "cell-truncate", 20), title: (m) => m.toLocation?.code || m.fromLocation?.code || "" },
  { label: "Usuario", sortKey: (m) => m.user?.fullName || "", render: (m) => renderCellWithClamp(m.user?.fullName, "cell-truncate", 20), title: (m) => m.user?.fullName || "" },
  { label: "Referencia", sortKey: (m) => m.reference || "", render: (m) => renderCellWithClamp(m.reference, "cell-truncate", 20), title: (m) => m.reference || "" }
];

const OPS_MOVEMENT_COLUMNS = [
  { label: "Fecha", sortKey: (m) => m.createdAt, sortType: "date", render: (m) => formatDateShort(m.createdAt) },
  { label: "Proyecto", sortKey: (m) => getAviatProjectDisplayFromRow(m), render: (m) => renderCellWithClamp(getAviatProjectDisplayFromRow(m), "cell-truncate", 22), title: (m) => getAviatProjectDisplayFromRow(m) },
  { label: "Lote", sortKey: (m) => extractLoteFromRow(m), render: (m) => renderCellEllipsis(extractLoteFromRow(m)), title: (m) => extractLoteFromRow(m) },
  { label: "Referencia", sortKey: (m) => m.reference || "", render: (m) => renderCellWithClamp(m.reference, "cell-truncate", 18), title: (m) => m.reference || "" },
  { label: "SKU / Código", sortKey: (m) => m.product?.sku || "", render: (m) => escCell(formatSkuBarcode(m.product)), title: (m) => m.product?.sku || "" },
  { label: "Producto", sortKey: (m) => m.product?.name || "", render: (m) => renderCellWithClamp(m.product?.name, "cell-truncate", 24), title: (m) => m.product?.name || "" },
  { label: "Cantidad", align: "right", sortKey: (m) => Number(m.qty) || 0, sortType: "number", render: (m) => formatQty(m.qty) }
];

const REQ_COLUMNS = [
  { label: "Folio", sortKey: (t) => t.reference || "", render: (t) => renderCellWithClamp(t.reference, "cell-truncate", 18), title: (t) => t.reference || "" },
  { label: "Proyecto", sortKey: (t) => formatReqProyecto(t), render: (t) => renderCellWithClamp(formatReqProyecto(t), "cell-truncate", 22), title: (t) => formatReqProyecto(t) },
  {
    label: "Prioridad",
    sortKey: (t) => t.priority ?? 0,
    sortType: "number",
    render: (t) => {
      const label = formatReqPriorityLabel(t.priority);
      const raw = t.priority == null ? "—" : String(t.priority);
      return `<span title="Valor interno: ${escCell(raw)}">${escCell(label)}</span>`;
    },
    title: (t) => `Prioridad ${formatReqPriorityLabel(t.priority)} (${t.priority ?? "—"})`
  },
  { label: "Productos", sortKey: (t) => formatReqProducts(t), render: (t) => renderCellWithClamp(formatReqProducts(t), "cell-truncate", 28), title: (t) => formatReqProducts(t) },
  {
    label: "Estado",
    sortKey: (t) => t.status || "",
    render: (t) => taskStatusBadge(t.status),
    title: (t) => TASK_STATUS_LABELS[String(t.status || "").toUpperCase()] || t.status || ""
  },
  {
    label: "Estado de surtido",
    sortKey: (t) => t.status || "",
    render: (t) => reqPickingStatusBadge(t.status),
    title: (t) => REQ_PICKING_STATUS_LABELS[String(t.status || "").toUpperCase()] || t.status || ""
  }
];

const INCIDENT_COLUMNS = [
  { label: "Fecha", sortKey: (r) => r.createdAt, sortType: "date", render: (r) => formatDateShort(r.createdAt) },
  { label: "Tipo", sortKey: (r) => incidentTypeLabel(r.type), render: (r) => incidentTypeBadge(r.type) },
  { label: "Estado", sortKey: (r) => r.status || "", render: (r) => statusBadge(r.status) },
  { label: "Reportó", sortKey: (r) => r.reportedBy?.fullName || "", render: (r) => renderCellWithClamp(r.reportedBy?.fullName, "cell-truncate", 20), title: (r) => r.reportedBy?.fullName || "" },
  { label: "Producto", sortKey: (r) => r.product?.sku || "", render: (r) => escCell(r.product?.sku || "—"), title: (r) => r.product?.sku || "" },
  { label: "Notas", sortKey: (r) => r.notes || "", render: (r) => renderCellWithClamp(r.notes, "cell-notes", 120), title: (r) => r.notes || "" }
];

function getPickingColumns(showOperator) {
  const cols = [
    { label: "Fecha / hora", sortKey: (s) => s.createdAt, sortType: "date", render: (s) => formatDateShort(s.createdAt) }
  ];
  if (showOperator) {
    cols.push({
      label: "Operador",
      sortKey: (s) => renderScanOperator(s),
      render: (s) => renderCellWithClamp(renderScanOperator(s), "cell-truncate", 22),
      title: (s) => renderScanOperator(s)
    });
  }
  cols.push(
    {
      label: "Código",
      sortKey: (s) => s.scannedCode || "",
      render: (s) => `<strong>${escCell(s.scannedCode)}</strong>`,
      title: (s) => s.scannedCode || ""
    },
    { label: "Resultado", sortKey: (s) => s.result || "", render: (s) => statusBadge(s.result) },
    {
      label: "Detalle",
      sortKey: (s) => {
        const name = s.product?.name || "";
        const skuPart = s.product?.sku ? ` · SKU ${s.product.sku}` : "";
        return `${name}${skuPart}`;
      },
      render: (s) => {
        const name = s.product?.name || "—";
        const skuPart = s.product?.sku ? ` · SKU ${s.product.sku}` : "";
        return renderCellWithClamp(`${name}${skuPart}`, "cell-truncate", 48);
      },
      title: (s) => {
        const name = s.product?.name || "";
        const skuPart = s.product?.sku ? ` · SKU ${s.product.sku}` : "";
        return `${name}${skuPart}`;
      }
    }
  );
  return cols;
}

function openModal(id) {
  const el = document.getElementById(id);
  if (el) {
    el.classList.add("open");
    el.setAttribute("aria-hidden", "false");
  }
}

function closeModal(id) {
  const el = document.getElementById(id);
  if (el) {
    el.classList.remove("open");
    el.setAttribute("aria-hidden", "true");
  }
}

function wireModals() {
  document.querySelectorAll("[data-close-modal]").forEach((btn) => {
    btn.addEventListener("click", () => closeModal(btn.getAttribute("data-close-modal")));
  });
  ["catalogImportModal", "inventoryImportModal"].forEach((id) => {
    const overlay = document.getElementById(id);
    if (!overlay || overlay.dataset.modalWired === "1") return;
    overlay.dataset.modalWired = "1";
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) closeModal(id);
    });
  });
  const openCat = document.getElementById("openCatalogImportBtn");
  if (openCat) openCat.addEventListener("click", () => openModal("catalogImportModal"));
  const openInv = document.getElementById("openInventoryImportBtn");
  if (openInv) openInv.addEventListener("click", () => openModal("inventoryImportModal"));
  const toggleMov = document.getElementById("toggleMovementsBtn");
  if (toggleMov) {
    toggleMov.addEventListener("click", () => {
      const panel = document.getElementById("movementsPanel");
      if (!panel) return;
      const open = panel.classList.toggle("open");
      toggleMov.textContent = open ? "Ocultar movimientos" : "Ver movimientos";
      if (open) void loadInventoryMovements();
    });
  }
  const rStock = document.getElementById("reportsExportStock");
  const rStockF = document.getElementById("reportsExportStockFiltered");
  const rMov = document.getElementById("reportsExportMovements");
  const rProd = document.getElementById("reportsExportProducts");
  const rProdF = document.getElementById("reportsExportProductsFiltered");
  const rTrace = document.getElementById("reportsExportTrace");
  if (rStock) rStock.addEventListener("click", () => void exportStockCsv());
  if (rStockF) rStockF.addEventListener("click", () => void exportStockCsvFiltered());
  if (rMov) rMov.addEventListener("click", () => void exportMovementsCsv());
  if (rProd) rProd.addEventListener("click", () => void exportProductsCsv());
  if (rProdF) rProdF.addEventListener("click", () => void exportProductsCsvFiltered());
  if (rTrace) rTrace.addEventListener("click", () => void exportTraceabilityCsv());
}

function updateAppDateTime() {
  const el = document.getElementById("appDateTime");
  if (!el) return;
  try {
    el.textContent = new Date().toLocaleString("es-MX", { dateStyle: "medium", timeStyle: "short" });
  } catch (_e) {
    el.textContent = new Date().toLocaleString();
  }
}

function buildClientStatsMap() {
  const map = new Map();
  for (const p of productsCache) {
    const code = p.customer?.code || "—";
    const name = p.customer?.name || code;
    if (!map.has(code)) map.set(code, { code, name, products: 0, stock: 0 });
    map.get(code).products += 1;
  }
  for (const row of stockRowsCache) {
    const code = row.product?.customer?.code || "—";
    if (!map.has(code)) {
      map.set(code, { code, name: row.product?.customer?.name || code, products: 0, stock: 0 });
    }
    const n = typeof row.qty === "string" ? Number(row.qty.replace(",", ".")) : Number(row.qty);
    map.get(code).stock += Number.isNaN(n) ? 0 : n;
  }
  for (const c of clientsCache) {
    const code = c.code || "—";
    if (!map.has(code)) map.set(code, { code, name: c.name || code, products: 0, stock: 0 });
    else if (c.name) map.get(code).name = c.name;
  }
  return map;
}

function renderClientsModule() {
  if (!clientsModuleList) return;
  const stats = buildClientStatsMap();
  const rows = filterRowsByAviatProject(Array.from(stats.values()).sort((a, b) => a.name.localeCompare(b.name, "es")));
  const countEl = document.getElementById("clientsTableCount");
  if (countEl) countEl.textContent = `Mostrando ${rows.length} proyecto${rows.length === 1 ? "" : "s"} de ${PRIMARY_CLIENT_AVIAT_NAME}`;
  renderDataGrid(clientsModuleList, {
    gridId: "clients",
    columns: CLIENTS_COLUMNS,
    rowDataList: rows,
    rowCellsFn: (r) => [
      renderCellEllipsis(r.name || r.code || "—"),
      `<span class="cell-nowrap">${escCell(r.code || "—")}</span>`,
      String(r.products),
      formatQty(r.stock),
      `<span class="status-chip">${r.products > 0 ? "Activo" : "Sin catálogo"}</span>`
    ],
    colsClass: "data-grid-cols-clients",
    sizeClass: "data-grid-size-catalog",
    emptyMessage: "No hay proyectos detectados. Carga catálogo o inventario para ver proyectos de AVIAT."
  });
  const adminZone = document.getElementById("clientsAdminZone");
  const adminList = clientsAdminList;
  if (adminZone && adminList && currentRole === "ADMIN") {
    adminZone.classList.remove("hidden");
    adminList.innerHTML = (Array.isArray(clientsCache) ? clientsCache : [])
      .map(
        (c) =>
          `<div class="user-row"><strong>${escCell(c.code)}</strong> — ${escCell(c.name)}<button type="button" class="user-delete btn-compact btn-danger" data-delete-customer="${c.id}">Eliminar</button></div>`
      )
      .join("");
  } else if (adminZone) {
    adminZone.classList.add("hidden");
  }
}

function renderControlCenterTable(rows) {
  if (!ccInventoryList) return;
  const total = stockRowsCache.length;
  const shown = Array.isArray(rows) ? rows.length : 0;
  updateTableCountMeta("ccTableCount", shown, total, "saldos");
  renderDataGrid(ccInventoryList, {
    gridId: "stock_cc",
    columns: STOCK_COLUMNS_CC,
    rowDataList: Array.isArray(rows) ? rows : [],
    rowCellsFn: (row) => stockRowCells(row, { includeWarehouse: false }),
    colsClass: "data-grid-cols-stock-cc",
    sizeClass: "data-grid-size-compact",
    emptyMessage: "Sin existencias con los filtros actuales. Carga inventario desde el módulo Inventario.",
    detailType: "inventory"
  });
}

function applyControlCenterFilters() {
  updateControlCenterKpis();
  updateAviatHeaderUi();
  const scoped = filterRowsByAviatProject(stockRowsCache);
  renderControlCenterTable(filterStockRowsWithFilters(scoped, getControlCenterFilterValues()));
}

function refreshControlCenter() {
  updateAviatHeaderUi();
  updateControlCenterKpis();
  applyControlCenterFilters();
}

function clearControlCenterFilters() {
  ["ccFilterCliente", "ccFilterCustomer", "ccFilterSku", "ccFilterProducto", "ccFilterUbicacion", "ccFilterStatus"].forEach(
    (id) => {
      const el = document.getElementById(id);
      if (el) el.value = "";
    }
  );
  applyControlCenterFilters();
}

function wireControlCenterFilters() {
  ["ccFilterCliente", "ccFilterCustomer", "ccFilterSku", "ccFilterProducto", "ccFilterUbicacion", "ccFilterStatus"].forEach(
    (id) => {
      const el = document.getElementById(id);
      if (el && el.dataset.filterWired !== "1") {
        el.dataset.filterWired = "1";
        el.addEventListener("input", applyControlCenterFilters);
      }
    }
  );
  const clearBtn = document.getElementById("ccClearFiltersBtn");
  if (clearBtn && clearBtn.dataset.filterWired !== "1") {
    clearBtn.dataset.filterWired = "1";
    clearBtn.addEventListener("click", clearControlCenterFilters);
  }
}

function wireQuickActions() {
  document.querySelectorAll("[data-goto-module]").forEach((btn) => {
    if (btn.dataset.qaWired === "1") return;
    btn.dataset.qaWired = "1";
    btn.addEventListener("click", () => {
      const mod = btn.getAttribute("data-goto-module");
      if (!mod) return;
      const sectionHint = btn.getAttribute("data-nav-section") || null;
      if (sectionHint) navigateTo(sectionHint, mod);
      else activateModule(mod);
    });
  });
}

function filterStockRows(rows) {
  const scoped = filterRowsByAviatProject(rows);
  return filterStockRowsWithFilters(scoped, getInventoryFilterValues());
}

function renderStockTable(rows) {
  if (!inventoryList) return;
  const total = filterRowsByAviatProject(stockRowsCache).length;
  const shown = Array.isArray(rows) ? rows.length : 0;
  updateTableCountMeta("inventoryTableCount", shown, total, "saldos");
  updateAviatHeaderUi();
  renderDataGrid(inventoryList, {
    gridId: "inventory",
    columns: STOCK_COLUMNS_FULL,
    rowDataList: Array.isArray(rows) ? rows : [],
    rowCellsFn: (row) => stockRowCells(row, { includeWarehouse: true }),
    colsClass: "data-grid-cols-stock",
    sizeClass: "data-grid-size-inventory",
    emptyMessage: "Sin registros con los filtros actuales. Ajusta filtros o carga inventario.",
    detailType: "inventory"
  });
}

function applyInventoryFilters() {
  const scoped = filterRowsByAviatProject(stockRowsCache);
  updateInventorySummary(scoped);
  renderStockTable(filterStockRows(stockRowsCache));
  applyControlCenterFilters();
}

function filterProductRows(rows) {
  const f = getCatalogFilterValues();
  return filterRowsByAviatProject(rows).filter((product) => {
    const project = getAviatProjectFromRow(product);
    return (
      matchesFilter(project.name, f.cliente) &&
      matchesFilter(project.code, f.customer) &&
      matchesFilter("N/D", f.lote) &&
      matchesFilter(product.sku, f.sku) &&
      matchesFilter(product.name, f.producto)
    );
  });
}

function renderProductsTable(rows) {
  if (!productsList) return;
  const total = filterRowsByAviatProject(productsCache).length;
  const shown = Array.isArray(rows) ? rows.length : 0;
  updateTableCountMeta("catalogTableCount", shown, total, "productos");
  updateAviatHeaderUi();
  renderDataGrid(productsList, {
    gridId: "catalog",
    columns: CATALOG_COLUMNS,
    rowDataList: Array.isArray(rows) ? rows : [],
    rowCellsFn: catalogRowCells,
    colsClass: "data-grid-cols-catalog",
    sizeClass: "data-grid-size-catalog",
    emptyMessage: "Sin productos con los filtros actuales.",
    detailType: "catalog"
  });
}

function applyCatalogFilters() {
  renderProductsTable(filterProductRows(productsCache));
}

function clearInventoryFilters() {
  ["invFilterCliente", "invFilterCustomer", "invFilterLote", "invFilterSku", "invFilterProducto", "invFilterUbicacion", "invFilterStatus"].forEach(
    (id) => {
      const el = document.getElementById(id);
      if (el) el.value = "";
    }
  );
  applyInventoryFilters();
}

function clearCatalogFilters() {
  ["catFilterCliente", "catFilterCustomer", "catFilterLote", "catFilterSku", "catFilterProducto"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.value = "";
  });
  applyCatalogFilters();
}

function wireInventoryFilterInputs() {
  ["invFilterCliente", "invFilterCustomer", "invFilterLote", "invFilterSku", "invFilterProducto", "invFilterUbicacion", "invFilterStatus"].forEach(
    (id) => {
      const el = document.getElementById(id);
      if (el && el.dataset.filterWired !== "1") {
        el.dataset.filterWired = "1";
        el.addEventListener("input", applyInventoryFilters);
      }
    }
  );
  const clearBtn = document.getElementById("inventoryClearFiltersBtn");
  if (clearBtn && clearBtn.dataset.filterWired !== "1") {
    clearBtn.dataset.filterWired = "1";
    clearBtn.addEventListener("click", clearInventoryFilters);
  }
}

function wireCatalogFilterInputs() {
  ["catFilterCliente", "catFilterCustomer", "catFilterLote", "catFilterSku", "catFilterProducto"].forEach((id) => {
    const el = document.getElementById(id);
    if (el && el.dataset.filterWired !== "1") {
      el.dataset.filterWired = "1";
      el.addEventListener("input", applyCatalogFilters);
    }
  });
  const clearBtn = document.getElementById("catalogClearFiltersBtn");
  if (clearBtn && clearBtn.dataset.filterWired !== "1") {
    clearBtn.dataset.filterWired = "1";
    clearBtn.addEventListener("click", clearCatalogFilters);
  }
}

async function readXlsxWorkbook(file) {
  if (typeof XLSX === "undefined") {
    throw new Error("No se pudo cargar el lector de Excel. Recarga la página e intenta de nuevo.");
  }
  const buffer = await file.arrayBuffer();
  try {
    return XLSX.read(buffer, { type: "array" });
  } catch (_e) {
    throw new Error("No se pudo leer el archivo Excel. Verifica que sea un .xlsx válido.");
  }
}

function rowIsEmpty(row) {
  if (!Array.isArray(row)) return true;
  return !row.some((cell) => String(cell ?? "").trim() !== "");
}

function rowToCells(row) {
  return (Array.isArray(row) ? row : []).map((cell) => String(cell ?? "").trim());
}

function parseCsvToRowMatrix(csvText) {
  return String(csvText || "").split(/\r?\n/).map((line) => parseCsvLine(line));
}

function sheetToRowMatrix(sheet) {
  return XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", raw: false });
}

function getSheetSortPriority(sheetName, importKind) {
  const normalized = normalizeHeaderKey(sheetName);
  if (normalized.includes("inventario actual")) return 0;
  if (normalized.includes("inventario")) return importKind === "inventory" ? 1 : 3;
  if (importKind === "catalog" && normalized.includes("entradas")) return 2;
  if (normalized.includes("entradas")) return 4;
  if (normalized.includes("salidas")) return 50;
  return 10;
}

function sortSheetNamesForImport(sheetNames, importKind) {
  return [...sheetNames].sort(
    (a, b) => getSheetSortPriority(a, importKind) - getSheetSortPriority(b, importKind)
  );
}

const LOGITEC_HEADER_SCAN_ROWS = 20;

function findLogitecHeaderRowInMatrix(rowMatrix) {
  const limit = Math.min(rowMatrix.length, LOGITEC_HEADER_SCAN_ROWS);
  for (let i = 0; i < limit; i += 1) {
    const headers = rowToCells(rowMatrix[i]);
    if (rowIsEmpty(headers)) continue;
    if (isLogitecFormat(buildHeaderIndex(headers))) {
      return { headerRowIndex: i, headers };
    }
  }
  return null;
}

function findStandardHeaderRowInMatrix(rowMatrix, importKind) {
  const limit = Math.min(rowMatrix.length, LOGITEC_HEADER_SCAN_ROWS);
  for (let i = 0; i < limit; i += 1) {
    const headers = rowToCells(rowMatrix[i]);
    if (rowIsEmpty(headers)) continue;
    const headerIndex = buildHeaderIndex(headers);
    if (importKind === "catalog" && isStandardCatalogFormat(headerIndex)) {
      return { headerRowIndex: i, headers };
    }
    if (importKind === "inventory" && isStandardInventoryFormat(headerIndex)) {
      return { headerRowIndex: i, headers };
    }
  }
  return null;
}

function extractDataRowsFromMatrix(rowMatrix, headerRowIndex) {
  const dataRows = [];
  for (let i = headerRowIndex + 1; i < rowMatrix.length; i += 1) {
    const row = rowToCells(rowMatrix[i]);
    if (rowIsEmpty(row)) continue;
    dataRows.push(row);
  }
  return dataRows;
}

function buildCsvFromTable(headers, dataRows) {
  const headerLine = headers.map((cell) => csvEscapeCell(cell)).join(",");
  const bodyLines = dataRows.map((row) =>
    headers.map((_header, index) => csvEscapeCell(row[index] ?? "")).join(",")
  );
  return [headerLine, ...bodyLines].join("\n");
}

function attachTableMetadata(result, sheetName, headerRowIndex) {
  if (sheetName) result.sheetName = sheetName;
  if (headerRowIndex >= 0) result.headerRowNumber = headerRowIndex + 1;
  return result;
}

function transformTableData(headers, dataRows, importKind, sheetName, headerRowIndex) {
  if (!headers.length) {
    throw new Error("El archivo no contiene encabezados válidos.");
  }
  if (!dataRows.length) {
    throw new Error("El archivo no contiene filas de datos.");
  }

  const headerIndex = buildHeaderIndex(headers);

  if (isLogitecFormat(headerIndex)) {
    const converted =
      importKind === "catalog"
        ? convertLogitecToCatalog(headers, dataRows)
        : convertLogitecToInventory(headers, dataRows, sheetName);
    return attachTableMetadata(converted, sheetName, headerRowIndex);
  }

  const csvText = buildCsvFromTable(headers, dataRows);

  if (importKind === "catalog" && isStandardCatalogFormat(headerIndex)) {
    return attachTableMetadata(
      {
        csvText,
        rowsRead: dataRows.length,
        rowsConverted: dataRows.length,
        format: "standard",
      },
      sheetName,
      headerRowIndex
    );
  }

  if (importKind === "inventory" && isStandardInventoryFormat(headerIndex)) {
    return attachTableMetadata(
      {
        csvText,
        rowsRead: dataRows.length,
        rowsConverted: dataRows.length,
        format: "standard",
      },
      sheetName,
      headerRowIndex
    );
  }

  return attachTableMetadata(
    {
      csvText,
      rowsRead: dataRows.length,
      rowsConverted: dataRows.length,
      format: "unknown",
    },
    sheetName,
    headerRowIndex
  );
}

function transformImportCsvText(csvText, importKind) {
  const trimmed = String(csvText || "").trim();
  if (!trimmed) throw new Error("El archivo CSV está vacío.");

  const rowMatrix = parseCsvToRowMatrix(trimmed);
  const logitecHeader = findLogitecHeaderRowInMatrix(rowMatrix);
  if (logitecHeader) {
    const dataRows = extractDataRowsFromMatrix(rowMatrix, logitecHeader.headerRowIndex);
    return transformTableData(
      logitecHeader.headers,
      dataRows,
      importKind,
      null,
      logitecHeader.headerRowIndex
    );
  }

  const standardHeader = findStandardHeaderRowInMatrix(rowMatrix, importKind);
  if (standardHeader) {
    const dataRows = extractDataRowsFromMatrix(rowMatrix, standardHeader.headerRowIndex);
    return transformTableData(
      standardHeader.headers,
      dataRows,
      importKind,
      null,
      standardHeader.headerRowIndex
    );
  }

  const firstNonEmpty = rowMatrix.findIndex((row) => !rowIsEmpty(row));
  if (firstNonEmpty < 0) throw new Error("El archivo CSV está vacío.");
  const headers = rowToCells(rowMatrix[firstNonEmpty]);
  const dataRows = extractDataRowsFromMatrix(rowMatrix, firstNonEmpty);
  return transformTableData(headers, dataRows, importKind, null, firstNonEmpty);
}

function transformImportWorkbook(workbook, importKind) {
  const sheetNames = workbook.SheetNames || [];
  if (!sheetNames.length) throw new Error("El archivo Excel no contiene hojas.");

  const orderedSheets = sortSheetNamesForImport(sheetNames, importKind);

  for (const sheetName of orderedSheets) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) continue;
    const rowMatrix = sheetToRowMatrix(sheet);
    const logitecHeader = findLogitecHeaderRowInMatrix(rowMatrix);
    if (!logitecHeader) continue;
    const dataRows = extractDataRowsFromMatrix(rowMatrix, logitecHeader.headerRowIndex);
    if (!dataRows.length) continue;
    return transformTableData(
      logitecHeader.headers,
      dataRows,
      importKind,
      sheetName,
      logitecHeader.headerRowIndex
    );
  }

  for (const sheetName of orderedSheets) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) continue;
    const rowMatrix = sheetToRowMatrix(sheet);
    const standardHeader = findStandardHeaderRowInMatrix(rowMatrix, importKind);
    if (!standardHeader) continue;
    const dataRows = extractDataRowsFromMatrix(rowMatrix, standardHeader.headerRowIndex);
    if (!dataRows.length) continue;
    return transformTableData(
      standardHeader.headers,
      dataRows,
      importKind,
      sheetName,
      standardHeader.headerRowIndex
    );
  }

  const fallbackSheetName = orderedSheets[0];
  const fallbackSheet = workbook.Sheets[fallbackSheetName];
  const rowMatrix = sheetToRowMatrix(fallbackSheet);
  const firstNonEmpty = rowMatrix.findIndex((row) => !rowIsEmpty(row));
  if (firstNonEmpty < 0) throw new Error("El archivo Excel está vacío.");
  const headers = rowToCells(rowMatrix[firstNonEmpty]);
  const dataRows = extractDataRowsFromMatrix(rowMatrix, firstNonEmpty);
  return transformTableData(headers, dataRows, importKind, fallbackSheetName, firstNonEmpty);
}

async function processImportFile(file, importKind) {
  if (!file) throw new Error("No se seleccionó ningún archivo.");
  const ext = getImportFileExtension(file.name);
  if (ext !== ".csv" && ext !== ".xlsx") {
    throw new Error("Formato no soportado. Usa archivo .xlsx o .csv.");
  }
  if (ext === ".csv") {
    return transformImportCsvText(await file.text(), importKind);
  }
  return transformImportWorkbook(await readXlsxWorkbook(file), importKind);
}

function normalizeHeaderKey(header) {
  return String(header || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}

function parseCsvLine(line) {
  const values = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === "," && !inQuotes) {
      values.push(current.trim());
      current = "";
      continue;
    }
    current += ch;
  }
  values.push(current.trim());
  return values;
}

function parseCsvText(csvText) {
  const lines = String(csvText || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (!lines.length) {
    return { headers: [], rows: [] };
  }
  const headers = parseCsvLine(lines[0]);
  const rows = lines.slice(1).map((line) => parseCsvLine(line));
  return { headers, rows };
}

function buildHeaderIndex(headers) {
  const index = new Map();
  headers.forEach((header, i) => {
    const key = normalizeHeaderKey(header);
    if (key && !index.has(key)) index.set(key, i);
  });
  return index;
}

function findHeaderColumn(headerIndex, aliases) {
  for (const alias of aliases) {
    const idx = headerIndex.get(normalizeHeaderKey(alias));
    if (idx !== undefined) return idx;
  }
  return -1;
}

const LOGITEC_DEFAULT_WAREHOUSE = "TULTITLAN24";

const LOGITEC_HEADER_ALIASES = {
  customer: ["customer"],
  materialNumber: ["material number", "materialnumber", "material no", "material_no"],
  materialDescription: ["material description", "materialdescription", "material desc"],
  poQt: ["po qt", "po_qt", "po qty", "po quantity"],
  ubicacion: ["ubicacion", "ubicación"],
  lote: ["lote (sales ordener)", "lote sales ordener", "lote", "sales ordener", "sales order"],
  serialNumber: ["serial number", "serialnumber", "serial no", "serial"],
  status: ["status", "estado"],
  poNetPrice: ["po net price", "po_net_price", "precio neto", "precio"],
  totalPo: ["total po", "total_po", "total"],
  currency: ["currency", "moneda"],
};

function getLogitecColumnMap(headerIndex) {
  return {
    customer: findHeaderColumn(headerIndex, LOGITEC_HEADER_ALIASES.customer),
    materialNumber: findHeaderColumn(headerIndex, LOGITEC_HEADER_ALIASES.materialNumber),
    materialDescription: findHeaderColumn(headerIndex, LOGITEC_HEADER_ALIASES.materialDescription),
    poQt: findHeaderColumn(headerIndex, LOGITEC_HEADER_ALIASES.poQt),
    ubicacion: findHeaderColumn(headerIndex, LOGITEC_HEADER_ALIASES.ubicacion),
    lote: findHeaderColumn(headerIndex, LOGITEC_HEADER_ALIASES.lote),
    serialNumber: findHeaderColumn(headerIndex, LOGITEC_HEADER_ALIASES.serialNumber),
    status: findHeaderColumn(headerIndex, LOGITEC_HEADER_ALIASES.status),
    poNetPrice: findHeaderColumn(headerIndex, LOGITEC_HEADER_ALIASES.poNetPrice),
    totalPo: findHeaderColumn(headerIndex, LOGITEC_HEADER_ALIASES.totalPo),
    currency: findHeaderColumn(headerIndex, LOGITEC_HEADER_ALIASES.currency),
  };
}

function isLogitecFormat(headerIndex) {
  const cols = getLogitecColumnMap(headerIndex);
  if (cols.materialNumber < 0) return false;
  const secondaryHits = [cols.materialDescription, cols.poQt, cols.ubicacion].filter((idx) => idx >= 0).length;
  return secondaryHits >= 1;
}

function isStandardCatalogFormat(headerIndex) {
  const sku = findHeaderColumn(headerIndex, ["sku"]);
  const customer = findHeaderColumn(headerIndex, ["customer", "cliente"]);
  const name = findHeaderColumn(headerIndex, ["name", "nombre"]);
  return sku >= 0 && (customer >= 0 || name >= 0);
}

function isStandardInventoryFormat(headerIndex) {
  const sku = findHeaderColumn(headerIndex, ["sku", "material number"]);
  const quantity = findHeaderColumn(headerIndex, ["quantity", "qty", "cantidad", "po qt"]);
  const location = findHeaderColumn(headerIndex, ["location", "ubicacion", "ubicación"]);
  return sku >= 0 && quantity >= 0 && location >= 0;
}

function getCellValue(row, index) {
  if (index < 0 || !Array.isArray(row)) return "";
  return String(row[index] ?? "").trim();
}

function parseQuantityValue(raw) {
  if (raw == null || String(raw).trim() === "") return { value: 0, empty: true };
  const normalized = String(raw).replace(/\s+/g, "").replace(",", ".");
  const n = Number(normalized);
  if (Number.isNaN(n)) return { value: 0, empty: true };
  return { value: n, empty: false };
}

function stripCustomerLegalSuffixes(name) {
  let value = String(name || "").trim();
  const patterns = [
    /,?\s*S\.?\s*DE\s*R\.?\s*L\.?\s*DE\s*C\.?\s*V\.?\s*$/i,
    /,?\s*S\.?\s*A\.?\s*DE\s*C\.?\s*V\.?\s*$/i,
    /,?\s*SA\s*DE\s*CV\s*$/i,
    /,\s*S\.?\s*A\.?\s*$/i,
    /,\s*SA\s*$/i,
    /,\s*DE\s*CV\s*$/i,
  ];
  let changed = true;
  while (changed) {
    changed = false;
    for (const pattern of patterns) {
      const next = value.replace(pattern, "").trim();
      if (next !== value) {
        value = next;
        changed = true;
      }
    }
  }
  return value;
}

function normalizeCustomerCode(rawName) {
  let value = String(rawName || "").trim();
  if (!value) return "LOGITEC";

  value = value.replace(/AT&T/gi, "ATT");
  value = value.replace(/&/g, " AND ");
  value = stripCustomerLegalSuffixes(value);
  value = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/ /g, "_");

  if (value.length > 40) value = value.slice(0, 40).replace(/_+$/g, "");
  if (!value) return "LOGITEC";
  return value;
}

function truncateText(value, max) {
  const text = String(value || "");
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(0, max - 3))}...`;
}

const LOGITEC_KNOWN_STATUSES = new Set(["AVAILABLE", "OPERATIONS", "HOLD", "BLOCKED", "QUARANTINE"]);

function normalizeInventoryStatus(raw) {
  const original = String(raw || "").trim();
  if (!original || /^n\/a$/i.test(original)) {
    return { status: "AVAILABLE", recognized: false, original: original || "N/A" };
  }
  const normalized = original.toUpperCase();
  if (LOGITEC_KNOWN_STATUSES.has(normalized)) {
    return { status: normalized, recognized: true, original };
  }
  return { status: "AVAILABLE", recognized: false, original };
}

function buildGroupedInventoryReference(group) {
  const parts = [];
  if (group.lotes.length) parts.push(`LOTE: ${group.lotes.slice(0, 3).join(";")}`);
  if (group.serialRows > 0) {
    const validSerials = group.serialRows - group.serialNA;
    if (group.serialNA > 0) {
      parts.push(`SERIAL: ${validSerials} serie(s); ${group.serialNA} N/A`);
    } else {
      parts.push(`SERIAL: ${group.serialRows} serie(s)`);
    }
  }
  if (group.statusOriginal && !group.statusRecognized) {
    parts.push(`STATUS_ORIG: ${group.statusOriginal}`);
  }
  return truncateText(parts.join(" | "), 120);
}

function buildGroupedInventoryNotes(group) {
  if (!group.financialHint) return "";
  return truncateText(group.financialHint, 500);
}

function buildLogitecImportSummary(rows, cols, convertedCount, conflicts) {
  const customers = new Set();
  const locations = new Set();
  const statuses = new Set();
  const skus = new Set();
  let financialRows = 0;

  for (const row of rows) {
    const sku = getCellValue(row, cols.materialNumber);
    if (sku) skus.add(sku);
    const customerName = getCellValue(row, cols.customer);
    if (customerName) customers.add(normalizeCustomerCode(customerName));
    const ubicacion = getCellValue(row, cols.ubicacion);
    if (ubicacion) locations.add(ubicacion);
    const statusInfo = normalizeInventoryStatus(getCellValue(row, cols.status));
    statuses.add(statusInfo.status);
    if (
      getCellValue(row, cols.poNetPrice) ||
      getCellValue(row, cols.totalPo) ||
      getCellValue(row, cols.currency)
    ) {
      financialRows += 1;
    }
  }

  return {
    uniqueProducts: skus.size,
    customers: customers.size,
    locations: locations.size,
    statuses: [...statuses],
    groupedBalances: convertedCount,
    financialRows,
    conflicts
  };
}

function buildLogitecReference(row, cols) {
  const parts = [];
  const lote = getCellValue(row, cols.lote);
  const serial = getCellValue(row, cols.serialNumber);
  const status = getCellValue(row, cols.status);
  if (lote) parts.push(`LOTE: ${lote}`);
  if (serial) parts.push(`SERIAL: ${serial}`);
  if (status) parts.push(`STATUS: ${status}`);
  return parts.join(" | ");
}

function convertLogitecToCatalog(headers, rows) {
  const headerIndex = buildHeaderIndex(headers);
  const cols = getLogitecColumnMap(headerIndex);
  const skuIndex = new Map();
  const converted = [];
  const conflicts = [];
  let skippedNoSku = 0;

  for (const row of rows) {
    const sku = getCellValue(row, cols.materialNumber);
    if (!sku) {
      skippedNoSku += 1;
      continue;
    }

    const customerName = getCellValue(row, cols.customer) || "LOGITEC";
    const customer = normalizeCustomerCode(customerName);
    const name = getCellValue(row, cols.materialDescription);
    const existing = skuIndex.get(sku);

    if (existing) {
      if (existing.customer !== customer) {
        conflicts.push(
          `SKU ${sku}: clientes distintos (${existing.customerName} / ${customerName}). El modelo actual solo permite un cliente por SKU.`
        );
      }
      if (existing.name && name && existing.name !== name) {
        conflicts.push(`SKU ${sku}: descripciones distintas en el Excel.`);
      }
      continue;
    }

    skuIndex.set(sku, { customer, customerName, name });
    converted.push({
      customer,
      customerName,
      sku,
      name,
      barcode: sku,
      warehouse: LOGITEC_DEFAULT_WAREHOUSE,
    });
  }

  const outputHeaders = ["customer", "customerName", "sku", "name", "barcode", "warehouse"];
  const csvText = [
    outputHeaders.join(","),
    ...converted.map((item) =>
      outputHeaders.map((key) => csvEscapeCell(item[key])).join(",")
    ),
  ].join("\n");

  const customersDetected = new Set(converted.map((item) => item.customer));

  return {
    csvText,
    rowsRead: rows.length,
    rowsConverted: converted.length,
    skippedNoSku,
    conflicts,
    importSummary: {
      uniqueProducts: converted.length,
      customers: customersDetected.size,
      groupedBalances: converted.length,
      conflicts: conflicts.length,
      financialRows: rows.filter(
        (row) =>
          getCellValue(row, cols.poNetPrice) ||
          getCellValue(row, cols.totalPo) ||
          getCellValue(row, cols.currency)
      ).length
    },
    format: "logitec",
  };
}

function convertLogitecToInventory(headers, rows, sheetName) {
  const headerIndex = buildHeaderIndex(headers);
  const cols = getLogitecColumnMap(headerIndex);
  const grouped = new Map();
  const conflicts = [];
  const skuCustomerIndex = new Map();
  let skippedNoSku = 0;
  let emptyQuantityRows = 0;
  let emptyLocationRows = 0;
  let unrecognizedStatusRows = 0;
  const defaultLocation = `${LOGITEC_DEFAULT_WAREHOUSE}-GEN-STAGE-01`;

  for (const row of rows) {
    const sku = getCellValue(row, cols.materialNumber);
    if (!sku) {
      skippedNoSku += 1;
      continue;
    }

    const customerName = getCellValue(row, cols.customer) || "LOGITEC";
    const customer = normalizeCustomerCode(customerName);
    const skuCustomer = skuCustomerIndex.get(sku);
    if (skuCustomer && skuCustomer !== customer) {
      const conflictMsg = `SKU ${sku}: aparece con clientes distintos en inventario (${skuCustomer} / ${customer}).`;
      if (!conflicts.includes(conflictMsg)) conflicts.push(conflictMsg);
    } else if (!skuCustomer) {
      skuCustomerIndex.set(sku, customer);
    }

    const ubicacion = getCellValue(row, cols.ubicacion);
    if (!ubicacion) emptyLocationRows += 1;
    const statusInfo = normalizeInventoryStatus(getCellValue(row, cols.status));
    if (!statusInfo.recognized && statusInfo.original) unrecognizedStatusRows += 1;

    const qtyParsed = parseQuantityValue(getCellValue(row, cols.poQt));
    if (qtyParsed.empty) emptyQuantityRows += 1;

    const groupKey = `${customer}\u0001${sku}\u0001${ubicacion}\u0001${statusInfo.status}`;
    const current = grouped.get(groupKey) || {
      customer,
      customerName,
      sku,
      ubicacion,
      status: statusInfo.status,
      statusOriginal: statusInfo.original,
      statusRecognized: statusInfo.recognized,
      quantity: 0,
      lotes: [],
      serialRows: 0,
      serialNA: 0,
      financialHint: "",
    };

    current.quantity += qtyParsed.value;

    const lote = getCellValue(row, cols.lote);
    if (lote && !current.lotes.includes(lote)) current.lotes.push(lote);

    const serial = getCellValue(row, cols.serialNumber);
    current.serialRows += 1;
    if (!serial || /^n\/a$/i.test(serial)) current.serialNA += 1;

    const price = getCellValue(row, cols.poNetPrice);
    const total = getCellValue(row, cols.totalPo);
    const currency = getCellValue(row, cols.currency);
    if ((price || total || currency) && !current.financialHint) {
      current.financialHint = `FIN: price=${price || "-"} total=${total || "-"} ${currency || ""}`.trim();
    }

    grouped.set(groupKey, current);
  }

  const converted = [...grouped.values()].map((item) => ({
    customer: item.customer,
    sku: item.sku,
    quantity: item.quantity,
    warehouse: LOGITEC_DEFAULT_WAREHOUSE,
    location: item.ubicacion || defaultLocation,
    status: item.status,
    reference: buildGroupedInventoryReference(item),
    notes: buildGroupedInventoryNotes(item),
  }));

  const outputHeaders = ["customer", "sku", "quantity", "warehouse", "location", "status", "reference", "notes"];
  const csvText = [
    outputHeaders.join(","),
    ...converted.map((item) =>
      outputHeaders.map((key) => csvEscapeCell(item[key])).join(",")
    ),
  ].join("\n");

  const importSummary = buildLogitecImportSummary(rows, cols, converted.length, conflicts);
  importSummary.conflicts = conflicts.length;

  return {
    csvText,
    rowsRead: rows.length,
    rowsConverted: converted.length,
    skippedNoSku,
    emptyQuantityRows,
    emptyLocationRows,
    unrecognizedStatusRows,
    conflicts,
    importSummary,
    format: "logitec",
  };
}

function buildImportFileStatusMessage(result, filename, nextStepLabel, importKind) {
  if (result.format === "logitec") {
    const kindLabel =
      importKind === "catalog"
        ? "Formato Logitec detectado: catálogo convertido con códigos de cliente limpios y nombre completo para revisión."
        : "Formato Logitec detectado: inventario agrupado por cliente, SKU, ubicación y estatus.";
    const details = [
      kindLabel,
      result.sheetName ? `Hoja detectada: ${result.sheetName}.` : null,
      result.headerRowNumber ? `Fila de encabezados: ${result.headerRowNumber}.` : null,
      `Filas leídas: ${result.rowsRead}.`,
      importKind === "inventory"
        ? `Saldos agrupados: ${result.rowsConverted}.`
        : `Productos únicos: ${result.rowsConverted}.`,
      "Tipo detectado: Formato Logitec.",
    ].filter(Boolean);
    if (result.importSummary) {
      const summary = result.importSummary;
      details.push(`Clientes detectados: ${summary.customers}.`);
      if (summary.locations != null) details.push(`Ubicaciones detectadas: ${summary.locations}.`);
      if (summary.statuses?.length) {
        details.push(
          `Estatus detectados: ${summary.statuses.map((s) => formatInventoryStatus(s)).join(", ")}.`
        );
      }
      if (summary.financialRows) {
        details.push(
          `Datos financieros detectados en ${summary.financialRows} fila(s); pendientes de modelo de valorización (ver notes/reference).`
        );
      }
      if (summary.conflicts) {
        details.push(`Conflictos detectados: ${summary.conflicts}.`);
      }
    }
    const extras = [];
    if (result.skippedNoSku) extras.push(`${result.skippedNoSku} filas omitidas sin SKU`);
    if (result.emptyQuantityRows) extras.push(`${result.emptyQuantityRows} filas con cantidad vacía (se usó 0)`);
    if (result.emptyLocationRows) extras.push(`${result.emptyLocationRows} filas con ubicación vacía`);
    if (result.unrecognizedStatusRows) {
      extras.push(
        `${result.unrecognizedStatusRows} filas con estatus no reconocido (se usó Disponible y se conserva en reference)`
      );
    }
    if (result.conflicts?.length) {
      extras.push(`Conflictos (${result.conflicts.length}): ${result.conflicts.slice(0, 2).join("; ")}`);
    }
    if (extras.length) details.push(extras.join(". ") + ".");
    details.push(`Revisa el contenido y luego usa ${nextStepLabel}.`);
    return details.join(" ");
  }

  const base = `Archivo "${filename}": leídas ${result.rowsRead} filas, convertidas ${result.rowsConverted} filas.`;
  const sheetInfo = result.sheetName ? ` Hoja detectada: ${result.sheetName}.` : "";
  const headerInfo = result.headerRowNumber ? ` Fila de encabezados: ${result.headerRowNumber}.` : "";

  if (result.format === "standard") {
    return `Formato plantilla estándar detectado.${sheetInfo}${headerInfo} ${base} Revisa el contenido y luego usa ${nextStepLabel}.`;
  }

  return `Formato no reconocido; se cargó CSV sin conversión.${sheetInfo}${headerInfo} ${base} Revisa el contenido y luego usa ${nextStepLabel}.`;
}

async function loadImportFileIntoTextarea(file, textarea, statusEl, nextStepLabel, importKind) {
  if (!textarea) return;
  setFileStatus(statusEl, "Leyendo archivo…", false);
  try {
    const result = await processImportFile(file, importKind);
    textarea.value = result.csvText;
    if (importKind === "catalog") resetCatalogApplyState();
    setFileStatus(statusEl, buildImportFileStatusMessage(result, file.name, nextStepLabel, importKind), false);
  } catch (err) {
    const message = err instanceof Error ? err.message : "No se pudo leer el archivo.";
    setFileStatus(statusEl, message, true);
  }
}

function exportToCsv(filenameBase, rows, headers) {
  const headerLine = headers.map((h) => csvEscapeCell(h.label)).join(",");
  const bodyLines = (Array.isArray(rows) ? rows : []).map((row) =>
    headers.map((h) => csvEscapeCell(h.value(row))).join(",")
  );
  const content = `\uFEFF${[headerLine, ...bodyLines].join("\r\n")}`;
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `${filenameBase}_${stamp}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(link.href), 500);
}

function formatExportDate(iso) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString("es-MX", { dateStyle: "short", timeStyle: "medium" });
  } catch (_e) {
    return String(iso);
  }
}

function buildTraceabilityParams() {
  const params = new URLSearchParams();
  const wh = document.getElementById("traceWh")?.value?.trim();
  const uid = document.getElementById("traceUserId")?.value?.trim();
  const typ = document.getElementById("traceType")?.value?.trim();
  const sku = document.getElementById("traceSku")?.value?.trim();
  const customer = document.getElementById("traceCustomer")?.value?.trim();
  const cliente = document.getElementById("traceCliente")?.value?.trim();
  const from = document.getElementById("traceFrom")?.value?.trim();
  const to = document.getElementById("traceTo")?.value?.trim();
  if (wh) params.set("warehouse", wh);
  if (uid) params.set("userId", uid);
  if (typ) params.set("type", typ);
  if (sku) params.set("sku", sku);
  if (customer) params.set("customer", customer);
  if (cliente) params.set("cliente", cliente);
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  params.set("limit", "500");
  return params;
}

const STOCK_EXPORT_COLUMNS = [
  { label: "proyecto", value: (r) => getAviatProjectDisplayFromRow(r) },
  { label: "lote", value: (r) => extractLoteFromRow(r) },
  { label: "sku_codigo_barras", value: (r) => formatSkuBarcode(r.product) },
  { label: "producto", value: (r) => r.product?.name || "" },
  { label: "almacen", value: (r) => r.location?.warehouse || "" },
  { label: "ubicacion", value: (r) => r.location?.code || "" },
  { label: "status", value: (r) => r.status || "" },
  { label: "cantidad", value: (r) => formatQty(r.qty) }
];

const CATALOG_EXPORT_COLUMNS = [
  { label: "proyecto", value: (r) => getAviatProjectDisplayFromRow(r) },
  { label: "lote", value: () => "N/D" },
  { label: "sku_codigo_barras", value: (r) => formatSkuBarcode(r) },
  { label: "producto", value: (r) => r.name || "" },
  { label: "almacen", value: (r) => r.warehouse || "" },
  { label: "codigo_barras", value: (r) => r.barcode || "" }
];

const MOVEMENT_EXPORT_COLUMNS = [
  { label: "fecha", value: (r) => formatExportDate(r.createdAt) },
  { label: "proyecto", value: (r) => getAviatProjectDisplayFromRow(r) },
  { label: "lote", value: (r) => extractLoteFromRow(r) },
  { label: "tipo", value: (r) => r.movementType || r.type || "" },
  { label: "sku_codigo_barras", value: (r) => formatSkuBarcode(r.product) },
  { label: "producto", value: (r) => r.product?.name || "" },
  { label: "antes", value: (r) => formatQty(r.quantityBefore) },
  { label: "despues", value: (r) => formatQty(r.quantityAfter) },
  { label: "ubicacion", value: (r) => r.toLocation?.code || r.fromLocation?.code || "" },
  { label: "usuario", value: (r) => r.user?.fullName || r.user?.email || "" },
  { label: "referencia", value: (r) => r.reference || "" }
];

async function exportStockCsv() {
  const response = await authenticatedFetch("/api/inventory/stock");
  if (!response?.ok) {
    window.alert("No se pudo exportar existencias.");
    return;
  }
  const rows = filterRowsByAviatProject(await response.json());
  if (!Array.isArray(rows) || rows.length === 0) {
    window.alert("No hay existencias para exportar.");
    return;
  }
  exportToCsv(getAviatExportBasename("inventario"), rows, STOCK_EXPORT_COLUMNS);
}

async function exportStockCsvFiltered() {
  const rows = filterStockRows(stockRowsCache);
  if (!rows.length) {
    window.alert("No hay registros con los filtros actuales.");
    return;
  }
  exportToCsv(`${getAviatExportBasename("inventario")}_filtrado`, rows, STOCK_EXPORT_COLUMNS);
}

async function exportProductsCsvFiltered() {
  const rows = filterProductRows(productsCache);
  if (!rows.length) {
    window.alert("No hay productos con los filtros actuales.");
    return;
  }
  exportToCsv(`${getAviatExportBasename("catalogo")}_filtrado`, rows, CATALOG_EXPORT_COLUMNS);
}

async function exportMovementsCsv() {
  const response = await authenticatedFetch("/api/inventory/movements?limit=all");
  if (!response?.ok) {
    window.alert("No se pudo exportar movimientos.");
    return;
  }
  const rows = filterRowsByAviatProject(await response.json());
  if (!Array.isArray(rows) || rows.length === 0) {
    window.alert("No hay movimientos para exportar.");
    return;
  }
  exportToCsv(getAviatExportBasename("movimientos"), rows, MOVEMENT_EXPORT_COLUMNS);
}

async function exportTraceabilityCsv() {
  const params = buildTraceabilityParams();
  const response = await authenticatedFetch(`/api/traceability/activity?${params.toString()}`);
  if (!response?.ok) {
    window.alert("No se pudo exportar trazabilidad.");
    return;
  }
  const rows = await response.json();
  if (!Array.isArray(rows) || rows.length === 0) {
    window.alert("No hay registros de trazabilidad para exportar.");
    return;
  }
  exportToCsv("logitec_trazabilidad", rows, [
    { label: "Fecha", value: (r) => formatExportDate(r.createdAt) },
    { label: "Evento", value: (r) => r.subtype || r.type || "" },
    { label: "Tipo", value: (r) => r.type || "" },
    { label: "SKU", value: (r) => r.product?.sku || "" },
    { label: "Producto", value: (r) => r.product?.name || "" },
    { label: "Cantidad", value: (r) => formatQty(r.qty) },
    { label: "Ubicación", value: (r) => r.location || r.warehouse || "" },
    { label: "Resultado", value: (r) => r.result || "" },
    { label: "Referencia", value: (r) => r.reference || "" }
  ]);
}

async function exportProductsCsv() {
  const response = await authenticatedFetch("/api/catalog/products");
  if (!response?.ok) {
    window.alert("No se pudo exportar productos.");
    return;
  }
  const rows = filterRowsByAviatProject(await response.json());
  if (!Array.isArray(rows) || rows.length === 0) {
    window.alert("No hay productos para exportar.");
    return;
  }
  exportToCsv(getAviatExportBasename("catalogo"), rows, CATALOG_EXPORT_COLUMNS);
}

async function loadCurrentUser() {
  const response = await authenticatedFetch("/api/auth/me");
  if (!response) return null;

  if (!response.ok) {
    statusBox.innerHTML = '<span class="error">No se pudo cargar la sesion.</span>';
    return null;
  }

  return response.json();
}

async function loadUsersModule(role) {
  if (role !== "ADMIN") {
    usersMessage.textContent = "Este modulo requiere permisos de ADMIN.";
    usersList.innerHTML = "";
    createUserForm.classList.add("hidden");
    return;
  }

  createUserForm.classList.remove("hidden");
  const response = await authenticatedFetch("/api/users");
  if (!response) return;

  if (!response.ok) {
    usersMessage.textContent = "No fue posible cargar usuarios.";
    usersList.innerHTML = "";
    return;
  }

  const users = await response.json();
  usersMessage.textContent = "Gestión inicial de usuarios (todos los administradores ven el listado completo).";
  usersList.innerHTML = (Array.isArray(users) ? users : [])
    .map((user) => {
      const inactive = user.isActive === false;
      const inactiveTag = inactive ? '<span class="badge-inactive">inactivo</span>' : "";
      const delBtn =
        currentUserId && user.id !== currentUserId && user.isActive !== false
          ? `<button type="button" class="user-delete" data-delete-user="${user.id}">Desactivar</button>`
          : "";
      return `<div class="user-row"><strong>${user.fullName}</strong> - ${user.email} (${user.role})${inactiveTag}${delBtn}</div>`;
    })
    .join("");
  renderUsersSummary(`Usuarios en sistema: ${Array.isArray(users) ? users.length : 0}`);
}

async function loadScanEvents() {
  const response = await authenticatedFetch("/api/picking/scans");
  if (!response || !response.ok) return;
  const scans = await response.json();
  const rows = Array.isArray(scans) ? scans : [];
  const showOperator =
    currentRole === "ADMIN" || currentRole === "SUPERVISOR" || currentRole === "OPERATOR";
  const gridId = showOperator ? "picking_op" : "picking";
  const columns = getPickingColumns(showOperator);
  if (!scanEventsList) return;
  if (rows.length === 0) {
    renderExcelTable(scanEventsList, {
      gridId,
      columns,
      rows: [],
      emptyMessage: "Sin escaneos registrados aún.",
      selectable: false
    });
    return;
  }
  renderExcelTable(scanEventsList, {
    gridId,
    columns,
    rows,
    emptyMessage: "Sin escaneos registrados aún.",
    selectable: true
  });
}

async function loadProductsRows() {
  const productsResponse = await authenticatedFetch("/api/catalog/products");
  if (!productsResponse?.ok) {
    productsCache = [];
    if (productsList) productsList.textContent = "No se pudo cargar el catálogo.";
    return;
  }
  const products = await productsResponse.json();
  productsCache = Array.isArray(products) ? products : [];
  applyCatalogFilters();
  updateControlCenterKpis();
}

function formatQty(q) {
  if (q == null || q === "") return "—";
  const n = typeof q === "string" ? Number(q.replace(",", ".")) : Number(q);
  if (Number.isNaN(n)) return String(q);
  return n.toLocaleString("es-MX", { minimumFractionDigits: 0, maximumFractionDigits: 4 });
}

function escCell(s) {
  if (s == null || s === "") return "—";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function loadTraceability() {
  if (!traceList) return;
  if (traceMessage) traceMessage.textContent = "Consultando trazabilidad…";
  const params = buildTraceabilityParams();
  params.set("limit", "200");
  try {
    const response = await authenticatedFetch(`/api/traceability/activity?${params.toString()}`);
    if (!response) return;
    if (!response.ok) {
      if (traceMessage) traceMessage.textContent = "No se pudo cargar trazabilidad.";
      traceList.innerHTML = "";
      return;
    }
    const rows = await response.json();
    updateAviatHeaderUi();
    if (traceMessage) traceMessage.textContent = `${Array.isArray(rows) ? rows.length : 0} registros. ${getAviatScopeSummaryText()}`;
    const scopedRows = filterRowsByAviatProject(Array.isArray(rows) ? rows : []);
    if (!scopedRows.length) {
      traceList.innerHTML = "";
      renderExcelTable(traceList, {
        gridId: "traceability",
        columns: TRACE_COLUMNS,
        rows: [],
        emptyMessage: "Sin registros operativos aún"
      });
      return;
    }
    renderExcelTable(traceList, {
      gridId: "traceability",
      columns: TRACE_COLUMNS,
      rows: scopedRows,
      emptyMessage: "Sin registros operativos aún"
    });
  } catch (_e) {
    if (traceMessage) traceMessage.textContent = "Error de red.";
  }
}

async function loadIncidents() {
  if (!incidentList) return;
  if (incidentMessage) incidentMessage.textContent = "Cargando…";
  try {
    const response = await authenticatedFetch("/api/incidents");
    if (!response) return;
    if (!response.ok) {
      if (incidentMessage) incidentMessage.textContent = "No se pudieron cargar incidencias.";
      incidentList.innerHTML = "";
      return;
    }
    const rows = await response.json();
    if (incidentMessage) incidentMessage.textContent = `${Array.isArray(rows) ? rows.length : 0} incidencias.`;
    if (!Array.isArray(rows) || rows.length === 0) {
      incidentList.innerHTML = "";
      renderExcelTable(incidentList, { gridId: "incidents", columns: INCIDENT_COLUMNS, rows: [], emptyMessage: "Sin registros operativos aún", selectable: false, allowActions: true });
      return;
    }
    const canResolve = currentRole === "ADMIN" || currentRole === "SUPERVISOR";
    const incidentRows = rows.map((i) => ({
      ...i,
      _actionHtml: canResolve
        ? `<button type="button" class="incident-resolve btn-table btn-danger btn-compact" data-incident-id="${escCell(i.id)}">Cerrar</button>`
        : "—"
    }));
    renderExcelTable(incidentList, {
      gridId: "incidents",
      columns: INCIDENT_COLUMNS,
      rows: incidentRows,
      emptyMessage: "Sin registros operativos aún",
      selectable: false,
      allowActions: true
    });
  } catch (_e) {
    if (incidentMessage) incidentMessage.textContent = "Error de red.";
  }
}

async function resolveIncident(incidentId) {
  const resolution = window.prompt("Resolución (opcional):", "");
  if (resolution === null) return;
  try {
    const response = await authenticatedFetch(`/api/incidents/${encodeURIComponent(incidentId)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "RESOLVED", resolution: resolution || "Cerrado" })
    });
    if (response?.ok) await loadIncidents();
    else {
      const d = await response?.json().catch(() => ({}));
      window.alert(d.message || "No se pudo cerrar.");
    }
  } catch (_e) {
    window.alert("Error de red.");
  }
}

async function createIncidentClick() {
  if (!incidentCreateBtn || !incidentCreateError) return;
  incidentCreateError.textContent = "";
  const typeUi = document.getElementById("incidentType")?.value;
  const mapped = resolveIncidentTypeFromUi(typeUi);
  const type = mapped.value;
  const warehouse = readSmartFieldValue("incidentWarehouse");
  const location = readSmartFieldValue("incidentLocation");
  const productSkuRaw =
    document.getElementById("incidentProductSku")?.value?.trim() ||
    document.getElementById("incidentProductId")?.value?.trim() ||
    "";
  const notesBase = document.getElementById("incidentNotes")?.value?.trim();
  if (!notesBase) {
    incidentCreateError.textContent = "Las notas son obligatorias.";
    return;
  }

  let productId;
  let notes = notesBase;
  let usedManualRef = false;
  if (productSkuRaw) {
    const product = resolveProductBySkuOrCode(productSkuRaw);
    if (product?.id) {
      productId = product.id;
    } else {
      usedManualRef = true;
      notes = `${notesBase}\n[SKU/ref manual: ${productSkuRaw}]`;
    }
  }

  incidentCreateBtn.disabled = true;
  try {
    const body = {
      type,
      warehouse: warehouse || undefined,
      location: location || undefined,
      notes
    };
    if (productId) body.productId = productId;

    const response = await authenticatedFetch("/api/incidents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    if (!response) return;
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const msg =
        data.message ||
        (response.status >= 500
          ? "No se pudo registrar la incidencia. Verifica el SKU/código o déjalo vacío."
          : "No se pudo registrar.");
      incidentCreateError.textContent = msg;
      return;
    }
    document.getElementById("incidentNotes").value = "";
    const skuEl = document.getElementById("incidentProductSku");
    if (skuEl) skuEl.value = "";
    if (usedManualRef) {
      incidentCreateError.textContent =
        "Incidencia registrada. Producto no encontrado en catálogo; se guardó como referencia manual.";
    } else {
      incidentCreateError.textContent = "";
    }
    await loadIncidents();
  } catch (_e) {
    incidentCreateError.textContent = "Error de red al registrar la incidencia.";
  } finally {
    incidentCreateBtn.disabled = false;
  }
}

async function loadStockStrip() {
  if (!inventoryList && !ccInventoryList) return;
  if (currentRole !== "ADMIN" && currentRole !== "OPERATOR" && currentRole !== "SUPERVISOR") {
    stockRowsCache = [];
    updateInventorySummary([]);
    updateTableCountMeta("inventoryTableCount", 0, 0, "saldos");
    if (inventoryList) {
      renderDataGrid(inventoryList, {
        gridId: "inventory",
        columns: STOCK_COLUMNS_FULL,
        rowDataList: [],
        rowCellsFn: (row) => stockRowCells(row, { includeWarehouse: true }),
        colsClass: "data-grid-cols-stock",
        sizeClass: "data-grid-size-inventory",
        emptyMessage: "Las existencias solo aplican a roles operativos."
      });
    }
    applyControlCenterFilters();
    return;
  }
  const response = await authenticatedFetch("/api/inventory/stock");
  if (!response?.ok) {
    stockRowsCache = [];
    updateInventorySummary([]);
    updateTableCountMeta("inventoryTableCount", 0, 0, "saldos");
    if (inventoryList) {
      renderDataGrid(inventoryList, {
        gridId: "inventory",
        columns: STOCK_COLUMNS_FULL,
        rowDataList: [],
        rowCellsFn: (row) => stockRowCells(row, { includeWarehouse: true }),
        colsClass: "data-grid-cols-stock",
        sizeClass: "data-grid-size-inventory",
        emptyMessage: "No se pudo cargar existencias."
      });
    }
    applyControlCenterFilters();
    return;
  }
  const rows = await response.json();
  stockRowsCache = Array.isArray(rows) ? rows : [];
  if (stockRowsCache.length === 0) {
    updateInventorySummary([]);
    updateTableCountMeta("inventoryTableCount", 0, 0, "saldos");
    if (inventoryList) {
      renderDataGrid(inventoryList, {
        gridId: "inventory",
        columns: STOCK_COLUMNS_FULL,
        rowDataList: [],
        rowCellsFn: (row) => stockRowCells(row, { includeWarehouse: true }),
        colsClass: "data-grid-cols-stock",
        sizeClass: "data-grid-size-inventory",
        emptyMessage: "Sin registros de existencias. Use Importar inventario para cargar saldos."
      });
    }
    applyControlCenterFilters();
    return;
  }
  applyInventoryFilters();
  renderClientsModule();
  renderAviatProjectChips(document.getElementById("ccAviatProjectChips"));
  updateAviatHeaderUi();
}

async function loadInventoryMovements() {
  if (!inventoryMovementsList) return;
  if (currentRole !== "ADMIN" && currentRole !== "OPERATOR" && currentRole !== "SUPERVISOR") {
    movementsCountCache = 0;
    updateInventorySummary(stockRowsCache);
    inventoryMovementsList.innerHTML = "";
    return;
  }
  const response = await authenticatedFetch("/api/inventory/movements");
  if (!response?.ok) {
    movementsCountCache = 0;
    updateInventorySummary(stockRowsCache);
    inventoryMovementsList.textContent = "No se pudo cargar movimientos.";
    return;
  }
  const rows = await response.json();
  movementsCountCache = Array.isArray(rows) ? rows.length : 0;
  movementsRowsCache = Array.isArray(rows) ? rows : [];
  const scopedRows = filterRowsByAviatProject(rows);
  updateInventorySummary(filterRowsByAviatProject(stockRowsCache));
  if (!Array.isArray(scopedRows) || scopedRows.length === 0) {
    renderExcelTable(inventoryMovementsList, {
      gridId: "movements",
      columns: MOVEMENT_COLUMNS,
      rows: [],
      emptyMessage: "Sin registros operativos aún"
    });
    return;
  }
  renderExcelTable(inventoryMovementsList, {
    gridId: "movements",
    columns: MOVEMENT_COLUMNS,
    rows: scopedRows,
    emptyMessage: "Sin registros operativos aún"
  });
  if (scopedRows.length >= 200) {
    inventoryMovementsList.insertAdjacentHTML(
      "beforeend",
      '<p class="filter-hint" style="margin:8px 0 0">Mostrando los últimos 200 movimientos. Usa Exportar movimientos CSV para ver más.</p>'
    );
  }
  if (moduleInbound && !moduleInbound.classList.contains("hidden")) void loadInboundList();
  if (moduleOutbound && !moduleOutbound.classList.contains("hidden")) void loadOutboundList();
}

function uniqueSortedStrings(values) {
  const set = new Set();
  for (const v of values) {
    if (v == null) continue;
    const s = String(v).trim();
    if (s) set.add(s);
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b, "es"));
}

function getKnownWarehouses() {
  const fromStock = stockRowsCache.map(
    (r) => r.warehouse || r.location?.warehouse || r.Location?.warehouse
  );
  const fromMov = movementsRowsCache.map((m) => m.warehouse || m.location?.warehouse);
  const fromProducts = productsCache.map((p) => p.defaultWarehouse || p.warehouse);
  return uniqueSortedStrings(["TULTITLAN24", ...fromStock, ...fromMov, ...fromProducts]);
}

function getKnownLocations() {
  const fromStock = stockRowsCache.map(
    (r) => r.location?.code || r.locationCode || r.location || r.Location?.code
  );
  const fromMov = movementsRowsCache.map((m) => m.location?.code || m.location || m.locationCode);
  return uniqueSortedStrings(fromStock.concat(fromMov));
}

function getKnownProjects() {
  return getCustomersForSelect();
}

function getKnownUsers() {
  return Array.isArray(assigneesCache) ? assigneesCache.slice() : [];
}

function getKnownStatuses() {
  return ["AVAILABLE", "OPERATIONS", "HOLD", "BLOCKED", "QUARANTINE"];
}

const SMART_OTHER = "__OTHER__";

function fillSmartSelect(selectId, values, { includeEmpty = true, emptyLabel = "— Seleccionar —", otherLabel = "Otro…", preferred = "" } = {}) {
  const sel = document.getElementById(selectId);
  if (!sel) return;
  const prev = sel.value;
  const opts = [];
  if (includeEmpty) opts.push(`<option value="">${escCell(emptyLabel)}</option>`);
  for (const v of values) {
    opts.push(`<option value="${escCell(v)}">${escCell(v)}</option>`);
  }
  opts.push(`<option value="${SMART_OTHER}">${escCell(otherLabel)}</option>`);
  sel.innerHTML = opts.join("");
  if (preferred && values.includes(preferred)) sel.value = preferred;
  else if (prev && (prev === SMART_OTHER || values.includes(prev))) sel.value = prev;
}

function wireSmartSelectPair(selectId, inputId, { otherLabel } = {}) {
  const sel = document.getElementById(selectId);
  const inp = document.getElementById(inputId);
  if (!sel || !inp || sel.dataset.smartWired === "1") return;
  sel.dataset.smartWired = "1";
  const sync = () => {
    if (sel.value === SMART_OTHER) {
      inp.classList.remove("hidden");
      if (!inp.value && otherLabel) inp.placeholder = otherLabel;
      inp.focus();
    } else if (sel.value) {
      inp.value = sel.value;
      inp.classList.add("hidden");
    } else {
      inp.value = "";
      inp.classList.add("hidden");
    }
  };
  sel.addEventListener("change", sync);
  sync();
}

function readSmartFieldValue(baseId) {
  const sel = document.getElementById(`${baseId}Select`);
  const inp = document.getElementById(baseId);
  if (sel) {
    if (sel.value === SMART_OTHER) return (inp?.value || "").trim();
    if (sel.value) return sel.value.trim();
  }
  return (inp?.value || "").trim();
}

function resolveProductBySkuOrCode(raw) {
  const q = String(raw || "").trim();
  if (!q) return null;
  const upper = q.toUpperCase();
  return (
    productsCache.find((p) => p.id === q) ||
    productsCache.find((p) => String(p.sku || "").toUpperCase() === upper) ||
    productsCache.find((p) => String(p.barcode || "").toUpperCase() === upper) ||
    null
  );
}

const PRODUCT_TYPEAHEAD_MIN_CHARS = 2;
const PRODUCT_TYPEAHEAD_MAX = 24;
/** @type {WeakMap<HTMLElement, { items: any[], active: number, timer: any }>} */
const productTypeaheadState = new WeakMap();

function stripInventorySearchNoise(value) {
  return String(value || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

/** Puntuación de coincidencia flexible (SKU con guiones/asteriscos, fragmento, texto). */
function inventorySearchMatchScore(haystack, query) {
  if (haystack == null || haystack === "" || !query) return 0;
  const h = String(haystack).toUpperCase().trim();
  const q = String(query).toUpperCase().trim();
  if (!h || !q) return 0;
  if (h === q) return 100;
  if (h.startsWith(q)) return 85;
  if (h.includes(q)) return 60;
  const hn = stripInventorySearchNoise(h);
  const qn = stripInventorySearchNoise(q);
  if (qn.length >= 2) {
    if (hn === qn) return 95;
    if (hn.startsWith(qn)) return 75;
    if (hn.includes(qn)) return 55;
  }
  return 0;
}

function matchesSkuFlexible(sku, query) {
  if (!query) return true;
  return inventorySearchMatchScore(sku, query) > 0;
}

async function searchSkuSuggestions(query, opts = {}) {
  const q = String(query || "").trim();
  if (q.length < PRODUCT_TYPEAHEAD_MIN_CHARS) return [];
  const response = await authenticatedFetch(
    `/api/catalog/products/search?q=${encodeURIComponent(q)}&limit=${encodeURIComponent(opts.max || PRODUCT_TYPEAHEAD_MAX)}`
  );
  if (!response?.ok) return [];
  const customerCode = String(opts.customerCode || "").trim().toUpperCase();
  const rows = await response.json().catch(() => []);
  return (Array.isArray(rows) ? rows : [])
    .filter((product) => !customerCode || String(product.customer?.code || "").toUpperCase() === customerCode)
    .map((product) => ({
      kind: "catalog",
      key: `catalog:${product.id}`,
      productId: product.id,
      sku: product.sku,
      barcode: product.barcode || "",
      productName: product.name || "",
      projectCode: product.customer?.code || "",
      projectName: product.customer?.name || product.customer?.code || "",
      clientName: product.customer?.client?.tradeName || product.customer?.client?.legalName || product.customer?.client?.name || "",
      warehouse: "",
      location: "",
      status: "",
      qty: null,
      inventoryId: "",
      product
    }));
}

async function loadSkuContext(productId) {
  const response = await authenticatedFetch(`/api/catalog/products/${encodeURIComponent(productId)}/context`);
  if (!response?.ok) return null;
  return response.json().catch(() => null);
}

function renderSkuContext(listEl, context) {
  if (!listEl || !context?.product) return;
  let panel = listEl.parentElement?.querySelector(".sku-context-summary");
  if (!panel) {
    panel = document.createElement("div");
    panel.className = "sku-context-summary operational-table-meta";
    listEl.insertAdjacentElement("afterend", panel);
  }
  const locations = Array.isArray(context.inventory?.locations) ? context.inventory.locations : [];
  const clientName = context.client?.tradeName || context.client?.legalName || context.client?.name || "—";
  const project = context.project ? `${context.project.name} (${context.project.code})` : "—";
  const locationSummary = !locations.length
    ? "Sin existencia / ubicación."
    : locations.length === 1
      ? "1 ubicación encontrada."
      : `${locations.length} ubicaciones: selecciona una antes de operar.`;
  const locationRows = locations
    .map(
      (row) =>
        `<li>${escCell(row.locationCode)} · Cantidad ${escCell(formatQty(row.qty))} · No reservada ${escCell(
          formatQty(row.unreservedQty)
        )} · ${escCell(formatInventoryStatus(row.status))}</li>`
    )
    .join("");
  panel.innerHTML = `<strong>${escCell(context.product.sku)} · ${escCell(context.product.name)}</strong>
    <div>${escCell(clientName)} · ${escCell(project)}</div>
    <div>Existencia total: ${escCell(formatQty(context.inventory?.totalQty || 0))} · No reservada: ${escCell(
      formatQty(context.inventory?.totalUnreservedQty || 0)
    )}</div>
    <div>${escCell(locationSummary)}</div>
    ${locationRows ? `<ul style="margin:4px 0 0;padding-left:18px">${locationRows}</ul>` : ""}`;
}

function setSelectValueFlexible(selectId, value, { allowCreate = false, labelFn = null } = {}) {
  const sel = document.getElementById(selectId);
  if (!sel || value == null || value === "") return false;
  const str = String(value);
  if ([...sel.options].some((o) => o.value === str)) {
    sel.value = str;
    return true;
  }
  const found = [...sel.options].find((o) => o.value && o.value.toUpperCase() === str.toUpperCase());
  if (found) {
    sel.value = found.value;
    return true;
  }
  if (allowCreate) {
    const opt = document.createElement("option");
    opt.value = str;
    opt.textContent = typeof labelFn === "function" ? labelFn(str) : str;
    sel.appendChild(opt);
    sel.value = str;
    return true;
  }
  return false;
}

function setSmartFieldValue(baseId, value) {
  if (value == null || value === "") return;
  const str = String(value);
  const sel = document.getElementById(`${baseId}Select`);
  const inp = document.getElementById(baseId);
  if (sel) {
    const match = [...sel.options].find((o) => o.value && o.value.toUpperCase() === str.toUpperCase());
    if (match) {
      sel.value = match.value;
      if (inp) {
        inp.value = match.value;
        inp.classList.add("hidden");
      }
      return;
    }
    if ([...sel.options].some((o) => o.value === SMART_OTHER)) {
      sel.value = SMART_OTHER;
      if (inp) {
        inp.value = str;
        inp.classList.remove("hidden");
      }
      return;
    }
  }
  if (inp) inp.value = str;
}

function hideProductTypeaheadList(listEl) {
  if (!listEl) return;
  listEl.classList.add("hidden");
  listEl.hidden = true;
  listEl.innerHTML = "";
}

function showProductTypeaheadList(listEl, items, activeIdx, onPick) {
  if (!listEl) return;
  if (!items.length) {
    listEl.innerHTML = `<div class="product-typeahead-empty">Sin coincidencias. Sigue escribiendo o usa el código completo.</div>`;
    listEl.classList.remove("hidden");
    listEl.hidden = false;
    return;
  }
  listEl.innerHTML = items
    .map((item, idx) => {
      const qtyPart =
        item.qty != null && item.qty !== ""
          ? ` · qty ${formatQty(item.qty)}`
          : item.kind === "catalog"
            ? " · catálogo"
            : "";
      const statusPart = item.status ? ` · ${formatInventoryStatus(item.status)}` : "";
      const locPart = item.location || "—";
      const whPart = item.warehouse || "—";
      const projectPart = item.projectName
        ? `${item.projectName}${item.projectCode ? ` (${item.projectCode})` : ""}`
        : item.projectCode || "—";
      return `<button type="button" class="product-typeahead-item" role="option" data-pta-idx="${idx}" aria-selected="${
        idx === activeIdx ? "true" : "false"
      }">
        <div class="pta-sku">${escCell(item.sku)}${item.barcode && item.barcode !== item.sku ? ` · ${escCell(item.barcode)}` : ""}</div>
        <div class="pta-name">${escCell(item.productName || "—")}</div>
        <div class="pta-meta">${escCell(projectPart)} · ${escCell(whPart)} · ${escCell(locPart)}${escCell(
        statusPart
      )}${escCell(qtyPart)}</div>
      </button>`;
    })
    .join("");
  listEl.classList.remove("hidden");
  listEl.hidden = false;
  listEl.querySelectorAll("[data-pta-idx]").forEach((btn) => {
    btn.addEventListener("mousedown", (ev) => {
      ev.preventDefault();
      const i = Number(btn.getAttribute("data-pta-idx"));
      if (items[i]) onPick(items[i]);
    });
  });
}

/**
 * Autocomplete visual de SKU/producto. Solo llena campos; no mueve inventario.
 * @param {{
 *  input: HTMLInputElement,
 *  listEl: HTMLElement,
 *  mode?: "catalog"|"stock"|"both",
 *  getCustomerCode?: () => string,
 *  onSelect: (item: any) => void,
 *  minChars?: number
 * }} cfg
 */
function wireProductTypeahead(cfg) {
  const input = cfg.input;
  const listEl = cfg.listEl;
  if (!input || !listEl || input.dataset.ptaWired === "1") return;
  input.dataset.ptaWired = "1";
  input.setAttribute("autocomplete", "off");
  const minChars = cfg.minChars ?? PRODUCT_TYPEAHEAD_MIN_CHARS;
  const state = { items: /** @type {any[]} */ ([]), active: -1, timer: null };
  productTypeaheadState.set(input, state);

  const close = () => {
    hideProductTypeaheadList(listEl);
    state.items = [];
    state.active = -1;
  };

  const pick = (item) => {
    close();
    void loadSkuContext(item.productId).then((context) => {
      if (context) renderSkuContext(listEl, context);
      cfg.onSelect({ ...item, context });
    });
  };

  const refresh = async () => {
    const q = input.value.trim();
    if (q.length < minChars) {
      close();
      return;
    }
    const customerCode = typeof cfg.getCustomerCode === "function" ? cfg.getCustomerCode() : "";
    const searchValue = q;
    state.items = await searchSkuSuggestions(q, {
      customerCode: customerCode || "",
      max: PRODUCT_TYPEAHEAD_MAX
    });
    if (input.value.trim() !== searchValue) return;
    state.active = state.items.length ? 0 : -1;
    showProductTypeaheadList(listEl, state.items, state.active, pick);
  };

  input.addEventListener("input", () => {
    if (state.timer) clearTimeout(state.timer);
    state.timer = setTimeout(refresh, 120);
  });
  input.addEventListener("focus", () => {
    if (input.value.trim().length >= minChars) refresh();
  });
  input.addEventListener("blur", () => {
    setTimeout(close, 160);
  });
  input.addEventListener("keydown", (ev) => {
    if (listEl.classList.contains("hidden") || !state.items.length) {
      if (ev.key === "Escape") close();
      return;
    }
    if (ev.key === "ArrowDown") {
      ev.preventDefault();
      state.active = Math.min(state.items.length - 1, state.active + 1);
      showProductTypeaheadList(listEl, state.items, state.active, pick);
    } else if (ev.key === "ArrowUp") {
      ev.preventDefault();
      state.active = Math.max(0, state.active - 1);
      showProductTypeaheadList(listEl, state.items, state.active, pick);
    } else if (ev.key === "Enter" && state.active >= 0 && state.items[state.active]) {
      ev.preventDefault();
      pick(state.items[state.active]);
    } else if (ev.key === "Escape") {
      ev.preventDefault();
      close();
    }
  });
}

function applyCatalogSuggestionToOps(prefix, item) {
  const skuEl = document.getElementById(`${prefix}Sku`);
  if (skuEl) {
    skuEl.value = item.sku || "";
    skuEl.dispatchEvent(new Event("change", { bubbles: true }));
  }
  const productEl = document.getElementById(`${prefix}Product`);
  if (productEl) productEl.value = item.productName || item.product?.name || "";
  if (item.projectCode) {
    setSelectValueFlexible(`${prefix}Customer`, item.projectCode);
    const cliente = document.getElementById(`${prefix}Cliente`);
    if (cliente) cliente.value = item.projectName || item.projectCode;
  }
}

function applyStockSuggestionToOps(prefix, item) {
  applyCatalogSuggestionToOps(prefix, item);
  populateSmartOperationalFields();
  if (item.warehouse) setSmartFieldValue(`${prefix}Warehouse`, item.warehouse);
  if (item.location) setSmartFieldValue(`${prefix}Location`, item.location);
  if (item.status) {
    setSelectValueFlexible(`${prefix}Status`, item.status, {
      allowCreate: true,
      labelFn: (code) => formatInventoryStatus(code)
    });
  }
}

function applyPickSuggestion(item) {
  const scan = document.getElementById("scanInput");
  if (scan) scan.value = item.sku || item.barcode || "";
  populatePickContextSelects();
  if (item.projectCode) setSelectValueFlexible("pickProject", item.projectCode);
  if (item.warehouse) setSelectValueFlexible("pickWarehouse", item.warehouse);
  if (item.location) {
    const locSel = document.getElementById("pickLocation");
    if (locSel) {
      if (![...locSel.options].some((o) => o.value === item.location)) {
        const opt = document.createElement("option");
        opt.value = item.location;
        opt.textContent = item.location;
        locSel.appendChild(opt);
      }
      locSel.value = item.location;
    }
  }
  if (item.status) setSelectValueFlexible("pickStatus", item.status);
  const box = document.getElementById("pickCandidates");
  if (box) {
    if (item.kind === "stock" && item.inventoryId) {
      box.dataset.inventoryId = item.inventoryId;
      if (item.stockRow || item.location) {
        renderPickCandidates([
          {
            inventoryId: item.inventoryId,
            projectCode: item.projectCode,
            location: item.location,
            status: item.status,
            qty: item.qty,
            warehouse: item.warehouse
          }
        ]);
      }
    } else {
      delete box.dataset.inventoryId;
      clearPickCandidates();
    }
  }
  if (typeof setScanResult === "function") {
    if (item.kind === "stock") {
      setScanResult(
        `Línea elegida en búsqueda: ${item.location || "—"} / ${formatInventoryStatus(item.status)} (qty ${formatQty(item.qty)}). Confirma el surtido para descontar.`,
        "ok"
      );
    } else {
      setScanResult(
        `Producto seleccionado: ${item.sku}. Si hay varias líneas de stock, elige ubicación/estatus antes de confirmar.`,
        "ok"
      );
    }
  }
}

function wireAllProductTypeaheads() {
  const invSku = document.getElementById("invFilterSku");
  const invList = document.getElementById("invFilterSkuSuggestions");
  if (invSku instanceof HTMLInputElement && invList) {
    wireProductTypeahead({
      input: invSku,
      listEl: invList,
      mode: "both",
      onSelect: (item) => {
        invSku.value = item.sku || "";
        const prod = document.getElementById("invFilterProducto");
        if (prod && item.productName) prod.value = item.productName;
        if (item.projectCode) {
          const code = document.getElementById("invFilterCustomer");
          if (code) code.value = item.projectCode;
        }
        if (item.projectName) {
          const name = document.getElementById("invFilterCliente");
          if (name) name.value = item.projectName;
        }
        if (item.location) {
          const loc = document.getElementById("invFilterUbicacion");
          if (loc) loc.value = item.location;
        }
        if (item.status) {
          const st = document.getElementById("invFilterStatus");
          if (st) st.value = formatInventoryStatus(item.status);
        }
        applyInventoryFilters();
      }
    });
  }

  const scan = document.getElementById("scanInput");
  const scanList = document.getElementById("scanSkuSuggestions");
  if (scan instanceof HTMLInputElement && scanList) {
    wireProductTypeahead({
      input: scan,
      listEl: scanList,
      mode: "both",
      onSelect: (item) => applyPickSuggestion(item)
    });
    if (scan.dataset.ptaClearLine !== "1") {
      scan.dataset.ptaClearLine = "1";
      scan.addEventListener("input", () => {
        const box = document.getElementById("pickCandidates");
        if (!box?.dataset?.inventoryId) return;
        delete box.dataset.inventoryId;
        clearPickCandidates();
      });
    }
  }

  const incidentSku = document.getElementById("incidentProductSku");
  if (incidentSku instanceof HTMLInputElement) {
    let incidentList = document.getElementById("incidentSkuSuggestions");
    if (!incidentList) {
      incidentList = document.createElement("div");
      incidentList.id = "incidentSkuSuggestions";
      incidentList.className = "product-typeahead-list hidden";
      incidentList.setAttribute("role", "listbox");
      incidentList.hidden = true;
      incidentSku.insertAdjacentElement("afterend", incidentList);
    }
    let incidentProductId = document.getElementById("incidentProductId");
    if (!incidentProductId) {
      incidentProductId = document.createElement("input");
      incidentProductId.id = "incidentProductId";
      incidentProductId.type = "hidden";
      incidentSku.insertAdjacentElement("afterend", incidentProductId);
    }
    wireProductTypeahead({
      input: incidentSku,
      listEl: incidentList,
      mode: "catalog",
      onSelect: (item) => {
        incidentSku.value = item.sku || "";
        incidentProductId.value = item.productId || "";
      }
    });
    if (incidentSku.dataset.skuContextClear !== "1") {
      incidentSku.dataset.skuContextClear = "1";
      incidentSku.addEventListener("input", () => {
        incidentProductId.value = "";
      });
    }
  }

  [
    ["inboundSku", "inboundSkuSuggestions", "inbound", "catalog"],
    ["outboundSku", "outboundSkuSuggestions", "outbound", "both"],
    ["reqSku", "reqSkuSuggestions", "req", "catalog"]
  ].forEach(([inputId, listId, prefix, mode]) => {
    const input = document.getElementById(inputId);
    const listEl = document.getElementById(listId);
    if (!(input instanceof HTMLInputElement) || !listEl) return;
    wireProductTypeahead({
      input,
      listEl,
      mode,
      getCustomerCode: () => document.getElementById(`${prefix}Customer`)?.value?.trim() || "",
      onSelect: (item) => {
        if (prefix === "outbound" && item.kind === "stock") {
          applyStockSuggestionToOps(prefix, item);
        } else {
          applyCatalogSuggestionToOps(prefix, item);
        }
      }
    });
  });
}

function wireReqLineSkuTypeahead(input) {
  if (!(input instanceof HTMLInputElement) || input.dataset.ptaWired === "1") return;
  const wrap = input.closest(".product-typeahead") || input.parentElement;
  let listEl = wrap?.querySelector(".product-typeahead-list");
  if (!listEl && wrap) {
    listEl = document.createElement("div");
    listEl.className = "product-typeahead-list hidden";
    listEl.setAttribute("role", "listbox");
    listEl.hidden = true;
    wrap.appendChild(listEl);
  }
  if (!listEl) return;
  wireProductTypeahead({
    input,
    listEl,
    mode: "catalog",
    getCustomerCode: () => document.getElementById("reqCustomer")?.value?.trim() || "",
    onSelect: (item) => {
      input.value = item.sku || "";
      if (item.projectCode) {
        setSelectValueFlexible("reqCustomer", item.projectCode);
        const cliente = document.getElementById("reqCliente");
        if (cliente) cliente.value = item.projectName || item.projectCode;
      }
    }
  });
}

function populateSmartOperationalFields() {
  const warehouses = getKnownWarehouses();
  const locations = getKnownLocations();
  const projects = getKnownProjects();

  const pairs = [
    ["inboundWarehouseSelect", "inboundWarehouse", warehouses, "TULTITLAN24", "Otro almacén"],
    ["inboundLocationSelect", "inboundLocation", locations, "", "Otra ubicación"],
    ["outboundWarehouseSelect", "outboundWarehouse", warehouses, "TULTITLAN24", "Otro almacén"],
    ["outboundLocationSelect", "outboundLocation", locations, "", "Otra ubicación"],
    ["incidentWarehouseSelect", "incidentWarehouse", warehouses, "", "Otro almacén"],
    ["incidentLocationSelect", "incidentLocation", locations, "", "Otra ubicación"],
    ["taskWarehouseSelect", "taskWarehouse", warehouses, "TULTITLAN24", "Otro almacén"],
    ["taskLocationSelect", "taskLocation", locations, "", "Otra ubicación"],
    ["relocateWarehouseSelect", "relocateWarehouse", warehouses, "TULTITLAN24", "Otro almacén"],
    ["relocateFromSelect", "relocateFrom", locations, "", "Otra ubicación origen"],
    ["relocateToSelect", "relocateTo", locations, "", "Otra ubicación destino"]
  ];

  for (const [selId, inpId, values, preferred, otherLabel] of pairs) {
    fillSmartSelect(selId, values, {
      preferred,
      otherLabel,
      emptyLabel: preferred ? "— Seleccionar —" : "— Seleccionar —"
    });
    wireSmartSelectPair(selId, inpId, { otherLabel });
    const sel = document.getElementById(selId);
    const inp = document.getElementById(inpId);
    if (sel && preferred && values.includes(preferred) && !sel.value) {
      sel.value = preferred;
      if (inp) {
        inp.value = preferred;
        inp.classList.add("hidden");
      }
    }
  }

  const taskProjectSelect = document.getElementById("taskProjectSelect");
  const taskProject = document.getElementById("taskProject");
  if (taskProjectSelect && taskProject) {
    const codes = projects.map((p) => p.code);
    const labels = projects.map((p) => `${p.name} (${p.code})`);
    const prev = taskProjectSelect.value;
    let html = '<option value="">— Seleccionar proyecto —</option>';
    projects.forEach((p, i) => {
      html += `<option value="${escCell(p.code)}">${escCell(labels[i])}</option>`;
    });
    if (currentRole === "ADMIN" || currentRole === "SUPERVISOR") {
      html += `<option value="${SMART_OTHER}">Agregar proyecto (manual)</option>`;
    } else {
      html += `<option value="${SMART_OTHER}">Otro proyecto</option>`;
    }
    taskProjectSelect.innerHTML = html;
    if (prev) taskProjectSelect.value = prev;
    wireSmartSelectPair("taskProjectSelect", "taskProject");
  }
}

function renderInfoList(listId, items, emptyMsg) {
  const el = document.getElementById(listId);
  if (!el) return;
  if (!items.length) {
    el.innerHTML = `<li>${escCell(emptyMsg)}</li>`;
    return;
  }
  el.innerHTML = items.map((t) => `<li>${escCell(t)}</li>`).join("");
}

function renderProjectsModule() {
  renderAviatProjectChips(document.getElementById("projectsViewChips"), { mode: "catalog" });
  const addBtn = document.getElementById("projectsAddBtn");
  const ccAdd = document.getElementById("ccAddProjectBtn");
  const canAdd = currentRole === "ADMIN" || currentRole === "SUPERVISOR";
  if (addBtn) addBtn.style.display = canAdd ? "" : "none";
  if (ccAdd) ccAdd.style.display = canAdd ? "" : "none";
}

function renderWarehousesModule() {
  renderInfoList(
    "warehousesKnownList",
    getKnownWarehouses(),
    "No hay almacenes detectados. Al capturar movimientos aparecerán aquí."
  );
}

function renderLocationsModule() {
  renderInfoList(
    "locationsKnownList",
    getKnownLocations(),
    "No hay ubicaciones detectadas todavía."
  );
}

function getCustomersForSelect() {
  const map = new Map();
  for (const p of productsCache) {
    const code = p.customer?.code;
    if (!code) continue;
    map.set(code, { code, name: p.customer?.name || code });
  }
  for (const c of clientsCache) {
    if (c.code) map.set(c.code, { code: c.code, name: c.name || c.code });
  }
  return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name, "es"));
}

function fillCustomerSelect(selectId, clienteInputId) {
  const sel = document.getElementById(selectId);
  if (!sel) return;
  const prev = sel.value;
  const customers = getCustomersForSelect();
  let html =
    '<option value="">— Seleccionar proyecto —</option>' +
    customers.map((c) => `<option value="${escCell(c.code)}">${escCell(c.name)} (${escCell(c.code)})</option>`).join("");
  if (currentRole === "ADMIN" || currentRole === "SUPERVISOR") {
    html += `<option value="${SMART_OTHER}">Agregar proyecto…</option>`;
  }
  sel.innerHTML = html;
  if (prev && prev !== SMART_OTHER) sel.value = prev;
  if (clienteInputId) {
    const inp = document.getElementById(clienteInputId);
    if (inp) {
      const match = customers.find((c) => c.code === sel.value);
      inp.value = match ? match.name : "";
    }
  }
  if (sel.dataset.projectOtherWired !== "1") {
    sel.dataset.projectOtherWired = "1";
    sel.addEventListener("change", () => {
      if (sel.value === SMART_OTHER) {
        activateModule("catalog");
        sel.value = "";
      }
    });
  }
}

function fillSkuSelect(selectId, customerCode, productInputId) {
  const sel = document.getElementById(selectId);
  if (!sel) return;
  // Inputs typeahead: no options list; only sync product name if SKU is exact match.
  if (sel.tagName !== "SELECT") {
    if (productInputId) {
      const inp = document.getElementById(productInputId);
      const raw = String(sel.value || "").trim();
      const prod = raw ? findProductBySku(raw) || resolveProductBySkuOrCode(raw) : null;
      if (inp) {
        if (prod && (!customerCode || prod.customer?.code === customerCode || !customerCode)) {
          inp.value = prod.name || "";
        } else if (!raw) {
          inp.value = "";
        }
      }
    }
    return;
  }
  const prev = sel.value;
  const list = productsCache.filter((p) => !customerCode || p.customer?.code === customerCode);
  sel.innerHTML =
    '<option value="">— Seleccionar SKU —</option>' +
    list.map((p) => `<option value="${escCell(p.sku)}">${escCell(p.sku)} — ${escCell(p.name || "")}</option>`).join("");
  if (prev && list.some((p) => p.sku === prev)) sel.value = prev;
  if (productInputId) {
    const inp = document.getElementById(productInputId);
    const prod = list.find((p) => p.sku === sel.value);
    if (inp) inp.value = prod?.name || "";
  }
}

function populateOperationalSelects() {
  fillCustomerSelect("inboundCustomer", "inboundCliente");
  fillCustomerSelect("outboundCustomer", "outboundCliente");
  fillCustomerSelect("reqCustomer", "reqCliente");
  fillSkuSelect("inboundSku", document.getElementById("inboundCustomer")?.value || "", "inboundProduct");
  fillSkuSelect("outboundSku", document.getElementById("outboundCustomer")?.value || "", "outboundProduct");
  fillSkuSelect("reqSku", document.getElementById("reqCustomer")?.value || "", null);
  populateSmartOperationalFields();
}

function setOpsMessage(elId, text, isOk) {
  const el = document.getElementById(elId);
  if (!el) return;
  el.textContent = text;
  el.classList.remove("ok", "error");
  if (text) el.classList.add(isOk ? "ok" : "error");
}

function findProductBySku(sku) {
  const q = String(sku || "").trim();
  if (!q) return null;
  const upper = q.toUpperCase();
  return (
    productsCache.find((p) => p.sku === q) ||
    productsCache.find((p) => String(p.sku || "").toUpperCase() === upper) ||
    null
  );
}

async function submitOperationalMovement(kind) {
  const prefix = kind === "in" ? "inbound" : "outbound";
  const btn = document.getElementById(`${prefix}SubmitBtn`);
  const msgId = `${prefix}Message`;
  setOpsMessage(msgId, "", true);

  const customerCode = document.getElementById(`${prefix}Customer`)?.value?.trim();
  const sku = document.getElementById(`${prefix}Sku`)?.value?.trim();
  const qty = Number(document.getElementById(`${prefix}Qty`)?.value);
  const warehouse =
    readSmartFieldValue(`${prefix}Warehouse`) ||
    document.getElementById(`${prefix}Warehouse`)?.value?.trim() ||
    "TULTITLAN24";
  const location =
    readSmartFieldValue(`${prefix}Location`) ||
    document.getElementById(`${prefix}Location`)?.value?.trim();
  const status = document.getElementById(`${prefix}Status`)?.value || "AVAILABLE";
  const referenceRaw = document.getElementById(`${prefix}Reference`)?.value?.trim();
  const notes = document.getElementById(`${prefix}Notes`)?.value?.trim();
  const lote = document.getElementById(`${prefix}Lote`)?.value?.trim();

  if (customerCode === SMART_OTHER) {
    setOpsMessage(msgId, "Seleccione un proyecto válido o créelo en catálogo.", false);
    return;
  }

  if (!customerCode) {
    setOpsMessage(msgId, "Seleccione un proyecto.", false);
    return;
  }
  if (!sku) {
    setOpsMessage(msgId, "Seleccione un SKU del catálogo.", false);
    return;
  }
  if (!location) {
    setOpsMessage(msgId, "Indique la ubicación.", false);
    return;
  }
  if (!Number.isFinite(qty) || qty <= 0) {
    setOpsMessage(msgId, "La cantidad debe ser mayor que 0.", false);
    return;
  }

  const product = findProductBySku(sku);
  if (!product) {
    setOpsMessage(msgId, "SKU inexistente en catálogo.", false);
    return;
  }
  if (customerCode && product.customer?.code !== customerCode) {
    setOpsMessage(msgId, "El SKU no pertenece al customer seleccionado.", false);
    return;
  }

  const reference = buildOpsReference(lote, referenceRaw, kind);

  if (btn) btn.disabled = true;
  try {
    const response = await authenticatedFetch("/api/inventory/movements", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sku,
        type: kind === "in" ? "IN" : "OUT",
        quantity: qty,
        warehouse,
        location,
        status,
        reference,
        notes: notes || undefined
      })
    });
    if (!response) return;
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      setOpsMessage(msgId, data.message || "No se pudo registrar la operación.", false);
      return;
    }
    setOpsMessage(msgId, kind === "in" ? "Entrada registrada correctamente." : "Salida registrada correctamente.", true);
    document.getElementById(`${prefix}Qty`).value = "";
    document.getElementById(`${prefix}Notes`).value = "";
    await loadStockStrip();
    await loadInventoryMovements();
    if (kind === "in") await loadInboundList();
    else await loadOutboundList();
  } catch (_e) {
    setOpsMessage(msgId, "Error de red.", false);
  } finally {
    if (btn) btn.disabled = false;
  }
}

/**
 * v40.1 — Reubicación segura: crea tarea operativa MOVE.
 * NO ejecuta OUT/IN ni altera stock (evita inconsistencia OUT-sin-IN).
 */
async function submitRelocate() {
  const msgId = "relocateMessage";
  const btn = document.getElementById("relocateSubmitBtn");
  setOpsMessage(msgId, "", true);
  const sku = document.getElementById("relocateSku")?.value?.trim();
  const qty = Number(document.getElementById("relocateQty")?.value);
  const warehouse = readSmartFieldValue("relocateWarehouse") || "";
  const fromLoc = readSmartFieldValue("relocateFrom");
  const toLoc = readSmartFieldValue("relocateTo");
  const stockStatus = document.getElementById("relocateStatus")?.value || "AVAILABLE";
  const referenceRaw = document.getElementById("relocateReference")?.value?.trim();
  const notesExtra = document.getElementById("relocateNotes")?.value?.trim();

  if (!sku) {
    setOpsMessage(msgId, "Indica el SKU.", false);
    return;
  }
  if (!warehouse) {
    setOpsMessage(msgId, "Indica el almacén.", false);
    return;
  }
  if (!fromLoc || !toLoc) {
    setOpsMessage(msgId, "Indica ubicación origen y destino.", false);
    return;
  }
  if (fromLoc.toUpperCase() === toLoc.toUpperCase()) {
    setOpsMessage(msgId, "Origen y destino deben ser distintos.", false);
    return;
  }
  if (!Number.isFinite(qty) || qty <= 0) {
    setOpsMessage(msgId, "La cantidad debe ser mayor que 0.", false);
    return;
  }

  const product = findProductBySku(sku) || resolveProductBySkuOrCode(sku);
  const resolvedSku = product?.sku || sku;
  const productName = product?.name || product?.productName || "";
  const reference = referenceRaw || `RELOC-${Date.now()}`;
  const descriptionParts = [
    `Mover producto de ubicación ${fromLoc} a ubicación ${toLoc}.`,
    notesExtra ? `Motivo: ${notesExtra}` : null,
    `Cantidad: ${qty}. Estatus de inventario objetivo: ${formatInventoryStatus(stockStatus)}.`,
    "Para proteger el inventario, la reubicación queda como tarea operativa pendiente de confirmación."
  ].filter(Boolean);

  const notesPayload = {
    title: "Solicitud de reubicación",
    description: descriptionParts.join(" "),
    taskLabel: "Movimiento interno / Reubicación",
    project: product?.customerCode || product?.customer?.code || product?.cliente || null,
    lote: product?.lote || product?.lot || null,
    sku: resolvedSku,
    product: productName || resolvedSku,
    warehouse,
    fromLocation: fromLoc,
    toLocation: toLoc,
    location: `${fromLoc} → ${toLoc}`,
    qty,
    stockStatus,
    followUp: [
      {
        text: "Solicitud de reubicación creada sin afectar inventario.",
        at: new Date().toISOString(),
        by: currentUserId || null
      }
    ]
  };

  if (btn) btn.disabled = true;
  try {
    const response = await authenticatedFetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "MOVE",
        status: "PENDING",
        warehouse,
        priority: 50,
        reference,
        notes: JSON.stringify(notesPayload)
      })
    });
    if (!response) {
      setOpsMessage(
        msgId,
        "No se pudo crear la solicitud. No se afectó inventario.",
        false
      );
      return;
    }
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      setOpsMessage(
        msgId,
        (data.message || "No se pudo crear la solicitud de reubicación.") +
          " No se afectó inventario.",
        false
      );
      return;
    }
    setOpsMessage(
      msgId,
      "Solicitud de reubicación creada. No se afectó inventario hasta su confirmación operativa.",
      true
    );
    const qtyEl = document.getElementById("relocateQty");
    if (qtyEl) qtyEl.value = "";
    const notesEl = document.getElementById("relocateNotes");
    if (notesEl) notesEl.value = "";
    const refEl = document.getElementById("relocateReference");
    if (refEl) refEl.value = "";
    if (typeof loadTasks === "function") {
      try {
        await loadTasks();
      } catch (_e) {
        /* cola de tareas no abierta: no bloquear */
      }
    }
  } catch (_e) {
    setOpsMessage(msgId, "Error de red. No se afectó inventario.", false);
  } finally {
    if (btn) btn.disabled = false;
  }
}

function renderMovementOpsTable(containerId, rows, gridId, emptyMsg) {
  const container = document.getElementById(containerId);
  if (!container) return;
  const cols = [
    ...OPS_MOVEMENT_COLUMNS,
    { label: "Estado", sortKey: () => "OK", render: () => statusBadge("COMPLETED") }
  ];
  renderExcelTable(container, {
    gridId,
    columns: cols,
    rows: rows.slice(0, 100),
    emptyMessage: emptyMsg || "Sin registros operativos aún"
  });
}

async function loadInboundList() {
  if (!movementsRowsCache.length) {
    const response = await authenticatedFetch("/api/inventory/movements?limit=500");
    if (response?.ok) {
      const rows = await response.json();
      movementsRowsCache = Array.isArray(rows) ? rows : [];
      movementsCountCache = movementsRowsCache.length;
    }
  }
  const inbound = filterRowsByAviatProject(
    movementsRowsCache.filter((m) => m.movementType === "IN" || m.type === "INBOUND")
  );
  const meta = document.getElementById("inboundTableMeta");
  if (meta) meta.textContent = `${inbound.length} entrada(s) registrada(s)`;
  renderMovementOpsTable("inboundList", inbound, "inbound", "Sin registros operativos aún");
}

async function loadOutboundList() {
  if (!movementsRowsCache.length) {
    const response = await authenticatedFetch("/api/inventory/movements?limit=500");
    if (response?.ok) {
      const rows = await response.json();
      movementsRowsCache = Array.isArray(rows) ? rows : [];
      movementsCountCache = movementsRowsCache.length;
    }
  }
  const outbound = filterRowsByAviatProject(
    movementsRowsCache.filter((m) => m.movementType === "OUT" && m.type !== "PICK")
  );
  const meta = document.getElementById("outboundTableMeta");
  if (meta) meta.textContent = `${outbound.length} salida(s) registrada(s)`;
  renderMovementOpsTable("outboundList", outbound, "outbound", "Sin registros operativos aún");
}

function parseRequisitionNotes(notes) {
  if (!notes) return null;
  try {
    return JSON.parse(notes);
  } catch (_e) {
    return null;
  }
}

function formatReqProducts(task) {
  const parsed = parseRequisitionNotes(task.notes);
  if (parsed?.sku) {
    const qty = parsed.qty != null ? formatQty(parsed.qty) : "—";
    return `${parsed.sku} × ${qty}`;
  }
  return task.notes ? String(task.notes).slice(0, 48) : "—";
}

function formatReqProyecto(task) {
  const parsed = parseRequisitionNotes(task.notes);
  if (parsed?.customerName) return parsed.customerName;
  if (parsed?.customerCode) return parsed.customerCode;
  return "—";
}

function formatReqCliente(task) {
  return formatReqProyecto(task);
}

async function loadRequisitionsList() {
  const container = document.getElementById("requisitionsList");
  if (!container) return;
  try {
    const response = await authenticatedFetch("/api/tasks");
    if (!response?.ok) {
      container.innerHTML = '<div class="data-grid-empty" style="padding:16px">No se pudieron cargar requisiciones.</div>';
      return;
    }
    const rows = filterRowsByAviatProject((await response.json()).filter((t) => t.type === "PICK"));
    const meta = document.getElementById("reqTableMeta");
    if (meta) meta.textContent = `${rows.length} requisición(es)`;
    if (!rows.length) {
      renderExcelTable(container, {
        gridId: "requisitions",
        columns: REQ_COLUMNS,
        rows: [],
        emptyMessage: "Sin registros operativos aún"
      });
      return;
    }
    renderExcelTable(container, {
      gridId: "requisitions",
      columns: REQ_COLUMNS,
      rows,
      emptyMessage: "Sin registros operativos aún"
    });
  } catch (_e) {
    container.innerHTML = '<div class="data-grid-empty" style="padding:16px">Error de red.</div>';
  }
}

async function submitRequisition() {
  const btn = document.getElementById("reqSubmitBtn");
  setOpsMessage("reqMessage", "", true);
  const reference = document.getElementById("reqReference")?.value?.trim();
  const customerCode = document.getElementById("reqCustomer")?.value?.trim();
  const customerName = document.getElementById("reqCliente")?.value?.trim();
  const warehouse = document.getElementById("reqWarehouse")?.value?.trim() || "TULTITLAN24";
  const extraNotes = document.getElementById("reqNotes")?.value?.trim();
  const priority = Number(document.getElementById("reqPriority")?.value || 0);

  if (!reference) {
    setOpsMessage("reqMessage", "Indique folio o referencia.", false);
    return;
  }
  if (!customerCode) {
    setOpsMessage("reqMessage", "Seleccione un proyecto.", false);
    return;
  }

  /** @type {{ sku: string, qty: number, lote: string }[]} */
  let lines = [];
  if (reqOrderMode === "bulk") {
    const lineNodes = document.querySelectorAll("#reqBulkLines .req-bulk-line");
    lineNodes.forEach((node) => {
      const sku = node.querySelector("[data-req-line-sku]")?.value?.trim();
      const qty = Number(node.querySelector("[data-req-line-qty]")?.value);
      const lote = node.querySelector("[data-req-line-lote]")?.value?.trim() || "";
      if (sku) lines.push({ sku, qty, lote });
    });
    if (!lines.length) {
      setOpsMessage("reqMessage", "Agrega al menos una línea con SKU.", false);
      return;
    }
    for (const line of lines) {
      if (!findProductBySku(line.sku) && !resolveProductBySkuOrCode(line.sku)) {
        setOpsMessage("reqMessage", `SKU inexistente en catálogo: ${line.sku}`, false);
        return;
      }
      if (!Number.isFinite(line.qty) || line.qty <= 0) {
        setOpsMessage("reqMessage", `Cantidad inválida en línea SKU ${line.sku}.`, false);
        return;
      }
    }
  } else {
    const sku = document.getElementById("reqSku")?.value?.trim();
    const qty = Number(document.getElementById("reqQty")?.value);
    const lote = document.getElementById("reqLote")?.value?.trim() || "";
    if (sku && !findProductBySku(sku) && !resolveProductBySkuOrCode(sku)) {
      setOpsMessage("reqMessage", "SKU inexistente en catálogo.", false);
      return;
    }
    if (sku && (!Number.isFinite(qty) || qty <= 0)) {
      setOpsMessage("reqMessage", "Cantidad solicitada debe ser mayor que 0.", false);
      return;
    }
    lines = [{ sku: sku || "", qty: Number.isFinite(qty) ? qty : null, lote }];
  }

  if (btn) btn.disabled = true;
  try {
    let created = 0;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNumber = i + 1;
      const notesPayload = {
        orderMode: reqOrderMode === "bulk" ? "bulk" : "simple",
        orderFolio: reference,
        lineNumber: reqOrderMode === "bulk" ? lineNumber : 1,
        customerCode: customerCode || null,
        customerName: customerName || null,
        lote: line.lote || null,
        sku: line.sku || null,
        qty: line.qty,
        detail: extraNotes || null,
        taskLabel: "Orden de surtido"
      };
      const response = await authenticatedFetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "PICK",
          status: "PENDING",
          warehouse,
          priority: Number.isFinite(priority) ? priority : 50,
          reference,
          notes: JSON.stringify(notesPayload)
        })
      });
      if (!response) {
        setOpsMessage(
          "reqMessage",
          created
            ? `Se crearon ${created} línea(s); falló la siguiente. Stock no se afecta.`
            : "No se pudo crear la orden.",
          false
        );
        return;
      }
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setOpsMessage(
          "reqMessage",
          (data.message || "No se pudo crear la orden.") +
            (created ? ` (${created} línea(s) ya creadas).` : ""),
          false
        );
        return;
      }
      created += 1;
    }
    setOpsMessage(
      "reqMessage",
      reqOrderMode === "bulk"
        ? `Orden por volumen creada: ${created} tarea(s) de surtido bajo folio ${reference}. No descuenta inventario hasta Picking o Salida.`
        : "Orden de surtido registrada. No descuenta inventario: confirma el surtido en Picking o la salida en Despacho.",
      true
    );
    document.getElementById("reqReference").value = "";
    document.getElementById("reqQty") && (document.getElementById("reqQty").value = "");
    document.getElementById("reqNotes") && (document.getElementById("reqNotes").value = "");
    document.getElementById("reqLote") && (document.getElementById("reqLote").value = "");
    if (reqOrderMode === "bulk") renderReqBulkLines(1);
    await loadRequisitionsList();
    await loadTasks();
  } catch (_e) {
    setOpsMessage("reqMessage", "Error de red.", false);
  } finally {
    if (btn) btn.disabled = false;
  }
}

function renderReqBulkLines(count = 1) {
  const wrap = document.getElementById("reqBulkLines");
  if (!wrap) return;
  wrap.innerHTML = "";
  const n = Math.max(1, Number(count) || 1);
  for (let i = 0; i < n; i++) appendReqBulkLine();
}

function getReqSkuOptionsHtml() {
  const options = Array.from(document.getElementById("reqSku")?.options || []);
  if (!options.length) return '<option value="">— Seleccionar —</option>';
  return options
    .map((o) => `<option value="${escCell(o.value)}">${escCell(o.textContent || o.value)}</option>`)
    .join("");
}

function appendReqBulkLine() {
  const wrap = document.getElementById("reqBulkLines");
  if (!wrap) return;
  const line = document.createElement("div");
  line.className = "req-bulk-line";
  line.innerHTML = `
      <div class="field" style="margin:0">
        <label>SKU / Código</label>
        <div class="product-typeahead">
          <input data-req-line-sku type="text" autocomplete="off" spellcheck="false" placeholder="Buscar SKU, barras o nombre…" />
        </div>
      </div>
      <div class="field" style="margin:0">
        <label>Cantidad</label>
        <input data-req-line-qty type="number" step="0.0001" min="0.0001" />
      </div>
      <div class="field" style="margin:0">
        <label>Lote</label>
        <input data-req-line-lote type="text" placeholder="Opcional" />
      </div>
      <button type="button" class="btn-secondary btn-compact" data-req-remove-line>Quitar</button>`;
  line.querySelector("[data-req-remove-line]")?.addEventListener("click", () => {
    if (wrap.querySelectorAll(".req-bulk-line").length > 1) line.remove();
  });
  const skuInput = line.querySelector("[data-req-line-sku]");
  if (skuInput instanceof HTMLInputElement) wireReqLineSkuTypeahead(skuInput);
  wrap.appendChild(line);
}

function setReqOrderMode(mode) {
  reqOrderMode = mode === "bulk" ? "bulk" : "simple";
  const simple = document.getElementById("reqSimpleFields");
  const bulk = document.getElementById("reqBulkFields");
  if (simple) simple.classList.toggle("hidden", reqOrderMode === "bulk");
  if (bulk) bulk.classList.toggle("hidden", reqOrderMode !== "bulk");
  document.querySelectorAll("#reqModeTabs [data-req-mode]").forEach((btn) => {
    btn.classList.toggle("active", btn.getAttribute("data-req-mode") === reqOrderMode);
  });
  if (reqOrderMode === "bulk") {
    const wrap = document.getElementById("reqBulkLines");
    if (wrap && !wrap.querySelector(".req-bulk-line")) renderReqBulkLines(1);
  }
}

function wireRequisitionModes() {
  const tabs = document.getElementById("reqModeTabs");
  if (tabs && tabs.dataset.wired !== "1") {
    tabs.dataset.wired = "1";
    tabs.addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      const mode = target.getAttribute("data-req-mode");
      if (!mode) return;
      setReqOrderMode(mode);
    });
  }
  const addBtn = document.getElementById("reqAddLineBtn");
  if (addBtn && addBtn.dataset.wired !== "1") {
    addBtn.dataset.wired = "1";
    addBtn.addEventListener("click", () => appendReqBulkLine());
  }
  setReqOrderMode(reqOrderMode);
}

function wireOperationalForms() {
  [
    ["inboundCustomer", "inboundSku", "inboundProduct", "inboundCliente"],
    ["outboundCustomer", "outboundSku", "outboundProduct", "outboundCliente"],
    ["reqCustomer", "reqSku", null, "reqCliente"]
  ].forEach(([custId, skuId, prodId, clienteId]) => {
    const cust = document.getElementById(custId);
    if (cust && cust.dataset.opsWired !== "1") {
      cust.dataset.opsWired = "1";
      cust.addEventListener("change", () => {
        fillSkuSelect(skuId, cust.value, prodId);
        if (clienteId) {
          const customers = getCustomersForSelect();
          const match = customers.find((c) => c.code === cust.value);
          const inp = document.getElementById(clienteId);
          if (inp) inp.value = match?.name || "";
        }
      });
    }
    const sku = document.getElementById(skuId);
    if (sku && sku.dataset.opsWired !== "1") {
      sku.dataset.opsWired = "1";
      const syncProductName = () => {
        if (!prodId) return;
        const prod =
          findProductBySku(sku.value) || resolveProductBySkuOrCode(String(sku.value || "").trim());
        const inp = document.getElementById(prodId);
        if (inp) inp.value = prod?.name || "";
      };
      sku.addEventListener("change", syncProductName);
      sku.addEventListener("blur", syncProductName);
    }
  });

  const inBtn = document.getElementById("inboundSubmitBtn");
  if (inBtn && inBtn.dataset.opsWired !== "1") {
    inBtn.dataset.opsWired = "1";
    inBtn.addEventListener("click", () => void submitOperationalMovement("in"));
  }
  const outBtn = document.getElementById("outboundSubmitBtn");
  if (outBtn && outBtn.dataset.opsWired !== "1") {
    outBtn.dataset.opsWired = "1";
    outBtn.addEventListener("click", () => void submitOperationalMovement("out"));
  }
  const reqBtn = document.getElementById("reqSubmitBtn");
  if (reqBtn && reqBtn.dataset.opsWired !== "1") {
    reqBtn.dataset.opsWired = "1";
    reqBtn.addEventListener("click", () => void submitRequisition());
  }
  const exportStockFilteredBtn = document.getElementById("exportStockFilteredBtn");
  if (exportStockFilteredBtn && exportStockFilteredBtn.dataset.opsWired !== "1") {
    exportStockFilteredBtn.dataset.opsWired = "1";
    exportStockFilteredBtn.addEventListener("click", () => void exportStockCsvFiltered());
  }
  const exportProductsFilteredBtn = document.getElementById("exportProductsFilteredBtn");
  if (exportProductsFilteredBtn && exportProductsFilteredBtn.dataset.opsWired !== "1") {
    exportProductsFilteredBtn.dataset.opsWired = "1";
    exportProductsFilteredBtn.addEventListener("click", () => void exportProductsCsvFiltered());
  }

  wireAllProductTypeaheads();
}

async function submitMovement(event) {
  event.preventDefault();
  movementError.textContent = "";
  movementBtn.disabled = true;
  const payload = {
    sku: moveSku.value.trim(),
    warehouse: moveWarehouse.value.trim() || "TULTITLAN24",
    type: moveType.value,
    quantity: Number(moveQty.value),
    reference: moveRef.value.trim() || undefined,
    notes: moveNotes.value.trim() || undefined,
    location: document.getElementById("moveLocation")?.value?.trim() || undefined,
    status: document.getElementById("moveStatus")?.value || "AVAILABLE"
  };
  try {
    const response = await authenticatedFetch("/api/inventory/movements", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    if (!response) return;
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      movementError.textContent = data.message || "No se pudo registrar el movimiento.";
      return;
    }
    movementForm.reset();
    moveWarehouse.value = "TULTITLAN24";
    await loadStockStrip();
    await loadInventoryMovements();
  } catch (_e) {
    movementError.textContent = "Error de red.";
  } finally {
    movementBtn.disabled = false;
  }
}

async function runImport() {
  if (importResult) {
    importResult.textContent = "";
    importResult.classList.remove("import-processing", "error");
  }
  const csv = importCsv.value.trim();
  if (!csv) {
    if (importResult) importResult.textContent = "Pega el contenido CSV.";
    return;
  }

  setButtonLoading(importBtn, true, "Procesando inventario...", "Cargar inventario");
  setImportProcessingMessage(
    importResult,
    "Procesando inventario, no cierres esta pantalla. Puede tardar unos segundos.",
    true
  );

  try {
    const reconcileFullInventory = reconcileFullInventoryChk?.checked === true;
    const response = await authenticatedFetch("/api/inventory/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ csv, reconcileFullInventory })
    });
    if (!response) {
      if (importResult) importResult.textContent = "Sesión expirada. Vuelve a iniciar sesión.";
      return;
    }
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      if (importResult) {
        importResult.classList.remove("import-processing");
        renderOperationalMessage(importResult, {
          short: data.message || "Error al cargar inventario. Revisa el CSV e intenta de nuevo.",
          details: Array.isArray(data.errors)
            ? data.errors.map((e) => `${e.sku}: ${e.message}`).join("\n")
            : data.message || "",
          isError: true
        });
      }
      return;
    }
    const errLines = Array.isArray(data.errors)
      ? data.errors.map((e) => `${e.sku}: ${e.message}`)
      : [];
    const received = data.receivedRows ?? data.applied ?? 0;
    const created = data.created ?? 0;
    const updated = data.updated ?? 0;
    const unchanged = data.unchanged ?? 0;
    const zeroed = data.zeroed ?? 0;
    const omitted = data.omitted ?? data.skipped ?? 0;
    if (importResult) {
      importResult.classList.remove("import-processing");
      const short = `Inventario procesado: ${received} recibidos, ${created} creados, ${updated} actualizados, ${unchanged} sin cambios, ${zeroed} a cero, ${omitted} omitidos.${errLines.length ? ` ${errLines.length} detalle(s).` : ""}`;
      renderOperationalMessage(importResult, {
        short,
        details: errLines.length
          ? errLines.join("\n")
          : `Recibidos: ${received}\nCreados: ${created}\nActualizados: ${updated}\nSin cambios: ${unchanged}\nAjustados a cero: ${zeroed}\nOmitidos: ${omitted}`,
        downloadRows: errLines.length ? errLines.map((detail) => ({ detail })) : null,
        downloadName: "logitec_inventario_detalle"
      });
      if (errLines.length) pendingConflictsCache = errLines.length;
    }
    importCsv.value = "";
    if (reconcileFullInventoryChk) reconcileFullInventoryChk.checked = false;
    await loadStockStrip();
    await loadInventoryMovements();
  } catch (_e) {
    if (importResult) {
      importResult.classList.remove("import-processing");
      importResult.textContent = "Error de red al cargar inventario. Verifica conexión e intenta de nuevo.";
    }
  } finally {
    setButtonLoading(importBtn, false, "Procesando inventario...", "Cargar inventario");
  }
}

async function loadCatalogData() {
  await loadProductsRows();
  const clientsResponse = await authenticatedFetch("/api/catalog/clients");
  clientsCache = clientsResponse?.ok ? await clientsResponse.json() : [];
  if (!Array.isArray(clientsCache)) clientsCache = [];
  if (clientsList) clientsList.innerHTML = "";
  renderClientsModule();
  populateOperationalSelects();
  renderAviatProjectChips(document.getElementById("ccAviatProjectChips"));
  updateAviatHeaderUi();
}

async function deleteCustomerById(customerId) {
  if (!customerId) return;
  if (!window.confirm("¿Eliminar este cliente? Solo funciona si no tiene productos ligados.")) return;
  const response = await authenticatedFetch(`/api/catalog/customers/${encodeURIComponent(customerId)}`, {
    method: "DELETE"
  });
  if (!response) return;
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    window.alert(data.message || "No se pudo eliminar cliente.");
    return;
  }
  await loadCatalogData();
}

function applyRoleNavigation(role) {
  const allowed = roleModules[role] || [];
  moduleButtons.forEach((btn) => {
    const enabled = allowed.includes(btn.dataset.module);
    btn.disabled = !enabled;
    btn.style.display = enabled ? "flex" : "none";
  });

  let firstVisibleSection = null;
  document.querySelectorAll(".nav-section-panel").forEach((panel) => {
    const anyVisible = Array.from(panel.querySelectorAll(".module-btn")).some(
      (btn) => btn.style.display !== "none" && !btn.disabled
    );
    panel.dataset.roleHidden = anyVisible ? "0" : "1";
    const sectionId = panel.getAttribute("data-nav-section-panel");
    if (anyVisible && !firstVisibleSection) firstVisibleSection = sectionId;
    const tab = document.querySelector(`.nav-section-tab[data-nav-section="${sectionId}"]`);
    if (tab) tab.style.display = anyVisible ? "" : "none";
    if (!anyVisible) {
      panel.classList.remove("active");
      panel.style.display = "none";
    }
  });

  // Backward-compat for any remaining .nav-group wrappers
  document.querySelectorAll(".nav-group").forEach((group) => {
    if (group.classList.contains("nav-section-panel")) return;
    const anyVisible = Array.from(group.querySelectorAll(".module-btn")).some(
      (btn) => btn.style.display !== "none" && !btn.disabled
    );
    group.style.display = anyVisible ? "" : "none";
  });

  const activePanel = document.querySelector(".nav-section-panel.active");
  const activeVisible =
    activePanel &&
    activePanel.dataset.roleHidden !== "1" &&
    Array.from(activePanel.querySelectorAll(".module-btn")).some(
      (btn) => btn.style.display !== "none" && !btn.disabled
    );
  // Solo sincroniza tabs/tarjetas; el landing de módulo lo hace validateSession → navigateTo.
  if (activeVisible) {
    setNavSection(activePanel.getAttribute("data-nav-section-panel"));
  } else if (firstVisibleSection) {
    setNavSection(firstVisibleSection);
  }

  const tabAll = document.getElementById("taskTabAll");
  if (tabAll) {
    const showAll = role === "ADMIN" || role === "SUPERVISOR";
    tabAll.style.display = showAll ? "" : "none";
    if (!showAll && taskActiveTab === "all") {
      taskActiveTab = "mine";
      document.querySelectorAll(".tasks-tab").forEach((btn) => {
        btn.classList.toggle("active", btn.getAttribute("data-task-tab") === "mine");
      });
    }
  }
  const filterAssigneeWrap = document.getElementById("taskFilterAssigneeWrap");
  if (filterAssigneeWrap) {
    filterAssigneeWrap.style.display = role === "ADMIN" || role === "SUPERVISOR" ? "" : "none";
  }
  const assigneeField = document.getElementById("taskAssigneeField");
  if (assigneeField) {
    assigneeField.style.display = role === "ADMIN" || role === "SUPERVISOR" ? "" : "none";
  }

  createProductForm.classList.toggle("hidden", role !== "ADMIN");
  createCustomerForm.classList.toggle("hidden", role !== "ADMIN");
  if (importSection) importSection.classList.remove("hidden");
  if (catalogImportSection) catalogImportSection.classList.remove("hidden");
  movementForm.classList.toggle("hidden", role !== "ADMIN");
  const openCatBtn = document.getElementById("openCatalogImportBtn");
  const openInvBtn = document.getElementById("openInventoryImportBtn");
  if (openCatBtn) openCatBtn.style.display = role === "ADMIN" ? "inline-block" : "none";
  if (openInvBtn) openInvBtn.style.display = role === "ADMIN" ? "inline-block" : "none";
  if (taskCreateWrap) {
    taskCreateWrap.classList.toggle("hidden", role !== "ADMIN" && role !== "SUPERVISOR" && role !== "OPERATOR");
  }
  const reqPanel = document.getElementById("reqSubmitBtn");
  if (reqPanel) reqPanel.style.display = role === "CLIENT" ? "none" : "inline-block";
  const inBtn = document.getElementById("inboundSubmitBtn");
  const outBtn = document.getElementById("outboundSubmitBtn");
  const canOperate = role === "ADMIN" || role === "SUPERVISOR" || role === "OPERATOR";
  if (inBtn) inBtn.style.display = canOperate ? "inline-block" : "none";
  if (outBtn) outBtn.style.display = canOperate ? "inline-block" : "none";
  const canExportInventory = role === "ADMIN" || role === "OPERATOR" || role === "SUPERVISOR";
  const canExportTrace = canExportInventory;
  const canExportProducts = role === "ADMIN" || role === "CLIENT";
  if (exportStockBtn) exportStockBtn.style.display = canExportInventory ? "inline-block" : "none";
  if (exportMovementsBtn) exportMovementsBtn.style.display = canExportInventory ? "inline-block" : "none";
  if (exportTraceBtn) exportTraceBtn.style.display = canExportTrace ? "inline-block" : "none";
  if (exportProductsBtn) exportProductsBtn.style.display = canExportProducts ? "inline-block" : "none";

  const canAddProject = role === "ADMIN" || role === "SUPERVISOR";
  const projectsAddBtn = document.getElementById("projectsAddBtn");
  const ccAddProjectBtn = document.getElementById("ccAddProjectBtn");
  if (projectsAddBtn) projectsAddBtn.style.display = canAddProject ? "" : "none";
  if (ccAddProjectBtn) ccAddProjectBtn.style.display = canAddProject ? "" : "none";
  const configUsersBtn = document.getElementById("configUsersBtn");
  if (configUsersBtn) configUsersBtn.style.display = role === "ADMIN" ? "" : "none";
  const rStock = document.getElementById("reportsExportStock");
  const rStockF = document.getElementById("reportsExportStockFiltered");
  const rMov = document.getElementById("reportsExportMovements");
  const rProd = document.getElementById("reportsExportProducts");
  const rProdF = document.getElementById("reportsExportProductsFiltered");
  const rTrace = document.getElementById("reportsExportTrace");
  if (rStock) rStock.style.display = canExportInventory ? "inline-block" : "none";
  if (rStockF) rStockF.style.display = canExportInventory ? "inline-block" : "none";
  if (rMov) rMov.style.display = canExportInventory ? "inline-block" : "none";
  if (rProd) rProd.style.display = canExportProducts ? "inline-block" : "none";
  if (rProdF) rProdF.style.display = canExportProducts ? "inline-block" : "none";
  if (rTrace) rTrace.style.display = canExportTrace ? "inline-block" : "none";
  const exportStockFilteredBtn = document.getElementById("exportStockFilteredBtn");
  const exportProductsFilteredBtn = document.getElementById("exportProductsFilteredBtn");
  if (exportStockFilteredBtn) exportStockFilteredBtn.style.display = canExportInventory ? "inline-block" : "none";
  if (exportProductsFilteredBtn) exportProductsFilteredBtn.style.display = canExportProducts ? "inline-block" : "none";
  if (demoAdminZone) demoAdminZone.classList.toggle("hidden", role !== "ADMIN");
  if (role !== "ADMIN") closeDemoResetPanel();
}

function openDemoResetPanel() {
  if (!demoResetPanel) return;
  demoResetPanel.classList.remove("hidden");
  if (demoResetConfirmInput) demoResetConfirmInput.value = "";
  if (demoResetStatus) demoResetStatus.textContent = "";
}

function closeDemoResetPanel() {
  if (!demoResetPanel) return;
  demoResetPanel.classList.add("hidden");
  if (demoResetConfirmInput) demoResetConfirmInput.value = "";
  if (demoResetStatus) demoResetStatus.textContent = "";
}

async function refreshDemoModules() {
  await Promise.all([
    loadCatalogData(),
    loadStockStrip(),
    loadInventoryMovements(),
    loadTraceability(),
    loadScanEvents()
  ]);
}

async function runDemoReset() {
  const typed = demoResetConfirmInput?.value?.trim() || "";
  if (typed !== DEMO_RESET_CONFIRM_TEXT) {
    if (demoResetStatus) demoResetStatus.textContent = "Confirmación incorrecta. Escribe exactamente REINICIAR LOGITEC.";
    return;
  }

  if (demoResetStatus) demoResetStatus.textContent = "Reiniciando datos operativos...";
  if (demoResetExecuteBtn) demoResetExecuteBtn.disabled = true;
  if (demoResetCancelBtn) demoResetCancelBtn.disabled = true;

  try {
    const response = await authenticatedFetch("/api/admin/demo-reset", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirmation: DEMO_RESET_CONFIRM_TEXT })
    });
    if (!response) {
      if (demoResetStatus) demoResetStatus.textContent = "Sesión expirada. Vuelve a iniciar sesión.";
      return;
    }
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      if (demoResetStatus) demoResetStatus.textContent = data.message || "No se pudo reiniciar los datos operativos.";
      return;
    }
    if (demoResetStatus) demoResetStatus.textContent = data.message || "Datos operativos reiniciados.";
    closeDemoResetPanel();
    await refreshDemoModules();
  } catch (_error) {
    if (demoResetStatus) demoResetStatus.textContent = "Error de red al reiniciar datos operativos.";
  } finally {
    if (demoResetExecuteBtn) demoResetExecuteBtn.disabled = false;
    if (demoResetCancelBtn) demoResetCancelBtn.disabled = false;
  }
}

async function createUser(event) {
  event.preventDefault();
  createUserError.textContent = "";
  createUserBtn.disabled = true;

  const payload = {
    fullName: newFullName.value.trim(),
    email: newEmail.value.trim(),
    password: newPassword.value,
    role: newRole.value
  };

  if (!payload.fullName || !payload.email || !payload.password || !payload.role) {
    createUserError.textContent = "Completa todos los campos.";
    createUserBtn.disabled = false;
    return;
  }

  try {
    const response = await authenticatedFetch("/api/users", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    if (!response) return;
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      createUserError.textContent = data.message || "No se pudo crear el usuario.";
      return;
    }

    createUserForm.reset();
    await loadUsersModule("ADMIN");
  } catch (_error) {
    createUserError.textContent = "Error de red creando usuario.";
  } finally {
    createUserBtn.disabled = false;
  }
}

async function changePassword(event) {
  event.preventDefault();
  changePasswordError.textContent = "";
  changePasswordBtn.disabled = true;

  const payload = {
    currentPassword: currentPassword.value,
    newPassword: newAccountPassword.value
  };

  if (!payload.currentPassword || !payload.newPassword) {
    changePasswordError.textContent = "Completa ambos campos.";
    changePasswordBtn.disabled = false;
    return;
  }

  if (payload.currentPassword === payload.newPassword) {
    changePasswordError.textContent = "La nueva contrasena debe ser diferente.";
    changePasswordBtn.disabled = false;
    return;
  }

  try {
    const response = await authenticatedFetch("/api/auth/change-password", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    if (!response) return;
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      changePasswordError.textContent = data.message || "No se pudo actualizar la contrasena.";
      return;
    }

    changePasswordForm.reset();
    changePasswordError.textContent = "Contrasena actualizada correctamente.";
  } catch (_error) {
    changePasswordError.textContent = "Error de red actualizando contrasena.";
  } finally {
    changePasswordBtn.disabled = false;
  }
}

async function createProduct(event) {
  event.preventDefault();
  createProductError.textContent = "";
  createProductBtn.disabled = true;

  const payload = {
    customerCode: productCustomerCode.value.trim() || undefined,
    sku: productSku.value.trim(),
    barcode: productBarcode.value.trim() || undefined,
    name: productName.value.trim(),
    warehouse: productWarehouse.value.trim() || "TULTITLAN24"
  };

  if (!payload.sku || !payload.name) {
    createProductError.textContent = "SKU y nombre son obligatorios.";
    createProductBtn.disabled = false;
    return;
  }

  try {
    const response = await authenticatedFetch("/api/catalog/products", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    if (!response) return;
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      createProductError.textContent = data.message || "No se pudo crear el producto.";
      return;
    }

    createProductForm.reset();
    productCustomerCode.value = "";
    productWarehouse.value = "TULTITLAN24";
    await loadCatalogData();
  } catch (_error) {
    createProductError.textContent = "Error de red creando producto.";
  } finally {
    createProductBtn.disabled = false;
  }
}

async function createCustomer(event) {
  event.preventDefault();
  createCustomerError.textContent = "";
  createCustomerBtn.disabled = true;

  const payload = {
    code: customerCode.value.trim(),
    name: customerName.value.trim()
  };

  if (!payload.code || !payload.name) {
    createCustomerError.textContent = "Codigo y nombre son obligatorios.";
    createCustomerBtn.disabled = false;
    return;
  }

  try {
    const response = await authenticatedFetch("/api/catalog/customers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    if (!response) return;
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      createCustomerError.textContent = data.message || "No se pudo crear cliente.";
      return;
    }
    createCustomerForm.reset();
    await loadCatalogData();
  } catch (_error) {
    createCustomerError.textContent = "Error de red creando cliente.";
  } finally {
    createCustomerBtn.disabled = false;
  }
}

function resetCatalogApplyState() {
  catalogApplyCompleted = false;
  if (catalogApplyBtn) {
    catalogApplyBtn.disabled = false;
    catalogApplyBtn.textContent = catalogApplyBtn.dataset.idleLabel || "Aplicar carga";
  }
}

function setCatalogImportButtonsBusy(busy, mode) {
  if (catalogPreviewBtn) {
    if (!catalogPreviewBtn.dataset.idleLabel) {
      catalogPreviewBtn.dataset.idleLabel = catalogPreviewBtn.textContent || "Vista previa";
    }
    if (busy) {
      catalogPreviewBtn.disabled = true;
      if (mode === "preview") {
        catalogPreviewBtn.textContent = "Analizando vista previa...";
      }
    } else {
      catalogPreviewBtn.disabled = false;
      catalogPreviewBtn.textContent = catalogPreviewBtn.dataset.idleLabel;
    }
  }
  if (catalogApplyBtn) {
    if (!catalogApplyBtn.dataset.idleLabel) {
      catalogApplyBtn.dataset.idleLabel = catalogApplyBtn.textContent || "Aplicar carga";
    }
    if (busy) {
      catalogApplyBtn.disabled = true;
      if (mode === "apply") catalogApplyBtn.textContent = "Procesando catálogo...";
    } else if (catalogApplyCompleted) {
      catalogApplyBtn.disabled = true;
      catalogApplyBtn.textContent = "Catálogo ya aplicado";
    } else {
      catalogApplyBtn.disabled = false;
      catalogApplyBtn.textContent = catalogApplyBtn.dataset.idleLabel;
    }
  }
}

function formatCatalogPreviewMessage(data) {
  const sample = Array.isArray(data.preview) ? data.preview.slice(0, 8) : [];
  const previewLine = sample.map((p) => `${p.sku}:${p.action}`).join(", ");
  const unknownCustomers = Array.isArray(data.unknownCustomers) ? data.unknownCustomers : [];
  const suppliersDetected = Array.isArray(data.suppliersDetected) ? data.suppliersDetected : [];
  const suppliersPo = Array.isArray(data.supplierPoDetected) ? data.supplierPoDetected : [];
  const short = `Vista previa: crear ${data.created || 0}, actualizar ${data.updated || 0}, omitir ${data.skipped || 0}.${unknownCustomers.length ? ` ${unknownCustomers.length} cliente(s) faltante(s).` : " Lista para aplicar."}`;
  const details = [
    previewLine ? `Muestra: ${previewLine}.` : null,
    unknownCustomers.length
      ? `Clientes faltantes (${unknownCustomers.length}): ${unknownCustomers.join(" | ")}.`
      : null,
    suppliersDetected.length ? `Proveedores: ${suppliersDetected.join(", ")}.` : null,
    suppliersPo.length ? `Supplier PO: ${suppliersPo.join(", ")}.` : null,
    unknownCustomers.length
      ? "Usa Aplicar carga para guardar en base de datos."
      : "Si el resultado es correcto, usa Aplicar carga para guardar en base de datos."
  ]
    .filter(Boolean)
    .join("\n");
  return { short, details };
}

async function fetchCatalogImport(csv, mode, autoCreateCustomers) {
  const response = await authenticatedFetch("/api/catalog/import/products", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ csv, mode, autoCreateCustomers })
  });
  if (!response) {
    return { ok: false, message: "Sesión expirada. Vuelve a iniciar sesión." };
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    return {
      ok: false,
      message: data.message || "Error al procesar catálogo. Revisa el CSV e intenta de nuevo."
    };
  }
  return { ok: true, data };
}

async function runCatalogImport(mode) {
  if (mode === "apply" && catalogApplyCompleted) {
    catalogImportResult.textContent =
      "El catálogo ya fue aplicado. Carga un archivo nuevo o edita el CSV para volver a importar.";
    return;
  }

  catalogImportResult.textContent = "";
  catalogImportResult.classList.remove("import-processing");
  const csv = catalogImportCsv.value.trim();
  if (!csv) {
    catalogImportResult.textContent = "Pega contenido CSV.";
    return;
  }

  const isPreview = mode === "preview";
  setCatalogImportButtonsBusy(true, mode);
  setImportProcessingMessage(
    catalogImportResult,
    isPreview
      ? "Analizando catálogo, no cierres esta pantalla."
      : "Procesando catálogo, no cierres esta pantalla.",
    true
  );

  try {
    if (isPreview) {
      const previewResult = await fetchCatalogImport(csv, "preview", false);
      if (!previewResult.ok) {
        renderOperationalMessage(catalogImportResult, {
          short: previewResult.message || "Error en vista previa del catálogo.",
          details: previewResult.message || "",
          isError: true
        });
        return;
      }
      renderOperationalMessage(catalogImportResult, formatCatalogPreviewMessage(previewResult.data));
      return;
    }

    const previewResult = await fetchCatalogImport(csv, "preview", false);
    if (!previewResult.ok) {
      renderOperationalMessage(catalogImportResult, {
        short: previewResult.message || "Error al validar catálogo antes de aplicar.",
        details: previewResult.message || "",
        isError: true
      });
      return;
    }

    const unknownCustomers = Array.isArray(previewResult.data.unknownCustomers)
      ? previewResult.data.unknownCustomers
      : [];
    let autoCreateCustomers = false;
    if (unknownCustomers.length > 0) {
      const confirmed = window.confirm(
        `Se detectaron ${unknownCustomers.length} clientes no existentes.\n\n¿Crear estos clientes automáticamente y aplicar el catálogo?\n\nSolo Aplicar carga modifica la base de datos.`
      );
      if (!confirmed) {
        catalogImportResult.textContent =
          "Aplicación cancelada. Revisa la vista previa o confirma la creación automática de clientes.";
        return;
      }
      autoCreateCustomers = true;
    }

    setImportProcessingMessage(
      catalogImportResult,
      "Procesando catálogo, no cierres esta pantalla.",
      true
    );

    const applyResult = await fetchCatalogImport(csv, "apply", autoCreateCustomers);
    if (!applyResult.ok) {
      renderOperationalMessage(catalogImportResult, {
        short: applyResult.message || "Error al aplicar catálogo.",
        details: applyResult.message || "",
        isError: true
      });
      return;
    }

    const applied = applyResult.data;
    const errLines = Array.isArray(applied.errors)
      ? applied.errors.map((e) => `${e.sku || "—"}: ${e.message || e}`)
      : [];
    renderOperationalMessage(catalogImportResult, {
      short: `Catálogo aplicado: ${applied.created || 0} creados, ${applied.updated || 0} actualizados, ${applied.skipped || 0} omitidos.${errLines.length ? ` ${errLines.length} detalle(s).` : ""}`,
      details: errLines.length
        ? errLines.join("\n")
        : `Creados: ${applied.created || 0}\nActualizados: ${applied.updated || 0}\nOmitidos: ${applied.skipped || 0}`,
      downloadRows: errLines.length ? errLines.map((detail) => ({ detail })) : null,
      downloadName: "logitec_catalogo_detalle"
    });
    catalogApplyCompleted = true;
    await loadCatalogData();
  } catch (_error) {
    catalogImportResult.textContent =
      "Error de red al procesar catálogo. Verifica conexión e intenta de nuevo.";
  } finally {
    catalogImportResult.classList.remove("import-processing");
    setCatalogImportButtonsBusy(false, mode);
  }
}

async function scanCode(event) {
  event.preventDefault();
  scanHint.textContent = "";
  setScanResult("Procesando surtido…");
  setPickingFlowState("read");
  if (scanBtn) scanBtn.disabled = true;

  const code = scanInput.value.trim();
  if (!code) {
    scanHint.textContent = "Escanea o escribe un SKU / código de barras.";
    setScanResult("Ingresa un código para surtir.", "error");
    resetPickingFlow();
    if (scanBtn) scanBtn.disabled = false;
    return;
  }

  const qtyRaw = document.getElementById("pickQty")?.value;
  const qty = qtyRaw === "" || qtyRaw == null ? 1 : Number(qtyRaw);
  if (!Number.isFinite(qty) || qty <= 0) {
    scanHint.textContent = "La cantidad a surtir debe ser mayor a 0.";
    setScanResult("Cantidad inválida.", "error");
    resetPickingFlow();
    if (scanBtn) scanBtn.disabled = false;
    return;
  }

  try {
    setPickingFlowState("validate");
    const response = await authenticatedFetch("/api/picking/scan", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(buildPickScanPayload(code))
    });

    // authenticatedFetch solo devuelve null en 401 (logout real por token).
    if (!response) {
      setScanResult("Sesión no válida. Vuelve a iniciar sesión.", "error");
      resetPickingFlow();
      return;
    }

    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      if (payload.code === "AMBIGUOUS_STOCK" && Array.isArray(payload.candidates)) {
        setPickingFlowState("stock");
        renderPickCandidates(payload.candidates);
        scanHint.textContent =
          payload.message ||
          "Hay varias líneas de stock. Elige una línea (ubicación + estatus) y confirma de nuevo.";
        setScanResult(
          `Ambiguo — ${payload.product?.sku || code}: elige la línea correcta. No se descontó inventario.`,
          "error"
        );
        resetPickingFlow();
        return;
      }
      clearPickCandidates();
      const candHint = payload.candidate
        ? ` Disponible en ${payload.candidate.location} / ${formatInventoryStatus(payload.candidate.status)}: ${payload.candidate.qty}.`
        : "";
      scanHint.textContent = (payload.message || "No se pudo completar el picking.") + candHint;
      setScanResult(`Resultado: ERROR — ${payload.message || "sin descuento de stock"}`, "error");
      resetPickingFlow();
      await loadScanEvents();
      return;
    }

    if (!payload.deducted) {
      clearPickCandidates();
      scanHint.textContent = "La API no confirmó descuento de stock. No se marca surtido OK.";
      setScanResult("ERROR — sin confirmación de descuento. Revisa Inventario.", "error");
      resetPickingFlow();
      await loadScanEvents();
      return;
    }

    clearPickCandidates();
    const candBox = document.getElementById("pickCandidates");
    if (candBox) delete candBox.dataset.inventoryId;

    const product = payload.product;
    setPickingFlowState("stock");
    setPickingFlowState("trace");
    setPickingFlowState("success");
    setScanResult(
      `OK — descontado ${payload.pickedQty ?? qty} de ${product?.sku || code} ` +
        `(${product?.name || "producto"}) · Proyecto ${product?.projectCode || product?.projectName || "—"} · ` +
        `${payload.warehouse || "—"} / ${payload.location || "—"} / ${formatInventoryStatus(payload.status)} · ` +
        `Antes ${payload.quantityBefore ?? "—"} → Después ${payload.quantityAfter ?? "—"}.`,
      "ok"
    );
    scanInput.value = "";
    await loadScanEvents();
    if (typeof loadStockStrip === "function") await loadStockStrip().catch(() => {});
    scanInput.focus();
  } catch (_error) {
    scanHint.textContent = "Error de red en surtido. No se descontó inventario.";
    setScanResult("Error de red en surtido.", "error");
    resetPickingFlow();
  } finally {
    if (scanBtn) scanBtn.disabled = false;
  }
}

async function deleteUserById(userId) {
  if (!userId || userId === currentUserId) return;
  if (!window.confirm("¿Desactivar este usuario? No podrá iniciar sesión.")) return;
  const response = await authenticatedFetch(`/api/users/${encodeURIComponent(userId)}`, {
    method: "DELETE"
  });
  if (!response) return;
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    window.alert(data.message || "No se pudo desactivar el usuario.");
    return;
  }
  await loadUsersModule("ADMIN");
}

async function validateSession() {
  try {
    const user = await loadCurrentUser();
    if (!user) return;
    currentRole = user.role || "CLIENT";
    currentUserId = user.id || null;
    applyRoleNavigation(currentRole);

    if (statusBox) statusBox.innerHTML = '<span class="ok">Sistema operativo</span>';
    const displayName = user.fullName || user.email || "Usuario";
    if (sessionDisplayName) sessionDisplayName.textContent = `Hola, ${displayName}`;
    if (sessionEmailInline) sessionEmailInline.textContent = user.email || "—";
    if (sessionRoleInline) sessionRoleInline.textContent = ` · Rol: ${currentRole}`;
    if (currentUserFullName) currentUserFullName.textContent = user.fullName || "—";
    currentUserEmail.textContent = user.email || "No disponible";
    currentUserRoleText.textContent = currentRole;
    await loadUsersModule(currentRole);
    await loadCatalogData();
    if (currentRole === "ADMIN" || currentRole === "OPERATOR" || currentRole === "SUPERVISOR") {
      await loadStockStrip();
      await loadInventoryMovements();
      await loadScanEvents();
    } else if (scanEventsList) {
      scanEventsList.innerHTML =
        '<p class="subtitle" style="margin:0">El historial de picking no aplica a tu rol.</p>';
    }
    if (scanHint) scanHint.textContent = "";
    wireHashModuleNavigation();
    // Preferir deep-link #module=… si es válido/permisible; si no hay hash, Centro de Control (por rol).
    const openedFromHash = applyModuleDeepLinkFromHash();
    if (!openedFromHash) {
      const landing = defaultLandingModule[currentRole] || roleModules[currentRole]?.[0] || "account";
      const landingSection = resolveSectionForModule(landing, "inicio");
      navigateTo(landingSection, landing);
    }
  } catch (_error) {
    if (statusBox) statusBox.innerHTML = '<span class="error">Error de red validando sesion.</span>';
    if (currentUserEmail) currentUserEmail.textContent = "No disponible";
    if (currentUserRoleText) currentUserRoleText.textContent = "No disponible";
    if (currentUserFullName) currentUserFullName.textContent = "—";
  }
}

moduleButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    const mod = btn.dataset.module;
    const panel = btn.closest("[data-nav-section-panel]");
    const section = panel?.getAttribute("data-nav-section-panel") || null;
    // Fijar vista de tareas ANTES de navigateTo para activar la tarjeta correcta.
    if (mod === "tasks") {
      const view = btn.getAttribute("data-task-view");
      const pref = btn.getAttribute("data-task-pref-type");
      taskViewMode = view === "notices" || pref === "INTERNAL_NOTICE" ? "notices" : "ops";
    }
    navigateTo(section, mod);
    if (mod === "tasks") {
      applyTaskViewModeUi();
      updateTaskKpis(getTasksPoolForView());
      renderTasksTable();
      const typeSel = document.getElementById("taskType");
      if (typeSel && taskViewMode === "notices") {
        typeSel.value = "INTERNAL_NOTICE";
      }
    }
  });
});

wireNavSectionTabs();
wireRequisitionModes();
populateOperationalTypeSelects();

document.getElementById("relocateSubmitBtn")?.addEventListener("click", () => void submitRelocate());
document.getElementById("bulkInboundOpenImportBtn")?.addEventListener("click", () => {
  if (typeof openModal === "function") openModal("inventoryImportModal");
  else {
    const modal = document.getElementById("inventoryImportModal");
    if (modal) {
      modal.classList.add("open");
      modal.setAttribute("aria-hidden", "false");
    }
  }
});
document.getElementById("taskCreateUserBtn")?.addEventListener("click", () => navigateTo("sistema", "users"));

usersList.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;
  const id = target.getAttribute("data-delete-user");
  if (id) {
    void deleteUserById(id);
  }
});

clientsList?.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;
  const id = target.getAttribute("data-delete-customer");
  if (id) void deleteCustomerById(id);
});
if (clientsAdminList) {
  clientsAdminList.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const id = target.getAttribute("data-delete-customer");
    if (id) void deleteCustomerById(id);
  });
}

logoutBtn?.addEventListener("click", forceLogout);
createUserForm.addEventListener("submit", createUser);
changePasswordForm.addEventListener("submit", changePassword);
createCustomerForm.addEventListener("submit", createCustomer);
createProductForm.addEventListener("submit", createProduct);
scanForm.addEventListener("submit", scanCode);
movementForm.addEventListener("submit", submitMovement);
importBtn.addEventListener("click", runImport);
catalogPreviewBtn.addEventListener("click", () => runCatalogImport("preview"));
catalogApplyBtn.addEventListener("click", () => runCatalogImport("apply"));
if (catalogImportFile) {
  catalogImportFile.addEventListener("change", (event) => {
    const input = event.target;
    const file = input instanceof HTMLInputElement ? input.files?.[0] : null;
    void loadImportFileIntoTextarea(file, catalogImportCsv, catalogImportFileStatus, "Vista previa / Aplicar carga", "catalog");
    if (input instanceof HTMLInputElement) input.value = "";
  });
}
if (catalogImportCsv) {
  catalogImportCsv.addEventListener("input", resetCatalogApplyState);
}
if (inventoryImportFile) {
  inventoryImportFile.addEventListener("change", (event) => {
    const input = event.target;
    const file = input instanceof HTMLInputElement ? input.files?.[0] : null;
    void loadImportFileIntoTextarea(file, importCsv, inventoryImportFileStatus, "Cargar inventario", "inventory");
    if (input instanceof HTMLInputElement) input.value = "";
  });
}
if (traceLoadBtn) traceLoadBtn.addEventListener("click", () => void loadTraceability());
if (taskCreateBtn) taskCreateBtn.addEventListener("click", () => void createTaskClick());
if (incidentCreateBtn) incidentCreateBtn.addEventListener("click", () => void createIncidentClick());
if (exportStockBtn) exportStockBtn.addEventListener("click", () => void exportStockCsv());
if (exportMovementsBtn) exportMovementsBtn.addEventListener("click", () => void exportMovementsCsv());
if (exportTraceBtn) exportTraceBtn.addEventListener("click", () => void exportTraceabilityCsv());
if (exportProductsBtn) exportProductsBtn.addEventListener("click", () => void exportProductsCsv());
if (demoResetOpenBtn) demoResetOpenBtn.addEventListener("click", openDemoResetPanel);
if (demoResetCancelBtn) demoResetCancelBtn.addEventListener("click", closeDemoResetPanel);
if (demoResetExecuteBtn) demoResetExecuteBtn.addEventListener("click", () => void runDemoReset());
if (taskList) {
  taskList.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const btn = target.closest("[data-task-action]");
    if (!(btn instanceof HTMLElement)) return;
    const id = btn.getAttribute("data-task-id");
    const action = btn.getAttribute("data-task-action");
    if (id && action) void handleTaskAction(id, action);
  });
}
if (incidentList) {
  incidentList.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    if (!target.classList.contains("incident-resolve")) return;
    const id = target.getAttribute("data-incident-id");
    if (id) void resolveIncident(id);
  });
}
wireInventoryFilterInputs();
wireCatalogFilterInputs();
wireOperationalForms();
wireControlCenterFilters();
wireQuickActions();
wireModals();
wireAviatProjectUi();
initGridDensity();
wireGridToolbars();
updateAppDateTime();
setInterval(updateAppDateTime, 60000);
if (importResult) wireOperationalMessageClicks(importResult);
if (catalogImportResult) wireOperationalMessageClicks(catalogImportResult);
void loadEnvironmentBadge();
validateSession();
