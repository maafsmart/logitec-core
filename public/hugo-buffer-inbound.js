(function () {
  "use strict";

  var TOKEN_KEY = "token";
  var state = {
    me: null,
    bootstrap: null,
    locations: [],
    projects: [],
    selectedProduct: null,
    serials: [],
    busy: false
  };

  var gateMessage = document.getElementById("gateMessage");
  var workspace = document.getElementById("workspace");
  var scanInput = document.getElementById("scanInput");
  var productMatches = document.getElementById("productMatches");
  var selectedProductEl = document.getElementById("selectedProduct");
  var qtyInput = document.getElementById("qtyInput");
  var assignmentSelect = document.getElementById("assignmentSelect");
  var projectWrap = document.getElementById("projectWrap");
  var projectSelect = document.getElementById("projectSelect");
  var locationSelect = document.getElementById("locationSelect");
  var orderRefInput = document.getElementById("orderRefInput");
  var lotInput = document.getElementById("lotInput");
  var serialBlock = document.getElementById("serialBlock");
  var serialInput = document.getElementById("serialInput");
  var serialList = document.getElementById("serialList");
  var notesInput = document.getElementById("notesInput");
  var submitBtn = document.getElementById("submitBtn");
  var actionMessage = document.getElementById("actionMessage");

  function token() {
    try {
      return String(localStorage.getItem(TOKEN_KEY) || "").trim();
    } catch (_e) {
      return "";
    }
  }

  function redirectLogin() {
    var next = encodeURIComponent("/hugo-buffer-inbound.html");
    window.location.href = "/login.html?next=" + next;
  }

  function setGate(text, tone) {
    if (!gateMessage) return;
    gateMessage.textContent = text;
    gateMessage.className = "card msg " + (tone || "idle");
  }

  function setAction(text, tone) {
    if (!actionMessage) return;
    actionMessage.textContent = text;
    actionMessage.className = "msg " + (tone || "idle");
    actionMessage.classList.remove("hidden");
  }

  function hideAction() {
    if (actionMessage) actionMessage.classList.add("hidden");
  }

  function authHeaders() {
    var headers = { Accept: "application/json" };
    var t = token();
    if (t) headers.Authorization = "Bearer " + t;
    return headers;
  }

  function apiFetch(path, options) {
    options = options || {};
    var headers = Object.assign({}, authHeaders(), options.headers || {});
    if (options.body && !headers["Content-Type"]) {
      headers["Content-Type"] = "application/json";
    }
    return fetch(path, {
      method: options.method || "GET",
      headers: headers,
      body: options.body ? JSON.stringify(options.body) : undefined
    });
  }

  function operationalClientId() {
    var me = state.me;
    if (!me) return null;
    if (me.operationalClient && me.operationalClient.id) return me.operationalClient.id;
    if (me.client && me.client.id) return me.client.id;
    if (me.clientId) return me.clientId;
    return null;
  }

  function syncAssignmentUi() {
    var isProject = assignmentSelect && assignmentSelect.value === "PROJECT";
    if (projectWrap) projectWrap.classList.toggle("hidden", !isProject);
  }

  function syncSerialUi() {
    var product = state.selectedProduct;
    var serialControlled = Boolean(product && product.serialControlled);
    if (serialBlock) serialBlock.classList.toggle("hidden", !serialControlled);
    if (serialControlled && state.serials.length) {
      serialList.innerHTML = state.serials
        .map(function (row) {
          return "<li>" + escapeHtml(row.serialNumber) + (row.imei ? " · IMEI " + escapeHtml(row.imei) : "") + "</li>";
        })
        .join("");
    } else if (serialList) {
      serialList.innerHTML = "";
    }
    if (serialControlled && qtyInput) {
      qtyInput.value = String(Math.max(1, state.serials.length || 1));
      qtyInput.readOnly = true;
    } else if (qtyInput) {
      qtyInput.readOnly = false;
    }
  }

  function syncSubmitEnabled() {
    if (!submitBtn) return;
    var qty = Number(qtyInput && qtyInput.value);
    var locationCode = locationSelect && locationSelect.value;
    var ok =
      !state.busy &&
      state.selectedProduct &&
      locationCode &&
      qty > 0 &&
      Number.isFinite(qty) &&
      (!state.selectedProduct.serialControlled || state.serials.length === qty);
    if (assignmentSelect && assignmentSelect.value === "PROJECT") {
      ok = ok && projectSelect && projectSelect.value;
    }
    submitBtn.disabled = !ok;
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function renderSelectedProduct() {
    var product = state.selectedProduct;
    if (!product || !selectedProductEl) {
      if (selectedProductEl) selectedProductEl.classList.add("hidden");
      syncSerialUi();
      syncSubmitEnabled();
      return;
    }
    selectedProductEl.classList.remove("hidden");
    selectedProductEl.innerHTML =
      "<strong>" +
      escapeHtml(product.sku) +
      "</strong> · " +
      escapeHtml(product.name || "") +
      (product.serialControlled ? "<br><span>Producto serializado: captura cada serie.</span>" : "");
    syncSerialUi();
    syncSubmitEnabled();
  }

  function clearMatches() {
    if (!productMatches) return;
    productMatches.innerHTML = "";
    productMatches.classList.add("hidden");
  }

  function renderMatches(rows) {
    if (!productMatches) return;
    if (!rows.length) {
      productMatches.innerHTML = "<li><button type=\"button\" class=\"ghost\" disabled>Sin coincidencias</button></li>";
      productMatches.classList.remove("hidden");
      return;
    }
    productMatches.innerHTML = rows
      .map(function (row, index) {
        return (
          '<li><button type="button" data-index="' +
          index +
          '"><strong>' +
          escapeHtml(row.sku) +
          "</strong><span>" +
          escapeHtml(row.name || "") +
          "</span></button></li>"
        );
      })
      .join("");
    productMatches.classList.remove("hidden");
    productMatches.querySelectorAll("button[data-index]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var idx = Number(btn.getAttribute("data-index"));
        selectProduct(rows[idx]);
      });
    });
  }

  function selectProduct(product) {
    state.selectedProduct = product;
    state.serials = [];
    clearMatches();
    if (scanInput) scanInput.value = product.sku || "";
    renderSelectedProduct();
    hideAction();
    if (product.serialControlled && serialInput) {
      serialInput.focus();
    } else if (qtyInput) {
      qtyInput.focus();
    }
  }

  function applyPreferredLocation() {
    if (!locationSelect || !state.bootstrap) return;
    var prefCode = String(state.bootstrap.preferredLocationCode || "").trim().toUpperCase();
    var prefWh = String(state.bootstrap.preferredWarehouse || "").trim().toUpperCase();
    if (!prefCode) return;
    for (var i = 0; i < locationSelect.options.length; i += 1) {
      var opt = locationSelect.options[i];
      var code = String(opt.getAttribute("data-code") || "").toUpperCase();
      var wh = String(opt.getAttribute("data-warehouse") || "").toUpperCase();
      if (code === prefCode && (!prefWh || wh === prefWh)) {
        locationSelect.selectedIndex = i;
        break;
      }
    }
  }

  function fillLocations(rows) {
    if (!locationSelect) return;
    locationSelect.innerHTML = '<option value="">— Seleccionar ubicación —</option>';
    rows.forEach(function (row) {
      var opt = document.createElement("option");
      opt.value = row.code;
      opt.setAttribute("data-code", row.code);
      opt.setAttribute("data-warehouse", row.warehouse || "");
      opt.textContent = (row.warehouse ? row.warehouse + " · " : "") + row.code;
      locationSelect.appendChild(opt);
    });
    applyPreferredLocation();
    syncSubmitEnabled();
  }

  function fillProjects(rows) {
    if (!projectSelect) return;
    projectSelect.innerHTML = '<option value="">— Seleccionar —</option>';
    rows.forEach(function (row) {
      var opt = document.createElement("option");
      opt.value = row.id;
      opt.textContent = row.name ? row.name + " (" + row.code + ")" : row.code;
      projectSelect.appendChild(opt);
    });
  }

  async function lookupCode(rawCode) {
    if (state.busy) return;
    var code = String(rawCode || "").trim();
    if (!code) return;
    hideAction();
    var response = await apiFetch("/api/catalog/products/search?q=" + encodeURIComponent(code) + "&limit=12");
    var data = await response.json().catch(function () {
      return [];
    });
    if (!response.ok) {
      setAction((data && data.message) || "No se pudo buscar el código.", "err");
      return;
    }
    var rows = Array.isArray(data) ? data : [];
    if (!rows.length) {
      clearMatches();
      state.selectedProduct = null;
      renderSelectedProduct();
      setAction("Código no identificado en catálogo.", "err");
      return;
    }
    var exact = rows.find(function (row) {
      return (
        String(row.sku || "").toUpperCase() === code.toUpperCase() ||
        String(row.barcode || "").toUpperCase() === code.toUpperCase()
      );
    });
    if (exact) {
      selectProduct(exact);
      setAction("Producto identificado.", "ok");
      return;
    }
    if (rows.length === 1) {
      selectProduct(rows[0]);
      setAction("Producto identificado.", "ok");
      return;
    }
    renderMatches(rows);
    setAction("Varias coincidencias. Elige el producto correcto.", "idle");
  }

  function parseSerialToken(raw) {
    var value = String(raw || "").trim();
    if (!value) return null;
    return { serialNumber: value, imei: null };
  }

  function addSerialFromInput() {
    if (!state.selectedProduct || !state.selectedProduct.serialControlled) return;
    var parsed = parseSerialToken(serialInput && serialInput.value);
    if (!parsed) return;
    if (state.serials.some(function (row) { return row.serialNumber.toUpperCase() === parsed.serialNumber.toUpperCase(); })) {
      setAction("Serie duplicada en esta captura.", "err");
      return;
    }
    state.serials.push(parsed);
    if (serialInput) serialInput.value = "";
    syncSerialUi();
    syncSubmitEnabled();
    setAction("Serie capturada (" + state.serials.length + ").", "ok");
  }

  async function submitInbound() {
    if (state.busy || !state.selectedProduct) return;
    var product = state.selectedProduct;
    var qty = Number(qtyInput && qtyInput.value);
    var locationCode = locationSelect && locationSelect.value;
    var assignmentType = assignmentSelect ? assignmentSelect.value : "FREE_TO_SALE";
    var clientId = operationalClientId();
    if (!locationCode || !(qty > 0)) {
      setAction("Completa ubicación y cantidad válida.", "err");
      return;
    }
    if (assignmentType === "PROJECT" && !(projectSelect && projectSelect.value)) {
      setAction("Selecciona un proyecto.", "err");
      return;
    }
    if (product.serialControlled && state.serials.length !== qty) {
      setAction("Captura todas las series antes de registrar.", "err");
      return;
    }

    var payload = {
      sku: product.sku,
      type: "IN",
      quantity: qty,
      location: locationCode,
      status: "AVAILABLE",
      assignmentType: assignmentType,
      reference: orderRefInput && orderRefInput.value.trim() ? orderRefInput.value.trim() : undefined,
      notes: notesInput && notesInput.value.trim() ? notesInput.value.trim() : undefined
    };
    if (lotInput && lotInput.value.trim()) payload.lotNumber = lotInput.value.trim();
    if (assignmentType === "FREE_TO_SALE") {
      payload.clientId = clientId;
      payload.projectId = null;
    } else {
      payload.projectId = projectSelect.value;
    }
    if (product.serialControlled) {
      payload.serials = state.serials.slice();
    }

    state.busy = true;
    syncSubmitEnabled();
    hideAction();
    try {
      var response = await apiFetch("/api/inventory/movements", {
        method: "POST",
        body: payload
      });
      var data = await response.json().catch(function () {
        return {};
      });
      if (!response.ok) {
        setAction((data && data.message) || "No se pudo registrar la entrada.", "err");
        return;
      }
      setAction("Entrada registrada en " + locationCode + ".", "ok");
      state.selectedProduct = null;
      state.serials = [];
      if (scanInput) scanInput.value = "";
      if (orderRefInput) orderRefInput.value = "";
      if (lotInput) lotInput.value = "";
      if (notesInput) notesInput.value = "";
      if (qtyInput) {
        qtyInput.value = "1";
        qtyInput.readOnly = false;
      }
      renderSelectedProduct();
      if (scanInput) scanInput.focus();
    } catch (_e) {
      setAction("Error de red.", "err");
    } finally {
      state.busy = false;
      syncSubmitEnabled();
    }
  }

  async function bootstrap() {
    if (!token()) {
      redirectLogin();
      return;
    }
    var meResp = await apiFetch("/api/auth/me");
    var me = await meResp.json().catch(function () {
      return {};
    });
    if (!meResp.ok) {
      redirectLogin();
      return;
    }
    state.me = me.user || me;
    if (state.me && state.me.role === "ADMIN" && !operationalClientId()) {
      setGate("Selecciona un cliente operativo en el dashboard antes de usar esta pantalla.", "err");
      return;
    }

    var bootResp = await apiFetch("/api/hugo-flow/bootstrap");
    if (bootResp.status === 404) {
      setGate("Pantalla deshabilitada. Activa ENABLE_HUGO_BUFFER_INBOUND en tu .env local.", "err");
      return;
    }
    var boot = await bootResp.json().catch(function () {
      return {};
    });
    if (!bootResp.ok) {
      setGate((boot && boot.message) || "No se pudo iniciar el flujo.", "err");
      return;
    }
    state.bootstrap = boot;

    var locResp = await apiFetch("/api/inventory/locations");
    var locations = await locResp.json().catch(function () {
      return [];
    });
    if (!locResp.ok) {
      setGate((locations && locations.message) || "No se pudieron cargar ubicaciones.", "err");
      return;
    }
    state.locations = Array.isArray(locations) ? locations.filter(function (row) { return row.active !== false; }) : [];
    fillLocations(state.locations);

    var projResp = await apiFetch("/api/inventory/projects");
    var projects = await projResp.json().catch(function () {
      return [];
    });
    if (projResp.ok && Array.isArray(projects)) {
      state.projects = projects;
      fillProjects(projects);
    }

    if (workspace) workspace.classList.remove("hidden");
    setGate("Listo · cliente " + (state.me.operationalClient && state.me.operationalClient.tradeName || state.me.operationalClient && state.me.operationalClient.name || "activo"), "ok");
    syncAssignmentUi();
    syncSubmitEnabled();
    if (scanInput) scanInput.focus();
  }

  if (scanInput) {
    scanInput.addEventListener("keydown", function (event) {
      if (event.key !== "Enter") return;
      event.preventDefault();
      lookupCode(scanInput.value);
    });
  }
  if (serialInput) {
    serialInput.addEventListener("keydown", function (event) {
      if (event.key !== "Enter") return;
      event.preventDefault();
      addSerialFromInput();
    });
  }
  if (assignmentSelect) {
    assignmentSelect.addEventListener("change", function () {
      syncAssignmentUi();
      syncSubmitEnabled();
    });
  }
  ["qtyInput", "locationSelect", "projectSelect"].forEach(function (id) {
    var el = document.getElementById(id);
    if (el) el.addEventListener("input", syncSubmitEnabled);
    if (el) el.addEventListener("change", syncSubmitEnabled);
  });
  if (submitBtn) submitBtn.addEventListener("click", submitInbound);

  bootstrap();
})();
