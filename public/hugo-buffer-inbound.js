(function () {
  "use strict";

  var TOKEN_KEY = "token";
  var OUT_PREP_NOTES = "Preparación Buffer de salida";
  var CLIENT_REF_MAX = 120;
  var state = {
    me: null,
    bootstrap: null,
    locations: [],
    projects: [],
    selectedProduct: null,
    serials: [],
    busy: false,
    moveBusy: false,
    moveProduct: null,
    moveStock: [],
    moveOrigin: null,
    outBusy: false,
    outProduct: null,
    outStock: [],
    outOrigin: null
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
  var moveScanInput = document.getElementById("moveScanInput");
  var moveProductMatches = document.getElementById("moveProductMatches");
  var moveSelectedProductEl = document.getElementById("moveSelectedProduct");
  var moveStockBlock = document.getElementById("moveStockBlock");
  var moveStockList = document.getElementById("moveStockList");
  var moveOriginSummary = document.getElementById("moveOriginSummary");
  var moveDestScan = document.getElementById("moveDestScan");
  var moveDestSelect = document.getElementById("moveDestSelect");
  var moveQtyInput = document.getElementById("moveQtyInput");
  var moveSubmitBtn = document.getElementById("moveSubmitBtn");
  var moveActionMessage = document.getElementById("moveActionMessage");
  var outScanInput = document.getElementById("outScanInput");
  var outProductMatches = document.getElementById("outProductMatches");
  var outSelectedProductEl = document.getElementById("outSelectedProduct");
  var outStockBlock = document.getElementById("outStockBlock");
  var outStockList = document.getElementById("outStockList");
  var outOriginSummary = document.getElementById("outOriginSummary");
  var outBufferScan = document.getElementById("outBufferScan");
  var outBufferSelect = document.getElementById("outBufferSelect");
  var outQtyInput = document.getElementById("outQtyInput");
  var outOrderRefInput = document.getElementById("outOrderRefInput");
  var outSubmitBtn = document.getElementById("outSubmitBtn");
  var outActionMessage = document.getElementById("outActionMessage");

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

  function setMoveAction(text, tone) {
    if (!moveActionMessage) return;
    moveActionMessage.textContent = text;
    moveActionMessage.className = "msg " + (tone || "idle");
    moveActionMessage.classList.remove("hidden");
  }

  function hideMoveAction() {
    if (moveActionMessage) moveActionMessage.classList.add("hidden");
  }

  function setOutAction(text, tone) {
    if (!outActionMessage) return;
    outActionMessage.textContent = text;
    outActionMessage.className = "msg " + (tone || "idle");
    outActionMessage.classList.remove("hidden");
  }

  function hideOutAction() {
    if (outActionMessage) outActionMessage.classList.add("hidden");
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

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function normalizeClientReference(raw, maxLen) {
    var limit = maxLen || CLIENT_REF_MAX;
    var value = String(raw || "")
      .replace(/\s+/g, " ")
      .trim();
    if (!value) return null;
    return value.slice(0, limit);
  }

  function bindReferenceEnterGuard(inputEl) {
    if (!inputEl) return;
    inputEl.addEventListener("keydown", function (event) {
      if (event.key !== "Enter") return;
      event.preventDefault();
    });
  }

  function availableQty(row) {
    var qty = Number(row && row.qty);
    var reserved = Number(row && row.reservedQty);
    if (!Number.isFinite(qty)) qty = 0;
    if (!Number.isFinite(reserved)) reserved = 0;
    return Math.max(0, qty - reserved);
  }

  function assignmentLabel(row) {
    if (!row) return "";
    if (row.assignmentType === "PROJECT") {
      if (row.project && row.project.name) return row.project.name + " (" + (row.project.code || "") + ")";
      return "Proyecto";
    }
    return "Free to Sale";
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

  function renderMatches(rows, pickList, onPick) {
    if (!pickList) return;
    if (!rows.length) {
      pickList.innerHTML = '<li><button type="button" class="ghost" disabled>Sin coincidencias</button></li>';
      pickList.classList.remove("hidden");
      return;
    }
    pickList.innerHTML = rows
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
    pickList.classList.remove("hidden");
    pickList.querySelectorAll("button[data-index]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var idx = Number(btn.getAttribute("data-index"));
        onPick(rows[idx]);
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
    fillMoveDestSelect();
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
    renderMatches(rows, productMatches, selectProduct);
    setAction("Varias coincidencias. Elige el producto correcto.", "idle");
  }

  function clearMoveMatches() {
    if (!moveProductMatches) return;
    moveProductMatches.innerHTML = "";
    moveProductMatches.classList.add("hidden");
  }

  function renderMoveSelectedProduct() {
    var product = state.moveProduct;
    if (!product || !moveSelectedProductEl) {
      if (moveSelectedProductEl) moveSelectedProductEl.classList.add("hidden");
      syncMoveSubmitEnabled();
      return;
    }
    moveSelectedProductEl.classList.remove("hidden");
    moveSelectedProductEl.innerHTML =
      "<strong>" + escapeHtml(product.sku) + "</strong> · " + escapeHtml(product.name || "");
    syncMoveSubmitEnabled();
  }

  function renderMoveOriginSummary() {
    if (!moveOriginSummary) return;
    var row = state.moveOrigin;
    if (!row) {
      moveOriginSummary.classList.add("hidden");
      moveOriginSummary.innerHTML = "";
      syncMoveSubmitEnabled();
      return;
    }
    var loc = row.location || {};
    moveOriginSummary.classList.remove("hidden");
    moveOriginSummary.innerHTML =
      "Origen: <strong>" +
      escapeHtml(loc.warehouse ? loc.warehouse + " · " + loc.code : loc.code || "") +
      "</strong> · " +
      escapeHtml(row.status || "") +
      " · " +
      escapeHtml(assignmentLabel(row)) +
      " · disp. " +
      escapeHtml(String(availableQty(row)));
    fillMoveDestSelect();
    syncMoveSubmitEnabled();
  }

  function renderMoveStockList() {
    if (!moveStockList || !moveStockBlock) return;
    var rows = state.moveStock;
    if (!rows.length) {
      moveStockBlock.classList.remove("hidden");
      moveStockList.innerHTML = '<li><button type="button" class="ghost" disabled>Sin existencias disponibles</button></li>';
      syncMoveSubmitEnabled();
      return;
    }
    moveStockBlock.classList.remove("hidden");
    moveStockList.innerHTML = rows
      .map(function (row, index) {
        var loc = row.location || {};
        var label =
          (loc.warehouse ? loc.warehouse + " · " : "") +
          (loc.code || "") +
          " · " +
          (row.status || "") +
          " · " +
          assignmentLabel(row) +
          " · disp. " +
          availableQty(row);
        return (
          '<li><button type="button" data-index="' +
          index +
          '"><strong>' +
          escapeHtml(label) +
          "</strong></button></li>"
        );
      })
      .join("");
    moveStockList.querySelectorAll("button[data-index]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var idx = Number(btn.getAttribute("data-index"));
        selectMoveOrigin(state.moveStock[idx]);
      });
    });
    syncMoveSubmitEnabled();
  }

  function selectMoveOrigin(row) {
    state.moveOrigin = row;
    renderMoveOriginSummary();
    hideMoveAction();
    if (moveDestScan) moveDestScan.focus();
  }

  function moveOriginCode() {
    var row = state.moveOrigin;
    if (!row || !row.location) return "";
    return String(row.location.code || "").trim().toUpperCase();
  }

  function moveOriginWarehouse() {
    var row = state.moveOrigin;
    if (!row || !row.location) return "";
    return String(row.location.warehouse || "").trim().toUpperCase();
  }

  function sameMoveWarehouse(locationRow) {
    var originWh = moveOriginWarehouse();
    if (!originWh || !locationRow) return true;
    return String(locationRow.warehouse || "").trim().toUpperCase() === originWh;
  }

  function moveDestCode() {
    var scanned = moveDestScan && moveDestScan.value.trim();
    if (scanned) return scanned.toUpperCase();
    return moveDestSelect && moveDestSelect.value ? String(moveDestSelect.value).trim().toUpperCase() : "";
  }

  function fillMoveDestSelect() {
    if (!moveDestSelect) return;
    var origin = moveOriginCode();
    var originWh = moveOriginWarehouse();
    var previous = moveDestSelect.value;
    moveDestSelect.innerHTML = '<option value="">— Seleccionar destino —</option>';
    state.locations.forEach(function (row) {
      if (row.active === false) return;
      if (originWh && !sameMoveWarehouse(row)) return;
      var code = String(row.code || "").toUpperCase();
      if (origin && code === origin) return;
      var opt = document.createElement("option");
      opt.value = row.code;
      opt.setAttribute("data-code", row.code);
      opt.setAttribute("data-warehouse", row.warehouse || "");
      opt.textContent = (row.warehouse ? row.warehouse + " · " : "") + row.code;
      moveDestSelect.appendChild(opt);
    });
    if (previous) {
      for (var i = 0; i < moveDestSelect.options.length; i += 1) {
        if (String(moveDestSelect.options[i].value).toUpperCase() === String(previous).toUpperCase()) {
          moveDestSelect.selectedIndex = i;
          break;
        }
      }
    }
    syncMoveSubmitEnabled();
  }

  function resolveMoveDestFromScan(rawCode) {
    if (state.moveBusy) return;
    var code = String(rawCode || "").trim();
    if (!code) return;
    hideMoveAction();
    var match = state.locations.find(function (row) {
      return String(row.code || "").toUpperCase() === code.toUpperCase();
    });
    if (!match) {
      setMoveAction("Ubicación destino no encontrada.", "err");
      return;
    }
    if (match.active === false) {
      setMoveAction("La ubicación destino no está activa.", "err");
      return;
    }
    if (!sameMoveWarehouse(match)) {
      setMoveAction(
        "El destino debe estar en el mismo almacén que el origen (" + moveOriginWarehouse() + ").",
        "err"
      );
      return;
    }
    if (moveOriginCode() && moveOriginCode() === String(match.code || "").toUpperCase()) {
      setMoveAction("Origen y destino deben ser distintos.", "err");
      return;
    }
    if (moveDestSelect) {
      for (var i = 0; i < moveDestSelect.options.length; i += 1) {
        if (String(moveDestSelect.options[i].value).toUpperCase() === String(match.code).toUpperCase()) {
          moveDestSelect.selectedIndex = i;
          break;
        }
      }
    }
    if (moveDestScan) moveDestScan.value = match.code;
    setMoveAction("Destino seleccionado: " + match.code + ".", "ok");
    syncMoveSubmitEnabled();
    if (moveQtyInput) moveQtyInput.focus();
  }

  async function loadMoveStock() {
    if (!state.moveProduct) return;
    hideMoveAction();
    state.moveOrigin = null;
    state.moveStock = [];
    renderMoveOriginSummary();
    var response = await apiFetch("/api/inventory/stock");
    var data = await response.json().catch(function () {
      return [];
    });
    if (!response.ok) {
      setMoveAction((data && data.message) || "No se pudieron leer existencias.", "err");
      renderMoveStockList();
      return;
    }
    var rows = Array.isArray(data) ? data : [];
    var productId = state.moveProduct.id;
    var sku = String(state.moveProduct.sku || "").toUpperCase();
    state.moveStock = rows.filter(function (row) {
      var matchesProduct =
        row.productId === productId || (row.product && String(row.product.sku || "").toUpperCase() === sku);
      return matchesProduct && availableQty(row) > 0;
    });
    renderMoveStockList();
    if (!state.moveStock.length) {
      setMoveAction("Sin existencias disponibles para este producto.", "err");
    } else {
      setMoveAction("Selecciona la ubicación origen.", "idle");
    }
  }

  function selectMoveProduct(product) {
    if (product && product.serialControlled) {
      state.moveProduct = null;
      state.moveStock = [];
      state.moveOrigin = null;
      clearMoveMatches();
      renderMoveSelectedProduct();
      renderMoveStockList();
      renderMoveOriginSummary();
      setMoveAction(
        "Producto serializado: usa el flujo especializado de reubicación en el dashboard.",
        "err"
      );
      return;
    }
    state.moveProduct = product;
    state.moveOrigin = null;
    clearMoveMatches();
    if (moveScanInput) moveScanInput.value = product.sku || "";
    renderMoveSelectedProduct();
    void loadMoveStock();
  }

  async function lookupMoveCode(rawCode) {
    if (state.moveBusy) return;
    var code = String(rawCode || "").trim();
    if (!code) return;
    hideMoveAction();
    var response = await apiFetch("/api/catalog/products/search?q=" + encodeURIComponent(code) + "&limit=12");
    var data = await response.json().catch(function () {
      return [];
    });
    if (!response.ok) {
      setMoveAction((data && data.message) || "No se pudo buscar el código.", "err");
      return;
    }
    var rows = Array.isArray(data) ? data : [];
    if (!rows.length) {
      clearMoveMatches();
      state.moveProduct = null;
      state.moveStock = [];
      state.moveOrigin = null;
      renderMoveSelectedProduct();
      renderMoveStockList();
      renderMoveOriginSummary();
      setMoveAction("Código no identificado en catálogo.", "err");
      return;
    }
    var exact = rows.find(function (row) {
      return (
        String(row.sku || "").toUpperCase() === code.toUpperCase() ||
        String(row.barcode || "").toUpperCase() === code.toUpperCase()
      );
    });
    if (exact) {
      selectMoveProduct(exact);
      return;
    }
    if (rows.length === 1) {
      selectMoveProduct(rows[0]);
      return;
    }
    renderMatches(rows, moveProductMatches, selectMoveProduct);
    setMoveAction("Varias coincidencias. Elige el producto correcto.", "idle");
  }

  function syncMoveSubmitEnabled() {
    if (!moveSubmitBtn) return;
    var qty = Number(moveQtyInput && moveQtyInput.value);
    var dest = moveDestCode();
    var origin = moveOriginCode();
    var ok =
      !state.moveBusy &&
      state.moveOrigin &&
      dest &&
      origin &&
      origin !== dest &&
      qty > 0 &&
      Number.isFinite(qty) &&
      qty <= availableQty(state.moveOrigin);
    moveSubmitBtn.disabled = !ok;
  }

  async function refreshMoveAfterSuccess() {
    if (moveDestScan) moveDestScan.value = "";
    if (moveDestSelect) moveDestSelect.selectedIndex = 0;
    if (moveQtyInput) moveQtyInput.value = "1";
    state.moveOrigin = null;
    renderMoveOriginSummary();
    fillMoveDestSelect();
    if (state.moveProduct) {
      await loadMoveStock();
    }
    if (moveScanInput) moveScanInput.focus();
  }

  async function submitMove() {
    if (state.moveBusy || !state.moveOrigin || !state.moveProduct) return;
    var originRow = state.moveOrigin;
    var originCode = moveOriginCode();
    var destCode = moveDestCode();
    var qty = Number(moveQtyInput && moveQtyInput.value);
    var available = availableQty(originRow);

    if (!destCode) {
      setMoveAction("Selecciona o escanea la ubicación destino.", "err");
      return;
    }
    if (originCode && originCode === destCode.toUpperCase()) {
      setMoveAction("Origen y destino deben ser distintos.", "err");
      return;
    }
    if (!(qty > 0) || !Number.isFinite(qty)) {
      setMoveAction("Indica una cantidad mayor que cero.", "err");
      return;
    }
    if (qty > available) {
      setMoveAction("La cantidad no puede superar la disponible (" + available + ").", "err");
      return;
    }
    var destMatch = state.locations.find(function (row) {
      return String(row.code || "").toUpperCase() === destCode.toUpperCase();
    });
    if (destMatch && !sameMoveWarehouse(destMatch)) {
      setMoveAction(
        "El destino debe estar en el mismo almacén que el origen (" + moveOriginWarehouse() + ").",
        "err"
      );
      return;
    }

    state.moveBusy = true;
    syncMoveSubmitEnabled();
    hideMoveAction();
    try {
      var response = await apiFetch("/api/inventory/relocate", {
        method: "POST",
        body: {
          inventoryId: originRow.id,
          allocationMode: "FIFO",
          destinationLocation: destCode,
          quantity: qty,
          reference: "HUGO-MOVE-" + Date.now()
        }
      });
      var data = await response.json().catch(function () {
        return {};
      });
      if (!response.ok) {
        setMoveAction((data && data.message) || "No se pudo confirmar el movimiento.", "err");
        return;
      }
      setMoveAction(
        "Movimiento registrado · " +
          state.moveProduct.sku +
          " · " +
          qty +
          " pza · " +
          originCode +
          " → " +
          destCode.toUpperCase(),
        "ok"
      );
      await refreshMoveAfterSuccess();
    } catch (_e) {
      setMoveAction("Error de red.", "err");
    } finally {
      state.moveBusy = false;
      syncMoveSubmitEnabled();
    }
  }

  function clearOutMatches() {
    if (!outProductMatches) return;
    outProductMatches.innerHTML = "";
    outProductMatches.classList.add("hidden");
  }

  function renderOutSelectedProduct() {
    var product = state.outProduct;
    if (!product || !outSelectedProductEl) {
      if (outSelectedProductEl) outSelectedProductEl.classList.add("hidden");
      syncOutSubmitEnabled();
      return;
    }
    outSelectedProductEl.classList.remove("hidden");
    outSelectedProductEl.innerHTML =
      "<strong>" + escapeHtml(product.sku) + "</strong> · " + escapeHtml(product.name || "");
    syncOutSubmitEnabled();
  }

  function outOriginCode() {
    var row = state.outOrigin;
    if (!row || !row.location) return "";
    return String(row.location.code || "").trim().toUpperCase();
  }

  function outOriginWarehouse() {
    var row = state.outOrigin;
    if (!row || !row.location) return "";
    return String(row.location.warehouse || "").trim().toUpperCase();
  }

  function sameOutWarehouse(locationRow) {
    var originWh = outOriginWarehouse();
    if (!originWh || !locationRow) return true;
    return String(locationRow.warehouse || "").trim().toUpperCase() === originWh;
  }

  function outBufferCode() {
    var scanned = outBufferScan && outBufferScan.value.trim();
    if (scanned) return scanned.toUpperCase();
    return outBufferSelect && outBufferSelect.value ? String(outBufferSelect.value).trim().toUpperCase() : "";
  }

  function preferredBufferOutLocation() {
    if (!state.bootstrap) return null;
    var prefCode = String(state.bootstrap.preferredBufferOutLocationCode || "").trim().toUpperCase();
    var prefWh = String(state.bootstrap.preferredBufferOutWarehouse || "").trim().toUpperCase();
    if (!prefCode) return null;
    return (
      state.locations.find(function (row) {
        if (row.active === false) return false;
        if (String(row.code || "").toUpperCase() !== prefCode) return false;
        if (prefWh && String(row.warehouse || "").toUpperCase() !== prefWh) return false;
        if (outOriginWarehouse() && !sameOutWarehouse(row)) return false;
        return true;
      }) || null
    );
  }

  function fillOutBufferSelect() {
    if (!outBufferSelect) return;
    var origin = outOriginCode();
    var originWh = outOriginWarehouse();
    var previous = outBufferSelect.value;
    outBufferSelect.innerHTML = '<option value="">— Seleccionar Buffer de salida —</option>';
    state.locations.forEach(function (row) {
      if (row.active === false) return;
      if (originWh && !sameOutWarehouse(row)) return;
      var code = String(row.code || "").toUpperCase();
      if (origin && code === origin) return;
      var opt = document.createElement("option");
      opt.value = row.code;
      opt.setAttribute("data-code", row.code);
      opt.setAttribute("data-warehouse", row.warehouse || "");
      opt.textContent = (row.warehouse ? row.warehouse + " · " : "") + row.code;
      outBufferSelect.appendChild(opt);
    });
    if (previous) {
      for (var i = 0; i < outBufferSelect.options.length; i += 1) {
        if (String(outBufferSelect.options[i].value).toUpperCase() === String(previous).toUpperCase()) {
          outBufferSelect.selectedIndex = i;
          break;
        }
      }
    }
    applyPreferredBufferOut();
    syncOutSubmitEnabled();
  }

  function applyPreferredBufferOut() {
    var match = preferredBufferOutLocation();
    if (!match || !outBufferSelect) return;
    for (var i = 0; i < outBufferSelect.options.length; i += 1) {
      if (String(outBufferSelect.options[i].value).toUpperCase() === String(match.code).toUpperCase()) {
        outBufferSelect.selectedIndex = i;
        if (outBufferScan) outBufferScan.value = match.code;
        break;
      }
    }
  }

  function renderOutOriginSummary() {
    if (!outOriginSummary) return;
    var row = state.outOrigin;
    if (!row) {
      outOriginSummary.classList.add("hidden");
      outOriginSummary.innerHTML = "";
      fillOutBufferSelect();
      syncOutSubmitEnabled();
      return;
    }
    var loc = row.location || {};
    outOriginSummary.classList.remove("hidden");
    outOriginSummary.innerHTML =
      "Origen: <strong>" +
      escapeHtml(loc.warehouse ? loc.warehouse + " · " + loc.code : loc.code || "") +
      "</strong> · " +
      escapeHtml(row.status || "") +
      " · " +
      escapeHtml(assignmentLabel(row)) +
      " · disp. " +
      escapeHtml(String(availableQty(row)));
    fillOutBufferSelect();
    syncOutSubmitEnabled();
  }

  function renderOutStockList() {
    if (!outStockList || !outStockBlock) return;
    var rows = state.outStock;
    if (!rows.length) {
      outStockBlock.classList.remove("hidden");
      outStockList.innerHTML = '<li><button type="button" class="ghost" disabled>Sin existencias disponibles</button></li>';
      syncOutSubmitEnabled();
      return;
    }
    outStockBlock.classList.remove("hidden");
    outStockList.innerHTML = rows
      .map(function (row, index) {
        var loc = row.location || {};
        var label =
          (loc.warehouse ? loc.warehouse + " · " : "") +
          (loc.code || "") +
          " · " +
          (row.status || "") +
          " · " +
          assignmentLabel(row) +
          " · disp. " +
          availableQty(row);
        return (
          '<li><button type="button" data-index="' +
          index +
          '"><strong>' +
          escapeHtml(label) +
          "</strong></button></li>"
        );
      })
      .join("");
    outStockList.querySelectorAll("button[data-index]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var idx = Number(btn.getAttribute("data-index"));
        selectOutOrigin(state.outStock[idx]);
      });
    });
    syncOutSubmitEnabled();
  }

  function selectOutOrigin(row) {
    state.outOrigin = row;
    renderOutOriginSummary();
    hideOutAction();
    if (outBufferScan) outBufferScan.focus();
  }

  function resolveOutBufferFromScan(rawCode) {
    if (state.outBusy) return;
    var code = String(rawCode || "").trim();
    if (!code) return;
    hideOutAction();
    var match = state.locations.find(function (row) {
      return String(row.code || "").toUpperCase() === code.toUpperCase();
    });
    if (!match) {
      setOutAction("Ubicación Buffer de salida no encontrada.", "err");
      return;
    }
    if (match.active === false) {
      setOutAction("La ubicación Buffer de salida no está activa.", "err");
      return;
    }
    if (!sameOutWarehouse(match)) {
      setOutAction(
        "El Buffer de salida debe estar en el mismo almacén que el origen (" + outOriginWarehouse() + ").",
        "err"
      );
      return;
    }
    if (outOriginCode() && outOriginCode() === String(match.code || "").toUpperCase()) {
      setOutAction("Origen y Buffer de salida deben ser distintos.", "err");
      return;
    }
    if (outBufferSelect) {
      for (var i = 0; i < outBufferSelect.options.length; i += 1) {
        if (String(outBufferSelect.options[i].value).toUpperCase() === String(match.code).toUpperCase()) {
          outBufferSelect.selectedIndex = i;
          break;
        }
      }
    }
    if (outBufferScan) outBufferScan.value = match.code;
    setOutAction("Buffer de salida seleccionado: " + match.code + ".", "ok");
    syncOutSubmitEnabled();
    if (outQtyInput) outQtyInput.focus();
  }

  async function loadOutStock() {
    if (!state.outProduct) return;
    hideOutAction();
    state.outOrigin = null;
    state.outStock = [];
    renderOutOriginSummary();
    var response = await apiFetch("/api/inventory/stock");
    var data = await response.json().catch(function () {
      return [];
    });
    if (!response.ok) {
      setOutAction((data && data.message) || "No se pudieron leer existencias.", "err");
      renderOutStockList();
      return;
    }
    var rows = Array.isArray(data) ? data : [];
    var productId = state.outProduct.id;
    var sku = String(state.outProduct.sku || "").toUpperCase();
    state.outStock = rows.filter(function (row) {
      var matchesProduct =
        row.productId === productId || (row.product && String(row.product.sku || "").toUpperCase() === sku);
      return matchesProduct && availableQty(row) > 0;
    });
    renderOutStockList();
    if (!state.outStock.length) {
      setOutAction("Sin existencias disponibles para este producto.", "err");
    } else {
      setOutAction("Selecciona la ubicación origen.", "idle");
    }
  }

  function selectOutProduct(product) {
    if (product && product.serialControlled) {
      state.outProduct = null;
      state.outStock = [];
      state.outOrigin = null;
      clearOutMatches();
      renderOutSelectedProduct();
      renderOutStockList();
      renderOutOriginSummary();
      setOutAction("Producto serializado: usa el flujo especializado de reubicación en el dashboard.", "err");
      return;
    }
    state.outProduct = product;
    state.outOrigin = null;
    clearOutMatches();
    if (outScanInput) outScanInput.value = product.sku || "";
    renderOutSelectedProduct();
    void loadOutStock();
  }

  async function lookupOutCode(rawCode) {
    if (state.outBusy) return;
    var code = String(rawCode || "").trim();
    if (!code) return;
    hideOutAction();
    var response = await apiFetch("/api/catalog/products/search?q=" + encodeURIComponent(code) + "&limit=12");
    var data = await response.json().catch(function () {
      return [];
    });
    if (!response.ok) {
      setOutAction((data && data.message) || "No se pudo buscar el código.", "err");
      return;
    }
    var rows = Array.isArray(data) ? data : [];
    if (!rows.length) {
      clearOutMatches();
      state.outProduct = null;
      state.outStock = [];
      state.outOrigin = null;
      renderOutSelectedProduct();
      renderOutStockList();
      renderOutOriginSummary();
      setOutAction("Código no identificado en catálogo.", "err");
      return;
    }
    var exact = rows.find(function (row) {
      return (
        String(row.sku || "").toUpperCase() === code.toUpperCase() ||
        String(row.barcode || "").toUpperCase() === code.toUpperCase()
      );
    });
    if (exact) {
      selectOutProduct(exact);
      return;
    }
    if (rows.length === 1) {
      selectOutProduct(rows[0]);
      return;
    }
    renderMatches(rows, outProductMatches, selectOutProduct);
    setOutAction("Varias coincidencias. Elige el producto correcto.", "idle");
  }

  function syncOutSubmitEnabled() {
    if (!outSubmitBtn) return;
    var qty = Number(outQtyInput && outQtyInput.value);
    var buffer = outBufferCode();
    var origin = outOriginCode();
    var ok =
      !state.outBusy &&
      state.outOrigin &&
      buffer &&
      origin &&
      origin !== buffer &&
      qty > 0 &&
      Number.isFinite(qty) &&
      qty <= availableQty(state.outOrigin);
    outSubmitBtn.disabled = !ok;
  }

  async function refreshOutAfterSuccess() {
    if (outBufferScan) outBufferScan.value = "";
    if (outBufferSelect) outBufferSelect.selectedIndex = 0;
    if (outQtyInput) outQtyInput.value = "1";
    if (outOrderRefInput) outOrderRefInput.value = "";
    state.outOrigin = null;
    renderOutOriginSummary();
    fillOutBufferSelect();
    if (state.outProduct) {
      await loadOutStock();
    }
    if (outScanInput) outScanInput.focus();
  }

  async function submitOutPrepare() {
    if (state.outBusy || !state.outOrigin || !state.outProduct) return;
    var originRow = state.outOrigin;
    var originCode = outOriginCode();
    var bufferCode = outBufferCode();
    var qty = Number(outQtyInput && outQtyInput.value);
    var available = availableQty(originRow);

    if (!bufferCode) {
      setOutAction("Selecciona o escanea la ubicación Buffer de salida.", "err");
      return;
    }
    if (originCode && originCode === bufferCode.toUpperCase()) {
      setOutAction("Origen y Buffer de salida deben ser distintos.", "err");
      return;
    }
    if (!(qty > 0) || !Number.isFinite(qty)) {
      setOutAction("Indica una cantidad mayor que cero.", "err");
      return;
    }
    if (qty > available) {
      setOutAction("La cantidad no puede superar la disponible (" + available + ").", "err");
      return;
    }
    var bufferMatch = state.locations.find(function (row) {
      return String(row.code || "").toUpperCase() === bufferCode.toUpperCase();
    });
    if (bufferMatch && !sameOutWarehouse(bufferMatch)) {
      setOutAction(
        "El Buffer de salida debe estar en el mismo almacén que el origen (" + outOriginWarehouse() + ").",
        "err"
      );
      return;
    }
    if (bufferMatch && bufferMatch.active === false) {
      setOutAction("La ubicación Buffer de salida no está activa.", "err");
      return;
    }

    state.outBusy = true;
    syncOutSubmitEnabled();
    hideOutAction();
    var clientReference = normalizeClientReference(outOrderRefInput && outOrderRefInput.value);
    try {
      var relocateBody = {
        inventoryId: originRow.id,
        allocationMode: "FIFO",
        destinationLocation: bufferCode,
        quantity: qty,
        notes: OUT_PREP_NOTES
      };
      if (clientReference) relocateBody.reference = clientReference;
      var response = await apiFetch("/api/inventory/relocate", {
        method: "POST",
        body: relocateBody
      });
      var data = await response.json().catch(function () {
        return {};
      });
      if (!response.ok) {
        setOutAction((data && data.message) || "No se pudo confirmar la preparación.", "err");
        return;
      }
      setOutAction(
        "Preparación registrada · " +
          state.outProduct.sku +
          " · " +
          qty +
          " pza · " +
          originCode +
          " → Buffer " +
          bufferCode.toUpperCase() +
          (clientReference ? " · pedido " + clientReference : ""),
        "ok"
      );
      await refreshOutAfterSuccess();
    } catch (_e) {
      setOutAction("Error de red.", "err");
    } finally {
      state.outBusy = false;
      syncOutSubmitEnabled();
    }
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

    var clientReference = normalizeClientReference(orderRefInput && orderRefInput.value);
    var payload = {
      sku: product.sku,
      type: "IN",
      quantity: qty,
      location: locationCode,
      status: "AVAILABLE",
      assignmentType: assignmentType,
      notes: notesInput && notesInput.value.trim() ? notesInput.value.trim() : undefined
    };
    if (clientReference) payload.reference = clientReference;
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
      setAction(
        "Entrada registrada en " + locationCode + (clientReference ? " · pedido " + clientReference : "") + ".",
        "ok"
      );
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
    fillOutBufferSelect();

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
    syncMoveSubmitEnabled();
    syncOutSubmitEnabled();
    if (scanInput) scanInput.focus();
  }

  bindReferenceEnterGuard(orderRefInput);
  bindReferenceEnterGuard(outOrderRefInput);
  if (scanInput) {
    scanInput.addEventListener("keydown", function (event) {
      if (event.key !== "Enter") return;
      event.preventDefault();
      lookupCode(scanInput.value);
    });
  }
  if (moveScanInput) {
    moveScanInput.addEventListener("keydown", function (event) {
      if (event.key !== "Enter") return;
      event.preventDefault();
      lookupMoveCode(moveScanInput.value);
    });
  }
  if (moveDestScan) {
    moveDestScan.addEventListener("keydown", function (event) {
      if (event.key !== "Enter") return;
      event.preventDefault();
      resolveMoveDestFromScan(moveDestScan.value);
    });
  }
  if (outScanInput) {
    outScanInput.addEventListener("keydown", function (event) {
      if (event.key !== "Enter") return;
      event.preventDefault();
      lookupOutCode(outScanInput.value);
    });
  }
  if (outBufferScan) {
    outBufferScan.addEventListener("keydown", function (event) {
      if (event.key !== "Enter") return;
      event.preventDefault();
      resolveOutBufferFromScan(outBufferScan.value);
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
  ["moveQtyInput", "moveDestSelect"].forEach(function (id) {
    var el = document.getElementById(id);
    if (el) el.addEventListener("input", syncMoveSubmitEnabled);
    if (el) el.addEventListener("change", syncMoveSubmitEnabled);
  });
  ["outQtyInput", "outBufferSelect"].forEach(function (id) {
    var el = document.getElementById(id);
    if (el) el.addEventListener("input", syncOutSubmitEnabled);
    if (el) el.addEventListener("change", syncOutSubmitEnabled);
  });
  if (submitBtn) submitBtn.addEventListener("click", submitInbound);
  if (moveSubmitBtn) moveSubmitBtn.addEventListener("click", submitMove);
  if (outSubmitBtn) outSubmitBtn.addEventListener("click", submitOutPrepare);

  bootstrap();
})();
