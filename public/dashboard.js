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

let currentRole = null;
let currentUserId = null;

const roleModules = {
  ADMIN: ["users", "picking", "inventory", "catalog", "account"],
  OPERATOR: ["picking", "inventory", "account"],
  CLIENT: ["catalog", "account"]
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
  moduleUsers.classList.toggle("hidden", !showUsers);
  modulePicking.classList.toggle("hidden", !showPicking);
  moduleInventory.classList.toggle("hidden", !showInventory);
  moduleCatalog.classList.toggle("hidden", !showCatalog);
  moduleAccount.classList.toggle("hidden", !showAccount);
  modulePlaceholder.classList.toggle(
    "hidden",
    showUsers || showPicking || showInventory || showCatalog || showAccount
  );
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
  const showOperator = currentRole === "ADMIN";
  const thead = showOperator
    ? "<tr><th>Fecha / hora</th><th>Operador</th><th>Código</th><th>Resultado</th><th>Detalle</th></tr>"
    : "<tr><th>Fecha /hora</th><th>Código</th><th>Resultado</th><th>Detalle</th></tr>";
  const body = rows
    .map((scan) => {
      const name = scan.product?.name || "—";
      const skuPart = scan.product?.sku ? ` · SKU ${scan.product.sku}` : "";
      const operator =
        showOperator && scan.user
          ? `<td>${scan.user.fullName}<br/><small style="color:#9caacc">${scan.user.email}</small></td>`
          : "";
      const firstCols = showOperator
        ? `<td>${formatScanDate(scan.createdAt)}</td>${operator}<td><strong>${scan.scannedCode}</strong></td><td>${scan.result}</td><td>${name}${skuPart}</td>`
        : `<td>${formatScanDate(scan.createdAt)}</td><td><strong>${scan.scannedCode}</strong></td><td>${scan.result}</td><td>${name}${skuPart}</td>`;
      return `<tr>${firstCols}</tr>`;
    })
    .join("");
  scanEventsList.innerHTML = `<table class="scan-table"><thead>${thead}</thead><tbody>${body}</tbody></table>`;
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

async function loadStockStrip() {
  if (!inventoryList) return;
  if (currentRole !== "ADMIN" && currentRole !== "OPERATOR") {
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
      return `<tr><td><strong>${p.sku || "—"}</strong></td><td>${p.name || "—"}</td><td>${wh}${loc}</td><td>${formatQty(row.qty)}</td></tr>`;
    })
    .join("");
  inventoryList.innerHTML = `<table class="scan-table"><thead>${thead}</thead><tbody>${body}</tbody></table>`;
}

async function loadInventoryMovements() {
  if (!inventoryMovementsList) return;
  if (currentRole !== "ADMIN" && currentRole !== "OPERATOR") {
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
      return `<tr><td>${formatScanDate(m.createdAt)}</td><td>${sku}</td><td>${m.movementType}</td><td>${formatQty(m.quantityBefore)}</td><td>${formatQty(m.quantityAfter)}</td><td>${m.warehouse}</td><td>${u}</td><td>${ref}</td></tr>`;
    })
    .join("");
  inventoryMovementsList.innerHTML = `<div style="overflow:auto;max-width:100%"><table class="scan-table"><thead>${thead}</thead><tbody>${body}</tbody></table></div>`;
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
      importResult.textContent = `Aplicados: ${data.applied}. Omitidos: ${data.skipped || 0}.${errLines ? ` Detalle: ${errLines}` : ""}`;
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
      .map((client) => `<div class="user-row"><strong>${client.code || "N/A"}</strong> - ${client.name}</div>`)
      .join("");
  }
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
      body: JSON.stringify({ csv, mode })
    });
    if (!response) return;
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      catalogImportResult.textContent = data.message || "No se pudo procesar importacion.";
      return;
    }
    const sample = Array.isArray(data.preview) ? data.preview.slice(0, 8) : [];
    const previewLine = sample.map((p) => `${p.sku}:${p.action}`).join(", ");
    catalogImportResult.textContent = `Modo ${data.mode}. Crear: ${data.created || 0}, actualizar: ${data.updated || 0}, omitidos: ${data.skipped || 0}.${previewLine ? ` Preview: ${previewLine}` : ""}`;
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
  scanResult.textContent = "";
  scanBtn.disabled = true;

  const code = scanInput.value.trim();
  if (!code) {
    scanHint.textContent = "Escanea un SKU o codigo.";
    scanBtn.disabled = false;
    return;
  }

  try {
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
      scanResult.textContent = "Resultado: ERROR";
      await loadScanEvents();
      return;
    }

    const product = payload.product;
    scanResult.textContent = `OK: ${product?.sku} - ${product?.name}`;
    scanHint.textContent = `Almacen: ${product?.warehouse || "TULTITLAN24"}`;
    scanInput.value = "";
    await loadScanEvents();
  } catch (_error) {
    scanHint.textContent = "Error de red en escaneo.";
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

    statusBox.innerHTML = '<span class="ok">API protegida funcionando</span>';
    const displayName = user.fullName || user.email || "Usuario";
    if (sessionDisplayName) sessionDisplayName.textContent = `Hola, ${displayName}`;
    if (sessionEmailInline) sessionEmailInline.textContent = user.email || "—";
    if (sessionRoleInline) sessionRoleInline.textContent = ` · Rol: ${currentRole}`;
    if (currentUserFullName) currentUserFullName.textContent = user.fullName || "—";
    currentUserEmail.textContent = user.email || "No disponible";
    currentUserRoleText.textContent = currentRole;
    await loadUsersModule(currentRole);
    await loadCatalogData();
    if (currentRole === "ADMIN" || currentRole === "OPERATOR") {
      await loadStockStrip();
      await loadInventoryMovements();
      await loadScanEvents();
    } else if (scanEventsList) {
      scanEventsList.innerHTML =
        '<p class="subtitle" style="margin:0">El historial de picking no aplica a tu rol.</p>';
    }
    scanHint.textContent = "Escaner activo. Ubicacion inicial: recepcion/bodega (TULTITLAN24).";
    activateModule(roleModules[currentRole][0] || "account");
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
validateSession();
