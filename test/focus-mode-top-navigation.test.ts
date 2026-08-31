import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const html = readFileSync(new URL("../public/dashboard.html", import.meta.url), "utf8");
const js = readFileSync(new URL("../public/dashboard.js", import.meta.url), "utf8");
const loginHtml = readFileSync(new URL("../public/login.html", import.meta.url), "utf8");
const loginJs = readFileSync(new URL("../public/login.js", import.meta.url), "utf8");

function sliceFunction(source: string, name: string) {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `missing function ${name}`);
  let depth = 0;
  for (let i = start; i < source.length; i += 1) {
    if (source[i] === "{") depth += 1;
    if (source[i] === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  throw new Error(`unterminated function ${name}`);
}

test("Modo concentración reutiliza los mismos cinco tabs, sin menú extra", () => {
  assert.match(html, /id="focusNavSlot"/);
  assert.match(html, /id="focusNavHome"/);
  assert.match(html, /id="focusSubnavSlot"/);
  assert.match(html, /id="focusSubnavHome"/);
  assert.equal((html.match(/class="nav-section-tabs"/g) || []).length, 1);
  assert.equal((html.match(/class="nav-section-body"/g) || []).length, 1);
  for (const section of ["inicio", "operacion", "inventario", "control", "sistema"]) {
    const matches = html.match(new RegExp(`class="nav-section-tab[^"]*" data-nav-section="${section}"`, "g")) || [];
    assert.equal(matches.length, 1, `section tab ${section} must not be duplicated`);
  }
  assert.doesNotMatch(html, />MENÚ</);
  assert.doesNotMatch(html, /id="focusMenuBtn"/);
  assert.doesNotMatch(html, /focus-mode-dropdown/);
});

test("applyFocusMode mueve tabs y submenús reales a la barra superior", () => {
  const place = sliceFunction(js, "placeNavTabsForFocusMode");
  assert.match(place, /focusNavSlot/);
  assert.match(place, /focusSubnavSlot/);
  assert.match(place, /nav-section-body/);
  const node = sliceFunction(js, "placeNavNode");
  assert.match(node, /appendChild\(node\)/);
  const apply = sliceFunction(js, "applyFocusMode");
  assert.match(apply, /placeNavTabsForFocusMode\(Boolean\(on\)\)/);
  assert.match(apply, /if \(!on\) announceNav\(""\)/);
  const setNav = sliceFunction(js, "setNavSection");
  assert.match(setNav, /querySelectorAll\("\.nav-section-tab"\)/);
  assert.match(setNav, /classList\.toggle\("active", active\)/);
  assert.match(js, /isNavModuleCardActive\(btn, mod\)/);
});

test("Inicio, Operación, Control y Sistema conservan destinos reales de segundo nivel", () => {
  const inicio = html.slice(html.indexOf('data-nav-section-panel="inicio"'), html.indexOf('data-nav-section-panel="operacion"'));
  for (const label of ["Centro de Control", "Mis tareas", "Avisos internos", "Incidencias abiertas", "Picking / Surtido de salida"]) {
    assert.match(inicio, new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  const operacion = html.slice(html.indexOf('data-nav-section-panel="operacion"'), html.indexOf('data-nav-section-panel="inventario"'));
  for (const label of ["Entradas / Recepción", "Órdenes de surtido / Requisiciones", "Picking / Surtido de salida", "Movimiento interno / Reubicación", "Salidas / Despacho"]) {
    assert.match(operacion, new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  const control = html.slice(html.indexOf('data-nav-section-panel="control"'), html.indexOf('data-nav-section-panel="sistema"'));
  for (const label of ["Incidencias", "Movimientos", "Reportes y exportaciones"]) {
    assert.match(control, new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  const sistema = html.slice(html.indexOf('data-nav-section-panel="sistema"'), html.indexOf('id="moduleControlCenter"'));
  assert.match(sistema, /data-module="account"/);
  assert.match(sistema, />Mi cuenta</);
  assert.match(sistema, /data-module="users"/);
  assert.match(sistema, /Usuarios y accesos/);
  assert.match(sistema, /data-module="config"/);
  assert.match(sistema, />Configuración</);
});

test("un test de concentración no puede pasar si el nivel 2 desaparece con el sidebar", () => {
  const place = sliceFunction(js, "placeNavTabsForFocusMode");
  assert.match(place, /focusSubnavSlot/);
  assert.match(place, /nav-section-body/);
  assert.doesNotMatch(html, /body\.focus-mode \.nav-section-body \{\s*display:\s*none/);
  assert.match(html, /body\.focus-mode \.focus-subnav-slot:not\(\[hidden\]\) \{\s*display:\s*block/);
});

test("Usuarios y Configuración solo existen en la matriz ADMIN", () => {
  assert.match(js, /ADMIN:[\s\S]{0,400}"users"/);
  assert.match(js, /ADMIN:[\s\S]{0,400}"config"/);
  assert.doesNotMatch(js, /SUPERVISOR:[\s\S]{0,400}"users"/);
  assert.doesNotMatch(js, /SUPERVISOR:[\s\S]{0,400}"config"/);
  assert.doesNotMatch(js, /OPERATOR:[\s\S]{0,400}"users"/);
  assert.doesNotMatch(js, /CLIENT:[\s\S]{0,280}"users"/);
  assert.doesNotMatch(js, /CLIENT:[\s\S]{0,280}"config"/);
});

test("Inventario conserva los seis destinos reales de segundo nivel", () => {
  const panel = html.slice(html.indexOf('data-nav-section-panel="inventario"'), html.indexOf('data-nav-section-panel="control"'));
  for (const label of ["Existencias", "Clientes", "Catálogo y productos", "Proyectos", "Almacenes", "Ubicaciones"]) {
    assert.match(panel, new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  for (const mod of ["inventory", "clients", "catalog", "projects", "warehouses", "locations"]) {
    assert.match(panel, new RegExp(`data-module="${mod}"`));
  }
});

test("permisos de rol se aplican a tabs y botones de módulo", () => {
  const applyRole = sliceFunction(js, "applyRoleNavigation");
  assert.match(applyRole, /querySelectorAll\(`\.nav-section-tab\[data-nav-section="\$\{sectionId\}"\]`\)/);
  assert.match(js, /CLIENT: \[\s*"inventory"/);
  assert.doesNotMatch(js, /CLIENT:[\s\S]{0,220}"inbound"/);
  assert.doesNotMatch(js, /SUPERVISOR:[\s\S]{0,400}"users"/);
  assert.doesNotMatch(js, /OPERATOR:[\s\S]{0,400}"config"/);
});

test("el anuncio ya no dice que la navegación está oculta", () => {
  const wire = sliceFunction(js, "wireFocusMode");
  assert.doesNotMatch(wire, /navegación oculta/);
  assert.match(wire, /barra superior/);
  assert.match(js, /Salir de concentración/);
});

test("sidebar de chrome se oculta pero el segundo nivel sigue en la cabecera", () => {
  assert.match(html, /body\.focus-mode \.sidebar \{\s*display: none/);
  assert.match(html, /body\.focus-mode \.focus-subnav-slot:not\(\[hidden\]\)/);
  assert.match(html, /client-active-cluster/);
  assert.match(html, /body\.focus-mode \.app-topbar[\s\S]{0,220}overflow:\s*visible/);
});

test("login no mezcla modo concentración y no guarda password en LOGITEC", () => {
  assert.match(loginHtml, /id="rememberEmail"/);
  assert.match(loginHtml, /id="rememberPassword"/);
  assert.match(loginHtml, /id="submitBtn"/);
  assert.match(loginJs, /logitec_remembered_email/);
  assert.doesNotMatch(loginJs, /focus-mode/);
  assert.doesNotMatch(loginHtml, /focusNavSlot/);
  assert.doesNotMatch(loginJs, /localStorage\.setItem\([^)]*password/i);
  assert.match(loginJs, /navigator\.credentials\.store/);
});
