import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const html = readFileSync(new URL("../public/dashboard.html", import.meta.url), "utf8");
const js = readFileSync(new URL("../public/dashboard.js", import.meta.url), "utf8");

function sliceFunction(source: string, name: string): string {
  const token = `function ${name}(`;
  const start = source.indexOf(token);
  assert.ok(start >= 0, `missing function ${name}`);
  const from = source.lastIndexOf("\n", start) >= 0 ? source.lastIndexOf("\n", start) + 1 : start;
  const next = source.indexOf("\nfunction ", start + token.length);
  const nextAsync = source.indexOf("\nasync function ", start + token.length);
  const candidates = [next, nextAsync].filter((n) => n >= 0);
  const end = candidates.length ? Math.min(...candidates) : source.length;
  return source.slice(from, end);
}

function loadNavHarness() {
  return new Function(`
    let currentRole = "ADMIN";
    const announces = [];
    const shown = [];
    const body = { classList: { add() {}, remove() {}, toggle(name, on) { this._focus = name === "focus-mode" ? on : this._focus; } } };
    const panes = {
      moduleAccount: { classList: { remove: (c) => shown.push("account:" + c) }, style: {} },
      moduleUsers: { classList: { remove: (c) => shown.push("users:" + c) }, style: {} },
      moduleConfig: { classList: { remove: (c) => shown.push("config:" + c) }, style: {} }
    };
    const document = {
      body,
      getElementById: (id) => panes[id] || (id === "navAnnounce" ? { set textContent(v) { announces.push(v); } } : null)
    };
    ${sliceFunction(js, "announceNav")}
    ${sliceFunction(js, "isSistemaWorkspaceModule")}
    ${sliceFunction(js, "showSistemaWorkspace")}
    return {
      announces,
      shown,
      setRole(role) { currentRole = role; },
      announceNav,
      isSistemaWorkspaceModule,
      showSistemaWorkspace
    };
  `)() as {
    announces: string[];
    shown: string[];
    setRole: (role: string) => void;
    announceNav: (text: string) => void;
    isSistemaWorkspaceModule: (mod: string) => boolean;
    showSistemaWorkspace: () => void;
  };
}

test("Clientes → Agregar proyecto sigue abriendo el formulario ADMIN", () => {
  assert.match(sliceFunction(js, "openAddProjectFromClientCard"), /openProjectForm\(null, client\)/);
  assert.doesNotMatch(sliceFunction(js, "openAddProjectFromClientCard"), /navigateTo\(/);
  assert.match(sliceFunction(js, "dispatchClientContextCardClick"), /openAddProjectFromClientCard/);
});

test("Inicio anuncia destinos y no duplica importador", () => {
  assert.match(html, /Registrar entrada → Operación/);
  assert.match(html, /data-nav-announce="Abre Operación → Entradas \/ Recepción"/);
  assert.match(html, /Inicio no opera inventario/);
  assert.match(html, /Ver existencias completas → Inventario/);
  assert.equal((html.match(/id="openInventoryImportBtn"/g) || []).length, 1);
  assert.doesNotMatch(html, /id="bulkInboundOpenImportBtn"/);
});

test("Entrada masiva anuncia Inventario → Existencias y reescribe a inventory", () => {
  const nav = sliceFunction(js, "navigateTo");
  assert.match(html, /Abre Inventario → Existencias \(único asistente de importación\)/);
  assert.match(nav, /mod === "bulk-inbound"/);
  assert.match(nav, /fromBulkInbound/);
  assert.match(nav, /announceNav\(/);
  assert.match(nav, /mod = "inventory"/);
  assert.match(nav, /section = "inventario"/);
});

test("Proyectos distingue existencias vs datos maestro ADMIN", () => {
  const render = sliceFunction(js, "renderProjectsStockList");
  assert.match(render, /Ver existencias/);
  assert.match(render, /js-open-project-master/);
  assert.match(render, /currentRole === "ADMIN"/);
  assert.match(render, /openProjectDetail/);
  assert.match(html, /Hay dos acciones distintas/);
});

test("Almacenes y Ubicaciones exponen acción visible", () => {
  assert.match(sliceFunction(js, "loadWarehousesModule"), /Ver \/ editar datos/);
  assert.match(sliceFunction(js, "loadWarehousesModule"), /js-open-warehouse/);
  assert.doesNotMatch(sliceFunction(js, "loadWarehousesModule"), /row\.style\.cursor = "pointer"/);
  assert.match(sliceFunction(js, "loadLocationsModule"), /js-open-location/);
  assert.match(html, /Usa <strong>Ver \/ editar datos<\/strong>/);
});

test("Sistema es un workspace único sin nav redundante", () => {
  const sistema = html.slice(html.indexOf('data-nav-section-panel="sistema"'), html.indexOf('data-nav-section-panel="sistema"') + 900);
  assert.match(sistema, /Workspace único de administración/);
  assert.match(sistema, /id="btnAccount"/);
  assert.doesNotMatch(sistema, /id="btnUsers"/);
  assert.doesNotMatch(sistema, /id="btnConfig"/);
  assert.match(sliceFunction(js, "showSistemaWorkspace"), /moduleUsers/);
  assert.match(sliceFunction(js, "showSistemaWorkspace"), /currentRole !== "ADMIN"/);
  const harness = loadNavHarness();
  harness.setRole("ADMIN");
  harness.showSistemaWorkspace();
  assert.ok(harness.shown.includes("users:hidden"));
  assert.ok(harness.shown.includes("config:hidden"));
  assert.ok(harness.shown.includes("account:hidden"));
  const other = loadNavHarness();
  other.setRole("SUPERVISOR");
  other.showSistemaWorkspace();
  assert.ok(other.shown.includes("account:hidden"));
  assert.ok(!other.shown.includes("users:hidden"));
  assert.ok(!other.shown.includes("config:hidden"));
});

test("CLIENT/SUPERVISOR/OPERATOR no ganan módulos ADMIN", () => {
  assert.match(js, /SUPERVISOR:[\s\S]{0,400}"account"/);
  assert.doesNotMatch(js, /SUPERVISOR:[\s\S]{0,400}"users"/);
  assert.doesNotMatch(js, /SUPERVISOR:[\s\S]{0,400}"config"/);
  assert.doesNotMatch(js, /OPERATOR:[\s\S]{0,400}"users"/);
  assert.doesNotMatch(js, /CLIENT:[\s\S]{0,400}"config"/);
  assert.match(sliceFunction(js, "openAddProjectFromClientCard"), /canAdminCreateProject/);
  assert.match(sliceFunction(js, "applyRoleNavigation"), /setRoleUiVisible\(document\.getElementById\("moduleConfig"\), isAdmin\)/);
  assert.match(sliceFunction(js, "applyRoleNavigation"), /setRoleUiVisible\(document\.getElementById\("moduleUsers"\), isAdmin\)/);
});

test("contraseña: ojo solo en captura nueva, nunca hash", () => {
  assert.match(html, /data-password-target="newPassword"/);
  assert.match(html, /data-password-target="newAccountPassword"/);
  assert.doesNotMatch(html, /data-password-target="currentPassword"/);
  assert.doesNotMatch(js, /passwordHash/);
  assert.doesNotMatch(html, /passwordHash/);
  const toggle = sliceFunction(js, "wireNewPasswordVisibilityToggles");
  assert.match(toggle, /id !== "newPassword" && id !== "newAccountPassword"/);
});

test("modo concentración es voluntario y no bloquea Escape", () => {
  assert.match(html, /id="focusModeBtn"/);
  const wire = sliceFunction(js, "wireFocusMode");
  assert.match(wire, /requestFocusFullscreen/);
  assert.match(wire, /exitFocusFullscreen/);
  assert.doesNotMatch(wire, /preventDefault\(\)/);
  assert.doesNotMatch(js, /window\.resizeTo|chrome\.windows|moveTo\(/);
  assert.match(sliceFunction(js, "canUseFullscreenApi"), /requestFullscreen/);
});

test("Incident queda fuera del reset de inventario; import/tenant intactos", () => {
  assert.match(html, /no forman parte de este reset de inventario/);
  assert.match(js, /function openInventoryImportAssistant/);
  assert.match(js, /canAdministerInventoryImport/);
  assert.match(js, /ALLOW_TENANT_INVENTORY_RESET/);
  assert.match(js, /selectOperationalClient/);
  assert.match(js, /assertImportBatchMutable|canAdministerInventoryImport/);
  assert.match(html, /id="openInventoryImportBtn"/);
  assert.match(html, /ALLOW_TENANT_INVENTORY_RESET/);
});
