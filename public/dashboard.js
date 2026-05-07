const token = localStorage.getItem("token");
const statusBox = document.getElementById("statusBox");
const usersSummary = document.getElementById("usersSummary");
const logoutBtn = document.getElementById("logoutBtn");
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
const productSku = document.getElementById("productSku");
const productBarcode = document.getElementById("productBarcode");
const productName = document.getElementById("productName");
const productWarehouse = document.getElementById("productWarehouse");
const productsList = document.getElementById("productsList");
const clientsList = document.getElementById("clientsList");

let currentRole = null;

const roleModules = {
  ADMIN: ["users", "picking", "catalog", "account"],
  OPERATOR: ["picking", "account"],
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
  const showCatalog = moduleName === "catalog";
  const showAccount = moduleName === "account";
  moduleUsers.classList.toggle("hidden", !showUsers);
  modulePicking.classList.toggle("hidden", !showPicking);
  moduleCatalog.classList.toggle("hidden", !showCatalog);
  moduleAccount.classList.toggle("hidden", !showAccount);
  modulePlaceholder.classList.toggle("hidden", showUsers || showPicking || showCatalog || showAccount);
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
  usersMessage.textContent = "Gestion inicial de usuarios activa.";
  usersList.innerHTML = (Array.isArray(users) ? users : [])
    .map((user) => `<div class="user-row"><strong>${user.fullName}</strong> - ${user.email} (${user.role})</div>`)
    .join("");
  renderUsersSummary(`Usuarios visibles: ${Array.isArray(users) ? users.length : 0}`);
}

async function loadScanEvents() {
  const response = await authenticatedFetch("/api/picking/scans");
  if (!response || !response.ok) return;
  const scans = await response.json();
  scanEventsList.innerHTML = (Array.isArray(scans) ? scans : [])
    .map((scan) => {
      const name = scan.product?.name || "producto no encontrado";
      return `<div class="user-row"><strong>${scan.scannedCode}</strong> - ${scan.result} (${name})</div>`;
    })
    .join("");
}

async function loadCatalogData() {
  const productsResponse = await authenticatedFetch("/api/catalog/products");
  if (productsResponse?.ok) {
    const products = await productsResponse.json();
    productsList.innerHTML = (Array.isArray(products) ? products : [])
      .map((product) => `<div class="user-row"><strong>${product.sku}</strong> - ${product.name} (${product.warehouse})</div>`)
      .join("");
  }

  const clientsResponse = await authenticatedFetch("/api/catalog/clients");
  if (clientsResponse?.ok) {
    const clients = await clientsResponse.json();
    clientsList.innerHTML = (Array.isArray(clients) ? clients : [])
      .map((client) => `<div class="user-row"><strong>${client.name}</strong>${client.email ? ` - ${client.email}` : ""}</div>`)
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
    productWarehouse.value = "TULTITLAN24";
    await loadCatalogData();
  } catch (_error) {
    createProductError.textContent = "Error de red creando producto.";
  } finally {
    createProductBtn.disabled = false;
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

async function validateSession() {
  try {
    const user = await loadCurrentUser();
    if (!user) return;
    currentRole = user.role || "CLIENT";
    applyRoleNavigation(currentRole);

    statusBox.innerHTML = '<span class="ok">API protegida funcionando</span>';
    currentUserEmail.textContent = user.email || "No disponible";
    currentUserRoleText.textContent = currentRole;
    await loadUsersModule(currentRole);
    await loadCatalogData();
    await loadScanEvents();
    scanHint.textContent = "Escaner activo. Ubicacion inicial: recepcion/bodega (TULTITLAN24).";
    activateModule(roleModules[currentRole][0] || "account");
  } catch (_error) {
    statusBox.innerHTML = '<span class="error">Error de red validando sesion.</span>';
    currentUserEmail.textContent = "No disponible";
    currentUserRoleText.textContent = "No disponible";
  }
}

moduleButtons.forEach((btn) => {
  btn.addEventListener("click", () => activateModule(btn.dataset.module));
});

logoutBtn.addEventListener("click", forceLogout);
createUserForm.addEventListener("submit", createUser);
changePasswordForm.addEventListener("submit", changePassword);
createProductForm.addEventListener("submit", createProduct);
scanForm.addEventListener("submit", scanCode);
validateSession();
