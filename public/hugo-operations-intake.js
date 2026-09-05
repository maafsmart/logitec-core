(function initHugoOperationsIntake() {
  "use strict";

  const SESSION_KEY = "logitec:hugo-operations:sessionId";
  const RESPONDENT_OPTIONS = [
    "Hugo",
    "Ricardo",
    "Alejandro",
    "Representante AVIAT / Implant",
    "Varias personas",
    "Otro"
  ];
  const UNKNOWN_FLAGS = [
    "No lo sabemos todavía",
    "Prefiero definirlo después",
    "Esta pregunta requiere explicación adicional",
    "Prefiero no contestar por este medio",
    "Prefiero comentarlo personalmente",
    "No considero que esta información sea necesaria",
    "Pendiente por definir"
  ];
  const LABEL_FIELD_CHECKS = [
    "Pedido",
    "Partida",
    "SAP",
    "Cantidad",
    "SKU",
    "Descripción",
    "Otro"
  ];
  const LABEL_PRESENTATION_OPTIONS = [
    "Código de barras",
    "Texto",
    "Ambos",
    "No sabemos todavía"
  ];
  const LABEL_LOGITEC_ACTIONS = [
    "Leer automáticamente",
    "Validar",
    "Mostrar",
    "Capturar manualmente",
    "Ignorar",
    "Todavía no definido"
  ];

  const FETCH_TIMEOUT_MS = 20000;
  const SESSION_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  const byId = (id) => document.getElementById(id);
  let bootstrap = null;
  let session = null;
  let bootComplete = false;
  let sectionIndex = 0;
  let pendingAttachments = [];
  let sectionNavHintTimer = null;
  let buttonResetTimers = {};

  const ACTION_BUTTONS = {
    pending: { id: "pendingBtn", idle: "Dejar pendiente", working: "Marcando pendiente…", success: "✓ Pendiente" },
    confirm: {
      id: "confirmBtn",
      idle: "✓ Confirmar correcto y continuar",
      working: "Confirmando…",
      success: "✓ Confirmado"
    }
  };

  function bootLog(step, detail) {
    const payload = detail && typeof detail === "object" ? detail : { detail };
    console.info("[hugo-intake]", step, payload);
  }

  async function api(path, options = {}) {
    const method = options.method || "GET";
    const headers = { Accept: "application/json", ...(options.headers || {}) };
    let body;
    if (options.body !== undefined) {
      headers["Content-Type"] = "application/json";
      body = JSON.stringify(options.body);
    } else if (method === "POST" || method === "PUT" || method === "PATCH") {
      headers["Content-Type"] = "application/json";
      body = "{}";
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    const started = Date.now();
    try {
      bootLog("api-start", { path, method });
      const response = await fetch(path, {
        method,
        headers,
        body,
        cache: "no-store",
        signal: controller.signal
      });
      const data = await response.json().catch(() => ({}));
      bootLog("api-done", { path, method, status: response.status, ms: Date.now() - started });
      if (!response.ok) {
        throw new Error(data.message || `Error HTTP ${response.status} en ${path}`);
      }
      return data;
    } catch (error) {
      bootLog("api-fail", {
        path,
        method,
        ms: Date.now() - started,
        message: error instanceof Error ? error.message : String(error)
      });
      if (error && error.name === "AbortError") {
        throw new Error(`Tiempo de espera agotado (${path}). Verifique red Wi‑Fi y que el servidor siga activo.`);
      }
      if (error instanceof Error) throw error;
      throw new Error(`Fallo de red al contactar ${path}`);
    } finally {
      clearTimeout(timer);
    }
  }

  function setBootMessage(text) {
    const gateMessage = byId("gateMessage");
    if (gateMessage) gateMessage.textContent = text;
    const gateActions = byId("gateActions");
    if (gateActions) {
      gateActions.hidden = true;
      gateActions.classList.add("hidden");
    }
  }

  function showBootError(step, error) {
    const gatePanel = byId("gatePanel");
    const gateMessage = byId("gateMessage");
    const gateActions = byId("gateActions");
    if (gatePanel) {
      gatePanel.hidden = false;
      gatePanel.classList.remove("hidden");
    }
    if (gateMessage) {
      gateMessage.textContent = `No se pudo ${step}: ${error?.message || "error desconocido"}`;
    }
    if (gateActions) {
      gateActions.hidden = false;
      gateActions.classList.remove("hidden");
    }
    const sessionMeta = byId("sessionMeta");
    if (sessionMeta) sessionMeta.textContent = "Sesión no iniciada";
    bootLog("boot-error", { step, message: error?.message || "unknown" });
  }

  function sections() {
    return bootstrap?.sections || [];
  }

  function currentSection() {
    return sections()[sectionIndex] || null;
  }

  function readSessionId() {
    try {
      return localStorage.getItem(SESSION_KEY) || "";
    } catch (_err) {
      return "";
    }
  }

  function clearStoredSessionId() {
    writeSessionId("");
    session = null;
  }

  function isValidSessionId(value) {
    return Boolean(value && SESSION_ID_PATTERN.test(value));
  }

  async function loadBootstrap() {
    const started = Date.now();
    setBootMessage("Cargando definiciones del formulario…");
    bootstrap = await api("/api/operations-intake/bootstrap");
    bootLog("bootstrap-ok", {
      ms: Date.now() - started,
      sections: bootstrap?.sections?.length || 0,
      projects: bootstrap?.projects?.length || 0
    });
  }

  async function loadOrCreateSession() {
    const started = Date.now();
    setBootMessage("Preparando sesión…");
    const storedId = readSessionId();
    bootLog("session-localStorage", { storedId: storedId || null, valid: isValidSessionId(storedId) });

    if (isValidSessionId(storedId)) {
      try {
        const loaded = await api(`/api/operations-intake/sessions/${storedId}`);
        if (loaded?.session?.sessionId) {
          session = loaded.session;
          bootLog("session-loaded", { sessionId: session.sessionId, ms: Date.now() - started });
          return;
        }
        bootLog("session-get-empty-payload", { storedId });
      } catch (error) {
        bootLog("session-get-failed", {
          storedId,
          message: error instanceof Error ? error.message : String(error)
        });
      }
      clearStoredSessionId();
    } else if (storedId) {
      bootLog("session-invalid-id-cleared", { storedId });
      clearStoredSessionId();
    }

    setBootMessage("Creando sesión nueva…");
    const created = await api("/api/operations-intake/sessions", { method: "POST" });
    if (!created?.session?.sessionId) {
      throw new Error("El servidor no devolvió una sesión válida.");
    }
    session = created.session;
    writeSessionId(session.sessionId);
    bootLog("session-created", { sessionId: session.sessionId, ms: Date.now() - started });
  }

  function revealForm() {
    const gatePanel = byId("gatePanel");
    const formPanel = byId("formPanel");
    if (gatePanel) {
      gatePanel.classList.add("hidden");
      gatePanel.hidden = true;
    }
    if (formPanel) {
      formPanel.classList.remove("hidden");
      formPanel.hidden = false;
    }
    const sessionMeta = byId("sessionMeta");
    if (sessionMeta) sessionMeta.textContent = `Sesión ${session.sessionId}`;
    const renderStarted = Date.now();
    renderSection({ scroll: true, instantScroll: true, announce: true });
    bootLog("render-section-1", {
      title: currentSection()?.title || null,
      ms: Date.now() - renderStarted
    });
  }

  async function boot(options = {}) {
    if (options.clearSessionId) {
      clearStoredSessionId();
    }
    bootComplete = false;
    bootstrap = null;
    if (options.clearSessionId) {
      session = null;
    }
    setBootMessage("Cargando definiciones del formulario…");
    try {
      if (!bootstrap) {
        await loadBootstrap();
      }
      await loadOrCreateSession();
      if (!session?.sessionId) {
        throw new Error("No se pudo asignar la sesión del formulario.");
      }
      revealForm();
      bootComplete = true;
      bootLog("boot-complete", { sessionId: session.sessionId });
    } catch (error) {
      showBootError("iniciar el formulario", error);
    }
  }

  async function startNewSessionAndBoot() {
    clearStoredSessionId();
    bootstrap = null;
    await boot({ clearSessionId: true });
  }

  function writeSessionId(value) {
    try {
      if (value) localStorage.setItem(SESSION_KEY, value);
      else localStorage.removeItem(SESSION_KEY);
    } catch (_err) {
      /* ignore */
    }
  }

  function setMessage(text, tone = "") {
    const node = byId("actionMessage");
    node.textContent = text;
    node.className = `action-message${tone ? ` ${tone}` : ""}`;
  }

  function statusLabel(status, hasRecord = false) {
    if (status === "confirmed") return "✓ CONFIRMADO";
    if (status === "pending") return "✓ PENDIENTE";
    if (hasRecord) return "GUARDADO";
    return "BORRADOR";
  }

  function visibleFields(section, record) {
    const answers = { ...(record?.answers || {}) };
    return section.fields.filter((field) => fieldVisible(field, answers));
  }

  function questionCode(questionIndex) {
    return `${sectionIndex + 1}.${questionIndex}`;
  }

  function scrollToSectionHead(behavior = "smooth") {
    const head = byId("sectionHead");
    if (!head) return;
    const top = Math.max(0, head.getBoundingClientRect().top + window.scrollY - 10);
    window.scrollTo({ top, behavior });
    head.focus({ preventScroll: true });
  }

  function showSectionNavHint() {
    const hint = byId("sectionNavHint");
    const section = currentSection();
    if (!hint || !section) return;
    const shortTitle = section.title.replace(/^Sección\s+\d+\s+—\s+/i, "");
    hint.textContent = `Sección ${sectionIndex + 1} de ${sections().length} · ${shortTitle}`;
    hint.hidden = false;
    hint.classList.remove("hidden");
    if (sectionNavHintTimer) clearTimeout(sectionNavHintTimer);
    sectionNavHintTimer = setTimeout(() => {
      hint.hidden = true;
      hint.classList.add("hidden");
    }, 2600);
  }

  function setButtonState(action, state) {
    const cfg = ACTION_BUTTONS[action];
    const btn = cfg ? byId(cfg.id) : null;
    if (!btn || !cfg) return;
    btn.disabled = state === "working";
    btn.classList.toggle("btn-working", state === "working");
    btn.classList.toggle("btn-success", state === "success");
    if (state === "working") btn.textContent = cfg.working;
    else if (state === "success") btn.textContent = cfg.success;
    else btn.textContent = cfg.idle;
    if (buttonResetTimers[action]) clearTimeout(buttonResetTimers[action]);
    if (state === "success") {
      buttonResetTimers[action] = setTimeout(() => setButtonState(action, "idle"), 3200);
    }
  }

  function resetActionButtons() {
    Object.keys(ACTION_BUTTONS).forEach((action) => setButtonState(action, "idle"));
  }

  function updateSectionStatusBadge() {
    const section = currentSection();
    if (!section) return;
    const record = session?.sections?.[section.id] || null;
    const badge = byId("sectionStatus");
    if (!badge) return;
    const status = record?.status || "draft";
    badge.textContent = statusLabel(status, Boolean(record));
    badge.className = `status-badge ${status}`;
  }

  function fieldHasExtras(record, fieldId) {
    const flags = record?.flags?.[fieldId] || [];
    const comment = record?.comments?.[fieldId] || "";
    return flags.length > 0 || Boolean(String(comment).trim());
  }

  function snapshotSectionState(section, record) {
    return JSON.stringify({
      answers: record?.answers || {},
      comments: record?.comments || {},
      flags: record?.flags || {},
      respondents: record?.respondents || {}
    });
  }

  function hasUnsavedChanges() {
    const section = currentSection();
    if (!section) return false;
    if (pendingAttachments.length) return true;
    const record = session?.sections?.[section.id] || null;
    const live = collectAnswers(section);
    const liveRespondents = collectRespondents();
    const liveSnapshot = JSON.stringify({
      answers: live.answers,
      comments: live.comments,
      flags: live.flags,
      respondents: liveRespondents
    });
    return liveSnapshot !== snapshotSectionState(section, record);
  }

  function renderProgress() {
    const host = byId("progressShell");
    host.innerHTML = sections()
      .map((section, index) => {
        const record = session?.sections?.[section.id];
        const status = record?.status || "draft";
        return `<span class="progress-dot ${status}" title="${section.title}" data-index="${index}"></span>`;
      })
      .join("");
    host.querySelectorAll(".progress-dot").forEach((dot) => {
      dot.addEventListener("click", () => {
        void goToSection(Number(dot.dataset.index || 0));
      });
    });
  }

  async function goToSection(newIndex) {
    if (newIndex < 0 || newIndex >= sections().length) return;
    if (newIndex === sectionIndex) {
      scrollToSectionHead();
      return;
    }
    if (hasUnsavedChanges()) {
      const ok = await persistSection("save", { skipRender: true, silent: true });
      if (!ok) return;
    }
    sectionIndex = newIndex;
    renderSection({ scroll: true, announce: true });
  }

  async function confirmAndContinue() {
    const ok = await persistSection("confirm", { skipRender: true });
    if (!ok) return;
    setMessage("✓ Sección confirmada", "ok");
    advanceToNextSection();
  }

  async function pendingAndContinue() {
    const ok = await persistSection("pending", { skipRender: true });
    if (!ok) return;
    setMessage("✓ Sección pendiente", "ok");
    advanceToNextSection();
  }

  function advanceToNextSection() {
    sectionIndex = Math.min(sectionIndex + 1, sections().length);
    if (sectionIndex >= sections().length) {
      renderSummary();
      return;
    }
    renderSection({ scroll: true, announce: true });
  }

  function renderRespondentBlock(record) {
    const choices = byId("respondentChoices");
    const extra = byId("respondentExtra");
    const respondents = record?.respondents || {};
    choices.innerHTML = RESPONDENT_OPTIONS.map(
      (option) =>
        `<button type="button" class="choice-btn${respondents.primary === option ? " selected" : ""}" data-respondent="${option}">${option}</button>`
    ).join("");
    choices.querySelectorAll(".choice-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        choices.querySelectorAll(".choice-btn").forEach((el) => el.classList.remove("selected"));
        btn.classList.add("selected");
        renderRespondentExtra(btn.dataset.respondent || "");
      });
    });
    renderRespondentExtra(respondents.primary || "");
    function setExtraValue(id, value) {
      const input = extra.querySelector(`#${id}`);
      if (input) input.value = value || "";
    }
    setExtraValue("respAlejandro", respondents.alejandroFullName);
    setExtraValue("respAviatNames", respondents.aviatRepNames);
    setExtraValue("respAviatCount", respondents.aviatRepCount);
    setExtraValue("respAviatRole", respondents.aviatOfficialRole);
    setExtraValue("respMultiple", respondents.multipleNames);
    setExtraValue("respOther", respondents.otherName);
  }

  function renderRespondentExtra(primary) {
    const extra = byId("respondentExtra");
    const blocks = [];
    if (primary === "Alejandro" || primary === "Varias personas") {
      blocks.push('<label>Nombre completo Alejandro<input id="respAlejandro" type="text" maxlength="160" /></label>');
    }
    if (primary === "Representante AVIAT / Implant" || primary === "Varias personas") {
      blocks.push(
        '<label>Nombre(s) representante<input id="respAviatNames" type="text" maxlength="240" /></label>',
        '<label>Cantidad de representantes<input id="respAviatCount" type="text" maxlength="40" /></label>',
        '<label>Nombre oficial del rol<input id="respAviatRole" type="text" maxlength="160" /></label>'
      );
    }
    if (primary === "Varias personas") {
      blocks.push('<label>Personas que responden<input id="respMultiple" type="text" maxlength="240" /></label>');
    }
    if (primary === "Otro") {
      blocks.push('<label>Quién responde<input id="respOther" type="text" maxlength="160" /></label>');
    }
    extra.innerHTML = blocks.join("");
    extra.hidden = blocks.length === 0;
    extra.classList.toggle("hidden", blocks.length === 0);
  }

  function collectRespondents() {
    const selected = byId("respondentChoices").querySelector(".choice-btn.selected");
    const primary = selected?.dataset.respondent || "";
    return {
      primary,
      alejandroFullName: byId("respAlejandro")?.value?.trim() || "",
      aviatRepNames: byId("respAviatNames")?.value?.trim() || "",
      aviatRepCount: byId("respAviatCount")?.value?.trim() || "",
      aviatOfficialRole: byId("respAviatRole")?.value?.trim() || "",
      multipleNames: byId("respMultiple")?.value?.trim() || "",
      otherName: byId("respOther")?.value?.trim() || ""
    };
  }

  function fieldVisible(field, answers) {
    if (!field.showIf) return true;
    const current = answers[field.showIf.fieldId];
    const expected = field.showIf.equals;
    if (Array.isArray(current)) {
      if (Array.isArray(expected)) return expected.some((item) => current.includes(item));
      return current.includes(expected);
    }
    if (Array.isArray(expected)) return expected.includes(current);
    return current === expected;
  }

  function renderProjectSelect(field, record) {
    const selected = new Set(Array.isArray(record?.answers?.[field.id]) ? record.answers[field.id] : []);
    const projects = bootstrap?.projects || [];
    if (!projects.length) {
      return '<p class="hint">No hay proyectos AVIAT disponibles en este entorno.</p>';
    }
    return `<div class="project-select-grid">${projects
      .map(
        (project) =>
          `<label class="label-check project-select-item"><input type="checkbox" data-project-select="${field.id}" data-project-code="${project.code}" ${selected.has(project.code) ? "checked" : ""} /> ${project.code} · ${project.name}</label>`
      )
      .join("")}</div>`;
  }

  function renderProjectAnswerGrid(field, record) {
    const sourceId = field.projectSourceFieldId;
    const selectedCodes = Array.isArray(record?.answers?.[sourceId]) ? record.answers[sourceId] : [];
    const grid = record?.answers?.[field.id] || {};
    const options = field.projectAnswerOptions || [];
    const projects = bootstrap?.projects || [];
    if (!selectedCodes.length) {
      return '<p class="hint">Seleccione uno o más proyectos arriba para responder por cliente.</p>';
    }
    return selectedCodes
      .map((code) => {
        const project = projects.find((item) => item.code === code);
        const current = grid[code] || "";
        return `<article class="project-mini-card" data-project-answer-block="${field.id}" data-project-code="${code}">
          <h4>${code} · ${project?.name || code}</h4>
          <div class="option-grid">${options
            .map(
              (option) =>
                `<button type="button" class="option-btn${current === option ? " selected" : ""}" data-project-answer-field="${field.id}" data-project-code="${code}" data-value="${option}">${option}</button>`
            )
            .join("")}</div>
        </article>`;
      })
      .join("");
  }

  function wireProjectSelectInteractions(host, section, record) {
    host.querySelectorAll("[data-project-select]").forEach((checkbox) => {
      checkbox.addEventListener("change", () => {
        refreshConditionalFields(section, record);
      });
    });
    host.querySelectorAll("[data-project-answer-field]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const fieldId = btn.dataset.projectAnswerField;
        const code = btn.dataset.projectCode;
        host
          .querySelectorAll(`.option-btn[data-project-answer-field="${fieldId}"][data-project-code="${code}"]`)
          .forEach((el) => el.classList.remove("selected"));
        btn.classList.add("selected");
      });
    });
  }

  function renderFlags(fieldId, record) {
    const active = new Set(record?.flags?.[fieldId] || []);
    return `<div class="flag-row">${UNKNOWN_FLAGS.map(
      (flag) =>
        `<button type="button" class="flag-btn${active.has(flag) ? " active" : ""}" data-field="${fieldId}" data-flag="${flag}">${flag}</button>`
    ).join("")}</div>`;
  }

  function renderFieldExtras(field, record) {
    const fieldId = field.id;
    const open = fieldHasExtras(record, fieldId);
    const flags = field.optionalFlags ? renderFlags(fieldId, record) : "";
    const indicator = open ? '<span class="extras-indicator" aria-hidden="true">●</span>' : "";
    return `<div class="field-extras${open ? " open" : ""}" data-extras-for="${fieldId}">
      <button type="button" class="extras-toggle${open ? " open" : ""}" data-extras-toggle="${fieldId}">
        ${open ? "Opciones adicionales ▴" : "+ Otra situación / comentario"}${indicator}
      </button>
      <div class="extras-panel${open ? "" : " hidden"}"${open ? "" : " hidden"}>
        ${flags}
        <label>Comentario corto
          <input id="comment-${fieldId}" type="text" maxlength="500" value="${record?.comments?.[fieldId] || ""}" />
        </label>
      </div>
    </div>`;
  }

  function wireFieldExtras(host) {
    host.querySelectorAll("[data-extras-toggle]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const wrap = btn.closest(".field-extras");
        const panel = wrap?.querySelector(".extras-panel");
        if (!wrap || !panel) return;
        const open = !wrap.classList.contains("open");
        wrap.classList.toggle("open", open);
        panel.classList.toggle("hidden", !open);
        panel.hidden = !open;
        btn.classList.toggle("open", open);
        btn.innerHTML = open
          ? 'Opciones adicionales ▴ <span class="extras-indicator" aria-hidden="true">●</span>'
          : "+ Otra situación / comentario";
      });
    });
  }

  function renderLabelFieldMatrix(label, card) {
    const details = card.fieldDetails?.[label] || {};
    const checked = (card.labelFields || []).includes(label);
    return `<div class="label-field-matrix${checked ? "" : " hidden"}" data-label-matrix="${label}"${checked ? "" : " hidden"}>
      <p class="matrix-title">${label}</p>
      <p class="matrix-sub">A. ¿Cómo aparece este dato?</p>
      <div class="matrix-grid">${LABEL_PRESENTATION_OPTIONS.map(
        (option) =>
          `<button type="button" class="matrix-btn${details.presentation === option ? " selected" : ""}" data-label="${label}" data-matrix="presentation" data-value="${option}">${option}</button>`
      ).join("")}</div>
      <p class="matrix-sub">B. ¿Qué debe hacer LOGITEC?</p>
      <div class="matrix-grid">${LABEL_LOGITEC_ACTIONS.map(
        (option) =>
          `<button type="button" class="matrix-btn${details.logitecAction === option ? " selected" : ""}" data-label="${label}" data-matrix="logitecAction" data-value="${option}">${option}</button>`
      ).join("")}</div>
    </div>`;
  }

  function renderProjectCards(projects, record) {
    const answers = record?.answers?.projectCards || {};
    return projects
      .map((project) => {
        const key = project.code;
        const card = answers[key] || {};
        const checks = (name) => (card.labelFields || []).includes(name) ? "checked" : "";
        const showCombo = card.primaryIdentifier === "Combinación de campos";
        return `<article class="project-card" data-project="${key}">
          <h3>${project.code} · ${project.name}</h3>
          <label>Formato de etiqueta definido
            <select data-project-field="formatStable">
              <option value="">Selecciona…</option>
              ${["Sí", "No", "Depende del material", "No sabemos"].map((opt) => `<option${card.formatStable === opt ? " selected" : ""}>${opt}</option>`).join("")}
            </select>
          </label>
          <label>¿Cómo llega normalmente?
            <select data-project-field="arrivalFormat">
              <option value="">Selecciona…</option>
              ${["Excel", "Hoja física", "Ambos", "Otro"].map((opt) => `<option${card.arrivalFormat === opt ? " selected" : ""}>${opt}</option>`).join("")}
            </select>
          </label>
          <label>¿Ya llega etiquetado?
            <select data-project-field="preLabeled">
              <option value="">Selecciona…</option>
              ${["Siempre", "A veces", "Nunca", "Depende"].map((opt) => `<option${card.preLabeled === opt ? " selected" : ""}>${opt}</option>`).join("")}
            </select>
          </label>
          <p class="field-label">Campos en etiqueta</p>
          ${LABEL_FIELD_CHECKS.map(
            (label) =>
              `<label class="label-check"><input type="checkbox" data-project-label="${label}" ${checks(label)} /> ${label}</label>`
          ).join("")}
          <div class="label-matrix-host">
            ${LABEL_FIELD_CHECKS.map((label) => renderLabelFieldMatrix(label, card)).join("")}
          </div>
          <label>Identificador principal
            <select data-project-field="primaryIdentifier">
              <option value="">Selecciona…</option>
              ${["Pedido", "SAP", "Partida", "SKU", "Combinación de campos", "Otro"].map((opt) => `<option${card.primaryIdentifier === opt ? " selected" : ""}>${opt}</option>`).join("")}
            </select>
          </label>
          <label class="primary-combo${showCombo ? "" : " hidden"}" data-primary-combo${showCombo ? "" : " hidden"}>
            Combinación de campos (indique cuáles)
            <input data-project-field="primaryIdentifierCombination" type="text" maxlength="240" value="${card.primaryIdentifierCombination || ""}" placeholder="Ej. Pedido + Partida" />
          </label>
          <label>Comentario del proyecto
            <textarea data-project-field="comment" maxlength="1200">${card.comment || ""}</textarea>
          </label>
        </article>`;
      })
      .join("");
  }

  function wireProjectCardInteractions(host) {
    host.querySelectorAll("[data-project-label]").forEach((checkbox) => {
      checkbox.addEventListener("change", () => {
        const card = checkbox.closest(".project-card");
        const label = checkbox.dataset.projectLabel;
        const matrix = card?.querySelector(`[data-label-matrix="${label}"]`);
        if (!matrix) return;
        matrix.classList.toggle("hidden", !checkbox.checked);
        matrix.hidden = !checkbox.checked;
      });
    });
    host.querySelectorAll(".matrix-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const label = btn.dataset.label;
        const kind = btn.dataset.matrix;
        host
          .querySelectorAll(`.matrix-btn[data-label="${label}"][data-matrix="${kind}"]`)
          .forEach((el) => el.classList.remove("selected"));
        btn.classList.add("selected");
      });
    });
    host.querySelectorAll('[data-project-field="primaryIdentifier"]').forEach((select) => {
      select.addEventListener("change", () => {
        const card = select.closest(".project-card");
        const combo = card?.querySelector("[data-primary-combo]");
        if (!combo) return;
        const show = select.value === "Combinación de campos";
        combo.classList.toggle("hidden", !show);
        combo.hidden = !show;
      });
    });
  }

  function renderFields(section, record) {
    const host = byId("fieldsHost");
    const answers = { ...(record?.answers || {}) };
    let questionIndex = 0;
    host.innerHTML = section.fields
      .map((field) => {
        if (!fieldVisible(field, answers)) return "";
        questionIndex += 1;
        const code = questionCode(questionIndex);
        if (field.kind === "project-cards") {
          return `<div class="field-block" data-field-id="${field.id}" data-question-code="${code}">
            <div class="field-label question-label"><span class="question-number">${code}</span><span>${field.label || "Proyectos y etiquetas"}</span></div>
            ${renderProjectCards(bootstrap.projects || [], record)}
            ${renderFieldExtras(field, record)}
          </div>`;
        }
        if (field.kind === "project-select") {
          return `<div class="field-block" data-field-id="${field.id}" data-question-code="${code}">
            <div class="field-label question-label"><span class="question-number">${code}</span><span>${field.label}</span></div>
            ${field.help ? `<p class="hint">${field.help}</p>` : ""}
            ${renderProjectSelect(field, record)}
            ${renderFieldExtras(field, record)}
          </div>`;
        }
        if (field.kind === "project-answer-grid") {
          return `<div class="field-block" data-field-id="${field.id}" data-question-code="${code}">
            <div class="field-label question-label"><span class="question-number">${code}</span><span>${field.label}</span></div>
            ${field.help ? `<p class="hint">${field.help}</p>` : ""}
            ${renderProjectAnswerGrid(field, record)}
            ${renderFieldExtras(field, record)}
          </div>`;
        }
        const value = answers[field.id];
        let control = "";
        if (field.kind === "choice") {
          control = `<div class="option-grid">${(field.options || [])
            .map(
              (option) =>
                `<button type="button" class="option-btn${value === option ? " selected" : ""}" data-field="${field.id}" data-value="${option}">${option}</button>`
            )
            .join("")}</div>`;
        } else if (field.kind === "multi") {
          const selected = new Set(Array.isArray(value) ? value : []);
          control = `<div class="option-grid">${(field.options || [])
            .map(
              (option) =>
                `<button type="button" class="option-btn${selected.has(option) ? " selected" : ""}" data-field="${field.id}" data-multi="${option}">${option}</button>`
            )
            .join("")}</div>`;
        } else if (field.kind === "textarea") {
          control = `<textarea id="field-${field.id}" maxlength="4000" placeholder="${field.placeholder || ""}">${value || ""}</textarea>`;
        } else {
          control = `<input id="field-${field.id}" type="${field.kind === "time" ? "time" : "text"}" value="${value || ""}" maxlength="500" placeholder="${field.placeholder || ""}" />`;
        }
        return `<div class="field-block" data-field-id="${field.id}" data-question-code="${code}">
          <div class="field-label question-label"><span class="question-number">${code}</span><span>${field.label}</span></div>
          ${field.help ? `<p class="hint">${field.help}</p>` : ""}
          ${control}
          ${renderFieldExtras(field, record)}
        </div>`;
      })
      .join("");

    host.querySelectorAll(".option-btn[data-value]").forEach((btn) => {
      btn.addEventListener("click", () => {
        host.querySelectorAll(`.option-btn[data-field="${btn.dataset.field}"][data-value]`).forEach((el) => el.classList.remove("selected"));
        btn.classList.add("selected");
        refreshConditionalFields(section, record);
      });
    });
    host.querySelectorAll(".option-btn[data-multi]").forEach((btn) => {
      btn.addEventListener("click", () => {
        btn.classList.toggle("selected");
        refreshConditionalFields(section, record);
      });
    });
    host.querySelectorAll(".flag-btn").forEach((btn) => btn.addEventListener("click", () => btn.classList.toggle("active")));
    wireFieldExtras(host);
    wireProjectSelectInteractions(host, section, record);
    wireProjectCardInteractions(host);
  }

  function refreshConditionalFields(section, record) {
    const live = collectAnswers(section);
    renderFields(section, {
      ...(record || {}),
      answers: { ...(record?.answers || {}), ...live.answers },
      comments: { ...(record?.comments || {}), ...live.comments },
      flags: { ...(record?.flags || {}), ...live.flags }
    });
  }

  function collectAnswers(section) {
    const answers = {};
    const comments = {};
    const flags = {};
    section.fields.forEach((field) => {
      if (field.kind === "project-cards") {
        const cards = {};
        document.querySelectorAll(".project-card").forEach((card) => {
          const code = card.dataset.project;
          const labelFields = [...card.querySelectorAll("[data-project-label]:checked")].map((el) => el.dataset.projectLabel);
          const fieldDetails = {};
          labelFields.forEach((label) => {
            const matrix = card.querySelector(`[data-label-matrix="${label}"]`);
            if (!matrix) return;
            fieldDetails[label] = {
              presentation:
                matrix.querySelector('.matrix-btn[data-matrix="presentation"].selected')?.dataset.value || "",
              logitecAction:
                matrix.querySelector('.matrix-btn[data-matrix="logitecAction"].selected')?.dataset.value || ""
            };
          });
          const payload = { labelFields, fieldDetails };
          card.querySelectorAll("[data-project-field]").forEach((input) => {
            payload[input.dataset.projectField] = input.value;
          });
          cards[code] = payload;
        });
        answers[field.id] = cards;
        return;
      }
      if (field.kind === "project-select") {
        answers[field.id] = [...document.querySelectorAll(`[data-project-select="${field.id}"]:checked`)].map(
          (el) => el.dataset.projectCode
        );
        comments[field.id] = byId(`comment-${field.id}`)?.value?.trim() || "";
        flags[field.id] = [...document.querySelectorAll(`.flag-btn[data-field="${field.id}"].active`)].map((el) => el.dataset.flag);
        return;
      }
      if (field.kind === "project-answer-grid") {
        const grid = {};
        document.querySelectorAll(`.option-btn[data-project-answer-field="${field.id}"].selected`).forEach((btn) => {
          grid[btn.dataset.projectCode] = btn.dataset.value;
        });
        answers[field.id] = grid;
        comments[field.id] = byId(`comment-${field.id}`)?.value?.trim() || "";
        flags[field.id] = [...document.querySelectorAll(`.flag-btn[data-field="${field.id}"].active`)].map((el) => el.dataset.flag);
        return;
      }
      const selected = document.querySelector(`.option-btn[data-field="${field.id}"].selected[data-value]`);
      const multi = [...document.querySelectorAll(`.option-btn[data-field="${field.id}"].selected[data-multi]`)].map((el) => el.dataset.multi);
      const input = byId(`field-${field.id}`);
      if (field.kind === "choice") answers[field.id] = selected?.dataset.value || "";
      else if (field.kind === "multi") answers[field.id] = multi;
      else answers[field.id] = input?.value?.trim() || "";
      comments[field.id] = byId(`comment-${field.id}`)?.value?.trim() || "";
      flags[field.id] = [...document.querySelectorAll(`.flag-btn[data-field="${field.id}"].active`)].map((el) => el.dataset.flag);
    });
    return { answers, comments, flags };
  }

  function renderSection(options = {}) {
    const section = currentSection();
    if (!section) {
      renderSummary();
      return;
    }
    const record = session?.sections?.[section.id] || null;
    const visible = visibleFields(section, record);
    byId("sectionCounter").textContent = `SECCIÓN ${sectionIndex + 1} DE ${sections().length}`;
    byId("sectionTitle").textContent = section.title;
    byId("sectionIntro").textContent = section.intro || "";
    const progress = byId("sectionQuestionProgress");
    if (progress) {
      if (visible.length) {
        progress.textContent = `Preguntas ${questionCode(1)} – ${questionCode(visible.length)} (${visible.length} en esta sección)`;
        progress.hidden = false;
        progress.classList.remove("hidden");
      } else {
        progress.textContent = "";
        progress.hidden = true;
        progress.classList.add("hidden");
      }
    }
    const badge = byId("sectionStatus");
    const status = record?.status || "draft";
    badge.textContent = statusLabel(status, Boolean(record));
    badge.className = `status-badge ${status}`;
    renderRespondentBlock(record);
    renderFields(section, record);
    const attachmentBlock = byId("attachmentBlock");
    const showAttachments = Boolean(section.sectionAttachments);
    attachmentBlock.hidden = !showAttachments;
    attachmentBlock.classList.toggle("hidden", !showAttachments);
    const attachmentHint = byId("attachmentHint");
    if (attachmentHint) {
      attachmentHint.textContent = showAttachments
        ? section.id === "recepcion-real"
          ? "Si tienen un ejemplo, pueden adjuntar una fotografía de etiqueta, hoja, Excel, PDF o documento relacionado. Máx. 8 MB."
          : "Fotos, PDF, Excel o capturas. Máx. 8 MB."
        : "";
    }
    byId("attachmentList").innerHTML = (record?.attachments || [])
      .map((file) => `<li>${file.originalName} (${Math.round(file.sizeBytes / 1024)} KB)</li>`)
      .join("");
    renderProgress();
    if (!options.keepMessage) setMessage("");
    resetActionButtons();
    if (options.announce) showSectionNavHint();
    if (options.scroll) {
      requestAnimationFrame(() => scrollToSectionHead(options.instantScroll ? "auto" : "smooth"));
    }
  }

  async function persistSection(action, options = {}) {
    const section = currentSection();
    if (!section) return false;
    if (ACTION_BUTTONS[action]) setButtonState(action, "working");
    if (!options.skipRender && !options.keepMessage && !options.silent) setMessage("");
    try {
      const { answers, comments, flags } = collectAnswers(section);
      const payload = {
        action,
        respondents: collectRespondents(),
        answers,
        comments,
        flags
      };
      const result = await api(`/api/operations-intake/sessions/${session.sessionId}/sections/${section.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: payload
      });
      session = result.session;
      if (pendingAttachments.length) {
        for (const item of pendingAttachments) {
          const form = new FormData();
          form.append("fieldId", item.fieldId);
          form.append("file", item.file);
          const upload = await fetch(
            `/api/operations-intake/sessions/${session.sessionId}/sections/${section.id}/attachments`,
            { method: "POST", body: form }
          );
          if (!upload.ok) {
            throw new Error("No se pudo subir un adjunto.");
          }
        }
        pendingAttachments = [];
        const refreshed = await api(`/api/operations-intake/sessions/${session.sessionId}`);
        session = refreshed.session;
      }
      if (ACTION_BUTTONS[action]) setButtonState(action, "success");
      updateSectionStatusBadge();
      if (!options.skipRender) {
        renderSection({ keepMessage: Boolean(options.successMessage), scroll: false });
      }
      if (options.successMessage) setMessage(options.successMessage, "ok");
      else if (!options.silent && !options.skipRender) {
        setMessage(
          action === "confirm"
            ? "✓ Sección confirmada"
            : action === "pending"
              ? "✓ Sección pendiente"
              : "✓ Guardado",
          "ok"
        );
      }
      return true;
    } catch (error) {
      if (ACTION_BUTTONS[action]) setButtonState(action, "idle");
      setMessage(`No se pudo guardar. Reintentar. ${error?.message || ""}`.trim(), "error");
      return false;
    }
  }

  function renderSummary() {
    byId("formPanel").hidden = true;
    byId("formPanel").classList.add("hidden");
    byId("summaryPanel").hidden = false;
    byId("summaryPanel").classList.remove("hidden");
    const list = byId("summaryList");
    list.innerHTML = sections()
      .map((section) => {
        const record = session?.sections?.[section.id];
        const status = record?.status || "draft";
        return `<li><span>${section.title}</span><span class="status-badge ${status}">${statusLabel(status, Boolean(record))}</span></li>`;
      })
      .join("");
    byId("exportJsonBtn").href = `/api/operations-intake/sessions/${session.sessionId}/export.json`;
    byId("exportMdBtn").href = `/api/operations-intake/sessions/${session.sessionId}/export.md`;
    byId("sessionMeta").textContent = `Sesión ${session.sessionId}`;
  }

  function wireClick(id, handler) {
    const el = byId(id);
    if (el) el.addEventListener("click", handler);
  }

  wireClick("confirmBtn", () => void confirmAndContinue());
  wireClick("pendingBtn", () => void pendingAndContinue());
  const attachmentInput = byId("attachmentInput");
  if (attachmentInput) {
    attachmentInput.addEventListener("change", (event) => {
      const file = event.target.files?.[0];
      if (!file) return;
      pendingAttachments.push({ fieldId: "section", file });
      const attachmentList = byId("attachmentList");
      if (attachmentList) attachmentList.innerHTML += `<li>Pendiente: ${file.name}</li>`;
      event.target.value = "";
    });
  }
  wireClick("restartBtn", () => {
    writeSessionId("");
    location.reload();
  });
  wireClick("retryBootBtn", () => void boot());
  wireClick("newSessionBootBtn", () => void startNewSessionAndBoot());

  window.addEventListener("error", (event) => {
    if (bootComplete) return;
    showBootError("cargar el formulario", event.error || new Error(event.message || "error de script"));
  });
  window.addEventListener("unhandledrejection", (event) => {
    if (bootComplete) return;
    showBootError("iniciar el formulario", event.reason || new Error("promesa rechazada"));
  });

  void boot();
})();
