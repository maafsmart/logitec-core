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
  assert.equal((html.match(/class="nav-section-tabs"/g) || []).length, 1);
  for (const section of ["inicio", "operacion", "inventario", "control", "sistema"]) {
    const matches = html.match(new RegExp(`class="nav-section-tab[^"]*" data-nav-section="${section}"`, "g")) || [];
    assert.equal(matches.length, 1, `section tab ${section} must not be duplicated`);
  }
  assert.doesNotMatch(html, />MENÚ</);
  assert.doesNotMatch(html, /id="focusMenuBtn"/);
  assert.doesNotMatch(html, /focus-mode-dropdown/);
});

test("applyFocusMode mueve los tabs reales a la barra superior y setNavSection pinta .active", () => {
  const place = sliceFunction(js, "placeNavTabsForFocusMode");
  assert.match(place, /focusNavSlot/);
  assert.match(place, /focusNavHome/);
  assert.match(place, /appendChild\(tabs\)/);
  const apply = sliceFunction(js, "applyFocusMode");
  assert.match(apply, /placeNavTabsForFocusMode\(Boolean\(on\)\)/);
  assert.match(apply, /if \(!on\) announceNav\(""\)/);
  const setNav = sliceFunction(js, "setNavSection");
  assert.match(setNav, /querySelectorAll\("\.nav-section-tab"\)/);
  assert.match(setNav, /classList\.toggle\("active", active\)/);
  assert.match(setNav, /aria-selected/);
  const wire = sliceFunction(js, "wireNavSectionTabs");
  assert.match(wire, /navigateTo\(section, null\)/);
});

test("permisos de rol se aplican a todos los tabs de sección", () => {
  const applyRole = sliceFunction(js, "applyRoleNavigation");
  assert.match(applyRole, /querySelectorAll\(`\.nav-section-tab\[data-nav-section="\$\{sectionId\}"\]`\)/);
  assert.match(js, /CLIENT: \[\s*"inventory"/);
  assert.doesNotMatch(js, /CLIENT:[\s\S]{0,220}"inbound"/);
});

test("el anuncio ya no dice que la navegación está oculta", () => {
  const wire = sliceFunction(js, "wireFocusMode");
  assert.doesNotMatch(wire, /navegación oculta/);
  assert.match(wire, /barra superior/);
  assert.match(js, /Salir de concentración/);
});

test("sidebar de módulos sigue oculta en concentración y la cabecera no se recorta", () => {
  assert.match(html, /body\.focus-mode \.sidebar \{\s*display: none/);
  assert.match(html, /body\.focus-mode \.app-topbar[\s\S]{0,180}overflow:\s*visible/);
  assert.match(html, /body\.focus-mode \.app-topbar \.aviat-context-bar[\s\S]{0,80}max-width:\s*none/);
  assert.match(html, /body\.focus-mode \.focus-nav-slot:not\(\[hidden\]\)/);
  assert.doesNotMatch(html, /body\.focus-mode \.nav-section-body/);
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
