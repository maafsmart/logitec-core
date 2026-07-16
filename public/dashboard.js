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
const modulePicking = document.getElementById("modulePicking");
const moduleInventory = document.getElementById("moduleInventory");
const moduleCatalog = document.getElementById("moduleCatalog");
const moduleAccount = document.getElementById("moduleAccount");
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

let currentRole = null;
let currentUserId = null;

const roleModules = {
  ADMIN: ["catalog", "inventory", "picking", "traceability", "tasks", "incidents", "users", "account"],
  SUPERVISOR: ["inventory", "picking", "traceability", "tasks", "incidents", "account"],
  OPERATOR: ["inventory", "picking", "traceability", "tasks", "incidents", "account"],
  CLIENT: ["catalog", "account"]
};

const defaultLandingModule = {
  ADMIN: "catalog",
  SUPERVISOR: "inventory",
  OPERATOR: "inventory",
  CLIENT: "catalog"
};

currentUrl.textContent = window.location.href;

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

  const showUsers = moduleName === "users";
  const showPicking = moduleName === "picking";
  const showInventory = moduleName === "inventory";
  const showCatalog = moduleName === "catalog";
  const showAccount = moduleName === "account";
  const showTraceability = moduleName === "traceability";
  const showTasks = moduleName === "tasks";
  const showIncidents = moduleName === "incidents";
  moduleUsers.classList.toggle("hidden", !showUsers);
  modulePicking.classList.toggle("hidden", !showPicking);
  moduleInventory.classList.toggle("hidden", !showInventory);
  moduleCatalog.classList.toggle("hidden", !showCatalog);
  moduleAccount.classList.toggle("hidden", !showAccount);
  if (moduleTraceability) moduleTraceability.classList.toggle("hidden", !showTraceability);
  if (moduleTasks) moduleTasks.classList.toggle("hidden", !showTasks);
  if (moduleIncidents) moduleIncidents.classList.toggle("hidden", !showIncidents);
  modulePlaceholder.classList.toggle(
    "hidden",
    showUsers ||
      showPicking ||
      showInventory ||
      showCatalog ||
      showAccount ||
      showTraceability ||
      showTasks ||
      showIncidents
  );

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

function renderCellWithClamp(value, className = "", maxLen = 32) {
  const raw = value == null || value === "" ? "—" : String(value);
  const display = raw.length > maxLen ? `${raw.slice(0, maxLen)}…` : raw;
  const safeDisplay = escCell(display);
  const safeTitle = escCell(raw);
  return `<span class="${className}" title="${safeTitle}">${safeDisplay}</span>`;
}

function statusBadge(value) {
  const raw = value == null || value === "" ? "—" : String(value);
  const tone = raw.includes("COMPLETED") || raw.includes("RESOLVED") || raw === "OK" ? "success" : raw.includes("IN_PROGRESS") ? "warn" : raw.includes("ERROR") ? "error" : "info";
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
  el.textContent = message;
  el.classList.toggle("error", isError);
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
  const seenSkus = new Set();
  const converted = [];
  let skippedNoSku = 0;

  for (const row of rows) {
    const sku = getCellValue(row, cols.materialNumber);
    if (!sku) {
      skippedNoSku += 1;
      continue;
    }
    if (seenSkus.has(sku)) continue;
    seenSkus.add(sku);

    const customerName = getCellValue(row, cols.customer) || "LOGITEC";
    const customer = normalizeCustomerCode(customerName);
    const name = getCellValue(row, cols.materialDescription);
    const barcode = sku;

    converted.push({
      customer,
      customerName,
      sku,
      name,
      barcode,
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

  return {
    csvText,
    rowsRead: rows.length,
    rowsConverted: converted.length,
    skippedNoSku,
    format: "logitec",
  };
}

function convertLogitecToInventory(headers, rows, sheetName) {
  const headerIndex = buildHeaderIndex(headers);
  const cols = getLogitecColumnMap(headerIndex);
  const grouped = new Map();
  let skippedNoSku = 0;
  let emptyQuantityRows = 0;
  const defaultLocation = `${LOGITEC_DEFAULT_WAREHOUSE}-GEN-STAGE-01`;

  for (const row of rows) {
    const sku = getCellValue(row, cols.materialNumber);
    if (!sku) {
      skippedNoSku += 1;
      continue;
    }

    const ubicacion = getCellValue(row, cols.ubicacion);
    const qtyParsed = parseQuantityValue(getCellValue(row, cols.poQt));
    if (qtyParsed.empty) emptyQuantityRows += 1;

    const groupKey = `${sku}\u0001${ubicacion}`;
    const current = grouped.get(groupKey) || { sku, ubicacion, quantity: 0 };
    current.quantity += qtyParsed.value;
    grouped.set(groupKey, current);
  }

  const converted = [...grouped.values()].map((item) => ({
    sku: item.sku,
    quantity: item.quantity,
    warehouse: LOGITEC_DEFAULT_WAREHOUSE,
    location: item.ubicacion || defaultLocation,
  }));

  const outputHeaders = ["sku", "quantity", "warehouse", "location"];
  const csvText = [
    outputHeaders.join(","),
    ...converted.map((item) =>
      outputHeaders.map((key) => csvEscapeCell(item[key])).join(",")
    ),
  ].join("\n");

  return {
    csvText,
    rowsRead: rows.length,
    rowsConverted: converted.length,
    skippedNoSku,
    emptyQuantityRows,
    format: "logitec",
  };
}

function buildImportFileStatusMessage(result, filename, nextStepLabel, importKind) {
  if (result.format === "logitec") {
    const kindLabel =
      importKind === "catalog"
        ? "Formato Logitec detectado: catálogo convertido con códigos de cliente limpios y nombre completo para revisión."
        : "Formato Logitec detectado: inventario agrupado por SKU y ubicación. Almacén TULTITLAN24 y ubicación física separada.";
    const details = [
      kindLabel,
      result.sheetName ? `Hoja detectada: ${result.sheetName}.` : null,
      result.headerRowNumber ? `Fila de encabezados: ${result.headerRowNumber}.` : null,
      `Filas leídas: ${result.rowsRead}.`,
      importKind === "inventory"
        ? `Saldos agrupados: ${result.rowsConverted}.`
        : `Filas convertidas: ${result.rowsConverted}.`,
      "Tipo detectado: Formato Logitec.",
    ].filter(Boolean);
    const extras = [];
    if (result.skippedNoSku) extras.push(`${result.skippedNoSku} filas omitidas sin SKU`);
    if (result.emptyQuantityRows) extras.push(`${result.emptyQuantityRows} filas con cantidad vacía (se usó 0)`);
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
  const from = document.getElementById("traceFrom")?.value?.trim();
  const to = document.getElementById("traceTo")?.value?.trim();
  if (wh) params.set("warehouse", wh);
  if (uid) params.set("userId", uid);
  if (typ) params.set("type", typ);
  if (sku) params.set("sku", sku);
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  params.set("limit", "500");
  return params;
}

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
  exportToCsv("logitec_inventario", rows, [
    { label: "SKU", value: (r) => r.product?.sku || "" },
    { label: "Producto", value: (r) => r.product?.name || "" },
    { label: "Cliente", value: (r) => r.product?.customer?.name || r.product?.customer?.code || "" },
    { label: "Almacén", value: (r) => r.location?.warehouse || "" },
    { label: "Ubicación", value: (r) => r.location?.code || "" },
    { label: "Stock actual", value: (r) => formatQty(r.qty) }
  ]);
}

async function exportMovementsCsv() {
  const response = await authenticatedFetch("/api/inventory/movements");
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
    { label: "Fecha", value: (r) => formatExportDate(r.createdAt) },
    { label: "Usuario", value: (r) => r.user?.fullName || r.user?.email || "" },
    { label: "Tipo", value: (r) => r.movementType || r.type || "" },
    { label: "SKU", value: (r) => r.product?.sku || "" },
    { label: "Producto", value: (r) => r.product?.name || "" },
    { label: "Cantidad", value: (r) => formatQty(r.qty) },
    { label: "Almacén", value: (r) => r.warehouse || "" },
    { label: "Ubicación", value: (r) => r.toLocation?.code || r.fromLocation?.code || "" },
    { label: "Referencia", value: (r) => r.reference || "" }
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
  exportToCsv("logitec_catalogo", rows, [
    { label: "Cliente", value: (r) => r.customer?.code || r.customer?.name || "" },
    { label: "SKU", value: (r) => r.sku || "" },
    { label: "Producto", value: (r) => r.name || "" },
    { label: "Código de barras", value: (r) => r.barcode || "" },
    { label: "Almacén", value: (r) => r.warehouse || "" },
    { label: "Unidad", value: (r) => r.unit || "" },
    { label: "Activo", value: (r) => (r.active === false ? "No" : "Sí") }
  ]);
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
  if (rows.length === 0) {
    scanEventsList.innerHTML = '<p class="subtitle" style="margin:0">Sin escaneos registrados aún.</p>';
    return;
  }
  const showOperator =
    currentRole === "ADMIN" || currentRole === "SUPERVISOR" || currentRole === "OPERATOR";
  const thead = showOperator
    ? "<tr><th>Fecha / hora</th><th>Operador</th><th>Código</th><th>Resultado</th><th>Detalle</th></tr>"
    : "<tr><th>Fecha / hora</th><th>Código</th><th>Resultado</th><th>Detalle</th></tr>";
  const body = rows
    .map((scan) => {
      const name = scan.product?.name || "—";
      const skuPart = scan.product?.sku ? ` · SKU ${scan.product.sku}` : "";
      const detail = `${name}${skuPart}`;
      const operatorCell = showOperator
        ? `<td>${renderCellWithClamp(renderScanOperator(scan), "cell-truncate", 22)}</td>`
        : "";
      const cols = showOperator
        ? `<td class="cell-nowrap">${formatDateShort(scan.createdAt)}</td>${operatorCell}<td class="cell-nowrap col-code"><strong>${escCell(scan.scannedCode)}</strong></td><td class="cell-nowrap">${statusBadge(scan.result)}</td><td class="col-detail">${renderCellWithClamp(detail, "cell-truncate", 48)}</td>`
        : `<td class="cell-nowrap">${formatDateShort(scan.createdAt)}</td><td class="cell-nowrap col-code"><strong>${escCell(scan.scannedCode)}</strong></td><td class="cell-nowrap">${statusBadge(scan.result)}</td><td class="col-detail">${renderCellWithClamp(detail, "cell-truncate", 48)}</td>`;
      return `<tr>${cols}</tr>`;
    })
    .join("");
  scanEventsList.innerHTML = `<div class="table-wrap"><table class="scan-table picking-table"><thead>${thead}</thead><tbody>${body}</tbody></table></div>`;
}

async function loadProductsRows() {
  const productsResponse = await authenticatedFetch("/api/catalog/products");
  if (!productsResponse?.ok) {
    if (inventoryList) inventoryList.textContent = "No se pudo cargar el catálogo.";
    return;
  }
  const products = await productsResponse.json();
  const rows = (Array.isArray(products) ? products : [])
    .map(
      (product) =>
        `<div class="user-row"><strong>${product.sku}</strong> — ${product.name} <span style="color:#9caacc">(${product.warehouse})</span></div>`
    )
    .join("");
  productsList.innerHTML = rows;
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
      traceList.innerHTML = '<p class="subtitle" style="margin:0">Sin actividad con los filtros actuales.</p>';
      return;
    }
    const thead =
      "<tr><th>Fecha</th><th>Usuario</th><th>Tipo</th><th>Subtipo</th><th>Producto</th><th>Ubicación</th><th>Cant.</th><th>Resultado</th><th>Referencia</th></tr>";
    const body = rows
      .map((r) => {
        const who = r.user ? `${r.user.fullName}` : "—";
        const skuCell = r.product?.sku ? `${r.product.sku}` : "—";
        return `<tr><td class="cell-nowrap">${formatDateShort(r.createdAt)}</td><td>${renderCellWithClamp(who, "cell-truncate", 20)}</td><td>${statusBadge(r.type)}</td><td>${renderCellWithClamp(r.subtype, "cell-truncate", 18)}</td><td class="cell-nowrap">${escCell(skuCell)}</td><td>${renderCellWithClamp(r.location || r.warehouse, "cell-truncate", 28)}</td><td class="cell-nowrap">${formatQty(r.qty)}</td><td>${statusBadge(r.result)}</td><td>${renderCellWithClamp(r.reference, "cell-truncate", 24)}</td></tr>`;
      })
      .join("");
    traceList.innerHTML = `<div class="table-wrap"><table class="scan-table trace-table"><thead>${thead}</thead><tbody>${body}</tbody></table></div>`;
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
      taskList.innerHTML = '<p class="subtitle" style="margin:0">No hay tareas registradas.</p>';
      return;
    }
    const thead =
      "<tr><th>Creado</th><th>Tipo</th><th>Estado</th><th>Almacén</th><th>Asignado a</th><th>Ref.</th><th>Prioridad</th><th>Acción</th></tr>";
    const body = rows
      .map((t) => {
        const assign = t.assignedTo ? escCell(t.assignedTo.fullName) : "—";
        const canUpdate =
          currentRole === "ADMIN" ||
          currentRole === "SUPERVISOR" ||
          (currentRole === "OPERATOR" && t.assignedToId === currentUserId);
        const action = canUpdate
          ? `<button type="button" class="task-advance btn-table" data-task-id="${escCell(t.id)}">Avanzar</button>`
          : "—";
        return `<tr><td class="cell-nowrap">${formatDateShort(t.createdAt)}</td><td>${statusBadge(t.type)}</td><td>${statusBadge(t.status)}</td><td>${renderCellWithClamp(t.warehouse, "cell-truncate", 18)}</td><td>${renderCellWithClamp(assign, "cell-truncate", 24)}</td><td>${renderCellWithClamp(t.reference, "cell-truncate", 24)}</td><td class="cell-nowrap">${t.priority ?? 0}</td><td class="cell-nowrap">${action}</td></tr>`;
      })
      .join("");
    taskList.innerHTML = `<div class="table-wrap"><table class="scan-table task-table"><thead>${thead}</thead><tbody>${body}</tbody></table></div>`;
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
      incidentList.innerHTML = '<p class="subtitle" style="margin:0">Sin incidencias.</p>';
      return;
    }
    const canResolve = currentRole === "ADMIN" || currentRole === "SUPERVISOR";
    const thead =
      "<tr><th>Fecha</th><th>Tipo</th><th>Estado</th><th>Reportó</th><th>Producto</th><th>Notas</th><th>Acción</th></tr>";
    const body = rows
      .map((i) => {
        const rep = i.reportedBy ? escCell(i.reportedBy.fullName) : "—";
        const sku = i.product?.sku ? escCell(i.product.sku) : "—";
        const action = canResolve
          ? `<button type="button" class="incident-resolve btn-table btn-danger" data-incident-id="${escCell(i.id)}">Cerrar</button>`
          : "—";
        return `<tr><td class="cell-nowrap">${formatDateShort(i.createdAt)}</td><td>${statusBadge(i.type)}</td><td>${statusBadge(i.status)}</td><td>${renderCellWithClamp(rep, "cell-truncate", 22)}</td><td class="cell-nowrap">${sku}</td><td>${renderCellWithClamp(i.notes, "cell-notes", 120)}</td><td class="cell-nowrap">${action}</td></tr>`;
      })
      .join("");
    incidentList.innerHTML = `<div class="table-wrap"><table class="scan-table incident-table"><thead>${thead}</thead><tbody>${body}</tbody></table></div>`;
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
  if (!inventoryList) return;
  if (currentRole !== "ADMIN" && currentRole !== "OPERATOR" && currentRole !== "SUPERVISOR") {
    inventoryList.innerHTML = '<span style="color:#9caacc">Las existencias solo aplican a roles operativos.</span>';
    return;
  }
  const response = await authenticatedFetch("/api/inventory/stock");
  if (!response?.ok) {
    inventoryList.textContent = "No se pudo cargar existencias.";
    return;
  }
  const rows = await response.json();
  if (!Array.isArray(rows) || rows.length === 0) {
    inventoryList.innerHTML =
      '<span style="color:#9caacc">Sin registros de existencias. Usa Inventario para cargar saldos o importar CSV.</span>';
    return;
  }
  const thead =
    "<tr><th>SKU</th><th>Producto</th><th>Almacén</th><th>Cantidad</th></tr>";
  const body = rows
    .map((row) => {
      const p = row.product || {};
      const wh = row.location?.warehouse || "—";
      const loc = row.location?.code ? ` / ${row.location.code}` : "";
      return `<tr><td class="cell-nowrap"><strong>${escCell(p.sku || "—")}</strong></td><td>${renderCellWithClamp(p.name || "—", "cell-truncate", 38)}</td><td>${renderCellWithClamp(`${wh}${loc}`, "cell-truncate", 24)}</td><td class="cell-nowrap">${formatQty(row.qty)}</td></tr>`;
    })
    .join("");
  inventoryList.innerHTML = `<div class="table-wrap"><table class="scan-table"><thead>${thead}</thead><tbody>${body}</tbody></table></div>`;
}

async function loadInventoryMovements() {
  if (!inventoryMovementsList) return;
  if (currentRole !== "ADMIN" && currentRole !== "OPERATOR" && currentRole !== "SUPERVISOR") {
    inventoryMovementsList.innerHTML = "";
    return;
  }
  const response = await authenticatedFetch("/api/inventory/movements");
  if (!response?.ok) {
    inventoryMovementsList.textContent = "No se pudo cargar movimientos.";
    return;
  }
  const rows = await response.json();
  if (!Array.isArray(rows) || rows.length === 0) {
    inventoryMovementsList.innerHTML =
      '<p class="subtitle" style="margin:0">Aún no hay movimientos registrados.</p>';
    return;
  }
  const thead =
    "<tr><th>Fecha</th><th>SKU</th><th>Tipo</th><th>Antes</th><th>Después</th><th>Almacén</th><th>Usuario</th><th>Ref.</th></tr>";
  const body = rows
    .map((m) => {
      const sku = m.product?.sku || "—";
      const u = m.user?.fullName || "—";
      const ref = m.reference || "—";
      return `<tr><td class="cell-nowrap">${formatDateShort(m.createdAt)}</td><td class="cell-nowrap">${escCell(sku)}</td><td>${statusBadge(m.movementType)}</td><td class="cell-nowrap">${formatQty(m.quantityBefore)}</td><td class="cell-nowrap">${formatQty(m.quantityAfter)}</td><td>${renderCellWithClamp(m.warehouse, "cell-truncate", 20)}</td><td>${renderCellWithClamp(u, "cell-truncate", 20)}</td><td>${renderCellWithClamp(ref, "cell-truncate", 20)}</td></tr>`;
    })
    .join("");
  inventoryMovementsList.innerHTML = `<div class="table-wrap"><table class="scan-table"><thead>${thead}</thead><tbody>${body}</tbody></table></div>`;
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
    notes: moveNotes.value.trim() || undefined
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
  if (importResult) importResult.textContent = "";
  importBtn.disabled = true;
  const csv = importCsv.value.trim();
  if (!csv) {
    if (importResult) importResult.textContent = "Pega el contenido CSV.";
    importBtn.disabled = false;
    return;
  }
  try {
    const response = await authenticatedFetch("/api/inventory/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ csv })
    });
    if (!response) return;
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      if (importResult) importResult.textContent = data.message || "Importación rechazada.";
      return;
    }
    const errLines =
      Array.isArray(data.errors) && data.errors.length
        ? data.errors.map((e) => `${e.sku}: ${e.message}`).join("; ")
        : "";
    if (importResult) {
      importResult.textContent = `Inventario cargado: ${data.applied} registros aplicados, ${data.skipped || 0} omitidos.${errLines ? ` Detalle: ${errLines}` : ""}`;
    }
    importCsv.value = "";
    await loadStockStrip();
    await loadInventoryMovements();
  } catch (_e) {
    if (importResult) importResult.textContent = "Error de red en importación.";
  } finally {
    importBtn.disabled = false;
  }
}

async function loadCatalogData() {
  await loadProductsRows();

  const clientsResponse = await authenticatedFetch("/api/catalog/clients");
  if (clientsResponse?.ok) {
    const clients = await clientsResponse.json();
    clientsList.innerHTML = (Array.isArray(clients) ? clients : [])
      .map((client) => {
        const deleteBtn =
          currentRole === "ADMIN"
            ? `<button type="button" class="user-delete" data-delete-customer="${client.id}">Eliminar cliente</button>`
            : "";
        return `<div class="user-row"><strong>${client.code || "N/A"}</strong> - ${client.name}${deleteBtn}</div>`;
      })
      .join("");
  }
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
  catalogImportSection.classList.toggle("hidden", role !== "ADMIN");
  movementForm.classList.toggle("hidden", role !== "ADMIN");
  importSection.classList.toggle("hidden", role !== "ADMIN");
  if (taskCreateWrap) {
    taskCreateWrap.classList.toggle("hidden", role !== "ADMIN" && role !== "SUPERVISOR");
  }
  const canExportInventory = role === "ADMIN" || role === "OPERATOR" || role === "SUPERVISOR";
  const canExportTrace = canExportInventory;
  const canExportProducts = role === "ADMIN" || role === "CLIENT";
  if (exportStockBtn) exportStockBtn.style.display = canExportInventory ? "inline-block" : "none";
  if (exportMovementsBtn) exportMovementsBtn.style.display = canExportInventory ? "inline-block" : "none";
  if (exportTraceBtn) exportTraceBtn.style.display = canExportTrace ? "inline-block" : "none";
  if (exportProductsBtn) exportProductsBtn.style.display = canExportProducts ? "inline-block" : "none";
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

async function runCatalogImport(mode) {
  catalogImportResult.textContent = "";
  const csv = catalogImportCsv.value.trim();
  if (!csv) {
    catalogImportResult.textContent = "Pega contenido CSV.";
    return;
  }
  const btn = mode === "preview" ? catalogPreviewBtn : catalogApplyBtn;
  btn.disabled = true;

  try {
    const response = await authenticatedFetch("/api/catalog/import/products", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ csv, mode, autoCreateCustomers: false })
    });
    if (!response) return;
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      catalogImportResult.textContent = data.message || "No se pudo procesar importacion.";
      return;
    }
    const sample = Array.isArray(data.preview) ? data.preview.slice(0, 8) : [];
    const previewLine = sample.map((p) => `${p.sku}:${p.action}`).join(", ");
    const unknownCustomers = Array.isArray(data.unknownCustomers) ? data.unknownCustomers : [];
    const suppliersDetected = Array.isArray(data.suppliersDetected) ? data.suppliersDetected : [];
    const suppliersPo = Array.isArray(data.supplierPoDetected) ? data.supplierPoDetected : [];
    catalogImportResult.textContent = `Vista previa: crear ${data.created || 0}, actualizar ${data.updated || 0}, omitir ${data.skipped || 0}.${previewLine ? ` Muestra: ${previewLine}` : ""}${unknownCustomers.length ? ` Clientes no encontrados: ${unknownCustomers.join(" | ")}.` : ""}${suppliersDetected.length ? ` Proveedores detectados: ${suppliersDetected.slice(0, 4).join(", ")}.` : ""}${suppliersPo.length ? ` Supplier PO detectados: ${suppliersPo.slice(0, 4).join(", ")}.` : ""}`;

    if (mode === "preview" && unknownCustomers.length > 0) {
      const confirmed = window.confirm(
        `Se detectaron ${unknownCustomers.length} clientes no existentes. ¿Crear estos clientes automáticamente y aplicar importación? (Solo ADMIN)`
      );
      if (confirmed) {
        const applyResponse = await authenticatedFetch("/api/catalog/import/products", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ csv, mode: "apply", autoCreateCustomers: true })
        });
        if (applyResponse?.ok) {
          const applyData = await applyResponse.json().catch(() => ({}));
          catalogImportResult.textContent = `Aplicado con alta automática de clientes. Crear: ${applyData.created || 0}, actualizar: ${applyData.updated || 0}, omitidos: ${applyData.skipped || 0}.`;
          await loadCatalogData();
          return;
        }
      }
    }
    if (mode === "apply") {
      await loadCatalogData();
    }
  } catch (_error) {
    catalogImportResult.textContent = "Error de red en importacion de catalogo.";
  } finally {
    btn.disabled = false;
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

    statusBox.innerHTML = '<span class="ok">Sistema operativo</span>';
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
    statusBox.innerHTML = '<span class="error">Error de red validando sesion.</span>';
    currentUserEmail.textContent = "No disponible";
    currentUserRoleText.textContent = "No disponible";
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

clientsList.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;
  const id = target.getAttribute("data-delete-customer");
  if (id) {
    void deleteCustomerById(id);
  }
});

logoutBtn.addEventListener("click", forceLogout);
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
validateSession();
