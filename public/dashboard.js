function currentAccessToken() {
  return localStorage.getItem("token") || "";
}
let clientContextEpoch = 0;
let operationalClient = null;
let awaitingAdminClient = false;
let clientContextCatalog = [];
const ADMIN_GLOBAL_MODULES = new Set(["users", "clients", "account", "config"]);
const clientContextGate = document.getElementById("clientContextGate");
const clientContextCards = document.getElementById("clientContextCards");
const clientContextSearch = document.getElementById("clientContextSearch");
const clientContextStatus = document.getElementById("clientContextStatus");
const clientContextAddBtn = document.getElementById("clientContextAddBtn");
const changeClientBtn = document.getElementById("changeClientBtn");

function isBoundOperationalRole(role) {
  return role === "SUPERVISOR" || role === "OPERATOR" || role === "CLIENT";
}

function isAdminGlobalModule(moduleName) {
  return ADMIN_GLOBAL_MODULES.has(String(moduleName || ""));
}

function persistAccessToken(value) {
  if (!value) return;
  localStorage.setItem("token", value);
}

function bumpClientContextEpoch() {
  clientContextEpoch += 1;
}

function closeAllOperationalSurfaces() {
  document.querySelectorAll(".modal-overlay.open").forEach((el) => {
    el.classList.remove("open");
    el.setAttribute("aria-hidden", "true");
  });
  if (typeof closeDetailDrawer === "function") closeDetailDrawer();
  if (typeof closeMovementsPanel === "function") closeMovementsPanel();
  document.querySelectorAll(".js-pick-candidates, #pickCandidates, #scanResult").forEach((el) => {
    if (el) el.innerHTML = "";
  });
}

function clearOperationalClientState() {
  bumpClientContextEpoch();
  inventoryScope = { projectId: "", assignmentType: "" };
  adminSelectedClientId = "";
  stockRowsCache = [];
  inventoryProjectsCache = [];
  inventoryKpiCache = null;
  movementsRows = [];
  movementsRowsCache = [];
  movementsCountCache = 0;
  movementsNextCursor = null;
  productsCache = [];
  catalogProjectsCache = [];
  relocateLocationsCache = [];
  warehousesCatalogCache = [];
  locationsCatalogCache = [];
  pendingConflictsCache = 0;
  inventorySkuSelectedContext = null;
  inventorySkuSelectedListEl = null;
  requisitionSkuSelectedContext = null;
  requisitionSkuSelectedListEl = null;
  currentImportId = null;
  importResumeActive = null;
  if (typeof clearInventorySkuSelectedContext === "function") clearInventorySkuSelectedContext();
  closeAllOperationalSurfaces();
  document.querySelectorAll("form").forEach((form) => {
    if (form.id === "loginForm" || form.id === "createUserForm") return;
    try {
      form.reset();
    } catch (_e) {
      /* ignore */
    }
  });
  if (typeof clearInventoryWorkspaceState === "function") clearInventoryWorkspaceState();
  if (typeof updateInventoryScopeUi === "function") updateInventoryScopeUi();
}

function setAdminClientGateVisible(visible) {
  if (!clientContextGate) return;
  clientContextGate.classList.toggle("hidden", !visible);
  clientContextGate.toggleAttribute("hidden", !visible);
}

function updateActiveClientChrome() {
  document.querySelectorAll("[data-aviat-primary-label]").forEach((el) => {
    el.textContent = owningClientDisplayName();
  });
  if (changeClientBtn) {
    changeClientBtn.classList.toggle("hidden", currentRole !== "ADMIN");
    changeClientBtn.textContent = operationalClient ? "Cambiar cliente" : "Seleccionar cliente";
  }
}

function formatClientAddress(row) {
  const parts = [row.address, row.city, row.state, row.postalCode]
    .map((value) => String(value || "").trim())
    .filter(Boolean);
  return parts.length ? parts.join(", ") : "—";
}

function clientFieldOrDash(value) {
  const text = String(value ?? "").trim();
  return text || "—";
}

function renderClientProjectsList(projects) {
  const list = Array.isArray(projects) ? projects : [];
  if (!list.length) {
    return '<ul class="client-projects-list"><li class="is-empty">Sin proyectos asociados</li></ul>';
  }
  return `<ul class="client-projects-list">${list
    .slice(0, 12)
    .map((project) => {
      const label = project.code || project.name || project.id || "Proyecto";
      const name = project.name && project.code && project.name !== project.code ? ` · ${project.name}` : "";
      return `<li title="${escCell(project.name || label)}">${escCell(label)}${escCell(name)}</li>`;
    })
    .join("")}${list.length > 12 ? `<li class="is-empty">+${list.length - 12} más</li>` : ""}</ul>`;
}

function renderLiveClientMasterCard(row, slotIndex) {
  const active = row.active !== false;
  const enterDisabled = active ? "" : " disabled";
  const statusBadge = active
    ? '<span class="badge success">Activo</span>'
    : '<span class="badge error">Inactivo</span>';
  const tradeName = row.tradeName || row.name || "Cliente";
  return `<article class="client-master-card is-live" data-client-id="${escCell(row.id)}" role="listitem">
    <header class="client-master-head">
      <div>
        <span class="client-slot-label">Cliente ${slotIndex}</span>
        <h3>${escCell(tradeName)}</h3>
        <p class="client-master-code">${escCell(row.code || "—")}</p>
      </div>
      ${statusBadge}
    </header>
    <dl class="client-master-grid">
      <div><dt>Nombre comercial</dt><dd>${escCell(clientFieldOrDash(row.tradeName || row.name))}</dd></div>
      <div><dt>Razón social</dt><dd>${escCell(clientFieldOrDash(row.legalName))}</dd></div>
      <div><dt>RFC</dt><dd>${escCell(clientFieldOrDash(row.rfc))}</dd></div>
      <div><dt>Estado</dt><dd>${active ? "Operativo" : "Inactivo"}</dd></div>
      <div><dt>Dirección</dt><dd>${escCell(formatClientAddress(row))}</dd></div>
      <div><dt>Teléfono</dt><dd>${escCell(clientFieldOrDash(row.phone || row.alternatePhone))}</dd></div>
      <div><dt>Correo</dt><dd>${escCell(clientFieldOrDash(row.email))}</dd></div>
      <div><dt>Contacto</dt><dd>${escCell(clientFieldOrDash(row.primaryContact))}</dd></div>
      <div><dt>Tel. contacto</dt><dd>${escCell(clientFieldOrDash(row.contactPhone))}</dd></div>
      <div><dt>Correo contacto</dt><dd>${escCell(clientFieldOrDash(row.contactEmail))}</dd></div>
    </dl>
    <div class="client-projects-block">
      <h4>Proyectos asociados (${escCell(String((row.projects || []).length || row._count?.projects || 0))})</h4>
      ${renderClientProjectsList(row.projects)}
    </div>
    <div class="client-context-actions">
      <button type="button" class="btn-primary btn-compact" data-enter-client="${escCell(row.id)}"${enterDisabled}>Entrar</button>
      <button type="button" class="btn-secondary btn-compact" data-manage-client="${escCell(row.id)}">Administrar</button>
    </div>
  </article>`;
}

function canAdminCreateProject() {
  return currentRole === "ADMIN";
}

function resolveClientForProjectForm(clientId) {
  const id = String(clientId || "").trim();
  if (!id) return null;
  const pools = [clientContextCatalog, realClientsCache];
  for (const pool of pools) {
    const found = (Array.isArray(pool) ? pool : []).find((row) => row && row.id === id);
    if (found) return found;
  }
  return { id };
}

function openAddProjectFromClientCard(clientId) {
  if (!canAdminCreateProject()) return false;
  const client = resolveClientForProjectForm(clientId);
  if (!client?.id) return false;
  void loadRealClientsQuiet().then(() => openProjectForm(null, client));
  return true;
}

function handleClientContextCardAction(target) {
  if (!target || typeof target.getAttribute !== "function") return { action: null };
  const closest = typeof target.closest === "function" ? (sel) => target.closest(sel) : () => null;
  if (closest("[data-placeholder-slot]")) {
    if (closest("[data-configure-client-slot]")) return { action: "configure" };
    return { action: "placeholder" };
  }
  const enterId = target.getAttribute("data-enter-client");
  if (enterId) return { action: "enter", clientId: enterId };
  const manageId = target.getAttribute("data-manage-client");
  if (manageId) return { action: "manage", clientId: manageId };
  const addProjectId = target.getAttribute("data-add-project-client");
  if (addProjectId) return { action: "add-project", clientId: addProjectId };
  if (typeof target.hasAttribute === "function" && target.hasAttribute("data-configure-client-slot")) {
    return { action: "configure" };
  }
  return { action: null };
}

function dispatchClientContextCardClick(target) {
  const parsed = handleClientContextCardAction(target);
  if (parsed.action === "configure") {
    setAdminClientGateVisible(false);
    navigateTo("inventario", "clients");
    return parsed;
  }
  if (parsed.action === "placeholder") return parsed;
  if (parsed.action === "enter") {
    void selectOperationalClient(parsed.clientId);
    return parsed;
  }
  if (parsed.action === "manage") {
    setAdminClientGateVisible(false);
    navigateTo("inventario", "clients");
    return parsed;
  }
  if (parsed.action === "add-project") {
    openAddProjectFromClientCard(parsed.clientId);
    return parsed;
  }
  return parsed;
}

function renderPlaceholderClientMasterCard(slotIndex) {
  return `<article class="client-master-card is-placeholder" data-placeholder-slot="${slotIndex}" role="listitem" aria-label="Cliente ${slotIndex} sin configurar">
    <header class="client-master-head">
      <div>
        <span class="client-slot-label">Cliente ${slotIndex}</span>
        <h3>Sin configurar</h3>
        <p class="client-master-code">PENDIENTE</p>
      </div>
      <span class="badge info">Reservado</span>
    </header>
    <dl class="client-master-grid">
      <div><dt>Nombre comercial</dt><dd>—</dd></div>
      <div><dt>Razón social</dt><dd>—</dd></div>
      <div><dt>RFC</dt><dd>—</dd></div>
      <div><dt>Estado</dt><dd>Pendiente de alta</dd></div>
      <div><dt>Dirección</dt><dd>—</dd></div>
      <div><dt>Teléfono</dt><dd>—</dd></div>
      <div><dt>Correo</dt><dd>—</dd></div>
      <div><dt>Contacto</dt><dd>—</dd></div>
      <div><dt>Tel. contacto</dt><dd>—</dd></div>
      <div><dt>Correo contacto</dt><dd>—</dd></div>
    </dl>
    <div class="client-projects-block">
      <h4>Proyectos asociados</h4>
      <p class="client-placeholder-note">Estructura lista. Cuando se dé de alta el cliente, sus proyectos aparecerán aquí.</p>
    </div>
    <div class="client-context-actions client-context-actions-placeholder">
      <button type="button" class="btn-primary btn-compact" data-configure-client-slot="${slotIndex}">Configurar</button>
      <button type="button" class="btn-secondary btn-compact" disabled aria-disabled="true" tabindex="-1">Entrar</button>
    </div>
  </article>`;
}

function renderClientContextCards(query = "") {
  if (!clientContextCards) return;
  const needle = String(query || "").trim().toLowerCase();
  const rows = (clientContextCatalog || []).filter((row) => {
    if (!needle) return true;
    return [row.code, row.name, row.tradeName, row.legalName, row.rfc]
      .map((value) => String(value || "").toLowerCase())
      .some((value) => value.includes(needle));
  });
  if (needle) {
    if (!rows.length) {
      clientContextCards.innerHTML = '<p class="subtitle">No hay clientes que coincidan con la búsqueda.</p>';
      return;
    }
    clientContextCards.innerHTML = rows
      .map((row, index) => renderLiveClientMasterCard(row, index + 1))
      .join("");
    return;
  }
  const cards = rows.map((row, index) => renderLiveClientMasterCard(row, index + 1));
  for (let slot = cards.length + 1; slot <= 3; slot += 1) {
    cards.push(renderPlaceholderClientMasterCard(slot));
  }
  if (!rows.length) {
    clientContextCards.innerHTML = `${cards.join("")}<p class="subtitle" style="grid-column:1/-1;margin:4px 0 0">Aún no hay clientes reales. Usa «Agregar cliente» para dar de alta el primero.</p>`;
    return;
  }
  clientContextCards.innerHTML = cards.join("");
}

async function enrichClientContextCatalog(rows) {
  const list = Array.isArray(rows) ? rows : [];
  const enriched = await Promise.all(
    list.map(async (row) => {
      if (Array.isArray(row.projects)) return row;
      try {
        const response = await authenticatedFetch(`/api/clients/${encodeURIComponent(row.id)}`);
        if (!response || !response.ok) return row;
        const detail = await response.json().catch(() => null);
        if (!detail || typeof detail !== "object") return row;
        return {
          ...row,
          ...detail,
          projects: Array.isArray(detail.projects) ? detail.projects : [],
          _count: row._count || { projects: (detail.projects || []).length }
        };
      } catch (_err) {
        return row;
      }
    })
  );
  return enriched;
}

async function loadAdminClientCatalog() {
  if (clientContextStatus) clientContextStatus.textContent = "Cargando clientes…";
  const response = await authenticatedFetch("/api/clients");
  if (!response) {
    if (clientContextStatus) clientContextStatus.textContent = "No se pudieron cargar los clientes.";
    return;
  }
  if (!response.ok) {
    if (clientContextStatus) clientContextStatus.textContent = "No se pudieron cargar los clientes.";
    return;
  }
  const rows = await response.json().catch(() => []);
  const base = Array.isArray(rows) ? rows : [];
  clientContextCatalog = await enrichClientContextCatalog(base);
  renderClientContextCards(clientContextSearch?.value || "");
  if (clientContextStatus) {
    clientContextStatus.textContent = clientContextCatalog.length
      ? `${clientContextCatalog.length} cliente(s) real(es). Los slots 2 y 3 quedan reservados hasta su alta. Solo activos pueden abrirse operativamente.`
      : "No hay clientes registrados. Los tres slots muestran la estructura lista para configurar.";
  }
}

async function showAdminClientPicker(reason) {
  awaitingAdminClient = true;
  operationalClient = null;
  setAdminClientGateVisible(true);
  updateActiveClientChrome();
  if (clientContextStatus) {
    clientContextStatus.textContent =
      reason === "invalid"
        ? "El cliente seleccionado no existe o está inactivo. Elige otro."
        : "Selecciona un cliente activo para abrir Inventario, Operación o Control.";
  }
  await loadAdminClientCatalog();
}

function hideAdminClientPicker() {
  awaitingAdminClient = false;
  setAdminClientGateVisible(false);
}

async function selectOperationalClient(clientId) {
  const response = await authenticatedFetch("/api/auth/select-client", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ clientId })
  });
  if (!response) return;
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (clientContextStatus) {
      clientContextStatus.textContent = data.message || "No se pudo seleccionar el cliente.";
    }
    if (data.code === "CLIENT_CONTEXT_INVALID") {
      await loadAdminClientCatalog();
    }
    return;
  }
  persistAccessToken(data.accessToken);
  clearOperationalClientState();
  operationalClient = data.operationalClient || data.client || null;
  hideAdminClientPicker();
  updateActiveClientChrome();
  await loadOperationalWorkspace();
  applySessionRoute();
}

async function clearAdminOperationalClient() {
  const response = await authenticatedFetch("/api/auth/clear-client", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}"
  });
  if (response?.ok) {
    const data = await response.json().catch(() => ({}));
    persistAccessToken(data.accessToken);
  }
  operationalClient = null;
  clearOperationalClientState();
  await showAdminClientPicker();
}

async function loadOperationalWorkspace() {
  if (currentRole === "ADMIN" && !operationalClient) {
    await showAdminClientPicker();
    await loadUsersModule(currentRole);
    return;
  }
  hideAdminClientPicker();
  updateActiveClientChrome();
  await loadUsersModule(currentRole);
  await loadCatalogData();
  await loadRealClientsQuiet().catch(() => {});
  updateInventoryScopeUi();
  if (currentRole === "ADMIN" || currentRole === "OPERATOR" || currentRole === "SUPERVISOR") {
    await loadStockStrip();
    await loadInventoryMovements();
    await loadScanEvents();
  } else if (scanEventsList) {
    scanEventsList.innerHTML =
      '<p class="subtitle" style="margin:0">El historial de picking no aplica a tu rol.</p>';
  }
}
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
const inventoryMovementsList = document.getElementById("inventoryMovementsList");
const catalogImportSection = document.getElementById("catalogImportSection");
const catalogImportCsv = document.getElementById("catalogImportCsv");
const catalogImportResult = document.getElementById("catalogImportResult");
const catalogPreviewBtn = document.getElementById("catalogPreviewBtn");
const catalogApplyBtn = document.getElementById("catalogApplyBtn");
const catalogImportFile = document.getElementById("catalogImportFile");
const catalogImportFileStatus = document.getElementById("catalogImportFileStatus");
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
const labResetSection = document.getElementById("labResetSection");
const labResetOpenBtn = document.getElementById("labResetOpenBtn");
const labResetModal = document.getElementById("labResetModal");
const labResetAck = document.getElementById("labResetAck");
const labResetConfirmBtn = document.getElementById("labResetConfirmBtn");
const labResetCancelBtn = document.getElementById("labResetCancelBtn");
const labResetCloseX = document.getElementById("labResetCloseX");
const labResetCounts = document.getElementById("labResetCounts");
const labResetPreviewStatus = document.getElementById("labResetPreviewStatus");
const labResetPreviewBlock = document.getElementById("labResetPreviewBlock");
const labResetResultBlock = document.getElementById("labResetResultBlock");
const labResetBeforeCounts = document.getElementById("labResetBeforeCounts");
const labResetAfterCounts = document.getElementById("labResetAfterCounts");
const labResetSnapshot = document.getElementById("labResetSnapshot");
const labResetBusyStatus = document.getElementById("labResetBusyStatus");
const labResetError = document.getElementById("labResetError");
let labResetBusy = false;
let labResetAvailable = false;
let labResetCompleted = false;
const physicalInventoryResetBtns = [
  document.getElementById("physicalInventoryResetImportBtn")
].filter(Boolean);
const physicalInventoryResetModal = document.getElementById("physicalInventoryResetModal");
const physicalInventoryResetPhrase = document.getElementById("physicalInventoryResetPhrase");
const physicalInventoryResetConfirmBtn = document.getElementById("physicalInventoryResetConfirmBtn");
const physicalInventoryResetCancelBtn = document.getElementById("physicalInventoryResetCancelBtn");
const physicalInventoryResetCloseX = document.getElementById("physicalInventoryResetCloseX");
const physicalInventoryResetBusyStatus = document.getElementById("physicalInventoryResetBusyStatus");
const physicalInventoryResetError = document.getElementById("physicalInventoryResetError");
const physicalInventoryResetSuccess = document.getElementById("physicalInventoryResetSuccess");
let physicalInventoryResetBusy = false;

let currentRole = null;
let currentUserId = null;
let currentUserClient = null;
let mustChangePassword = false;
let usersCache = [];
let operationalHistoryPreview = null;
let adminSelectedClientId = "";
let movementsNextCursor = null;
let movementsRows = [];
let catalogApplyCompleted = false;
let stockRowsCache = [];
/** @type {Array<{ id?: string, code?: string, warehouse?: string, active?: boolean }>} */
let relocateLocationsCache = [];
let productsCache = [];
let movementsCountCache = 0;
let movementsRowsCache = [];
let inventoryKpiCache = null;
let inventoryUnpricedOnly = false;
let pendingConflictsCache = 0;

let clientsCache = [];

const PRIMARY_CLIENT_AVIAT = "AVIAT";
const PRIMARY_CLIENT_AVIAT_NAME = "AVIAT";
const LEGACY_AVIAT_PROJECT_FILTER_KEY = "logitec_aviat_project_filter";

let inventoryProjectsCache = [];
let realClientsCache = [];
let warehousesCatalogCache = [];
let locationsCatalogCache = [];
let catalogProjectsCache = [];
let inventoryScope = { projectId: "", assignmentType: "" };
let inventorySkuSelectedContext = null;
let inventorySkuSelectedListEl = null;
let environmentDisplayName = "Desarrollo";
let inventoryScopeWired = false;
let importConfirmResolver = null;

function clearLegacyAviatProjectFilter() {
  try {
    localStorage.removeItem(LEGACY_AVIAT_PROJECT_FILTER_KEY);
  } catch (_e) {
    /* ignore */
  }
}

function inventoryScopeFromAssignmentOpt(assignmentType) {
  const current = getInventoryScope();
  const value = String(assignmentType || "").trim().toUpperCase();
  if (value === "FREE_TO_SALE") return { projectId: "", assignmentType: "FREE_TO_SALE" };
  if (value === "PROJECT") return { projectId: current.projectId, assignmentType: "PROJECT" };
  return { projectId: "", assignmentType: "" };
}

let requisitionSkuSelectedContext = null;
let requisitionSkuSelectedListEl = null;

function rememberInventorySkuSelectedContext(listEl, context) {
  if (listEl?.id !== "invFilterSkuSuggestions" || !context?.product) return;
  inventorySkuSelectedContext = context;
  inventorySkuSelectedListEl = listEl;
}

function clearInventorySkuSelectedContext() {
  inventorySkuSelectedContext = null;
  inventorySkuSelectedListEl = null;
}

function refreshInventorySkuSelectedCard() {
  if (!inventorySkuSelectedContext?.product) return;
  const listEl = inventorySkuSelectedListEl || document.getElementById("invFilterSkuSuggestions");
  if (!listEl) return;
  renderSkuContext(listEl, inventorySkuSelectedContext);
}

function rememberRequisitionSkuSelectedContext(listEl, context) {
  const prefix = typeof opsPrefixFromTypeahead === "function" ? opsPrefixFromTypeahead(listEl, null) : "";
  if ((prefix !== "req" && listEl?.id !== "reqSkuSuggestions") || !context?.product) return;
  requisitionSkuSelectedContext = context;
  requisitionSkuSelectedListEl = listEl;
}

function clearRequisitionSkuSelectedContext() {
  requisitionSkuSelectedContext = null;
  requisitionSkuSelectedListEl = null;
}

function refreshRequisitionSkuSelectedCard() {
  if (!requisitionSkuSelectedContext?.product) return;
  const listEl = requisitionSkuSelectedListEl || document.getElementById("reqSkuSuggestions");
  if (!listEl) return;
  renderSkuContext(listEl, requisitionSkuSelectedContext);
}

function getInventoryScope() {
  const projectId = String(inventoryScope.projectId || "").trim();
  const assignmentType = projectId
    ? "PROJECT"
    : String(inventoryScope.assignmentType || "").trim().toUpperCase();
  return {
    projectId,
    assignmentType: assignmentType === "PROJECT" || assignmentType === "FREE_TO_SALE" ? assignmentType : ""
  };
}

function hasActiveInventoryScope() {
  const scope = getInventoryScope();
  return Boolean(scope.projectId || scope.assignmentType);
}

function inventoryScopeQueryString() {
  const scope = getInventoryScope();
  const params = new URLSearchParams();
  if (scope.projectId) {
    params.set("projectId", scope.projectId);
    params.set("assignmentType", "PROJECT");
  } else if (scope.assignmentType) {
    params.set("assignmentType", scope.assignmentType);
  }
  const qs = params.toString();
  const clientId = "";
  const withClient = params.toString();
  return withClient ? `?${withClient}` : "";
}

function inventoryScopeLabel() {
  const scope = getInventoryScope();
  if (scope.projectId) {
    const project = inventoryProjectsCache.find((p) => p.id === scope.projectId);
    return project?.name || project?.code || "Proyecto seleccionado";
  }
  return "Todos los proyectos";
}

function inventoryAssignmentScopeLabel() {
  const scope = getInventoryScope();
  if (scope.projectId || scope.assignmentType === "PROJECT") return "Con proyecto";
  if (scope.assignmentType === "FREE_TO_SALE") return "FREE TO SALE";
  return "Todas";
}

function getAviatScopeSummaryText() {
  return `Cliente: ${owningClientDisplayName()} · Proyecto: ${inventoryScopeLabel()} · Asignación: ${inventoryAssignmentScopeLabel()}`;
}

function getAviatExportBasename(kind) {
  const scope = getInventoryScope();
  const clientToken = owningClientExportToken();
  if (scope.projectId) {
    const project = inventoryProjectsCache.find((p) => p.id === scope.projectId);
    const token = String(project?.code || scope.projectId).replace(/[^\w]+/g, "_");
    return `${kind}_${clientToken}_${token}`;
  }
  if (scope.assignmentType === "FREE_TO_SALE") return `${kind}_${clientToken}_FREE_TO_SALE`;
  if (scope.assignmentType === "PROJECT") return `${kind}_${clientToken}_PROJECT`;
  return `${kind}_${clientToken}`;
}

function fillInventoryProjectSelects() {
  const scope = getInventoryScope();
  const isClient = typeof currentRole !== "undefined" && currentRole === "CLIENT";
  document.querySelectorAll(".js-admin-client-filter").forEach((wrap) => {
    wrap.classList.add("hidden");
  });
  const options = [`<option value="">${isClient ? "Todos los proyectos de mi cliente" : "Todos los proyectos"}</option>`]
    .concat(
      inventoryProjectsCache.map(
        (p) =>
          `<option value="${escCell(p.id)}">${escCell(p.name || p.code)} (${escCell(p.code)})</option>`
      )
    )
    .join("");
  document.querySelectorAll(".js-inventory-project-select").forEach((sel) => {
    const current = scope.projectId;
    sel.innerHTML = options;
    sel.value = current && inventoryProjectsCache.some((p) => p.id === current) ? current : "";
    sel.disabled = scope.assignmentType === "FREE_TO_SALE" && !scope.projectId;
  });
  document.querySelectorAll(".js-assignment-opt").forEach((btn) => {
    const value = btn.getAttribute("data-assignment") || "";
    const activeValue = scope.projectId ? "PROJECT" : scope.assignmentType;
    const isActive = value === activeValue;
    btn.classList.toggle("active", isActive);
    btn.setAttribute("aria-pressed", isActive ? "true" : "false");
    btn.disabled = Boolean(scope.projectId) && value === "FREE_TO_SALE";
    if (btn.style) btn.style.display = "";
  });
}

function updateInventoryScopeUi() {
  const projectLabel = inventoryScopeLabel();
  const assignmentLabel = inventoryAssignmentScopeLabel();
  const clientLabel = owningClientDisplayName();
  document.querySelectorAll("[data-aviat-primary-label]").forEach((el) => {
    el.textContent = clientLabel;
  });
  document.querySelectorAll("[data-aviat-project-label]").forEach((el) => {
    el.textContent = projectLabel;
  });
  document.querySelectorAll("[data-aviat-assignment-label]").forEach((el) => {
    el.textContent = assignmentLabel;
  });
  const scopeText = getAviatScopeSummaryText();
  ["aviatScopeControl", "aviatScopeInventory", "aviatScopeCatalog", "aviatScopeTrace"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.textContent = scopeText;
  });
  const ccTitle = document.getElementById("ccModuleTitle");
  if (ccTitle) ccTitle.textContent = `Centro de Control — ${clientLabel}`;
  const invTitle = document.getElementById("inventoryModuleTitle");
  if (invTitle) invTitle.textContent = `Inventario de ${clientLabel}`;
  const catTitle = document.getElementById("catalogModuleTitle");
  if (catTitle) catTitle.textContent = `Catálogo de ${clientLabel}`;
  fillInventoryProjectSelects();
  renderProjectsStockList();
}

async function setInventoryScope(next, { reload = true } = {}) {
  const projectId = String(next.projectId || "").trim();
  let assignmentType = String(next.assignmentType || "").trim().toUpperCase();
  if (projectId) assignmentType = "PROJECT";
  if (assignmentType === "FREE_TO_SALE") {
    inventoryScope = { projectId: "", assignmentType: "FREE_TO_SALE" };
  } else if (assignmentType === "PROJECT") {
    inventoryScope = { projectId, assignmentType: "PROJECT" };
  } else {
    inventoryScope = { projectId: "", assignmentType: "" };
  }
  updateInventoryScopeUi();
  refreshInventorySkuSelectedCard();
  if (reload) {
    await Promise.all([loadStockStrip(), loadInventoryMovements()]);
  }
}

async function loadInventoryProjects() {
  const response = await authenticatedFetch("/api/inventory/projects");
  const rows = response?.ok ? await response.json() : [];
  inventoryProjectsCache = Array.isArray(rows)
    ? rows.filter((p) => p && p.id && Number(p.qty) > 0 && !isForbiddenProjectLabel(p.code) && !isForbiddenProjectLabel(p.name))
    : [];
  const selected = getInventoryScope().projectId;
  if (selected && !inventoryProjectsCache.some((p) => p.id === selected)) {
    inventoryScope.projectId = "";
    if (inventoryScope.assignmentType === "PROJECT") inventoryScope.assignmentType = "";
  }
  updateInventoryScopeUi();
  return inventoryProjectsCache;
}

function renderProjectsStockList() {
  const box = document.getElementById("projectsStockList");
  if (!box) return;
  if (!inventoryProjectsCache.length) {
    box.innerHTML = `<p class="filter-hint">No hay proyectos con existencias asignadas.</p>`;
    return;
  }
  const econ = canSeeEconomicValuation();
  const canEditMaster = currentRole === "ADMIN";
  const head = econ
    ? `<tr><th>Proyecto</th><th>Código</th><th>Cubos</th><th>Qty</th><th>Valor inventario MXN</th><th>Piezas sin valor</th><th>Cobertura económica</th><th>Acciones</th></tr>`
    : `<tr><th>Proyecto</th><th>Código</th><th>Cubos</th><th>Qty</th><th>Acciones</th></tr>`;
  const body = inventoryProjectsCache
    .map((p) => {
      const extra = econ
        ? `<td class="numeric-cell">${escCell(formatMxn(p.inventoryValueMxn ?? p.valuation?.totalValueMxn))}</td><td class="numeric-cell">${escCell(
            formatQty(p.qtyUnvalued ?? p.valuation?.qtyUnvalued ?? 0)
          )}</td><td class="numeric-cell">${escCell(p.coveragePct ?? p.valuation?.coveragePct ?? "0.00")}%</td>`
        : "";
      const masterBtn = canEditMaster
        ? `<button type="button" class="btn-secondary btn-compact js-open-project-master" data-project-id="${escCell(p.id)}">Datos maestro</button>`
        : "";
      return `<tr><td>${escCell(p.name)}</td><td>${escCell(p.code)}</td><td>${p.cubes}</td><td>${formatQty(
        p.qty
      )}</td>${extra}<td><button type="button" class="btn-primary btn-compact js-open-project-stock" data-project-id="${escCell(
        p.id
      )}">Ver existencias</button> ${masterBtn}</td></tr>`;
    })
    .join("");
  const ftsRows = (Array.isArray(stockRowsCache) ? stockRowsCache : []).filter(isFreeToSaleRow);
  const ftsValuation = econ ? aggregateRowValuations(ftsRows) : null;
  const ftsNote = ftsRows.length
    ? `<p class="fts-assignment-note">Asignación Free to Sale (no es proyecto): ${ftsRows.length} cubos · ${formatQty(
        ftsValuation ? ftsValuation.qtyTotal : sumStockQty(ftsRows)
      )} pzas${
        econ
          ? ` · ${formatMxn(ftsValuation.totalValueMxn)} · cobertura ${ftsValuation.coveragePct}%`
          : ""
      }</p>`
    : "";
  box.innerHTML = `<table class="projects-stock-table"><thead>${head}</thead><tbody>${body}</tbody></table>${ftsNote}`;
  box.querySelectorAll(".js-open-project-stock").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-project-id") || "";
      announceNav("Abre Inventario → Existencias filtrado por este proyecto.");
      void setInventoryScope({ projectId: id, assignmentType: "PROJECT" }).then(() => {
        navigateTo("inventario", "inventory");
      });
    });
  });
  box.querySelectorAll(".js-open-project-master").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (currentRole !== "ADMIN") return;
      const id = btn.getAttribute("data-project-id") || "";
      void openProjectDetail(id);
    });
  });
}

function wireInventoryScopeUi() {
  clearLegacyAviatProjectFilter();
  if (inventoryScopeWired) {
    updateInventoryScopeUi();
    return;
  }
  inventoryScopeWired = true;
  document.querySelectorAll(".js-inventory-client-select").forEach((sel) => {
    sel.addEventListener("change", () => {
      adminSelectedClientId = sel.value || "";
      document.querySelectorAll(".js-inventory-client-select").forEach((other) => {
        if (other !== sel) other.value = adminSelectedClientId;
      });
      void setInventoryScope(getInventoryScope());
    });
  });
  document.querySelectorAll(".js-inventory-project-select").forEach((sel) => {
    sel.addEventListener("change", () => {
      const projectId = sel.value || "";
      void setInventoryScope({
        projectId,
        assignmentType: projectId ? "PROJECT" : ""
      });
    });
  });
  document.querySelectorAll(".js-assignment-opt").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (btn.disabled) return;
      const assignmentType = btn.getAttribute("data-assignment") || "";
      void setInventoryScope(inventoryScopeFromAssignmentOpt(assignmentType));
    });
  });
  updateInventoryScopeUi();
}

function filterRowsByAviatProject(rows) {
  return Array.isArray(rows) ? rows : [];
}

function isForbiddenProjectLabel(value) {
  const normalized = String(value || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, " ");
  return (
    normalized === "LOGITEC" ||
    normalized === "FREE TO SALE" ||
    normalized === "FREE_TO_SALE" ||
    normalized === "CUSTOMER OWNS" ||
    normalized === "CUSTOMR OWNS" ||
    normalized === "ASO"
  );
}

function isOperationalProjectRecord(project) {
  if (!project) return false;
  if (project.active === false) return false;
  if (isForbiddenProjectLabel(project.code) || isForbiddenProjectLabel(project.name)) return false;
  return Boolean(project.id || project.code);
}

function getOperationalProjectsForSelect(catalog) {
  const rows = Array.isArray(catalog) ? catalog : Array.isArray(catalogProjectsCache) ? catalogProjectsCache : [];
  return rows
    .filter(isOperationalProjectRecord)
    .map((project) => ({
      id: project.id,
      code: project.code,
      name: project.name || project.code,
      active: project.active,
      clientId: project.clientId || project.client?.id || "",
      client: project.client
    }))
    .sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "es"));
}

function historicalNonOperationalAssignmentLabel() {
  return "Asignación histórica/no operativa";
}

function owningClientDisplayName() {
  const client = operationalClient || (currentRole === "CLIENT" || currentRole === "SUPERVISOR" || currentRole === "OPERATOR" ? currentUserClient : null);
  return String(client?.tradeName || client?.legalName || client?.name || "").trim() || (awaitingAdminClient ? "Seleccionar cliente" : "—");
}

function owningClientExportToken() {
  const client = operationalClient || currentUserClient;
  return String(client?.code || client?.name || "CLIENT").replace(/[^\w]+/g, "_");
}

function selectedAdminClientId() {
  return "";
}

function canonicalClientDisplay(source) {
  const candidates = [
    source?.client?.tradeName,
    source?.client?.legalName,
    source?.client?.name,
    source?.project?.client?.tradeName,
    source?.project?.client?.legalName,
    source?.project?.client?.name,
    source?.tradeName,
    source?.legalName,
    source?.code
  ];
  for (const value of candidates) {
    const label = String(value || "").trim();
    if (label && !isForbiddenProjectLabel(label)) return label;
  }
  return typeof owningClientDisplayName === "function" ? owningClientDisplayName() : "—";
}

function isSuggestedOperationalProject(item) {
  if (!item) return false;
  if (item.assignmentType === "FREE_TO_SALE") return false;
  const project = {
    id: item.projectId || item.project?.id || "",
    code: item.projectCode || item.project?.code || "",
    name: item.projectName || item.project?.name || ""
  };
  if (!project.code && !project.name && !project.id) return false;
  return isOperationalProjectRecord(project);
}

function applyOperationalProjectToSelect(selectId, item) {
  if (!isSuggestedOperationalProject(item)) return false;
  return setSelectValueFlexible(selectId, item.projectCode || item.project?.code || "");
}

function getAviatProjectFromRow(row) {
  if (row?.assignmentType === "FREE_TO_SALE" || row?.assignmentKey === "FREE_TO_SALE") {
    return { code: "", name: "FREE TO SALE" };
  }
  const code = String(row?.project?.code || "").trim();
  const name = String(row?.project?.name || "").trim();
  if (code || name) {
    if (isForbiddenProjectLabel(code) || isForbiddenProjectLabel(name)) {
      return { code: "", name: "" };
    }
    return { code, name: name || code };
  }
  return { code: "", name: "" };
}

function getAviatProjectDisplayFromRow(row) {
  const project = getAviatProjectFromRow(row);
  return project.name || project.code || "—";
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

function updateAviatHeaderUi() {
  updateInventoryScopeUi();
}

function refreshAviatScopedViews() {
  updateInventoryScopeUi();
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
  wireInventoryScopeUi();
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
    "control", "tasks", "picking", "inbound", "relocate", "requisitions", "outbound",
    "incidents", "inventory", "catalog", "projects", "warehouses", "locations", "clients",
    "traceability", "reports", "users", "config", "account"
  ],
  SUPERVISOR: [
    "control", "tasks", "picking", "inbound", "relocate", "requisitions", "outbound",
    "incidents", "inventory", "catalog", "projects", "warehouses", "locations",
    "traceability", "reports", "account"
  ],
  OPERATOR: [
    "control", "tasks", "picking", "inbound", "relocate", "requisitions", "outbound",
    "incidents", "inventory", "catalog", "projects", "warehouses", "locations", "traceability", "account"
  ],
  CLIENT: [
    "inventory", "catalog", "projects", "warehouses", "locations",
    "requisitions", "traceability", "reports", "account"
  ]
};

/** Secciones de menú. clients se mantiene en registry pero fuera del menú principal. */
const NAV_SECTION_MODULES = {
  inicio: ["control", "tasks", "picking", "incidents"],
  operacion: ["inbound", "requisitions", "picking", "relocate", "outbound"],
  inventario: ["inventory", "clients", "catalog", "projects", "warehouses", "locations"],
  control: ["incidents", "traceability", "reports"],
  sistema: ["account", "users", "config"]
};

/** Módulo landing al clic en cada pestaña principal (v41). */
const NAV_SECTION_DEFAULTS = {
  inicio: "control",
  operacion: "inbound",
  inventario: "inventory",
  control: "incidents",
  sistema: "account"
};

let currentNavSection = "inicio";
let currentModuleName = null;
const ACTIVE_NAV_STORAGE_KEY = "logitec_active_nav";
let userSelectedNavDuringBoot = false;
let pendingUserNav = null;

function isSafeNavToken(value) {
  return typeof value === "string" && /^[a-z0-9_-]+$/i.test(value);
}

function clearStoredNavRoute() {
  try {
    sessionStorage.removeItem(ACTIVE_NAV_STORAGE_KEY);
  } catch (_e) {
    /* ignore private mode */
  }
}

function persistNavRoute(section, moduleName) {
  if (!isSafeNavToken(section) || !isSafeNavToken(moduleName)) return;
  try {
    sessionStorage.setItem(ACTIVE_NAV_STORAGE_KEY, JSON.stringify({ section, module: moduleName }));
  } catch (_e) {
    /* ignore quota / private mode */
  }
}

function readStoredNavRoute() {
  try {
    const raw = sessionStorage.getItem(ACTIVE_NAV_STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    const section = typeof data?.section === "string" ? data.section.trim() : "";
    const moduleName = typeof data?.module === "string" ? data.module.trim() : "";
    if (!isSafeNavToken(section)) return null;
    return { section, module: isSafeNavToken(moduleName) ? moduleName : "" };
  } catch (_e) {
    return null;
  }
}

function resolveStoredNavRoute(role) {
  const stored = readStoredNavRoute();
  if (!stored) return null;
  const allowed = roleModules[role] || [];
  const sectionMods = NAV_SECTION_MODULES[stored.section];
  if (!sectionMods) return null;
  let moduleName = stored.module;
  if (!moduleName) {
    const preferred = NAV_SECTION_DEFAULTS[stored.section];
    moduleName =
      preferred && allowed.includes(preferred) && sectionMods.includes(preferred)
        ? preferred
        : sectionMods.find((item) => allowed.includes(item)) || "";
  }
  if (!moduleName || !sectionMods.includes(moduleName) || !allowed.includes(moduleName)) {
    return null;
  }
  return { section: stored.section, module: moduleName };
}

function noteUserNavChoice(sectionId, moduleName) {
  userSelectedNavDuringBoot = true;
  pendingUserNav = { section: sectionId || null, module: moduleName || null };
  if (sectionId && moduleName) persistNavRoute(sectionId, moduleName);
}

function applyDefaultLandingRoute() {
  const landing = defaultLandingModule[currentRole] || roleModules[currentRole]?.[0] || "account";
  const landingSection = resolveSectionForModule(landing, "inicio");
  navigateTo(landingSection, landing);
}

function applySessionRoute() {
  if (!currentRole) return;
  if (currentRole === "ADMIN" && awaitingAdminClient) return;
  if (userSelectedNavDuringBoot) {
    if (pendingUserNav) {
      navigateTo(pendingUserNav.section, pendingUserNav.module);
      return;
    }
    if (currentModuleName) return;
  }
  if (typeof applyModuleDeepLinkFromHash === "function" && applyModuleDeepLinkFromHash()) return;
  const restored = resolveStoredNavRoute(currentRole);
  if (restored) {
    navigateTo(restored.section, restored.module);
    return;
  }
  applyDefaultLandingRoute();
}

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
  CLIENT: "inventory"
};

const MODULE_REGISTRY = {
  control: moduleControlCenter,
  clients: moduleClients,
  catalog: moduleCatalog,
  inventory: moduleInventory,
  inbound: moduleInbound,
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

function announceNav(text) {
  const el = document.getElementById("navAnnounce");
  if (el) el.textContent = text || "";
}

function isSistemaWorkspaceModule(mod) {
  return mod === "users" || mod === "config" || mod === "account";
}

function showSistemaWorkspace() {
  const panes = {
    account: document.getElementById("moduleAccount"),
    users: document.getElementById("moduleUsers"),
    config: document.getElementById("moduleConfig")
  };
  Object.entries(panes).forEach(([mod, el]) => {
    if (!el) return;
    const allowed = mod === "account" || currentRole === "ADMIN";
    const show = allowed && currentModuleName === mod;
    el.classList.toggle("hidden", !show);
    el.style.display = show ? "" : "none";
  });
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
  clearStoredNavRoute();
  localStorage.removeItem("token");
  window.location.replace("/login.html");
}

if (!currentAccessToken()) {
  forceLogout();
}

function getDefaultModuleForSection(sectionId) {
  const allowed = roleModules[currentRole] || [];
  const sectionMods = NAV_SECTION_MODULES[sectionId] || [];

  if (sectionId === "sistema") {
    if (allowed.includes("account")) return "account";
    if (currentRole === "ADMIN" && allowed.includes("users")) return "users";
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
  if (mustChangePassword) {
    section = "sistema";
    mod = "account";
  }

  let fromBulkInbound = false;
  if (mod === "bulk-inbound") {
    fromBulkInbound = true;
    section = "inventario";
    mod = "inventory";
  }

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
  if (currentRole === "ADMIN" && awaitingAdminClient && mod && !isAdminGlobalModule(mod)) {
    void showAdminClientPicker();
    return;
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
  document.body.classList.toggle("sistema-workspace", section === "sistema" && isSistemaWorkspaceModule(mod));
  setNavSection(section);
  currentNavSection = section;
  currentModuleName = mod;
  persistNavRoute(section, mod);
  if (fromBulkInbound) {
    announceNav("Entrada masiva abre Inventario → Existencias. Un solo asistente de importación; no hay un segundo importador.");
  }
  document.querySelectorAll(".js-inv-master-tab").forEach((btn) => {
    btn.classList.toggle("active", btn.getAttribute("data-inv-master-tab") === mod);
  });

  const activeEl = MODULE_REGISTRY[mod];
  if (activeEl) activeEl.classList.remove("hidden");
  if (section === "sistema" && isSistemaWorkspaceModule(mod)) {
    showSistemaWorkspace();
  }

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
    showProjects ||
    showWarehouses ||
    showLocations ||
    showConfig;

  if (modulePlaceholder) modulePlaceholder.classList.toggle("hidden", hasKnownModule);

  if (showControl) refreshControlCenter();
  if (showClients) void loadRealClientsModule();
  if (showProjects) renderProjectsModule();
  if (showWarehouses) void loadWarehousesModule();
  if (showLocations) void loadLocationsModule();
  if (showInventory) {
    updateAviatHeaderUi();
    applyInventoryFilters();
    if (currentRole === "ADMIN") void probeResumableImport();
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
    void loadRelocateLocationsCatalog().then(() => {
      if (typeof syncRelocateLocationSelects === "function") syncRelocateLocationSelects();
      if (typeof syncRelocateFormState === "function") syncRelocateFormState();
    });
    if (typeof syncRelocateFormState === "function") syncRelocateFormState();
  }
  if (showConfig && currentRole === "ADMIN") {
    void refreshImportHistory();
    void probeResumableImport();
  }
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
    void loadPickRequisitions();
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

function canAdministerInventoryImport() {
  return currentRole === "ADMIN";
}

/**
 * Único acceso administrativo al importador vivo en Sistema → Configuración.
 * No abre el modal legado ni dispara cargas. No sube ni confirma archivos.
 */
function openInventoryImportAssistant() {
  if (!canAdministerInventoryImport()) return false;
  navigateTo("inventario", "inventory");
  const panel = document.getElementById("importWizardPanel");
  if (!panel) return false;
  hideImportCompletionNotice();
  syncImportInventoryModeUi();
  if (isTerminalImportUiBatch(importUi.batchStatus) || importUi.confirmed) {
    dismissImportWizardSession({ clearStoredBatch: true });
  }
  openImportWizardPanel();
  void probeResumableImport();
  window.setTimeout(() => {
    panel.scrollIntoView({ behavior: "smooth", block: "start" });
    const focusEl = document.getElementById("importContext") || panel;
    if (focusEl === panel && !panel.hasAttribute("tabindex")) {
      panel.setAttribute("tabindex", "-1");
    }
    try {
      focusEl.focus({ preventScroll: true });
    } catch (_err) {
      focusEl.focus();
    }
  }, 0);
  return true;
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
  const epoch = clientContextEpoch;
  const response = await fetch(path, {
    method: "GET",
    ...options,
    cache: options.cache || "no-store",
    headers: {
      Authorization: `Bearer ${currentAccessToken()}`,
      ...(options.headers || {})
    }
  });

  if (epoch !== clientContextEpoch) {
    return null;
  }

  if (response.status === 401) {
    forceLogout();
    return null;
  }

  if (response.status === 403) {
    const payload = await response.clone().json().catch(() => ({}));
    if (payload.code === "CLIENT_CONTEXT_REQUIRED" || payload.code === "CLIENT_CONTEXT_INVALID") {
      if (currentRole === "ADMIN") {
        operationalClient = null;
        void showAdminClientPicker(payload.code === "CLIENT_CONTEXT_INVALID" ? "invalid" : "required");
      }
      return null;
    }
    if (payload.code === "USER_CLIENT_REQUIRED") {
      if (statusBox) {
        statusBox.innerHTML = '<span class="error">El usuario no tiene un cliente asignado.</span>';
      }
      return null;
    }
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
    environmentDisplayName = environment === "qa" ? "QA" : environment === "production" ? "Producción" : "Desarrollo";
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
const GRID_DENSITY_DEFAULT_VERSION_KEY = "logitec_grid_density_default_version";
const GRID_DENSITY_DEFAULT_VERSION = "compact-workspace-v1";
const GRID_SELECTION_PREFIX = "logitec_grid_sel_";

const GRID_DEFAULT_WIDTHS = {
  inventory: [140, 90, 170, 260, 110, 140, 110, 90],
  inventory_econ: [180, 90, 170, 220, 100, 120, 100, 80, 120, 120, 110],
  catalog: [140, 90, 170, 260, 110, 150],
  catalog_econ: [200, 90, 170, 220, 110, 140, 140, 120, 110],
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
  if (localStorage.getItem(GRID_DENSITY_DEFAULT_VERSION_KEY) !== GRID_DENSITY_DEFAULT_VERSION) {
    localStorage.setItem(GRID_DENSITY_KEY, "compact");
    localStorage.setItem(GRID_DENSITY_DEFAULT_VERSION_KEY, GRID_DENSITY_DEFAULT_VERSION);
  }
  const mode = localStorage.getItem(GRID_DENSITY_KEY) || "compact";
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
    .map((f) => {
      const valueHtml = f.html ? String(f.value ?? "—") : escCell(f.value ?? "—");
      return `<div class="detail-field"><label>${escCell(f.label)}</label><span>${valueHtml}</span></div>`;
    })
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

function canReassignStock() {
  return currentRole === "ADMIN" || currentRole === "SUPERVISOR";
}

function inventoryAssignmentLabel(row) {
  if (row?.assignmentType === "FREE_TO_SALE" || row?.assignmentKey === "FREE_TO_SALE") return "Free to Sale";
  if (row?.project?.name) {
    return row.project.code ? `${row.project.name} (${row.project.code})` : row.project.name;
  }
  return getAviatProjectDisplayFromRow(row);
}

function canSeeEconomicValuation() {
  return ["ADMIN", "SUPERVISOR", "OPERATOR", "CLIENT"].includes(currentRole);
}

function canEditEconomicValuation() {
  return currentRole === "ADMIN";
}

function applyEconomicVisibility() {
  const show = canSeeEconomicValuation();
  document.querySelectorAll(".js-economic-card").forEach((el) => {
    if (el.id === "layerPricePanel") return;
    el.classList.toggle("hidden", !show);
  });
  document.querySelectorAll(".js-economic-edit").forEach((el) => {
    el.classList.toggle("hidden", !canEditEconomicValuation());
  });
  const hint = document.getElementById("inventoryValuePartialHint");
  if (hint && !show) hint.classList.add("hidden");
  const pricePanel = document.getElementById("layerPricePanel");
  if (pricePanel && !canEditEconomicValuation()) pricePanel.classList.add("hidden");
}

function isFreeToSaleRow(row) {
  return row?.assignmentType === "FREE_TO_SALE" || row?.assignmentKey === "FREE_TO_SALE";
}

function inventoryProjectOrAssignmentLabel(row) {
  if (isFreeToSaleRow(row)) return "Free to Sale";
  if (row?.historicalAssignment === "HISTORICAL_NON_OPERATIONAL") return historicalNonOperationalAssignmentLabel();
  if (row?.project?.name || row?.project?.code) {
    if (isForbiddenProjectLabel(row.project.code) || isForbiddenProjectLabel(row.project.name)) {
      return historicalNonOperationalAssignmentLabel();
    }
    return row.project.code ? `${row.project.name || row.project.code} (${row.project.code})` : row.project.name;
  }
  const fallback = getAviatProjectDisplayFromRow(row);
  if (!fallback || fallback === "—") {
    return row?.assignmentType === "PROJECT" ? historicalNonOperationalAssignmentLabel() : "—";
  }
  return fallback === "FREE TO SALE" ? "Free to Sale" : fallback;
}

function inventoryAssignmentKindLabel(row) {
  return isFreeToSaleRow(row) ? "FREE_TO_SALE" : "PROJECT";
}

function catalogProjectsWithStockLabel(product) {
  if (product?.stockAssignments?.label) return product.stockAssignments.label;
  return "Sin existencias asignadas";
}

function formatMxn(value) {
  if (value == null || value === "") return "Sin valor";
  const s = String(value).trim();
  const neg = s.startsWith("-");
  const raw = neg ? s.slice(1) : s;
  if (!/^\d+(\.\d+)?$/.test(raw)) return "Sin valor";
  const [whole, frac = ""] = raw.split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const dec = (frac + "00").slice(0, 2);
  return `${neg ? "-" : ""}$${grouped}.${dec}`;
}

function moneyToCents(value) {
  if (value == null || value === "") return 0;
  const s = String(value).trim();
  const neg = s.startsWith("-");
  const raw = neg ? s.slice(1) : s;
  if (!/^\d+(\.\d+)?$/.test(raw)) return 0;
  const [whole, frac = ""] = raw.split(".");
  const cents = Number(whole || "0") * 100 + Number((frac + "00").slice(0, 2));
  return neg ? -cents : cents;
}

function centsToMoney(cents) {
  const neg = cents < 0;
  const abs = Math.abs(cents);
  const whole = Math.floor(abs / 100);
  const frac = String(abs % 100).padStart(2, "0");
  return `${neg ? "-" : ""}${whole}.${frac}`;
}

function valuationStatusLabel(status) {
  if (status === "COMPLETE") return "Completo";
  if (status === "PARTIAL") return "Parcial";
  return "Sin valor";
}

function valuationStatusBadge(status) {
  const label = valuationStatusLabel(status);
  const cls = status === "COMPLETE" ? "completo" : status === "PARTIAL" ? "parcial" : "";
  return `<span class="valuation-badge ${cls}">${escCell(label)}</span>`;
}

function unitPriceDisplay(valuation) {
  if (!valuation || valuation.avgUnitPriceMxn == null) return "Sin valor";
  if (valuation.hasMixedUnitPrices && valuation.minUnitPriceMxn != null && valuation.maxUnitPriceMxn != null) {
    return `${formatMxn(valuation.minUnitPriceMxn)} – ${formatMxn(valuation.maxUnitPriceMxn)}`;
  }
  return formatMxn(valuation.avgUnitPriceMxn);
}

function aggregateRowValuations(rows) {
  let qtyTotal = 0;
  let qtyValued = 0;
  let qtyUnvalued = 0;
  let cents = 0;
  let availableCents = 0;
  for (const row of Array.isArray(rows) ? rows : []) {
    const valuation = row?.valuation;
    if (valuation) {
      qtyTotal += Number(valuation.qtyTotal) || 0;
      qtyValued += Number(valuation.qtyValued) || 0;
      qtyUnvalued += Number(valuation.qtyUnvalued) || 0;
      cents += moneyToCents(valuation.totalValueMxn);
      availableCents += moneyToCents(valuation.availableValueMxn);
    } else {
      const qty = Number(row?.qty) || 0;
      qtyTotal += qty;
      qtyUnvalued += qty;
    }
  }
  let status = "NONE";
  if (qtyTotal > 0 && qtyUnvalued === 0 && qtyValued > 0) status = "COMPLETE";
  else if (qtyValued > 0 && qtyUnvalued > 0) status = "PARTIAL";
  const coveragePct = qtyTotal > 0 ? ((qtyValued / qtyTotal) * 100).toFixed(2) : "0.00";
  const avgUnitPriceMxn = qtyValued > 0 ? centsToMoney(Math.round(cents / qtyValued)) : null;
  return {
    qtyTotal,
    qtyValued,
    qtyUnvalued,
    totalValueMxn: qtyValued > 0 ? centsToMoney(cents) : null,
    availableValueMxn: qtyValued > 0 ? centsToMoney(availableCents) : null,
    avgUnitPriceMxn,
    coveragePct,
    status,
    isPartial: status === "PARTIAL"
  };
}

function rowHasUnvaluedPieces(row) {
  const unvalued = Number(row?.valuation?.qtyUnvalued);
  if (Number.isFinite(unvalued)) return unvalued > 0;
  return row?.valuation?.status === "NONE" || row?.valuation?.status === "PARTIAL";
}

function summarizeVisibleStock(rows) {
  const visible = (Array.isArray(rows) ? rows : []).filter((row) => Number(row.qty) > 0);
  let unvaluedSaldos = 0;
  let unvaluedPiezas = 0;
  for (const row of visible) {
    const unvalued = Number(row?.valuation?.qtyUnvalued);
    if (Number.isFinite(unvalued) && unvalued > 0) {
      unvaluedSaldos += 1;
      unvaluedPiezas += unvalued;
    } else if (!row?.valuation) {
      unvaluedSaldos += 1;
      unvaluedPiezas += Number(row.qty) || 0;
    }
  }
  return {
    saldos: visible.length,
    piezas: sumStockQty(visible),
    unvaluedSaldos,
    unvaluedPiezas
  };
}

function inventoryHasLocalFilters() {
  const filters = getInventoryFilterValues();
  return Boolean(
    filters.cliente ||
      filters.customer ||
      filters.lote ||
      filters.sku ||
      filters.producto ||
      filters.ubicacion ||
      filters.status ||
      inventoryUnpricedOnly
  );
}

function parseLayerPriceMxnInput(value) {
  const raw = value == null ? "" : String(value).trim().replace(",", ".");
  if (!raw) return { ok: false, empty: true, message: "Indica un precio en MXN." };
  if (!/^\d+(\.\d{1,4})?$/.test(raw)) {
    return {
      ok: false,
      empty: false,
      message: "El precio debe ser un importe no negativo con hasta cuatro decimales."
    };
  }
  return { ok: true, empty: false, value: raw };
}

function normalizeLayerPriceMxn(value) {
  const parsed = parseLayerPriceMxnInput(value);
  if (!parsed.ok) return null;
  const [whole, frac = ""] = parsed.value.split(".");
  return `${whole}.${(frac + "0000").slice(0, 4)}`;
}

function formatLayerPriceMxnExact(value) {
  const normalized = normalizeLayerPriceMxn(value);
  if (!normalized) return null;
  const [whole, frac] = normalized.split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `$${grouped}.${frac}`;
}

function layerHasAssignedPrice(layer) {
  return layer != null && layer.unitPriceMxn != null && String(layer.unitPriceMxn).trim() !== "";
}

function layerPriceHasRealChange(layer, parsed) {
  if (!parsed?.ok || !layer) return false;
  if (!layerHasAssignedPrice(layer)) return true;
  return normalizeLayerPriceMxn(parsed.value) !== normalizeLayerPriceMxn(String(layer.unitPriceMxn));
}

function layerPriceConfirmMessage(parsed, qty) {
  const priceLabel = formatLayerPriceMxnExact(parsed.value);
  return `Se asignará un precio unitario de ${priceLabel} MXN a ${qty} piezas. ¿Deseas continuar?`;
}

function parseLayerQtyToValueInput(value) {
  const raw = value == null ? "" : String(value).trim().replace(",", ".");
  if (!raw) return { ok: false, empty: true, message: "Indica la cantidad a valuar." };
  if (!/^\d+(\.\d{1,4})?$/.test(raw)) {
    return {
      ok: false,
      empty: false,
      message: "La cantidad debe ser mayor que 0 con hasta cuatro decimales."
    };
  }
  const [whole, frac = ""] = raw.split(".");
  const isZero = whole.replace(/^0+/, "") === "" && String(frac).replace(/0/g, "") === "";
  if (isZero) {
    return {
      ok: false,
      empty: false,
      message: "La cantidad debe ser mayor que 0 con hasta cuatro decimales."
    };
  }
  return { ok: true, empty: false, value: raw };
}

function decimal4ToScaled(raw) {
  const [whole, frac = ""] = String(raw ?? "0").split(".");
  const w = String(whole || "0").replace(/^0+(?=\d)/, "") || "0";
  return BigInt(w) * 10000n + BigInt((String(frac) + "0000").slice(0, 4));
}

function scaledToDecimalString(scaled) {
  const whole = scaled / 10000n;
  const frac = (scaled % 10000n).toString().padStart(4, "0").replace(/0+$/, "");
  return frac ? `${whole.toString()}.${frac}` : whole.toString();
}

function qtyFitsUnpricedLayer(layer, qtyRaw) {
  if (!layer || !qtyRaw) return false;
  const qty = decimal4ToScaled(qtyRaw);
  const layerQty = decimal4ToScaled(String(layer.qty ?? "0"));
  if (qty > layerQty) return false;
  if (qty === layerQty) return true;
  const available = layerQty - decimal4ToScaled(String(layer.reservedQty ?? "0"));
  return qty <= available;
}

function layerPriceSplitConfirmMessage(priceParsed, qtyRaw, remainingRaw, totalRaw) {
  const priceLabel = formatLayerPriceMxnExact(priceParsed.value);
  return `Se asignará un precio unitario de ${priceLabel} MXN a ${formatQty(qtyRaw)} piezas. Quedarán ${formatQty(remainingRaw)} piezas sin precio. El saldo total de ${formatQty(totalRaw)} piezas no cambia. ¿Deseas continuar?`;
}

function priceDestinationType() {
  return document.getElementById("priceDestType")?.value || "KEEP";
}

function priceDestinationIsKeep(row) {
  const dest = priceDestinationType();
  if (dest === "KEEP") return true;
  if (dest === "FREE_TO_SALE") return isFreeToSaleRow(row);
  if (dest === "PROJECT") {
    const projectId = document.getElementById("priceDestProject")?.value || "";
    return Boolean(projectId && row?.projectId === projectId);
  }
  return true;
}

function selectedPriceDestProjectOption() {
  const sel = document.getElementById("priceDestProject");
  return sel?.selectedOptions?.[0] || null;
}

function priceDestinationLabel(row) {
  const dest = priceDestinationType();
  if (dest === "KEEP" || priceDestinationIsKeep(row)) return inventoryProjectOrAssignmentLabel(row);
  if (dest === "FREE_TO_SALE") return "Free to Sale";
  const opt = selectedPriceDestProjectOption();
  return opt?.dataset?.name || opt?.textContent || "—";
}

function layerValueAssignConfirmMessage(priceParsed, qtyRaw, remainingRaw, totalRaw, fromLabel, toLabel, remainingLabel, destIsProject) {
  const priceLabel = formatLayerPriceMxnExact(priceParsed.value);
  const destPhrase = destIsProject ? `al proyecto ${toLabel}` : `a ${toLabel}`;
  return `Se valuarán ${formatQty(qtyRaw)} piezas a ${priceLabel} MXN y se asignarán de ${fromLabel} ${destPhrase}. Quedarán ${formatQty(remainingRaw)} piezas en ${remainingLabel}. El total físico de ${formatQty(totalRaw)} piezas no cambia. ¿Deseas continuar?`;
}

function decimal4ProductToMoney(qtyRaw, priceRaw) {
  const product = decimal4ToScaled(qtyRaw) * decimal4ToScaled(priceRaw);
  const cents = (product + 500000n) / 1000000n;
  const whole = cents / 100n;
  const frac = (cents % 100n).toString().padStart(2, "0");
  return formatMxn(`${whole.toString()}.${frac}`);
}

function syncPriceDestProjectVisible() {
  const field = document.getElementById("priceDestProjectField");
  if (!field) return;
  const unpriced = !layerHasAssignedPrice(selectedPriceLayer());
  field.classList.toggle("hidden", !unpriced || priceDestinationType() !== "PROJECT");
}

function realActiveProjectsForPriceRow(projects, row) {
  const clientId =
    row?.project?.client?.id || row?.product?.customer?.clientId || row?.product?.customer?.client?.id || "";
  return (Array.isArray(projects) ? projects : []).filter((project) => {
    if (!isOperationalProjectRecord(project)) return false;
    if (clientId && project.clientId && project.clientId !== clientId) return false;
    if (clientId && project.client?.id && project.client.id !== clientId) return false;
    return true;
  });
}

async function fillPriceDestProjects(row) {
  const sel = document.getElementById("priceDestProject");
  if (!sel) return;
  const response = await authenticatedFetch("/api/catalog/customers");
  const projects = response?.ok ? await response.json() : [];
  sel.innerHTML =
    '<option value="">— Seleccionar proyecto —</option>' +
    realActiveProjectsForPriceRow(projects, row)
      .map(
        (project) =>
          `<option value="${escCell(project.id)}" data-name="${escCell(project.name)}">${escCell(project.name)} (${escCell(project.code)})</option>`
      )
      .join("");
}

function syncPriceSplitFieldsVisible(unpriced) {
  document.querySelectorAll(".price-split-only").forEach((el) => {
    el.classList.toggle("hidden", !unpriced);
  });
  syncPriceDestProjectVisible();
}

function openInventoryDetail(row) {
  const p = row.product || {};
  const reserved = Number(row.reservedQty || 0);
  const total = Number(row.qty || 0);
  const free = total - reserved;
  const actions = [
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
      label: "Ver movimientos",
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
  ];
  if (canReassignStock()) {
    actions.unshift({
      id: "reassign",
      label: "Reasignar stock",
      className: "btn-primary",
      onClick: () => {
        closeDetailDrawer();
        void openAssignmentTransferPanel(row);
      }
    });
  }
  if (canEditEconomicValuation()) {
    actions.unshift({
      id: "edit-price",
      label: "Asignar o editar precio",
      className: "btn-primary",
      onClick: () => {
        closeDetailDrawer();
        void openLayerPricePanel(row);
      }
    });
  }
  const fields = [
    { label: "Cliente", value: owningClientDisplayName() },
    { label: isFreeToSaleRow(row) ? "Asignación" : "Proyecto", value: inventoryProjectOrAssignmentLabel(row) },
    { label: "Lote", value: extractLoteFromRow(row) },
    { label: "SKU / Código de barras", value: formatSkuBarcode(p) },
    { label: "Producto", value: p.name },
    { label: "Almacén", value: row.location?.warehouse },
    { label: "Ubicación", value: row.location?.code },
    { label: "Estatus", value: formatInventoryStatus(row.status) },
    { label: "Cantidad", value: formatQty(row.qty) },
    { label: "Reservada", value: formatQty(row.reservedQty) },
    { label: "Disponible para reasignar", value: formatQty(free) }
  ];
  if (canSeeEconomicValuation()) {
    const valuation = row.valuation || null;
    const unitLabel = valuation?.hasMixedUnitPrices ? "Valor unitario promedio ponderado MXN" : "Valor unitario importado MXN";
    fields.push(
      { label: unitLabel, value: unitPriceDisplay(valuation) },
      { label: "Moneda", value: valuation?.currency || "MXN" },
      { label: "Valor total del saldo MXN", value: formatMxn(valuation?.totalValueMxn) },
      { label: "Cantidad valuada", value: formatQty(valuation?.qtyValued ?? 0) },
      { label: "Cantidad sin valor", value: formatQty(valuation?.qtyUnvalued ?? row.qty) },
      { label: "Cobertura económica", value: `${valuation?.coveragePct || "0.00"}%` },
      { label: "Estado de valuación", value: valuationStatusLabel(valuation?.status) },
      {
        label: "Valor disponible no reservado MXN",
        value: formatMxn(valuation?.availableValueMxn)
      }
    );
    if (valuation?.isPartial || valuation?.status === "NONE") {
      fields.push({
        label: "Aviso",
        value:
          "El valor es parcial porque existen piezas sin precio asignado. El total mostrado no incluye esas piezas."
      });
    }
    if (Array.isArray(valuation?.layers) && valuation.layers.length) {
      const rowsHtml = valuation.layers
        .map(
          (layer) =>
            `<tr><td>${escCell(layer.lotNumber || "sin lote")}</td><td>${escCell(formatQty(layer.qty))}</td><td>${escCell(
              layer.unitPriceMxn == null ? "Sin precio" : formatMxn(layer.unitPriceMxn)
            )}</td><td>${escCell(layer.layerValueMxn == null ? "Sin valor" : formatMxn(layer.layerValueMxn))}</td></tr>`
        )
        .join("");
      fields.push({
        label: "Desglose por capas",
        html: true,
        value: `<table class="projects-stock-table"><thead><tr><th>Lote</th><th>Cantidad</th><th>Unitario MXN</th><th>Valor MXN</th></tr></thead><tbody>${rowsHtml}</tbody></table>`
      });
    }
  }
  openDetailDrawer("Detalle de inventario", fields, actions);
}

let assignmentTransferSource = null;

function setAssignMessage(text, ok) {
  const el = document.getElementById("assignMessage");
  if (!el) return;
  el.textContent = text || "";
  el.classList.toggle("ok", Boolean(ok));
  el.classList.toggle("error", Boolean(text) && !ok);
}

function updateAssignPreview() {
  const preview = document.getElementById("assignPreview");
  if (!preview || !assignmentTransferSource) return;
  const destType = document.getElementById("assignDestType")?.value;
  const destSel = document.getElementById("assignDestProject");
  const destName =
    destType === "FREE_TO_SALE"
      ? "FREE TO SALE"
      : destSel?.selectedOptions?.[0]?.textContent || "—";
  const qty = document.getElementById("assignQty")?.value || "—";
  const from = inventoryAssignmentLabel(assignmentTransferSource);
  preview.textContent = `${from} → ${destName}\n${qty} piezas\n${assignmentTransferSource.location?.code || "—"}\n${formatInventoryStatus(
    assignmentTransferSource.status
  )}`;
}

async function openAssignmentTransferPanel(row) {
  if (!canReassignStock()) return;
  assignmentTransferSource = row;
  const panel = document.getElementById("assignmentTransferPanel");
  if (!panel) return;
  panel.classList.remove("hidden");
  document.getElementById("assignSku").value = row.product?.sku || "";
  document.getElementById("assignLocation").value = row.location?.code || "";
  document.getElementById("assignStatus").value = formatInventoryStatus(row.status);
  document.getElementById("assignCurrent").value = inventoryAssignmentLabel(row);
  document.getElementById("assignQtyTotal").value = formatQty(row.qty);
  document.getElementById("assignQtyReserved").value = formatQty(row.reservedQty);
  const free = Number(row.qty || 0) - Number(row.reservedQty || 0);
  document.getElementById("assignQtyFree").value = formatQty(free);
  document.getElementById("assignQty").value = "";
  document.getElementById("assignReference").value = "";
  document.getElementById("assignNotes").value = "";
  document.getElementById("assignDestType").value = "PROJECT";
  const projectField = document.getElementById("assignDestProjectField");
  if (projectField) projectField.classList.remove("hidden");
  setAssignMessage("", true);
  const destSel = document.getElementById("assignDestProject");
  if (destSel) {
    const response = await authenticatedFetch("/api/catalog/customers");
    const projects = response?.ok ? await response.json() : [];
    destSel.innerHTML =
      '<option value="">— Seleccionar proyecto —</option>' +
      getOperationalProjectsForSelect(Array.isArray(projects) ? projects : [])
        .map((p) => `<option value="${escCell(p.id)}">${escCell(p.name)} (${escCell(p.code)})</option>`)
        .join("");
  }
  const layerSel = document.getElementById("assignLayer");
  if (layerSel && row.id) {
    const layersRes = await authenticatedFetch(`/api/inventory/stock/${encodeURIComponent(row.id)}/layers`);
    const layers = layersRes?.ok ? await layersRes.json() : [];
    const transferable = (Array.isArray(layers) ? layers : []).filter(
      (layer) => Number(layer.qty || 0) - Number(layer.reservedQty || 0) > 0
    );
    layerSel.innerHTML =
      transferable.length > 1
        ? '<option value="">— Seleccionar capa —</option>'
        : '<option value="">Automática si hay una sola</option>';
    transferable.forEach((layer) => {
      const freeQty = Number(layer.qty || 0) - Number(layer.reservedQty || 0);
      const opt = document.createElement("option");
      opt.value = layer.id;
      opt.textContent = `${layer.lotNumber || "sin lote"} · libre ${formatQty(freeQty)}`;
      layerSel.appendChild(opt);
    });
    if (transferable.length === 1) layerSel.value = transferable[0].id;
  }
  updateAssignPreview();
  panel.scrollIntoView({ behavior: "smooth", block: "start" });
}

function closeAssignmentTransferPanel() {
  assignmentTransferSource = null;
  const panel = document.getElementById("assignmentTransferPanel");
  if (panel) panel.classList.add("hidden");
}

async function confirmAssignmentTransfer() {
  if (!canReassignStock()) {
    setAssignMessage("No autorizado.", false);
    return;
  }
  if (!assignmentTransferSource?.id) {
    setAssignMessage("Selecciona una línea de inventario.", false);
    return;
  }
  const destType = document.getElementById("assignDestType")?.value;
  const destProjectId = document.getElementById("assignDestProject")?.value || "";
  const qty = Number(document.getElementById("assignQty")?.value);
  const free = Number(assignmentTransferSource.qty || 0) - Number(assignmentTransferSource.reservedQty || 0);
  if (!Number.isFinite(qty) || qty <= 0) {
    setAssignMessage("Indica una cantidad mayor a 0.", false);
    return;
  }
  if (qty > free) {
    setAssignMessage("No se puede reasignar más que el saldo no reservado.", false);
    return;
  }
  if (destType === "PROJECT" && !destProjectId) {
    setAssignMessage("Selecciona un proyecto destino.", false);
    return;
  }
  const sourceIsFts =
    assignmentTransferSource.assignmentType === "FREE_TO_SALE" ||
    assignmentTransferSource.assignmentKey === "FREE_TO_SALE";
  const sameAssignment =
    (destType === "FREE_TO_SALE" && sourceIsFts) ||
    (destType === "PROJECT" && destProjectId && assignmentTransferSource.projectId === destProjectId);
  if (sameAssignment) {
    setAssignMessage("Origen y destino tienen la misma asignación.", false);
    return;
  }
  const from = inventoryAssignmentLabel(assignmentTransferSource);
  const destSel = document.getElementById("assignDestProject");
  const destName = destType === "FREE_TO_SALE" ? "FREE TO SALE" : destSel?.selectedOptions?.[0]?.textContent || "—";
  const summary = `${from} → ${destName}\n${qty} piezas\n${assignmentTransferSource.location?.code || "—"}\n${formatInventoryStatus(
    assignmentTransferSource.status
  )}`;
  if (!window.confirm(`Confirmar reasignación:\n${summary}`)) return;
  const layerId = document.getElementById("assignLayer")?.value || "";
  const body = {
    sourceInventoryId: assignmentTransferSource.id,
    qty,
    destinationAssignmentType: destType,
    reference: document.getElementById("assignReference")?.value?.trim() || undefined,
    notes: document.getElementById("assignNotes")?.value?.trim() || undefined
  };
  if (destType === "PROJECT") body.destinationProjectId = destProjectId;
  if (layerId) body.sourceLayerId = layerId;
  const response = await authenticatedFetch("/api/inventory/assignment-transfer", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  const data = await response?.json().catch(() => ({}));
  if (!response?.ok) {
    setAssignMessage(data.message || data.code || "No se pudo reasignar.", false);
    return;
  }
  setAssignMessage(
    `Reasignación OK. ${data.transferredQty} piezas. Total ${data.totalBefore} → ${data.totalAfter}.`,
    true
  );
  await loadStockStrip();
  await loadInventoryMovements();
}

function wireAssignmentTransferPanel() {
  const destType = document.getElementById("assignDestType");
  if (destType && destType.dataset.wired !== "1") {
    destType.dataset.wired = "1";
    destType.addEventListener("change", () => {
      const field = document.getElementById("assignDestProjectField");
      if (field) field.classList.toggle("hidden", destType.value === "FREE_TO_SALE");
      updateAssignPreview();
    });
  }
  ["assignQty", "assignDestProject"].forEach((id) => {
    const el = document.getElementById(id);
    if (el && el.dataset.previewWired !== "1") {
      el.dataset.previewWired = "1";
      el.addEventListener("input", updateAssignPreview);
      el.addEventListener("change", updateAssignPreview);
    }
  });
  const confirmBtn = document.getElementById("assignConfirmBtn");
  if (confirmBtn && confirmBtn.dataset.wired !== "1") {
    confirmBtn.dataset.wired = "1";
    confirmBtn.addEventListener("click", () => void confirmAssignmentTransfer());
  }
  const cancelBtn = document.getElementById("assignCancelBtn");
  if (cancelBtn && cancelBtn.dataset.wired !== "1") {
    cancelBtn.dataset.wired = "1";
    cancelBtn.addEventListener("click", closeAssignmentTransferPanel);
  }
}

let layerPriceSource = null;

function setPriceMessage(text, ok) {
  const el = document.getElementById("priceMessage");
  if (!el) return;
  el.textContent = text || "";
  el.classList.toggle("ok", Boolean(ok));
  el.classList.toggle("error", Boolean(text) && !ok);
}

function layerPriceOptions(row) {
  const layers = Array.isArray(row?.valuation?.layers) ? row.valuation.layers : [];
  return layers.filter((layer) => layer?.id);
}

function selectedPriceLayer() {
  const layerId = document.getElementById("priceLayer")?.value;
  return layerPriceOptions(layerPriceSource).find((layer) => layer.id === layerId) || null;
}

function syncLayerPriceSaveButton() {
  const btn = document.getElementById("priceConfirmBtn");
  if (!btn) return;
  const layer = selectedPriceLayer();
  const parsed = parseLayerPriceMxnInput(document.getElementById("priceNew")?.value);
  if (!layerHasAssignedPrice(layer)) {
    const qtyParsed = parseLayerQtyToValueInput(document.getElementById("priceQtyToValue")?.value);
    const destType = priceDestinationType();
    const projectOk = destType !== "PROJECT" || Boolean(document.getElementById("priceDestProject")?.value);
    btn.disabled = !(layer?.id && parsed.ok && qtyParsed.ok && qtyFitsUnpricedLayer(layer, qtyParsed.value) && projectOk);
    return;
  }
  btn.disabled = !(layer?.id && parsed.ok && layerPriceHasRealChange(layer, parsed));
}

function resetNewPriceInput(layer) {
  const el = document.getElementById("priceNew");
  if (!el) return;
  el.value = "";
  const qtyEl = document.getElementById("priceQtyToValue");
  if (qtyEl) qtyEl.value = "";
  const destType = document.getElementById("priceDestType");
  if (destType) destType.value = "KEEP";
  const destProject = document.getElementById("priceDestProject");
  if (destProject) destProject.value = "";
  if (layerHasAssignedPrice(layer)) {
    el.value = String(layer.unitPriceMxn);
  }
  syncPriceSplitFieldsVisible(!layerHasAssignedPrice(layer));
  syncLayerPriceSaveButton();
}

function updateLayerPricePreview() {
  const preview = document.getElementById("pricePreview");
  if (!preview || !layerPriceSource) {
    syncLayerPriceSaveButton();
    return;
  }
  const layer = selectedPriceLayer();
  const parsed = parseLayerPriceMxnInput(document.getElementById("priceNew")?.value);
  const unpriced = !layerHasAssignedPrice(layer);
  const qtyParsed = parseLayerQtyToValueInput(document.getElementById("priceQtyToValue")?.value);
  const layerQty = layer ? String(layer.qty ?? "0") : "0";
  const reserved = layer ? String(layer.reservedQty ?? "0") : "0";
  const availableScaled = decimal4ToScaled(layerQty) - decimal4ToScaled(reserved);
  const availableRaw = layer ? scaledToDecimalString(availableScaled < 0n ? 0n : availableScaled) : "";
  const qty = layer ? formatQty(layer.qty) : "—";
  const current = layerHasAssignedPrice(layer) ? formatMxn(layer.unitPriceMxn) : "Sin precio";
  const next = parsed.ok ? formatLayerPriceMxnExact(parsed.value) : parsed.empty ? "—" : "—";
  let remainingRaw = layerQty;
  let addedValue = "—";
  let affected = qty;
  if (unpriced && qtyParsed.ok && layer) {
    const remainingScaled = decimal4ToScaled(layerQty) - decimal4ToScaled(qtyParsed.value);
    remainingRaw = remainingScaled >= 0n ? scaledToDecimalString(remainingScaled) : "0";
    affected = formatQty(qtyParsed.value);
    if (parsed.ok) addedValue = decimal4ProductToMoney(qtyParsed.value, parsed.value);
  } else if (!unpriced) {
    remainingRaw = "0";
  }
  const destKeep = priceDestinationIsKeep(layerPriceSource);
  const destLabel = priceDestinationLabel(layerPriceSource);
  const currentAssignment = inventoryProjectOrAssignmentLabel(layerPriceSource);
  preview.textContent = unpriced
    ? [
        `SKU: ${layerPriceSource.product?.sku || "—"}`,
        `Producto: ${layerPriceSource.product?.name || "—"}`,
        `Asignación actual: ${currentAssignment}`,
        `Asignación destino: ${destLabel}`,
        `Ubicación: ${layerPriceSource.location?.code || "—"}`,
        `Cantidad de la capa: ${qty} piezas`,
        `Cantidad disponible sin precio: ${layer ? formatQty(availableRaw) : "—"}`,
        `Cantidad a valuar: ${qtyParsed.ok ? formatQty(qtyParsed.value) : "—"}`,
        destKeep
          ? `Piezas que permanecerán sin precio: ${qtyParsed.ok ? formatQty(remainingRaw) : "—"}`
          : `Cantidad que se transferirá: ${qtyParsed.ok ? formatQty(qtyParsed.value) : "—"}`,
        destKeep ? null : `Cantidad que quedará en la asignación actual: ${qtyParsed.ok ? formatQty(remainingRaw) : "—"}`,
        `Precio unitario: ${next}`,
        `Valor que se agregará al inventario: ${addedValue}`,
        destKeep
          ? "El saldo total del cubo no cambia. No se modifican existencias, asignaciones ni movimientos."
          : `El total físico de ${formatQty(layerPriceSource.qty ?? layerQty)} piezas no cambia.`
      ]
        .filter(Boolean)
        .join("\n")
    : [
        `SKU: ${layerPriceSource.product?.sku || "—"}`,
        `Producto: ${layerPriceSource.product?.name || "—"}`,
        `Asignación: ${inventoryProjectOrAssignmentLabel(layerPriceSource)}`,
        `Ubicación: ${layerPriceSource.location?.code || "—"}`,
        `Cantidad restante de la capa: ${qty} piezas`,
        `Piezas afectadas: ${qty}`,
        `Precio actual MXN: ${current}`,
        `Nuevo precio MXN: ${next}`,
        "El precio se asigna a la capa completa. No se modifican existencias."
      ].join("\n");
  const qtyEl = document.getElementById("priceQty");
  const affectedEl = document.getElementById("priceAffected");
  const currentEl = document.getElementById("priceCurrent");
  const availableEl = document.getElementById("priceAvailableUnpriced");
  const remainingEl = document.getElementById("priceRemainingUnpriced");
  const addedEl = document.getElementById("priceAddedValue");
  if (qtyEl) qtyEl.value = qty;
  if (affectedEl) affectedEl.value = affected;
  if (currentEl) currentEl.value = current;
  if (availableEl) availableEl.value = layer ? formatQty(availableRaw) : "";
  if (remainingEl) remainingEl.value = unpriced && qtyParsed.ok ? formatQty(remainingRaw) : "";
  if (addedEl) addedEl.value = unpriced ? addedValue : "";
  syncPriceSplitFieldsVisible(unpriced);
  syncLayerPriceSaveButton();
}

function fillLayerPriceFields(row) {
  document.getElementById("priceSku").value = row.product?.sku || "";
  document.getElementById("priceProduct").value = row.product?.name || "";
  document.getElementById("priceAssignment").value = inventoryProjectOrAssignmentLabel(row);
  document.getElementById("priceLocation").value = row.location?.code || "";
  const sel = document.getElementById("priceLayer");
  const layers = layerPriceOptions(row);
  if (sel) {
    const previous = sel.value;
    sel.innerHTML = layers
      .map((layer) => {
        const price = layerHasAssignedPrice(layer) ? formatMxn(layer.unitPriceMxn) : "sin precio";
        const label = `${layer.lotNumber || "sin lote"} · ${formatQty(layer.qty)} pzas · ${price}`;
        return `<option value="${escCell(layer.id)}">${escCell(label)}</option>`;
      })
      .join("");
    if (previous && layers.some((layer) => layer.id === previous)) sel.value = previous;
    else if (layers[0]?.id) sel.value = layers[0].id;
  }
  resetNewPriceInput(selectedPriceLayer());
  updateLayerPricePreview();
}

async function openLayerPricePanel(row) {
  if (!canEditEconomicValuation()) return;
  layerPriceSource = row;
  const panel = document.getElementById("layerPricePanel");
  if (!panel) return;
  panel.classList.remove("hidden");
  setPriceMessage("", true);
  fillLayerPriceFields(row);
  await fillPriceDestProjects(row);
  syncPriceDestProjectVisible();
  updateLayerPricePreview();
  if (!layerPriceOptions(row).length) {
    setPriceMessage("No hay capas con saldo para asignar precio.", false);
    const btn = document.getElementById("priceConfirmBtn");
    if (btn) btn.disabled = true;
  }
  panel.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function closeLayerPricePanel() {
  const panel = document.getElementById("layerPricePanel");
  if (panel) panel.classList.add("hidden");
  layerPriceSource = null;
  const priceNew = document.getElementById("priceNew");
  if (priceNew) priceNew.value = "";
  const qtyToValue = document.getElementById("priceQtyToValue");
  if (qtyToValue) qtyToValue.value = "";
  const destType = document.getElementById("priceDestType");
  if (destType) destType.value = "KEEP";
  const destProject = document.getElementById("priceDestProject");
  if (destProject) destProject.value = "";
  const btn = document.getElementById("priceConfirmBtn");
  if (btn) btn.disabled = true;
  setPriceMessage("", true);
}

async function confirmLayerPriceUpdate() {
  if (!canEditEconomicValuation() || !layerPriceSource) return;
  const layer = selectedPriceLayer();
  if (!layer?.id) {
    setPriceMessage("Selecciona una capa.", false);
    return;
  }
  const parsed = parseLayerPriceMxnInput(document.getElementById("priceNew")?.value);
  if (parsed.empty || !parsed.ok) {
    setPriceMessage(parsed.message || "Indica un precio en MXN.", false);
    syncLayerPriceSaveButton();
    return;
  }
  const unpriced = !layerHasAssignedPrice(layer);
  if (!unpriced) {
    if (!layerPriceHasRealChange(layer, parsed)) {
      setPriceMessage("El precio no cambió. Escribe un valor diferente para guardar.", false);
      syncLayerPriceSaveButton();
      return;
    }
    const qty = formatQty(layer.qty);
    if (!window.confirm(layerPriceConfirmMessage(parsed, qty))) return;
    const response = await authenticatedFetch(`/api/inventory/layers/${encodeURIComponent(layer.id)}/price`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ unitPriceMxn: parsed.value })
    });
    const data = await response?.json().catch(() => ({}));
    if (!response?.ok) {
      setPriceMessage(data.message || data.code || "No se pudo guardar el precio.", false);
      return;
    }
    setPriceMessage(`Precio guardado. ${formatQty(data.qtyAffected || layer.qty)} piezas afectadas.`, true);
    await loadStockStrip();
    const updated = (Array.isArray(stockRowsCache) ? stockRowsCache : []).find((item) => item.id === layerPriceSource.id);
    if (updated) {
      layerPriceSource = updated;
      fillLayerPriceFields(updated);
    }
    return;
  }
  const qtyParsed = parseLayerQtyToValueInput(document.getElementById("priceQtyToValue")?.value);
  if (qtyParsed.empty || !qtyParsed.ok) {
    setPriceMessage(qtyParsed.message || "Indica la cantidad a valuar.", false);
    syncLayerPriceSaveButton();
    return;
  }
  if (!qtyFitsUnpricedLayer(layer, qtyParsed.value)) {
    setPriceMessage("La cantidad a valuar no es válida para esta capa.", false);
    syncLayerPriceSaveButton();
    return;
  }
  const remainingScaled = decimal4ToScaled(String(layer.qty ?? "0")) - decimal4ToScaled(qtyParsed.value);
  const remainingRaw = remainingScaled >= 0n ? scaledToDecimalString(remainingScaled) : "0";
  const destKeep = priceDestinationIsKeep(layerPriceSource);
  if (destKeep) {
    if (!window.confirm(layerPriceSplitConfirmMessage(parsed, qtyParsed.value, remainingRaw, String(layer.qty)))) return;
    const response = await authenticatedFetch(`/api/inventory/layers/${encodeURIComponent(layer.id)}/price-split`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ qtyToValue: qtyParsed.value, unitPriceMxn: parsed.value })
    });
    const data = await response?.json().catch(() => ({}));
    if (!response?.ok) {
      setPriceMessage(data.message || data.code || "No se pudo guardar el precio.", false);
      return;
    }
    setPriceMessage(
      `Precio guardado. ${formatQty(data.qtyAffected || qtyParsed.value)} piezas valuadas. Remanente ${formatQty(data.qtyRemaining ?? remainingRaw)}.`,
      true
    );
    await loadStockStrip();
    const updated = (Array.isArray(stockRowsCache) ? stockRowsCache : []).find((item) => item.id === layerPriceSource.id);
    if (updated) {
      layerPriceSource = updated;
      fillLayerPriceFields(updated);
    }
    return;
  }
  const destType = priceDestinationType();
  if (destType === "PROJECT" && !document.getElementById("priceDestProject")?.value) {
    setPriceMessage("Selecciona un proyecto destino.", false);
    syncLayerPriceSaveButton();
    return;
  }
  const fromLabel = inventoryProjectOrAssignmentLabel(layerPriceSource);
  const toLabel = priceDestinationLabel(layerPriceSource);
  if (
    !window.confirm(
      layerValueAssignConfirmMessage(
        parsed,
        qtyParsed.value,
        remainingRaw,
        String(layerPriceSource.qty ?? layer.qty),
        fromLabel,
        toLabel,
        fromLabel,
        destType === "PROJECT"
      )
    )
  ) {
    return;
  }
  const body = {
    qtyToValue: qtyParsed.value,
    unitPriceMxn: parsed.value,
    destinationType: destType
  };
  if (destType === "PROJECT") body.projectId = document.getElementById("priceDestProject")?.value;
  const response = await authenticatedFetch(`/api/inventory/layers/${encodeURIComponent(layer.id)}/value-and-assign`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  const data = await response?.json().catch(() => ({}));
  if (!response?.ok) {
    setPriceMessage(data.message || data.code || "No se pudo guardar el precio.", false);
    return;
  }
  setPriceMessage(
    `Precio guardado. ${formatQty(data.qtyAffected || qtyParsed.value)} piezas valuadas. Remanente ${formatQty(data.qtyRemaining ?? remainingRaw)}.`,
    true
  );
  await loadStockStrip();
  const updated = (Array.isArray(stockRowsCache) ? stockRowsCache : []).find((item) => item.id === layerPriceSource.id);
  if (updated) {
    layerPriceSource = updated;
    fillLayerPriceFields(updated);
  }
}

function wireLayerPricePanel() {
  const layerSel = document.getElementById("priceLayer");
  if (layerSel && layerSel.dataset.wired !== "1") {
    layerSel.dataset.wired = "1";
    layerSel.addEventListener("change", () => {
      resetNewPriceInput(selectedPriceLayer());
      updateLayerPricePreview();
    });
  }
  const priceNew = document.getElementById("priceNew");
  if (priceNew && priceNew.dataset.wired !== "1") {
    priceNew.dataset.wired = "1";
    priceNew.addEventListener("input", updateLayerPricePreview);
    priceNew.addEventListener("change", updateLayerPricePreview);
  }
  const qtyToValue = document.getElementById("priceQtyToValue");
  if (qtyToValue && qtyToValue.dataset.wired !== "1") {
    qtyToValue.dataset.wired = "1";
    qtyToValue.addEventListener("input", updateLayerPricePreview);
    qtyToValue.addEventListener("change", updateLayerPricePreview);
  }
  const destType = document.getElementById("priceDestType");
  if (destType && destType.dataset.wired !== "1") {
    destType.dataset.wired = "1";
    destType.addEventListener("change", () => {
      syncPriceDestProjectVisible();
      updateLayerPricePreview();
    });
  }
  const destProject = document.getElementById("priceDestProject");
  if (destProject && destProject.dataset.wired !== "1") {
    destProject.dataset.wired = "1";
    destProject.addEventListener("change", updateLayerPricePreview);
  }
  const confirmBtn = document.getElementById("priceConfirmBtn");
  if (confirmBtn && confirmBtn.dataset.wired !== "1") {
    confirmBtn.dataset.wired = "1";
    confirmBtn.addEventListener("click", () => void confirmLayerPriceUpdate());
  }
  const cancelBtn = document.getElementById("priceCancelBtn");
  if (cancelBtn && cancelBtn.dataset.wired !== "1") {
    cancelBtn.dataset.wired = "1";
    cancelBtn.addEventListener("click", closeLayerPricePanel);
  }
}

function openCatalogDetail(product) {
  const fields = [
    { label: "Cliente", value: owningClientDisplayName() },
    { label: "Proyectos con existencias", value: catalogProjectsWithStockLabel(product) },
    { label: "Lote", value: "N/D" },
    { label: "SKU / Código de barras", value: formatSkuBarcode(product) },
    { label: "Producto", value: product.name },
    { label: "Almacén", value: product.warehouse },
    { label: "Código de barras", value: product.barcode }
  ];
  if (canSeeEconomicValuation()) {
    const valuation = product.valuation || null;
    fields.push(
      { label: "Valor unitario / rango MXN", value: unitPriceDisplay(valuation) },
      { label: "Valor total actual MXN", value: formatMxn(valuation?.totalValueMxn) },
      { label: "Piezas sin valor", value: formatQty(valuation?.qtyUnvalued ?? 0) },
      { label: "Cobertura económica", value: `${valuation?.coveragePct || "0.00"}%` }
    );
  }
  openDetailDrawer("Detalle de producto", fields, [
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
      label: "Ver movimientos",
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

let inventoryStatusCatalog = [];

function inventoryStatusRecord(code) {
  const upper = String(code || "").trim().toUpperCase();
  if (!upper) return null;
  return inventoryStatusCatalog.find((row) => String(row.code || "").toUpperCase() === upper) || null;
}

function activeInventoryStatuses() {
  return inventoryStatusCatalog.filter((row) => row && row.active === true);
}

function pickableInventoryStatuses() {
  return activeInventoryStatuses().filter((row) => row.pickable !== false);
}

function formatInventoryStatus(status) {
  if (status == null || status === "") return "—";
  const found = inventoryStatusRecord(status);
  const code = String(found?.code || status);
  if (code.toUpperCase() === "AVAILABLE") return "Disponible";
  if (found) return found.label || found.code || String(status);
  return String(status);
}

function inventoryStatusSearchBlob(status) {
  const raw = status == null ? "" : String(status);
  return `${raw} ${formatInventoryStatus(raw)}`.toLowerCase();
}

function inventoryStatusBadge(value) {
  const raw = value == null || value === "" ? "—" : String(value);
  const found = inventoryStatusRecord(raw);
  const label = found ? formatInventoryStatus(found.code) : raw;
  const title = found ? found.code : raw;
  return `<span class="badge status-badge" title="${escCell(String(title))}">${escCell(String(label))}</span>`;
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
  const found = inventoryStatusRecord(raw);
  if (found) {
    return inventoryStatusBadge(found.code);
  }
  const upper = raw.toUpperCase();
  if (upper === "OPEN" || upper === "PENDING") {
    return `<span class="badge warn">${escCell(upper === "OPEN" ? "Abierta" : "Pendiente")}</span>`;
  }
  if (upper === "RESOLVED" || upper === "CLOSED") {
    return `<span class="badge success">${escCell(upper === "RESOLVED" ? "Resuelta" : "Cerrada")}</span>`;
  }
  const tone =
    upper.includes("COMPLETED") || upper.includes("RESOLVED") || upper === "OK"
      ? "success"
      : upper.includes("IN_PROGRESS")
        ? "warn"
        : upper.includes("ERROR") || upper.includes("REJECTED") || upper.includes("CONFLICT")
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
  const noticesHint = document.getElementById("taskNoticesHint");
  if (noticesHint) noticesHint.classList.toggle("hidden", !notices);
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
  const label = incidentTypeLabel(type);
  const raw = String(type || "").toUpperCase();
  const tone =
    raw.includes("DAMAGED") || raw.includes("MISSING")
      ? "error"
      : raw.includes("STOCK") || raw.includes("WRONG") || raw.includes("DOUBLE")
        ? "warn"
        : "info";
  return `<span class="badge badge-incident-type ${tone}">${escCell(label)}</span>`;
}

function incidentStatusBadge(status) {
  const key = String(status || "").toUpperCase();
  if (key === "RESOLVED" || key === "CLOSED") {
    return `<span class="badge badge-incident-resolved">Resuelta</span>`;
  }
  if (key === "OPEN" || key === "PENDING") {
    return `<span class="badge badge-incident-open">Abierta</span>`;
  }
  return statusBadge(status);
}

function movementTypeBadge(type) {
  const label = formatMovementTypeLabel(type);
  const raw = String(type || "").toUpperCase();
  const tone =
    raw === "IN" || raw === "INBOUND"
      ? "success"
      : raw === "OUT" || raw === "OUTBOUND" || raw === "PICK"
        ? "warn"
        : raw === "RELOCATE" || raw === "ASSIGNMENT_TRANSFER"
          ? "info"
          : "info";
  return `<span class="badge badge-movement ${tone}">${escCell(label)}</span>`;
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
      noteUserNavChoice(section, null);
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
    const projects = getOperationalProjectsForSelect();
    projectSel.innerHTML =
      '<option value="">— Si hay varias líneas, elige proyecto —</option>' +
      projects
        .map((p) => `<option value="${escCell(p.code)}">${escCell(p.name)} (${escCell(p.code)})</option>`)
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
          const assignment = c.assignmentLabel || assignmentDisplayLabel(c);
          const label = `${assignment} · ${c.location || "—"} · ${formatInventoryStatus(c.status)} · ${c.qty ?? "—"} · Reservada ${
            c.reservedQty ?? "—"
          } · No reservada ${c.unreservedQty ?? "—"}`;
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
      if (projectSel) {
        if (c.assignmentType === "FREE_TO_SALE") {
          projectSel.value = "";
        } else if (c.projectCode) {
          if (![...projectSel.options].some((o) => o.value === c.projectCode)) {
            const opt = document.createElement("option");
            opt.value = c.projectCode;
            opt.textContent = c.projectName || c.projectCode;
            projectSel.appendChild(opt);
          }
          projectSel.value = c.projectCode;
        }
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
        `Línea seleccionada: ${c.assignmentLabel || assignmentDisplayLabel(c)} · ${c.location} / ${formatInventoryStatus(c.status)} (qty ${c.qty}, no reservada ${c.unreservedQty ?? "—"}). Confirma de nuevo el surtido.`,
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
    status: document.getElementById("invFilterStatus")?.value?.trim() || "",
    unpricedOnly: inventoryUnpricedOnly
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
  const kpi = inventoryKpiCache;
  const products = new Set(list.map((r) => r.product?.sku).filter(Boolean));
  const locations = new Set(list.map((r) => r.location?.code).filter(Boolean));
  pendingConflictsCache = countStockConflicts(list);
  const scoped = hasActiveInventoryScope();
  const productCount = scoped
    ? Number(kpi?.products ?? kpi?.distinctInventoryProducts ?? products.size)
    : Number(kpi?.products || productsCache.length || products.size);
  const elProducts = document.getElementById("sumProducts");
  const elCustomers = document.getElementById("sumCustomers");
  const elLocations = document.getElementById("sumLocations");
  const elMovements = document.getElementById("sumMovements");
  const elConflicts = document.getElementById("sumConflicts");
  if (elProducts) elProducts.textContent = String(productCount || 0);
  const elProductsLabel = document.getElementById("sumProductsLabel");
  if (elProductsLabel) {
    elProductsLabel.textContent = scoped ? "Productos con existencia" : "Productos en catálogo";
  }
  if (elCustomers) elCustomers.textContent = String(kpi?.projects ?? inventoryProjectsCache.length);
  if (elLocations) elLocations.textContent = String(kpi?.locations || locations.size);
  if (elMovements) elMovements.textContent = String(kpi?.movements ?? movementsCountCache ?? 0);
  if (elConflicts) elConflicts.textContent = String(pendingConflictsCache);
  const visible = filterStockRows(list);
  const counts = summarizeVisibleStock(visible);
  const useOfficialTotals = !inventoryHasLocalFilters() && kpi;
  const piezas = useOfficialTotals && kpi.qty != null ? Number(kpi.qty) : counts.piezas;
  const saldos = useOfficialTotals && kpi.cubes != null ? Number(kpi.cubes) : counts.saldos;
  const elStockTotal = document.getElementById("sumStockTotal");
  const elStockCubes = document.getElementById("sumStockCubes");
  if (elStockTotal) elStockTotal.textContent = piezas ? formatQty(piezas) : "0";
  if (elStockCubes) elStockCubes.textContent = String(saldos || 0);
  updateEconomicSummaryCards(visible);
  updateControlCenterKpis();
}

function updateEconomicSummaryCards(rows) {
  applyEconomicVisibility();
  if (!canSeeEconomicValuation()) return;
  const valuation = aggregateRowValuations(rows);
  const elValue = document.getElementById("sumInventoryValue");
  const elValued = document.getElementById("sumValuedQty");
  const elUnvalued = document.getElementById("sumUnvaluedQty");
  const elCoverage = document.getElementById("sumEconomicCoverage");
  const hint = document.getElementById("inventoryValuePartialHint");
  const countsEl = document.getElementById("inventoryUnvaluedCounts");
  const counts = summarizeVisibleStock(rows);
  if (elValue) elValue.textContent = formatMxn(valuation.totalValueMxn);
  if (elValued) elValued.textContent = formatQty(valuation.qtyValued);
  if (elUnvalued) elUnvalued.textContent = formatQty(valuation.qtyUnvalued);
  if (elCoverage) elCoverage.textContent = `${valuation.coveragePct}%`;
  if (countsEl) {
    countsEl.textContent = `Hay ${formatQty(counts.unvaluedPiezas)} piezas y ${counts.unvaluedSaldos} saldos sin valor.`;
  }
  if (hint) {
    const showHint = valuation.status === "PARTIAL" || (valuation.status === "NONE" && valuation.qtyTotal > 0);
    hint.classList.toggle("hidden", !showHint);
  }
  const unpricedBtn = document.getElementById("inventoryUnpricedFilterBtn");
  if (unpricedBtn) {
    unpricedBtn.textContent = inventoryUnpricedOnly ? "Mostrar todos los registros" : "Ver registros sin precio";
  }
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
    if (!(Number(row.qty) > 0)) return false;
    const p = row.product || {};
    const project = getAviatProjectFromRow(row);
    const assignmentLabel = inventoryProjectOrAssignmentLabel(row);
    const lote = extractLoteFromRow(row);
    const skuOk =
      !filters.sku ||
      matchesFilter(p.sku, filters.sku) ||
      matchesSkuFlexible(p.sku, filters.sku) ||
      matchesFilter(p.barcode, filters.sku) ||
      matchesSkuFlexible(p.barcode, filters.sku);
    return (
      matchesFilter(assignmentLabel, filters.cliente) &&
      matchesFilter(project.code, filters.customer) &&
      matchesFilter(lote, filters.lote) &&
      skuOk &&
      matchesFilter(p.name, filters.producto) &&
      matchesFilter(row.location?.code, filters.ubicacion) &&
      matchesFilter(inventoryStatusSearchBlob(row.status), filters.status) &&
      (!filters.unpricedOnly || rowHasUnvaluedPieces(row))
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
  const kpi = inventoryKpiCache;
  const scoped = hasActiveInventoryScope();
  const productCount = scoped
    ? Number(kpi?.products ?? kpi?.distinctInventoryProducts ?? 0)
    : Number(kpi?.products || productsCache.length || 0);
  const stockTotal = kpi?.qty != null ? Number(kpi.qty) : sumStockQty(list);
  const movementTotal = kpi?.movements ?? movementsCountCache;
  const setKpi = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  };
  setKpi("ccKpiProducts", String(productCount || 0));
  setKpi("ccKpiCustomers", String(kpi?.projects ?? inventoryProjectsCache.length));
  setKpi("ccKpiLocations", String(kpi?.locations || 0));
  setKpi("ccKpiStock", stockTotal ? formatQty(stockTotal) : "0");
  setKpi("ccKpiMovements", String(movementTotal || 0));
  setKpi("ccKpiConflicts", String(countStockConflicts(list)));
}

function stockRowCells(row, { includeWarehouse = true, includeEconomic = false } = {}) {
  const p = row.product || {};
  const cells = [
    renderCellEllipsis(inventoryProjectOrAssignmentLabel(row)),
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
  if (includeEconomic && canSeeEconomicValuation()) {
    const valuation = row.valuation || null;
    cells.push(
      unitPriceDisplay(valuation),
      formatMxn(valuation?.totalValueMxn),
      valuationStatusBadge(valuation?.status)
    );
  }
  return cells;
}

function catalogRowCells(product) {
  const cells = [
    renderCellEllipsis(catalogProjectsWithStockLabel(product)),
    renderCellEllipsis("N/D"),
    `<strong class="cell-nowrap">${escCell(formatSkuBarcode(product))}</strong>`,
    renderCellEllipsis(product.name || "—"),
    `<span class="cell-nowrap">${renderCellEllipsis(product.warehouse || "—")}</span>`,
    `<span class="cell-nowrap">${escCell(product.barcode || "—")}</span>`
  ];
  if (canSeeEconomicValuation()) {
    const valuation = product.valuation || null;
    cells.push(
      unitPriceDisplay(valuation),
      formatMxn(valuation?.totalValueMxn),
      formatQty(valuation?.qtyUnvalued ?? 0)
    );
  }
  return cells;
}

function stockColumnsFull() {
  const cols = [
    { label: "Proyecto / asignación", sortKey: (r) => inventoryProjectOrAssignmentLabel(r), sortType: "text" },
    { label: "Lote", sortKey: (r) => extractLoteFromRow(r), sortType: "text" },
    { label: "SKU / Código de barras", sortKey: (r) => r.product?.sku || "", sortType: "text" },
    { label: "Producto", sortKey: (r) => r.product?.name || "", sortType: "text" },
    { label: "Almacén", sortKey: (r) => r.location?.warehouse || "", sortType: "text" },
    { label: "Ubicación", sortKey: (r) => r.location?.code || "", sortType: "text" },
    { label: "Estatus", sortKey: (r) => r.status || "", sortType: "text" },
    { label: "Cantidad", align: "right", sortKey: (r) => Number(r.qty) || 0, sortType: "number" }
  ];
  if (canSeeEconomicValuation()) {
    cols.push(
      { label: "Valor unitario promedio MXN", align: "right", sortKey: (r) => Number(r.valuation?.avgUnitPriceMxn) || 0, sortType: "number" },
      { label: "Valor total MXN", align: "right", sortKey: (r) => Number(r.valuation?.totalValueMxn) || 0, sortType: "number" },
      { label: "Estado de valuación", sortKey: (r) => r.valuation?.status || "", sortType: "text" }
    );
  }
  return cols;
}

const STOCK_COLUMNS_CC = [
  { label: "Proyecto / asignación", sortKey: (r) => inventoryProjectOrAssignmentLabel(r) },
  { label: "Lote", sortKey: (r) => extractLoteFromRow(r) },
  { label: "SKU / Código de barras", sortKey: (r) => r.product?.sku || "" },
  { label: "Producto", sortKey: (r) => r.product?.name || "" },
  { label: "Ubicación", sortKey: (r) => r.location?.code || "" },
  { label: "Estatus", sortKey: (r) => r.status || "" },
  { label: "Cantidad", align: "right", sortKey: (r) => Number(r.qty) || 0, sortType: "number" }
];

function catalogColumns() {
  const cols = [
    { label: "Proyectos con existencias", sortKey: (p) => catalogProjectsWithStockLabel(p) },
    { label: "Lote", sortKey: () => "N/D" },
    { label: "SKU / Código de barras", sortKey: (p) => p.sku || "" },
    { label: "Producto", sortKey: (p) => p.name || "" },
    { label: "Almacén", sortKey: (p) => p.warehouse || "" },
    { label: "Código de barras", sortKey: (p) => p.barcode || "" }
  ];
  if (canSeeEconomicValuation()) {
    cols.push(
      { label: "Valor unitario / rango MXN", align: "right", sortKey: (p) => Number(p.valuation?.avgUnitPriceMxn) || 0, sortType: "number" },
      { label: "Valor total MXN", align: "right", sortKey: (p) => Number(p.valuation?.totalValueMxn) || 0, sortType: "number" },
      { label: "Piezas sin valor", align: "right", sortKey: (p) => Number(p.valuation?.qtyUnvalued) || 0, sortType: "number" }
    );
  }
  return cols;
}

const CATALOG_COLUMNS = catalogColumns();

const CLIENTS_COLUMNS = [
  { label: "Cliente", sortKey: (r) => r.name || "" },
  { label: "Código", sortKey: (r) => r.code || "" },
  { label: "Proyectos", align: "right", sortKey: (r) => r.projectCount || 0, sortType: "number" },
  { label: "RFC", sortKey: (r) => r.rfc || "" },
  { label: "Estado", sortKey: (r) => (r.active === false ? "Inactivo" : "Activo") }
];

function formatMexicoCityDateTime(value) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("es-MX", {
    timeZone: "America/Mexico_City",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).format(new Date(value));
}

function movementQuantity(row) {
  const type = row?.movement?.movementType || row?.movementType;
  if (type === "RELOCATE") return "Traslado";
  if (type === "ASSIGNMENT_TRANSFER") return "Reasignación";
  const qty = row?.movement?.signedQty;
  if (qty == null) return "—";
  const n = Number(qty);
  return `${n > 0 ? "+" : ""}${formatQty(qty)}`;
}

function formatMovementTypeLabel(type) {
  const raw = String(type || "").toUpperCase();
  if (raw === "ASSIGNMENT_TRANSFER") return "Reasignación";
  if (raw === "RELOCATE") return "Traslado";
  if (raw === "IN" || raw === "INBOUND") return "Entrada";
  if (raw === "OUT" || raw === "OUTBOUND" || raw === "PICK") return raw === "PICK" ? "Picking" : "Salida";
  return type || "—";
}

function formatTransferAssignment(row) {
  const from =
    row?.fromAssignmentLabel ||
    (row?.movement?.fromAssignmentType === "FREE_TO_SALE" || row?.movement?.fromAssignmentKey === "FREE_TO_SALE"
      ? "FREE TO SALE"
      : row?.fromProject
        ? `${row.fromProject.name} (${row.fromProject.code})`
        : row?.movement?.fromAssignmentKey || "—");
  const to =
    row?.toAssignmentLabel ||
    (row?.movement?.toAssignmentType === "FREE_TO_SALE" || row?.movement?.toAssignmentKey === "FREE_TO_SALE"
      ? "FREE TO SALE"
      : row?.toProject
        ? `${row.toProject.name} (${row.toProject.code})`
        : row?.movement?.toAssignmentKey || "—");
  return `${from} → ${to}`;
}

function movementLocation(row) {
  const from = row?.fromLocation?.code;
  const to = row?.toLocation?.code;
  if (from && to) return `${from} → ${to}`;
  if (from) return `${from} →`;
  if (to) return `→ ${to}`;
  return "—";
}

const TRACE_COLUMNS = [
  { label: "Fecha / hora", sortKey: (r) => r.createdAt, sortType: "date", render: (r) => formatMexicoCityDateTime(r.createdAt) },
  { label: "Cliente", sortKey: (r) => r.client?.tradeName || r.client?.name || "", render: (r) => renderCellWithClamp(r.client?.tradeName || r.client?.name || "—", "cell-truncate", 18) },
  { label: "Proyecto", sortKey: (r) => (r.movement?.movementType === "ASSIGNMENT_TRANSFER" ? formatTransferAssignment(r) : r.project?.code || r.project?.name || ""), render: (r) => renderCellWithClamp(r.movement?.movementType === "ASSIGNMENT_TRANSFER" ? formatTransferAssignment(r) : r.project?.code || r.project?.name || "—", "cell-truncate", 22) },
  { label: "SKU", sortKey: (r) => r.product?.sku || "", render: (r) => `<strong class="cell-nowrap">${escCell(r.product?.sku || "—")}</strong>` },
  { label: "Descripción", sortKey: (r) => r.product?.name || "", render: (r) => renderCellWithClamp(r.product?.name || "—", "cell-truncate", 25) },
  { label: "Tipo", sortKey: (r) => r.movement?.movementType || "", render: (r) => movementTypeBadge(r.movement?.movementType || r.movement?.type || "—") },
  { label: "Movimiento", align: "right", sortKey: (r) => Number(r.movement?.signedQty) || 0, sortType: "number", render: movementQuantity },
  { label: "Antes", align: "right", sortKey: (r) => Number(r.movement?.quantityBefore) || 0, sortType: "number", render: (r) => formatQty(r.movement?.quantityBefore) },
  { label: "Después", align: "right", sortKey: (r) => Number(r.movement?.quantityAfter) || 0, sortType: "number", render: (r) => formatQty(r.movement?.quantityAfter) },
  { label: "Ubicación", sortKey: movementLocation, render: (r) => renderCellWithClamp(movementLocation(r), "cell-truncate", 24) },
  { label: "Usuario", sortKey: (r) => r.user?.fullName || "", render: (r) => renderCellWithClamp(r.user?.fullName || "—", "cell-truncate", 18) },
  { label: "Referencia", sortKey: (r) => r.requisition?.number || r.reference || "", render: (r) => renderCellWithClamp(r.requisition?.number || r.reference || "—", "cell-truncate", 20) }
];

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
  {
    label: "Proyecto",
    sortKey: (m) =>
      m.movement?.movementType === "ASSIGNMENT_TRANSFER" || m.movementType === "ASSIGNMENT_TRANSFER"
        ? formatTransferAssignment(m)
        : getAviatProjectDisplayFromRow(m),
    render: (m) =>
      renderCellWithClamp(
        m.movement?.movementType === "ASSIGNMENT_TRANSFER" || m.movementType === "ASSIGNMENT_TRANSFER"
          ? formatTransferAssignment(m)
          : getAviatProjectDisplayFromRow(m),
        "cell-truncate",
        28
      ),
    title: (m) =>
      m.movement?.movementType === "ASSIGNMENT_TRANSFER" || m.movementType === "ASSIGNMENT_TRANSFER"
        ? formatTransferAssignment(m)
        : getAviatProjectDisplayFromRow(m)
  },
  { label: "Lote", sortKey: (m) => extractLoteFromRow(m), render: (m) => renderCellEllipsis(extractLoteFromRow(m)), title: (m) => extractLoteFromRow(m) },
  {
    label: "Tipo",
    sortKey: (m) => m.movement?.movementType || m.movementType || "",
    render: (m) => movementTypeBadge(m.movement?.movementType || m.movementType)
  },
  {
    label: "Cantidad",
    align: "right",
    sortKey: (m) => Number(m.qty) || 0,
    sortType: "number",
    render: (m) => formatQty(m.qty)
  },
  { label: "SKU / Código", sortKey: (m) => m.product?.sku || "", render: (m) => escCell(formatSkuBarcode(m.product)), title: (m) => m.product?.sku || "" },
  { label: "Producto", sortKey: (m) => m.product?.name || "", render: (m) => renderCellWithClamp(m.product?.name, "cell-truncate", 28), title: (m) => m.product?.name || "" },
  { label: "Antes", align: "right", sortKey: (m) => Number(m.movement?.quantityBefore) || 0, sortType: "number", render: (m) => formatMovementBalance(m, "quantityBefore") },
  { label: "Después", align: "right", sortKey: (m) => Number(m.movement?.quantityAfter) || 0, sortType: "number", render: (m) => formatMovementBalance(m, "quantityAfter") },
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

function formatReqTableClient(row) {
  return canonicalClientDisplay(row);
}

function formatReqTableProject(row) {
  const project = row?.project;
  if (!project) return "—";
  if (isForbiddenProjectLabel(project.code) || isForbiddenProjectLabel(project.name)) return "—";
  const name = String(project.name || "").trim();
  const code = String(project.code || "").trim();
  if (name && code) return `${name} (${code})`;
  return name || code || "—";
}

const REQ_COLUMNS = [
  { label: "Requisición", sortKey: (t) => t.number || "", render: (t) => renderCellWithClamp(t.number, "cell-truncate", 18), title: (t) => t.number || "" },
  {
    label: "Cliente",
    sortKey: (t) => formatReqTableClient(t),
    render: (t) => renderCellWithClamp(formatReqTableClient(t), "cell-truncate", 22),
    title: (t) => formatReqTableClient(t)
  },
  {
    label: "Proyecto",
    sortKey: (t) => formatReqTableProject(t),
    render: (t) => renderCellWithClamp(formatReqTableProject(t), "cell-truncate", 24),
    title: (t) => formatReqTableProject(t)
  },
  {
    label: "Prioridad",
    sortKey: (t) => t.priority || "",
    render: (t) => escCell(t.priorityLabel || t.priority || "—"),
    title: (t) => t.priorityLabel || t.priority || ""
  },
  {
    label: "Estado",
    sortKey: (t) => t.status || "",
    render: (t) => statusBadge(t.status),
    title: (t) => t.status || ""
  },
  {
    label: "Estado de surtido",
    sortKey: (t) => t.fulfillmentStatus || "",
    render: (t) => `<span class="badge info">${escCell(t.fulfillmentStatus || "—")}</span>`,
    title: (t) => t.fulfillmentStatus || ""
  },
  {
    label: "Solicitado",
    align: "right",
    sortKey: (t) => Number(t.totals?.requestedQty) || 0,
    sortType: "number",
    render: (t) => formatQty(t.totals?.requestedQty)
  },
  {
    label: "Reservado",
    align: "right",
    sortKey: (t) => Number(t.totals?.reservedQty) || 0,
    sortType: "number",
    render: (t) => formatQty(t.totals?.reservedQty)
  },
  {
    label: "Surtido",
    align: "right",
    sortKey: (t) => Number(t.totals?.fulfilledQty) || 0,
    sortType: "number",
    render: (t) => formatQty(t.totals?.fulfilledQty)
  },
  {
    label: "Pendiente",
    align: "right",
    sortKey: (t) => Number(t.totals?.pendingQty) || 0,
    sortType: "number",
    render: (t) => formatQty(t.totals?.pendingQty)
  },
  {
    label: "Fecha",
    sortKey: (t) => t.createdAt,
    sortType: "date",
    render: (t) => formatDateShort(t.createdAt)
  }
];

const INCIDENT_COLUMNS = [
  { label: "Fecha", sortKey: (r) => r.createdAt, sortType: "date", render: (r) => formatDateShort(r.createdAt) },
  { label: "Tipo", sortKey: (r) => incidentTypeLabel(r.type), render: (r) => incidentTypeBadge(r.type) },
  { label: "Estado", sortKey: (r) => r.status || "", render: (r) => incidentStatusBadge(r.status) },
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
  ["catalogImportModal", "reqActionModal"].forEach((id) => {
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
  if (openInv) openInv.addEventListener("click", () => openInventoryImportAssistant());
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
  wireAssignmentTransferPanel();
  wireLayerPricePanel();
  wireReqActionModal();
  wirePickRequisitionMode();
  const rStock = document.getElementById("reportsExportStock");
  const rStockX = document.getElementById("reportsExportStockXlsx");
  const rMov = document.getElementById("reportsExportMovements");
  const rReq = document.getElementById("reportsExportRequisitions");
  const rProd = document.getElementById("reportsExportProducts");
  const rTrace = document.getElementById("reportsExportTrace");
  if (rStock) rStock.addEventListener("click", () => void downloadExport("/api/exports/inventory.csv", "inventory.csv"));
  if (rStockX) rStockX.addEventListener("click", () => void downloadExport("/api/exports/inventory.xlsx", "inventory.xlsx"));
  if (rMov) rMov.addEventListener("click", () => void downloadExport("/api/exports/movements.csv", "movements.csv"));
  if (rReq) rReq.addEventListener("click", () => void downloadExport("/api/exports/requisitions.csv", "requisitions.csv"));
  if (rProd) rProd.addEventListener("click", () => void downloadExport("/api/exports/products.csv", "products.csv"));
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
  void loadRealClientsModule();
}

function renderWarehousesModule() {
  void loadWarehousesModule();
}

function renderLocationsModule() {
  void loadLocationsModule();
}

function masterModal() {
  return document.getElementById("masterDataModal");
}

function openMasterModal(title, fieldsHtml, onSubmit) {
  const modal = masterModal();
  const form = document.getElementById("masterDataForm");
  const titleEl = document.getElementById("masterDataTitle");
  const msg = document.getElementById("masterDataMessage");
  if (!modal || !form || !titleEl) return;
  titleEl.textContent = title;
  if (msg) {
    msg.textContent = "";
    msg.classList.remove("ok", "error");
  }
  form.innerHTML = fieldsHtml;
  form.onsubmit = async (event) => {
    event.preventDefault();
    if (msg) {
      msg.textContent = "";
      msg.classList.remove("ok", "error");
    }
    try {
      await onSubmit(new FormData(form), msg);
    } catch (error) {
      if (msg) {
        msg.textContent = error?.message || "No se pudo guardar.";
        msg.classList.add("error");
      }
    }
  };
  modal.classList.add("open");
  modal.setAttribute("aria-hidden", "false");
}

function closeMasterModal() {
  const modal = masterModal();
  if (!modal) return;
  modal.classList.remove("open");
  modal.setAttribute("aria-hidden", "true");
}

function masterField(name, label, { required = false, value = "", type = "text", span = false } = {}) {
  return `<div class="field${span ? " field-span" : ""}"><label for="mf_${name}">${escCell(label)}${required ? " *" : ""}</label><input id="mf_${name}" name="${escCell(name)}" type="${escCell(type)}" value="${escCell(value || "")}" ${required ? "required" : ""} /></div>`;
}

function masterSelect(name, label, options, { required = false, value = "" } = {}) {
  const opts = options
    .map((opt) => `<option value="${escCell(opt.value)}" ${opt.value === value ? "selected" : ""}>${escCell(opt.label)}</option>`)
    .join("");
  return `<div class="field"><label for="mf_${name}">${escCell(label)}${required ? " *" : ""}</label><select id="mf_${name}" name="${escCell(name)}" ${required ? "required" : ""}>${opts}</select></div>`;
}

function formText(fd, name) {
  return String(fd.get(name) || "").trim();
}

async function refreshMasterSelectors() {
  await Promise.all([loadWarehousesQuiet(), loadLocationsQuiet(), loadRelocateLocationsCatalog()]);
  await loadCatalogData();
}

async function loadRealClientsQuiet() {
  const response = await authenticatedFetch("/api/clients");
  realClientsCache = response?.ok ? await response.json() : [];
  if (!Array.isArray(realClientsCache)) realClientsCache = [];
  return realClientsCache;
}

async function loadWarehousesQuiet() {
  const response = await authenticatedFetch("/api/warehouses");
  warehousesCatalogCache = response?.ok ? await response.json() : [];
  if (!Array.isArray(warehousesCatalogCache)) warehousesCatalogCache = [];
  return warehousesCatalogCache;
}

async function loadLocationsQuiet() {
  const q = document.getElementById("locationsSearch")?.value?.trim() || "";
  const warehouse = document.getElementById("locationsWarehouseFilter")?.value?.trim() || "";
  const params = new URLSearchParams();
  if (currentRole === "ADMIN") params.set("includeInactive", "1");
  if (q) params.set("q", q);
  if (warehouse) params.set("warehouse", warehouse);
  const response = await authenticatedFetch(`/api/inventory/locations?${params.toString()}`);
  locationsCatalogCache = response?.ok ? await response.json() : [];
  if (!Array.isArray(locationsCatalogCache)) locationsCatalogCache = [];
  return locationsCatalogCache;
}

async function loadRealClientsModule() {
  await loadRealClientsQuiet();
  if (!clientsModuleList) return;
  const rows = realClientsCache.slice().sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "es"));
  const countEl = document.getElementById("clientsTableCount");
  if (countEl) countEl.textContent = `Mostrando ${rows.length} cliente${rows.length === 1 ? "" : "s"}`;
  const canAdmin = currentRole === "ADMIN";
  renderDataGrid(clientsModuleList, {
    gridId: "clients",
    columns: CLIENTS_COLUMNS,
    rowDataList: rows,
    rowCellsFn: (r) => [
      `<button type="button" class="linkish" data-open-client="${escCell(r.id)}">${escCell(r.tradeName || r.name || r.code || "—")}</button>`,
      `<span class="cell-nowrap">${escCell(r.code || "—")}</span>`,
      String(r._count?.projects ?? r.projectCount ?? 0),
      escCell(r.rfc || "—"),
      `<span class="status-chip">${r.active === false ? "Inactivo" : "Activo"}</span>`
    ],
    colsClass: "data-grid-cols-clients",
    sizeClass: "data-grid-size-catalog",
    emptyMessage: "No hay clientes. El ADMIN puede crear un cliente y luego sus proyectos."
  });
  if (canAdmin) {
    clientsModuleList.querySelectorAll("[data-open-client]").forEach((btn) => {
      btn.addEventListener("click", () => void openClientDetail(btn.getAttribute("data-open-client")));
    });
  } else {
    clientsModuleList.querySelectorAll("[data-open-client]").forEach((btn) => {
      btn.addEventListener("click", () => void openClientDetail(btn.getAttribute("data-open-client")));
    });
  }
  const addBtn = document.getElementById("clientsAddBtn");
  if (addBtn) addBtn.style.display = canAdmin ? "" : "none";
}

async function openClientDetail(clientId) {
  const response = await authenticatedFetch(`/api/clients/${encodeURIComponent(clientId)}`);
  if (!response?.ok) return;
  const client = await response.json();
  const projects = Array.isArray(client.projects) ? client.projects : [];
  const projectHtml = projects.length
    ? `<ul class="info-list">${projects
        .map(
          (p) =>
            `<li><button type="button" class="linkish" data-open-project="${escCell(p.id)}">${escCell(p.name)} (${escCell(p.code)})</button> · ${p.active === false ? "Inactivo" : "Activo"}</li>`
        )
        .join("")}</ul>`
    : `<p class="assignee-hint">Este cliente aún no tiene proyectos.</p>`;
  const actions = currentRole === "ADMIN"
    ? [
        { id: "edit", label: "Editar", className: "btn-secondary", onClick: () => openClientForm(client) },
        {
          id: "toggle",
          label: client.active === false ? "Reactivar" : "Desactivar",
          className: "btn-secondary",
          onClick: () => void toggleMasterActive("client", client)
        },
        { id: "add-project", label: "Agregar proyecto", className: "btn-primary", onClick: () => openProjectForm(null, client) }
      ]
    : [];
  openDetailDrawer(client.tradeName || client.name || client.code, [
    { label: "Código", value: client.code },
    { label: "Nombre comercial", value: client.tradeName || client.name },
    { label: "Razón social", value: client.legalName },
    { label: "RFC", value: client.rfc },
    { label: "Dirección", value: client.address },
    { label: "Teléfono", value: client.phone },
    { label: "Correo", value: client.email },
    { label: "Contacto", value: client.primaryContact },
    { label: "Puesto", value: client.contactTitle },
    { label: "Tel. contacto", value: client.contactPhone },
    { label: "Correo contacto", value: client.contactEmail },
    { label: "Notas", value: client.notes },
    { label: "Estado", value: client.active === false ? "Inactivo" : "Activo" },
    { label: "Proyectos", html: true, value: projectHtml }
  ], actions);
  document.querySelectorAll("[data-open-project]").forEach((btn) => {
    btn.addEventListener("click", () => void openProjectDetail(btn.getAttribute("data-open-project")));
  });
}

function openClientForm(client) {
  closeDetailDrawer();
  openMasterModal(client ? "Editar cliente" : "Crear cliente", [
    masterField("code", "Código", { required: true, value: client?.code || "" }),
    masterField("name", "Nombre comercial", { required: true, value: client?.name || client?.tradeName || "" }),
    masterField("legalName", "Razón social", { value: client?.legalName || "" }),
    masterField("rfc", "RFC", { value: client?.rfc || "" }),
    masterField("address", "Dirección", { value: client?.address || "", span: true }),
    masterField("phone", "Teléfono", { value: client?.phone || "" }),
    masterField("email", "Correo general", { type: "email", value: client?.email || "" }),
    masterField("primaryContact", "Contacto principal", { value: client?.primaryContact || "" }),
    masterField("contactTitle", "Puesto", { value: client?.contactTitle || "" }),
    masterField("contactPhone", "Teléfono del contacto", { value: client?.contactPhone || "" }),
    masterField("contactEmail", "Correo del contacto", { type: "email", value: client?.contactEmail || "" }),
    masterField("notes", "Notas", { value: client?.notes || "", span: true })
  ].join(""), async (fd, msg) => {
    const payload = {
      code: formText(fd, "code"),
      name: formText(fd, "name"),
      legalName: formText(fd, "legalName") || null,
      rfc: formText(fd, "rfc") || null,
      address: formText(fd, "address") || null,
      phone: formText(fd, "phone") || null,
      email: formText(fd, "email") || null,
      primaryContact: formText(fd, "primaryContact") || null,
      contactTitle: formText(fd, "contactTitle") || null,
      contactPhone: formText(fd, "contactPhone") || null,
      contactEmail: formText(fd, "contactEmail") || null,
      notes: formText(fd, "notes") || null,
      tradeName: formText(fd, "name") || null
    };
    const response = await authenticatedFetch(client ? `/api/clients/${encodeURIComponent(client.id)}` : "/api/clients", {
      method: client ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || "No se pudo guardar el cliente.");
    if (msg) {
      msg.textContent = client ? "Cliente actualizado." : "Cliente creado correctamente.";
      msg.classList.add("ok");
    }
    await refreshMasterSelectors();
    await loadRealClientsModule();
    closeMasterModal();
    await openClientDetail(data.id);
  });
}

async function openProjectDetail(projectId) {
  const response = await authenticatedFetch(`/api/catalog/customers/${encodeURIComponent(projectId)}`);
  if (!response?.ok) return;
  const project = await response.json();
  const inherited = project.inheritedClient || project.client;
  openDetailDrawer(project.name, [
    { label: "Cliente (heredado)", html: true, value: inherited ? `<div class="inherited-box">${escCell(inherited.tradeName || inherited.name)} · ${escCell(inherited.code || "")}</div>` : "—" },
    { label: "Código", value: project.code },
    { label: "Nombre", value: project.name },
    { label: "Referencia operativa", value: project.tradeName },
    { label: "Empresa atendida", value: project.legalName },
    { label: "RFC del proyecto", value: project.rfc },
    { label: "Dirección operativa", value: project.address },
    { label: "Teléfono", value: project.phone },
    { label: "Correo", value: project.email },
    { label: "Contacto", value: project.primaryContact },
    { label: "Estado", value: project.active === false ? "Inactivo" : "Activo" }
  ], currentRole === "ADMIN"
    ? [
        { id: "edit", label: "Editar", className: "btn-secondary", onClick: () => openProjectForm(project, inherited) },
        {
          id: "toggle",
          label: project.active === false ? "Reactivar" : "Desactivar",
          className: "btn-secondary",
          onClick: () => void toggleMasterActive("project", project)
        }
      ]
    : []);
}

function openProjectForm(project, client) {
  closeDetailDrawer();
  const clientOptions = [{ value: "", label: "— Seleccionar cliente —" }].concat(
    realClientsCache.filter((c) => c.active !== false).map((c) => ({ value: c.id, label: `${c.code} · ${c.tradeName || c.name}` }))
  );
  openMasterModal(project ? "Editar proyecto" : "Agregar proyecto", [
    masterSelect("clientId", "Cliente propietario", clientOptions, { required: true, value: project?.clientId || client?.id || "" }),
    masterField("code", "Código", { required: true, value: project?.code || "" }),
    masterField("name", "Nombre", { required: true, value: project?.name || "" }),
    masterField("tradeName", "Nombre comercial / referencia operativa", { value: project?.tradeName || "" }),
    masterField("legalName", "Razón social o empresa atendida", { value: project?.legalName || "" }),
    masterField("rfc", "RFC", { value: project?.rfc || "" }),
    masterField("address", "Dirección operativa", { value: project?.address || "", span: true }),
    masterField("phone", "Teléfono", { value: project?.phone || "" }),
    masterField("email", "Correo", { type: "email", value: project?.email || "" }),
    masterField("primaryContact", "Contacto principal", { value: project?.primaryContact || "" }),
    masterField("contactTitle", "Puesto", { value: project?.contactTitle || "" }),
    masterField("contactPhone", "Teléfono del contacto", { value: project?.contactPhone || "" }),
    masterField("contactEmail", "Correo del contacto", { type: "email", value: project?.contactEmail || "" }),
    masterField("notes", "Notas", { value: project?.notes || "", span: true })
  ].join(""), async (fd, msg) => {
    const payload = {
      clientId: formText(fd, "clientId"),
      code: formText(fd, "code"),
      name: formText(fd, "name"),
      tradeName: formText(fd, "tradeName") || null,
      legalName: formText(fd, "legalName") || null,
      rfc: formText(fd, "rfc") || null,
      address: formText(fd, "address") || null,
      phone: formText(fd, "phone") || null,
      email: formText(fd, "email") || null,
      primaryContact: formText(fd, "primaryContact") || null,
      contactTitle: formText(fd, "contactTitle") || null,
      contactPhone: formText(fd, "contactPhone") || null,
      contactEmail: formText(fd, "contactEmail") || null,
      notes: formText(fd, "notes") || null
    };
    const response = await authenticatedFetch(project ? `/api/catalog/customers/${encodeURIComponent(project.id)}` : "/api/catalog/customers", {
      method: project ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || "No se pudo guardar el proyecto.");
    await refreshMasterSelectors();
    closeMasterModal();
    if (payload.clientId) await openClientDetail(payload.clientId);
  });
}

async function toggleMasterActive(kind, row) {
  const active = row.active === false;
  const url =
    kind === "client"
      ? `/api/clients/${encodeURIComponent(row.id)}/active`
      : kind === "project"
        ? `/api/catalog/customers/${encodeURIComponent(row.id)}/active`
        : kind === "warehouse"
          ? `/api/warehouses/${encodeURIComponent(row.id)}/active`
          : `/api/inventory/locations/${encodeURIComponent(row.id)}/active`;
  const response = await authenticatedFetch(url, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ active })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    window.alert(data.message || "No se pudo cambiar el estado.");
    return;
  }
  closeDetailDrawer();
  await refreshMasterSelectors();
  if (kind === "client") await loadRealClientsModule();
  if (kind === "warehouse") await loadWarehousesModule();
  if (kind === "location") await loadLocationsModule();
}

async function loadWarehousesModule() {
  await loadWarehousesQuiet();
  const host = document.getElementById("warehousesModuleList");
  const countEl = document.getElementById("warehousesTableCount");
  if (!host) return;
  const rows = warehousesCatalogCache.slice();
  if (countEl) countEl.textContent = `Mostrando ${rows.length} almacén${rows.length === 1 ? "" : "es"}`;
  const addBtn = document.getElementById("warehousesAddBtn");
  if (addBtn) addBtn.style.display = currentRole === "ADMIN" ? "" : "none";
  host.innerHTML = rows.length
    ? `<table class="excel-table"><thead><tr><th>Código</th><th>Nombre</th><th>Ubicaciones</th><th>Cant. física</th><th>Reservada</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>${rows
        .map((r) => {
          const actionLabel = currentRole === "ADMIN" ? "Ver / editar datos" : "Ver datos";
          return `<tr><td>${escCell(r.code)}</td><td>${escCell(r.name)}</td><td>${escCell(r.stats?.locationCount ?? "—")}</td><td>${escCell(r.stats?.qty ?? "—")}</td><td>${escCell(r.stats?.reservedQty ?? "—")}</td><td>${r.active === false ? "Inactivo" : "Activo"}</td><td><button type="button" class="btn-secondary btn-compact js-open-warehouse" data-open-warehouse="${escCell(r.id)}">${actionLabel}</button></td></tr>`;
        })
        .join("")}</tbody></table>`
    : `<p class="assignee-hint">No hay almacenes en el catálogo.</p>`;
  host.querySelectorAll("[data-open-warehouse]").forEach((btn) => {
    btn.addEventListener("click", (event) => {
      event.stopPropagation();
      void openWarehouseDetail(btn.getAttribute("data-open-warehouse"));
    });
  });
}

async function openWarehouseDetail(id) {
  const response = await authenticatedFetch(`/api/warehouses/${encodeURIComponent(id)}`);
  if (!response?.ok) return;
  const row = await response.json();
  openDetailDrawer(row.name, [
    { label: "Código", value: row.code },
    { label: "Dirección", value: row.address },
    { label: "Responsable", value: row.manager },
    { label: "Teléfono", value: row.phone },
    { label: "Correo", value: row.email },
    { label: "Horario", value: row.hours },
    { label: "Notas", value: row.notes },
    { label: "Ubicaciones", value: row.stats?.locationCount },
    { label: "Cantidad física", value: row.stats?.qty },
    { label: "Cantidad reservada", value: row.stats?.reservedQty },
    { label: "Estado", value: row.active === false ? "Inactivo" : "Activo" }
  ], currentRole === "ADMIN"
    ? [
        { id: "edit", label: "Editar", className: "btn-secondary", onClick: () => openWarehouseForm(row) },
        {
          id: "toggle",
          label: row.active === false ? "Reactivar" : "Desactivar",
          className: "btn-secondary",
          onClick: () => void toggleMasterActive("warehouse", row)
        }
      ]
    : []);
}

function openWarehouseForm(row) {
  closeDetailDrawer();
  openMasterModal(row ? "Editar almacén" : "Crear almacén", [
    masterField("code", "Código", { required: true, value: row?.code || "" }),
    masterField("name", "Nombre", { required: true, value: row?.name || "" }),
    masterField("address", "Dirección", { value: row?.address || "", span: true }),
    masterField("manager", "Responsable", { value: row?.manager || "" }),
    masterField("phone", "Teléfono", { value: row?.phone || "" }),
    masterField("email", "Correo", { type: "email", value: row?.email || "" }),
    masterField("hours", "Horario", { value: row?.hours || "" }),
    masterField("notes", "Notas", { value: row?.notes || "", span: true })
  ].join(""), async (fd) => {
    const payload = {
      code: formText(fd, "code"),
      name: formText(fd, "name"),
      address: formText(fd, "address") || null,
      manager: formText(fd, "manager") || null,
      phone: formText(fd, "phone") || null,
      email: formText(fd, "email") || null,
      hours: formText(fd, "hours") || null,
      notes: formText(fd, "notes") || null
    };
    const response = await authenticatedFetch(row ? `/api/warehouses/${encodeURIComponent(row.id)}` : "/api/warehouses", {
      method: row ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || "No se pudo guardar el almacén.");
    await refreshMasterSelectors();
    await loadWarehousesModule();
    closeMasterModal();
  });
}

async function loadLocationsModule() {
  await loadWarehousesQuiet();
  await loadLocationsQuiet();
  const host = document.getElementById("locationsModuleList");
  const countEl = document.getElementById("locationsTableCount");
  const filter = document.getElementById("locationsWarehouseFilter");
  if (filter && filter.dataset.wired !== "1") {
    filter.addEventListener("change", () => void loadLocationsModule());
    filter.dataset.wired = "1";
  }
  const search = document.getElementById("locationsSearch");
  if (search && search.dataset.wired !== "1") {
    search.addEventListener("input", () => {
      clearTimeout(search._t);
      search._t = setTimeout(() => void loadLocationsModule(), 250);
    });
    search.dataset.wired = "1";
  }
  if (filter) {
    const prev = filter.value;
    filter.innerHTML =
      `<option value="">Todos los almacenes</option>` +
      warehousesCatalogCache.map((w) => `<option value="${escCell(w.code)}">${escCell(w.code)} · ${escCell(w.name)}</option>`).join("");
    if (prev) filter.value = prev;
  }
  if (!host) return;
  const rows = locationsCatalogCache.slice();
  if (countEl) countEl.textContent = `Mostrando ${rows.length} ubicación${rows.length === 1 ? "" : "es"}`;
  const addBtn = document.getElementById("locationsAddBtn");
  if (addBtn) addBtn.style.display = currentRole === "ADMIN" ? "" : "none";
  host.innerHTML = rows.length
    ? `<table class="excel-table"><thead><tr><th>Almacén</th><th>Código</th><th>Descripción</th><th>Zona</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>${rows
        .map((r) => {
          const actionLabel = currentRole === "ADMIN" ? "Ver / editar datos" : "Ver datos";
          return `<tr><td>${escCell(r.warehouse)}</td><td>${escCell(r.code)}</td><td>${escCell(r.description || "—")}</td><td>${escCell([r.zone, r.rack, r.level, r.position].filter((x) => x && x !== "-").join(" / ") || "—")}</td><td>${r.active === false ? "Inactivo" : "Activo"}</td><td><button type="button" class="btn-secondary btn-compact js-open-location" data-open-location="${escCell(r.id)}">${actionLabel}</button></td></tr>`;
        })
        .join("")}</tbody></table>`
    : `<p class="assignee-hint">No hay ubicaciones con los filtros actuales.</p>`;
  host.querySelectorAll("[data-open-location]").forEach((btn) => {
    btn.addEventListener("click", (event) => {
      event.stopPropagation();
      void openLocationDetail(btn.getAttribute("data-open-location"));
    });
  });
}

async function openLocationDetail(id) {
  const row = locationsCatalogCache.find((item) => item.id === id);
  if (!row) return;
  openDetailDrawer(row.code, [
    { label: "Almacén", value: row.warehouse },
    { label: "Código", value: row.code },
    { label: "Descripción", value: row.description },
    { label: "Zona", value: row.zone },
    { label: "Rack", value: row.rack },
    { label: "Nivel", value: row.level },
    { label: "Posición", value: row.position },
    { label: "Notas", value: row.notes },
    { label: "Estado", value: row.active === false ? "Inactivo" : "Activo" }
  ], currentRole === "ADMIN"
    ? [
        { id: "edit", label: "Editar", className: "btn-secondary", onClick: () => openLocationForm(row) },
        {
          id: "toggle",
          label: row.active === false ? "Reactivar" : "Desactivar",
          className: "btn-secondary",
          onClick: () => void toggleMasterActive("location", row)
        }
      ]
    : []);
}

function openLocationForm(row) {
  closeDetailDrawer();
  const warehouseOptions = [{ value: "", label: "— Seleccionar almacén —" }].concat(
    warehousesCatalogCache.filter((w) => w.active !== false).map((w) => ({ value: w.code, label: `${w.code} · ${w.name}` }))
  );
  openMasterModal(row ? "Editar ubicación" : "Agregar ubicación", [
    masterSelect("warehouse", "Almacén", warehouseOptions, { required: true, value: row?.warehouse || "" }),
    masterField("code", "Código", { required: true, value: row?.code || "" }),
    masterField("description", "Descripción", { value: row?.description || "", span: true }),
    masterField("zone", "Zona", { value: row?.zone && row.zone !== "-" ? row.zone : "" }),
    masterField("rack", "Pasillo / rack", { value: row?.rack && row.rack !== "-" ? row.rack : "" }),
    masterField("level", "Nivel", { value: row?.level && row.level !== "-" ? row.level : "" }),
    masterField("position", "Posición", { value: row?.position && row.position !== "-" ? row.position : "" }),
    masterField("notes", "Notas", { value: row?.notes || "", span: true })
  ].join(""), async (fd) => {
    const payload = {
      warehouse: formText(fd, "warehouse"),
      code: formText(fd, "code"),
      description: formText(fd, "description") || null,
      zone: formText(fd, "zone") || null,
      rack: formText(fd, "rack") || null,
      level: formText(fd, "level") || null,
      position: formText(fd, "position") || null,
      notes: formText(fd, "notes") || null
    };
    const response = await authenticatedFetch(row ? `/api/inventory/locations/${encodeURIComponent(row.id)}` : "/api/inventory/locations", {
      method: row ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || "No se pudo guardar la ubicación.");
    await refreshMasterSelectors();
    await loadLocationsModule();
    closeMasterModal();
  });
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
      const announce = btn.getAttribute("data-nav-announce");
      if (announce) announceNav(announce);
      const sectionHint = btn.getAttribute("data-nav-section") || null;
      if (sectionHint) navigateTo(sectionHint, mod);
      else activateModule(mod);
    });
  });
}

function wireNewPasswordVisibilityToggles() {
  document.querySelectorAll(".js-toggle-new-password").forEach((btn) => {
    if (btn.dataset.wired === "1") return;
    btn.dataset.wired = "1";
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-password-target");
      const input = id ? document.getElementById(id) : null;
      if (!input || (id !== "newPassword" && id !== "newAccountPassword" && id !== "resetTempPassword")) return;
      const show = input.type === "password";
      input.type = show ? "text" : "password";
      btn.setAttribute("aria-pressed", show ? "true" : "false");
      btn.textContent = show ? "Ocultar" : "Mostrar";
    });
  });
}

function canUseFullscreenApi() {
  const root = document.documentElement;
  return Boolean(root && (root.requestFullscreen || root.webkitRequestFullscreen));
}

function isDocumentFullscreen() {
  return Boolean(document.fullscreenElement || document.webkitFullscreenElement);
}

function requestFocusFullscreen() {
  const root = document.documentElement;
  if (root.requestFullscreen) return root.requestFullscreen();
  if (root.webkitRequestFullscreen) return root.webkitRequestFullscreen();
  return Promise.reject(new Error("fullscreen-unavailable"));
}

function exitFocusFullscreen() {
  if (document.exitFullscreen) return document.exitFullscreen();
  if (document.webkitExitFullscreen) return document.webkitExitFullscreen();
  return Promise.resolve();
}

function syncFocusModeButton() {
  const btn = document.getElementById("focusModeBtn");
  if (!btn) return;
  const on = document.body.classList.contains("focus-mode") || isDocumentFullscreen();
  btn.setAttribute("aria-pressed", on ? "true" : "false");
  btn.textContent = on ? "Salir de concentración" : "Modo concentración";
}

function placeNavNode(node, home, slot, on) {
  if (!node || !home || !slot) return;
  if (on) {
    slot.appendChild(node);
    slot.hidden = false;
  } else if (node.parentElement !== home) {
    home.appendChild(node);
    slot.hidden = true;
  } else {
    slot.hidden = true;
  }
}

function placeNavTabsForFocusMode(on) {
  placeNavNode(
    document.querySelector(".nav-section-tabs"),
    document.getElementById("focusNavHome"),
    document.getElementById("focusNavSlot"),
    on
  );
  placeNavNode(
    document.querySelector(".nav-section-body"),
    document.getElementById("focusSubnavHome"),
    document.getElementById("focusSubnavSlot"),
    on
  );
}

function syncTopbarOffset() {
  const bar = document.querySelector(".app-topbar");
  if (!bar) return;
  const height = Math.ceil(bar.getBoundingClientRect().height);
  document.documentElement.style.setProperty("--logitec-topbar-height", `${height}px`);
}

function applyFocusMode(on) {
  document.body.classList.toggle("focus-mode", Boolean(on));
  placeNavTabsForFocusMode(Boolean(on));
  syncFocusModeButton();
  requestAnimationFrame(syncTopbarOffset);
  if (!on) announceNav("");
}

function wireFocusMode() {
  const btn = document.getElementById("focusModeBtn");
  if (!btn || btn.dataset.wired === "1") return;
  btn.dataset.wired = "1";
  window.addEventListener("resize", syncTopbarOffset);
  syncTopbarOffset();
  btn.addEventListener("click", () => {
    const active = document.body.classList.contains("focus-mode") || isDocumentFullscreen();
    if (active) {
      applyFocusMode(false);
      void exitFocusFullscreen().catch(() => {});
      return;
    }
    applyFocusMode(true);
    announceNav("Concentración activa. Usa las áreas y sus funciones en la barra superior.");
    if (!canUseFullscreenApi()) {
      announceNav("Modo concentración activo (compacto). Este navegador no permite pantalla completa web.");
      return;
    }
    void requestFocusFullscreen().catch(() => {
      announceNav("Modo concentración activo. Pantalla completa no disponible; se compactó el chrome interno.");
    });
  });
  document.addEventListener("fullscreenchange", () => {
    if (!isDocumentFullscreen()) applyFocusMode(false);
    else applyFocusMode(true);
  });
  document.addEventListener("webkitfullscreenchange", () => {
    if (!isDocumentFullscreen()) applyFocusMode(false);
    else applyFocusMode(true);
  });
}

function filterStockRows(rows) {
  const scoped = filterRowsByAviatProject(rows);
  return filterStockRowsWithFilters(scoped, getInventoryFilterValues());
}

function renderStockTable(rows) {
  if (!inventoryList) return;
  const total = Number(inventoryKpiCache?.cubes ?? (Array.isArray(stockRowsCache) ? stockRowsCache.length : 0));
  const shown = Array.isArray(rows) ? rows.length : 0;
  updateTableCountMeta("inventoryTableCount", shown, total, "saldos");
  updateInventoryScopeUi();
  renderDataGrid(inventoryList, {
    gridId: canSeeEconomicValuation() ? "inventory_econ" : "inventory",
    columns: stockColumnsFull(),
    rowDataList: Array.isArray(rows) ? rows : [],
    rowCellsFn: (row) => stockRowCells(row, { includeWarehouse: true, includeEconomic: true }),
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
  return filterRowsByAviatProject(rows).filter((product) => {
    const label = catalogProjectsWithStockLabel(product);
    const codes = (product.stockAssignments?.projects || []).map((p) => p.code).join(" ");
    return (
      matchesFilter(label, f.cliente) &&
      matchesFilter(codes || label, f.customer) &&
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
    gridId: canSeeEconomicValuation() ? "catalog_econ" : "catalog",
    columns: catalogColumns(),
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
  inventoryUnpricedOnly = false;
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
  const unpricedBtn = document.getElementById("inventoryUnpricedFilterBtn");
  if (unpricedBtn && unpricedBtn.dataset.filterWired !== "1") {
    unpricedBtn.dataset.filterWired = "1";
    unpricedBtn.addEventListener("click", () => {
      if (!canSeeEconomicValuation()) return;
      inventoryUnpricedOnly = !inventoryUnpricedOnly;
      applyInventoryFilters();
    });
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
  if (!value) return "";

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
  return value;
}

function truncateText(value, max) {
  const text = String(value || "");
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(0, max - 3))}...`;
}

function normalizeInventoryStatus(raw) {
  const original = String(raw ?? "").trim();
  const normalized = original.toUpperCase().replace(/\s+/g, " ");
  if (!normalized) {
    return { status: "", recognized: false, original };
  }
  const found = inventoryStatusRecord(normalized);
  return {
    status: found?.code || normalized,
    recognized: Boolean(found),
    original
  };
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

    const customerName = getCellValue(row, cols.customer);
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

    const customerName = getCellValue(row, cols.customer);
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

function buildMovementsParams(cursor = null) {
  const params = new URLSearchParams();
  const location = document.getElementById("traceWh")?.value?.trim();
  const userId = document.getElementById("traceUserId")?.value?.trim();
  const movementType = document.getElementById("traceType")?.value?.trim();
  const sku = document.getElementById("traceSku")?.value?.trim();
  const requisition = document.getElementById("traceCustomer")?.value?.trim();
  const q = document.getElementById("traceCliente")?.value?.trim();
  const from = document.getElementById("traceFrom")?.value?.trim();
  const to = document.getElementById("traceTo")?.value?.trim();
  if (location) params.set("location", location);
  if (userId) params.set("userId", userId);
  if (movementType) params.set("movementType", movementType);
  if (sku) params.set("sku", sku);
  if (requisition) params.set("requisition", requisition);
  if (q) params.set("q", q);
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  if (cursor) params.set("cursor", cursor);
  params.set("limit", "50");
  return params;
}

function stockExportColumns() {
  const cols = [
    { label: "proyecto_real", value: (r) => (isFreeToSaleRow(r) ? "" : inventoryProjectOrAssignmentLabel(r)) },
    { label: "tipo_asignacion", value: (r) => inventoryAssignmentKindLabel(r) },
    { label: "lote", value: (r) => extractLoteFromRow(r) },
    { label: "sku_codigo_barras", value: (r) => formatSkuBarcode(r.product) },
    { label: "producto", value: (r) => r.product?.name || "" },
    { label: "almacen", value: (r) => r.location?.warehouse || "" },
    { label: "ubicacion", value: (r) => r.location?.code || "" },
    { label: "status", value: (r) => r.status || "" },
    { label: "cantidad", value: (r) => formatQty(r.qty) }
  ];
  if (canSeeEconomicValuation()) {
    cols.push(
      { label: "cantidad_valuada", value: (r) => formatQty(r.valuation?.qtyValued ?? 0) },
      { label: "cantidad_sin_valor", value: (r) => formatQty(r.valuation?.qtyUnvalued ?? r.qty) },
      { label: "valor_unitario_promedio_mxn", value: (r) => r.valuation?.avgUnitPriceMxn ?? "" },
      { label: "valor_total_mxn", value: (r) => r.valuation?.totalValueMxn ?? "" },
      { label: "estado_valuacion", value: (r) => valuationStatusLabel(r.valuation?.status) }
    );
  }
  return cols;
}

const STOCK_EXPORT_COLUMNS = stockExportColumns();

function catalogExportColumns() {
  const cols = [
    { label: "proyectos_con_existencias", value: (r) => catalogProjectsWithStockLabel(r) },
    { label: "lote", value: () => "N/D" },
    { label: "sku_codigo_barras", value: (r) => formatSkuBarcode(r) },
    { label: "producto", value: (r) => r.name || "" },
    { label: "almacen", value: (r) => r.warehouse || "" },
    { label: "codigo_barras", value: (r) => r.barcode || "" }
  ];
  if (canSeeEconomicValuation()) {
    cols.push(
      { label: "valor_unitario_rango_mxn", value: (r) => unitPriceDisplay(r.valuation) },
      { label: "valor_total_mxn", value: (r) => r.valuation?.totalValueMxn ?? "" },
      { label: "piezas_sin_valor", value: (r) => formatQty(r.valuation?.qtyUnvalued ?? 0) }
    );
  }
  return cols;
}

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
  const response = await authenticatedFetch(`/api/inventory/stock${inventoryScopeQueryString()}`);
  if (!response?.ok) {
    window.alert("No se pudo exportar existencias.");
    return;
  }
  const rows = filterRowsByAviatProject(await response.json());
  if (!Array.isArray(rows) || rows.length === 0) {
    window.alert("No hay existencias para exportar.");
    return;
  }
  exportToCsv(getAviatExportBasename("inventario"), rows, stockExportColumns());
}

async function exportStockCsvFiltered() {
  const rows = filterStockRows(stockRowsCache);
  if (!rows.length) {
    window.alert("No hay registros con los filtros actuales.");
    return;
  }
  exportToCsv(`${getAviatExportBasename("inventario")}_filtrado`, rows, stockExportColumns());
}

async function exportProductsCsvFiltered() {
  const rows = filterProductRows(productsCache);
  if (!rows.length) {
    window.alert("No hay productos con los filtros actuales.");
    return;
  }
  exportToCsv(`${getAviatExportBasename("catalogo")}_filtrado`, rows, catalogExportColumns());
}

async function exportMovementsCsv() {
  await downloadExport("/api/exports/movements.csv?limit=20000", "logitec_movimientos.csv");
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
  exportToCsv(getAviatExportBasename("catalogo"), rows, catalogExportColumns());
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

function fillUserClientSelect(selectId, selectedId) {
  const clientSel = document.getElementById(selectId);
  if (!clientSel) return;
  const emptyLabel = selectId === "editClientId" ? "— Sin cliente (solo ADMIN) —" : "— Seleccionar cliente —";
  clientSel.innerHTML =
    `<option value="">${emptyLabel}</option>` +
    realClientsCache
      .filter((c) => c.active !== false)
      .map((c) => `<option value="${escCell(c.id)}">${escCell(c.code)} · ${escCell(c.tradeName || c.name)}</option>`)
      .join("");
  if (selectedId) clientSel.value = selectedId;
}

function applyMustChangePasswordGate(required) {
  mustChangePassword = Boolean(required);
  document.body.classList.toggle("must-change-password", mustChangePassword);
  const banner = document.getElementById("mustChangePasswordBanner");
  if (banner) banner.classList.toggle("hidden", !mustChangePassword);
  if (mustChangePassword) {
    navigateTo("sistema", "account");
  }
}

function isSafeHttpAvatarUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    return "";
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return "";
  return parsed.href;
}

function applyUserPhotoPreview(slot, rawUrl) {
  if (!slot) return;
  const frame = slot.querySelector(".user-photo-frame");
  const img = slot.querySelector(".user-photo-image");
  const silhouette = slot.querySelector(".user-photo-silhouette");
  const showSilhouette = () => {
    if (frame) frame.classList.remove("is-photo");
    if (silhouette) silhouette.hidden = false;
    if (img) {
      img.alt = "";
      img.removeAttribute("src");
    }
  };
  const safe = isSafeHttpAvatarUrl(rawUrl);
  if (!safe || !img) {
    showSilhouette();
    return;
  }
  img.referrerPolicy = "no-referrer";
  img.alt = "Fotografía de usuario";
  img.onerror = () => showSilhouette();
  img.onload = () => {
    if (frame) frame.classList.add("is-photo");
    if (silhouette) silhouette.hidden = true;
  };
  img.src = safe;
}

function fillAccountProfileForm(user) {
  const meta = document.getElementById("accountProfileMeta");
  if (meta) {
    const status = user?.isActive === false ? "Inactivo" : "Activo";
    const clientName = user?.client?.tradeName || user?.client?.name || user?.clientId || "—";
    meta.textContent = `Estado: ${status} · Rol: ${user?.role || "—"} · Cliente: ${clientName}. Ficha de solo lectura; un ADMIN edita datos oficiales.`;
  }
  const setVal = (id, value) => {
    const el = document.getElementById(id);
    if (el) el.value = value || "";
  };
  setVal("accountFullName", user?.fullName);
  setVal("accountJobTitle", user?.jobTitle);
  setVal("accountPhone", user?.phone);
  setVal("accountAlternatePhone", user?.alternatePhone);
  setVal("accountAddress", user?.address);
  setVal("accountCity", user?.city);
  setVal("accountState", user?.state);
  setVal("accountPostalCode", user?.postalCode);
  setVal("accountAvatarUrl", user?.avatarUrl);
  setVal("accountNotes", user?.notes);
  applyUserPhotoPreview(document.getElementById("accountPhotoSlot"), user?.avatarUrl);
}

async function loadUsersModule(role) {
  const editForm = document.getElementById("editUserForm");
  if (role !== "ADMIN") {
    usersMessage.textContent = "Este modulo requiere permisos de ADMIN.";
    usersList.innerHTML = "";
    createUserForm.classList.add("hidden");
    if (editForm) editForm.classList.add("hidden");
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
  usersCache = Array.isArray(users) ? users : [];
  usersMessage.textContent = "Ficha, rol, cliente y estado. Restablecer contraseña no desactiva la cuenta ni lee el hash.";
  usersList.innerHTML = usersCache
    .map((user) => {
      const inactive = user.isActive === false;
      const statusTag = inactive
        ? '<span class="badge-inactive">Inactivo</span>'
        : '<span class="badge-active">Activo</span>';
      const clientLabel = user.client ? user.client.tradeName || user.client.name : "Sin cliente";
      const delBtn =
        currentUserId && user.id !== currentUserId && user.isActive !== false
          ? `<button type="button" class="user-delete" data-delete-user="${user.id}">Desactivar</button>`
          : "";
      return `<div class="user-card">
        <strong>${escCell(user.fullName)}</strong> ${statusTag}
        <p class="filter-hint" style="margin:4px 0 0">${escCell(user.email)} · ${escCell(user.role)} · ${escCell(clientLabel)}${user.jobTitle ? ` · ${escCell(user.jobTitle)}` : ""}${user.phone ? ` · ${escCell(user.phone)}` : ""}</p>
        <div class="user-card-actions">
          <button type="button" class="btn-secondary btn-compact" data-edit-user="${escCell(user.id)}">Editar ficha</button>
          <button type="button" class="btn-secondary btn-compact" data-reset-password-user="${escCell(user.id)}">Restablecer contraseña</button>
          ${delBtn}
        </div>
      </div>`;
    })
    .join("");
  renderUsersSummary(`Usuarios en sistema: ${usersCache.length}`);
  await loadRealClientsQuiet();
  fillUserClientSelect("newClientId");
  fillUserClientSelect("editClientId");
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

function formatMovementBalance(row, field) {
  return formatQty(row?.movement?.[field]);
}

function escCell(s) {
  if (s == null || s === "") return "—";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function openMovementDetail(row) {
  const relocation = row.movement?.movementType === "RELOCATE";
  const transfer = row.movement?.movementType === "ASSIGNMENT_TRANSFER";
  const requisition = row.requisition;
  openDetailDrawer("Detalle de movimiento", [
    { label: "Movimiento", value: formatMovementTypeLabel(row.movement?.movementType || row.movement?.type) },
    { label: "Fecha / hora (Ciudad de México)", value: formatMexicoCityDateTime(row.createdAt) },
    { label: "Cliente", value: canonicalClientDisplay(row) },
    { label: "Proyecto", value: transfer ? formatTransferAssignment(row) : row.project ? `${row.project.code} — ${row.project.name}` : "—" },
    { label: "SKU", value: row.product?.sku },
    { label: "Descripción", value: row.product?.name },
    { label: "Cantidad", value: transfer ? formatQty(row.qty) : movementQuantity(row) },
    { label: relocation ? "Saldo origen antes" : "Antes", value: formatQty(row.movement?.quantityBefore) },
    { label: relocation ? "Saldo origen después" : "Después", value: formatQty(row.movement?.quantityAfter) },
    { label: "Almacén", value: row.toLocation?.warehouse || row.fromLocation?.warehouse },
    { label: "Origen", value: transfer ? formatTransferAssignment(row).split(" → ")[0] : row.fromLocation?.code },
    { label: "Destino", value: transfer ? formatTransferAssignment(row).split(" → ")[1] : row.toLocation?.code },
    { label: "Ubicación", value: row.toLocation?.code || row.fromLocation?.code },
    { label: "Estado", value: row.movement?.stockStatusLabel || formatInventoryStatus(row.movement?.stockStatus) },
    { label: "Lote", value: row.layer?.lotNumber },
    { label: "Serie", value: row.serial?.serialNumber },
    { label: "IMEI", value: row.serial?.imei },
    { label: "Usuario", value: row.user?.fullName || row.user?.email },
    { label: "Referencia", value: row.reference },
    { label: "Requisición", value: requisition?.number },
    { label: "Task", value: row.task ? `${row.task.type} — ${row.task.reference || "—"}` : "—" },
    { label: "Notas", value: row.notes }
  ], requisition ? [{
    id: "open-requisition",
    label: "Abrir requisición",
    className: "btn-primary",
    onClick: () => {
      closeDetailDrawer();
      activateModule("requisitions");
    }
  }] : []);
}

async function loadTraceability(append = false) {
  if (!traceList) return;
  if (traceMessage) traceMessage.textContent = append ? "Cargando más movimientos…" : "Consultando movimientos…";
  const params = buildMovementsParams(append ? movementsNextCursor : null);
  try {
    const response = await authenticatedFetch(`/api/inventory/movements?${params.toString()}`);
    if (!response) return;
    if (!response.ok) {
      if (traceMessage) traceMessage.textContent = "No se pudieron cargar los movimientos.";
      traceList.innerHTML = "";
      return;
    }
    const payload = await response.json();
    const rows = Array.isArray(payload?.items) ? payload.items : [];
    movementsRows = append ? [...movementsRows, ...rows] : rows;
    movementsNextCursor = payload?.nextCursor || null;
    updateAviatHeaderUi();
    if (traceMessage) traceMessage.textContent = `${movementsRows.length} movimientos cargados. Hora: America/Mexico_City.`;
    const more = document.getElementById("movementMoreBtn");
    if (more) more.classList.toggle("hidden", !movementsNextCursor);
    if (!movementsRows.length) {
      traceList.innerHTML = "";
      renderExcelTable(traceList, {
        gridId: "traceability",
        columns: TRACE_COLUMNS,
        rows: [],
        emptyMessage: "Sin movimientos con los filtros indicados."
      });
      return;
    }
    renderExcelTable(traceList, {
      gridId: "traceability",
      columns: TRACE_COLUMNS,
      rows: movementsRows,
      emptyMessage: "Sin movimientos con los filtros indicados.",
      onRowSelect: openMovementDetail
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
        ? `<button type="button" class="incident-resolve btn-table btn-resolve btn-compact" data-incident-id="${escCell(i.id)}" title="Marcar incidencia como resuelta">Cerrar</button>`
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

function unwrapMovementPayload(payload) {
  if (Array.isArray(payload)) return { items: payload, total: payload.length };
  const items = payload && Array.isArray(payload.items) ? payload.items : [];
  const total = Number(payload?.total);
  return { items, total: Number.isFinite(total) ? total : items.length };
}

async function loadInventoryKpis() {
  const response = await authenticatedFetch(`/api/inventory/summary${inventoryScopeQueryString()}`);
  if (!response?.ok) {
    inventoryKpiCache = null;
    return null;
  }
  const data = await response.json();
  inventoryKpiCache = data && typeof data === "object" ? data : null;
  return inventoryKpiCache;
}

async function loadStockStrip() {
  if (!inventoryList && !ccInventoryList) return;
  if (!["ADMIN", "OPERATOR", "SUPERVISOR", "CLIENT"].includes(currentRole)) {
    stockRowsCache = [];
    inventoryKpiCache = null;
    updateInventorySummary([]);
    updateTableCountMeta("inventoryTableCount", 0, 0, "saldos");
    if (inventoryList) {
      renderDataGrid(inventoryList, {
        gridId: "inventory",
        columns: stockColumnsFull(),
        rowDataList: [],
        rowCellsFn: (row) => stockRowCells(row, { includeWarehouse: true, includeEconomic: true }),
        colsClass: "data-grid-cols-stock",
        sizeClass: "data-grid-size-inventory",
        emptyMessage: "Las existencias solo aplican a roles operativos."
      });
    }
    applyControlCenterFilters();
    return;
  }
  const [response] = await Promise.all([
    authenticatedFetch(`/api/inventory/stock${inventoryScopeQueryString()}`),
    loadInventoryKpis()
  ]);
  if (!response?.ok) {
    stockRowsCache = [];
    updateInventorySummary([]);
    updateTableCountMeta("inventoryTableCount", 0, 0, "saldos");
    if (inventoryList) {
      renderDataGrid(inventoryList, {
        gridId: "inventory",
        columns: stockColumnsFull(),
        rowDataList: [],
        rowCellsFn: (row) => stockRowCells(row, { includeWarehouse: true, includeEconomic: true }),
        colsClass: "data-grid-cols-stock",
        sizeClass: "data-grid-size-inventory",
        emptyMessage: "No se pudo cargar existencias."
      });
    }
    applyControlCenterFilters();
    return;
  }
  const rows = await response.json();
  stockRowsCache = Array.isArray(rows) ? rows.filter((row) => Number(row.qty) > 0) : [];
  applyInventoryFilters();
  renderClientsModule();
  updateInventoryScopeUi();
}

async function loadInventoryMovements() {
  if (!inventoryMovementsList) return;
  if (!["ADMIN", "OPERATOR", "SUPERVISOR", "CLIENT"].includes(currentRole)) {
    movementsCountCache = 0;
    updateInventorySummary(stockRowsCache);
    inventoryMovementsList.innerHTML = "";
    return;
  }
  const response = await authenticatedFetch(`/api/inventory/movements${inventoryScopeQueryString()}`);
  if (!response?.ok) {
    movementsCountCache = 0;
    updateInventorySummary(stockRowsCache);
    inventoryMovementsList.textContent = "No se pudo cargar movimientos.";
    return;
  }
  const payload = await response.json();
  const unwrapped = unwrapMovementPayload(payload);
  movementsRowsCache = unwrapped.items;
  movementsCountCache = unwrapped.total;
  if (inventoryKpiCache && inventoryKpiCache.movements == null) {
    inventoryKpiCache.movements = unwrapped.total;
  }
  const scopedRows = filterRowsByAviatProject(movementsRowsCache);
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
  const fromCatalog = warehousesCatalogCache.filter((w) => w.active !== false).map((w) => w.code);
  return uniqueSortedStrings(["TULTITLAN24", ...fromStock, ...fromMov, ...fromProducts, ...fromCatalog]);
}

function getKnownLocations() {
  const fromStock = stockRowsCache.map(
    (r) => r.location?.code || r.locationCode || r.location || r.Location?.code
  );
  const fromMov = movementsRowsCache.map((m) => m.location?.code || m.location || m.locationCode);
  const fromCatalog = locationsCatalogCache.filter((l) => l.active !== false).map((l) => l.code);
  return uniqueSortedStrings(fromStock.concat(fromMov).concat(fromCatalog));
}

function getKnownProjects() {
  return getCustomersForSelect();
}

function getKnownUsers() {
  return Array.isArray(assigneesCache) ? assigneesCache.slice() : [];
}

function fillInventoryStatusSelect(selectId, { includeEmpty = false, emptyLabel = "— Seleccionar —", pickableOnly = false, preferred = "" } = {}) {
  const sel = document.getElementById(selectId);
  if (!(sel instanceof HTMLSelectElement)) return;
  const prev = sel.value;
  const rows = pickableOnly ? pickableInventoryStatuses() : activeInventoryStatuses();
  const opts = [];
  if (includeEmpty) opts.push(`<option value="">${escCell(emptyLabel)}</option>`);
  for (const row of rows) {
    const code = String(row.code || "");
    if (!code) continue;
    opts.push(`<option value="${escCell(code)}">${escCell(formatInventoryStatus(code))}</option>`);
  }
  sel.innerHTML = opts.join("");
  const values = rows.map((row) => String(row.code || ""));
  if (prev && (prev === "" ? includeEmpty : values.includes(prev))) {
    sel.value = prev;
  } else if (preferred && values.includes(preferred)) {
    sel.value = preferred;
  } else if (!includeEmpty && values.length) {
    sel.value = values[0];
  }
}

function fillInventoryStatusSelects() {
  const preferred = activeInventoryStatuses().some((row) => row.code === "AVAILABLE") ? "AVAILABLE" : "";
  fillInventoryStatusSelect("inboundStatus", { preferred });
  fillInventoryStatusSelect("outboundStatus", { preferred });
  fillInventoryStatusSelect("relocateStatus", { includeEmpty: true, emptyLabel: "— Seleccionar —" });
  fillInventoryStatusSelect("pickStatus", {
    includeEmpty: true,
    emptyLabel: "— Cualquiera (solo si hay una línea) —",
    pickableOnly: true
  });
}

async function loadInventoryStatusCatalog() {
  const response = await authenticatedFetch("/api/inventory/statuses");
  const rows = response?.ok ? await response.json() : [];
  inventoryStatusCatalog = Array.isArray(rows) ? rows : [];
  fillInventoryStatusSelects();
  return inventoryStatusCatalog;
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
const PRODUCT_TYPEAHEAD_MAX = 12;
const PRODUCT_TYPEAHEAD_DEBOUNCE_MS = 250;
/** @type {WeakMap<HTMLElement, { items: any[], active: number, timer: any, requestSeq: number }>} */
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
  const params = new URLSearchParams({
    q,
    limit: String(opts.max || PRODUCT_TYPEAHEAD_MAX)
  });
  const location = String(opts.location || "").trim();
  const warehouse = String(opts.warehouse || "").trim();
  if (location) params.set("location", location);
  if (warehouse) params.set("warehouse", warehouse);
  if (opts.requireStock) params.set("requireStock", "true");
  const response = await authenticatedFetch(`/api/catalog/products/search?${params.toString()}`);
  if (!response?.ok) return [];
  const customerCode = String(opts.customerCode || "").trim().toUpperCase();
  const rows = await response.json().catch(() => []);
  return (Array.isArray(rows) ? rows : [])
    .filter((product) => {
      if (!customerCode) return true;
      if (String(product.client?.code || "").toUpperCase() === customerCode) return true;
      return (Array.isArray(product.productProjects) ? product.productProjects : []).some(
        (link) => String(link.code || link.project?.code || "").toUpperCase() === customerCode
      );
    })
    .map((product) => {
      const availableQty = product.availableQty != null ? String(product.availableQty) : "";
      const hasStock = Boolean(product.hasStock);
      const projectCode = product.projectCode || product.productProjects?.[0]?.code || "";
      const projectName = product.projectName || product.productProjects?.[0]?.name || "";
      return {
        kind: hasStock ? "stock" : "catalog",
        key: `${hasStock ? "stock" : "catalog"}:${product.id}`,
        productId: product.id,
        sku: product.sku,
        barcode: product.barcode || "",
        productName: product.name || "",
        projectCode,
        projectName,
        catalogOwnerCode: "",
        catalogOwnerName: "",
        clientName: product.client?.tradeName || product.client?.name || owningClientDisplayName(),
        warehouse: product.warehouse || "",
        location: product.locationCode || "",
        status: "",
        qty: hasStock ? availableQty : null,
        unreservedQty: hasStock ? availableQty : null,
        inventoryId: "",
        hasStock,
        product
      };
    });
}

async function loadSkuContext(productId) {
  const response = await authenticatedFetch(`/api/catalog/products/${encodeURIComponent(productId)}/context`);
  if (!response?.ok) return null;
  return response.json().catch(() => null);
}

function assignmentDisplayLabel(row) {
  if (!row) return "—";
  if (row.assignmentType === "FREE_TO_SALE" || row.assignmentLabel === "FREE TO SALE" || row.assignmentLabel === "Free to Sale") return "Free to Sale";
  if (row.historicalAssignment === "HISTORICAL_NON_OPERATIONAL") return historicalNonOperationalAssignmentLabel();
  if (row.project?.name) {
    if (isForbiddenProjectLabel(row.project.code) || isForbiddenProjectLabel(row.project.name)) {
      return historicalNonOperationalAssignmentLabel();
    }
    return row.project.code ? `${row.project.name} (${row.project.code})` : row.project.name;
  }
  if (row.projectName) {
    if (isForbiddenProjectLabel(row.projectCode) || isForbiddenProjectLabel(row.projectName)) {
      return historicalNonOperationalAssignmentLabel();
    }
    return row.projectCode ? `${row.projectName} (${row.projectCode})` : row.projectName;
  }
  if (row.projectCode) {
    if (isForbiddenProjectLabel(row.projectCode)) return historicalNonOperationalAssignmentLabel();
    return row.projectCode;
  }
  return row.assignmentType || "—";
}

function skuSelectedLocationLabel(locations) {
  const rows = Array.isArray(locations) ? locations : [];
  if (!rows.length) return "Sin existencia";
  if (rows.length === 1) {
    const code = String(rows[0]?.locationCode || "").trim() || "—";
    const warehouse = String(rows[0]?.warehouse || "").trim();
    return warehouse ? `${code} · ${warehouse}` : code;
  }
  return `${rows.length} saldos`;
}

function opsPrefixFromTypeahead(listEl, input) {
  const wrap =
    (listEl && typeof listEl.closest === "function" && listEl.closest("[data-pta]")) ||
    (input && typeof input.closest === "function" && input.closest("[data-pta]"));
  return String(wrap?.getAttribute?.("data-pta") || "");
}

function inboundHasSystemSkuSelection() {
  return Boolean(document.getElementById("inboundProductId")?.value?.trim());
}

function inboundAssignmentTypeValue() {
  return String(document.getElementById("inboundAssignmentType")?.value || "").trim();
}

function inboundSelectedProjectId() {
  return String(document.getElementById("inboundProjectId")?.value || "").trim();
}

function inboundTypeaheadProjectCode() {
  if (inboundAssignmentTypeValue() !== "PROJECT") return "";
  const sel = document.getElementById("inboundProjectId");
  const opt = sel?.selectedOptions?.[0];
  return String(opt?.getAttribute?.("data-code") || opt?.dataset?.code || "").trim();
}

function inboundSelectedSkuClientId() {
  const skuEl = document.getElementById("inboundSku");
  const fromDataset = String(skuEl?.dataset?.skuClientId || "").trim();
  if (fromDataset) return fromDataset;
  const productId = document.getElementById("inboundProductId")?.value?.trim();
  const prod = productId ? productsCache.find((p) => p.id === productId) : null;
  return String(prod?.customer?.clientId || prod?.customer?.client?.id || "").trim();
}

function realActiveCatalogProjects(clientId) {
  const wanted = String(clientId || "").trim();
  return getOperationalProjectsForSelect().filter((project) => {
    if (wanted && project.clientId && project.clientId !== wanted) return false;
    if (wanted && project.client?.id && project.client.id !== wanted) return false;
    return true;
  });
}

function fillInboundProjectSelect() {
  const sel = document.getElementById("inboundProjectId");
  if (!(sel instanceof HTMLSelectElement)) return;
  const prev = sel.value;
  const ownerClientId = inboundSelectedOwnerClientId();
  const projects = realActiveCatalogProjects(ownerClientId);
  sel.innerHTML =
    '<option value="">— Seleccionar proyecto —</option>' +
    projects
      .map(
        (project) =>
          `<option value="${escCell(project.id)}" data-code="${escCell(project.code)}" data-name="${escCell(project.name)}" data-client-id="${escCell(project.clientId || "")}">${escCell(
            project.name
          )} (${escCell(project.code)})</option>`
      )
      .join("");
  if (prev && projects.some((project) => project.id === prev)) sel.value = prev;
  else sel.value = "";
}

function inboundSelectedOwnerClientId() {
  const fromContext =
    (typeof operationalClient !== "undefined" && operationalClient && operationalClient.id) ||
    (typeof currentUserClient !== "undefined" && currentUserClient && currentUserClient.id) ||
    "";
  if (fromContext) return String(fromContext).trim();
  return String(document.getElementById("inboundClientId")?.value || "").trim();
}

function fillInboundClientSelect() {
  const sel = document.getElementById("inboundClientId");
  const clientField = document.getElementById("inboundClientField");
  const locked = Boolean(typeof operationalClient !== "undefined" && operationalClient && operationalClient.id);
  if (locked && clientField?.classList?.add) clientField.classList.add("hidden");
  if (!(sel instanceof HTMLSelectElement)) return;
  if (!locked) return;
  const ownerId = inboundSelectedOwnerClientId();
  const owner = operationalClient || currentUserClient;
  sel.innerHTML = ownerId
    ? `<option value="${escCell(ownerId)}" selected>${escCell(owner?.tradeName || owner?.name || owner?.code || ownerId)}</option>`
    : '<option value="">—</option>';
  sel.value = ownerId;
}

function syncInboundAssignmentUi() {
  const type = inboundAssignmentTypeValue();
  const projectField = document.getElementById("inboundProjectField");
  const clientField = document.getElementById("inboundClientField");
  const sel = document.getElementById("inboundProjectId");
  if (projectField?.classList?.toggle) projectField.classList.toggle("hidden", type !== "PROJECT");
  const locked = Boolean(typeof operationalClient !== "undefined" && operationalClient && operationalClient.id);
  if (clientField?.classList) {
    if (locked && clientField.classList.add) clientField.classList.add("hidden");
    else if (clientField.classList.toggle) clientField.classList.toggle("hidden", type !== "FREE_TO_SALE");
  }
  if (sel && type !== "PROJECT") sel.value = "";
  fillInboundClientSelect();
  if (type === "PROJECT") fillInboundProjectSelect();
  syncInboundSubmitEnabled();
}

function inboundFormIsComplete() {
  const assignmentType = inboundAssignmentTypeValue();
  if (assignmentType !== "FREE_TO_SALE" && assignmentType !== "PROJECT") return false;
  if (assignmentType === "PROJECT" && !inboundSelectedProjectId()) return false;
  if (assignmentType === "FREE_TO_SALE" && !inboundSelectedOwnerClientId()) return false;
  if (!inboundHasSystemSkuSelection()) return false;
  const qty = Number(document.getElementById("inboundQty")?.value);
  if (!Number.isFinite(qty) || qty <= 0) return false;
  const warehouse =
    (typeof readSmartFieldValue === "function" ? readSmartFieldValue("inboundWarehouse") : "") ||
    document.getElementById("inboundWarehouse")?.value?.trim();
  if (!warehouse) return false;
  const location =
    (typeof readSmartFieldValue === "function" ? readSmartFieldValue("inboundLocation") : "") ||
    document.getElementById("inboundLocation")?.value?.trim();
  if (!location) return false;
  const status = document.getElementById("inboundStatus")?.value?.trim();
  if (!status) return false;
  const priceRaw = document.getElementById("inboundUnitPriceMxn")?.value;
  if (priceRaw != null && String(priceRaw).trim() !== "") {
    const normalized = String(priceRaw).trim().replace(",", ".");
    if (!/^\d+(\.\d{1,4})?$/.test(normalized)) return false;
  }
  return true;
}

function parseInboundUnitPriceMxn() {
  const raw = document.getElementById("inboundUnitPriceMxn")?.value;
  if (raw == null || String(raw).trim() === "") return { ok: true, empty: true, value: null };
  if (typeof parseLayerPriceMxnInput === "function") {
    const parsed = parseLayerPriceMxnInput(raw);
    if (!parsed.ok) return { ok: false, empty: false, value: null, message: parsed.message };
    return { ok: true, empty: false, value: parsed.value };
  }
  const normalized = String(raw).trim().replace(",", ".");
  if (!/^\d+(\.\d{1,4})?$/.test(normalized)) return { ok: false, empty: false, value: null };
  return { ok: true, empty: false, value: normalized };
}

function inboundEntryQtyValue() {
  const raw = document.getElementById("inboundQty")?.value;
  const qty = Number(raw);
  if (!Number.isFinite(qty) || qty <= 0) return null;
  return String(raw).trim();
}

function formatInboundQtyLabel(qty) {
  const raw = String(qty ?? "").trim();
  if (!raw) return "";
  if (/^\d+$/.test(raw)) return raw;
  return raw.replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "") || raw;
}

function multiplyInboundQtyPrice(qtyRaw, priceRaw) {
  const qty = String(qtyRaw).trim();
  const price = String(priceRaw).trim();
  if (!/^\d+(\.\d+)?$/.test(qty) || !/^\d+(\.\d+)?$/.test(price)) return null;
  const [qWhole, qFrac = ""] = qty.split(".");
  const [pWhole, pFrac = ""] = price.split(".");
  const qScale = qFrac.length;
  const pScale = pFrac.length;
  const qInt = BigInt(qWhole + qFrac);
  const pInt = BigInt(pWhole + pFrac);
  const prod = qInt * pInt;
  const scale = qScale + pScale;
  const digits = prod.toString().padStart(scale + 1, "0");
  const whole = scale === 0 ? digits : digits.slice(0, -scale) || "0";
  const frac = scale === 0 ? "" : digits.slice(-scale);
  const cents = frac.padEnd(2, "0").slice(0, 2);
  const leftover = frac.slice(2);
  let carry = 0;
  if (leftover && leftover[0] && leftover[0] >= "5") carry = 1;
  let centsN = Number(cents) + carry;
  let wholeN = BigInt(whole);
  if (centsN >= 100) {
    wholeN += 1n;
    centsN -= 100;
  }
  return `${wholeN.toString()}.${String(centsN).padStart(2, "0")}`;
}

function inboundEntryValueLabel() {
  const qty = inboundEntryQtyValue();
  const price = parseInboundUnitPriceMxn();
  if (!qty || !price.ok || price.empty) return "Pendiente";
  const total = multiplyInboundQtyPrice(qty, price.value);
  if (!total) return "Pendiente";
  return `${formatInboundQtyLabel(qty)} × ${formatMxn(price.value)} = ${formatMxn(total)} MXN`;
}

function updateInboundEntryValue() {
  const el = document.getElementById("inboundEntryValue");
  if (el) el.value = inboundEntryValueLabel();
}

function inboundProjectConfirmLabel() {
  const sel = document.getElementById("inboundProjectId");
  if (!sel) return "";
  const opt = sel.options?.[sel.selectedIndex];
  const name = String(opt?.getAttribute("data-name") || "").trim();
  const code = String(opt?.getAttribute("data-code") || "").trim();
  if (name) return name;
  const text = String(opt?.textContent || "").replace(/\s*\([^)]*\)\s*$/, "").trim();
  return text || code || sel.value || "";
}

function buildInboundConfirmMessage(input) {
  const qty = formatInboundQtyLabel(input.qty);
  const sku = input.sku;
  const product = input.productName ? ` (${input.productName})` : "";
  const location = input.location;
  const warehouse = input.warehouse;
  const lote = input.lote ? `lote ${input.lote}` : "sin lote";
  const assignment =
    input.assignmentType === "PROJECT"
      ? `al proyecto ${input.projectLabel || input.projectId}`
      : "como Free to Sale";
  if (input.priceEmpty) {
    return `Se registrará la entrada de ${qty} piezas del SKU ${sku}${product} ${assignment}, almacén ${warehouse}, ubicación ${location}, ${lote}, sin precio asignado. Podrá valuarse posteriormente desde Existencias. ¿Deseas continuar?`;
  }
  const unit = formatLayerPriceMxnExact(input.priceValue) || formatMxn(input.priceValue);
  const total = multiplyInboundQtyPrice(input.qty, input.priceValue);
  const totalLabel = total ? formatMxn(total) : "Pendiente";
  return `Se registrará la entrada de ${qty} piezas del SKU ${sku}${product} ${assignment}, almacén ${warehouse}, ubicación ${location}, ${lote}, con precio unitario de ${unit} MXN y valor total de ${totalLabel} MXN. ¿Deseas continuar?`;
}

function syncInboundSubmitEnabled() {
  const btn = document.getElementById("inboundSubmitBtn");
  if (!btn) return;
  btn.disabled = !inboundFormIsComplete();
  if (typeof updateInboundEntryValue === "function") updateInboundEntryValue();
}

function relocateWarehouseValue() {
  return (
    (typeof readSmartFieldValue === "function" ? readSmartFieldValue("relocateWarehouse") : "") ||
    document.getElementById("relocateWarehouse")?.value?.trim() ||
    ""
  ).trim();
}

function relocateStatusValue() {
  const raw = String(document.getElementById("relocateStatus")?.value || "").trim();
  if (!raw) return "";
  if (raw.toUpperCase() === "DISPONIBLE") return "AVAILABLE";
  return raw;
}

function relocateFromValue() {
  return (
    (typeof readSmartFieldValue === "function" ? readSmartFieldValue("relocateFrom") : "") ||
    document.getElementById("relocateFrom")?.value?.trim() ||
    document.getElementById("relocateFromSelect")?.value?.trim() ||
    ""
  ).trim();
}

function relocateToValue() {
  return (
    (typeof readSmartFieldValue === "function" ? readSmartFieldValue("relocateTo") : "") ||
    document.getElementById("relocateTo")?.value?.trim() ||
    document.getElementById("relocateToSelect")?.value?.trim() ||
    ""
  ).trim();
}

function relocateHasBalanceSelection() {
  return Boolean(document.getElementById("relocateInventoryId")?.value?.trim());
}

function relocateOriginContextReady() {
  return Boolean(relocateWarehouseValue() && relocateStatusValue() && relocateFromValue());
}

function parseRelocateQty() {
  const raw = document.getElementById("relocateQty")?.value;
  if (raw == null || String(raw).trim() === "") return { empty: true, ok: false, value: null };
  const normalized = String(raw).trim().replace(",", ".");
  if (!/^\d+(\.\d+)?$/.test(normalized)) return { empty: false, ok: false, value: null };
  const qty = Number(normalized);
  if (!Number.isFinite(qty) || qty <= 0) return { empty: false, ok: false, value: null };
  return { empty: false, ok: true, value: qty, raw: normalized };
}

function relocateAvailableQtyNumber() {
  const hintRaw = document.getElementById("relocateAvailableHint")?.dataset?.available;
  const skuRaw = document.getElementById("relocateSku")?.dataset?.relocateAvailable;
  const raw =
    hintRaw != null && String(hintRaw).trim() !== ""
      ? hintRaw
      : skuRaw != null && String(skuRaw).trim() !== ""
        ? skuRaw
        : "";
  if (String(raw).trim() === "") return null;
  const qty = Number(String(raw).trim().replace(",", "."));
  return Number.isFinite(qty) ? qty : null;
}

function relocateSelectedBalance() {
  const skuEl = document.getElementById("relocateSku");
  const data = skuEl?.dataset || {};
  return {
    inventoryId: document.getElementById("relocateInventoryId")?.value?.trim() || "",
    layerId: document.getElementById("relocateLayerId")?.value?.trim() || "",
    productId: document.getElementById("relocateProductId")?.value?.trim() || "",
    sku: skuEl?.value?.trim() || data.relocateSku || "",
    productName: data.relocateProductName || "",
    assignmentLabel: data.relocateAssignmentLabel || "",
    assignmentType: data.relocateAssignmentType || "",
    locationCode: data.relocateLocation || "",
    status: data.relocateStatus || "",
    lotNumber: data.relocateLot || "",
    layerCount: Number(data.relocateLayerCount || 0),
    serialCount: Number(data.relocateSerialCount || 0),
    availableQty: data.relocateAvailable || "",
    qty: data.relocateQty || "",
    reservedQty: data.relocateReserved || ""
  };
}

function relocateSerialsBlockRelocate() {
  return relocateSelectedBalance().serialCount > 0;
}

function relocateFormIsComplete() {
  if (!relocateOriginContextReady()) return false;
  if (!relocateHasBalanceSelection()) return false;
  const dest = relocateToValue();
  const origin = relocateFromValue();
  if (!dest) return false;
  if (dest.toUpperCase() === origin.toUpperCase()) return false;
  const qty = parseRelocateQty();
  if (qty.empty || !qty.ok) return false;
  const available = relocateAvailableQtyNumber();
  if (available == null || qty.value > available) return false;
  return true;
}

function relocateLayerSummary(item) {
  const layers = Number(item?.layerCount || 0);
  if (layers > 1) return `${layers} capas internas`;
  if (item?.lotNumber) return `Lote ${item.lotNumber}`;
  return "Sin lote";
}

function buildRelocateLayerDetailHtml(item) {
  const layers = Array.isArray(item?.layers) ? item.layers : [];
  if (!layers.length) return "";
  const rows = layers
    .map((layer, idx) => {
      const lot = layer.lotNumber ? `Lote ${layer.lotNumber}` : "Sin lote";
      const qty = typeof formatQty === "function" ? formatQty(layer.qty) : layer.qty;
      const reserved = typeof formatQty === "function" ? formatQty(layer.reservedQty) : layer.reservedQty;
      const available = typeof formatQty === "function" ? formatQty(layer.availableQty) : layer.availableQty;
      return `<li>Capa ${idx + 1} · ${escCell(lot)} · Física ${escCell(String(qty))} · Reservada ${escCell(
        String(reserved)
      )} · Disponible ${escCell(String(available))}</li>`;
    })
    .join("");
  return `<button type="button" class="btn-secondary btn-compact relocate-layers-toggle">Ver detalle</button>
    <ul class="relocate-layers-detail hidden" hidden>${rows}</ul>`;
}

function buildRelocateSelectedCardHtml(item) {
  const assignment = item.assignmentLabel || (item.assignmentType === "FREE_TO_SALE" ? "Free to Sale" : "Proyecto");
  const layerLabel = relocateLayerSummary(item);
  return `<div class="sku-selected-card-title">✓ Saldo seleccionado</div>
    <dl class="sku-selected-card-meta">
      <div><dt>SKU</dt><dd>${escCell(item.sku)}</dd></div>
      <div><dt>Producto</dt><dd>${escCell(item.productName)}</dd></div>
      <div><dt>Asignación</dt><dd>${escCell(assignment)}</dd></div>
      <div><dt>Ubicación origen</dt><dd>${escCell(item.locationCode)}</dd></div>
      <div><dt>Estatus</dt><dd>${escCell(typeof formatInventoryStatus === "function" ? formatInventoryStatus(item.status) : item.status)}</dd></div>
      <div><dt>Física</dt><dd>${escCell(typeof formatQty === "function" ? formatQty(item.qty) : item.qty)}</dd></div>
      <div><dt>Reservada</dt><dd>${escCell(typeof formatQty === "function" ? formatQty(item.reservedQty) : item.reservedQty)}</dd></div>
      <div><dt>Cantidad disponible</dt><dd>${escCell(typeof formatQty === "function" ? formatQty(item.availableQty) : item.availableQty)}</dd></div>
      <div><dt>Capas</dt><dd>${escCell(layerLabel)}</dd></div>
    </dl>
    ${buildRelocateLayerDetailHtml(item)}
    <button type="button" class="btn-secondary btn-compact sku-change-btn">Cambiar saldo/SKU</button>`;
}

function renderRelocateSelectedCard(item) {
  const listEl = document.getElementById("relocateSkuSuggestions");
  hideProductTypeaheadList(listEl);
  let panel = document.getElementById("relocateSelectedCard");
  if (!panel) {
    const wrap = listEl?.parentElement;
    panel = document.createElement("div");
    panel.id = "relocateSelectedCard";
    panel.className = "sku-selected-card";
    listEl?.insertAdjacentElement("afterend", panel);
    if (!listEl && wrap) wrap.appendChild(panel);
  }
  panel.classList.remove("hidden");
  panel.hidden = false;
  panel.innerHTML = buildRelocateSelectedCardHtml(item);
  panel.querySelector(".sku-change-btn")?.addEventListener("click", () => {
    beginRelocateSkuChange();
  });
  panel.querySelector(".relocate-layers-toggle")?.addEventListener("click", (ev) => {
    const detail = panel.querySelector(".relocate-layers-detail");
    if (!detail) return;
    const open = !detail.classList.contains("hidden");
    detail.classList.toggle("hidden", open);
    detail.hidden = open;
    ev.currentTarget.textContent = open ? "Ver detalle" : "Ocultar detalle";
  });
}

function hideRelocateSelectedCard() {
  const panel = document.getElementById("relocateSelectedCard");
  if (!panel) return;
  panel.classList.add("hidden");
  panel.hidden = true;
  panel.innerHTML = "";
}

function beginRelocateSkuChange() {
  const input = document.getElementById("relocateSku");
  const listEl = document.getElementById("relocateSkuSuggestions");
  clearRelocateBalanceFields(input, { keepSkuText: false });
  hideRelocateSelectedCard();
  hideProductTypeaheadList(listEl);
  if (input && typeof input.focus === "function") input.focus();
  syncRelocateFormState();
}

function clearRelocateBalanceFields(input, { keepSkuText = false } = {}) {
  if (input) {
    if (!keepSkuText) input.value = "";
    if (input.dataset) {
      delete input.dataset.skuSelectedId;
      delete input.dataset.skuSelectedCode;
      delete input.dataset.relocateSku;
      delete input.dataset.relocateProductName;
      delete input.dataset.relocateAssignmentLabel;
      delete input.dataset.relocateAssignmentType;
      delete input.dataset.relocateLocation;
      delete input.dataset.relocateStatus;
      delete input.dataset.relocateLot;
      delete input.dataset.relocateLayerCount;
      delete input.dataset.relocateSerialCount;
      delete input.dataset.relocateAvailable;
      delete input.dataset.relocateQty;
      delete input.dataset.relocateReserved;
    }
  }
  const productId = document.getElementById("relocateProductId");
  if (productId) productId.value = "";
  const inv = document.getElementById("relocateInventoryId");
  if (inv) inv.value = "";
  const layer = document.getElementById("relocateLayerId");
  if (layer) layer.value = "";
  clearRelocateDestination();
}

function clearRelocateDestination() {
  const sel = document.getElementById("relocateToSelect");
  const inp = document.getElementById("relocateTo");
  if (sel) sel.value = "";
  if (inp) inp.value = "";
}

function invalidateRelocateBalanceSelection(input) {
  if (!input?.dataset?.skuSelectedId) return false;
  if (input.value.trim() === (input.dataset.skuSelectedCode || "")) return false;
  clearRelocateBalanceFields(input, { keepSkuText: true });
  hideRelocateSelectedCard();
  syncRelocateFormState();
  return true;
}

function applyRelocateBalanceSelection(item) {
  const input = document.getElementById("relocateSku");
  const listEl = document.getElementById("relocateSkuSuggestions");
  hideProductTypeaheadList(listEl);
  if (input) {
    input.value = item.sku || "";
    input.dataset.skuSelectedId = item.inventoryId || "";
    input.dataset.skuSelectedCode = item.sku || "";
    input.dataset.relocateSku = item.sku || "";
    input.dataset.relocateProductName = item.productName || "";
    input.dataset.relocateAssignmentLabel = item.assignmentLabel || "";
    input.dataset.relocateAssignmentType = item.assignmentType || "";
    input.dataset.relocateLocation = item.locationCode || "";
    input.dataset.relocateStatus = item.status || "";
    input.dataset.relocateLot = item.lotNumber || "";
    input.dataset.relocateLayerCount = String(item.layerCount || 1);
    input.dataset.relocateSerialCount = String(item.serialCount || 0);
    input.dataset.relocateAvailable = String(item.availableQty || "");
    input.dataset.relocateQty = String(item.qty || "");
    input.dataset.relocateReserved = String(item.reservedQty || "");
  }
  const productId = document.getElementById("relocateProductId");
  if (productId) productId.value = item.productId || "";
  const inv = document.getElementById("relocateInventoryId");
  if (inv) inv.value = item.inventoryId || "";
  const layer = document.getElementById("relocateLayerId");
  if (layer) layer.value = "";
  renderRelocateSelectedCard(item);
  syncRelocateLocationSelects();
  syncRelocateFormState();
}

function relocateActiveLocationCodes(warehouse, { excludeCode } = {}) {
  const wh = String(warehouse || "").trim().toUpperCase();
  const exclude = String(excludeCode || "").trim().toUpperCase();
  const fromCatalog = (Array.isArray(relocateLocationsCache) ? relocateLocationsCache : [])
    .filter((loc) => loc && loc.active !== false)
    .filter((loc) => !wh || String(loc.warehouse || "").toUpperCase() === wh)
    .map((loc) => String(loc.code || "").trim())
    .filter(Boolean);
  const fromStock = (Array.isArray(stockRowsCache) ? stockRowsCache : [])
    .filter((row) => !wh || String(row.location?.warehouse || row.warehouse || "").toUpperCase() === wh)
    .map((row) => String(row.location?.code || row.locationCode || "").trim())
    .filter(Boolean);
  const codes = uniqueSortedStrings(fromCatalog.concat(fromStock));
  return codes.filter((code) => String(code).toUpperCase() !== exclude);
}

function fillRelocateLocationSelect(selectId, codes, { disabled = false, emptyLabel = "— Seleccionar —" } = {}) {
  const sel = document.getElementById(selectId);
  if (!(sel instanceof HTMLSelectElement)) return;
  const prev = String(sel.value || "").trim();
  const prevUpper = prev.toUpperCase();
  const match = prevUpper ? codes.find((code) => String(code).toUpperCase() === prevUpper) : "";
  sel.innerHTML =
    `<option value="">${escCell(emptyLabel)}</option>` +
    codes.map((code) => `<option value="${escCell(code)}">${escCell(code)}</option>`).join("");
  sel.value = match || "";
  sel.disabled = Boolean(disabled);
  const inp = document.getElementById(selectId.replace(/Select$/, ""));
  if (inp) {
    inp.classList.add("hidden");
    inp.value = sel.value || "";
    inp.disabled = Boolean(disabled);
  }
}

async function loadRelocateLocationsCatalog() {
  try {
    const response = await authenticatedFetch("/api/inventory/locations");
    if (!response?.ok) return relocateLocationsCache;
    const rows = await response.json();
    relocateLocationsCache = Array.isArray(rows) ? rows : [];
    locationsCatalogCache = relocateLocationsCache.slice();
  } catch (_e) {
    relocateLocationsCache = Array.isArray(relocateLocationsCache) ? relocateLocationsCache : [];
  }
  return relocateLocationsCache;
}

function syncRelocateLocationSelects() {
  const warehouse = relocateWarehouseValue();
  const originReady = Boolean(warehouse && relocateStatusValue());
  const originCodes = originReady ? relocateActiveLocationCodes(warehouse) : [];
  fillRelocateLocationSelect("relocateFromSelect", originCodes, {
    disabled: !originReady,
    emptyLabel: originReady ? "— Seleccionar —" : "— Selecciona almacén y estatus —"
  });
  const hasBalance = relocateHasBalanceSelection();
  const origin = relocateFromValue();
  const destCodes = hasBalance ? relocateActiveLocationCodes(warehouse, { excludeCode: origin }) : [];
  fillRelocateLocationSelect("relocateToSelect", destCodes, {
    disabled: !hasBalance,
    emptyLabel: hasBalance ? "— Seleccionar —" : "— Selecciona un saldo —"
  });
}

function updateRelocateAvailableHint() {
  const hint = document.getElementById("relocateAvailableHint");
  if (!hint) return;
  if (!relocateHasBalanceSelection()) {
    hint.dataset.available = "";
    hint.textContent = "Disponible para reubicar: —";
    return;
  }
  const selected = relocateSelectedBalance();
  hint.dataset.available = String(selected.availableQty || "");
  const qtyLabel =
    typeof formatQty === "function" ? formatQty(selected.availableQty) : selected.availableQty || "—";
  hint.textContent = `Disponible para reubicar: ${qtyLabel}`;
}

function syncRelocateSkuEnabled() {
  const input = document.getElementById("relocateSku");
  if (!(input instanceof HTMLInputElement)) return;
  const ready = relocateOriginContextReady();
  input.disabled = !ready;
  input.placeholder = ready
    ? "Buscar SKU, código de barras o nombre…"
    : "Selecciona almacén, estatus y ubicación origen";
  if (!ready) {
    hideProductTypeaheadList(document.getElementById("relocateSkuSuggestions"));
  }
}

function syncRelocateSubmitEnabled() {
  const btn = document.getElementById("relocateSubmitBtn");
  if (!btn) return;
  const ready = relocateFormIsComplete();
  btn.disabled = !ready;
  if (ready) btn.removeAttribute("disabled");
  else btn.setAttribute("disabled", "");
}

function syncRelocateFormState() {
  syncRelocateSkuEnabled();
  updateRelocateAvailableHint();
  syncRelocateSubmitEnabled();
}

function invalidateRelocateContextFromFilters() {
  const input = document.getElementById("relocateSku");
  clearRelocateBalanceFields(input, { keepSkuText: false });
  hideRelocateSelectedCard();
  hideProductTypeaheadList(document.getElementById("relocateSkuSuggestions"));
  syncRelocateLocationSelects();
  syncRelocateFormState();
}

function buildRelocateConfirmMessage(input) {
  const qty = input.qty;
  const sku = input.sku;
  const product = input.productName ? ` (${input.productName})` : "";
  const assignment = input.assignmentLabel || (input.assignmentType === "FREE_TO_SALE" ? "Free to Sale" : "Proyecto");
  const lote = Number(input.layerCount) > 1 ? `${input.layerCount} capas internas` : input.lotNumber ? `lote ${input.lotNumber}` : "sin lote";
  const statusLabel =
    typeof formatInventoryStatus === "function" ? formatInventoryStatus(input.status) : input.status;
  const fifo =
    Number(input.layerCount) > 1
      ? ` Asignación FIFO sobre ${input.layerCount} capas.`
      : " La cantidad se distribuirá automáticamente respetando FIFO, lotes y precios.";
  const reference = input.reference ? ` Referencia ${input.reference}.` : "";
  return `Se reubicará ${qty} piezas del SKU ${sku}${product}, ${assignment}, almacén ${input.warehouse}, de ${input.fromLoc} a ${input.toLoc}, estatus ${statusLabel}, ${lote}.${reference}${fifo} ¿Deseas continuar?`;
}

function showRelocateBalanceSuggestions(listEl, items, activeIdx, onPick) {
  if (!listEl) return;
  if (!items.length) {
    listEl.innerHTML = `<div class="product-typeahead-empty">Sin saldos con disponibilidad en origen. Sigue escribiendo o cambia la ubicación.</div>`;
    listEl.classList.remove("hidden");
    listEl.hidden = false;
    return;
  }
  listEl.innerHTML = items
    .map((item, idx) => {
      const assignment = item.assignmentLabel || "—";
      const statusLabel =
        typeof formatInventoryStatus === "function" ? formatInventoryStatus(item.status) : item.status;
      const layer = relocateLayerSummary(item);
      return `<button type="button" class="product-typeahead-item" role="option" data-pta-idx="${idx}" aria-selected="${
        idx === activeIdx ? "true" : "false"
      }">
        <div class="pta-sku">${escCell(item.sku)}${item.barcode && item.barcode !== item.sku ? ` · ${escCell(item.barcode)}` : ""}</div>
        <div class="pta-name">${escCell(item.productName || "—")}</div>
        <div class="pta-meta">${escCell(assignment)} · ${escCell(item.locationCode)} · ${escCell(statusLabel)} · Física ${escCell(
        typeof formatQty === "function" ? formatQty(item.qty) : item.qty
      )} · Reservada ${escCell(
        typeof formatQty === "function" ? formatQty(item.reservedQty) : item.reservedQty
      )} · Disponible ${escCell(
        typeof formatQty === "function" ? formatQty(item.availableQty) : item.availableQty
      )} · ${escCell(layer)}</div>
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

async function searchRelocateBalanceSuggestions(query) {
  if (!relocateOriginContextReady()) return [];
  const params = new URLSearchParams({
    warehouse: relocateWarehouseValue(),
    location: relocateFromValue(),
    status: relocateStatusValue()
  });
  if (query) params.set("q", query);
  const response = await authenticatedFetch(`/api/inventory/relocate-balances?${params.toString()}`);
  if (!response?.ok) return [];
  const rows = await response.json();
  return Array.isArray(rows) ? rows : [];
}

function wireRelocateBalanceTypeahead() {
  const input = document.getElementById("relocateSku");
  const listEl = document.getElementById("relocateSkuSuggestions");
  if (!(input instanceof HTMLInputElement) || !listEl || input.dataset.relocatePtaWired === "1") return;
  input.dataset.relocatePtaWired = "1";
  input.setAttribute("autocomplete", "off");
  const state = { items: [], active: -1, timer: null };

  const close = () => {
    hideProductTypeaheadList(listEl);
    state.items = [];
    state.active = -1;
  };

  const pick = (item) => {
    if (state.timer) clearTimeout(state.timer);
    close();
    applyRelocateBalanceSelection(item);
  };

  const refresh = async () => {
    if (!relocateOriginContextReady() || input.disabled) {
      close();
      return;
    }
    if (input.dataset.skuSelectedId && input.value.trim() === (input.dataset.skuSelectedCode || "")) {
      close();
      return;
    }
    const searchValue = input.value.trim();
    if (searchValue.length > 0 && searchValue.length < PRODUCT_TYPEAHEAD_MIN_CHARS) {
      close();
      return;
    }
    state.items = await searchRelocateBalanceSuggestions(searchValue);
    if (input.value.trim() !== searchValue) return;
    state.active = state.items.length ? 0 : -1;
    showRelocateBalanceSuggestions(listEl, state.items, state.active, pick);
  };

  input.addEventListener("input", () => {
    invalidateRelocateBalanceSelection(input);
    if (state.timer) clearTimeout(state.timer);
    state.timer = setTimeout(refresh, PRODUCT_TYPEAHEAD_DEBOUNCE_MS);
  });
  input.addEventListener("focus", () => {
    if (input.disabled) return;
    if (input.dataset.skuSelectedId && input.value.trim() === (input.dataset.skuSelectedCode || "")) {
      close();
      return;
    }
    if (input.value.trim().length >= PRODUCT_TYPEAHEAD_MIN_CHARS || !input.value.trim()) refresh();
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
      showRelocateBalanceSuggestions(listEl, state.items, state.active, pick);
    } else if (ev.key === "ArrowUp") {
      ev.preventDefault();
      state.active = Math.max(0, state.active - 1);
      showRelocateBalanceSuggestions(listEl, state.items, state.active, pick);
    } else if (ev.key === "Enter" && state.active >= 0 && state.items[state.active]) {
      ev.preventDefault();
      pick(state.items[state.active]);
    } else if (ev.key === "Escape") {
      ev.preventDefault();
      close();
    }
  });
}

function hideSkuSelectedCard(listEl) {
  const wrap = listEl?.parentElement;
  const hosts = [];
  if (wrap && typeof wrap.querySelectorAll === "function") hosts.push(wrap);
  const pageHost = document.getElementById("inventorySkuSelectedHost");
  if (pageHost) hosts.push(pageHost);
  for (const host of hosts) {
    host.querySelectorAll(".sku-selected-card, .sku-context-summary").forEach((panel) => {
      panel.classList.add("hidden");
      panel.hidden = true;
      panel.innerHTML = "";
    });
    if (host.id === "inventorySkuSelectedHost") clearInventorySkuSelectedContext();
  }
  const prefix = typeof opsPrefixFromTypeahead === "function" ? opsPrefixFromTypeahead(listEl, null) : "";
  if (
    (prefix === "req" || listEl?.id === "reqSkuSuggestions") &&
    typeof clearRequisitionSkuSelectedContext === "function"
  ) {
    clearRequisitionSkuSelectedContext();
  }
}

function clearSkuSelectionFields(prefix, input, { keepSkuText = false } = {}) {
  if (input) {
    if (!keepSkuText) input.value = "";
    if (input.dataset) {
      delete input.dataset.skuSelectedId;
      delete input.dataset.skuSelectedCode;
      delete input.dataset.skuClientId;
    }
  }
  if (prefix === "inbound" || prefix === "outbound" || prefix === "req" || prefix === "relocate") {
    const productEl = document.getElementById(`${prefix}Product`);
    if (productEl) productEl.value = "";
    const productIdEl = document.getElementById(`${prefix}ProductId`);
    if (productIdEl) productIdEl.value = "";
  }
  if (prefix === "inbound") {
    const hid = document.getElementById("inboundProductId");
    if (hid) hid.value = "";
    const assignment = String(document.getElementById("inboundAssignmentType")?.value || "").trim();
    if (assignment === "PROJECT" && typeof fillInboundProjectSelect === "function") fillInboundProjectSelect();
    if (typeof syncInboundSubmitEnabled === "function") syncInboundSubmitEnabled();
  }
  if (prefix === "relocate") {
    const inv = document.getElementById("relocateInventoryId");
    if (inv) inv.value = "";
    const layer = document.getElementById("relocateLayerId");
    if (layer) layer.value = "";
    if (typeof clearRelocateDestination === "function") clearRelocateDestination();
    if (typeof syncRelocateFormState === "function") syncRelocateFormState();
  }
  if (prefix === "inventory") {
    const prod = document.getElementById("invFilterProducto");
    if (prod) prod.value = "";
  }
  if (prefix === "picking") {
    const box = document.getElementById("pickCandidates");
    if (box) delete box.dataset.inventoryId;
    if (typeof clearPickCandidates === "function") clearPickCandidates();
  }
  if (prefix === "incident" || input?.id === "incidentProductSku") {
    const incidentId = document.getElementById("incidentProductId");
    if (incidentId) incidentId.value = "";
  }
  if (prefix === "req" && typeof clearRequisitionSkuSelectedContext === "function") {
    clearRequisitionSkuSelectedContext();
  }
}

function beginSkuChange(listEl, input) {
  const prefix = opsPrefixFromTypeahead(listEl, input);
  const skuInput = input || listEl?.parentElement?.querySelector("input");
  clearSkuSelectionFields(prefix, skuInput, { keepSkuText: false });
  hideSkuSelectedCard(listEl);
  hideProductTypeaheadList(listEl);
  if (skuInput && typeof skuInput.focus === "function") skuInput.focus();
}

function invalidateSkuSelection(listEl, input) {
  if (!input?.dataset?.skuSelectedId) return false;
  if (input.value.trim() === (input.dataset.skuSelectedCode || "")) return false;
  const prefix = opsPrefixFromTypeahead(listEl, input);
  clearSkuSelectionFields(prefix, input, { keepSkuText: true });
  hideSkuSelectedCard(listEl);
  return true;
}

function buildSkuContextDetailHtml(context, { pickingSelector = false } = {}) {
  const locations = Array.isArray(context?.inventory?.locations) ? context.inventory.locations : [];
  const clientName = canonicalClientDisplay(context);
  const project =
    context.stockAssignments?.label ||
    (context.project && isOperationalProjectRecord(context.project)
      ? `${context.project.name} (${context.project.code})`
      : "—");
  const locationSummary = !locations.length
    ? "Sin existencia / ubicación."
    : locations.length === 1
      ? "1 cubo encontrado."
      : `${locations.length} cubos: selecciona Proyecto / FREE TO SALE y ubicación antes de operar.`;
  const locationRows = locations
    .map((row) => {
      const assignmentLabel = assignmentDisplayLabel(row);
      const text = `${assignmentLabel} · ${row.locationCode || "—"} · ${formatInventoryStatus(row.status)} · ${formatQty(row.qty)} · Reservada ${formatQty(
        row.reservedQty
      )} · No reservada ${formatQty(row.unreservedQty)}`;
      if (pickingSelector && row.inventoryId) {
        return `<li><button type="button" class="btn-secondary btn-compact" data-sku-cube="${escCell(
          row.inventoryId
        )}" style="text-align:left;justify-content:flex-start">${escCell(text)}</button></li>`;
      }
      return `<li>${escCell(text)}</li>`;
    })
    .join("");
  const layerCount = Number(context.layers?.count || 0);
  const valuation = context.valuation || null;
  return `<strong>${escCell(context.product.sku)} · ${escCell(context.product.name)}</strong>
    <div>${escCell(clientName)} · ${escCell(project)}</div>
    <div>Existencia total: ${escCell(formatQty(context.inventory?.totalQty || 0))} · No reservada: ${escCell(
      formatQty(context.inventory?.totalUnreservedQty || 0)
    )}</div>
    <div>Capas: ${escCell(String(layerCount))} · Serializadas: ${escCell(String(context.serializedQty || 0))}${
      canSeeEconomicValuation() && valuation
        ? ` · Valor MXN ${escCell(formatMxn(valuation.totalValueMxn))} · cobertura ${escCell(valuation.coveragePct || "0.00")}%`
        : ""
    }</div>
    <div>${escCell(locationSummary)}</div>
    ${locationRows ? `<ul style="margin:4px 0 0;padding-left:18px">${locationRows}</ul>` : ""}`;
}

function skuQtyNumber(value) {
  const n = typeof value === "string" ? Number(value.replace(",", ".")) : Number(value);
  return Number.isFinite(n) ? n : 0;
}

function skuCardProjectLabel(project) {
  if (!project) return "—";
  if (project.name && project.code) return `${project.name} (${project.code})`;
  return project.name || project.code || "—";
}

function skuCardSumRows(rows, field) {
  return (Array.isArray(rows) ? rows : []).reduce((sum, row) => sum + skuQtyNumber(row?.[field]), 0);
}

function skuCardResolveScopedProject(scopeId, breakdown, focusedRows) {
  const fromRow = focusedRows.find((row) => String(row.project?.id || row.projectId || "") === scopeId)?.project;
  if (fromRow) return fromRow;
  const fromBreakdown = (Array.isArray(breakdown?.projects) ? breakdown.projects : []).find((row) => row.id === scopeId);
  if (fromBreakdown) return fromBreakdown;
  if (typeof inventoryProjectsCache !== "undefined" && Array.isArray(inventoryProjectsCache)) {
    const fromCache = inventoryProjectsCache.find((row) => row.id === scopeId);
    if (fromCache) return fromCache;
  }
  return { id: scopeId, name: "Proyecto seleccionado", code: "" };
}

function requisitionFormSkuCardScope() {
  const sel = typeof document !== "undefined" ? document.getElementById("reqCustomer") : null;
  const code = String(sel?.value || "").trim();
  if (!code || (typeof SMART_OTHER !== "undefined" && code === SMART_OTHER)) {
    return { projectId: "", assignmentType: "" };
  }
  const catalogs = [];
  if (typeof getOperationalProjectsForSelect === "function") {
    const rows = getOperationalProjectsForSelect();
    if (Array.isArray(rows)) catalogs.push(...rows);
  }
  if (typeof inventoryProjectsCache !== "undefined" && Array.isArray(inventoryProjectsCache)) {
    catalogs.push(...inventoryProjectsCache);
  }
  const match = catalogs.find((p) => p && (String(p.code || "") === code || String(p.id || "") === code));
  if (match?.id) return { projectId: String(match.id), assignmentType: "PROJECT" };
  return { projectId: "", assignmentType: "" };
}

function skuCardScopeFromTypeahead(listEl) {
  const prefix = typeof opsPrefixFromTypeahead === "function" ? opsPrefixFromTypeahead(listEl, null) : "";
  if (prefix === "req" || listEl?.id === "reqSkuSuggestions") return requisitionFormSkuCardScope();
  return null;
}

function skuCardFocusFromContext(context, scopeOverride) {
  const locations = Array.isArray(context?.inventory?.locations) ? context.inventory.locations : [];
  const breakdown = context?.assignmentBreakdown || null;
  const scope =
    scopeOverride && typeof scopeOverride === "object"
      ? {
          projectId: String(scopeOverride.projectId || "").trim(),
          assignmentType: String(scopeOverride.projectId || "").trim()
            ? "PROJECT"
            : String(scopeOverride.assignmentType || "").trim().toUpperCase()
        }
      : typeof getInventoryScope === "function"
        ? getInventoryScope() || {}
        : { projectId: "", assignmentType: "" };
  const scopeId = String(scope.projectId || "").trim();
  const assignmentType = scopeId ? "PROJECT" : String(scope.assignmentType || "").trim().toUpperCase();
  const operationalLocations = locations.filter((row) => {
    if (row?.assignmentType === "FREE_TO_SALE") return false;
    if (row?.historicalAssignment === "HISTORICAL_NON_OPERATIONAL") return false;
    return isOperationalProjectRecord(row?.project || { code: row?.projectCode, name: row?.projectName });
  });
  const ftsRows = locations.filter((row) => row?.assignmentType === "FREE_TO_SALE");
  const breakdownProjects = Array.isArray(breakdown?.projects) ? breakdown.projects : [];
  const freeToSaleQty = breakdown?.freeToSale ? skuQtyNumber(breakdown.freeToSale.qty) : skuCardSumRows(ftsRows, "qty");
  const freeToSaleReserved = breakdown?.freeToSale
    ? skuQtyNumber(breakdown.freeToSale.reservedQty)
    : skuCardSumRows(ftsRows, "reservedQty");
  const freeToSaleUnreserved = breakdown?.freeToSale
    ? skuQtyNumber(breakdown.freeToSale.unreservedQty)
    : skuCardSumRows(ftsRows, "unreservedQty");
  const allOperationalQty = breakdownProjects.length
    ? breakdownProjects.reduce((sum, row) => sum + skuQtyNumber(row.qty), 0)
    : skuCardSumRows(operationalLocations, "qty");
  const otherProjectsQtyFor = (focusedId) => {
    if (breakdownProjects.length) {
      return breakdownProjects
        .filter((row) => row.id && row.id !== focusedId)
        .reduce((sum, row) => sum + skuQtyNumber(row.qty), 0);
    }
    return operationalLocations
      .filter((row) => String(row.project?.id || row.projectId || "") !== String(focusedId || ""))
      .reduce((sum, row) => sum + skuQtyNumber(row.qty), 0);
  };
  const base = {
    clientLabel: canonicalClientDisplay(context),
    globalQty: skuQtyNumber(context?.inventory?.totalQty),
    freeToSaleQty,
    showAvailableDash: false
  };

  if (assignmentType === "PROJECT" && scopeId) {
    const focusedRows = operationalLocations.filter(
      (row) => String(row.project?.id || row.projectId || "") === scopeId
    );
    const project = skuCardResolveScopedProject(scopeId, breakdown, focusedRows);
    const empty = focusedRows.length === 0;
    const primaryLocation = focusedRows.length === 1 ? focusedRows[0] : null;
    const qty = skuCardSumRows(focusedRows, "qty");
    return {
      ...base,
      mode: "PROJECT",
      projectFieldLabel: "Proyecto",
      projectLabel: skuCardProjectLabel(project),
      projectNameShort: project.name || project.code || "Este proyecto",
      availableLabel: "Disponible en este proyecto",
      qty,
      reservedQty: skuCardSumRows(focusedRows, "reservedQty"),
      unreservedQty: skuCardSumRows(focusedRows, "unreservedQty"),
      locationLabel: empty ? "Sin existencia en este proyecto" : skuSelectedLocationLabel(focusedRows),
      locationCaption: !empty && focusedRows.length !== 1 ? "Saldos" : "Ubicación",
      statusLabel: empty ? "—" : primaryLocation ? formatInventoryStatus(primaryLocation.status) : `${focusedRows.length} cubos`,
      attQty: qty,
      otherProjectsQty: otherProjectsQtyFor(scopeId)
    };
  }

  if (assignmentType === "FREE_TO_SALE") {
    const primaryLocation = ftsRows.length === 1 ? ftsRows[0] : null;
    return {
      ...base,
      mode: "FREE_TO_SALE",
      projectFieldLabel: "Asignación",
      projectLabel: "FREE TO SALE",
      projectNameShort: "Free to Sale",
      availableLabel: "Disponible en Free to Sale",
      qty: freeToSaleQty,
      reservedQty: freeToSaleReserved,
      unreservedQty: freeToSaleUnreserved,
      locationLabel: ftsRows.length ? skuSelectedLocationLabel(ftsRows) : "Sin existencia en Free to Sale",
      locationCaption: ftsRows.length === 1 ? "Ubicación" : "Saldos",
      statusLabel: primaryLocation ? formatInventoryStatus(primaryLocation.status) : ftsRows.length ? `${ftsRows.length} cubos` : "—",
      attQty: freeToSaleQty,
      otherProjectsQty: allOperationalQty
    };
  }

  return {
    ...base,
    mode: "ALL",
    projectFieldLabel: "Proyecto",
    projectLabel: "Selecciona un proyecto",
    projectNameShort: "Proyectos",
    availableLabel: "Disponible en este proyecto",
    showAvailableDash: true,
    qty: 0,
    reservedQty: 0,
    unreservedQty: 0,
    locationLabel: "—",
    locationCaption: "Ubicación",
    statusLabel: "—",
    attQty: 0,
    otherProjectsQty: allOperationalQty
  };
}

function buildSkuSelectedCardHtml(context, detailHtml, scopeOverride) {
  const product = context?.product || {};
  const focus = skuCardFocusFromContext(context, scopeOverride);
  const availableValue = focus.showAvailableDash ? "—" : formatQty(focus.qty);
  const reservedValue = focus.showAvailableDash ? "—" : formatQty(focus.reservedQty);
  const unreservedValue = focus.showAvailableDash ? "—" : formatQty(focus.unreservedQty);
  const ftsQty = escCell(formatQty(focus.freeToSaleQty));
  const otherQty = escCell(formatQty(focus.otherProjectsQty));
  const projectQty = escCell(formatQty(focus.attQty));
  let breakdownSecondLine = `${escCell(focus.projectNameShort)}: ${projectQty} · Free to Sale: ${ftsQty} · otros proyectos: ${otherQty}`;
    if (typeof currentRole !== "undefined" && currentRole === "CLIENT") {
    breakdownSecondLine = `Proyectos de mi cliente: ${projectQty}`;
  } else if (focus.mode === "FREE_TO_SALE") {
    breakdownSecondLine = `Free to Sale: ${ftsQty} · Total en proyectos: ${otherQty}`;
  } else if (focus.mode === "ALL") {
    breakdownSecondLine = `Total en proyectos: ${otherQty} · Free to Sale: ${ftsQty}`;
  }
  return `<div class="sku-selected-card-title">✓ SKU seleccionado</div>
    <dl class="sku-selected-card-meta">
      <div><dt>SKU</dt><dd>${escCell(product.sku)}</dd></div>
      <div><dt>Producto</dt><dd>${escCell(product.name)}</dd></div>
      <div><dt>Cliente</dt><dd>${escCell(focus.clientLabel)}</dd></div>
      <div><dt>${escCell(focus.projectFieldLabel || "Proyecto")}</dt><dd>${escCell(focus.projectLabel)}</dd></div>
      <div><dt>${escCell(focus.availableLabel || "Disponible en este proyecto")}</dt><dd>${escCell(availableValue)}</dd></div>
      <div><dt>${escCell(focus.locationCaption)}</dt><dd>${escCell(focus.locationLabel)}</dd></div>
      <div><dt>Estatus</dt><dd>${escCell(focus.statusLabel)}</dd></div>
      <div><dt>Reservado</dt><dd>${escCell(reservedValue)}</dd></div>
      <div><dt>No reservado</dt><dd>${escCell(unreservedValue)}</dd></div>
    </dl>
    <div class="sku-selected-card-breakdown">
      <div>Total global: ${escCell(formatQty(focus.globalQty))} <span class="sku-selected-card-breakdown-note">(informativo, no es el saldo del proyecto)</span></div>
      <div>${breakdownSecondLine}</div>
    </div>
    <button type="button" class="btn-secondary btn-compact sku-change-btn">Cambiar SKU</button>
    <details class="sku-selected-detail">
      <summary>Ver detalle</summary>
      <div class="sku-selected-detail-body">${detailHtml || ""}</div>
    </details>`;
}

function renderSkuContext(listEl, context) {
  if (!listEl || !context?.product) return;
  hideProductTypeaheadList(listEl);
  const wrap = listEl.parentElement;
  wrap?.querySelector(".sku-context-summary")?.remove();
  const host =
    (listEl.id === "invFilterSkuSuggestions" && document.getElementById("inventorySkuSelectedHost")) || wrap;
  let panel = host?.querySelector(".sku-selected-card");
  if (!panel && host) {
    panel = document.createElement("div");
    panel.className = "sku-selected-card";
    if (host.id === "inventorySkuSelectedHost") host.appendChild(panel);
    else listEl.insertAdjacentElement("afterend", panel);
  }
  if (!panel) return;
  panel.classList.remove("hidden");
  panel.hidden = false;
  const locations = Array.isArray(context.inventory?.locations) ? context.inventory.locations : [];
  const pickingSelector = Boolean(document.getElementById("pickCandidates") && listEl?.id === "scanSkuSuggestions");
  panel.innerHTML = buildSkuSelectedCardHtml(
    context,
    buildSkuContextDetailHtml(context, { pickingSelector }),
    typeof skuCardScopeFromTypeahead === "function" ? skuCardScopeFromTypeahead(listEl) : null
  );
  rememberInventorySkuSelectedContext(listEl, context);
  if (typeof rememberRequisitionSkuSelectedContext === "function") {
    rememberRequisitionSkuSelectedContext(listEl, context);
  }
  const input = wrap?.querySelector("input");
  panel.querySelector(".sku-change-btn")?.addEventListener("click", () => {
    beginSkuChange(listEl, input);
  });
  if (pickingSelector) {
    panel.querySelectorAll("[data-sku-cube]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const inventoryId = btn.getAttribute("data-sku-cube");
        const row = locations.find((item) => item.inventoryId === inventoryId);
        if (!row) return;
        renderPickCandidates([
          {
            inventoryId: row.inventoryId,
            assignmentType: row.assignmentType,
            assignmentLabel: assignmentDisplayLabel(row),
            projectCode: row.project?.code || (row.assignmentType === "FREE_TO_SALE" ? "" : ""),
            projectName: row.project?.name || "",
            location: row.locationCode,
            warehouse: row.warehouse,
            status: row.status,
            qty: row.qty,
            reservedQty: row.reservedQty,
            unreservedQty: row.unreservedQty
          }
        ]);
      });
    });
  }
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

function productTypeaheadAvailabilityBadge(item) {
  const qty = item.unreservedQty ?? item.qty;
  if (qty != null && qty !== "" && Number(qty) > 0) {
    return `<span class="pta-avail is-stock">Disponible: ${escCell(formatQty(qty))}</span>`;
  }
  if (item.kind === "catalog" || !item.hasStock) {
    return `<span class="pta-avail is-catalog">Catálogo · sin existencia</span>`;
  }
  return `<span class="pta-avail is-attention">Revisar disponibilidad</span>`;
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
      const barcodePart =
        item.barcode && item.barcode !== item.sku ? `<span class="pta-barcode"> · ${escCell(item.barcode)}</span>` : "";
      const projectPart = item.projectName
        ? `${item.projectName}${item.projectCode ? ` (${item.projectCode})` : ""}`
        : item.projectCode || "—";
      const locPart = item.location || "—";
      const whPart = item.warehouse ? `${item.warehouse} · ` : "";
      return `<button type="button" class="product-typeahead-item" role="option" data-pta-idx="${idx}" aria-selected="${
        idx === activeIdx ? "true" : "false"
      }">
        <div class="pta-sku">${escCell(item.sku)}${barcodePart}</div>
        <div class="pta-name">${escCell(item.productName || "—")}</div>
        <div class="pta-meta">Proyecto: ${escCell(projectPart)} · Ubicación: ${escCell(whPart + locPart)}</div>
        ${productTypeaheadAvailabilityBadge(item)}
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
 *  getSearchOpts?: () => { location?: string, warehouse?: string, requireStock?: boolean },
 *  onSelect: (item: any) => void,
 *  minChars?: number,
 *  allowImmediateEnter?: boolean
 * }} cfg
 */
function wireProductTypeahead(cfg) {
  const input = cfg.input;
  const listEl = cfg.listEl;
  if (!input || !listEl || input.dataset.ptaWired === "1") return;
  input.dataset.ptaWired = "1";
  input.setAttribute("autocomplete", "off");
  const minChars = cfg.minChars ?? PRODUCT_TYPEAHEAD_MIN_CHARS;
  const state = { items: /** @type {any[]} */ ([]), active: -1, timer: null, requestSeq: 0 };
  productTypeaheadState.set(input, state);

  const close = () => {
    hideProductTypeaheadList(listEl);
    state.items = [];
    state.active = -1;
  };

  const pick = (item) => {
    if (state.timer) clearTimeout(state.timer);
    close();
    if (item.sku) input.value = item.sku;
    input.dataset.skuSelectedId = item.productId || "";
    input.dataset.skuSelectedCode = item.sku || "";
    const prefix = opsPrefixFromTypeahead(listEl, input);
    if (prefix === "inbound") {
      const hid = document.getElementById("inboundProductId");
      if (hid) hid.value = item.productId || "";
      input.dataset.skuClientId =
        item.product?.customer?.client?.id || item.context?.client?.id || item.product?.customer?.clientId || "";
      if (inboundAssignmentTypeValue() === "PROJECT") fillInboundProjectSelect();
      syncInboundSubmitEnabled();
    }
    const selectedId = item.productId || "";
    void loadSkuContext(selectedId).then((context) => {
      if (input.dataset.skuSelectedId !== selectedId) return;
      hideProductTypeaheadList(listEl);
      if (context) renderSkuContext(listEl, context);
      cfg.onSelect({ ...item, context });
    });
  };

  const refresh = async () => {
    if (input.dataset.skuSelectedId && input.value.trim() === (input.dataset.skuSelectedCode || "")) {
      close();
      return;
    }
    const q = input.value.trim();
    if (q.length < minChars) {
      close();
      return;
    }
    const customerCode = typeof cfg.getCustomerCode === "function" ? cfg.getCustomerCode() : "";
    const searchOpts = typeof cfg.getSearchOpts === "function" ? cfg.getSearchOpts() : {};
    const searchValue = q;
    const requestSeq = ++state.requestSeq;
    state.items = await searchSkuSuggestions(q, {
      customerCode: customerCode || "",
      max: PRODUCT_TYPEAHEAD_MAX,
      location: searchOpts.location || "",
      warehouse: searchOpts.warehouse || "",
      requireStock: Boolean(searchOpts.requireStock)
    });
    if (requestSeq !== state.requestSeq) return;
    if (input.value.trim() !== searchValue) return;
    if (input.dataset.skuSelectedId && input.value.trim() === (input.dataset.skuSelectedCode || "")) {
      close();
      return;
    }
    state.active = state.items.length ? 0 : -1;
    showProductTypeaheadList(listEl, state.items, state.active, pick);
  };

  input.addEventListener("input", () => {
    invalidateSkuSelection(listEl, input);
    if (state.timer) clearTimeout(state.timer);
    state.timer = setTimeout(refresh, PRODUCT_TYPEAHEAD_DEBOUNCE_MS);
  });
  input.addEventListener("focus", () => {
    if (input.dataset.skuSelectedId && input.value.trim() === (input.dataset.skuSelectedCode || "")) {
      close();
      return;
    }
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
    skuEl.dataset.skuSelectedId = item.productId || skuEl.dataset.skuSelectedId || "";
    skuEl.dataset.skuSelectedCode = item.sku || skuEl.dataset.skuSelectedCode || "";
    skuEl.dispatchEvent(new Event("change", { bubbles: true }));
  }
  const productEl = document.getElementById(`${prefix}Product`);
  if (productEl) productEl.value = item.productName || item.product?.name || "";
  if (prefix === "inbound") {
    const hid = document.getElementById("inboundProductId");
    if (hid) hid.value = item.productId || "";
    if (skuEl) {
      skuEl.dataset.skuClientId =
        item.product?.customer?.client?.id || item.context?.client?.id || item.product?.customer?.clientId || "";
    }
    if (inboundAssignmentTypeValue() === "PROJECT") fillInboundProjectSelect();
    syncInboundSubmitEnabled();
  }
  if (isSuggestedOperationalProject(item) && prefix !== "inbound") {
    applyOperationalProjectToSelect(`${prefix}Customer`, item);
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
  const contextLocations = Array.isArray(item.context?.inventory?.locations) ? item.context.inventory.locations : [];
  const selectedCube =
    item.kind === "stock" && item.inventoryId
      ? item
      : contextLocations.length === 1
        ? {
            inventoryId: contextLocations[0].inventoryId,
            assignmentType: contextLocations[0].assignmentType,
            assignmentLabel: assignmentDisplayLabel(contextLocations[0]),
            projectCode: contextLocations[0].project?.code || "",
            projectName: contextLocations[0].project?.name || "",
            warehouse: contextLocations[0].warehouse,
            location: contextLocations[0].locationCode,
            status: contextLocations[0].status,
            qty: contextLocations[0].qty,
            reservedQty: contextLocations[0].reservedQty,
            unreservedQty: contextLocations[0].unreservedQty
          }
        : null;
  if (selectedCube?.assignmentType === "FREE_TO_SALE") {
    const projectSel = document.getElementById("pickProject");
    if (projectSel) projectSel.value = "";
  } else if (isSuggestedOperationalProject(selectedCube)) {
    applyOperationalProjectToSelect("pickProject", selectedCube);
  }
  const locSource = selectedCube || item;
  if (locSource.warehouse) setSelectValueFlexible("pickWarehouse", locSource.warehouse);
  if (locSource.location || locSource.locationCode) {
    const locSel = document.getElementById("pickLocation");
    const locationCode = locSource.location || locSource.locationCode;
    if (locSel && locationCode) {
      if (![...locSel.options].some((o) => o.value === locationCode)) {
        const opt = document.createElement("option");
        opt.value = locationCode;
        opt.textContent = locationCode;
        locSel.appendChild(opt);
      }
      locSel.value = locationCode;
    }
  }
  if (locSource.status) setSelectValueFlexible("pickStatus", locSource.status);
  const box = document.getElementById("pickCandidates");
  if (box) {
    if (selectedCube?.inventoryId) {
      renderPickCandidates([selectedCube]);
    } else {
      delete box.dataset.inventoryId;
      clearPickCandidates();
    }
  }
  if (typeof setScanResult === "function") {
    if (selectedCube?.inventoryId) {
      setScanResult(
        `Línea elegida: ${selectedCube.assignmentLabel || assignmentDisplayLabel(selectedCube)} · ${selectedCube.location || "—"} / ${formatInventoryStatus(
          selectedCube.status
        )} (qty ${formatQty(selectedCube.qty)}). Confirma el surtido para descontar.`,
        "ok"
      );
    } else if (contextLocations.length > 1) {
      setScanResult(
        `Este SKU tiene ${contextLocations.length} cubos (proyecto / FREE TO SALE). Elige uno antes de surtir.`,
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
  const ccSku = document.getElementById("ccFilterSku");
  const ccList = document.getElementById("ccFilterSkuSuggestions");
  if (ccSku instanceof HTMLInputElement && ccList) {
    wireProductTypeahead({
      input: ccSku,
      listEl: ccList,
      mode: "both",
      onSelect: (item) => {
        ccSku.value = item.sku || "";
        const prod = document.getElementById("ccFilterProducto");
        if (prod && item.productName) prod.value = item.productName;
        applyControlCenterFilters();
      }
    });
  }

  const catSku = document.getElementById("catFilterSku");
  const catList = document.getElementById("catFilterSkuSuggestions");
  if (catSku instanceof HTMLInputElement && catList) {
    wireProductTypeahead({
      input: catSku,
      listEl: catList,
      mode: "catalog",
      onSelect: (item) => {
        catSku.value = item.sku || "";
        const prod = document.getElementById("catFilterProducto");
        if (prod && item.productName) prod.value = item.productName;
        applyCatalogFilters();
      }
    });
  }

  const traceSku = document.getElementById("traceSku");
  const traceList = document.getElementById("traceSkuSuggestions");
  if (traceSku instanceof HTMLInputElement && traceList) {
    wireProductTypeahead({
      input: traceSku,
      listEl: traceList,
      mode: "both",
      getSearchOpts: () => {
        const location = document.getElementById("traceWh")?.value?.trim() || "";
        return { location, requireStock: Boolean(location) };
      },
      onSelect: (item) => {
        traceSku.value = item.sku || "";
        if (typeof loadMovements === "function") void loadMovements();
      }
    });
  }

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
  const incidentList = document.getElementById("incidentSkuSuggestions");
  if (incidentSku instanceof HTMLInputElement && incidentList) {
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
      getCustomerCode: () =>
        prefix === "inbound"
          ? inboundTypeaheadProjectCode()
          : document.getElementById(`${prefix}Customer`)?.value?.trim() || "",
      onSelect: (item) => {
        if (prefix === "outbound" && item.kind === "stock") {
          applyStockSuggestionToOps(prefix, item);
        } else {
          applyCatalogSuggestionToOps(prefix, item);
        }
      }
    });
  });
  if (typeof wireRelocateBalanceTypeahead === "function") wireRelocateBalanceTypeahead();
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
      if (isSuggestedOperationalProject(item)) {
        applyOperationalProjectToSelect("reqCustomer", item);
        const cliente = document.getElementById("reqCliente");
        if (cliente) cliente.value = item.projectName || item.projectCode;
      }
    }
  });
}

function populateSmartOperationalFields() {
  const warehouses = getKnownWarehouses();
  const locations = getKnownLocations();
  const projects = getOperationalProjectsForSelect();

  const pairs = [
    ["inboundWarehouseSelect", "inboundWarehouse", warehouses, "TULTITLAN24", "Otro almacén"],
    ["inboundLocationSelect", "inboundLocation", locations, "", "Otra ubicación"],
    ["outboundWarehouseSelect", "outboundWarehouse", warehouses, "TULTITLAN24", "Otro almacén"],
    ["outboundLocationSelect", "outboundLocation", locations, "", "Otra ubicación"],
    ["incidentWarehouseSelect", "incidentWarehouse", warehouses, "", "Otro almacén"],
    ["incidentLocationSelect", "incidentLocation", locations, "", "Otra ubicación"],
    ["taskWarehouseSelect", "taskWarehouse", warehouses, "TULTITLAN24", "Otro almacén"],
    ["taskLocationSelect", "taskLocation", locations, "", "Otra ubicación"],
    ["relocateWarehouseSelect", "relocateWarehouse", warehouses, "TULTITLAN24", "Otro almacén"]
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
    html += `<option value="${SMART_OTHER}">Otro proyecto</option>`;
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
  updateInventoryScopeUi();
  const addBtn = document.getElementById("projectsAddBtn");
  const ccAdd = document.getElementById("ccAddProjectBtn");
  const canAdd = currentRole === "ADMIN";
  if (addBtn) addBtn.style.display = canAdd ? "" : "none";
  if (ccAdd) ccAdd.style.display = canAdd ? "" : "none";
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
  const customers = getOperationalProjectsForSelect();
  let html =
    '<option value="">— Seleccionar proyecto —</option>' +
    customers.map((c) => `<option value="${escCell(c.code)}">${escCell(c.name)} (${escCell(c.code)})</option>`).join("");
  if (currentRole === "ADMIN" || currentRole === "SUPERVISOR") {
    html += `<option value="${SMART_OTHER}">Otro proyecto</option>`;
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
      if (selectId === "inboundSku" && !inboundHasSystemSkuSelection()) {
        if (inp && !raw) inp.value = "";
        return;
      }
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
  fillCustomerSelect("outboundCustomer", "outboundCliente");
  fillCustomerSelect("reqCustomer", "reqCliente");
  fillInventoryStatusSelects();
  fillInboundProjectSelect();
  syncInboundAssignmentUi();
  fillSkuSelect("inboundSku", inboundTypeaheadProjectCode(), "inboundProduct");
  fillSkuSelect("outboundSku", document.getElementById("outboundCustomer")?.value || "", "outboundProduct");
  fillSkuSelect("reqSku", document.getElementById("reqCustomer")?.value || "", null);
  populateSmartOperationalFields();
  if (typeof syncRelocateLocationSelects === "function") syncRelocateLocationSelects();
  if (typeof syncRelocateFormState === "function") syncRelocateFormState();
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
  const inboundAssignmentType = kind === "in" ? inboundAssignmentTypeValue() : "";
  const inboundProjectId = kind === "in" && inboundAssignmentType === "PROJECT" ? inboundSelectedProjectId() : "";
  const sku = document.getElementById(`${prefix}Sku`)?.value?.trim();
  const qty = Number(document.getElementById(`${prefix}Qty`)?.value);
  const warehouse =
    readSmartFieldValue(`${prefix}Warehouse`) ||
    document.getElementById(`${prefix}Warehouse`)?.value?.trim() ||
    (kind === "in" ? "" : "TULTITLAN24");
  const location =
    readSmartFieldValue(`${prefix}Location`) ||
    document.getElementById(`${prefix}Location`)?.value?.trim();
  const status = document.getElementById(`${prefix}Status`)?.value || "";
  const referenceRaw = document.getElementById(`${prefix}Reference`)?.value?.trim();
  const notes = document.getElementById(`${prefix}Notes`)?.value?.trim();
  const lote = document.getElementById(`${prefix}Lote`)?.value?.trim();

  if (kind !== "in" && customerCode === SMART_OTHER) {
    setOpsMessage(msgId, "Seleccione un proyecto válido o créelo en catálogo.", false);
    return;
  }

  if (kind === "in") {
    if (inboundAssignmentType !== "FREE_TO_SALE" && inboundAssignmentType !== "PROJECT") {
      setOpsMessage(msgId, "Seleccione una asignación.", false);
      syncInboundSubmitEnabled();
      return;
    }
    if (inboundAssignmentType === "PROJECT" && !inboundProjectId) {
      setOpsMessage(msgId, "Seleccione un proyecto destino.", false);
      syncInboundSubmitEnabled();
      return;
    }
  } else if (!customerCode) {
    setOpsMessage(msgId, "Seleccione un proyecto.", false);
    return;
  }
  if (kind === "in" && !inboundHasSystemSkuSelection()) {
    setOpsMessage(msgId, "Seleccione un SKU de las sugerencias.", false);
    syncInboundSubmitEnabled();
    return;
  }
  if (!sku) {
    setOpsMessage(msgId, "Seleccione un SKU del catálogo.", false);
    return;
  }
  if (!warehouse) {
    setOpsMessage(msgId, "Indique el almacén.", false);
    if (kind === "in") syncInboundSubmitEnabled();
    return;
  }
  if (!location) {
    setOpsMessage(msgId, "Indique la ubicación.", false);
    if (kind === "in") syncInboundSubmitEnabled();
    return;
  }
  if (!status) {
    setOpsMessage(msgId, "Seleccione un estatus.", false);
    if (kind === "in") syncInboundSubmitEnabled();
    return;
  }
  if (!Number.isFinite(qty) || qty <= 0) {
    setOpsMessage(msgId, "La cantidad debe ser mayor que 0.", false);
    if (kind === "in") syncInboundSubmitEnabled();
    return;
  }

  const product = findProductBySku(sku);
  if (!product) {
    setOpsMessage(msgId, "SKU inexistente en catálogo.", false);
    return;
  }
  if (kind !== "in" && customerCode) {
    /* El propietario operativo lo decide el cubo, no product.customer. */
  }

  const reference = buildOpsReference(lote, referenceRaw, kind);

  if (kind === "in") {
    const price = parseInboundUnitPriceMxn();
    if (!price.ok) {
      setOpsMessage(msgId, price.message || "El precio unitario MXN no es válido.", false);
      syncInboundSubmitEnabled();
      return;
    }
    if (typeof canEditEconomicValuation === "function" && !canEditEconomicValuation() && !price.empty) {
      setOpsMessage(msgId, "Solo ADMIN puede asignar precio unitario MXN en la entrada.", false);
      syncInboundSubmitEnabled();
      return;
    }
    const confirmMsg = buildInboundConfirmMessage({
      sku,
      productName: document.getElementById("inboundProduct")?.value?.trim() || product.name || "",
      qty: document.getElementById("inboundQty")?.value || qty,
      assignmentType: inboundAssignmentType,
      projectId: inboundProjectId,
      projectLabel: inboundProjectConfirmLabel(),
      warehouse,
      location,
      lote,
      priceEmpty: price.empty,
      priceValue: price.value
    });
    if (typeof window !== "undefined" && window.confirm && !window.confirm(confirmMsg)) {
      syncInboundSubmitEnabled();
      return;
    }
  }

  if (btn) btn.disabled = true;
  try {
    const payload = {
      sku,
      type: kind === "in" ? "IN" : "OUT",
      quantity: qty,
      warehouse,
      location,
      status,
      reference,
      notes: notes || undefined
    };
    if (kind === "in") {
      payload.assignmentType = inboundAssignmentType;
      payload.projectId = inboundAssignmentType === "FREE_TO_SALE" ? null : inboundProjectId;
      if (inboundAssignmentType === "FREE_TO_SALE") payload.clientId = inboundSelectedOwnerClientId();
      if (lote) payload.lotNumber = lote;
      const price = parseInboundUnitPriceMxn();
      if (!price.empty && price.value != null && (typeof canEditEconomicValuation !== "function" || canEditEconomicValuation())) {
        payload.unitPriceMxn = price.value;
      }
    }
    const response = await authenticatedFetch("/api/inventory/movements", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
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
    if (kind === "in") {
      const priceEl = document.getElementById("inboundUnitPriceMxn");
      if (priceEl) priceEl.value = "";
      updateInboundEntryValue();
    }
    await loadStockStrip();
    await loadInventoryMovements();
    if (kind === "in") await loadInboundList();
    else await loadOutboundList();
  } catch (_e) {
    setOpsMessage(msgId, "Error de red.", false);
  } finally {
    if (kind === "in") syncInboundSubmitEnabled();
    else if (btn) btn.disabled = false;
  }
}

/**
 * Reubicación atómica vía motor de mutaciones (origen + destino en una sola transacción).
 */
async function submitRelocate() {
  const msgId = "relocateMessage";
  const btn = document.getElementById("relocateSubmitBtn");
  setOpsMessage(msgId, "", true);
  const fromLoc = relocateFromValue();
  const toLoc = relocateToValue();
  const warehouse = relocateWarehouseValue();
  const stockStatus = relocateStatusValue();
  const referenceRaw = document.getElementById("relocateReference")?.value?.trim();
  const notesExtra = document.getElementById("relocateNotes")?.value?.trim();
  const inventoryId = document.getElementById("relocateInventoryId")?.value?.trim() || "";
  const selected = relocateSelectedBalance();
  const qty = parseRelocateQty();

  if (!warehouse || !stockStatus || !fromLoc) {
    setOpsMessage(msgId, "Selecciona almacén, estatus y ubicación origen.", false);
    return;
  }
  if (!inventoryId) {
    setOpsMessage(msgId, "Selecciona un saldo real desde el buscador. No se reubica por texto de SKU.", false);
    return;
  }
  if (!toLoc) {
    setOpsMessage(msgId, "Selecciona la ubicación destino.", false);
    return;
  }
  if (fromLoc.toUpperCase() === toLoc.toUpperCase()) {
    setOpsMessage(msgId, "Origen y destino deben ser distintos.", false);
    return;
  }
  if (qty.empty) {
    setOpsMessage(msgId, "Indica la cantidad a reubicar.", false);
    return;
  }
  if (!qty.ok) {
    setOpsMessage(msgId, "La cantidad debe ser mayor que 0.", false);
    return;
  }
  const available = relocateAvailableQtyNumber();
  if (available == null || qty.value > available) {
    setOpsMessage(msgId, "La cantidad no puede superar la disponible no reservada.", false);
    return;
  }

  const confirmMsg = buildRelocateConfirmMessage({
    qty: qty.raw || qty.value,
    sku: selected.sku,
    productName: selected.productName,
    assignmentLabel: selected.assignmentLabel,
    assignmentType: selected.assignmentType,
    warehouse,
    fromLoc,
    toLoc,
    status: stockStatus,
    lotNumber: selected.lotNumber,
    layerCount: selected.layerCount,
    reference: referenceRaw || ""
  });
  if (typeof window !== "undefined" && window.confirm && !window.confirm(confirmMsg)) {
    syncRelocateSubmitEnabled();
    return;
  }
  if (selected.serialCount > 0) {
    setOpsMessage(
      msgId,
      "El saldo contiene series; requiere selección explícita de seriales. Esta reubicación no puede continuar.",
      false
    );
    syncRelocateSubmitEnabled();
    return;
  }

  if (btn) btn.disabled = true;
  try {
    const body = {
      inventoryId,
      allocationMode: "FIFO",
      destinationLocation: toLoc,
      quantity: qty.value,
      reference: referenceRaw || `RELOC-${Date.now()}`,
      notes: notesExtra || undefined
    };

    const response = await authenticatedFetch("/api/inventory/relocate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    if (!response) {
      setOpsMessage(msgId, "No se pudo reubicar. Verifica la sesión.", false);
      return;
    }
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      setOpsMessage(msgId, data.message || data.code || "No se pudo reubicar el inventario.", false);
      return;
    }
    setOpsMessage(msgId, `Reubicación OK. Movimiento ${data.id || ""} registrado.`, true);
    const qtyEl = document.getElementById("relocateQty");
    if (qtyEl) qtyEl.value = "";
    const notesEl = document.getElementById("relocateNotes");
    if (notesEl) notesEl.value = "";
    const refEl = document.getElementById("relocateReference");
    if (refEl) refEl.value = "";
    const skuEl = document.getElementById("relocateSku");
    clearRelocateBalanceFields(skuEl, { keepSkuText: false });
    hideRelocateSelectedCard();
    await loadStockStrip();
    await loadInventoryMovements();
    syncRelocateLocationSelects();
  } catch (_e) {
    setOpsMessage(msgId, "Error de red al reubicar.", false);
  } finally {
    syncRelocateSubmitEnabled();
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
    const response = await authenticatedFetch("/api/inventory/movements?limit=100");
    if (response?.ok) {
      const unwrapped = unwrapMovementPayload(await response.json());
      movementsRowsCache = unwrapped.items;
      if (!inventoryKpiCache) movementsCountCache = unwrapped.total;
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
    const response = await authenticatedFetch("/api/inventory/movements?limit=100");
    if (response?.ok) {
      const unwrapped = unwrapMovementPayload(await response.json());
      movementsRowsCache = unwrapped.items;
      if (!inventoryKpiCache) movementsCountCache = unwrapped.total;
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

function reqQtyNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function canSubmitRequisitionUi() {
  return currentRole === "ADMIN" || currentRole === "SUPERVISOR" || currentRole === "OPERATOR";
}

function canApproveRequisitionUi() {
  return currentRole === "ADMIN" || currentRole === "SUPERVISOR";
}

function canReserveRequisitionUi() {
  return currentRole === "ADMIN" || currentRole === "SUPERVISOR";
}

function canPickReservedUi() {
  return currentRole === "ADMIN" || currentRole === "SUPERVISOR" || currentRole === "OPERATOR";
}

function canCancelRequisitionUi() {
  return currentRole === "ADMIN" || currentRole === "SUPERVISOR";
}

function canShowRequisitionCancel(row) {
  return canCancelRequisitionUi() && (row?.status === "APPROVED" || row?.status === "IN_PROGRESS");
}

function lineReservableQty(line) {
  const pending = reqQtyNumber(line?.pendingQty);
  const reserved = reqQtyNumber(line?.reservedQty);
  return Math.max(0, pending - reserved);
}

function pickTaskIdFromRequisition(req) {
  const tasks = Array.isArray(req?.tasks) ? req.tasks : [];
  const openPick = tasks.find(
    (t) => t.type === "PICK" && t.status !== "CANCELLED" && t.status !== "COMPLETED" && t.status !== "REJECTED"
  );
  return openPick?.id || tasks.find((t) => t.type === "PICK")?.id || "";
}

function groupRequisitionLineCubes(line) {
  const groups = new Map();
  for (const reservation of Array.isArray(line?.reservations) ? line.reservations : []) {
    const activeQty = reqQtyNumber(reservation.activeQty);
    if (activeQty <= 0) continue;
    const inventoryId = reservation.inventoryId || "";
    if (!inventoryId) continue;
    if (!groups.has(inventoryId)) {
      groups.set(inventoryId, {
        inventoryId,
        location: reservation.location || "—",
        warehouse: reservation.warehouse || "",
        inventoryStatus: reservation.inventoryStatus || "",
        activeQty: 0,
        layerIds: new Set(),
        reservationCount: 0
      });
    }
    const group = groups.get(inventoryId);
    group.activeQty += activeQty;
    group.reservationCount += 1;
    if (reservation.inventoryLayerId) group.layerIds.add(reservation.inventoryLayerId);
  }
  return [...groups.values()].map((group) => ({
    inventoryId: group.inventoryId,
    location: group.location,
    warehouse: group.warehouse,
    inventoryStatus: group.inventoryStatus,
    activeQty: group.activeQty,
    reservationCount: group.reservationCount,
    layerCount: group.layerIds.size || group.reservationCount
  }));
}

function maxReservedPickQty(line, cube) {
  const pending = reqQtyNumber(line?.pendingQty);
  const active = reqQtyNumber(cube?.activeQty);
  const cap = Math.min(pending, active);
  return cap > 0 ? cap : 0;
}

function buildReservedFifoPickPayload(req, line, cube, qty, serialIds) {
  const sku = line?.product?.sku || "";
  /** @type {Record<string, unknown>} */
  const body = {
    code: sku,
    quantity: qty,
    requisitionLineId: line.id,
    inventoryId: cube.inventoryId,
    allocationMode: "FIFO"
  };
  const taskId = pickTaskIdFromRequisition(req);
  if (taskId) body.taskId = taskId;
  if (Array.isArray(serialIds) && serialIds.length) body.serialIds = serialIds.slice();
  return body;
}

function flattenEligiblePickSerials(plan) {
  const layers = Array.isArray(plan?.layers) ? plan.layers : [];
  /** @type {Array<{ id: string, serialNumber: string, imei: string | null, inventoryLayerId: string, lotNumber: string | null, receivedAt: string | null }>} */
  const rows = [];
  const seen = new Set();
  for (const layer of layers) {
    const serials = Array.isArray(layer?.serials) ? layer.serials : [];
    for (const serial of serials) {
      if (!serial?.id) continue;
      const id = String(serial.id);
      if (seen.has(id)) continue;
      seen.add(id);
      rows.push({
        id,
        serialNumber: String(serial.serialNumber || ""),
        imei: serial.imei ? String(serial.imei) : null,
        inventoryLayerId: String(layer.inventoryLayerId || ""),
        lotNumber: layer.lotNumber ? String(layer.lotNumber) : null,
        receivedAt: layer.receivedAt ? String(layer.receivedAt) : null
      });
    }
  }
  return rows;
}

function hideReqActionSerialField() {
  const field = document.getElementById("reqActionSerialField");
  if (field) field.classList.add("hidden");
  const scan = document.getElementById("reqActionSerialScan");
  if (scan) scan.value = "";
  const eligible = document.getElementById("reqActionSerialEligible");
  if (eligible) eligible.innerHTML = "";
  const selected = document.getElementById("reqActionSerialSelected");
  if (selected) selected.innerHTML = "";
  const counter = document.getElementById("reqActionSerialCounter");
  if (counter) counter.textContent = "0 de 0";
}

function reservedPickCurrentQty() {
  return reqQtyNumber(document.getElementById("reqActionQty")?.value);
}

function reservedPickPlanMatchesQty(plan, qty) {
  if (!plan || qty == null) return false;
  const planQty = Number(plan.quantity);
  return Number.isFinite(planQty) && planQty === Number(qty);
}

function reservedPickSerialNeeded() {
  if (reqActionContext?.mode !== "pick" || !reqActionContext?.serialPlan?.serialRequired) return 0;
  const qty = reservedPickCurrentQty();
  if (!reservedPickPlanMatchesQty(reqActionContext.serialPlan, qty)) return 0;
  return Number.isFinite(qty) && qty > 0 ? qty : 0;
}

function updateReservedPickConfirmState() {
  const btn = document.getElementById("reqActionConfirmBtn");
  if (!btn) return;
  if (reqActionContext?.mode !== "pick") {
    btn.disabled = Boolean(reqActionContext?.busy);
    return;
  }
  if (reqActionContext?.busy || reqActionContext?.serialLoading || reqActionContext?.serialError) {
    btn.disabled = true;
    return;
  }
  const qty = reservedPickCurrentQty();
  if (!(qty > 0) || !Number.isInteger(qty)) {
    btn.disabled = true;
    return;
  }
  const plan = reqActionContext?.serialPlan;
  if (!plan || !reservedPickPlanMatchesQty(plan, qty)) {
    btn.disabled = true;
    return;
  }
  if (!plan.serialRequired) {
    btn.disabled = false;
    return;
  }
  const selected = Array.isArray(reqActionContext?.selectedSerialIds) ? reqActionContext.selectedSerialIds.length : 0;
  btn.disabled = selected !== qty;
}

function formatEligibleSerialLabel(row) {
  const lot = row.lotNumber ? `Lote ${row.lotNumber}` : "Sin lote";
  const imei = row.imei ? ` · IMEI ${row.imei}` : "";
  return `${row.serialNumber}${imei} · ${lot}`;
}

function renderReservedPickSerialUi() {
  const needed = reservedPickSerialNeeded();
  const selectedIds = Array.isArray(reqActionContext?.selectedSerialIds) ? reqActionContext.selectedSerialIds : [];
  const counter = document.getElementById("reqActionSerialCounter");
  if (counter) counter.textContent = `${selectedIds.length} de ${needed || 0}`;
  const eligibleEl = document.getElementById("reqActionSerialEligible");
  const selectedEl = document.getElementById("reqActionSerialSelected");
  const rows = flattenEligiblePickSerials(reqActionContext?.serialPlan);
  const selectedSet = new Set(selectedIds);
  if (selectedEl) {
    const selectedRows = selectedIds
      .map((id) => rows.find((row) => row.id === id))
      .filter(Boolean);
    selectedEl.innerHTML = selectedRows
      .map(
        (row) =>
          `<li><span>${escCell(formatEligibleSerialLabel(row))}</span><button type="button" class="btn-secondary" data-remove-serial="${escCell(row.id)}">Quitar</button></li>`
      )
      .join("");
  }
  if (eligibleEl) {
    eligibleEl.innerHTML = rows
      .map((row) => {
        const taken = selectedSet.has(row.id);
        return `<li><span>${escCell(formatEligibleSerialLabel(row))}</span><button type="button" class="btn-secondary" data-add-serial="${escCell(row.id)}" ${taken ? "disabled" : ""}>${taken ? "Seleccionada" : "Elegir"}</button></li>`;
      })
      .join("");
  }
  updateReservedPickConfirmState();
}

function addReservedPickSerialId(id) {
  const serialId = String(id || "").trim();
  if (!serialId || !reqActionContext) return { ok: false, message: "Serie no válida." };
  const rows = flattenEligiblePickSerials(reqActionContext.serialPlan);
  if (!rows.some((row) => row.id === serialId)) {
    return { ok: false, message: "La serie no pertenece a las capas FIFO de este cubo." };
  }
  const selected = Array.isArray(reqActionContext.selectedSerialIds) ? reqActionContext.selectedSerialIds : [];
  if (selected.includes(serialId)) {
    return { ok: false, message: "La serie ya está seleccionada." };
  }
  const needed = reservedPickSerialNeeded();
  if (needed && selected.length >= needed) {
    return { ok: false, message: "Ya seleccionaste las series requeridas." };
  }
  reqActionContext.selectedSerialIds = [...selected, serialId];
  renderReservedPickSerialUi();
  return { ok: true };
}

function addReservedPickSerialFromScan(raw) {
  const token = String(raw || "").trim();
  if (!token) return { ok: false, message: "Indica una serie o IMEI." };
  const rows = flattenEligiblePickSerials(reqActionContext?.serialPlan);
  const upper = token.toUpperCase();
  const match = rows.find(
    (row) =>
      String(row.serialNumber || "").toUpperCase() === upper || String(row.imei || "").toUpperCase() === upper
  );
  if (!match) {
    return { ok: false, message: "La serie o IMEI no pertenece a las capas FIFO de este cubo." };
  }
  return addReservedPickSerialId(match.id);
}

function removeReservedPickSerialId(id) {
  if (!reqActionContext) return;
  const serialId = String(id || "").trim();
  reqActionContext.selectedSerialIds = (reqActionContext.selectedSerialIds || []).filter((row) => row !== serialId);
  renderReservedPickSerialUi();
}

async function refreshReservedPickEligibleSerials() {
  if (reqActionContext?.mode !== "pick") return;
  const req = reqActionContext.requisition;
  const line = reqActionContext.line;
  const cube = reqActionContext.cube;
  if (!req?.id || !line?.id || !cube?.inventoryId) return;
  const qty = reservedPickCurrentQty();
  reqActionContext.selectedSerialIds = [];
  reqActionContext.serialPlan = null;
  reqActionContext.serialError = false;
  reqActionContext.serialLoading = true;
  reqActionContext.serialFetchGen = (reqActionContext.serialFetchGen || 0) + 1;
  const gen = reqActionContext.serialFetchGen;
  updateReservedPickConfirmState();
  if (!(qty > 0) || !Number.isInteger(qty)) {
    reqActionContext.serialLoading = false;
    hideReqActionSerialField();
    updateReservedPickConfirmState();
    return;
  }
  const response = await authenticatedFetch(
    `/api/picking/requisitions/${encodeURIComponent(req.id)}/lines/${encodeURIComponent(line.id)}/eligible-serials?inventoryId=${encodeURIComponent(cube.inventoryId)}&quantity=${encodeURIComponent(String(qty))}`
  );
  if (!reqActionContext || reqActionContext.serialFetchGen !== gen) return;
  const data = response ? await response.json().catch(() => ({})) : {};
  if (!reqActionContext || reqActionContext.serialFetchGen !== gen) return;
  if (!response?.ok) {
    reqActionContext.serialPlan = null;
    reqActionContext.serialLoading = false;
    reqActionContext.serialError = true;
    hideReqActionSerialField();
    setReqActionMessage(data.message || data.code || "No se pudieron cargar las series elegibles.", false);
    updateReservedPickConfirmState();
    return;
  }
  reqActionContext.serialLoading = false;
  reqActionContext.serialError = false;
  reqActionContext.serialPlan = data;
  if (!reservedPickPlanMatchesQty(data, qty)) {
    reqActionContext.serialPlan = null;
    reqActionContext.serialError = true;
    hideReqActionSerialField();
    updateReservedPickConfirmState();
    return;
  }
  if (!data.serialRequired) {
    hideReqActionSerialField();
    updateReservedPickConfirmState();
    return;
  }
  const field = document.getElementById("reqActionSerialField");
  if (field) field.classList.remove("hidden");
  renderReservedPickSerialUi();
}

function buildReservedFifoConfirmMessage(req, line, cube, qty) {
  const sku = line?.product?.sku || "SKU";
  const product = line?.product?.name || "—";
  const project = req?.project ? `${req.project.name} (${req.project.code})` : "—";
  const layers = cube?.layerCount || cube?.reservationCount || 1;
  const statusLabel =
    typeof formatInventoryStatus === "function"
      ? formatInventoryStatus(cube?.inventoryStatus) || cube?.inventoryStatus || "—"
      : cube?.inventoryStatus || "—";
  return [
    `Folio: ${req?.number || "—"}`,
    `Proyecto: ${project}`,
    `SKU/producto: ${sku} · ${product}`,
    `Ubicación: ${cube?.location || "—"}`,
    `Cantidad: ${formatQty(qty)}`,
    `Estatus: ${statusLabel}`,
    `Picking FIFO sobre ${layers} reservas/capas`
  ].join("\n");
}

function setPickRequisitionMessage(message, ok) {
  const box = document.getElementById("pickRequisitionMeta");
  if (!box) return;
  const existing = box.querySelector("[data-pick-req-msg]");
  if (existing) existing.remove();
  if (!message) return;
  const note = document.createElement("p");
  note.dataset.pickReqMsg = "1";
  note.className = ok ? "inline-ok" : "inline-error";
  note.textContent = message;
  box.appendChild(note);
}

async function fetchRequisitionById(id) {
  if (!id) return null;
  const response = await authenticatedFetch(`/api/requisitions/${encodeURIComponent(id)}`, { cache: "no-store" });
  if (!response?.ok) return null;
  return response.json();
}

async function refreshRequisitionViews(reqId) {
  if (reqId) {
    const fresh = await fetchRequisitionById(reqId);
    if (fresh) renderRequisitionDetail(fresh);
  }
  await loadRequisitionsList();
  await loadTasks();
  await loadStockStrip();
  await loadInventoryMovements();
  if (typeof loadTraceability === "function") await loadTraceability();
  if (typeof loadScanEvents === "function") await loadScanEvents();
}

function setReqActionMessage(text, ok) {
  const el = document.getElementById("reqActionMessage");
  if (!el) return;
  el.textContent = text || "";
  el.classList.remove("ok", "error");
  if (text) el.classList.add(ok ? "ok" : "error");
}

function hideReqActionCandidateFields() {
  const invField = document.getElementById("reqActionInventoryField");
  const layerField = document.getElementById("reqActionLayerField");
  const invSel = document.getElementById("reqActionInventoryId");
  const layerSel = document.getElementById("reqActionLayerId");
  if (invField) invField.classList.add("hidden");
  if (layerField) layerField.classList.add("hidden");
  if (invSel) invSel.innerHTML = '<option value="">— Seleccionar —</option>';
  if (layerSel) layerSel.innerHTML = '<option value="">— Seleccionar —</option>';
}

function formatReserveCubeLabel(cube) {
  const layers = Number(cube?.layerCount) || 0;
  const layerText = layers === 1 ? "1 capa interna" : `${layers} capas internas`;
  return `${cube?.location || "—"} · ${cube?.status || ""} · Física ${formatQty(cube?.qty)} · Reservada ${formatQty(cube?.reservedQty)} · Disponible ${formatQty(cube?.freeQty ?? cube?.unreservedQty)} · ${layerText}`;
}

function fillReserveCubeSelect(cubes) {
  const invField = document.getElementById("reqActionInventoryField");
  const layerField = document.getElementById("reqActionLayerField");
  const invSel = document.getElementById("reqActionInventoryId");
  if (layerField) layerField.classList.add("hidden");
  const list = Array.isArray(cubes) ? cubes : [];
  if (!invSel) return;
  invSel.innerHTML =
    '<option value="">— Seleccionar cubo —</option>' +
    list
      .map((cube) => `<option value="${escCell(cube.inventoryId)}">${escCell(formatReserveCubeLabel(cube))}</option>`)
      .join("");
  if (invField) {
    if (list.length) invField.classList.remove("hidden");
    else invField.classList.add("hidden");
  }
  if (list.length === 1) invSel.value = list[0].inventoryId;
}

function showReqAmbiguity(data) {
  const code = data?.code;
  const details = data?.details || {};
  if (code === "AMBIGUOUS_STOCK") {
    const candidates = Array.isArray(details.candidates) ? details.candidates : [];
    setReqActionMessage("Hay varias ubicaciones disponibles. Debes elegir un cubo de inventario.", false);
    fillReserveCubeSelect(candidates);
    return;
  }
  if (code === "AMBIGUOUS_LAYER") {
    setReqActionMessage("Hay varias capas libres. La reserva canónica usa FIFO por cubo; no se selecciona capa.", false);
  }
}

/** @type {{ mode: string, requisition: object, line?: object, reservation?: object } | null} */
let reqActionContext = null;

function fillReqActionSummary(rows) {
  const wrap = document.getElementById("reqActionSummary");
  if (!wrap) return;
  wrap.innerHTML = rows
    .map(
      (row) =>
        `<div class="detail-field"><label>${escCell(row.label)}</label><span>${escCell(row.value ?? "—")}</span></div>`
    )
    .join("");
}

function openReqActionModal() {
  openModal("reqActionModal");
}

function closeReqActionModal() {
  if (reqActionContext) {
    reqActionContext.serialFetchGen = (reqActionContext.serialFetchGen || 0) + 1;
    reqActionContext.serialLoading = false;
    reqActionContext.serialPlan = null;
  }
  closeModal("reqActionModal");
  reqActionContext = null;
  setReqActionMessage("", true);
  hideReqActionCandidateFields();
  hideReqActionSerialField();
}

function openReserveModal(req, line) {
  if (!canReserveRequisitionUi()) return;
  const sku = line.product?.sku || line.productId || "SKU";
  const pending = reqQtyNumber(line.pendingQty);
  const reserved = reqQtyNumber(line.reservedQty);
  const cubes = Array.isArray(line.reserveCubes) ? line.reserveCubes : [];
  const selectedFree = cubes.length === 1 ? reqQtyNumber(cubes[0].freeQty ?? cubes[0].unreservedQty) : 0;
  const projectAvailable = reqQtyNumber(line.stock?.projectAvailable);
  const reservable = lineReservableQty(line);
  const cubeCap = selectedFree > 0 ? selectedFree : projectAvailable;
  const defaultQty = Math.min(reservable, cubeCap > 0 ? cubeCap : reservable);
  reqActionContext = { mode: "reserve", requisition: req, line };
  const title = document.getElementById("reqActionTitle");
  if (title) title.textContent = "Reservar inventario";
  const qtyLabel = document.getElementById("reqActionQtyLabel");
  if (qtyLabel) qtyLabel.textContent = "Cantidad a reservar";
  fillReqActionSummary([
    { label: "SKU", value: sku },
    { label: "Producto", value: line.product?.name || "—" },
    { label: "Proyecto", value: req.project ? `${req.project.name} (${req.project.code})` : "—" },
    { label: "Solicitado", value: formatQty(line.requestedQty) },
    { label: "Reservado actual", value: formatQty(reserved) },
    { label: "Surtido", value: formatQty(line.fulfilledQty) },
    { label: "Pendiente", value: formatQty(pending) },
    { label: "Disponible en proyecto", value: formatQty(projectAvailable) }
  ]);
  hideReqActionCandidateFields();
  hideReqActionSerialField();
  fillReserveCubeSelect(cubes);
  const qtyEl = document.getElementById("reqActionQty");
  if (qtyEl) qtyEl.value = defaultQty > 0 ? String(defaultQty) : "";
  setReqActionMessage("", true);
  openReqActionModal();
}

function openReservedPickModal(req, line, cube) {
  if (!canPickReservedUi()) return;
  const sku = line.product?.sku || line.productId || "SKU";
  const maxQty = maxReservedPickQty(line, cube);
  reqActionContext = { mode: "pick", requisition: req, line, cube };
  const title = document.getElementById("reqActionTitle");
  if (title) title.textContent = "Surtir reservado";
  const qtyLabel = document.getElementById("reqActionQtyLabel");
  if (qtyLabel) qtyLabel.textContent = `Cantidad a surtir (máximo ${formatQty(maxQty)})`;
  fillReqActionSummary([
    { label: "SKU", value: sku },
    { label: "Producto", value: line.product?.name || "—" },
    { label: "Proyecto", value: req.project ? `${req.project.name} (${req.project.code})` : "—" },
    { label: "Ubicación", value: cube.location || "—" },
    { label: "Estatus", value: cube.inventoryStatus || "—" },
    { label: "Reservado activo del cubo", value: formatQty(cube.activeQty) },
    { label: "Capas internas", value: String(cube.layerCount || cube.reservationCount || 0) },
    { label: "Pendiente de la línea", value: formatQty(line.pendingQty) }
  ]);
  hideReqActionCandidateFields();
  hideReqActionSerialField();
  const qtyEl = document.getElementById("reqActionQty");
  if (qtyEl) qtyEl.value = maxQty > 0 ? String(maxQty) : "";
  reqActionContext.selectedSerialIds = [];
  reqActionContext.serialPlan = null;
  reqActionContext.serialError = false;
  reqActionContext.serialLoading = true;
  reqActionContext.serialFetchGen = (reqActionContext.serialFetchGen || 0) + 1;
  setReqActionMessage("", true);
  openReqActionModal();
  updateReservedPickConfirmState();
  void refreshReservedPickEligibleSerials();
}

async function confirmReqActionModal() {
  if (!reqActionContext) return;
  const qty = reqQtyNumber(document.getElementById("reqActionQty")?.value);
  if (!(qty > 0)) {
    setReqActionMessage("Indica una cantidad mayor a 0.", false);
    return;
  }
  const btn = document.getElementById("reqActionConfirmBtn");
  if (btn) btn.disabled = true;
  if (reqActionContext) reqActionContext.busy = true;
  try {
    if (reqActionContext.mode === "reserve") {
      await confirmReserveFromModal(qty);
    } else if (reqActionContext.mode === "pick") {
      await confirmReservedPickFromModal(qty);
    }
  } finally {
    if (reqActionContext) reqActionContext.busy = false;
    updateReservedPickConfirmState();
  }
}

async function confirmReserveFromModal(qty) {
  const req = reqActionContext?.requisition;
  const line = reqActionContext?.line;
  if (!req?.id || !line?.id) return;
  const inventoryId = document.getElementById("reqActionInventoryId")?.value?.trim();
  const invField = document.getElementById("reqActionInventoryField");
  if (invField && !invField.classList.contains("hidden") && !inventoryId) {
    setReqActionMessage("Hay varias ubicaciones disponibles. Debes elegir un cubo de inventario.", false);
    return;
  }
  const selectedCube = (Array.isArray(line.reserveCubes) ? line.reserveCubes : []).find(
    (cube) => cube.inventoryId === inventoryId
  );
  const cubeFree = reqQtyNumber(selectedCube?.freeQty ?? selectedCube?.unreservedQty);
  if (selectedCube && qty > cubeFree) {
    setReqActionMessage(`La cantidad no puede superar el disponible del cubo (${formatQty(cubeFree)}).`, false);
    return;
  }
  /** @type {Record<string, unknown>} */
  const body = { quantity: qty, allocationMode: "FIFO" };
  if (inventoryId) body.inventoryId = inventoryId;
  const response = await authenticatedFetch(
    `/api/requisitions/${encodeURIComponent(req.id)}/lines/${encodeURIComponent(line.id)}/reservations`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    }
  );
  const data = response ? await response.json().catch(() => ({})) : {};
  if (!response) {
    setReqActionMessage("No se pudo reservar.", false);
    return;
  }
  if (!response.ok) {
    if (data.code === "AMBIGUOUS_STOCK" || data.code === "AMBIGUOUS_LAYER") {
      showReqAmbiguity(data);
      return;
    }
    setReqActionMessage(data.message || data.code || "No se pudo reservar.", false);
    return;
  }
  closeReqActionModal();
  setOpsMessage("reqMessage", "Reserva registrada. El stock queda apartado; todavía no sale de bodega.", true);
  await refreshRequisitionViews(req.id);
}

async function executeReservedFifoPick(req, line, cube, qty, serialIds) {
  const sku = line?.product?.sku || "";
  if (!sku) return { ok: false, cancelled: false, message: "La línea no tiene SKU." };
  if (!window.confirm(buildReservedFifoConfirmMessage(req, line, cube, qty))) {
    return { ok: false, cancelled: true };
  }
  const response = await authenticatedFetch("/api/picking/scan", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(buildReservedFifoPickPayload(req, line, cube, qty, serialIds))
  });
  const data = response ? await response.json().catch(() => ({})) : {};
  if (!response) return { ok: false, cancelled: false, message: "No se pudo surtir la reserva." };
  if (!response.ok) {
    return { ok: false, cancelled: false, message: data.message || data.code || "No se pudo surtir la reserva." };
  }
  return { ok: true, cancelled: false, data };
}

async function confirmReservedPickFromModal(qty) {
  const req = reqActionContext?.requisition;
  const line = reqActionContext?.line;
  const cube = reqActionContext?.cube;
  if (!req?.id || !line?.id || !cube?.inventoryId) return;
  const maxQty = maxReservedPickQty(line, cube);
  if (qty > maxQty) {
    setReqActionMessage(
      `La cantidad no puede superar el menor entre reservado activo y pendiente (${formatQty(maxQty)}).`,
      false
    );
    return;
  }
  const needed = reservedPickSerialNeeded();
  const serialIds = Array.isArray(reqActionContext?.selectedSerialIds) ? reqActionContext.selectedSerialIds.slice() : [];
  if (reqActionContext?.serialLoading || reqActionContext?.serialError) {
    setReqActionMessage("Espera a que se carguen las series elegibles o corrige el error.", false);
    return;
  }
  if (!(qty > 0) || !Number.isInteger(qty)) {
    setReqActionMessage("La cantidad a surtir debe ser un entero positivo.", false);
    return;
  }
  const plan = reqActionContext?.serialPlan;
  if (!plan || !reservedPickPlanMatchesQty(plan, qty)) {
    setReqActionMessage("La cantidad cambió. Vuelve a consultar las series elegibles.", false);
    return;
  }
  if (plan.serialRequired && serialIds.length !== qty) {
    setReqActionMessage(`Debes seleccionar ${qty} series para surtir.`, false);
    return;
  }
  const result = await executeReservedFifoPick(req, line, cube, qty, plan.serialRequired ? serialIds : undefined);
  if (result.cancelled) return;
  if (!result.ok) {
    setReqActionMessage(result.message || "No se pudo surtir la reserva.", false);
    return;
  }
  closeReqActionModal();
  setOpsMessage("reqMessage", "Picking FIFO reservado. Se descontó stock de las reservas, no del saldo libre.", true);
  await refreshRequisitionViews(req.id);
  if (typeof loadPickRequisitions === "function") await loadPickRequisitions();
}

function wireReqActionModal() {
  const confirmBtn = document.getElementById("reqActionConfirmBtn");
  const cancelBtn = document.getElementById("reqActionCancelBtn");
  const qtyEl = document.getElementById("reqActionQty");
  const scanEl = document.getElementById("reqActionSerialScan");
  const selectedEl = document.getElementById("reqActionSerialSelected");
  const eligibleEl = document.getElementById("reqActionSerialEligible");
  if (confirmBtn && confirmBtn.dataset.reqWired !== "1") {
    confirmBtn.dataset.reqWired = "1";
    confirmBtn.addEventListener("click", () => void confirmReqActionModal());
  }
  if (cancelBtn && cancelBtn.dataset.reqWired !== "1") {
    cancelBtn.dataset.reqWired = "1";
    cancelBtn.addEventListener("click", () => closeReqActionModal());
  }
  if (qtyEl && qtyEl.dataset.reqSerialWired !== "1") {
    qtyEl.dataset.reqSerialWired = "1";
    qtyEl.addEventListener("input", () => {
      if (reqActionContext?.mode !== "pick") return;
      void refreshReservedPickEligibleSerials();
    });
  }
  if (scanEl && scanEl.dataset.reqSerialWired !== "1") {
    scanEl.dataset.reqSerialWired = "1";
    scanEl.addEventListener("keydown", (event) => {
      if (event.key !== "Enter") return;
      event.preventDefault();
      const result = addReservedPickSerialFromScan(scanEl.value);
      if (!result.ok) {
        setReqActionMessage(result.message || "No se pudo agregar la serie.", false);
        return;
      }
      scanEl.value = "";
      setReqActionMessage("", true);
    });
  }
  if (selectedEl && selectedEl.dataset.reqSerialWired !== "1") {
    selectedEl.dataset.reqSerialWired = "1";
    selectedEl.addEventListener("click", (event) => {
      const btn = event.target?.closest?.("[data-remove-serial]");
      if (!btn) return;
      removeReservedPickSerialId(btn.getAttribute("data-remove-serial"));
    });
  }
  if (eligibleEl && eligibleEl.dataset.reqSerialWired !== "1") {
    eligibleEl.dataset.reqSerialWired = "1";
    eligibleEl.addEventListener("click", (event) => {
      const btn = event.target?.closest?.("[data-add-serial]");
      if (!btn) return;
      const result = addReservedPickSerialId(btn.getAttribute("data-add-serial"));
      if (!result.ok) setReqActionMessage(result.message || "No se pudo agregar la serie.", false);
      else setReqActionMessage("", true);
    });
  }
}

async function loadPickRequisitions() {
  const select = document.getElementById("pickRequisitionSelect");
  if (!select) return;
  const previous = select.value;
  try {
    const response = await authenticatedFetch("/api/requisitions");
    const rows = response?.ok ? await response.json().catch(() => []) : [];
    const open = (Array.isArray(rows) ? rows : []).filter(
      (row) => row.status === "APPROVED" || row.status === "IN_PROGRESS"
    );
    select.innerHTML = "";
    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = "— Selecciona una requisición aprobada o en progreso —";
    select.appendChild(placeholder);
    for (const row of open) {
      const option = document.createElement("option");
      option.value = row.id;
      const project = row.project ? `${row.project.code}` : "";
      option.textContent = `${row.number || row.id}${project ? ` · ${project}` : ""} · ${row.status}`;
      select.appendChild(option);
    }
    if (previous && open.some((row) => row.id === previous)) {
      select.value = previous;
      await renderPickRequisitionMode(previous);
    } else {
      select.value = "";
      await renderPickRequisitionMode("");
    }
  } catch (_error) {
    select.innerHTML = '<option value="">— No se pudieron cargar requisiciones —</option>';
  }
}

async function renderPickRequisitionMode(requisitionId) {
  const meta = document.getElementById("pickRequisitionMeta");
  const cubesBox = document.getElementById("pickRequisitionCubes");
  if (meta) meta.innerHTML = "";
  if (cubesBox) cubesBox.innerHTML = "";
  if (!requisitionId) {
    if (meta) meta.textContent = "Selecciona un folio para ver líneas y cubos reservados.";
    return;
  }
  const req = await fetchRequisitionById(requisitionId);
  if (!req) {
    if (meta) meta.textContent = "No se pudo cargar la requisición.";
    return;
  }
  const taskId = pickTaskIdFromRequisition(req);
  const task = (Array.isArray(req.tasks) ? req.tasks : []).find((row) => row.id === taskId);
  if (meta) {
    const summary = document.createElement("p");
    summary.className = "pick-req-meta";
    summary.textContent = `Folio ${req.number || "—"} · Proyecto ${
      req.project ? `${req.project.name} (${req.project.code})` : "—"
    } · Tarea ${task ? `${task.type} ${task.status}` : "sin PICK abierta"}`;
    meta.appendChild(summary);
  }
  if (!cubesBox) return;
  const lines = Array.isArray(req.lines) ? req.lines : [];
  let cards = 0;
  for (const line of lines) {
    const cubes = groupRequisitionLineCubes(line);
    for (const cube of cubes) {
      cards += 1;
      const maxQty = maxReservedPickQty(line, cube);
      const sku = line.product?.sku || "SKU";
      const card = document.createElement("div");
      card.className = "pick-req-cube";
      card.dataset.lineId = line.id;
      card.dataset.inventoryId = cube.inventoryId;
      const title = document.createElement("strong");
      title.textContent = `${sku} · ${line.product?.name || "producto"}`;
      const details = document.createElement("p");
      details.className = "pick-req-meta";
      details.textContent =
        `Ubicación ${cube.location || "—"} · ${cube.inventoryStatus || "—"} · solicitado ${formatQty(line.requestedQty)} · ` +
        `surtido ${formatQty(line.fulfilledQty)} · pendiente ${formatQty(line.pendingQty)} · ` +
        `reservado activo ${formatQty(cube.activeQty)} · ${cube.layerCount} capa(s) interna(s)`;
      const actions = document.createElement("div");
      actions.className = "pick-req-actions";
      const qtyInput = document.createElement("input");
      qtyInput.type = "number";
      qtyInput.min = "0.0001";
      qtyInput.step = "0.0001";
      qtyInput.value = maxQty > 0 ? String(maxQty) : "";
      qtyInput.setAttribute("aria-label", `Cantidad a surtir ${sku}`);
      const button = document.createElement("button");
      button.type = "button";
      button.className = "btn-primary btn-compact";
      button.textContent = "Surtir reservado";
      button.addEventListener("click", () => {
        void (async () => {
          const qty = reqQtyNumber(qtyInput.value);
          if (!(qty > 0) || qty > maxQty) {
            setPickRequisitionMessage(
              `Indica una cantidad mayor a 0 y no mayor a ${formatQty(maxQty)}.`,
              false
            );
            return;
          }
          const result = await executeReservedFifoPick(req, line, cube, qty);
          if (result.cancelled) return;
          if (!result.ok) {
            setPickRequisitionMessage(result.message || "No se pudo surtir la reserva.", false);
            return;
          }
          setPickRequisitionMessage("Picking FIFO registrado.", true);
          await loadPickRequisitions();
          await refreshRequisitionViews(req.id);
        })();
      });
      actions.appendChild(qtyInput);
      actions.appendChild(button);
      card.appendChild(title);
      card.appendChild(details);
      card.appendChild(actions);
      cubesBox.appendChild(card);
    }
  }
  if (!cards && meta) {
    const empty = document.createElement("p");
    empty.className = "pick-req-meta";
    empty.textContent = "Esta requisición no tiene reservas activas para surtir.";
    meta.appendChild(empty);
  }
}

function wirePickRequisitionMode() {
  const select = document.getElementById("pickRequisitionSelect");
  if (select && select.dataset.pickReqWired !== "1") {
    select.dataset.pickReqWired = "1";
    select.addEventListener("change", () => {
      void renderPickRequisitionMode(select.value);
    });
  }
}

function renderRequisitionDetail(row) {
  if (!row) return;
  const projectLabel = row.project ? `${row.project.name} (${row.project.code})` : "—";
  const fields = [
    { label: "Folio", value: row.number || "—" },
    { label: "Proyecto", value: projectLabel },
    { label: "Cliente", value: canonicalClientDisplay(row) },
    { label: "Estado", value: row.status || "—" },
    { label: "Prioridad", value: row.priorityLabel || row.priority || "—" },
    { label: "Estado de surtido", value: row.fulfillmentStatus || "—" }
  ];
  const lines = Array.isArray(row.lines) ? row.lines : [];
  for (const line of lines) {
    const sku = line.product?.sku || line.productId || "SKU";
    fields.push({ label: `${sku} · Producto`, value: line.product?.name || "—" });
    fields.push({ label: `${sku} · Solicitado`, value: formatQty(line.requestedQty) });
    fields.push({ label: `${sku} · Reservado`, value: formatQty(line.reservedQty) });
    fields.push({ label: `${sku} · Surtido`, value: formatQty(line.fulfilledQty) });
    fields.push({ label: `${sku} · Pendiente`, value: formatQty(line.pendingQty) });
    fields.push({
      label: `${sku} · Disponible en este proyecto`,
      value: formatQty(line.stock?.projectAvailable)
    });
    fields.push({
      label: `${sku} · FREE TO SALE`,
      value: `${formatQty(line.stock?.freeToSaleAvailable)} — informativo; requiere reasignación para usarse`
    });
    fields.push({
      label: `${sku} · Otros proyectos`,
      value: `${formatQty(line.stock?.otherProjectsAvailable)} — informativo; requiere reasignación para usarse`
    });
    const reservations = Array.isArray(line.reservations) ? line.reservations : [];
    const cubes = groupRequisitionLineCubes(line);
    for (const cube of cubes) {
      fields.push({
        label: `${sku} · Cubo reservado`,
        value: `${cube.location || "—"} · ${cube.inventoryStatus || "—"} · activo ${formatQty(cube.activeQty)} · ${cube.layerCount} capa(s) · inventario ${cube.inventoryId}`
      });
    }
    for (const reservation of reservations) {
      const activeQty = reqQtyNumber(reservation.activeQty);
      if (activeQty <= 0) continue;
      fields.push({
        label: `${sku} · Reserva activa`,
        value: `Inventario ${reservation.inventoryId || "—"} · capa ${reservation.inventoryLayerId || "—"} · lote ${reservation.lotNumber || "sin lote"} · reservado ${formatQty(reservation.qty)} · consumido ${formatQty(reservation.consumedQty)} · activo ${formatQty(activeQty)}`
      });
    }
  }

  const closed = ["COMPLETED", "CANCELLED", "REJECTED"].includes(row.status);
  /** @type {{ id: string, label: string, className?: string, onClick: () => void }[]} */
  const actions = [];
  if (!closed && row.status === "DRAFT" && canSubmitRequisitionUi()) {
    actions.push({
      id: "submit",
      label: "Enviar requisición",
      className: "btn-primary",
      onClick: () => void submitRequisitionFromDetail(row)
    });
  }
  if (!closed && row.status === "SUBMITTED" && canApproveRequisitionUi()) {
    actions.push({
      id: "approve",
      label: "Aprobar requisición",
      className: "btn-primary",
      onClick: () => void approveRequisitionFromDetail(row)
    });
  }
  if (!closed && (row.status === "APPROVED" || row.status === "IN_PROGRESS") && canReserveRequisitionUi()) {
    for (const line of lines) {
      if (lineReservableQty(line) <= 0) continue;
      const sku = line.product?.sku || "SKU";
      actions.push({
        id: `reserve-${line.id}`,
        label: lines.length === 1 ? "Reservar" : `Reservar ${sku}`,
        className: "btn-primary",
        onClick: () => openReserveModal(row, line)
      });
    }
  }
  if (!closed && (row.status === "APPROVED" || row.status === "IN_PROGRESS") && canPickReservedUi()) {
    for (const line of lines) {
      const sku = line.product?.sku || "SKU";
      const cubes = groupRequisitionLineCubes(line);
      for (const cube of cubes) {
        actions.push({
          id: `pick-${line.id}-${cube.inventoryId}`,
          label: `Surtir reservado${lines.length > 1 ? ` · ${sku}` : ""}${cubes.length > 1 ? ` · ${cube.location}` : ""}`,
          className: "btn-primary",
          onClick: () => openReservedPickModal(row, line, cube)
        });
      }
    }
  }
  if (canShowRequisitionCancel(row)) {
    actions.push({
      id: "cancel-requisition",
      label: "Cancelar requisición",
      className: "btn-danger",
      onClick: () => void cancelRequisitionFromDetail(row)
    });
  }
  openDetailDrawer(`Requisición ${row.number || ""}`, fields, actions);
}

async function openRequisitionDetail(row) {
  if (!row) return;
  if (row.id) {
    const fresh = await fetchRequisitionById(row.id);
    if (fresh) {
      renderRequisitionDetail(fresh);
      return;
    }
  }
  renderRequisitionDetail(row);
}

async function submitRequisitionFromDetail(row) {
  if (!row?.id || !canSubmitRequisitionUi()) return;
  if (!window.confirm(`¿Enviar requisición ${row.number || ""} para aprobación?`)) return;
  const response = await authenticatedFetch(`/api/requisitions/${encodeURIComponent(row.id)}/submit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({})
  });
  const data = response ? await response.json().catch(() => ({})) : {};
  if (!response?.ok) {
    setOpsMessage("reqMessage", data.message || "No se pudo enviar la requisición.", false);
    return;
  }
  setOpsMessage("reqMessage", "Requisición enviada para aprobación.", true);
  await refreshRequisitionViews(row.id);
}

async function approveRequisitionFromDetail(row) {
  if (!row?.id || !canApproveRequisitionUi()) return;
  if (!window.confirm(`¿Aprobar requisición ${row.number || ""}?`)) return;
  const response = await authenticatedFetch(`/api/requisitions/${encodeURIComponent(row.id)}/approve`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({})
  });
  const data = response ? await response.json().catch(() => ({})) : {};
  if (!response?.ok) {
    setOpsMessage("reqMessage", data.message || "No se pudo aprobar la requisición.", false);
    return;
  }
  setOpsMessage("reqMessage", "Requisición aprobada. Ya puede reservarse inventario.", true);
  await refreshRequisitionViews(row.id);
}

async function cancelRequisitionFromDetail(row) {
  if (!row?.id || !canShowRequisitionCancel(row)) return;
  const folio = String(row.number || "").trim() || row.id;
  if (
    !window.confirm(
      `Cancelar requisición ${folio}?\nSe liberarán las reservas. El inventario físico no será eliminado.`
    )
  ) {
    return;
  }
  const response = await authenticatedFetch(`/api/requisitions/${encodeURIComponent(row.id)}/cancel`, {
    method: "POST"
  });
  const data = response ? await response.json().catch(() => ({})) : {};
  if (!response?.ok) {
    setOpsMessage("reqMessage", data.message || "No se pudo cancelar la requisición.", false);
    return;
  }
  setOpsMessage("reqMessage", `Requisición ${folio} cancelada. Las reservas fueron liberadas.`, true);
  if (data && data.id) renderRequisitionDetail(data);
  await refreshRequisitionViews(row.id);
}

async function loadRequisitionsList() {
  const container = document.getElementById("requisitionsList");
  if (!container) return;
  try {
    const response = await authenticatedFetch("/api/requisitions");
    if (!response?.ok) {
      container.innerHTML = '<div class="data-grid-empty" style="padding:16px">No se pudieron cargar requisiciones.</div>';
      return;
    }
    const rows = filterRowsByAviatProject(await response.json());
    const meta = document.getElementById("reqTableMeta");
    if (meta) meta.textContent = `${rows.length} requisición(es)`;
    renderExcelTable(container, {
      gridId: "requisitions",
      columns: REQ_COLUMNS,
      rows,
      emptyMessage: "Sin registros operativos aún",
      onRowSelect: openRequisitionDetail
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
  const warehouse = document.getElementById("reqWarehouse")?.value?.trim() || "TULTITLAN24";
  const extraNotes = document.getElementById("reqNotes")?.value?.trim();
  const priority = Number(document.getElementById("reqPriority")?.value || 50);

  if (!reference) {
    setOpsMessage("reqMessage", "Indique folio o referencia.", false);
    return;
  }
  if (!customerCode) {
    setOpsMessage("reqMessage", "Seleccione un proyecto.", false);
    return;
  }

  /** @type {{ sku: string, requestedQty: number, lotNumber?: string }[]} */
  let lines = [];
  if (reqOrderMode === "bulk") {
    const lineNodes = document.querySelectorAll("#reqBulkLines .req-bulk-line");
    lineNodes.forEach((node) => {
      const sku = node.querySelector("[data-req-line-sku]")?.value?.trim();
      const qty = Number(node.querySelector("[data-req-line-qty]")?.value);
      const lote = node.querySelector("[data-req-line-lote]")?.value?.trim() || "";
      if (sku) lines.push({ sku, requestedQty: qty, lotNumber: lote || undefined });
    });
    if (!lines.length) {
      setOpsMessage("reqMessage", "Agrega al menos una línea con SKU.", false);
      return;
    }
  } else {
    const sku = document.getElementById("reqSku")?.value?.trim();
    const qty = Number(document.getElementById("reqQty")?.value);
    const lote = document.getElementById("reqLote")?.value?.trim() || "";
    if (!sku) {
      setOpsMessage("reqMessage", "Indica un SKU.", false);
      return;
    }
    if (!Number.isFinite(qty) || qty <= 0) {
      setOpsMessage("reqMessage", "Cantidad solicitada debe ser mayor que 0.", false);
      return;
    }
    lines = [{ sku, requestedQty: qty, lotNumber: lote || undefined }];
  }
  for (const line of lines) {
    if (!Number.isFinite(line.requestedQty) || line.requestedQty <= 0) {
      setOpsMessage("reqMessage", `Cantidad inválida en línea SKU ${line.sku}.`, false);
      return;
    }
  }

  if (btn) btn.disabled = true;
  try {
    const response = await authenticatedFetch("/api/requisitions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        number: reference,
        projectCode: customerCode,
        priority,
        reference,
        notes: [extraNotes, warehouse ? `Almacén: ${warehouse}` : null].filter(Boolean).join(" · ") || undefined,
        lines
      })
    });
    if (!response) {
      setOpsMessage("reqMessage", "No se pudo crear la requisición.", false);
      return;
    }
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      setOpsMessage("reqMessage", data.message || "No se pudo crear la requisición.", false);
      return;
    }
    setOpsMessage(
      "reqMessage",
      `Requisición ${data.number || reference} creada en DRAFT. No descuenta inventario. El stock se descuenta únicamente al surtir mediante Picking/Salida.`,
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
    ["outboundCustomer", "outboundSku", "outboundProduct", "outboundCliente"],
    ["reqCustomer", "reqSku", null, "reqCliente"]
  ].forEach(([custId, skuId, prodId, clienteId]) => {
    const cust = document.getElementById(custId);
    if (cust && cust.dataset.opsWired !== "1") {
      cust.dataset.opsWired = "1";
      cust.addEventListener("change", () => {
        fillSkuSelect(skuId, cust.value, prodId);
        if (clienteId) {
          const customers = getOperationalProjectsForSelect();
          const match = customers.find((c) => c.code === cust.value);
          const inp = document.getElementById(clienteId);
          if (inp) inp.value = match?.name || "";
        }
        if (custId === "reqCustomer") refreshRequisitionSkuSelectedCard();
      });
    }
    const sku = document.getElementById(skuId);
    if (sku && sku.dataset.opsWired !== "1") {
      sku.dataset.opsWired = "1";
      const syncProductName = () => {
        if (!prodId) return;
        if (skuId === "inboundSku" && !inboundHasSystemSkuSelection()) {
          const inp = document.getElementById(prodId);
          if (inp) inp.value = "";
          return;
        }
        const prod =
          findProductBySku(sku.value) || resolveProductBySkuOrCode(String(sku.value || "").trim());
        const inp = document.getElementById(prodId);
        if (inp) inp.value = prod?.name || "";
      };
      sku.addEventListener("change", syncProductName);
      sku.addEventListener("blur", syncProductName);
    }
  });

  const inboundSku = document.getElementById("inboundSku");
  if (inboundSku && inboundSku.dataset.opsWired !== "1") {
    inboundSku.dataset.opsWired = "1";
    inboundSku.addEventListener("change", () => {
      if (!inboundHasSystemSkuSelection()) {
        const inp = document.getElementById("inboundProduct");
        if (inp) inp.value = "";
      }
    });
  }
  const inboundAssignment = document.getElementById("inboundAssignmentType");
  if (inboundAssignment && inboundAssignment.dataset.opsWired !== "1") {
    inboundAssignment.dataset.opsWired = "1";
    inboundAssignment.addEventListener("change", () => syncInboundAssignmentUi());
  }
  const inboundClient = document.getElementById("inboundClientId");
  if (inboundClient && inboundClient.dataset.opsWired !== "1") {
    inboundClient.dataset.opsWired = "1";
    inboundClient.addEventListener("change", () => {
      fillInboundProjectSelect();
      syncInboundSubmitEnabled();
    });
  }
  [
    "inboundProjectId",
    "inboundQty",
    "inboundWarehouse",
    "inboundWarehouseSelect",
    "inboundLocation",
    "inboundLocationSelect",
    "inboundStatus",
    "inboundUnitPriceMxn"
  ].forEach((id) => {
    const el = document.getElementById(id);
    if (!el || el.dataset.inboundReadyWired === "1") return;
    el.dataset.inboundReadyWired = "1";
    el.addEventListener("input", () => syncInboundSubmitEnabled());
    el.addEventListener("change", () => syncInboundSubmitEnabled());
  });

  const inBtn = document.getElementById("inboundSubmitBtn");
  if (inBtn && inBtn.dataset.opsWired !== "1") {
    inBtn.dataset.opsWired = "1";
    inBtn.addEventListener("click", () => void submitOperationalMovement("in"));
  }
  syncInboundSubmitEnabled();
  [
    "relocateWarehouse",
    "relocateWarehouseSelect",
    "relocateStatus",
    "relocateFrom",
    "relocateFromSelect"
  ].forEach((id) => {
    const el = document.getElementById(id);
    if (!el || el.dataset.relocateFilterWired === "1") return;
    el.dataset.relocateFilterWired = "1";
    const onFilter = () => invalidateRelocateContextFromFilters();
    el.addEventListener("change", onFilter);
    el.addEventListener("input", onFilter);
  });
  ["relocateTo", "relocateToSelect", "relocateQty"].forEach((id) => {
    const el = document.getElementById(id);
    if (!el || el.dataset.relocateReadyWired === "1") return;
    el.dataset.relocateReadyWired = "1";
    const onReady = () => {
      if (id === "relocateToSelect") {
        const inp = document.getElementById("relocateTo");
        if (inp && el.value !== SMART_OTHER) inp.value = el.value || "";
      }
      syncRelocateFormState();
    };
    el.addEventListener("input", onReady);
    el.addEventListener("change", onReady);
  });
  if (typeof wireRelocateBalanceTypeahead === "function") wireRelocateBalanceTypeahead();
  syncRelocateLocationSelects();
  syncRelocateFormState();
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

async function loadCatalogData() {
  await loadInventoryStatusCatalog();
  await loadProductsRows();
  const clientsResponse = await authenticatedFetch("/api/catalog/clients");
  clientsCache = clientsResponse?.ok ? await clientsResponse.json() : [];
  if (!Array.isArray(clientsCache)) clientsCache = [];
  const projectsResponse = await authenticatedFetch("/api/catalog/customers");
  catalogProjectsCache = projectsResponse?.ok ? await projectsResponse.json() : [];
  if (!Array.isArray(catalogProjectsCache)) catalogProjectsCache = [];
  if (clientsList) clientsList.innerHTML = "";
  renderClientsModule();
  populateOperationalSelects();
  await loadInventoryProjects();
  updateInventoryScopeUi();
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

function isNavModuleButtonVisible(btn) {
  return btn && btn.style.display !== "none";
}

function setRoleUiVisible(el, visible) {
  if (!el) return;
  el.classList.toggle("hidden", !visible);
  el.style.display = visible ? "" : "none";
  el.setAttribute("aria-hidden", visible ? "false" : "true");
}

function applyRoleNavigation(role) {
  const allowed = roleModules[role] || [];
  const transferPanel = document.getElementById("assignmentTransferPanel");
  if (transferPanel && role !== "ADMIN" && role !== "SUPERVISOR") {
    transferPanel.classList.add("hidden");
    assignmentTransferSource = null;
  }
  moduleButtons.forEach((btn) => {
    const enabled = allowed.includes(btn.dataset.module);
    btn.disabled = false;
    btn.style.display = enabled ? "flex" : "none";
    btn.setAttribute("aria-hidden", enabled ? "false" : "true");
    if (!enabled) btn.classList.remove("active");
  });

  let firstVisibleSection = null;
  document.querySelectorAll(".nav-section-panel").forEach((panel) => {
    const anyVisible = Array.from(panel.querySelectorAll(".module-btn")).some(isNavModuleButtonVisible);
    panel.dataset.roleHidden = anyVisible ? "0" : "1";
    const sectionId = panel.getAttribute("data-nav-section-panel");
    if (anyVisible && !firstVisibleSection) firstVisibleSection = sectionId;
    document.querySelectorAll(`.nav-section-tab[data-nav-section="${sectionId}"]`).forEach((tab) => {
      tab.style.display = anyVisible ? "" : "none";
    });
    if (!anyVisible) {
      panel.classList.remove("active");
      panel.style.display = "none";
    }
  });

  // Backward-compat for any remaining .nav-group wrappers
  document.querySelectorAll(".nav-group").forEach((group) => {
    if (group.classList.contains("nav-section-panel")) return;
    const anyVisible = Array.from(group.querySelectorAll(".module-btn")).some(isNavModuleButtonVisible);
    group.style.display = anyVisible ? "" : "none";
  });

  const activePanel = document.querySelector(".nav-section-panel.active");
  const activeVisible =
    activePanel &&
    activePanel.dataset.roleHidden !== "1" &&
    Array.from(activePanel.querySelectorAll(".module-btn")).some(isNavModuleButtonVisible);
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
  if (createCustomerForm) createCustomerForm.classList.add("hidden");
  const newClientField = document.getElementById("newClientField");
  if (newClientField) newClientField.classList.toggle("hidden", !isBoundOperationalRole(document.getElementById("newRole")?.value));
  document.querySelectorAll(".js-assignment-opt[data-assignment='FREE_TO_SALE']").forEach((btn) => {
    btn.style.display = "";
  });
  const isAdmin = role === "ADMIN";
  if (catalogImportSection) catalogImportSection.classList.toggle("hidden", !isAdmin);
  const catalogImportModal = document.getElementById("catalogImportModal");
  if (catalogImportModal) catalogImportModal.classList.toggle("hidden", !isAdmin);
  const inventoryOpsNavPanel = document.getElementById("inventoryOpsNavPanel");
  if (inventoryOpsNavPanel) inventoryOpsNavPanel.remove();
  const openCatBtn = document.getElementById("openCatalogImportBtn");
  const openInvBtn = document.getElementById("openInventoryImportBtn");
  if (openCatBtn) openCatBtn.style.display = isAdmin ? "inline-block" : "none";
  if (openInvBtn) openInvBtn.style.display = isAdmin ? "inline-block" : "none";
  physicalInventoryResetBtns.forEach((btn) => {
    btn.classList.toggle("hidden", role !== "ADMIN");
    btn.style.display = role === "ADMIN" ? "inline-block" : "none";
  });
  void syncAviatDangerZone();
  if (taskCreateWrap) {
    taskCreateWrap.classList.toggle("hidden", role !== "ADMIN" && role !== "SUPERVISOR" && role !== "OPERATOR");
  }
  const reqPanel = document.getElementById("reqSubmitBtn");
  if (reqPanel) reqPanel.style.display = role === "CLIENT" ? "none" : "inline-block";
  const inBtn = document.getElementById("inboundSubmitBtn");
  const outBtn = document.getElementById("outboundSubmitBtn");
  const canOperate = role === "ADMIN" || role === "SUPERVISOR" || role === "OPERATOR";
  if (inBtn) {
    inBtn.style.display = canOperate ? "inline-block" : "none";
    syncInboundSubmitEnabled();
  }
  if (outBtn) outBtn.style.display = canOperate ? "inline-block" : "none";
  const canExportInventory =
    role === "ADMIN" || role === "OPERATOR" || role === "SUPERVISOR" || role === "CLIENT";
  const canExportTrace = role === "ADMIN" || role === "OPERATOR" || role === "SUPERVISOR";
  const canExportProducts = role === "ADMIN" || role === "CLIENT";
  if (exportStockBtn) exportStockBtn.style.display = canExportInventory ? "inline-block" : "none";
  if (exportMovementsBtn) exportMovementsBtn.style.display = canExportInventory ? "inline-block" : "none";
  if (exportTraceBtn) exportTraceBtn.style.display = canExportTrace ? "inline-block" : "none";
  if (exportProductsBtn) exportProductsBtn.style.display = canExportProducts ? "inline-block" : "none";

  const canAddProject = role === "ADMIN";
  const projectsAddBtn = document.getElementById("projectsAddBtn");
  const ccAddProjectBtn = document.getElementById("ccAddProjectBtn");
  if (projectsAddBtn) projectsAddBtn.style.display = canAddProject ? "" : "none";
  if (ccAddProjectBtn) ccAddProjectBtn.style.display = canAddProject ? "" : "none";
  const configUsersBtn = document.getElementById("configUsersBtn");
  if (configUsersBtn) configUsersBtn.style.display = role === "ADMIN" ? "" : "none";
  const rStock = document.getElementById("reportsExportStock");
  const rStockX = document.getElementById("reportsExportStockXlsx");
  const rMov = document.getElementById("reportsExportMovements");
  const rReq = document.getElementById("reportsExportRequisitions");
  const rProd = document.getElementById("reportsExportProducts");
  const rTrace = document.getElementById("reportsExportTrace");
  if (rStock) rStock.style.display = canExportInventory ? "inline-block" : "none";
  if (rStockX) rStockX.style.display = canExportInventory ? "inline-block" : "none";
  if (rMov) rMov.style.display = canExportInventory ? "inline-block" : "none";
  if (rReq) rReq.style.display = role === "ADMIN" || role === "SUPERVISOR" || role === "OPERATOR" ? "inline-block" : "none";
  if (rProd) rProd.style.display = canExportProducts ? "inline-block" : "none";
  if (rTrace) rTrace.style.display = canExportTrace ? "inline-block" : "none";
  const importWizardPanel = document.getElementById("importWizardPanel");
  if (importWizardPanel && role !== "ADMIN") {
    importWizardPanel.style.display = "none";
    importWizardPanel.classList.add("hidden");
  }
  const exportStockFilteredBtn = document.getElementById("exportStockFilteredBtn");
  const exportProductsFilteredBtn = document.getElementById("exportProductsFilteredBtn");
  if (exportStockFilteredBtn) exportStockFilteredBtn.style.display = canExportInventory ? "inline-block" : "none";
  if (exportProductsFilteredBtn) exportProductsFilteredBtn.style.display = canExportProducts ? "inline-block" : "none";
  if (labResetSection && role !== "ADMIN") {
    labResetSection.classList.add("hidden");
    labResetAvailable = false;
  }
  const historySection = document.getElementById("operationalHistorySection");
  if (historySection) setRoleUiVisible(historySection, isAdmin);

  const isClient = role === "CLIENT";

  document.querySelectorAll(".js-admin-only").forEach((el) => {
    setRoleUiVisible(el, isAdmin && !mustChangePassword);
  });
  document.querySelectorAll(".js-write-operational").forEach((el) => {
    setRoleUiVisible(el, canOperate);
  });

  setRoleUiVisible(document.querySelector(".incidents-form-panel"), canOperate);
  setRoleUiVisible(document.getElementById("reqCreatePanel"), canOperate);
  if (!isAdmin) {
    setRoleUiVisible(document.getElementById("moduleConfig"), false);
    setRoleUiVisible(document.getElementById("moduleUsers"), false);
  }
  setRoleUiVisible(document.getElementById("moduleClients"), isAdmin);
  setRoleUiVisible(clientContextGate, isAdmin);

  if (isClient && currentModuleName && !allowed.includes(currentModuleName)) {
    hideAllModules();
    currentModuleName = null;
    navigateTo("inventario", "inventory");
  }
}

const LAB_RESET_COUNT_LABELS = [
  ["inventory", "Inventario"],
  ["inventoryQty", "Cantidad total"],
  ["movements", "Movimientos"],
  ["imports", "Importaciones"],
  ["requisitions", "Requisiciones"],
  ["reservations", "Reservas"]
];

function renderLabResetCounts(target, counts) {
  if (!target) return;
  const source = counts || {};
  target.innerHTML = LAB_RESET_COUNT_LABELS.map(([key, label]) => {
    const value = source[key] == null || source[key] === "" ? "—" : source[key];
    return `<div class="lab-reset-count"><span>${label}</span><strong>${escCell(value)}</strong></div>`;
  }).join("");
}

function setLabResetError(message) {
  if (labResetError) labResetError.textContent = message || "";
}

function syncLabResetConfirmEnabled() {
  if (!labResetConfirmBtn) return;
  const ready = Boolean(labResetAck?.checked) && !labResetBusy && !labResetCompleted;
  labResetConfirmBtn.disabled = !ready;
  if (!labResetBusy && !labResetCompleted) labResetConfirmBtn.textContent = "Sí, reiniciar laboratorio";
}

function setLabResetBusy(busy) {
  labResetBusy = busy;
  if (labResetOpenBtn) labResetOpenBtn.disabled = busy;
  if (labResetAck) labResetAck.disabled = busy;
  if (labResetCancelBtn) labResetCancelBtn.disabled = busy;
  if (labResetCloseX) labResetCloseX.disabled = busy;
  if (labResetBusyStatus) labResetBusyStatus.classList.toggle("hidden", !busy);
  if (busy && labResetConfirmBtn) {
    labResetConfirmBtn.disabled = true;
    labResetConfirmBtn.innerHTML = '<span class="lab-reset-spinner"></span>Reiniciando laboratorio…';
  } else {
    syncLabResetConfirmEnabled();
  }
}

function resetLabResetModalState() {
  labResetCompleted = false;
  if (labResetPreviewBlock) labResetPreviewBlock.classList.remove("hidden");
  if (labResetResultBlock) labResetResultBlock.classList.add("hidden");
  if (labResetAck) labResetAck.checked = false;
  if (labResetCounts) labResetCounts.innerHTML = "";
  if (labResetPreviewStatus) labResetPreviewStatus.textContent = "Cargando resumen…";
  if (labResetSnapshot) labResetSnapshot.textContent = "";
  setLabResetError("");
  setLabResetBusy(false);
}

function closeLabResetModal() {
  if (labResetBusy) return;
  closeModal("labResetModal");
}

async function initLabResetAvailability() {
  if (!labResetSection) return;
  if (currentRole !== "ADMIN") {
    labResetAvailable = false;
    labResetSection.classList.add("hidden");
    return;
  }
  try {
    const response = await authenticatedFetch("/api/admin/lab-reset");
    if (!response || response.status === 404 || !response.ok) {
      labResetAvailable = false;
      labResetSection.classList.add("hidden");
      return;
    }
    const data = await response.json().catch(() => ({}));
    labResetAvailable = data.available === true;
    labResetSection.classList.toggle("hidden", !labResetAvailable);
  } catch (_error) {
    labResetAvailable = false;
    labResetSection.classList.add("hidden");
  }
}

async function openLabResetModal() {
  if (!labResetAvailable || currentRole !== "ADMIN" || labResetBusy) return;
  resetLabResetModalState();
  openModal("labResetModal");
  try {
    const response = await authenticatedFetch("/api/admin/lab-reset");
    if (!response) {
      setLabResetError("Sesión expirada. Vuelve a iniciar sesión.");
      return;
    }
    if (response.status === 404 || !response.ok) {
      const data = await response.json().catch(() => ({}));
      labResetAvailable = false;
      if (labResetSection) labResetSection.classList.add("hidden");
      setLabResetError(data.message || "El reinicio de laboratorio no está disponible.");
      return;
    }
    const data = await response.json().catch(() => ({}));
    renderLabResetCounts(labResetCounts, data.counts);
    if (labResetPreviewStatus) {
      labResetPreviewStatus.textContent = "Resumen actual del entorno DEV. Nada se ha eliminado todavía.";
    }
  } catch (_error) {
    setLabResetError("No se pudo cargar el resumen previo.");
  }
}

async function refreshAfterLabReset() {
  await Promise.all([
    typeof loadCatalogData === "function" ? loadCatalogData().catch(() => {}) : Promise.resolve(),
    typeof loadStockStrip === "function" ? loadStockStrip().catch(() => {}) : Promise.resolve(),
    typeof loadInventoryMovements === "function" ? loadInventoryMovements().catch(() => {}) : Promise.resolve(),
    typeof loadTraceability === "function" ? loadTraceability().catch(() => {}) : Promise.resolve(),
    typeof loadScanEvents === "function" ? loadScanEvents().catch(() => {}) : Promise.resolve(),
    typeof loadRequisitionsList === "function" ? loadRequisitionsList().catch(() => {}) : Promise.resolve(),
    typeof loadTasks === "function" ? loadTasks().catch(() => {}) : Promise.resolve(),
    typeof loadIncidents === "function" ? loadIncidents().catch(() => {}) : Promise.resolve(),
    typeof loadInboundList === "function" ? loadInboundList().catch(() => {}) : Promise.resolve(),
    typeof loadOutboundList === "function" ? loadOutboundList().catch(() => {}) : Promise.resolve()
  ]);
}

async function runLabReset() {
  if (labResetBusy) return;
  if (!labResetAck?.checked) {
    setLabResetError("Marca la casilla para confirmar que entiendes el alcance.");
    return;
  }
  setLabResetError("");
  setLabResetBusy(true);
  try {
    const response = await authenticatedFetch("/api/admin/lab-reset", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirmed: true })
    });
    if (!response) {
      setLabResetError("Sesión expirada. Vuelve a iniciar sesión.");
      setLabResetBusy(false);
      return;
    }
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.ok !== true) {
      console.error("[lab-reset]", data);
      setLabResetError(data.message || "No se pudo reiniciar el laboratorio.");
      setLabResetBusy(false);
      return;
    }
    if (labResetPreviewBlock) labResetPreviewBlock.classList.add("hidden");
    if (labResetResultBlock) labResetResultBlock.classList.remove("hidden");
    renderLabResetCounts(labResetBeforeCounts, data.before);
    renderLabResetCounts(labResetAfterCounts, data.after);
    if (labResetSnapshot) {
      const snapshotId = data.snapshot?.path || data.snapshot?.id || "—";
      labResetSnapshot.textContent = `Snapshot creado: ${snapshotId}`;
    }
    labResetCompleted = true;
    setLabResetBusy(false);
    if (labResetConfirmBtn) {
      labResetConfirmBtn.disabled = true;
      labResetConfirmBtn.textContent = "Laboratorio reiniciado";
    }
    await refreshAfterLabReset();
  } catch (error) {
    console.error("[lab-reset]", error);
    setLabResetError("Error de red al reiniciar el laboratorio.");
    setLabResetBusy(false);
  }
}

async function createUser(event) {
  event.preventDefault();
  createUserError.textContent = "";
  createUserBtn.disabled = true;

  const payload = {
    fullName: newFullName.value.trim(),
    email: newEmail.value.trim(),
    password: newPassword.value.trim(),
    role: newRole.value,
    clientId: isBoundOperationalRole(newRole.value) ? document.getElementById("newClientId")?.value || null : null
  };

  if (isBoundOperationalRole(payload.role) && !payload.clientId) {
    createUserError.textContent = "Los usuarios SUPERVISOR, OPERATOR y CLIENT requieren un cliente asignado.";
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
      const issues = Array.isArray(data.issues)
        ? data.issues.map((item) => item.message).filter(Boolean).join(" ")
        : "";
      createUserError.textContent =
        data.code === "USER_CLIENT_REQUIRED"
          ? data.message
          : issues
            ? `${data.message || "Payload invalido"} ${issues}`
            : data.message || "No se pudo crear el usuario.";
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
    applyMustChangePasswordGate(false);
    if (currentRole === "ADMIN" && !operationalClient) {
      await showAdminClientPicker();
    }
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
      setScanResult(awaitingAdminClient ? "Selecciona un cliente antes de operar." : "No se pudo completar el picking.", "error");
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
  if (!window.confirm("¿Desactivar este usuario? No podrá iniciar sesión. La trazabilidad histórica se conserva.")) return;
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

function openEditUserForm(userId) {
  const user = usersCache.find((row) => row.id === userId);
  const form = document.getElementById("editUserForm");
  if (!user || !form) return;
  document.getElementById("editUserId").value = user.id;
  document.getElementById("editFullName").value = user.fullName || "";
  document.getElementById("editEmail").value = user.email || "";
  document.getElementById("editRole").value = user.role || "OPERATOR";
  fillUserClientSelect("editClientId", user.clientId || "");
  document.getElementById("editJobTitle").value = user.jobTitle || "";
  document.getElementById("editPhone").value = user.phone || "";
  document.getElementById("editAlternatePhone").value = user.alternatePhone || "";
  document.getElementById("editAvatarUrl").value = user.avatarUrl || "";
  document.getElementById("editAddress").value = user.address || "";
  document.getElementById("editCity").value = user.city || "";
  document.getElementById("editState").value = user.state || "";
  document.getElementById("editPostalCode").value = user.postalCode || "";
  document.getElementById("editNotes").value = user.notes || "";
  applyUserPhotoPreview(document.getElementById("editUserPhotoSlot"), user.avatarUrl);
  const err = document.getElementById("editUserError");
  if (err) err.textContent = "";
  form.classList.remove("hidden");
  form.scrollIntoView({ block: "nearest" });
}

async function saveEditUser(event) {
  event.preventDefault();
  const id = document.getElementById("editUserId")?.value;
  const err = document.getElementById("editUserError");
  if (!id) return;
  const role = document.getElementById("editRole")?.value;
  const payload = {
    fullName: document.getElementById("editFullName")?.value?.trim(),
    email: document.getElementById("editEmail")?.value?.trim(),
    role,
    clientId: isBoundOperationalRole(role) ? document.getElementById("editClientId")?.value || null : document.getElementById("editClientId")?.value || null,
    jobTitle: document.getElementById("editJobTitle")?.value || null,
    phone: document.getElementById("editPhone")?.value || null,
    alternatePhone: document.getElementById("editAlternatePhone")?.value || null,
    avatarUrl: document.getElementById("editAvatarUrl")?.value?.trim() || null,
    address: document.getElementById("editAddress")?.value || null,
    city: document.getElementById("editCity")?.value || null,
    state: document.getElementById("editState")?.value || null,
    postalCode: document.getElementById("editPostalCode")?.value || null,
    notes: document.getElementById("editNotes")?.value || null
  };
  const response = await authenticatedFetch(`/api/users/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  if (!response) return;
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    if (err) err.textContent = data.message || "No se pudo guardar la ficha.";
    return;
  }
  if (err) err.textContent = "";
  document.getElementById("editUserForm")?.classList.add("hidden");
  await loadUsersModule("ADMIN");
}

function openResetPasswordModal(userId) {
  const user = usersCache.find((row) => row.id === userId);
  if (!user) return;
  const idEl = document.getElementById("resetPasswordUserId");
  const label = document.getElementById("resetPasswordUserLabel");
  const once = document.getElementById("resetPasswordOnce");
  const err = document.getElementById("resetPasswordError");
  const input = document.getElementById("resetTempPassword");
  if (idEl) idEl.value = user.id;
  if (label) label.textContent = `${user.fullName} · ${user.email} · ${user.role}`;
  if (once) {
    once.textContent = "";
    once.classList.add("hidden");
  }
  if (err) err.textContent = "";
  if (input) {
    input.value = "";
    input.type = "password";
  }
  openModal("resetPasswordModal");
}

async function confirmResetPassword() {
  const id = document.getElementById("resetPasswordUserId")?.value;
  const typed = document.getElementById("resetTempPassword")?.value?.trim();
  const err = document.getElementById("resetPasswordError");
  const once = document.getElementById("resetPasswordOnce");
  if (!id) return;
  const body = typed ? { newPassword: typed } : {};
  const response = await authenticatedFetch(`/api/users/${encodeURIComponent(id)}/reset-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!response) return;
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (err) err.textContent = data.message || "No se pudo restablecer la contraseña.";
    return;
  }
  if (err) err.textContent = "";
  if (once) {
    once.classList.remove("hidden");
    once.textContent = `Contraseña temporal (solo ahora): ${data.temporaryPassword}. Entrégala al usuario. No se volverá a mostrar.`;
  }
}

async function saveAccountProfile(event) {
  event.preventDefault();
  const err = document.getElementById("accountProfileError");
  if (err) err.textContent = "Mi cuenta es de solo lectura. Un ADMIN edita la ficha oficial; aquí solo cambias la contraseña.";
}

function selectedHistoryIncidentIds() {
  return Array.from(document.querySelectorAll(".js-history-incident:checked")).map((el) => el.value);
}

function selectedHistoryCategories() {
  if (document.getElementById("historyCleanAll")?.checked) return ["all"];
  return Array.from(document.querySelectorAll(".js-history-category:checked"))
    .map((el) => el.getAttribute("data-history-category"))
    .filter((value) => value && value !== "all");
}

function syncHistoryExecuteEnabled() {
  const btn = document.getElementById("operationalHistoryExecuteBtn");
  if (!btn) return;
  const phrase = String(document.getElementById("operationalHistoryPhrase")?.value || "").trim();
  btn.disabled = phrase !== "LIMPIAR HISTORIAL OPERATIVO DE AVIAT" || selectedHistoryCategories().length === 0;
}

async function loadOperationalHistoryPreview() {
  const decision = document.getElementById("operationalHistoryDecision");
  const counts = document.getElementById("operationalHistoryCounts");
  const list = document.getElementById("operationalHistoryIncidents");
  const integrity = document.getElementById("operationalHistoryIntegrity");
  const err = document.getElementById("operationalHistoryError");
  const ok = document.getElementById("operationalHistorySuccess");
  if (err) err.textContent = "";
  if (ok) ok.classList.add("hidden");
  const response = await authenticatedFetch("/api/admin/operational-history/preview");
  if (!response) return;
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (decision) decision.textContent = data.message || "No se pudo cargar el preview.";
    return;
  }
  operationalHistoryPreview = data;
  const scopeHint = document.getElementById("operationalHistoryScopeHint");
  if (scopeHint) {
    scopeHint.textContent = data.isAviat
      ? "Contexto AVIAT activo. Las cifras de abajo son conteos reales del preview (incluye ceros)."
      : "Este preview no enumera cifras porque el contexto operativo no es AVIAT. Cambia a AVIAT para ver totales.";
  }
  if (decision) {
    const githubNote = data.doesNotTouchGitHub
      ? " GitHub/repositorio: intacto (no borra commits, ramas, PRs ni evidencia técnica)."
      : "";
    decision.textContent = `${data.policy || data.decision}: ${data.decisionReason} Automática: no. Cero historial posible: ${data.canReachZeroOperationalHistory ? "sí" : "no"}.${githubNote}`;
  }
  const cat = data.counts || {};
  if (counts) {
    counts.innerHTML = [
      `Movs ${cat.movements?.total ?? 0}`,
      `Scans ${cat.scanEvents?.total ?? 0}`,
      `Activity ${cat.activityLogs?.total ?? 0}`,
      `Tareas ${cat.tasks?.total ?? 0}`,
      `Req ${cat.requisitions?.total ?? 0}`,
      `Imports ${cat.importBatches?.total ?? 0}`,
      `Incidentes ${cat.incidents?.total ?? 0}`,
      `Comentarios ${cat.comments?.total ?? 0}`,
      `Reservas a liberar ${cat.reservationsToRelease ?? 0}`
    ]
      .map((text) => `<span class="chip">${escCell(text)}</span>`)
      .join("");
  }
  if (integrity) {
    const blocked = (data.integrity?.cannotPurgeWithoutTouchingMasters || [])
      .map((row) => `${row.category}: ${row.reason}`)
      .join(" ");
    integrity.textContent = blocked
      ? `Integridad: ${blocked}`
      : data.integrity?.reservationsNote || "Ninguna categoría requiere borrar maestros.";
  }
  const records = cat.incidents?.records || data.leftoverOutsideInventoryReset?.incidents?.records || [];
  if (list) {
    list.innerHTML = records.length
      ? `<p class="filter-hint">Incidencias AVIAT (marca un subconjunto o usa la categoría completa):</p><table class="projects-stock-table"><thead><tr><th></th><th>Tipo</th><th>Estado</th><th>Almacén</th><th>Notas</th></tr></thead><tbody>${records
          .map(
            (row) =>
              `<tr><td><input type="checkbox" class="js-history-incident" value="${escCell(row.id)}" /></td><td>${escCell(row.type)}</td><td>${escCell(row.status)}</td><td>${escCell(row.warehouse || "—")}</td><td>${escCell(row.notesPreview || "—")}</td></tr>`
          )
          .join("")}</tbody></table>`
      : "<p class='filter-hint'>No hay incidencias AVIAT en el preview.</p>";
    list.querySelectorAll(".js-history-incident").forEach((box) => box.addEventListener("change", syncHistoryExecuteEnabled));
  }
  syncHistoryExecuteEnabled();
}

async function executeOperationalHistoryCleanup() {
  const err = document.getElementById("operationalHistoryError");
  const ok = document.getElementById("operationalHistorySuccess");
  const categories = selectedHistoryCategories();
  const ids = selectedHistoryIncidentIds();
  const response = await authenticatedFetch("/api/admin/operational-history/cleanup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      confirmation: document.getElementById("operationalHistoryPhrase")?.value,
      categories,
      incidentIds: document.getElementById("historyCleanIncidents")?.checked && ids.length ? ids : []
    })
  });
  if (!response) return;
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (err) err.textContent = data.message || "No se ejecutó la limpieza.";
    return;
  }
  if (err) err.textContent = "";
  if (ok) {
    ok.classList.remove("hidden");
        ok.textContent = `Limpieza aplicada. Cero historial AVIAT: ${data.reachedZeroOperationalHistory ? "sí" : "no"}. Maestros intactos. GitHub/repositorio intacto.`;
  }
  await loadOperationalHistoryPreview();
}

async function validateSession() {
  try {
    const user = await loadCurrentUser();
    if (!user) return;
    currentRole = user.role || "CLIENT";
    currentUserId = user.id || null;
    currentUserClient = user.client
      ? { ...user.client, id: user.client.id || user.clientId, code: user.client.code }
      : user.clientId
        ? { id: user.clientId }
        : null;
    operationalClient = user.operationalClient || (isBoundOperationalRole(currentRole) ? currentUserClient : null);
    mustChangePassword = Boolean(user.mustChangePassword);
    fillAccountProfileForm(user);
    awaitingAdminClient = currentRole === "ADMIN" && !operationalClient && !mustChangePassword;
    applyRoleNavigation(currentRole);
    applyMustChangePasswordGate(mustChangePassword);
    applyEconomicVisibility();
    void initLabResetAvailability();

    if (statusBox) statusBox.innerHTML = '<span class="ok">Sistema operativo</span>';
    const displayName = user.fullName || user.email || "Usuario";
    if (sessionDisplayName) sessionDisplayName.textContent = `Hola, ${displayName}`;
    if (sessionEmailInline) sessionEmailInline.textContent = user.email || "—";
    if (sessionRoleInline) sessionRoleInline.textContent = ` · Rol: ${currentRole}`;
    if (currentUserFullName) currentUserFullName.textContent = user.fullName || "—";
    currentUserEmail.textContent = user.email || "No disponible";
    currentUserRoleText.textContent = currentRole;
    if (scanHint) scanHint.textContent = "";
    wireHashModuleNavigation();
    updateActiveClientChrome();
    if (awaitingAdminClient) {
      hideAllModules();
      moduleButtons.forEach((btn) => btn.classList.remove("active"));
      await showAdminClientPicker();
      await loadUsersModule(currentRole);
      return;
    }
    hideAdminClientPicker();
    applySessionRoute();
    await loadOperationalWorkspace();
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
    noteUserNavChoice(section, mod);
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
document.getElementById("taskCreateUserBtn")?.addEventListener("click", () => navigateTo("sistema", "users"));

usersList.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;
  const delId = target.getAttribute("data-delete-user");
  if (delId) {
    void deleteUserById(delId);
    return;
  }
  const editId = target.getAttribute("data-edit-user");
  if (editId) {
    openEditUserForm(editId);
    return;
  }
  const resetId = target.getAttribute("data-reset-password-user");
  if (resetId) openResetPasswordModal(resetId);
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

let currentImportId = null;
let currentImportMapping = {};
let importResumeDismissedId = null;
let importResumeActive = null;
let importHydrating = false;
let importMissingLocations = [];
const IMPORT_BATCH_HINT_KEY = "logitec.import.lastBatchId";
const importUi = {
  busy: false,
  busyLabel: "",
  fileName: "",
  sheetName: "",
  sheetRows: 0,
  mappingApplied: false,
  mappingDirty: false,
  appliedMappingJson: "",
  validated: false,
  confirmed: false,
  totalRows: 0,
  validRows: 0,
  warningRows: 0,
  blocked: 0,
  unresolved: 0,
  customerBlank: 0,
  freeToSaleAssigned: 0,
  projectAssigned: 0,
  ready: 0,
  ignored: 0,
  corrections: 0,
  batchStatus: "",
  confirmable: false,
  confirmableReason: "",
  reviewSynced: false,
  reviewStale: false,
  lastSyncAt: null,
  syncOk: false,
  error: ""
};

function formatImportCount(n) {
  return Number(n || 0).toLocaleString("es-MX");
}

function formatImportClock(value) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("es-MX", {
    timeZone: "America/Mexico_City",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23"
  }).format(date);
}

function importStatusLabel(status) {
  const labels = {
    UPLOADED: "Cargado",
    MAPPED: "Mapeado",
    VALIDATED: "Validado",
    READY: "Listo",
    PROCESSING: "Confirmando",
    COMPLETED: "Completado",
    FAILED: "Fallido",
    CANCELLED: "Cancelado"
  };
  return labels[status] || status || "—";
}

function rememberImportBatchId(id) {
  try {
    if (id) localStorage.setItem(IMPORT_BATCH_HINT_KEY, id);
    else localStorage.removeItem(IMPORT_BATCH_HINT_KEY);
  } catch (_error) {
    /* pista opcional */
  }
}

function isTerminalImportUiBatch(status) {
  return status === "COMPLETED" || status === "CANCELLED";
}

function isImportWizardPanelOpen() {
  const panel = document.getElementById("importWizardPanel");
  return Boolean(panel && !panel.classList.contains("hidden") && panel.style.display !== "none");
}

function openImportWizardPanel() {
  const panel = document.getElementById("importWizardPanel");
  if (!panel) return;
  panel.classList.remove("hidden");
  panel.style.display = "";
  updateImportWizardChrome();
}

function closeImportWizardPanel() {
  const panel = document.getElementById("importWizardPanel");
  if (!panel) return;
  panel.classList.add("hidden");
  panel.style.display = "none";
  updateImportWizardChrome();
}

function hideImportCompletionNotice() {
  document.getElementById("importSuccessBanner")?.classList.add("hidden");
}

function showImportCompletionNotice(message) {
  const banner = document.getElementById("importSuccessBanner");
  if (banner) {
    banner.textContent = message;
    banner.classList.remove("hidden");
  }
}

function dismissImportWizardSession({ clearStoredBatch = true } = {}) {
  currentImportId = null;
  importResumeActive = null;
  if (clearStoredBatch) rememberImportBatchId(null);
  resetImportWizardLocalState();
  hideImportResumeBanner();
  syncImportWizardUi();
}

function closeImportWizardUiOnly() {
  if (importUi.busy) return;
  const openId = currentImportId;
  if (openId && !isTerminalImportUiBatch(importUi.batchStatus)) {
    importResumeDismissedId = openId;
  }
  closeImportWizardPanel();
  syncImportWizardUi();
}

async function returnInventoryToTotalScopeAfterImport() {
  const scope = getInventoryScope();
  if (scope.projectId || scope.assignmentType) {
    inventoryScope = { projectId: "", assignmentType: "" };
    updateInventoryScopeUi();
    refreshInventorySkuSelectedCard();
  } else {
    updateInventoryScopeUi();
  }
  await refreshInventoryAfterImport();
}

async function finishImportWizardAfterCompleted(summaryMessage) {
  showImportCompletionNotice(summaryMessage);
  dismissImportWizardSession({ clearStoredBatch: true });
  closeImportWizardPanel();
  await returnInventoryToTotalScopeAfterImport();
  applyInventoryFilters();
  void probeResumableImport();
}

function updateImportWizardChrome() {
  const panelOpen = isImportWizardPanelOpen();
  const hasOpenSession = Boolean(
    currentImportId && !isTerminalImportUiBatch(importUi.batchStatus) && !importUi.confirmed
  );
  ["importCloseWizardBtn", "importCloseWizardInnerBtn"].forEach((id) => {
    const closeBtn = document.getElementById(id);
    if (!closeBtn) return;
    closeBtn.classList.toggle("hidden", !panelOpen || !hasOpenSession);
    closeBtn.disabled = importUi.busy;
  });
}

function importStatBadge(label, count, kind = "") {
  const cls = kind ? ` import-stat-badge--${kind}` : "";
  return `<span class="import-stat-badge${cls}">${escCell(label)}: ${formatImportCount(count)}</span>`;
}

const IMPORT_SHEET_PLACEHOLDER = "— Selecciona la hoja a importar —";
const IMPORT_INFORMATIONAL_ISSUE_CODES = new Set(["PRODUCT_PROJECT_LINK_REQUIRED"]);

function isMultiSheetImportUpload(sheets, fileName) {
  const list = Array.isArray(sheets) ? sheets : [];
  if (list.length <= 1) return false;
  return /\.xlsx$/i.test(String(fileName || ""));
}

function suggestImportSheet(sheets, context) {
  if (!Array.isArray(sheets) || sheets.length <= 1) return null;
  const ctx = String(context || "").toUpperCase();
  if (ctx !== "INVENTORY" && ctx !== "INBOUND") return null;
  const keywords = ["inventario", "stock", "existencias", "físico", "fisico"];
  const scored = sheets
    .map((sheet) => {
      const name = String(sheet.name || "").toLowerCase();
      const score = keywords.reduce((acc, kw) => acc + (name.includes(kw) ? 1 : 0), 0);
      return { sheet, score };
    })
    .filter((entry) => entry.score > 0)
    .sort(
      (a, b) =>
        b.score - a.score ||
        Number(b.sheet.totalDataRows || 0) - Number(a.sheet.totalDataRows || 0)
    );
  return scored[0]?.sheet || null;
}

function renderImportSheetSelectOptions(sheets, { selected = "", includePlaceholder = false } = {}) {
  const opts = [];
  if (includePlaceholder) {
    opts.push(`<option value="">${escCell(IMPORT_SHEET_PLACEHOLDER)}</option>`);
  }
  for (const sheet of sheets) {
    opts.push(
      `<option value="${escCell(sheet.name)}"${selected === sheet.name ? " selected" : ""}>${escCell(sheet.name)} (${formatImportCount(sheet.totalDataRows)} filas)</option>`
    );
  }
  return opts.join("");
}

function getImportInventoryModeValue() {
  const toggle = document.getElementById("importReconcilePreviewToggle");
  return toggle?.checked ? "RECONCILE" : "APPEND";
}

function isImportReconcilePreviewMode() {
  return getImportInventoryModeValue() === "RECONCILE";
}

function syncImportInventoryModeUi() {
  const context = document.getElementById("importContext")?.value || "INVENTORY";
  const isInventoryContext = context === "INVENTORY" || context === "INBOUND";
  document.getElementById("importInventoryModeField")?.classList.toggle("hidden", !isInventoryContext);
  document.getElementById("importReconcilePreviewDetails")?.classList.toggle("hidden", !isInventoryContext);
  if (!isInventoryContext) {
    const toggle = document.getElementById("importReconcilePreviewToggle");
    if (toggle) toggle.checked = false;
  }
}

function setImportReconcilePreviewMode(enabled) {
  const toggle = document.getElementById("importReconcilePreviewToggle");
  if (toggle) toggle.checked = Boolean(enabled);
  syncImportInventoryModeUi();
}

function importReviewGroupActionCell(group, index) {
  if (IMPORT_INFORMATIONAL_ISSUE_CODES.has(group.issueCode)) {
    const project = String(group.sourceValue ?? "proyecto");
    return `Se crearán ${formatImportCount(group.records)} vínculos producto-proyecto al confirmar (${escCell(project)}).`;
  }
  if (group.issueCode === "SOURCE_LOCATION_NOT_IN_MASTER") {
    return "Dar de alta el código fuente";
  }
  if (group.issueCode === "ASSIGNMENT_UNRESOLVED") {
    return `<button class="btn-secondary btn-compact" data-review-group="${index}" data-review-assign="project">Asignar proyecto</button> <button class="btn-secondary btn-compact" data-review-group="${index}" data-review-assign="fts">FREE TO SALE</button>`;
  }
  return `<button class="btn-secondary btn-compact" data-review-group="${index}">Corregir todos</button>`;
}

function hasUsefulImportSheetList(sheets) {
  return Array.isArray(sheets) && sheets.length > 0;
}

function resolveImportSheetMetadata(sheets, batchSheets, sheetName) {
  const findNamed = (list) =>
    hasUsefulImportSheetList(list) ? list.find((s) => s && s.name === sheetName) || null : null;
  const localSheet = findNamed(sheets);
  const batchSheet = findNamed(batchSheets);
  if (localSheet && Array.isArray(localSheet.headers) && localSheet.headers.length) return localSheet;
  return batchSheet || localSheet || null;
}

function importMappingHeadersFromSheet(sheet, suggested) {
  if (Array.isArray(sheet?.headers) && sheet.headers.length) return sheet.headers;
  if (suggested && typeof suggested === "object") return Object.keys(suggested);
  return [];
}

async function applyImportSheetSelection(sheetName, sheets) {
  if (!currentImportId || !sheetName) return;
  const response = await authenticatedFetch(`/api/imports/${currentImportId}/select-sheet`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sheetName })
  });
  if (!response?.ok) {
    const err = await response?.json().catch(() => ({}));
    throw new Error(err.message || "No se pudo seleccionar la hoja.");
  }
  const batch = await response.json();
  const sheet = resolveImportSheetMetadata(sheets, batch.metadata?.sheets, sheetName);
  importUi.sheetName = sheetName;
  importUi.sheetRows = Number(sheet?.totalDataRows || batch.totalRows || 0);
  importUi.batchStatus = batch.status || "UPLOADED";
  resetImportDownstream(3);
  const mappingRes = await authenticatedFetch(`/api/imports/${currentImportId}/mapping`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({})
  });
  const mapped = mappingRes?.ok ? await mappingRes.json() : { suggested: {} };
  const suggested = mapped.suggested || mapped.mapping || {};
  renderImportMapping(importMappingHeadersFromSheet(sheet, suggested), suggested);
  importUi.mappingApplied = false;
  importUi.mappingDirty = true;
  importUi.appliedMappingJson = "";
  setImportStatus(`✓ Hoja seleccionada: ${sheetName} — ${formatImportCount(importUi.sheetRows)} filas`);
}

function isCancellableImportUiStatus(status) {
  return ["UPLOADED", "MAPPED", "VALIDATED", "READY", "FAILED"].includes(String(status || ""));
}

function getImportCancelTargetId() {
  if (currentImportId && isCancellableImportUiStatus(importUi.batchStatus)) return currentImportId;
  if (importResumeActive?.id && isCancellableImportUiStatus(importResumeActive.status)) return importResumeActive.id;
  return currentImportId || importResumeActive?.id || null;
}

function setImportSyncState(kind, extra) {
  const el = document.getElementById("importSyncLine");
  const time = formatImportClock();
  importUi.lastSyncAt = new Date();
  if (!el) return;
  if (kind === "error") {
    importUi.syncOk = false;
    el.className = "import-sync-line is-error";
    el.textContent = `Última sincronización: ${time} · ${extra || "No se pudo sincronizar el estado"}`;
    return;
  }
  importUi.syncOk = true;
  el.className = "import-sync-line is-ok";
  el.textContent = extra
    ? `Última sincronización: ${time} · ${extra}`
    : `Última sincronización: ${time}`;
}

function hideImportResumeBanner() {
  document.getElementById("importResumeBanner")?.classList.add("hidden");
}

function showImportResumeBanner(active) {
  const banner = document.getElementById("importResumeBanner");
  const meta = document.getElementById("importResumeMeta");
  if (!banner || !meta || !active) return;
  const last = active.lastUpdated || active.createdAt;
  meta.innerHTML =
    `<div><strong>Archivo:</strong> ${escCell(active.originalFileName || "—")}</div>` +
    `<div><strong>Hoja:</strong> ${escCell(active.sheetName || "—")}</div>` +
    `<div><strong>Estado:</strong> ${escCell(importStatusLabel(active.status))}</div>` +
    `<div><strong>Filas:</strong> ${formatImportCount(active.totalRows || active.sheetRows || 0)}</div>` +
    `<div><strong>Última actualización:</strong> ${escCell(formatMexicoCityDateTime(last))}</div>`;
  banner.classList.remove("hidden");
}

function resetImportWizardLocalState() {
  currentImportId = null;
  currentImportMapping = {};
  importUi.fileName = "";
  importUi.sheetName = "";
  importUi.sheetRows = 0;
  importUi.mappingApplied = false;
  importUi.mappingDirty = false;
  importUi.appliedMappingJson = "";
  importUi.validated = false;
  importUi.confirmed = false;
  importUi.totalRows = 0;
  importUi.validRows = 0;
  importUi.warningRows = 0;
  importUi.blocked = 0;
  importUi.unresolved = 0;
  importUi.customerBlank = 0;
  importUi.freeToSaleAssigned = 0;
  importUi.projectAssigned = 0;
  importUi.ready = 0;
  importUi.ignored = 0;
  importUi.corrections = 0;
  importUi.batchStatus = "";
  importUi.confirmable = false;
  importUi.confirmableReason = "";
  importUi.reviewSynced = false;
  importUi.reviewStale = false;
  importUi.error = "";
  const select = document.getElementById("importSheetSelect");
  if (select) select.innerHTML = '<option value="">Carga un archivo primero</option>';
  const mappingBox = document.getElementById("importMappingBox");
  if (mappingBox) mappingBox.innerHTML = "";
  const preview = document.getElementById("importPreviewBox");
  if (preview) preview.innerHTML = "";
  const summary = document.getElementById("importValidateSummary");
  if (summary) summary.innerHTML = "";
  const review = document.getElementById("importReviewQueueBox");
  if (review) review.innerHTML = "";
  importMissingLocations = [];
}

function resetImportDownstream(fromStep) {
  if (fromStep <= 3) {
    importUi.mappingApplied = false;
    importUi.mappingDirty = false;
    importUi.appliedMappingJson = "";
  }
  if (fromStep <= 4) {
    importUi.validated = false;
    importUi.totalRows = 0;
    importUi.validRows = 0;
    importUi.warningRows = 0;
    importUi.blocked = 0;
    importUi.unresolved = 0;
    importUi.customerBlank = 0;
    importUi.freeToSaleAssigned = 0;
    importUi.projectAssigned = 0;
    const preview = document.getElementById("importPreviewBox");
    const summary = document.getElementById("importValidateSummary");
    if (preview) preview.innerHTML = "";
    if (summary) summary.innerHTML = "";
  }
  if (fromStep <= 5) {
    const review = document.getElementById("importReviewQueueBox");
    if (review) review.innerHTML = "";
    importUi.reviewSynced = false;
    importUi.reviewStale = true;
  }
  importUi.confirmed = false;
}

function getImportConfirmBlockReason() {
  if (importUi.busy) return "Hay una operación en curso.";
  if (importUi.batchStatus === "CANCELLED") return "La importación fue cancelada.";
  if (importUi.batchStatus === "PROCESSING") return "La importación está en proceso de confirmación.";
  if (importUi.batchStatus === "COMPLETED") return "La importación ya fue confirmada.";
  if (!currentImportId || !importUi.fileName) return "Sube un archivo primero.";
  if (!importUi.sheetName) return "Selecciona una hoja.";
  if (!importUi.mappingApplied) return "Aplica el mapeo antes de confirmar.";
  if (importUi.mappingDirty) return "Hay cambios de mapeo pendientes de aplicar.";
  if (!importUi.validated) return "Valida el archivo antes de confirmar.";
  if (importUi.blocked > 0) return `Hay ${formatImportCount(importUi.blocked)} registros bloqueados por revisar.`;
  if (importUi.unresolved > 0) {
    return `Hay ${formatImportCount(importUi.unresolved)} asignaciones sin resolver.`;
  }
  if (document.getElementById("importInventoryMode")?.value === "RECONCILE") {
    return "RECONCILE solo permite preview; no se puede confirmar.";
  }
  if (isImportReconcilePreviewMode()) {
    return "La vista previa de conciliación no puede confirmarse.";
  }
  if (importUi.confirmableReason && importUi.confirmable === false) return importUi.confirmableReason;
  return "";
}

function setImportStep(step, kind, stateText, detailText) {
  const el = document.querySelector(`[data-import-step="${step}"]`);
  const stateEl = document.getElementById(`importStepState-${step}`);
  const detailEl = document.getElementById(`importStepDetail-${step}`);
  if (el) {
    el.classList.remove("is-pending", "is-current", "is-busy", "is-done", "is-warn", "is-locked");
    el.classList.add(`is-${kind}`);
  }
  if (stateEl) stateEl.textContent = stateText;
  if (detailEl && detailText != null) detailEl.textContent = detailText;
}

function setImportButton(id, { disabled, label, html, locked, reason }) {
  const btn = document.getElementById(id);
  if (!btn) return;
  btn.disabled = Boolean(disabled);
  btn.setAttribute("aria-disabled", disabled ? "true" : "false");
  btn.title = disabled && reason ? reason : "";
  if (html) btn.innerHTML = html;
  else if (label) btn.textContent = label;
  if (id === "importConfirmBtn") {
    btn.classList.remove("btn-success", "btn-confirm-locked", "btn-secondary");
    btn.classList.add(locked || disabled ? "btn-confirm-locked" : "btn-success");
  }
}

function syncImportWizardUi() {
  const busy = importUi.busy;
  const banner = document.getElementById("importBusyBanner");
  if (banner) {
    banner.classList.toggle("hidden", !busy);
    banner.innerHTML = busy
      ? `<span class="import-spinner"></span><span>${escCell(importUi.busyLabel || "Procesando…")}</span>`
      : "";
  }
  const status = document.getElementById("importStatus");
  if (status) {
    status.classList.toggle("error", Boolean(importUi.error) && !busy);
    if (importUi.error && !busy) status.textContent = importUi.error;
  }
  const fileInput = document.getElementById("importFile");
  if (fileInput) fileInput.disabled = busy;
  const mappingBox = document.getElementById("importMappingBox");
  if (mappingBox) mappingBox.style.pointerEvents = busy || !importUi.sheetName ? "none" : "";

  const fileReady = Boolean(currentImportId && importUi.fileName);
  const sheetReady = fileReady && Boolean(importUi.sheetName);
  const mappingReady = sheetReady && importUi.mappingApplied && !importUi.mappingDirty;
  const confirmReason = getImportConfirmBlockReason();
  const confirmable = !confirmReason;
  const sheetLockReason = "Bloqueado hasta cargar un archivo.";
  const mapLockReason = "Bloqueado hasta seleccionar una hoja.";
  const validateLockReason = "Bloqueado hasta aplicar el mapeo.";
  const reviewLockReason = "Bloqueado hasta validar el archivo.";
  const csvLockReason = "Bloqueado hasta validar el archivo.";
  const sheetSelect = document.getElementById("importSheetSelect");
  if (sheetSelect) {
    sheetSelect.disabled = busy || !currentImportId;
    sheetSelect.title = currentImportId ? "" : sheetLockReason;
  }

  document.querySelector('[data-step-body="file"]')?.classList.toggle("is-step-locked", false);
  document.querySelector('[data-step-body="sheet"]')?.classList.toggle("is-step-locked", !fileReady);
  document.querySelector('[data-step-body="mapping"]')?.classList.toggle("is-step-locked", !sheetReady);
  document.querySelector('[data-step-body="validate"]')?.classList.toggle("is-step-locked", !mappingReady);
  document.querySelector('[data-step-body="review"]')?.classList.toggle("is-step-locked", !importUi.validated);
  document.querySelector('[data-step-body="confirm"]')?.classList.toggle("is-step-locked", !confirmable && !importUi.confirmed);

  if (busy && importUi.busyLabel.toLowerCase().includes("subiendo")) {
    setImportStep("file", "busy", "En curso", importUi.fileName || "Cargando archivo…");
    setImportButton("importUploadBtn", {
      disabled: true,
      html: '<span class="import-spinner"></span>Subiendo archivo…'
    });
  } else if (fileReady) {
    setImportStep("file", "done", "Completado", `✓ Archivo cargado: ${importUi.fileName}`);
    setImportButton("importUploadBtn", {
      disabled: true,
      label: "✓ Archivo cargado",
      reason: "El archivo ya está cargado en este lote."
    });
  } else {
    setImportStep("file", "current", "Pendiente", "Selecciona el archivo a cargar.");
    setImportButton("importUploadBtn", { disabled: busy, label: "Subir archivo" });
  }
  const fileMeta = document.getElementById("importFileMeta");
  if (fileMeta) fileMeta.textContent = fileReady ? `✓ Archivo cargado: ${importUi.fileName}` : "";

  if (!fileReady) {
    setImportStep("sheet", "locked", "Bloqueado", "Espera a que el archivo esté cargado.");
  } else if (busy && importUi.busyLabel.toLowerCase().includes("hoja")) {
    setImportStep("sheet", "busy", "En curso", "Seleccionando hoja…");
  } else if (sheetReady) {
    setImportStep(
      "sheet",
      "done",
      "Completado",
      `✓ Hoja seleccionada: ${importUi.sheetName} — ${formatImportCount(importUi.sheetRows)} filas`
    );
  } else {
    setImportStep("sheet", "current", "Pendiente", "Elige la hoja a importar.");
  }
  const sheetMeta = document.getElementById("importSheetMeta");
  if (sheetMeta) {
    sheetMeta.textContent = !fileReady
      ? "Bloqueado hasta cargar un archivo."
      : sheetReady
        ? `✓ Hoja seleccionada: ${importUi.sheetName} — ${formatImportCount(importUi.sheetRows)} filas`
        : "Selecciona la hoja activa.";
  }

  if (!sheetReady) {
    setImportStep("mapping", "locked", "Bloqueado", "Requiere una hoja seleccionada.");
    setImportButton("importMapBtn", { disabled: true, label: "Aplicar mapeo", reason: mapLockReason });
  } else if (busy && importUi.busyLabel.toLowerCase().includes("mapeo")) {
    setImportStep("mapping", "busy", "En curso", "Aplicando mapeo…");
    setImportButton("importMapBtn", {
      disabled: true,
      html: '<span class="import-spinner"></span>Aplicando mapeo…'
    });
  } else if (importUi.mappingDirty || !importUi.mappingApplied) {
    setImportStep("mapping", "current", "Pendiente", "Hay cambios pendientes de aplicar.");
    setImportButton("importMapBtn", { disabled: busy, label: "Aplicar mapeo" });
  } else {
    setImportStep("mapping", "done", "Completado", "✓ Mapeo aplicado");
    setImportButton("importMapBtn", {
      disabled: true,
      label: "✓ Mapeo aplicado",
      reason: "Modifica el mapeo para volver a aplicar."
    });
  }

  if (!mappingReady) {
    setImportStep("validate", "locked", "Bloqueado", "Requiere mapeo aplicado.");
    setImportButton("importValidateBtn", { disabled: true, label: "Validar", reason: validateLockReason });
  } else if (busy && importUi.busyLabel.toLowerCase().includes("validando")) {
    setImportStep(
      "validate",
      "busy",
      "En curso",
      `Validando ${formatImportCount(importUi.sheetRows)} filas…`
    );
    setImportButton("importValidateBtn", {
      disabled: true,
      html: `<span class="import-spinner"></span>Validando ${formatImportCount(importUi.sheetRows)} filas…`
    });
  } else if (importUi.validated) {
    setImportStep(
      "validate",
      "done",
      "Completado",
      `✓ Validado · Total ${formatImportCount(importUi.totalRows)} · Listas ${formatImportCount(importUi.validRows)} · Advertencias ${formatImportCount(importUi.warningRows)} · Bloqueadas ${formatImportCount(importUi.blocked)}`
    );
    setImportButton("importValidateBtn", {
      disabled: true,
      label: "✓ Validado",
      reason: "Cambia el mapeo o los datos para volver a validar."
    });
  } else {
    setImportStep("validate", "current", "Pendiente", "Ejecuta la validación del archivo.");
    setImportButton("importValidateBtn", { disabled: busy, label: "Validar" });
  }

  if (!importUi.validated) {
    setImportStep("review", "locked", "Bloqueado", "Requiere validación previa.");
    setImportButton("importReviewBtn", { disabled: true, label: "Actualizar revisión", reason: reviewLockReason });
  } else if (busy && /correcci|revisi/i.test(importUi.busyLabel)) {
    setImportStep("review", "busy", "En curso", importUi.busyLabel);
    setImportButton("importReviewBtn", {
      disabled: true,
      html: '<span class="import-spinner"></span>Procesando revisión…'
    });
  } else if (importUi.blocked > 0 || importUi.unresolved > 0) {
    setImportStep(
      "review",
      "warn",
      "Requiere revisión",
      `⚠ Revisión requerida — ${formatImportCount(importUi.blocked)} bloqueados${
        importUi.unresolved ? ` · ${formatImportCount(importUi.unresolved)} sin asignar` : ""
      }`
    );
    setImportButton("importReviewBtn", { disabled: busy, label: "Actualizar revisión" });
  } else if (importUi.reviewSynced && !importUi.reviewStale) {
    setImportStep("review", "done", "Completado", "✓ Revisión sincronizada");
    setImportButton("importReviewBtn", {
      disabled: true,
      label: "✓ Revisión sincronizada",
      reason: "Sin cambios pendientes de revisión."
    });
  } else {
    setImportStep("review", "done", "Completado", "✓ Sin bloqueos pendientes");
    setImportButton("importReviewBtn", { disabled: busy, label: "Actualizar revisión" });
  }

  const hint = document.getElementById("importConfirmHint");
  const reconcilePreview = isImportReconcilePreviewMode();
  if (reconcilePreview && !importUi.confirmed) {
    setImportStep("confirm", "locked", "No aplica", "No aplica — vista previa únicamente");
    setImportButton("importConfirmBtn", {
      disabled: true,
      locked: true,
      label: "No aplica",
      reason: "La vista previa de conciliación no modifica inventario."
    });
    if (hint) {
      hint.textContent = "Este modo sirve únicamente para comparar/revisar. No puede confirmarse.";
    }
  } else if (busy && importUi.busyLabel.toLowerCase().includes("confirm")) {
    setImportStep("confirm", "busy", "En curso", "Confirmando importación…");
    setImportButton("importConfirmBtn", {
      disabled: true,
      locked: true,
      html: '<span class="import-spinner"></span>Confirmando…'
    });
    if (hint) hint.textContent = "Confirmando importación. No cierres esta pantalla.";
  } else if (importUi.confirmed) {
    setImportStep("confirm", "done", "Completado", "✓ Importación confirmada");
    setImportButton("importConfirmBtn", { disabled: true, locked: true, label: "✓ Confirmado" });
    if (hint) hint.textContent = "La importación ya fue confirmada.";
  } else if (confirmable) {
    setImportStep("confirm", "current", "Pendiente", "Listo para confirmar. Esta acción escribe datos.");
    setImportButton("importConfirmBtn", { disabled: busy, locked: false, label: "Confirmar importación" });
    if (hint) hint.textContent = "El archivo ya puede confirmarse. El servidor volverá a verificar bloqueos y asignaciones.";
  } else {
    setImportStep("confirm", "locked", "Bloqueado", `🔒 Confirmar. ${confirmReason}`);
    setImportButton("importConfirmBtn", { disabled: true, locked: true, label: "🔒 Confirmar", reason: confirmReason });
    if (hint) hint.textContent = `🔒 Confirmar. ${confirmReason}`;
  }
  setImportButton("importNormalizedBtn", {
    disabled: busy || !importUi.validated,
    label: "CSV normalizado",
    reason: busy || !importUi.validated ? csvLockReason : ""
  });
  const mapHint = document.getElementById("importMapHint");
  if (mapHint) mapHint.textContent = sheetReady ? (importUi.mappingDirty || !importUi.mappingApplied ? "Hay cambios pendientes de aplicar." : "✓ Mapeo aplicado") : mapLockReason;
  const validateHint = document.getElementById("importValidateHint");
  if (validateHint) {
    validateHint.textContent = mappingReady
      ? (importUi.validated ? "✓ Validado" : "Listo para validar.")
      : validateLockReason;
  }
  const reviewHint = document.getElementById("importReviewHint");
  if (reviewHint) {
    reviewHint.textContent = importUi.validated
      ? (importUi.blocked > 0 || importUi.unresolved > 0
        ? `⚠ Revisión requerida — ${formatImportCount(importUi.blocked)} bloqueados${
          importUi.unresolved ? ` · ${formatImportCount(importUi.unresolved)} sin asignar` : ""
        }`
        : "✓ Sin bloqueos pendientes")
      : reviewLockReason;
  }
  document.querySelectorAll("#importReviewQueueBox button").forEach((btn) => {
    btn.disabled = busy;
  });
  const wizardCancel = document.getElementById("importCancelBtn");
  if (wizardCancel) {
    const showWizardCancel = Boolean(currentImportId && isCancellableImportUiStatus(importUi.batchStatus));
    wizardCancel.classList.toggle("hidden", !showWizardCancel);
    wizardCancel.disabled = busy || !showWizardCancel;
  }
  const bannerCancel = document.getElementById("importResumeDiscardBtn");
  if (bannerCancel) {
    const showBannerCancel = Boolean(importResumeActive?.id && isCancellableImportUiStatus(importResumeActive.status));
    bannerCancel.classList.toggle("hidden", !showBannerCancel);
    bannerCancel.disabled = busy || !showBannerCancel;
  }
  updateImportWizardChrome();
  syncImportInventoryModeUi();
}

async function withImportLock(label, fn) {
  if (importUi.busy) return { skipped: true };
  importUi.busy = true;
  importUi.busyLabel = label;
  importUi.error = "";
  syncImportWizardUi();
  try {
    await fn();
    return { ok: true };
  } catch (error) {
    console.error("[import]", error);
    importUi.error = error instanceof Error ? error.message : "Error en el importador.";
    setImportStatus(importUi.error, true);
    return { ok: false };
  } finally {
    importUi.busy = false;
    importUi.busyLabel = "";
    syncImportWizardUi();
  }
}

async function downloadExport(url, filename) {
  const response = await authenticatedFetch(url);
  if (!response) {
    window.alert("Sesión expirada. Vuelve a iniciar sesión para exportar.");
    return;
  }
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    window.alert(data.message || "No se pudo completar la exportación. Intenta de nuevo.");
    return;
  }
  const blob = await response.blob();
  if (!blob || blob.size === 0) {
    window.alert("No se pudo completar la exportación. Intenta de nuevo.");
    return;
  }
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(link.href), 500);
}

function setImportStatus(text, isError) {
  const el = document.getElementById("importStatus");
  if (!el) return;
  el.textContent = text || "";
  el.classList.toggle("error", Boolean(isError));
  if (isError) importUi.error = text || "";
  else if (!importUi.busy) importUi.error = "";
}

function renderImportMapping(headers, mapping) {
  const box = document.getElementById("importMappingBox");
  if (!box) return;
  currentImportMapping = { ...mapping };
  const fields = [
    "", "sku", "barcode", "name", "description", "qty", "location", "status", "lotNumber", "serialNumber", "imei",
    "unitPriceMxn", "unitPriceUsd", "receivedAt", "reference", "notes", "client", "project", "unit",
    "serialControlled", "lotControlled", "warehouse", "priority", "requisitionNumber", "legalName", "tradeName", "rfc", "email", "phone"
  ];
  box.innerHTML = `<table class="excel-table"><thead><tr><th>Columna archivo</th><th>Campo LOGITEC</th></tr></thead><tbody>${
    (headers || []).map((h) => {
      const selected = mapping?.[h] || "";
      return `<tr><td>${escCell(h)}</td><td><select data-map-header="${escCell(h)}">${fields.map((f) => `<option value="${f}" ${f === selected ? "selected" : ""}>${f || "— ignorar —"}</option>`).join("")}</select></td></tr>`;
    }).join("")
  }</tbody></table>`;
  box.querySelectorAll("select[data-map-header]").forEach((sel) => {
    sel.addEventListener("change", () => {
      if (importHydrating) return;
      const header = sel.getAttribute("data-map-header");
      currentImportMapping[header] = sel.value || null;
      importUi.mappingDirty =
        !importUi.appliedMappingJson || JSON.stringify(currentImportMapping) !== importUi.appliedMappingJson;
      resetImportDownstream(4);
      syncImportWizardUi();
    });
  });
}

function resolveImportMissingLocations(data, groups) {
  const fromState = Array.isArray(data?.missingLocations) ? data.missingLocations : [];
  if (fromState.length) {
    return fromState
      .map((item) => ({
        code: String(item.code || "").trim().toUpperCase(),
        records: Number(item.records || 0)
      }))
      .filter((item) => item.code);
  }
  const grouped = new Map();
  (Array.isArray(groups) ? groups : []).forEach((group) => {
    if (group.issueCode !== "SOURCE_LOCATION_NOT_IN_MASTER") return;
    const code = String(group.sourceValue || "").trim().toUpperCase();
    if (!code) return;
    grouped.set(code, (grouped.get(code) || 0) + Number(group.records || 0));
  });
  return [...grouped.entries()]
    .map(([code, records]) => ({ code, records }))
    .sort((a, b) => b.records - a.records || a.code.localeCompare(b.code));
}

function syncImportMissingLocConfirmEnabled() {
  const ack = document.getElementById("importMissingLocAck");
  const btn = document.getElementById("importMissingLocConfirmBtn");
  if (!btn) return;
  btn.disabled = importUi.busy || !ack?.checked || !importMissingLocations.length;
}

function closeImportMissingLocModal(force) {
  if (importUi.busy && !force) return;
  const modal = document.getElementById("importMissingLocModal");
  if (!modal) return;
  modal.classList.remove("open");
  modal.setAttribute("aria-hidden", "true");
  const ack = document.getElementById("importMissingLocAck");
  if (ack) ack.checked = false;
  const err = document.getElementById("importMissingLocError");
  if (err) err.textContent = "";
  document.getElementById("importMissingLocBusy")?.classList.add("hidden");
  syncImportMissingLocConfirmEnabled();
}

function openImportMissingLocModal() {
  if (importUi.busy || !importMissingLocations.length) return;
  const modal = document.getElementById("importMissingLocModal");
  const lead = document.getElementById("importMissingLocLead");
  const list = document.getElementById("importMissingLocList");
  const err = document.getElementById("importMissingLocError");
  const ack = document.getElementById("importMissingLocAck");
  if (!modal || !lead || !list) return;
  const codes = importMissingLocations.length;
  const records = importMissingLocations.reduce((sum, item) => sum + Number(item.records || 0), 0);
  lead.textContent = `Se crearán ${formatImportCount(codes)} ubicaciones nuevas en el catálogo maestro. Esto permitirá validar ${formatImportCount(records)} registros del archivo.`;
  list.innerHTML = `<ul>${importMissingLocations.map((item) => `<li><strong>${escCell(item.code)}</strong> — ${formatImportCount(item.records)} registros</li>`).join("")}</ul>`;
  if (err) err.textContent = "";
  if (ack) ack.checked = false;
  document.getElementById("importMissingLocBusy")?.classList.add("hidden");
  modal.classList.add("open");
  modal.setAttribute("aria-hidden", "false");
  syncImportMissingLocConfirmEnabled();
}

async function createImportMissingLocationsAndRevalidate() {
  if (importUi.busy || !currentImportId || !importMissingLocations.length) return;
  const ack = document.getElementById("importMissingLocAck");
  if (!ack?.checked) return;
  void withImportLock("Creando ubicaciones…", async () => {
    const confirmBtn = document.getElementById("importMissingLocConfirmBtn");
    const cancelBtn = document.getElementById("importMissingLocCancelBtn");
    const closeX = document.getElementById("importMissingLocCloseX");
    const busyEl = document.getElementById("importMissingLocBusy");
    const err = document.getElementById("importMissingLocError");
    if (confirmBtn) {
      confirmBtn.disabled = true;
      confirmBtn.textContent = "Creando ubicaciones…";
    }
    if (cancelBtn) cancelBtn.disabled = true;
    if (closeX) closeX.disabled = true;
    if (busyEl) busyEl.classList.remove("hidden");
    if (err) err.textContent = "";
    try {
      const created = await authenticatedFetch(`/api/imports/${currentImportId}/review/missing-locations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmPhysical: true })
      });
      if (!created?.ok) {
        const body = await created?.json().catch(() => ({}));
        throw new Error(body.message || "No se pudieron crear las ubicaciones.");
      }
      const createdBody = await created.json();
      const validated = await authenticatedFetch(`/api/imports/${currentImportId}/validate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}"
      });
      if (validated && !validated.ok) {
        const body = await validated.json().catch(() => ({}));
        throw new Error(body.message || "Las ubicaciones se crearon, pero no se pudo revalidar.");
      }
      await hydrateImportFromServer(currentImportId);
      setImportStatus(
        `✓ Ubicaciones sincronizadas. Creadas: ${formatImportCount((createdBody.created || []).length)}. Bloqueados: ${formatImportCount(importUi.blocked)}. Sin asignar: ${formatImportCount(importUi.unresolved)}.`
      );
      closeImportMissingLocModal(true);
    } catch (error) {
      if (err) err.textContent = error instanceof Error ? error.message : "No se pudieron crear las ubicaciones.";
      throw error;
    } finally {
      if (busyEl) busyEl.classList.add("hidden");
      if (confirmBtn) confirmBtn.textContent = "Crear ubicaciones y revalidar";
      if (cancelBtn) cancelBtn.disabled = false;
      if (closeX) closeX.disabled = false;
      syncImportMissingLocConfirmEnabled();
    }
  });
}

function applyImportCountsFromServer(state) {
  const counts = state.counts || {};
  const assignment = state.assignmentSummary || {};
  importUi.totalRows = Number(state.totalRows || 0);
  importUi.validRows = Number(state.validRows || 0);
  importUi.warningRows = Number(state.warningRows || 0);
  importUi.blocked = Number(counts.BLOCKED ?? state.invalidRows ?? 0);
  importUi.unresolved = Number(assignment.assignmentUnresolved ?? state.unresolvedCount ?? 0);
  importUi.customerBlank = Number(assignment.customerBlank || 0);
  importUi.freeToSaleAssigned = Number(assignment.freeToSaleAssigned || 0);
  importUi.projectAssigned = Number(assignment.projectAssigned || 0);
  importUi.ready = Number(counts.READY || 0);
  importUi.ignored = Number(counts.IGNORED || 0);
  importUi.corrections = Number(state.correctionsCount || 0);
  importUi.confirmable = Boolean(state.confirmable);
  importUi.confirmableReason = state.confirmableReason || "";
  importUi.batchStatus = state.status || "";
  importUi.validated = Boolean(state.validated) || ["VALIDATED", "READY", "PROCESSING", "COMPLETED"].includes(state.status);
  importUi.confirmed = state.status === "COMPLETED";
}

function renderImportValidateSummary() {
  const summary = document.getElementById("importValidateSummary");
  if (!summary) return;
  if (!importUi.validated) {
    summary.innerHTML = "";
    return;
  }
  const warningNote =
    importUi.blocked === 0 && importUi.warningRows > 0
      ? `<p class="assignee-hint">Advertencias (${formatImportCount(importUi.warningRows)}): requieren revisión pero no bloquean la confirmación mientras no haya registros bloqueados.</p>`
      : "";
  summary.innerHTML =
    importStatBadge("Total", importUi.totalRows) +
    importStatBadge("CUSTOMER vacío", importUi.customerBlank, "info") +
    importStatBadge("FREE TO SALE", importUi.freeToSaleAssigned, "info") +
    importStatBadge("Con proyecto", importUi.projectAssigned, "info") +
    importStatBadge("Listas", importUi.validRows, "ok") +
    importStatBadge("Advertencias", importUi.warningRows, importUi.blocked > 0 ? "warning" : "info") +
    importStatBadge("Bloqueadas", importUi.blocked, importUi.blocked > 0 ? "blocked" : "ok") +
    (importUi.unresolved ? importStatBadge("Sin asignar", importUi.unresolved, "warning") : "") +
    warningNote +
    (importUi.freeToSaleAssigned
      ? `<p class="assignee-hint" style="margin:8px 0 0">FREE TO SALE es inventario libre; no pertenece a un proyecto y no se mezcla con la lista de proyectos.</p>`
      : "");
}

function renderImportPreviewRows(previewRows) {
  const preview = document.getElementById("importPreviewBox");
  if (!preview) return;
  const rows = Array.isArray(previewRows) ? previewRows : [];
  if (!rows.length) {
    preview.innerHTML = importUi.validated ? "<p class='assignee-hint'>Sin vista previa de filas validadas.</p>" : "";
    return;
  }
  preview.innerHTML = `<table class="excel-table"><thead><tr><th>Fila</th><th>Acción</th><th>Errores</th><th>Warnings</th><th>Normalizado</th></tr></thead><tbody>${
    rows.map((r) => `<tr><td>${r.sourceRow}</td><td>${escCell(r.action || "—")}</td><td>${escCell((r.errors || []).map((e) => e.code).join(", ") || "—")}</td><td>${escCell((r.warnings || []).map((w) => w.code).join(", ") || "—")}</td><td>${escCell(JSON.stringify(r.normalized || {}))}</td></tr>`).join("")
  }</tbody></table>`;
}

function applyImportServerState(state) {
  if (!state?.id) return;
  if (isTerminalImportUiBatch(state.status)) return;
  importHydrating = true;
  try {
    currentImportId = state.id;
    importUi.fileName = state.originalFileName || "";
    importUi.sheetName = state.sheetName || state.selectedSheet || "";
    importUi.sheetRows = Number(state.sheetRows || state.totalRows || 0);
    applyImportCountsFromServer(state);
    const contextEl = document.getElementById("importContext");
    if (contextEl && state.context) contextEl.value = state.context;
    setImportReconcilePreviewMode(state.inventoryMode === "RECONCILE");
    const currencyEl = document.getElementById("importPriceCurrency");
    if (currencyEl) currencyEl.value = state.priceCurrency || "";
    const sheets = Array.isArray(state.sheets) ? state.sheets : [];
    const multiSheet = isMultiSheetImportUpload(sheets, state.originalFileName || importUi.fileName);
    const needsSheetPick = multiSheet && state.status === "UPLOADED" && !state.hasMapping;
    if (needsSheetPick) {
      importUi.sheetName = "";
      importUi.sheetRows = 0;
    }
    const select = document.getElementById("importSheetSelect");
    if (select) {
      select.innerHTML = sheets.length
        ? renderImportSheetSelectOptions(sheets, {
            selected: needsSheetPick ? "" : importUi.sheetName,
            includePlaceholder: multiSheet
          })
        : '<option value="">Sin hojas</option>';
      select.disabled = !sheets.length;
      if (!needsSheetPick && importUi.sheetName) select.value = importUi.sheetName;
    }
    const sheetMeta = document.getElementById("importSheetMeta");
    if (sheetMeta) {
      if (needsSheetPick) {
        const suggested = suggestImportSheet(sheets, state.context);
        sheetMeta.textContent = suggested
          ? `Sugerida: ${suggested.name} (${formatImportCount(suggested.totalDataRows)} filas). Confirma la hoja en el selector.`
          : "Selecciona la hoja a importar.";
      } else if (importUi.sheetName) {
        sheetMeta.textContent = `✓ Hoja seleccionada: ${importUi.sheetName} — ${formatImportCount(importUi.sheetRows)} filas`;
      }
    }
    const selected = importUi.sheetName ? sheets.find((s) => s.name === importUi.sheetName) : null;
    const mapping = state.mapping && typeof state.mapping === "object" ? state.mapping : {};
    if (selected || Object.keys(mapping).length) {
      renderImportMapping(selected?.headers || Object.keys(mapping), mapping);
    } else {
      const mappingBox = document.getElementById("importMappingBox");
      if (mappingBox) mappingBox.innerHTML = "";
    }
    importUi.mappingApplied = Boolean(state.hasMapping) && ["MAPPED", "VALIDATED", "READY", "PROCESSING", "COMPLETED"].includes(state.status);
    importUi.appliedMappingJson = importUi.mappingApplied ? JSON.stringify(currentImportMapping) : "";
    importUi.mappingDirty = false;
    renderImportValidateSummary();
    renderImportPreviewRows(state.previewRows);
    if (importUi.validated) renderImportReviewFromState(state);
    else {
      const review = document.getElementById("importReviewQueueBox");
      if (review) review.innerHTML = "";
    }
    rememberImportBatchId(state.id);
  } finally {
    importHydrating = false;
  }
  syncImportWizardUi();
}

async function hydrateImportFromServer(id) {
  if (!id) return null;
  const response = await authenticatedFetch(`/api/imports/${id}/state`);
  if (!response?.ok) {
    const err = await response?.json().catch(() => ({}));
    setImportSyncState("error", "No se pudo sincronizar el estado");
    throw new Error(err.message || "No se pudo sincronizar el estado");
  }
  const state = await response.json();
  applyImportServerState(state);
  setImportSyncState("ok", "✓ Estado sincronizado con servidor");
  return state;
}

async function probeResumableImport() {
  if (currentRole !== "ADMIN" || importUi.busy) return;
  try {
    const response = await authenticatedFetch("/api/imports/active");
    if (!response?.ok) {
      setImportSyncState("error", "No se pudo sincronizar el estado");
      return;
    }
    const data = await response.json();
    const active = data.available ? data.import : null;
    importResumeActive = active;
    setImportSyncState("ok");
    const alreadyOpen = Boolean(active && currentImportId === active.id);
    const dismissed = Boolean(active && importResumeDismissedId === active.id);
    if (active && !alreadyOpen && !dismissed) showImportResumeBanner(active);
    else hideImportResumeBanner();
  } catch (_error) {
    setImportSyncState("error", "No se pudo sincronizar el estado");
  }
}

async function continueResumableImport() {
  const id = importResumeActive?.id;
  if (!id) return;
  openImportWizardPanel();
  void withImportLock("Reconstruyendo importación…", async () => {
    await hydrateImportFromServer(id);
    importResumeDismissedId = null;
    hideImportResumeBanner();
    setImportStatus(
      importUi.blocked > 0 || importUi.unresolved > 0
        ? `✓ Importación reanudada. Bloqueados: ${formatImportCount(importUi.blocked)}. Sin asignar: ${formatImportCount(importUi.unresolved)}.`
        : `✓ Importación reanudada. FREE TO SALE ${formatImportCount(importUi.freeToSaleAssigned)}. Sin asignar ${formatImportCount(importUi.unresolved)}.`
    );
  });
}

function openImportCancelModal() {
  if (importUi.busy) return;
  const id = getImportCancelTargetId();
  if (!id) return;
  openModal("importCancelModal");
}

function closeImportCancelModal() {
  closeModal("importCancelModal");
}

async function submitImportCancel() {
  const id = getImportCancelTargetId();
  if (!id) return;
  closeImportCancelModal();
  void withImportLock("Cancelando importación temporal…", async () => {
    const response = await authenticatedFetch(`/api/imports/${id}/cancel`, { method: "POST" });
    const data = await response?.json().catch(() => ({}));
    if (!response?.ok) {
      throw new Error(data.message || "No se pudo cancelar la importación temporal.");
    }
    if (data.status !== "CANCELLED" || data.inventoryChanged !== false) {
      throw new Error("La cancelación no se confirmó correctamente.");
    }
    await refreshImportHistory();
    const activeRes = await authenticatedFetch("/api/imports/active");
    const activeData = activeRes?.ok ? await activeRes.json().catch(() => ({})) : {};
    if (activeData.available && activeData.import?.id === id) {
      throw new Error("El lote cancelado sigue apareciendo como activo.");
    }
    showImportCompletionNotice("Importación temporal cancelada. El inventario no cambió.");
    dismissImportWizardSession({ clearStoredBatch: true });
    closeImportWizardPanel();
  });
}

async function applyImportReviewCorrection(payload, successLabel) {
  importUi.reviewStale = true;
  importUi.reviewSynced = false;
  const previous = {
    blocked: importUi.blocked,
    unresolved: importUi.unresolved,
    validRows: importUi.validRows,
    warningRows: importUi.warningRows,
    totalRows: importUi.totalRows
  };
  const result = await authenticatedFetch(`/api/imports/${currentImportId}/review`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  if (!result?.ok) {
    const err = await result?.json().catch(() => ({}));
    importUi.blocked = previous.blocked;
    importUi.unresolved = previous.unresolved;
    importUi.validRows = previous.validRows;
    importUi.warningRows = previous.warningRows;
    importUi.totalRows = previous.totalRows;
    syncImportWizardUi();
    throw new Error(err.message || "No se pudo guardar la corrección.");
  }
  const validated = await authenticatedFetch(`/api/imports/${currentImportId}/validate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}"
  });
  if (validated && !validated.ok) {
    const err = await validated.json().catch(() => ({}));
    try {
      await hydrateImportFromServer(currentImportId);
    } catch (_syncError) {
      importUi.blocked = previous.blocked;
      importUi.unresolved = previous.unresolved;
      importUi.validRows = previous.validRows;
      importUi.warningRows = previous.warningRows;
      importUi.totalRows = previous.totalRows;
      syncImportWizardUi();
    }
    throw new Error(err.message || "No se pudo revalidar después de la corrección.");
  }
  await hydrateImportFromServer(currentImportId);
  setImportStatus(
    `${successLabel || "✓ Corrección aplicada."} Bloqueados: ${formatImportCount(importUi.blocked)}. Sin asignar: ${formatImportCount(importUi.unresolved)}.`
  );
}

function renderImportReviewFromState(data) {
  const box = document.getElementById("importReviewQueueBox");
  if (!box) return;
  const counts = data.counts || {};
  const groups = Array.isArray(data.groups) ? data.groups : [];
  const rows = Array.isArray(data.rows) ? data.rows : [];
  importMissingLocations = resolveImportMissingLocations(data, groups);
  const missingRecords = importMissingLocations.reduce((sum, item) => sum + Number(item.records || 0), 0);
  const missingBox = importMissingLocations.length
    ? `<div class="import-missing-box">
        <h4>Ubicaciones nuevas detectadas: ${formatImportCount(importMissingLocations.length)}</h4>
        <p class="module-lead">Registros afectados: ${formatImportCount(missingRecords)}. Los códigos fuente se conservarán exactamente.</p>
        <div class="table-wrap"><table class="excel-table"><thead><tr><th>Ubicación</th><th>Registros afectados</th><th>Estado</th></tr></thead><tbody>
          ${importMissingLocations.map((item) => `<tr><td>${escCell(item.code)}</td><td>${formatImportCount(item.records)}</td><td>No existe en maestro</td></tr>`).join("")}
        </tbody></table></div>
        <div class="page-toolbar" style="margin-top:10px">
          <button type="button" id="importMissingLocOpenBtn" class="btn-primary btn-compact">Dar de alta ubicaciones faltantes</button>
        </div>
      </div>`
    : "";
  const blockedCount = Number(counts.BLOCKED || importUi.blocked || 0);
  const warningCount = Number(counts.WARNING || importUi.warningRows || 0);
  const informationalGroups = groups.filter((g) => IMPORT_INFORMATIONAL_ISSUE_CODES.has(g.issueCode));
  const actionableGroups = groups.filter((g) => !IMPORT_INFORMATIONAL_ISSUE_CODES.has(g.issueCode));
  const informationalCount = informationalGroups.reduce((sum, g) => sum + Number(g.records || 0), 0);
  const reviewWarningCount = Math.max(0, warningCount - informationalCount);
  const warningNote =
    blockedCount === 0 && reviewWarningCount > 0
      ? `<p class="assignee-hint">Advertencias que requieren revisión (${formatImportCount(reviewWarningCount)}): revisar si aplica. No bloquean la confirmación mientras no haya registros bloqueados.</p>`
      : "";
  const informationalBox = informationalGroups.length
    ? `<div class="import-info-box" style="margin:10px 0">
        <h5 class="secondary-panel-title">Informativos (${formatImportCount(informationalCount)})</h5>
        <p class="assignee-hint">Estos avisos se resuelven automáticamente al confirmar. No requieren corrección manual.</p>
        <div class="table-wrap"><table class="excel-table"><thead><tr><th>Detalle</th><th>Proyecto / valor</th><th>Registros</th><th>Al confirmar</th></tr></thead><tbody>
          ${informationalGroups
            .map(
              (g) =>
                `<tr><td>${escCell(g.issueCode)}</td><td>${escCell(String(g.sourceValue ?? "—"))}</td><td>${formatImportCount(g.records)}</td><td>${importReviewGroupActionCell(g, 0)}</td></tr>`
            )
            .join("")}
        </tbody></table></div>
      </div>`
    : "";
  box.innerHTML = `
    <h4 class="secondary-panel-title">Bandeja de revisión</h4>
    ${(data.globalNotices || []).map((n) => `<p class="operational-table-meta">${escCell(n.message)}</p>`).join("")}
    <div class="page-toolbar">
      ${importStatBadge("Listos", counts.READY || 0, "ok")}
      ${importStatBadge("Informativos", informationalCount, "info")}
      ${importStatBadge("Advertencias", reviewWarningCount, blockedCount > 0 || reviewWarningCount > 0 ? "warning" : "ok")}
      ${importStatBadge("Bloqueados", blockedCount, blockedCount > 0 ? "blocked" : "ok")}
      ${importStatBadge("Ignorados", counts.IGNORED || 0)}
      ${importStatBadge("FREE TO SALE", data.assignmentSummary?.freeToSaleAssigned || importUi.freeToSaleAssigned, "info")}
      ${Number(data.unresolvedCount || importUi.unresolved || 0)
        ? importStatBadge("Sin asignar", data.unresolvedCount || importUi.unresolved, "warning")
        : ""}
    </div>
    ${warningNote}
    ${informationalBox}
    ${Number(data.assignmentSummary?.freeToSaleAssigned || importUi.freeToSaleAssigned || 0)
      ? `<p class="operational-table-meta">Las filas FREE TO SALE son inventario libre. No pertenecen a un proyecto y no se añaden a la lista de proyectos.</p>`
      : ""}
    ${missingBox}
    <div class="table-wrap"><table class="excel-table"><thead><tr><th>Problema</th><th>Valor fuente</th><th>Registros</th><th>Acción</th></tr></thead><tbody>
      ${actionableGroups.map((g, index) => `<tr><td>${escCell(g.issueCode)} · ${escCell(g.field || "fila")}</td><td>${escCell(String(g.sourceValue ?? "—"))}</td><td>${g.records}</td><td>${importReviewGroupActionCell(g, index)}</td></tr>${
        Array.isArray(g.subgroups) && g.subgroups.length
          ? g.subgroups.slice(0, 12).map((sub, subIndex) => `<tr><td colspan="2" style="padding-left:18px">${escCell(sub.sku || "—")} · lote ${escCell(sub.lotNumber || "—")} · ${escCell(sub.location || "—")} · ${escCell(sub.status || "—")}</td><td>${sub.records}</td><td><button class="btn-secondary btn-compact" data-review-subgroup="${index}:${subIndex}">Asignar subconjunto</button></td></tr>`).join("")
          : ""
      }`).join("")}
    </tbody></table></div>
    <div class="table-wrap" style="margin-top:10px"><table class="excel-table"><thead><tr><th>Fila Excel</th><th>SKU</th><th>Asignación</th><th>Ubicación</th><th>Status</th><th>Problemas</th><th>Estado</th><th>Detalle</th></tr></thead><tbody>
      ${rows.map((r) => `<tr><td>${Number(r.sourceRow || 0) + 2}</td><td>${escCell(r.normalized?.sku || r.data?.sku || "—")}</td><td>${escCell(r.normalized?.assignmentType === "FREE_TO_SALE" ? "FREE TO SALE" : r.normalized?.assignmentType === "UNRESOLVED" ? "PENDIENTE" : (r.normalized?.projectCode || r.normalized?.projectName || r.normalized?.assignmentType || "—"))}</td><td>${escCell(r.normalized?.location || "—")}</td><td>${escCell(r.normalized?.status || "—")}</td><td>${escCell([...(r.errors || []), ...(r.warnings || [])].map((x) => x.code).join(", ") || "—")}</td><td>${escCell(r.reviewState)}</td><td><button class="btn-secondary btn-compact" data-review-row="${r.sourceRow}">Ver / corregir</button></td></tr>`).join("")}
    </tbody></table></div>`;
  box.querySelectorAll("[data-review-group]").forEach((button) => button.addEventListener("click", () => {
    if (importUi.busy) return;
    const group = actionableGroups[Number(button.getAttribute("data-review-group"))];
    if (!group) return;
    const assign = button.getAttribute("data-review-assign");
    let payload = null;
    if (assign === "fts") {
      payload = { field: "assignmentType", value: "FREE_TO_SALE", scope: "ALL_MATCHING", issueCode: group.issueCode, issueValue: group.sourceValue, reason: "BULK_FREE_TO_SALE" };
    } else {
      const field = assign === "project" ? "project" : (group.field || "location");
      if (!["location", "project", "client", "status", "unitPriceMxn", "unitPriceUsd", "lotNumber", "reference", "assignmentType"].includes(field)) {
        window.alert("Este problema requiere revisión individual.");
        return;
      }
      const value = window.prompt(`Nuevo valor para ${field} (${group.records} filas):`, "");
      if (value == null) return;
      payload = { field, value, scope: "ALL_MATCHING", issueCode: group.issueCode, issueValue: group.sourceValue, reason: "BULK_REVIEW_QUEUE" };
    }
    void withImportLock("Aplicando corrección…", () => applyImportReviewCorrection(payload, "✓ Corrección aplicada."));
  }));
  box.querySelectorAll("[data-review-subgroup]").forEach((button) => button.addEventListener("click", () => {
    if (importUi.busy) return;
    const [groupIndex, subIndex] = String(button.getAttribute("data-review-subgroup") || "").split(":").map(Number);
    const group = actionableGroups[groupIndex];
    const sub = group?.subgroups?.[subIndex];
    if (!group || !sub) return;
    const value = window.prompt(`Asignar proyecto a ${sub.records} filas de ${sub.sku} (o escribe FREE TO SALE):`, "");
    if (value == null || !value.trim()) return;
    const isFts = value.trim().toUpperCase() === "FREE TO SALE";
    void withImportLock("Aplicando corrección…", () => applyImportReviewCorrection({
      field: isFts ? "assignmentType" : "project",
      value: isFts ? "FREE_TO_SALE" : value.trim(),
      scope: "SELECTED",
      sourceRows: sub.sourceRows,
      reason: "SUBSET_ASSIGNMENT"
    }, "✓ Corrección aplicada."));
  }));
  box.querySelectorAll("[data-review-row]").forEach((button) => button.addEventListener("click", () => {
    const row = rows.find((item) => String(item.sourceRow) === button.getAttribute("data-review-row"));
    if (!row) return;
    window.alert(`Fila Excel ${Number(row.sourceRow) + 2}\nOriginal: ${JSON.stringify(row.data)}\nCorregido: ${JSON.stringify(row.corrections || {})}\nProblemas: ${JSON.stringify([...(row.errors || []), ...(row.warnings || [])])}`);
  }));
  document.getElementById("importMissingLocOpenBtn")?.addEventListener("click", () => {
    if (importUi.busy) return;
    openImportMissingLocModal();
  });
  importUi.reviewSynced = true;
  importUi.reviewStale = false;
}

async function loadImportReview() {
  if (!currentImportId) return;
  const response = await authenticatedFetch(`/api/imports/${currentImportId}/review`);
  if (response?.ok) {
    const data = await response.json();
    applyImportCountsFromServer(data);
    renderImportReviewFromState(data);
    syncImportWizardUi();
    return;
  }
  await hydrateImportFromServer(currentImportId);
}

async function refreshImportHistory() {
  const box = document.getElementById("importHistoryBox");
  if (!box) return;
  const response = await authenticatedFetch("/api/imports");
  if (!response?.ok) {
    box.textContent = "No se pudo cargar historial.";
    return;
  }
  const rows = await response.json();
  box.innerHTML = `<h4 class="secondary-panel-title">Historial de importación</h4><div class="table-wrap"><table class="excel-table"><thead><tr><th>Fecha</th><th>Archivo</th><th>Contexto</th><th>Hoja</th><th>Filas</th><th>Válidas</th><th>Errores</th><th>Warnings</th><th>Status</th><th>Usuario</th></tr></thead><tbody>${
    (Array.isArray(rows) ? rows : []).slice(0, 30).map((r) => `<tr><td>${escCell(formatMexicoCityDateTime(r.createdAt))}</td><td>${escCell(r.originalFileName)}</td><td>${escCell(r.context)}</td><td>${escCell(r.sheetName || "—")}</td><td>${r.totalRows}</td><td>${r.validRows}</td><td>${r.invalidRows}</td><td>${r.warningRows}</td><td>${escCell(r.status)}</td><td>${escCell(r.createdBy?.fullName || "—")}</td></tr>`).join("")
  }</tbody></table></div>`;
}

document.getElementById("importUploadBtn")?.addEventListener("click", () => {
  const file = document.getElementById("importFile")?.files?.[0];
  if (!file) {
    setImportStatus("Selecciona un archivo.", true);
    return;
  }
  void withImportLock("Subiendo archivo…", async () => {
    const body = new FormData();
    body.append("file", file);
    body.append("context", document.getElementById("importContext")?.value || "INVENTORY");
    body.append("inventoryMode", getImportInventoryModeValue());
    const priceCurrency = document.getElementById("importPriceCurrency")?.value;
    if (priceCurrency) body.append("priceCurrency", priceCurrency);
    const authToken = currentAccessToken();
    const response = await fetch("/api/imports/upload", {
      method: "POST",
      headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
      body
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || "Error al subir.");
    currentImportId = data.id;
    rememberImportBatchId(data.id);
    importUi.fileName = file.name;
    importUi.confirmed = false;
    importUi.batchStatus = data.status || "UPLOADED";
    hideImportResumeBanner();
    resetImportDownstream(3);
    const sheets = data.metadata?.sheets || [];
    const multiSheet = isMultiSheetImportUpload(sheets, file.name);
    const select = document.getElementById("importSheetSelect");
    if (select) {
      select.innerHTML = sheets.length
        ? renderImportSheetSelectOptions(sheets, { includePlaceholder: multiSheet })
        : '<option value="">Sin hojas</option>';
      select.disabled = !sheets.length;
      select.value = "";
    }
    importUi.sheetName = "";
    importUi.sheetRows = 0;
    const mappingBox = document.getElementById("importMappingBox");
    if (mappingBox) mappingBox.innerHTML = "";
    const sheetMeta = document.getElementById("importSheetMeta");
    if (multiSheet) {
      const suggested = suggestImportSheet(sheets, document.getElementById("importContext")?.value);
      if (sheetMeta) {
        sheetMeta.textContent = suggested
          ? `Sugerida: ${suggested.name} (${formatImportCount(suggested.totalDataRows)} filas). Confirma la hoja en el selector.`
          : "Selecciona la hoja a importar.";
      }
      setImportStatus(`✓ Archivo cargado: ${file.name}. Selecciona la hoja a importar.`);
    } else if (sheets.length === 1) {
      await applyImportSheetSelection(sheets[0].name, sheets);
      setImportStatus(`✓ Archivo cargado: ${file.name}`);
    } else {
      if (sheetMeta) sheetMeta.textContent = "Selecciona la hoja a importar.";
      setImportStatus(`✓ Archivo cargado: ${file.name}`);
    }
    setImportSyncState("ok", "✓ Estado sincronizado con servidor");
    await refreshImportHistory();
  });
});

document.getElementById("importSheetSelect")?.addEventListener("change", (e) => {
  if (importHydrating || !currentImportId || importUi.busy) return;
  const sheetName = e.target.value;
  if (!sheetName) return;
  void withImportLock("Seleccionando hoja…", async () => {
    await applyImportSheetSelection(sheetName);
  });
});

document.getElementById("importMapBtn")?.addEventListener("click", () => {
  if (!currentImportId) return;
  void withImportLock("Aplicando mapeo…", async () => {
    const response = await authenticatedFetch(`/api/imports/${currentImportId}/mapping`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mapping: currentImportMapping })
    });
    if (!response?.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.message || "No se pudo guardar el mapeo.");
    }
    importUi.mappingApplied = true;
    importUi.mappingDirty = false;
    importUi.appliedMappingJson = JSON.stringify(currentImportMapping);
    importUi.batchStatus = "MAPPED";
    resetImportDownstream(4);
    setImportStatus("✓ Mapeo aplicado");
    setImportSyncState("ok", "✓ Estado sincronizado con servidor");
  });
});

document.getElementById("importValidateBtn")?.addEventListener("click", () => {
  if (!currentImportId) return;
  void withImportLock(`Validando ${formatImportCount(importUi.sheetRows)} filas…`, async () => {
    const response = await authenticatedFetch(`/api/imports/${currentImportId}/validate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}"
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || "Validación fallida.");
    try {
      await hydrateImportFromServer(currentImportId);
    } catch (syncError) {
      importUi.validated = true;
      importUi.confirmed = false;
      importUi.totalRows = Number(data.summary?.totalRows || 0);
      importUi.validRows = Number(data.summary?.validRows || 0);
      importUi.warningRows = Number(data.summary?.warningRows || 0);
      importUi.blocked = Number(data.summary?.invalidRows || 0);
      importUi.customerBlank = Number(data.summary?.customerBlank || 0);
      importUi.freeToSaleAssigned = Number(data.summary?.freeToSaleAssigned || 0);
      importUi.projectAssigned = Number(data.summary?.projectAssigned || 0);
      importUi.unresolved = Number(data.summary?.assignmentUnresolved || 0);
      renderImportPreviewRows(data.preview);
      renderImportValidateSummary();
      setImportSyncState("error", "No se pudo sincronizar el estado");
      throw syncError;
    }
    const val = data.summary?.valuation || {};
    setImportStatus(
      `✓ Validado. Total ${formatImportCount(importUi.totalRows)}. Listas ${formatImportCount(importUi.validRows)}. FREE TO SALE ${formatImportCount(importUi.freeToSaleAssigned)}. Con proyecto ${formatImportCount(importUi.projectAssigned)}. Sin asignar ${formatImportCount(importUi.unresolved)}. Advertencias ${formatImportCount(importUi.warningRows)}. Bloqueadas ${formatImportCount(importUi.blocked)}. Valor MXN ${val.mxn || 0} / USD ${val.usd || 0}.`
    );
    await refreshImportHistory();
  });
});

document.getElementById("importReviewBtn")?.addEventListener("click", () => {
  if (!currentImportId) return;
  void withImportLock("Cargando revisión…", async () => {
    await loadImportReview();
    setImportStatus(
      importUi.blocked > 0 || importUi.unresolved > 0
        ? `⚠ Revisión requerida — ${formatImportCount(importUi.blocked)} bloqueados${
          importUi.unresolved ? ` · ${formatImportCount(importUi.unresolved)} sin asignar` : ""
        }`
        : "✓ Sin bloqueos pendientes"
    );
  });
});

document.getElementById("importNormalizedBtn")?.addEventListener("click", () => {
  if (!currentImportId || importUi.busy) return;
  void withImportLock("Exportando CSV…", async () => {
    await downloadExport(`/api/imports/${currentImportId}/normalized.csv`, `import_${currentImportId}_normalized.csv`);
  });
});

function environmentLabelForConfirm() {
  return environmentDisplayName || "Desarrollo";
}

function finishImportConfirm(result) {
  closeModal("importConfirmModal");
  const resolve = importConfirmResolver;
  importConfirmResolver = null;
  if (typeof resolve === "function") resolve(Boolean(result));
}

function askImportConfirm() {
  const total = Number(importUi.totalRows || 0);
  const body = document.getElementById("importConfirmBody");
  if (body) {
    body.innerHTML =
      `Se cargarán <strong>${escCell(formatImportCount(total))}</strong> registros al inventario.<br>` +
      `La operación generará existencias, capas, movimientos y seriales.<br>` +
      `Entorno: <strong>${escCell(environmentLabelForConfirm())}</strong><br><br>` +
      `¿Deseas continuar?`;
  }
  const err = document.getElementById("importConfirmError");
  if (err) err.textContent = "";
  openModal("importConfirmModal");
  return new Promise((resolve) => {
    importConfirmResolver = resolve;
  });
}

async function refreshInventoryAfterImport() {
  await loadCatalogData();
  await loadInventoryProjects();
  await loadStockStrip();
  await loadInventoryMovements();
}

function clearInventoryWorkspaceState() {
  stockRowsCache = [];
  inventoryProjectsCache = [];
  inventoryKpiCache = null;
  movementsRowsCache = [];
  movementsCountCache = 0;
  pendingConflictsCache = 0;
  updateInventorySummary([]);
  updateTableCountMeta("inventoryTableCount", 0, 0, "saldos");
  updateTableCountMeta("ccTableCount", 0, 0, "saldos");
  fillInventoryProjectSelects();
  renderProjectsStockList();
}

async function refreshInventoryAfterPhysicalPurge() {
  bumpClientContextEpoch();
  clearInventoryWorkspaceState();
  await refreshInventoryAfterImport();
  void syncAviatDangerZone();
}

document.getElementById("importConfirmCancelBtn")?.addEventListener("click", () => finishImportConfirm(false));
document.getElementById("importConfirmCloseX")?.addEventListener("click", () => finishImportConfirm(false));
document.getElementById("importConfirmAcceptBtn")?.addEventListener("click", () => finishImportConfirm(true));
document.getElementById("importConfirmModal")?.addEventListener("click", (event) => {
  if (event.target && event.target.id === "importConfirmModal") finishImportConfirm(false);
});

document.getElementById("importConfirmBtn")?.addEventListener("click", () => {
  if (!currentImportId || importUi.busy) return;
  const reason = getImportConfirmBlockReason();
  if (reason) {
    setImportStatus(`🔒 Confirmar. ${reason}`, true);
    syncImportWizardUi();
    return;
  }
  void (async () => {
    const ok = await askImportConfirm();
    if (!ok) return;
    await withImportLock("Confirmando importación…", async () => {
      const response = await authenticatedFetch(`/api/imports/${currentImportId}/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}"
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || "Confirmación rechazada.");
      const failed = data.results?.filter((r) => !r.ok).length || 0;
      const processed = Number(data.batch?.totalRows || importUi.totalRows || 0);
      await refreshImportHistory();
      await finishImportWizardAfterCompleted(
        `Importación completada correctamente. ${formatImportCount(processed)} registros procesados. Fallidas: ${formatImportCount(failed)}.`
      );
    });
  })();
});

document.getElementById("importInventoryMode")?.addEventListener("change", () => syncImportWizardUi());
document.getElementById("importContext")?.addEventListener("change", () => {
  syncImportInventoryModeUi();
  syncImportWizardUi();
});
document.getElementById("importReconcilePreviewToggle")?.addEventListener("change", () => syncImportWizardUi());
document.getElementById("importResumeContinueBtn")?.addEventListener("click", () => {
  if (importUi.busy) return;
  continueResumableImport();
});
document.getElementById("importResumeDiscardBtn")?.addEventListener("click", () => {
  openImportCancelModal();
});
document.getElementById("importCancelBtn")?.addEventListener("click", () => {
  openImportCancelModal();
});
document.getElementById("importCancelConfirmBtn")?.addEventListener("click", () => {
  if (importUi.busy) return;
  void submitImportCancel();
});
document.getElementById("importCancelCloseX")?.addEventListener("click", () => closeImportCancelModal());
document.getElementById("importCloseWizardBtn")?.addEventListener("click", () => closeImportWizardUiOnly());
document.getElementById("importCloseWizardInnerBtn")?.addEventListener("click", () => closeImportWizardUiOnly());
const importCancelModal = document.getElementById("importCancelModal");
if (importCancelModal && importCancelModal.dataset.modalWired !== "1") {
  importCancelModal.dataset.modalWired = "1";
  importCancelModal.addEventListener("click", (e) => {
    if (e.target === importCancelModal) closeImportCancelModal();
  });
}
syncImportWizardUi();

createUserForm.addEventListener("submit", createUser);
document.getElementById("editUserForm")?.addEventListener("submit", (event) => void saveEditUser(event));
document.getElementById("editUserCancelBtn")?.addEventListener("click", () => {
  document.getElementById("editUserForm")?.classList.add("hidden");
});
document.getElementById("accountProfileForm")?.addEventListener("submit", (event) => void saveAccountProfile(event));
document.getElementById("editAvatarUrl")?.addEventListener("input", (event) => {
  applyUserPhotoPreview(document.getElementById("editUserPhotoSlot"), event.target.value);
});
document.getElementById("accountAvatarUrl")?.addEventListener("input", (event) => {
  applyUserPhotoPreview(document.getElementById("accountPhotoSlot"), event.target.value);
});
document.getElementById("resetPasswordConfirmBtn")?.addEventListener("click", () => void confirmResetPassword());
document.getElementById("resetPasswordCancelBtn")?.addEventListener("click", () => closeModal("resetPasswordModal"));
document.getElementById("resetPasswordCloseX")?.addEventListener("click", () => closeModal("resetPasswordModal"));
document.getElementById("operationalHistoryPreviewBtn")?.addEventListener("click", () => void loadOperationalHistoryPreview());
document.getElementById("operationalHistoryExecuteBtn")?.addEventListener("click", () => void executeOperationalHistoryCleanup());
document.getElementById("operationalHistoryPhrase")?.addEventListener("input", syncHistoryExecuteEnabled);
document.querySelectorAll(".js-history-category").forEach((el) => {
  el.addEventListener("change", syncHistoryExecuteEnabled);
});
newRole?.addEventListener("change", () => {
  document.getElementById("newClientField")?.classList.toggle("hidden", !isBoundOperationalRole(newRole.value));
});
if (createCustomerForm) createCustomerForm.addEventListener("submit", createCustomer);
document.querySelectorAll("[data-master-create]").forEach((btn) => {
  btn.addEventListener("click", (event) => {
    event.preventDefault();
    if (currentRole !== "ADMIN") return;
    const kind = btn.getAttribute("data-master-create");
    if (kind === "client") openClientForm(null);
    if (kind === "project") void loadRealClientsQuiet().then(() => openProjectForm(null, null));
    if (kind === "warehouse") openWarehouseForm(null);
    if (kind === "location") void loadWarehousesQuiet().then(() => openLocationForm(null));
  });
});
document.querySelectorAll(".js-inv-master-tab").forEach((btn) => {
  btn.addEventListener("click", () => {
    const mod = btn.getAttribute("data-inv-master-tab");
    if (mod) navigateTo("inventario", mod);
  });
});
document.querySelectorAll("[data-close-modal='masterDataModal']").forEach((el) => {
  el.addEventListener("click", () => closeMasterModal());
});
masterModal()?.addEventListener("click", (event) => {
  if (event.target === masterModal()) closeMasterModal();
});
changePasswordForm.addEventListener("submit", changePassword);
createProductForm.addEventListener("submit", createProduct);
scanForm.addEventListener("submit", scanCode);
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
if (traceLoadBtn) traceLoadBtn.addEventListener("click", () => void loadTraceability());
document.getElementById("movementMoreBtn")?.addEventListener("click", () => {
  if (movementsNextCursor) void loadTraceability(true);
});
if (taskCreateBtn) taskCreateBtn.addEventListener("click", () => void createTaskClick());
if (incidentCreateBtn) incidentCreateBtn.addEventListener("click", () => void createIncidentClick());
if (exportStockBtn) exportStockBtn.addEventListener("click", () => void exportStockCsv());
if (exportMovementsBtn) exportMovementsBtn.addEventListener("click", () => void exportMovementsCsv());
if (exportTraceBtn) exportTraceBtn.addEventListener("click", () => void exportTraceabilityCsv());
if (exportProductsBtn) exportProductsBtn.addEventListener("click", () => void exportProductsCsv());
if (labResetOpenBtn) labResetOpenBtn.addEventListener("click", () => void openLabResetModal());
if (labResetCancelBtn) labResetCancelBtn.addEventListener("click", closeLabResetModal);
if (labResetCloseX) labResetCloseX.addEventListener("click", closeLabResetModal);
if (labResetAck) labResetAck.addEventListener("change", syncLabResetConfirmEnabled);
if (labResetConfirmBtn) labResetConfirmBtn.addEventListener("click", () => void runLabReset());
if (labResetModal && labResetModal.dataset.modalWired !== "1") {
  labResetModal.dataset.modalWired = "1";
  labResetModal.addEventListener("click", (event) => {
    if (event.target === labResetModal) closeLabResetModal();
  });
}

const PHYSICAL_RESET_CONFIRMATION = "BORRAR INVENTARIO DE AVIAT";
const physicalInventoryResetFinalAck = document.getElementById("physicalInventoryResetFinalAck");
let aviatResetPreview = null;

function isActiveAviatOperationalClient() {
  const client = operationalClient || clientContextCatalog.find((row) => row.id === adminSelectedClientId);
  if (!client) return false;
  return [client.code, client.name, client.tradeName, client.legalName]
    .some((value) => String(value || "").trim().toUpperCase() === "AVIAT");
}

function isAviatOperationalInventoryEmpty(counts) {
  if (!counts) return true;
  return (
    Number(counts.inventories || 0) === 0 &&
    Number(counts.layers || 0) === 0 &&
    Number(counts.serials || 0) === 0 &&
    Number(counts.movements || 0) === 0 &&
    Number(counts.qty || 0) === 0 &&
    Number(counts.importBatches || 0) === 0
  );
}

function formatPhysicalResetPurgedSummary(data) {
  return (
    `Se eliminaron: ${formatImportCount(data.inventoriesPurged ?? 0)} saldos, ` +
    `${formatImportCount(data.layersPurged ?? 0)} capas, ` +
    `${formatImportCount(data.serialsPurged ?? 0)} series, ` +
    `${formatImportCount(data.reservationsPurged ?? 0)} reservas, ` +
    `${formatImportCount(data.movementsPurged ?? 0)} movimientos, ` +
    `${formatImportCount(data.scanEventsPurged ?? 0)} escaneos, ` +
    `${formatImportCount(data.requisitionsPurged ?? 0)} requisiciones, ` +
    `${formatImportCount(data.tasksPurged ?? 0)} tareas, ` +
    `${formatImportCount(data.importBatchesPurged ?? 0)} importaciones.`
  );
}

function formatPhysicalResetCurrentSummary() {
  return "Estado actual: 0 piezas, 0 saldos, 0 series, 0 movimientos, 0 importaciones.";
}

function renderAviatResetCounts(target, counts, { mode = "current" } = {}) {
  if (!target) return;
  if (!counts) {
    target.innerHTML = "";
    return;
  }
  const heading = mode === "purge" ? "Se eliminarán" : "Estado actual";
  const chips = [
    ["Piezas", counts.qty],
    ["Saldos", counts.inventories],
    ["Capas", counts.layers],
    ["Series", counts.serials],
    ["Reservas", counts.reservations],
    ["Movimientos", counts.movements],
    ["Requisiciones", counts.requisitions],
    ["Tareas", counts.tasks],
    ["Importaciones", counts.importBatches]
  ]
    .map(([label, value]) => `<span class="chip">${label}: ${value ?? 0}</span>`)
    .join("");
  target.innerHTML = `<p class="assignee-hint" style="margin:0 0 8px"><strong>${heading}:</strong></p>${chips}`;
}

async function syncAviatDangerZone() {
  const zone = document.getElementById("aviatDangerZone");
  const btn = document.getElementById("physicalInventoryResetImportBtn");
  const hint = document.getElementById("aviatResetFlagHint");
  if (!zone) return;
  const visible = currentRole === "ADMIN" && isActiveAviatOperationalClient();
  zone.classList.toggle("hidden", !visible);
  const clientLabel =
    operationalClient?.tradeName || operationalClient?.name || operationalClient?.code || "AVIAT";
  const titleEl = document.getElementById("aviatDangerZoneTitle");
  if (titleEl) titleEl.textContent = `Borrar inventario de ${clientLabel}`;
  if (!visible) {
    if (btn) {
      btn.disabled = true;
      btn.classList.add("hidden");
    }
    return;
  }
  try {
    const response = await authenticatedFetch("/api/v1/inventory/physical/reset/preview");
    const data = await response.json().catch(() => ({}));
    aviatResetPreview = data;
    const empty = isAviatOperationalInventoryEmpty(data.counts);
    renderAviatResetCounts(document.getElementById("aviatResetCounts"), data.counts, { mode: "current" });
    const enabled = Boolean(data.flagEnabled && data.isAviat && data.canExecute && !empty);
    if (hint) {
      hint.textContent = empty
        ? "El inventario operativo ya está en cero. No hay nada que borrar."
        : enabled
          ? "Escribe la frase exacta y confirma por segunda vez. Esta variable se activará solamente para el ensayo y la carga inicial y deberá volver a false después de la carga aprobada por Hugo."
          : "El reinicio está desactivado. ALLOW_TENANT_INVENTORY_RESET debe ser true solo para el ensayo y la carga inicial.";
    }
    if (btn) {
      btn.classList.remove("hidden");
      btn.style.display = currentRole === "ADMIN" ? "inline-block" : "none";
      btn.disabled = !enabled || physicalInventoryResetBusy;
      btn.textContent = empty ? "Inventario ya está en cero" : `Borrar inventario de ${clientLabel}`;
    }
  } catch (_err) {
    if (btn) btn.disabled = true;
  }
}

function setPhysicalInventoryResetError(message) {
  if (physicalInventoryResetError) physicalInventoryResetError.textContent = message || "";
}

function syncPhysicalInventoryResetConfirmEnabled() {
  if (!physicalInventoryResetConfirmBtn) return;
  const phrase = String(physicalInventoryResetPhrase?.value || "").trim();
  const ack = Boolean(physicalInventoryResetFinalAck?.checked);
  const ready =
    phrase === PHYSICAL_RESET_CONFIRMATION &&
    ack &&
    !physicalInventoryResetBusy &&
    Boolean(aviatResetPreview?.canExecute) &&
    !isAviatOperationalInventoryEmpty(aviatResetPreview?.counts);
  physicalInventoryResetConfirmBtn.disabled = !ready;
}

function setPhysicalInventoryResetBusy(busy) {
  physicalInventoryResetBusy = busy;
  const empty = isAviatOperationalInventoryEmpty(aviatResetPreview?.counts);
  physicalInventoryResetBtns.forEach((btn) => {
    btn.disabled = busy || !aviatResetPreview?.canExecute || empty;
  });
  if (physicalInventoryResetPhrase) physicalInventoryResetPhrase.disabled = busy;
  if (physicalInventoryResetFinalAck) physicalInventoryResetFinalAck.disabled = busy;
  if (physicalInventoryResetCancelBtn) physicalInventoryResetCancelBtn.disabled = busy;
  if (physicalInventoryResetCloseX) physicalInventoryResetCloseX.disabled = busy;
  if (physicalInventoryResetBusyStatus) physicalInventoryResetBusyStatus.classList.toggle("hidden", !busy);
  if (busy && physicalInventoryResetConfirmBtn) {
    physicalInventoryResetConfirmBtn.disabled = true;
    physicalInventoryResetConfirmBtn.textContent = "Borrando…";
  } else if (physicalInventoryResetConfirmBtn) {
    physicalInventoryResetConfirmBtn.textContent = "Confirmar borrado";
    syncPhysicalInventoryResetConfirmEnabled();
  }
}

function openPhysicalInventoryResetModal() {
  if (currentRole !== "ADMIN" || physicalInventoryResetBusy) return;
  if (!aviatResetPreview?.canExecute || isAviatOperationalInventoryEmpty(aviatResetPreview?.counts)) return;
  setPhysicalInventoryResetError("");
  if (physicalInventoryResetSuccess) {
    physicalInventoryResetSuccess.textContent = "";
    physicalInventoryResetSuccess.classList.add("hidden");
  }
  if (physicalInventoryResetPhrase) physicalInventoryResetPhrase.value = "";
  if (physicalInventoryResetFinalAck) physicalInventoryResetFinalAck.checked = false;
  renderAviatResetCounts(document.getElementById("physicalInventoryResetPreviewCounts"), aviatResetPreview?.counts, {
    mode: "purge"
  });
  syncPhysicalInventoryResetConfirmEnabled();
  openModal("physicalInventoryResetModal");
}

function closePhysicalInventoryResetModal() {
  if (physicalInventoryResetBusy) return;
  closeModal("physicalInventoryResetModal");
}

async function runPhysicalInventoryReset() {
  if (physicalInventoryResetBusy || currentRole !== "ADMIN") return;
  if (!aviatResetPreview?.canExecute) {
    setPhysicalInventoryResetError("El reinicio de inventario de AVIAT está desactivado.");
    return;
  }
  if (isAviatOperationalInventoryEmpty(aviatResetPreview?.counts)) {
    setPhysicalInventoryResetError("El inventario operativo ya está en cero.");
    return;
  }
  const phrase = String(physicalInventoryResetPhrase?.value || "").trim();
  if (phrase !== PHYSICAL_RESET_CONFIRMATION || !physicalInventoryResetFinalAck?.checked) {
    setPhysicalInventoryResetError(`Para confirmar escribe exactamente: ${PHYSICAL_RESET_CONFIRMATION} y marca la confirmación final.`);
    return;
  }
  setPhysicalInventoryResetBusy(true);
  setPhysicalInventoryResetError("");
  try {
    const response = await authenticatedFetch("/api/v1/inventory/physical/reset", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        confirmation: PHYSICAL_RESET_CONFIRMATION,
        finalConfirmation: PHYSICAL_RESET_CONFIRMATION
      })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.message || "No se pudo borrar el inventario.");
    }
    if (data.result !== "PURGED") {
      throw new Error("El servidor no confirmó la eliminación física del inventario.");
    }
    const message = `${formatPhysicalResetPurgedSummary(data)} ${formatPhysicalResetCurrentSummary()}`;
    if (physicalInventoryResetSuccess) {
      physicalInventoryResetSuccess.textContent = `✓ ${message}`;
      physicalInventoryResetSuccess.classList.remove("hidden");
    }
    const resultBox = document.getElementById("aviatResetResult");
    if (resultBox) {
      resultBox.textContent = `✓ ${message}`;
      resultBox.classList.remove("hidden");
    }
    await refreshInventoryAfterPhysicalPurge();
    await syncAviatDangerZone();
    if (physicalInventoryResetPhrase) physicalInventoryResetPhrase.value = "";
    if (physicalInventoryResetFinalAck) physicalInventoryResetFinalAck.checked = false;
    closePhysicalInventoryResetModal();
  } catch (error) {
    setPhysicalInventoryResetError(error?.message || "No se pudo borrar el inventario.");
  } finally {
    setPhysicalInventoryResetBusy(false);
  }
}

physicalInventoryResetBtns.forEach((btn) => {
  btn.addEventListener("click", () => openPhysicalInventoryResetModal());
});
if (physicalInventoryResetCancelBtn) physicalInventoryResetCancelBtn.addEventListener("click", closePhysicalInventoryResetModal);
if (physicalInventoryResetCloseX) physicalInventoryResetCloseX.addEventListener("click", closePhysicalInventoryResetModal);
if (physicalInventoryResetPhrase) physicalInventoryResetPhrase.addEventListener("input", syncPhysicalInventoryResetConfirmEnabled);
if (physicalInventoryResetFinalAck) physicalInventoryResetFinalAck.addEventListener("change", syncPhysicalInventoryResetConfirmEnabled);
if (physicalInventoryResetConfirmBtn) physicalInventoryResetConfirmBtn.addEventListener("click", () => void runPhysicalInventoryReset());
if (physicalInventoryResetModal && physicalInventoryResetModal.dataset.modalWired !== "1") {
  physicalInventoryResetModal.dataset.modalWired = "1";
  physicalInventoryResetModal.addEventListener("click", (event) => {
    if (event.target === physicalInventoryResetModal) closePhysicalInventoryResetModal();
  });
}
const importMissingLocModal = document.getElementById("importMissingLocModal");
document.getElementById("importMissingLocOpenBtn")?.addEventListener("click", () => openImportMissingLocModal());
document.getElementById("importMissingLocCancelBtn")?.addEventListener("click", () => closeImportMissingLocModal());
document.getElementById("importMissingLocCloseX")?.addEventListener("click", () => closeImportMissingLocModal());
document.getElementById("importMissingLocAck")?.addEventListener("change", syncImportMissingLocConfirmEnabled);
document.getElementById("importMissingLocConfirmBtn")?.addEventListener("click", () => {
  if (importUi.busy) return;
  void createImportMissingLocationsAndRevalidate();
});
if (importMissingLocModal && importMissingLocModal.dataset.modalWired !== "1") {
  importMissingLocModal.dataset.modalWired = "1";
  importMissingLocModal.addEventListener("click", (event) => {
    if (event.target === importMissingLocModal) closeImportMissingLocModal();
  });
}
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
wireNewPasswordVisibilityToggles();
wireFocusMode();
wireModals();
wireAviatProjectUi();
initGridDensity();
wireGridToolbars();
updateAppDateTime();
setInterval(updateAppDateTime, 60000);
if (catalogImportResult) wireOperationalMessageClicks(catalogImportResult);
void loadEnvironmentBadge();
clientContextSearch?.addEventListener("input", () => {
  renderClientContextCards(clientContextSearch.value);
});
clientContextAddBtn?.addEventListener("click", () => {
  setAdminClientGateVisible(false);
  navigateTo("inventario", "clients");
});
clientContextCards?.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;
  dispatchClientContextCardClick(target);
});
changeClientBtn?.addEventListener("click", () => {
  if (operationalClient) void clearAdminOperationalClient();
  else void showAdminClientPicker();
});
validateSession();
