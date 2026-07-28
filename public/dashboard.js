const token = localStorage.getItem("token");
const statusBox = document.getElementById("statusBox");
const usersSummary = document.getElementById("usersSummary");
const logoutBtn = document.getElementById("logoutBtn");
const sessionDisplayName = document.getElementById("sessionDisplayName");
const sessionEmailInline = document.getElementById("sessionEmailInline");
const sessionRoleInline = document.getElementById("sessionRoleInline");
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
const modulePlaceholder = document.getElementById("modulePlaceholder");
const moduleButtons = document.querySelectorAll(".module-btn");
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

const roleModules = {
  ADMIN: ["control", "clients", "catalog", "inventory", "inbound", "requisitions", "picking", "outbound", "traceability", "incidents", "tasks", "reports", "users", "account"],
  SUPERVISOR: ["control", "clients", "catalog", "inventory", "inbound", "requisitions", "picking", "outbound", "traceability", "incidents", "tasks", "reports", "account"],
  OPERATOR: ["control", "clients", "inventory", "inbound", "requisitions", "picking", "outbound", "traceability", "incidents", "tasks", "reports", "account"],
  CLIENT: ["catalog", "account"]
};

const defaultLandingModule = {
  ADMIN: "control",
  SUPERVISOR: "control",
  OPERATOR: "control",
  CLIENT: "catalog"
};

const MODULE_REGISTRY = {
  control: moduleControlCenter,
  clients: moduleClients,
  catalog: moduleCatalog,
  inventory: moduleInventory,
  inbound: moduleInbound,
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
  Object.values(MODULE_REGISTRY).forEach((el) => {
    if (el) el.classList.add("hidden");
  });
  if (modulePlaceholder) modulePlaceholder.classList.add("hidden");
  closeMovementsPanel();
}

currentUrl && (currentUrl.textContent = window.location.href);

function forceLogout() {
  localStorage.removeItem("token");
  window.location.replace("/login.html");
}

if (!token) {
  forceLogout();
}

function activateModule(moduleName) {
  if (!currentRole) return;
  const allowed = roleModules[currentRole] || [];
  if (!allowed.includes(moduleName)) return;

  moduleButtons.forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.module === moduleName);
  });

  hideAllModules();

  const activeEl = MODULE_REGISTRY[moduleName];
  if (activeEl) activeEl.classList.remove("hidden");

  const showUsers = moduleName === "users";
  const showControl = moduleName === "control";
  const showClients = moduleName === "clients";
  const showReports = moduleName === "reports";
  const showPicking = moduleName === "picking";
  const showInventory = moduleName === "inventory";
  const showCatalog = moduleName === "catalog";
  const showAccount = moduleName === "account";
  const showTraceability = moduleName === "traceability";
  const showTasks = moduleName === "tasks";
  const showIncidents = moduleName === "incidents";
  const showInbound = moduleName === "inbound";
  const showOutbound = moduleName === "outbound";
  const showRequisitions = moduleName === "requisitions";

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
    showRequisitions;

  if (modulePlaceholder) modulePlaceholder.classList.toggle("hidden", hasKnownModule);

  if (showControl) refreshControlCenter();
  if (showClients) renderClientsModule();
  if (showInventory) applyInventoryFilters();
  if (showCatalog) applyCatalogFilters();
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
  if (showTraceability) void loadTraceability();
  if (showTasks) void loadTasks();
  if (showIncidents) void loadIncidents();
  if (showPicking) {
    resetPickingFlow();
    setTimeout(() => scanInput?.focus(), 0);
  }
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
  inventory: [200, 120, 150, 260, 110, 140, 110, 90],
  catalog: [200, 120, 150, 260, 110, 150],
  clients: [200, 120, 100, 120, 100],
  stock_cc: [200, 120, 150, 260, 140, 110, 90],
  movements: [140, 90, 120, 200, 160, 120, 80, 80, 120, 120, 140],
  traceability: [140, 120, 90, 100, 120, 160, 120, 120, 70, 90, 140],
  inbound: [140, 160, 140, 110, 120, 120, 90, 90],
  outbound: [140, 160, 140, 110, 120, 120, 90, 90],
  requisitions: [120, 160, 90, 200, 110, 100],
  tasks: [130, 90, 100, 110, 140, 140, 80],
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
    { label: "Cliente", value: p.customer?.name },
    { label: "Customer", value: p.customer?.code },
    { label: "SKU", value: p.sku },
    { label: "Producto", value: p.name },
    { label: "Almacén", value: row.location?.warehouse },
    { label: "Ubicación", value: row.location?.code },
    { label: "Status", value: row.status },
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
    { label: "Cliente", value: product.customer?.name },
    { label: "Customer", value: product.customer?.code },
    { label: "SKU", value: product.sku },
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
    return `<span class="badge status-badge ${inventoryTones[upper]}">${escCell(upper)}</span>`;
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
    return `<span class="badge ${inventoryTones[upper]}">${escCell(upper)}</span>`;
  }
  const tone =
    raw.includes("COMPLETED") || raw.includes("RESOLVED") || raw === "OK"
      ? "success"
      : raw.includes("IN_PROGRESS")
        ? "warn"
        : raw.includes("ERROR")
          ? "error"
          : "info";
  return `<span class="badge ${tone}">${escCell(raw)}</span>`;
}

function resetPickingFlow() {
  if (!pickingFlow) return;
  pickingFlow.querySelectorAll(".picking-step").forEach((step) => {
    step.classList.remove("active", "done");
  });
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
    const cliente = p.customer?.name || "";
    const customer = p.customer?.code || "";
    return (
      matchesFilter(cliente, filters.cliente) &&
      matchesFilter(customer, filters.customer) &&
      matchesFilter(p.sku, filters.sku) &&
      matchesFilter(p.name, filters.producto) &&
      matchesFilter(row.location?.code, filters.ubicacion) &&
      matchesFilter(row.status, filters.status)
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
  const list = Array.isArray(stockRowsCache) ? stockRowsCache : [];
  const productCount =
    productsCache.length > 0
      ? productsCache.length
      : new Set(list.map((r) => r.product?.sku).filter(Boolean)).size;
  const customers = new Set(
    list.map((r) => r.product?.customer?.code || r.product?.customer?.name).filter(Boolean)
  );
  const locations = new Set(list.map((r) => r.location?.code).filter(Boolean));
  const stockTotal = sumStockQty(list);
  const setKpi = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  };
  setKpi("ccKpiProducts", productCount > 0 ? String(productCount) : list.length ? String(new Set(list.map((r) => r.product?.sku).filter(Boolean)).size) : "0");
  setKpi("ccKpiCustomers", customers.size ? String(customers.size) : "0");
  setKpi("ccKpiLocations", locations.size ? String(locations.size) : "0");
  setKpi("ccKpiStock", list.length ? formatQty(stockTotal) : "0");
  setKpi("ccKpiMovements", String(movementsCountCache));
  setKpi("ccKpiConflicts", String(pendingConflictsCache));
}

function stockRowCells(row, { includeWarehouse = true } = {}) {
  const p = row.product || {};
  const cells = [
    renderCellEllipsis(p.customer?.name || "—"),
    `<span class="cell-nowrap">${escCell(p.customer?.code || "—")}</span>`,
    `<strong class="cell-nowrap">${escCell(p.sku || "—")}</strong>`,
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
    renderCellEllipsis(product.customer?.name || "—"),
    `<span class="cell-nowrap">${escCell(product.customer?.code || "—")}</span>`,
    `<strong class="cell-nowrap">${escCell(product.sku || "—")}</strong>`,
    renderCellEllipsis(product.name || "—"),
    `<span class="cell-nowrap">${renderCellEllipsis(product.warehouse || "—")}</span>`,
    `<span class="cell-nowrap">${escCell(product.barcode || "—")}</span>`
  ];
}

const STOCK_COLUMNS_FULL = [
  { label: "Cliente", sortKey: (r) => r.product?.customer?.name || "", sortType: "text" },
  { label: "Customer", sortKey: (r) => r.product?.customer?.code || "", sortType: "text" },
  { label: "SKU", sortKey: (r) => r.product?.sku || "", sortType: "text" },
  { label: "Producto", sortKey: (r) => r.product?.name || "", sortType: "text" },
  { label: "Almacén", sortKey: (r) => r.location?.warehouse || "", sortType: "text" },
  { label: "Ubicación", sortKey: (r) => r.location?.code || "", sortType: "text" },
  { label: "Status", sortKey: (r) => r.status || "", sortType: "text" },
  { label: "Cantidad", align: "right", sortKey: (r) => Number(r.qty) || 0, sortType: "number" }
];

const STOCK_COLUMNS_CC = [
  { label: "Cliente", sortKey: (r) => r.product?.customer?.name || "" },
  { label: "Customer", sortKey: (r) => r.product?.customer?.code || "" },
  { label: "SKU", sortKey: (r) => r.product?.sku || "" },
  { label: "Producto", sortKey: (r) => r.product?.name || "" },
  { label: "Ubicación", sortKey: (r) => r.location?.code || "" },
  { label: "Status", sortKey: (r) => r.status || "" },
  { label: "Cantidad", align: "right", sortKey: (r) => Number(r.qty) || 0, sortType: "number" }
];

const CATALOG_COLUMNS = [
  { label: "Cliente", sortKey: (p) => p.customer?.name || "" },
  { label: "Customer", sortKey: (p) => p.customer?.code || "" },
  { label: "SKU", sortKey: (p) => p.sku || "" },
  { label: "Producto", sortKey: (p) => p.name || "" },
  { label: "Almacén", sortKey: (p) => p.warehouse || "" },
  { label: "Código de barras", sortKey: (p) => p.barcode || "" }
];

const CLIENTS_COLUMNS = [
  { label: "Cliente", sortKey: (r) => r.name || "" },
  { label: "Customer", sortKey: (r) => r.code || "" },
  { label: "Productos", align: "right", sortKey: (r) => r.products || 0, sortType: "number" },
  { label: "Saldos asociados", align: "right", sortKey: (r) => r.stock || 0, sortType: "number" },
  { label: "Estado", sortKey: (r) => (r.products > 0 ? "Activo" : "Sin catálogo") }
];

const TRACE_COLUMNS = [
  { label: "Fecha", sortKey: (r) => r.createdAt, sortType: "date", render: (r) => formatDateShort(r.createdAt), title: (r) => formatDateShort(r.createdAt) },
  { label: "Usuario", sortKey: (r) => r.user?.fullName || "", render: (r) => renderCellWithClamp(r.user?.fullName || "—", "cell-truncate", 20), title: (r) => r.user?.fullName || "" },
  { label: "Tipo", sortKey: (r) => r.type || "", render: (r) => statusBadge(r.type) },
  { label: "Subtipo", sortKey: (r) => r.subtype || "", render: (r) => renderCellWithClamp(r.subtype, "cell-truncate", 18), title: (r) => r.subtype || "" },
  { label: "SKU", sortKey: (r) => r.product?.sku || "", render: (r) => escCell(r.product?.sku || "—"), title: (r) => r.product?.sku || "" },
  { label: "Cliente", sortKey: (r) => r.customer?.name || "", render: (r) => renderCellWithClamp(r.customer?.name || "—", "cell-truncate", 18), title: (r) => r.customer?.name || "" },
  { label: "Customer", sortKey: (r) => r.customer?.code || "", render: (r) => escCell(r.customer?.code || "—"), title: (r) => r.customer?.code || "" },
  { label: "Ubicación", sortKey: (r) => r.location || r.warehouse || "", render: (r) => renderCellWithClamp(r.location || r.warehouse, "cell-truncate", 22), title: (r) => r.location || r.warehouse || "" },
  { label: "Cant.", align: "right", sortKey: (r) => Number(r.qty) || 0, sortType: "number", render: (r) => formatQty(r.qty) },
  { label: "Resultado", sortKey: (r) => r.result || "", render: (r) => statusBadge(r.result) },
  { label: "Referencia", sortKey: (r) => r.reference || "", render: (r) => renderCellWithClamp(r.reference, "cell-truncate", 24), title: (r) => r.reference || "" }
];

const TASK_COLUMNS = [
  { label: "Creado", sortKey: (t) => t.createdAt, sortType: "date", render: (t) => formatDateShort(t.createdAt) },
  { label: "Tipo", sortKey: (t) => t.type || "", render: (t) => statusBadge(t.type) },
  { label: "Estado", sortKey: (t) => t.status || "", render: (t) => statusBadge(t.status) },
  { label: "Almacén", sortKey: (t) => t.warehouse || "", render: (t) => renderCellWithClamp(t.warehouse, "cell-truncate", 18), title: (t) => t.warehouse || "" },
  { label: "Asignado", sortKey: (t) => t._assignName || "", render: (t) => renderCellWithClamp(t._assignName || "—", "cell-truncate", 20), title: (t) => t._assignName || "" },
  { label: "Ref.", sortKey: (t) => t.reference || "", render: (t) => renderCellWithClamp(t.reference, "cell-truncate", 22), title: (t) => t.reference || "" },
  { label: "Prioridad", align: "right", sortKey: (t) => t.priority ?? 0, sortType: "number", render: (t) => String(t.priority ?? 0) }
];

const MOVEMENT_COLUMNS = [
  { label: "Fecha", sortKey: (m) => m.createdAt, sortType: "date", render: (m) => formatDateShort(m.createdAt) },
  { label: "Tipo", sortKey: (m) => m.movementType || "", render: (m) => statusBadge(m.movementType) },
  { label: "SKU", sortKey: (m) => m.product?.sku || "", render: (m) => escCell(m.product?.sku || "—"), title: (m) => m.product?.sku || "" },
  { label: "Producto", sortKey: (m) => m.product?.name || "", render: (m) => renderCellWithClamp(m.product?.name, "cell-truncate", 28), title: (m) => m.product?.name || "" },
  { label: "Cliente", sortKey: (m) => m.product?.customer?.name || "", render: (m) => renderCellWithClamp(m.product?.customer?.name, "cell-truncate", 20), title: (m) => m.product?.customer?.name || "" },
  { label: "Customer", sortKey: (m) => m.product?.customer?.code || "", render: (m) => escCell(m.product?.customer?.code || "—"), title: (m) => m.product?.customer?.code || "" },
  { label: "Antes", align: "right", sortKey: (m) => Number(m.quantityBefore) || 0, sortType: "number", render: (m) => formatQty(m.quantityBefore) },
  { label: "Después", align: "right", sortKey: (m) => Number(m.quantityAfter) || 0, sortType: "number", render: (m) => formatQty(m.quantityAfter) },
  { label: "Ubicación", sortKey: (m) => m.toLocation?.code || m.fromLocation?.code || "", render: (m) => renderCellWithClamp(m.toLocation?.code || m.fromLocation?.code || m.warehouse, "cell-truncate", 20), title: (m) => m.toLocation?.code || m.fromLocation?.code || "" },
  { label: "Usuario", sortKey: (m) => m.user?.fullName || "", render: (m) => renderCellWithClamp(m.user?.fullName, "cell-truncate", 20), title: (m) => m.user?.fullName || "" },
  { label: "Referencia", sortKey: (m) => m.reference || "", render: (m) => renderCellWithClamp(m.reference, "cell-truncate", 20), title: (m) => m.reference || "" }
];

const OPS_MOVEMENT_COLUMNS = [
  { label: "Fecha", sortKey: (m) => m.createdAt, sortType: "date", render: (m) => formatDateShort(m.createdAt) },
  { label: "Cliente", sortKey: (m) => m.product?.customer?.name || "", render: (m) => renderCellWithClamp(m.product?.customer?.name || "—", "cell-truncate", 22), title: (m) => m.product?.customer?.name || "" },
  { label: "Customer", sortKey: (m) => m.product?.customer?.code || "", render: (m) => escCell(m.product?.customer?.code || "—"), title: (m) => m.product?.customer?.code || "" },
  { label: "Referencia", sortKey: (m) => m.reference || "", render: (m) => renderCellWithClamp(m.reference, "cell-truncate", 18), title: (m) => m.reference || "" },
  { label: "SKU", sortKey: (m) => m.product?.sku || "", render: (m) => escCell(m.product?.sku || "—"), title: (m) => m.product?.sku || "" },
  { label: "Producto", sortKey: (m) => m.product?.name || "", render: (m) => renderCellWithClamp(m.product?.name, "cell-truncate", 24), title: (m) => m.product?.name || "" },
  { label: "Cantidad", align: "right", sortKey: (m) => Number(m.qty) || 0, sortType: "number", render: (m) => formatQty(m.qty) }
];

const REQ_COLUMNS = [
  { label: "Folio", sortKey: (t) => t.reference || "", render: (t) => renderCellWithClamp(t.reference, "cell-truncate", 18), title: (t) => t.reference || "" },
  { label: "Cliente", sortKey: (t) => formatReqCliente(t), render: (t) => renderCellWithClamp(formatReqCliente(t), "cell-truncate", 22), title: (t) => formatReqCliente(t) },
  { label: "Prioridad", align: "right", sortKey: (t) => t.priority ?? 0, sortType: "number", render: (t) => String(t.priority ?? 0) },
  { label: "Productos", sortKey: (t) => formatReqProducts(t), render: (t) => renderCellWithClamp(formatReqProducts(t), "cell-truncate", 28), title: (t) => formatReqProducts(t) },
  { label: "Estado", sortKey: (t) => t.status || "", render: (t) => statusBadge(t.status) },
  { label: "Picking", sortKey: (t) => t.status || "", render: (t) => (t.status === "COMPLETED" ? statusBadge("COMPLETED") : t.status === "IN_PROGRESS" ? statusBadge("IN_PROGRESS") : statusBadge("PENDING")) }
];

const INCIDENT_COLUMNS = [
  { label: "Fecha", sortKey: (r) => r.createdAt, sortType: "date", render: (r) => formatDateShort(r.createdAt) },
  { label: "Tipo", sortKey: (r) => r.type || "", render: (r) => statusBadge(r.type) },
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
  const rows = Array.from(stats.values()).sort((a, b) => a.name.localeCompare(b.name, "es"));
  const countEl = document.getElementById("clientsTableCount");
  if (countEl) countEl.textContent = `Mostrando ${rows.length} cliente${rows.length === 1 ? "" : "s"}`;
  renderDataGrid(clientsModuleList, {
    gridId: "clients",
    columns: CLIENTS_COLUMNS,
    rowDataList: rows,
    rowCellsFn: (r) => [
      renderCellEllipsis(r.name),
      `<span class="cell-nowrap">${escCell(r.code)}</span>`,
      String(r.products),
      formatQty(r.stock),
      `<span class="status-chip">${r.products > 0 ? "Activo" : "Sin catálogo"}</span>`
    ],
    colsClass: "data-grid-cols-clients",
    sizeClass: "data-grid-size-catalog",
    emptyMessage: "No hay clientes detectados. Carga catálogo o inventario para ver clientes."
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
  renderControlCenterTable(filterStockRowsWithFilters(stockRowsCache, getControlCenterFilterValues()));
}

function refreshControlCenter() {
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
      if (mod) activateModule(mod);
    });
  });
}

function filterStockRows(rows) {
  return filterStockRowsWithFilters(rows, getInventoryFilterValues());
}

function renderStockTable(rows) {
  if (!inventoryList) return;
  const total = stockRowsCache.length;
  const shown = Array.isArray(rows) ? rows.length : 0;
  updateTableCountMeta("inventoryTableCount", shown, total, "saldos");
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
  updateInventorySummary(stockRowsCache);
  renderStockTable(filterStockRows(stockRowsCache));
  applyControlCenterFilters();
}

function filterProductRows(rows) {
  const f = getCatalogFilterValues();
  return (Array.isArray(rows) ? rows : []).filter((product) => {
    const cliente = product.customer?.name || "";
    const customer = product.customer?.code || "";
    return (
      matchesFilter(cliente, f.cliente) &&
      matchesFilter(customer, f.customer) &&
      matchesFilter(product.sku, f.sku) &&
      matchesFilter(product.name, f.producto)
    );
  });
}

function renderProductsTable(rows) {
  if (!productsList) return;
  const total = productsCache.length;
  const shown = Array.isArray(rows) ? rows.length : 0;
  updateTableCountMeta("catalogTableCount", shown, total, "productos");
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
  ["invFilterCliente", "invFilterCustomer", "invFilterSku", "invFilterProducto", "invFilterUbicacion", "invFilterStatus"].forEach(
    (id) => {
      const el = document.getElementById(id);
      if (el) el.value = "";
    }
  );
  applyInventoryFilters();
}

function clearCatalogFilters() {
  ["catFilterCliente", "catFilterCustomer", "catFilterSku", "catFilterProducto"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.value = "";
  });
  applyCatalogFilters();
}

function wireInventoryFilterInputs() {
  ["invFilterCliente", "invFilterCustomer", "invFilterSku", "invFilterProducto", "invFilterUbicacion", "invFilterStatus"].forEach(
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
  ["catFilterCliente", "catFilterCustomer", "catFilterSku", "catFilterProducto"].forEach((id) => {
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
        : "Formato Logitec detectado: inventario agrupado por cliente, SKU, ubicación y status.";
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
      if (summary.statuses?.length) details.push(`Status detectados: ${summary.statuses.join(", ")}.`);
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
      extras.push(`${result.unrecognizedStatusRows} filas con STATUS no reconocido (se usó AVAILABLE y se conserva en reference)`);
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
  { label: "cliente", value: (r) => r.product?.customer?.name || "" },
  { label: "customer", value: (r) => r.product?.customer?.code || "" },
  { label: "sku", value: (r) => r.product?.sku || "" },
  { label: "producto", value: (r) => r.product?.name || "" },
  { label: "almacen", value: (r) => r.location?.warehouse || "" },
  { label: "ubicacion", value: (r) => r.location?.code || "" },
  { label: "status", value: (r) => r.status || "" },
  { label: "cantidad", value: (r) => formatQty(r.qty) }
];

const CATALOG_EXPORT_COLUMNS = [
  { label: "cliente", value: (r) => r.customer?.name || "" },
  { label: "customer", value: (r) => r.customer?.code || "" },
  { label: "sku", value: (r) => r.sku || "" },
  { label: "producto", value: (r) => r.name || "" },
  { label: "almacen", value: (r) => r.warehouse || "" },
  { label: "codigo_barras", value: (r) => r.barcode || "" }
];

async function exportStockCsv() {
  const response = await authenticatedFetch("/api/inventory/stock");
  if (!response?.ok) {
    window.alert("No se pudo exportar existencias.");
    return;
  }
  const rows = await response.json();
  if (!Array.isArray(rows) || rows.length === 0) {
    window.alert("No hay existencias para exportar.");
    return;
  }
  exportToCsv("logitec_inventario", rows, STOCK_EXPORT_COLUMNS);
}

async function exportStockCsvFiltered() {
  const rows = filterStockRows(stockRowsCache);
  if (!rows.length) {
    window.alert("No hay registros con los filtros actuales.");
    return;
  }
  exportToCsv("logitec_inventario_filtrado", rows, STOCK_EXPORT_COLUMNS);
}

async function exportProductsCsvFiltered() {
  const rows = filterProductRows(productsCache);
  if (!rows.length) {
    window.alert("No hay productos con los filtros actuales.");
    return;
  }
  exportToCsv("logitec_catalogo_filtrado", rows, CATALOG_EXPORT_COLUMNS);
}

async function exportMovementsCsv() {
  const response = await authenticatedFetch("/api/inventory/movements?limit=all");
  if (!response?.ok) {
    window.alert("No se pudo exportar movimientos.");
    return;
  }
  const rows = await response.json();
  if (!Array.isArray(rows) || rows.length === 0) {
    window.alert("No hay movimientos para exportar.");
    return;
  }
  exportToCsv("logitec_movimientos", rows, [
    { label: "fecha", value: (r) => formatExportDate(r.createdAt) },
    { label: "usuario", value: (r) => r.user?.fullName || r.user?.email || "" },
    { label: "tipo", value: (r) => r.movementType || r.type || "" },
    { label: "cliente", value: (r) => r.product?.customer?.name || r.product?.customer?.code || "" },
    { label: "sku", value: (r) => r.product?.sku || "" },
    { label: "producto", value: (r) => r.product?.name || "" },
    { label: "antes", value: (r) => formatQty(r.quantityBefore) },
    { label: "despues", value: (r) => formatQty(r.quantityAfter) },
    { label: "almacen", value: (r) => r.warehouse || "" },
    { label: "ubicacion", value: (r) => r.toLocation?.code || r.fromLocation?.code || "" },
    { label: "status", value: () => "" },
    { label: "referencia", value: (r) => r.reference || "" },
    { label: "notas", value: (r) => r.notes || "" }
  ]);
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
  const rows = await response.json();
  if (!Array.isArray(rows) || rows.length === 0) {
    window.alert("No hay productos para exportar.");
    return;
  }
  exportToCsv("logitec_catalogo", rows, CATALOG_EXPORT_COLUMNS);
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
    if (traceMessage) traceMessage.textContent = `${Array.isArray(rows) ? rows.length : 0} registros.`;
    if (!Array.isArray(rows) || rows.length === 0) {
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
      rows,
      emptyMessage: "Sin registros operativos aún"
    });
  } catch (_e) {
    if (traceMessage) traceMessage.textContent = "Error de red.";
  }
}

async function loadTasks() {
  if (!taskList) return;
  if (taskMessage) taskMessage.textContent = "Cargando…";
  try {
    const response = await authenticatedFetch("/api/tasks");
    if (!response) return;
    if (!response.ok) {
      if (taskMessage) taskMessage.textContent = "No se pudieron cargar tareas.";
      taskList.innerHTML = "";
      return;
    }
    const rows = await response.json();
    if (taskMessage) taskMessage.textContent = `${Array.isArray(rows) ? rows.length : 0} tareas.`;
    if (!Array.isArray(rows) || rows.length === 0) {
      taskList.innerHTML = "";
      renderExcelTable(taskList, { gridId: "tasks", columns: TASK_COLUMNS, rows: [], emptyMessage: "Sin registros operativos aún", selectable: false, allowActions: true });
      return;
    }
    const taskRows = rows.map((t) => {
      const assign = t.assignedTo ? t.assignedTo.fullName : "—";
      const canUpdate =
        currentRole === "ADMIN" ||
        currentRole === "SUPERVISOR" ||
        (currentRole === "OPERATOR" && t.assignedToId === currentUserId);
      return {
        ...t,
        _assignName: assign,
        _actionHtml: canUpdate
          ? `<button type="button" class="task-advance btn-table btn-compact" data-task-id="${escCell(t.id)}">Avanzar</button>`
          : "—"
      };
    });
    renderExcelTable(taskList, {
      gridId: "tasks",
      columns: TASK_COLUMNS,
      rows: taskRows,
      emptyMessage: "Sin registros operativos aún",
      selectable: false,
      allowActions: true
    });
  } catch (_e) {
    if (taskMessage) taskMessage.textContent = "Error de red.";
  }
}

async function advanceTaskStatus(taskId) {
  if (!taskId) return;
  const order = ["PENDING", "ASSIGNED", "IN_PROGRESS", "COMPLETED"];
  try {
    const list = await authenticatedFetch("/api/tasks");
    if (!list?.ok) return;
    const tasks = await list.json();
    const t = Array.isArray(tasks) ? tasks.find((x) => x.id === taskId) : null;
    const cur = t?.status || "PENDING";
    const idx = order.indexOf(cur);
    const next = idx >= 0 && idx < order.length - 1 ? order[idx + 1] : "COMPLETED";
    const response = await authenticatedFetch(`/api/tasks/${encodeURIComponent(taskId)}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: next })
    });
    if (response?.ok) await loadTasks();
  } catch (_e) {
    window.alert("No se pudo actualizar la tarea.");
  }
}

async function createTaskClick() {
  if (!taskCreateBtn || !taskCreateError) return;
  taskCreateError.textContent = "";
  const type = document.getElementById("taskType")?.value;
  const warehouse = document.getElementById("taskWarehouse")?.value?.trim();
  const reference = document.getElementById("taskRef")?.value?.trim();
  const priority = Number(document.getElementById("taskPriority")?.value || 0);
  taskCreateBtn.disabled = true;
  try {
    const response = await authenticatedFetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type,
        warehouse: warehouse || undefined,
        reference: reference || undefined,
        priority: Number.isFinite(priority) ? priority : 0
      })
    });
    if (!response) return;
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      taskCreateError.textContent = data.message || "No se pudo crear.";
      return;
    }
    await loadTasks();
  } catch (_e) {
    taskCreateError.textContent = "Error de red.";
  } finally {
    taskCreateBtn.disabled = false;
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
  const type = document.getElementById("incidentType")?.value;
  const warehouse = document.getElementById("incidentWarehouse")?.value?.trim();
  const location = document.getElementById("incidentLocation")?.value?.trim();
  const productId = document.getElementById("incidentProductId")?.value?.trim();
  const notes = document.getElementById("incidentNotes")?.value?.trim();
  if (!notes) {
    incidentCreateError.textContent = "Las notas son obligatorias.";
    return;
  }
  incidentCreateBtn.disabled = true;
  try {
    const response = await authenticatedFetch("/api/incidents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type,
        warehouse: warehouse || undefined,
        location: location || undefined,
        productId: productId || undefined,
        notes
      })
    });
    if (!response) return;
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      incidentCreateError.textContent = data.message || "No se pudo registrar.";
      return;
    }
    document.getElementById("incidentNotes").value = "";
    await loadIncidents();
  } catch (_e) {
    incidentCreateError.textContent = "Error de red.";
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
  updateInventorySummary(stockRowsCache);
  if (!Array.isArray(rows) || rows.length === 0) {
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
    rows,
    emptyMessage: "Sin registros operativos aún"
  });
  if (rows.length >= 200) {
    inventoryMovementsList.insertAdjacentHTML(
      "beforeend",
      '<p class="filter-hint" style="margin:8px 0 0">Mostrando los últimos 200 movimientos. Usa Exportar movimientos CSV para ver más.</p>'
    );
  }
  if (moduleInbound && !moduleInbound.classList.contains("hidden")) void loadInboundList();
  if (moduleOutbound && !moduleOutbound.classList.contains("hidden")) void loadOutboundList();
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
  sel.innerHTML =
    '<option value="">— Seleccionar customer —</option>' +
    customers.map((c) => `<option value="${escCell(c.code)}">${escCell(c.name)} (${escCell(c.code)})</option>`).join("");
  if (prev) sel.value = prev;
  if (clienteInputId) {
    const inp = document.getElementById(clienteInputId);
    if (inp) {
      const match = customers.find((c) => c.code === sel.value);
      inp.value = match ? match.name : "";
    }
  }
}

function fillSkuSelect(selectId, customerCode, productInputId) {
  const sel = document.getElementById(selectId);
  if (!sel) return;
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
}

function setOpsMessage(elId, text, isOk) {
  const el = document.getElementById(elId);
  if (!el) return;
  el.textContent = text;
  el.classList.remove("ok", "error");
  if (text) el.classList.add(isOk ? "ok" : "error");
}

function findProductBySku(sku) {
  return productsCache.find((p) => p.sku === sku);
}

async function submitOperationalMovement(kind) {
  const prefix = kind === "in" ? "inbound" : "outbound";
  const btn = document.getElementById(`${prefix}SubmitBtn`);
  const msgId = `${prefix}Message`;
  setOpsMessage(msgId, "", true);

  const customerCode = document.getElementById(`${prefix}Customer`)?.value?.trim();
  const sku = document.getElementById(`${prefix}Sku`)?.value?.trim();
  const qty = Number(document.getElementById(`${prefix}Qty`)?.value);
  const warehouse = document.getElementById(`${prefix}Warehouse`)?.value?.trim() || "TULTITLAN24";
  const location = document.getElementById(`${prefix}Location`)?.value?.trim();
  const status = document.getElementById(`${prefix}Status`)?.value || "AVAILABLE";
  const referenceRaw = document.getElementById(`${prefix}Reference`)?.value?.trim();
  const notes = document.getElementById(`${prefix}Notes`)?.value?.trim();

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

  const reference =
    referenceRaw || (kind === "in" ? "ENTRADA_OPERATIVA" : "SALIDA_OPERATIVA");

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
  const inbound = movementsRowsCache.filter(
    (m) => m.movementType === "IN" || m.type === "INBOUND"
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
  const outbound = movementsRowsCache.filter(
    (m) => m.movementType === "OUT" && m.type !== "PICK"
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

function formatReqCliente(task) {
  const parsed = parseRequisitionNotes(task.notes);
  if (parsed?.customerName) return parsed.customerName;
  if (parsed?.customerCode) return parsed.customerCode;
  return "—";
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
    const rows = (await response.json()).filter((t) => t.type === "PICK");
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
  const sku = document.getElementById("reqSku")?.value?.trim();
  const qty = Number(document.getElementById("reqQty")?.value);
  const warehouse = document.getElementById("reqWarehouse")?.value?.trim() || "TULTITLAN24";
  const extraNotes = document.getElementById("reqNotes")?.value?.trim();

  if (!reference) {
    setOpsMessage("reqMessage", "Indique folio o referencia.", false);
    return;
  }
  if (sku && !findProductBySku(sku)) {
    setOpsMessage("reqMessage", "SKU inexistente en catálogo.", false);
    return;
  }
  if (sku && (!Number.isFinite(qty) || qty <= 0)) {
    setOpsMessage("reqMessage", "Cantidad solicitada debe ser mayor que 0.", false);
    return;
  }

  const notesPayload = {
    customerCode: customerCode || null,
    customerName: customerName || null,
    sku: sku || null,
    qty: Number.isFinite(qty) ? qty : null,
    detail: extraNotes || null
  };

  if (btn) btn.disabled = true;
  try {
    const response = await authenticatedFetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "PICK",
        status: "PENDING",
        warehouse,
        priority: Number(document.getElementById("reqPriority")?.value || 0),
        reference,
        notes: JSON.stringify(notesPayload)
      })
    });
    if (!response) return;
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      setOpsMessage("reqMessage", data.message || "No se pudo crear la requisición.", false);
      return;
    }
    setOpsMessage("reqMessage", "Requisición registrada correctamente.", true);
    document.getElementById("reqReference").value = "";
    document.getElementById("reqQty").value = "";
    document.getElementById("reqNotes").value = "";
    await loadRequisitionsList();
    await loadTasks();
  } catch (_e) {
    setOpsMessage("reqMessage", "Error de red.", false);
  } finally {
    if (btn) btn.disabled = false;
  }
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
      sku.addEventListener("change", () => {
        if (prodId) {
          const prod = findProductBySku(sku.value);
          const inp = document.getElementById(prodId);
          if (inp) inp.value = prod?.name || "";
        }
      });
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
    btn.style.display = enabled ? "block" : "none";
  });

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
  setScanResult("Procesando escaneo…");
  setPickingFlowState("read");
  scanBtn.disabled = true;

  const code = scanInput.value.trim();
  if (!code) {
    scanHint.textContent = "Escanea un SKU o codigo.";
    setScanResult("Ingresa un código para escanear.");
    resetPickingFlow();
    scanBtn.disabled = false;
    return;
  }

  try {
    setPickingFlowState("validate");
    const response = await authenticatedFetch("/api/picking/scan", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ code })
    });

    if (!response) return;
    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      scanHint.textContent = payload.message || "ERROR: producto no existe.";
      setScanResult(`Resultado: ERROR — ${payload.message || "producto no encontrado"}`, "error");
      resetPickingFlow();
      await loadScanEvents();
      return;
    }

    const product = payload.product;
    setPickingFlowState("stock");
    setPickingFlowState("trace");
    setPickingFlowState("success");
    setScanResult(
      `OK — ${product?.sku || code}: ${product?.name || "Producto validado"} · Almacén ${product?.warehouse || "TULTITLAN24"} · Stock descontado y trazabilidad registrada.`,
      "ok"
    );
    scanInput.value = "";
    await loadScanEvents();
    scanInput.focus();
  } catch (_error) {
    scanHint.textContent = "Error de red en escaneo.";
    setScanResult("Error de red en escaneo.", "error");
    resetPickingFlow();
  } finally {
    scanBtn.disabled = false;
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
    const landing = defaultLandingModule[currentRole] || roleModules[currentRole]?.[0] || "account";
    activateModule(landing);
  } catch (_error) {
    if (statusBox) statusBox.innerHTML = '<span class="error">Error de red validando sesion.</span>';
    if (currentUserEmail) currentUserEmail.textContent = "No disponible";
    if (currentUserRoleText) currentUserRoleText.textContent = "No disponible";
    if (currentUserFullName) currentUserFullName.textContent = "—";
  }
}

moduleButtons.forEach((btn) => {
  btn.addEventListener("click", () => activateModule(btn.dataset.module));
});

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
    if (!target.classList.contains("task-advance")) return;
    const id = target.getAttribute("data-task-id");
    if (id) void advanceTaskStatus(id);
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
initGridDensity();
wireGridToolbars();
updateAppDateTime();
setInterval(updateAppDateTime, 60000);
if (importResult) wireOperationalMessageClicks(importResult);
if (catalogImportResult) wireOperationalMessageClicks(catalogImportResult);
validateSession();
