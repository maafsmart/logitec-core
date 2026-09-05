(function logitecTaskDrivenDemo() {
  "use strict";

  const ROLE_NAV = {
    admin: [
      { id: "dashboard", label: "Inicio" },
      { id: "inventory", label: "Existencias" },
      { id: "movements", label: "Movimientos / Trazabilidad" },
      { section: "Operación" },
      { id: "receptions", label: "Recepciones" },
      { id: "relocations", label: "Reubicaciones" },
      { id: "outbound", label: "Preparaciones de salida" },
      { section: "Gestión" },
      { id: "projects", label: "Proyectos" },
      { id: "products", label: "Productos / catálogos" },
      { id: "prices", label: "Precios" },
      { id: "imports", label: "Importaciones" },
      { id: "users", label: "Usuarios" },
      { section: "Información" },
      { id: "reports", label: "Reportes" },
      { id: "exports", label: "Exportaciones" },
      { id: "config", label: "Configuración" }
    ],
    supervisor: [
      { id: "center", label: "Centro de operación" },
      { id: "tasks", label: "Tareas" },
      { id: "create-task", label: "Crear / preparar tarea" },
      { id: "tracking", label: "Seguimiento" },
      { id: "movements", label: "Movimientos / Trazabilidad" },
      { id: "inventory", label: "Existencias" }
    ],
    operator: [{ id: "tasks", label: "Mis tareas" }]
  };

  const ROLE_DEFAULT_SCREEN = { admin: "dashboard", supervisor: "center", operator: "tasks" };
  const ROLE_TITLES = {
    admin: "Administrador · control completo del WMS",
    supervisor: "Supervisor · centro de operación",
    operator: "Operador · mis tareas"
  };

  const state = {
    role: "operator",
    screen: "tasks",
    dataSource: "NONE",
    summary: null,
    stock: [],
    excelItems: [],
    movements: [],
    locations: [],
    tasks: [],
    blockedWrites: 0,
    activeTaskId: null,
    taskFlow: null,
    inventoryFilter: { q: "", project: "", location: "" },
    excelMeta: null
  };

  const app = document.getElementById("app");
  const sidebar = document.getElementById("sidebar");
  const authHint = document.getElementById("authHint");
  const viewTitle = document.getElementById("viewTitle");
  const writeGuard = document.getElementById("writeGuard");
  const excelSourceBanner = document.getElementById("excelSourceBanner");
  const dataSourceEl = document.getElementById("dataSource");

  function readAccessToken() {
    try {
      return String(localStorage.getItem("token") || "").trim();
    } catch (_error) {
      return "";
    }
  }

  function guardFetch(input, init) {
    const method = String((init && init.method) || "GET").toUpperCase();
    if (method !== "GET") {
      state.blockedWrites += 1;
      writeGuard.textContent = `Escrituras bloqueadas: ${state.blockedWrites}`;
      return Promise.reject(new Error(`Demo read-only: ${method} bloqueado`));
    }
    return fetch(input, init);
  }

  async function apiGet(path, options) {
    const soft = Boolean(options && options.soft);
    const headers = { Accept: "application/json" };
    const t = readAccessToken();
    if (t) headers.Authorization = "Bearer " + t;
    const response = await guardFetch(path, { headers, cache: "no-store", credentials: "same-origin" });
    let payload = null;
    try {
      payload = await response.json();
    } catch (_error) {
      payload = null;
    }
    if (soft) return { ok: response.ok, status: response.status, data: payload };
    if (response.status === 401) throw new Error("Sesión requerida. Inicie sesión en LOGITEC y vuelva a abrir la demo.");
    if (response.status === 404) return null;
    if (!response.ok) {
      if (response.status === 503) return payload;
      throw new Error((payload && payload.message) || `GET ${path} → ${response.status}`);
    }
    return payload;
  }

  function fmtQty(value) {
    if (value == null || value === "") return "—";
    const n = Number(value);
    if (Number.isFinite(n)) return n.toLocaleString("es-MX");
    return String(value);
  }

  function esc(text) {
    return String(text ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/"/g, "&quot;");
  }

  function statusBadge(status) {
    const map = {
      pending: ["Pendiente", "pending"],
      in_progress: ["En proceso", "progress"],
      completed: ["Completada", "done"],
      difference: ["Con diferencia", "review"],
      review: ["Requiere revisión", "review"]
    };
    const hit = map[status] || ["—", "pending"];
    return `<span class="badge ${hit[1]}">${hit[0]}</span>`;
  }

  function dbHasInventory(summary) {
    if (!summary) return false;
    return Number(summary.qty || 0) > 0 || Number(summary.cubes || 0) > 0;
  }

  function excelItemToStock(item) {
    return {
      product: { sku: item.sku, name: item.description || item.sku, barcode: item.barcode || "" },
      location: { code: item.location },
      project: item.project ? { code: item.project, name: item.project } : null,
      qty: item.qty,
      status: item.status,
      pedido: item.pedido,
      partida: item.partida,
      sap: item.sap,
      serialNumber: item.serialNumber,
      lotNumber: item.lotNumber,
      reference: item.reference
    };
  }

  function applyExcelPayload(payload) {
    state.dataSource = "EXCEL";
    state.excelMeta = payload;
    state.excelItems = Array.isArray(payload.items) ? payload.items : [];
    state.stock = state.excelItems.map(excelItemToStock);
    state.locations = [...new Map(state.excelItems.map((item) => [item.location, { code: item.location }])).values()];
    state.movements = [];
    state.summary = {
      qty: String(payload.summary?.pieces ?? 0),
      cubes: payload.summary?.balances ?? 0,
      locations: payload.summary?.locations ?? 0,
      movements: 0,
      products: payload.summary?.products ?? 0,
      projects: payload.summary?.projects ?? 0
    };
    state.tasks = buildDemoTasks();
  }

  function applyDbPayload(summary, movementsPayload, stock, locations) {
    state.dataSource = "DB";
    state.excelMeta = null;
    state.excelItems = [];
    state.summary = summary;
    state.movements = Array.isArray(movementsPayload?.items) ? movementsPayload.items : [];
    state.stock = Array.isArray(stock) ? stock : [];
    state.locations = Array.isArray(locations) ? locations : locations?.items || [];
    state.tasks = buildDemoTasks();
  }

  function buildDemoTasks() {
    const items = state.excelItems.length
      ? state.excelItems
      : state.stock.map((row) => ({
          sku: row.product?.sku,
          description: row.product?.name,
          location: row.location?.code,
          qty: row.qty,
          project: row.project?.code || row.project?.name,
          pedido: row.pedido,
          sap: row.sap
        }));
    const pick = (pred, idx) => items.find(pred) || items[idx] || {};
    const a = pick((i) => i.location && /^AN/i.test(i.location), 0);
    const b = pick((i) => i.location && i.location !== a.location, 1);
    const c = pick((i) => i.location && i.location !== a.location && i.location !== b.location, 2);
    const pedido =
      a.pedido && !/^free to sale$/i.test(String(a.pedido).trim()) ? String(a.pedido).trim() : "45003182";
    const fromLoc = a.location || "AN203";
    const putawayDest = b.location || "AN203";
    const relocateDest = c.location && c.location !== fromLoc ? c.location : "AN105";
    const qtyPutaway = Math.min(Number(b.qty || a.qty || 24) || 24, 24);
    const qtyRelocate = Math.min(Number(c.qty || a.qty || 12) || 12, 12);
    return [
      {
        id: "T001",
        code: "TAREA 001",
        type: "receive",
        typeLabel: "Recibir mercancía",
        reference: pedido,
        project: String(a.project || "AVIAT NETWORKS").trim() || "AVIAT NETWORKS",
        qty: Math.min(Number(a.qty || 1) || 1, 24),
        origin: "Documento / recepción",
        destination: "Buffer de entrada",
        priority: "Alta",
        status: "pending",
        operator: null,
        sku: a.sku || "—",
        sap: a.sap || a.sku,
        description: a.description || "—",
        expectedQty: Number(a.qty || 1) || 1,
        demoFlow: true
      },
      {
        id: "T002",
        code: "TAREA 002",
        type: "putaway",
        typeLabel: "Acomodar mercancía",
        reference: "Post-recepción",
        project: String(b.project || a.project || "AVIAT NETWORKS").trim() || "AVIAT NETWORKS",
        qty: qtyPutaway,
        origin: "Buffer de entrada",
        destination: putawayDest,
        priority: "Normal",
        status: "pending",
        operator: null,
        sku: b.sku || a.sku,
        sap: b.sap || b.sku || a.sap,
        description: b.description || a.description,
        demoFlow: true
      },
      {
        id: "T003",
        code: "TAREA 003",
        type: "relocate",
        typeLabel: "Reubicar mercancía",
        reference: "Reubicación interna",
        project: String(c.project || b.project || "Operaciones").trim() || "Operaciones",
        qty: qtyRelocate,
        origin: fromLoc,
        destination: relocateDest,
        priority: "Normal",
        status: "in_progress",
        operator: "Operador piso",
        sku: c.sku || b.sku || a.sku,
        sap: c.sap || c.sku,
        description: c.description || b.description || a.description,
        demoFlow: true
      },
      {
        id: "T004",
        code: "TAREA 004",
        type: "outbound",
        typeLabel: "Preparar salida",
        reference: "45004567",
        project: String(a.project || "AVIAT NETWORKS").trim() || "AVIAT NETWORKS",
        qty: Math.min(Number(a.qty || 6) || 6, 6),
        origin: fromLoc,
        destination: "Buffer de salida",
        priority: "Alta",
        status: "pending",
        operator: null,
        sku: a.sku,
        sap: a.sap || a.sku,
        description: a.description,
        demoFlow: true
      },
      {
        id: "T005",
        code: "TAREA 005",
        type: "relocate",
        typeLabel: "Reubicar mercancía",
        reference: "Seguimiento demo",
        project: "Operaciones",
        qty: 4,
        origin: putawayDest,
        destination: relocateDest,
        priority: "Baja",
        status: "completed",
        operator: "Operador piso",
        sku: b.sku || a.sku,
        description: b.description || a.description,
        demoFlow: true
      }
    ];
  }

  function updateSourceUi() {
    excelSourceBanner?.classList.toggle("hidden", state.dataSource !== "EXCEL");
    if (dataSourceEl) {
      if (state.dataSource === "EXCEL") dataSourceEl.textContent = "Fuente: Excel oficial · solo lectura";
      else if (state.dataSource === "DB") dataSourceEl.textContent = "Fuente: BD READ-ONLY · misma base LOGITEC";
      else dataSourceEl.textContent = "Fuente: sin datos";
    }
  }

  function kpisHtml() {
    const s = state.summary || {};
    return `<div class="kpi-grid">
      <div class="kpi-card"><p class="kpi-label">Piezas</p><p class="kpi-value">${esc(fmtQty(s.qty))}</p></div>
      <div class="kpi-card"><p class="kpi-label">Registros</p><p class="kpi-value">${esc(fmtQty(s.cubes))}</p></div>
      <div class="kpi-card"><p class="kpi-label">Ubicaciones</p><p class="kpi-value">${esc(fmtQty(s.locations))}</p></div>
      <div class="kpi-card"><p class="kpi-label">Proyectos</p><p class="kpi-value">${esc(fmtQty(s.projects))}</p></div>
    </div>`;
  }

  function topProjectsHtml(limit) {
    const counts = new Map();
    state.stock.forEach((row) => {
      const p = String(row.project?.code || row.project?.name || "Sin proyecto").trim() || "Sin proyecto";
      counts.set(p, (counts.get(p) || 0) + Number(row.qty || 0));
    });
    const rows = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit);
    if (!rows.length) return `<p class="subtle">Sin datos de proyecto.</p>`;
    return `<table class="data-table"><thead><tr><th>Proyecto</th><th>Piezas</th></tr></thead><tbody>${rows
      .map(([p, q]) => `<tr><td>${esc(p)}</td><td>${esc(fmtQty(q))}</td></tr>`)
      .join("")}</tbody></table>`;
  }

  function topLocationsHtml(limit) {
    const counts = new Map();
    state.stock.forEach((row) => {
      const loc = row.location?.code;
      if (!loc) return;
      counts.set(loc, (counts.get(loc) || 0) + Number(row.qty || 0));
    });
    const rows = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit);
    return `<table class="data-table"><thead><tr><th>Ubicación</th><th>Piezas</th></tr></thead><tbody>${rows
      .map(([l, q]) => `<tr><td>${esc(l)}</td><td>${esc(fmtQty(q))}</td></tr>`)
      .join("")}</tbody></table>`;
  }

  function taskCardHtml(task, options) {
    const compact = options && options.compact;
    const showStart = options && options.showStart;
    return `<article class="task-card${showStart ? " operator" : ""}">
      <div class="panel-head">
        <div>
          <div class="task-code">${esc(task.code)} · <span class="tag example">EJEMPLO DE FLUJO</span></div>
          <h3 class="task-title">${esc(task.typeLabel)}</h3>
        </div>
        ${statusBadge(task.status)}
      </div>
      <div class="task-meta">
        <div><strong>Referencia:</strong> ${esc(task.reference)}</div>
        <div><strong>Proyecto:</strong> ${esc(task.project)}</div>
        <div><strong>Cantidad:</strong> ${esc(fmtQty(task.qty))}</div>
        <div><strong>Origen:</strong> ${esc(task.origin)}</div>
        <div><strong>Destino:</strong> ${esc(task.destination)}</div>
        ${task.operator ? `<div><strong>Operador:</strong> ${esc(task.operator)}</div>` : ""}
        ${!compact && task.sku ? `<div><strong>SKU:</strong> ${esc(task.sku)} · ${esc(task.description || "")}</div>` : ""}
      </div>
      ${showStart ? `<div class="task-actions"><button type="button" class="btn primary block" data-start-task="${esc(task.id)}">Iniciar</button></div>` : ""}
    </article>`;
  }

  function inventoryTableHtml(limit) {
    const q = state.inventoryFilter.q.toLowerCase();
    const proj = state.inventoryFilter.project.toLowerCase();
    const loc = state.inventoryFilter.location.toLowerCase();
    const rows = state.stock.filter((row) => {
      const sku = (row.product?.sku || "").toLowerCase();
      const name = (row.product?.name || "").toLowerCase();
      const location = (row.location?.code || "").toLowerCase();
      const project = (row.project?.code || row.project?.name || "").toLowerCase();
      const sap = (row.sap || "").toLowerCase();
      const pedido = (row.pedido || "").toLowerCase();
      return (
        (!q || sku.includes(q) || name.includes(q) || sap.includes(q) || pedido.includes(q)) &&
        (!proj || project.includes(proj)) &&
        (!loc || location.includes(loc))
      );
    });
    const slice = limit ? rows.slice(0, limit) : rows.slice(0, 200);
    return `<div class="filters">
      <input id="invQ" placeholder="Buscar SKU, SAP, pedido, descripción…" value="${esc(state.inventoryFilter.q)}" />
      <input id="invProject" placeholder="Proyecto" value="${esc(state.inventoryFilter.project)}" />
      <input id="invLocation" placeholder="Ubicación" value="${esc(state.inventoryFilter.location)}" />
      <button type="button" class="btn secondary" id="invFilterRun">Filtrar</button>
    </div>
    <div class="panel"><p>${esc(slice.length)} de ${esc(rows.length)} registros · READ-ONLY</p>
      <table class="data-table">
        <thead><tr><th>SKU</th><th>Descripción</th><th>Proyecto</th><th>Ubicación</th><th>Cant.</th><th>SAP</th><th>Pedido</th><th>Partida</th></tr></thead>
        <tbody>${slice
          .map(
            (row) => `<tr>
              <td>${esc(row.product?.sku)}</td>
              <td>${esc(row.product?.name)}</td>
              <td>${esc(row.project?.code || row.project?.name || "—")}</td>
              <td>${esc(row.location?.code)}</td>
              <td>${esc(fmtQty(row.qty))}</td>
              <td>${esc(row.sap || "—")}</td>
              <td>${esc(row.pedido || "—")}</td>
              <td>${esc(row.partida || "—")}</td>
            </tr>`
          )
          .join("")}</tbody>
      </table>
    </div>`;
  }

  function movementsViewHtml() {
    if (state.dataSource === "EXCEL" || !state.movements.length) {
      return `<div class="panel">
        <h2>Movimientos / Trazabilidad</h2>
        <p>Historial de movimientos no disponible en la fuente Excel.</p>
        <p class="demo-note">Ejemplos conceptuales marcados como EJEMPLO DE FLUJO en tareas y seguimiento.</p>
        <table class="data-table">
          <thead><tr><th>Fecha/hora</th><th>Operador</th><th>Proyecto</th><th>Producto</th><th>Tipo</th><th>Origen</th><th>Destino</th><th>Cant.</th><th>Estado</th></tr></thead>
          <tbody>
            <tr><td colspan="9"><span class="tag example">EJEMPLO DE FLUJO</span> Recepción · Pedido 45003182 · Buffer entrada · Completada</td></tr>
            <tr><td colspan="9"><span class="tag example">EJEMPLO DE FLUJO</span> Acomodo · Buffer entrada → AN203 · 24 pzas</td></tr>
          </tbody>
        </table>
      </div>`;
    }
    const rows = state.movements.slice(0, 20);
    return `<div class="panel"><h2>Movimientos / Trazabilidad</h2>
      <table class="data-table">
        <thead><tr><th>Fecha/hora</th><th>Producto</th><th>Tipo</th><th>Origen</th><th>Destino</th><th>Cant.</th></tr></thead>
        <tbody>${rows
          .map((m) => {
            const type = m.movement?.movementType || m.movementType || "MOV";
            return `<tr>
              <td>${esc(new Date(m.createdAt).toLocaleString("es-MX"))}</td>
              <td>${esc(m.product?.sku)}</td>
              <td>${esc(type)}</td>
              <td>${esc(m.fromLocation?.code || "—")}</td>
              <td>${esc(m.toLocation?.code || "—")}</td>
              <td>${esc(fmtQty(m.qty))}</td>
            </tr>`;
          })
          .join("")}</tbody>
      </table></div>`;
  }

  function adminDashboard() {
    const pending = state.tasks.filter((t) => t.status === "pending").length;
    const progress = state.tasks.filter((t) => t.status === "in_progress").length;
    const done = state.tasks.filter((t) => t.status === "completed").length;
    return `${kpisHtml()}
      <div class="grid-2">
        <div class="panel"><h3>Operación <span class="tag example">EJEMPLO DE FLUJO</span></h3>
          <div class="grid-3">
            <div class="kpi-card"><p class="kpi-label">Pendientes</p><p class="kpi-value">${pending}</p></div>
            <div class="kpi-card"><p class="kpi-label">En proceso</p><p class="kpi-value">${progress}</p></div>
            <div class="kpi-card"><p class="kpi-label">Completadas</p><p class="kpi-value">${done}</p></div>
          </div>
        </div>
        <div class="panel"><h3>Principales proyectos</h3>${topProjectsHtml(5)}</div>
      </div>
      <div class="grid-2">
        <div class="panel"><h3>Principales ubicaciones</h3>${topLocationsHtml(6)}</div>
        <div class="panel"><h3>Profundidad WMS</h3>
          <div class="module-grid">
            <div class="module-tile"><strong>Inventario</strong><span>${esc(fmtQty(state.summary?.cubes))} registros</span></div>
            <div class="module-tile"><strong>Movimientos</strong><span>Trazabilidad completa</span></div>
            <div class="module-tile"><strong>Proyectos</strong><span>${esc(fmtQty(state.summary?.projects))}</span></div>
            <div class="module-tile"><strong>Productos</strong><span>${esc(fmtQty(state.summary?.products))}</span></div>
          </div>
        </div>
      </div>`;
  }

  function adminModuleScreen(title, body) {
    return `${kpisHtml()}<div class="panel"><h2>${esc(title)}</h2><p>${body}</p><p class="demo-note">Vista demo READ-ONLY. Profundidad real disponible en el WMS oficial.</p></div>`;
  }

  function supervisorCenter() {
    const pending = state.tasks.filter((t) => t.status !== "completed");
    return `${kpisHtml()}
      <div class="panel">
        <div class="panel-head"><h2>Centro de operación</h2><span class="tag example">EJEMPLO DE FLUJO</span></div>
        <p>El supervisor convierte necesidades operativas en tareas claras para piso.</p>
        <div class="task-list">${pending.map((t) => taskCardHtml(t)).join("")}</div>
      </div>
      <div class="panel"><h3>Buffer de entrada → acomodo → ubicación final</h3>
        <div class="pipeline">
          <div class="pipeline-step done">Recepción</div>
          <div class="pipeline-step active">Buffer entrada</div>
          <div class="pipeline-step">Tarea acomodo</div>
          <div class="pipeline-step">Ubicación final</div>
        </div>
      </div>`;
  }

  function supervisorCreateTask() {
    const sample = state.tasks[0] || {};
    return `<div class="panel">
      <h2>Crear / preparar tarea</h2>
      <p>Simulación visual de orden de trabajo. No escribe en sistema.</p>
      <div class="grid-2">
        <label>Qué mercancía<input value="${esc(sample.sku || "")}" readonly /></label>
        <label>Cantidad<input value="${esc(fmtQty(sample.qty || 1))}" readonly /></label>
        <label>Origen<input value="${esc(sample.origin || "Buffer de entrada")}" readonly /></label>
        <label>Destino<input value="${esc(sample.destination || "AN203")}" readonly /></label>
        <label>Operador<select disabled><option>Asignar en WMS real</option></select></label>
        <label>Prioridad<select disabled><option>${esc(sample.priority || "Normal")}</option></select></label>
      </div>
      <button type="button" class="btn secondary" disabled>Publicar tarea (demo)</button>
      <p class="demo-note">DEMO — no registra tarea ni movimiento.</p>
    </div>`;
  }

  function supervisorTracking() {
    return `<div class="panel"><h2>Seguimiento</h2>
      <table class="data-table">
        <thead><tr><th>Tarea</th><th>Tipo</th><th>Estado</th><th>Operador</th><th>Referencia</th></tr></thead>
        <tbody>${state.tasks
          .map(
            (t) => `<tr>
              <td>${esc(t.code)}</td><td>${esc(t.typeLabel)}</td><td>${statusBadge(t.status)}</td>
              <td>${esc(t.operator || "—")}</td><td>${esc(t.reference)}</td>
            </tr>`
          )
          .join("")}</tbody>
      </table>
      <p class="demo-note"><span class="tag example">EJEMPLO DE FLUJO</span> Estados simulados para demostración.</p>
    </div>`;
  }

  function operatorTasksList() {
    const open = state.tasks.filter((t) => t.status !== "completed");
    return `<div class="panel">
      <h2>Mis tareas</h2>
      <p>LOGITEC dirige. Usted escanea y ejecuta.</p>
      <div class="task-list">${open.map((t) => taskCardHtml(t, { showStart: true, compact: true })).join("")}</div>
    </div>`;
  }

  function operatorTaskFlow(task) {
    const flow = state.taskFlow || { step: 0, log: [] };
    const steps =
      task.type === "receive"
        ? ["Escanee mercancía", "Cotejo documento", "Registrar recibido", "Buffer de entrada"]
        : task.type === "putaway"
          ? ["Escanee mercancía", "Escanee ubicación destino", "Validar acomodo"]
          : task.type === "relocate"
            ? ["Escanee producto", "Escanee origen", "Escanee destino", "Validar movimiento"]
            : ["Escanee mercancía", "Cotejar pedido", "Mover a buffer salida", "Completar"];
    const pipeline = steps
      .map((label, idx) => {
        let cls = "";
        if (idx < flow.step) cls = "done";
        else if (idx === flow.step) cls = "active";
        return `<div class="pipeline-step ${cls}">${esc(label)}</div>`;
      })
      .join("");
    const expectedScan =
      flow.step === 0
        ? task.sku
        : task.type === "putaway" && flow.step === 1
          ? task.destination
          : task.type === "relocate" && flow.step === 1
            ? task.origin
            : task.type === "relocate" && flow.step === 2
              ? task.destination
              : task.sku;
    return `<div class="toolbar"><button type="button" class="btn secondary" data-go="tasks">← Mis tareas</button></div>
      <div class="panel operator-flow">
        <div class="task-code">${esc(task.code)} · ${statusBadge(task.status)}</div>
        <h2>${esc(task.typeLabel)}</h2>
        <p><strong>Pedido/ref:</strong> ${esc(task.reference)} · <strong>Proyecto:</strong> ${esc(task.project)}</p>
        <p><strong>Esperado:</strong> ${esc(fmtQty(task.qty))} pzas · ${esc(task.description || task.sku)}</p>
        <div class="pipeline">${pipeline}</div>
        <div class="scan-panel">
          <h3>${esc(steps[flow.step] || "Completar")}</h3>
          <input class="scan-input" id="scanValue" placeholder="Simular escaneo handheld" />
          <div class="task-actions">
            <button type="button" class="btn primary" id="scanSimulate">Simular escaneo</button>
            <button type="button" class="btn secondary" id="scanValidate">Validar</button>
          </div>
          <div id="scanFeedback"></div>
        </div>
        <div id="flowResult"></div>
        <p class="demo-note">DEMO — no registra movimiento · ${esc(expectedScan ? "Esperado: " + expectedScan : "")}</p>
      </div>`;
  }

  function renderSidebar() {
    if (!sidebar) return;
    const nav = ROLE_NAV[state.role] || [];
    sidebar.innerHTML = `<div class="sidebar-brand"><strong>LOGITEC WMS</strong><span>Demo task-driven</span></div>${nav
      .map((item) => {
        if (item.section) return `<div class="nav-section">${esc(item.section)}</div>`;
        const active = item.id === state.screen ? " active" : "";
        return `<button type="button" class="nav-btn${active}" data-nav="${esc(item.id)}">${esc(item.label)}</button>`;
      })
      .join("")}`;
    sidebar.querySelectorAll("[data-nav]").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.screen = btn.getAttribute("data-nav") || ROLE_DEFAULT_SCREEN[state.role];
        state.activeTaskId = null;
        state.taskFlow = null;
        render();
      });
    });
  }

  function renderContent() {
    if (!app) return;
    if (viewTitle) viewTitle.textContent = ROLE_TITLES[state.role] || "Demo operativa";
    let html = "";
    if (state.role === "operator") {
      if (state.activeTaskId) {
        const task = state.tasks.find((t) => t.id === state.activeTaskId);
        html = task ? operatorTaskFlow(task) : operatorTasksList();
      } else {
        html = operatorTasksList();
      }
    } else if (state.role === "supervisor") {
      if (state.screen === "center") html = supervisorCenter();
      else if (state.screen === "tasks") html = `<div class="panel"><h2>Tareas</h2><div class="task-list">${state.tasks.map((t) => taskCardHtml(t)).join("")}</div></div>`;
      else if (state.screen === "create-task") html = supervisorCreateTask();
      else if (state.screen === "tracking") html = supervisorTracking();
      else if (state.screen === "movements") html = movementsViewHtml();
      else if (state.screen === "inventory") html = inventoryTableHtml(150);
      else html = supervisorCenter();
    } else {
      if (state.screen === "dashboard") html = adminDashboard();
      else if (state.screen === "inventory") html = inventoryTableHtml(null);
      else if (state.screen === "movements") html = movementsViewHtml();
      else if (state.screen === "receptions")
        html = adminModuleScreen("Recepciones", "Recepción documentada → Buffer de entrada → tareas de acomodo.");
      else if (state.screen === "relocations")
        html = adminModuleScreen("Reubicaciones", "Movimientos internos con trazabilidad origen/destino.");
      else if (state.screen === "outbound")
        html = adminModuleScreen("Preparaciones de salida", "Órdenes preparadas por supervisor → operador → buffer salida.");
      else if (state.screen === "projects")
        html = `${kpisHtml()}<div class="panel"><h2>Proyectos</h2>${topProjectsHtml(20)}</div>`;
      else if (state.screen === "products")
        html = adminModuleScreen("Productos / catálogos", `${fmtQty(state.summary?.products)} identificadores en fuente demo.`);
      else if (state.screen === "prices") html = adminModuleScreen("Precios", "Capas y valuación disponibles en WMS real.");
      else if (state.screen === "imports") html = adminModuleScreen("Importaciones", "Importador oficial LOGITEC — deshabilitado en demo.");
      else if (state.screen === "users") html = adminModuleScreen("Usuarios", "Roles ADMIN / SUPERVISOR / OPERADOR / CLIENT.");
      else if (state.screen === "reports") html = adminModuleScreen("Reportes", "KPIs operativos e inventario.");
      else if (state.screen === "exports") html = adminModuleScreen("Exportaciones", "Export Excel/CSV del WMS real.");
      else if (state.screen === "config") html = adminModuleScreen("Configuración", "Reglas operativas, estados, buffers y permisos.");
      else html = adminDashboard();
    }
    app.innerHTML = html;
    wireContent();
  }

  function render() {
    renderSidebar();
    renderContent();
  }

  function wireInventoryFilters() {
    const run = () => {
      state.inventoryFilter.q = document.getElementById("invQ")?.value?.trim() || "";
      state.inventoryFilter.project = document.getElementById("invProject")?.value?.trim() || "";
      state.inventoryFilter.location = document.getElementById("invLocation")?.value?.trim() || "";
      renderContent();
    };
    document.getElementById("invFilterRun")?.addEventListener("click", run);
  }

  function wireOperatorFlow(task) {
    const flow = state.taskFlow || { step: 0, log: [] };
    const stepsCount =
      task.type === "receive" ? 4 : task.type === "putaway" ? 3 : task.type === "relocate" ? 4 : 4;
    const expectedForStep = () => {
      if (flow.step === 0) return String(task.sku || "").toUpperCase();
      if (task.type === "putaway" && flow.step === 1) return String(task.destination || "").toUpperCase();
      if (task.type === "relocate" && flow.step === 1) return String(task.origin || "").toUpperCase();
      if (task.type === "relocate" && flow.step === 2) return String(task.destination || "").toUpperCase();
      if (task.type === "receive" && flow.step === 1) return String(task.sku || "").toUpperCase();
      if (task.type === "outbound" && flow.step === 1) return String(task.sku || "").toUpperCase();
      return String(task.sku || "").toUpperCase();
    };
    const feedback = document.getElementById("scanFeedback");
    const result = document.getElementById("flowResult");
    const advance = (ok, message) => {
      if (!ok) {
        feedback.innerHTML = `<div class="scan-feedback warn">⚠ ${esc(message)} · solicitar supervisor</div>`;
        return;
      }
      feedback.innerHTML = `<div class="scan-feedback ok">✓ ${esc(message)}</div>`;
      flow.step += 1;
      state.taskFlow = flow;
      if (flow.step >= stepsCount) {
        result.innerHTML = `<div class="result-box">
          <strong>Tarea completada (demo)</strong><br>
          ${esc(task.typeLabel)} · ${esc(task.reference)}<br>
          Destino operativo: <strong>${esc(task.destination)}</strong><br>
          <span class="demo-note">DEMO — no registra movimiento · LOGITEC registraría trazabilidad en WMS real</span>
          <div class="task-actions"><button type="button" class="btn success block" data-go="tasks">Volver a mis tareas</button></div>
        </div>`;
        return;
      }
      setTimeout(() => renderContent(), 500);
    };
    document.getElementById("scanSimulate")?.addEventListener("click", () => {
      const input = document.getElementById("scanValue");
      if (input) input.value = expectedForStep();
    });
    document.getElementById("scanValidate")?.addEventListener("click", () => {
      const val = String(document.getElementById("scanValue")?.value || "")
        .trim()
        .toUpperCase();
      const expected = expectedForStep();
      if (!val) {
        advance(false, "Sin lectura de código");
        return;
      }
      if (val !== expected && !val.includes(expected.slice(0, 8))) {
        advance(false, "Diferencia detectada");
        return;
      }
      if (task.type === "receive" && flow.step === 1) advance(true, "Coincide con documento");
      else if (task.type === "receive" && flow.step === 2) advance(true, "Registrado como recibido (demo)");
      else if (task.type === "putaway" && flow.step === 1) advance(true, "Ubicación validada");
      else if (task.type === "relocate" && flow.step === 2) advance(true, "Destino validado");
      else advance(true, "Correcto");
    });
  }

  function wireContent() {
    app.querySelectorAll("[data-go]").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.activeTaskId = null;
        state.taskFlow = null;
        state.screen = btn.getAttribute("data-go") || ROLE_DEFAULT_SCREEN[state.role];
        render();
      });
    });
    app.querySelectorAll("[data-start-task]").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.activeTaskId = btn.getAttribute("data-start-task");
        state.taskFlow = { step: 0, log: [] };
        renderContent();
      });
    });
    wireInventoryFilters();
    if (state.activeTaskId) {
      const task = state.tasks.find((t) => t.id === state.activeTaskId);
      if (task) wireOperatorFlow(task);
    }
  }

  document.querySelectorAll(".role-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".role-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      state.role = btn.getAttribute("data-role") || "operator";
      state.screen = ROLE_DEFAULT_SCREEN[state.role] || "tasks";
      state.activeTaskId = null;
      state.taskFlow = null;
      render();
    });
  });

  async function loadDbSource() {
    const summaryResult = await apiGet("/api/inventory/summary", { soft: true });
    if (!summaryResult.ok || !summaryResult.data) return false;
    if (!dbHasInventory(summaryResult.data)) return false;
    const [movementsResult, stockResult, locationsResult] = await Promise.all([
      apiGet("/api/inventory/movements?limit=10", { soft: true }),
      apiGet("/api/inventory/stock", { soft: true }),
      apiGet("/api/inventory/locations?limit=50", { soft: true })
    ]);
    applyDbPayload(
      summaryResult.data,
      movementsResult.ok ? movementsResult.data || {} : {},
      stockResult.ok && Array.isArray(stockResult.data) ? stockResult.data : [],
      locationsResult.ok ? locationsResult.data || [] : []
    );
    authHint.textContent = `BD READ-ONLY · ${fmtQty(summaryResult.data.qty)} piezas`;
    return true;
  }

  async function loadExcelSource() {
    const excelResult = await apiGet("/api/demo/inventory-from-excel", { soft: true });
    if (excelResult.status === 401) throw new Error("Sesión requerida. Inicie sesión en LOGITEC y vuelva a abrir la demo.");
    const payload = excelResult.data || {};
    if (excelResult.ok && payload.source === "EXCEL_READ_ONLY" && payload.available !== false) {
      applyExcelPayload(payload);
      authHint.textContent = `Fuente demo: Excel oficial · solo lectura · ${fmtQty(payload.summary?.pieces)} piezas · ${fmtQty(payload.summary?.locations)} ubicaciones`;
      return true;
    }
    throw new Error(`No se pudo cargar la fuente Excel. ${payload.message || excelResult.status || "error"}`);
  }

  async function boot() {
    try {
      if (!readAccessToken()) {
        authHint.textContent = "Sesión requerida. Inicie sesión para cargar la demo.";
        updateSourceUi();
        app.innerHTML = `<div class="panel"><h2>Iniciar sesión</h2><p><a href="/login.html?next=${encodeURIComponent("/logitec-simple-demo.html")}">login.html</a> · mismo host (localhost o LAN)</p></div>`;
        renderSidebar();
        return;
      }
      if (!(await loadDbSource())) await loadExcelSource();
      updateSourceUi();
      render();
    } catch (error) {
      authHint.textContent = error.message || "Error al cargar demo.";
      updateSourceUi();
      app.innerHTML = `<div class="panel"><h2>No se pudo cargar la demo</h2><p>${esc(error.message)}</p></div>`;
      renderSidebar();
    }
  }

  window.fetch = new Proxy(fetch, {
    apply(target, thisArg, args) {
      const init = args[1] || {};
      const method = String(init.method || "GET").toUpperCase();
      const url = String(args[0] || "");
      if (url.includes("/api/") && method !== "GET") {
        state.blockedWrites += 1;
        writeGuard.textContent = `Escrituras bloqueadas: ${state.blockedWrites}`;
        return Promise.reject(new Error("Demo read-only"));
      }
      return Reflect.apply(target, thisArg, args);
    }
  });

  boot();
})();
