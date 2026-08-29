import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const html = readFileSync(new URL("../public/dashboard.html", import.meta.url), "utf8");
const js = readFileSync(new URL("../public/dashboard.js", import.meta.url), "utf8");

const REQUIRED_IDS = [
  "logoutBtn",
  "sessionDisplayName",
  "sessionEmailInline",
  "sessionRoleInline",
  "environmentBadge",
  "btnInventory",
  "btnControl",
  "btnCatalog",
  "btnProjects",
  "moduleInventory",
  "inventoryProjectSelect",
  "inventoryList",
  "inventoryFilterStrip",
  "openInventoryImportBtn",
  "physicalInventoryResetBtn",
  "physicalInventoryResetImportBtn",
  "physicalInventoryResetModal",
  "importWizardPanel"
];

function idsOf(source: string): string[] {
  return [...source.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]!);
}

test("existe data-ui-version compact-workspace-v1", () => {
  assert.match(html, /<html[^>]*data-ui-version="compact-workspace-v1"/);
});

test("existe body.workspace-compact", () => {
  assert.match(html, /<body[^>]*class="[^"]*workspace-compact/);
});

test("existe el bloque final de estilos compactos", () => {
  const start = html.indexOf("/* ===== compact-workspace-v1 ===== */");
  const end = html.indexOf("/* ===== /compact-workspace-v1 ===== */");
  assert.ok(start > 0 && end > start);
  const compact = html.slice(start, end);
  assert.match(compact, /@media \(max-width: 900px\)/);
  assert.match(compact, /@media \(max-width: 720px\)/);
  assert.match(compact, /overflow-x:\s*hidden/);
});

test("navegación principal conserva las cinco áreas", () => {
  for (const section of ["inicio", "operacion", "inventario", "control", "sistema"]) {
    assert.match(html, new RegExp(`data-nav-section="${section}"`));
  }
  assert.match(html, />Inicio</);
  assert.match(html, />Operación</);
  assert.match(html, />Inventario</);
  assert.match(html, />Control</);
  assert.match(html, />Sistema</);
});

test("descripciones de módulos siguen en el HTML", () => {
  assert.match(html, /class="module-btn-desc"/);
  assert.ok((html.match(/class="module-btn-desc"/g) || []).length >= 10);
});

test("chips de proyecto siguen presentes", () => {
  assert.match(html, /\.project-chip\s*\{/);
  assert.match(html, /project-chips-row/);
  assert.match(js, /project-chip/);
});

test("no se eliminaron IDs operativos", () => {
  const ids = new Set(idsOf(html));
  assert.ok(ids.size >= 400, `expected >= 400 unique ids, got ${ids.size}`);
  for (const id of REQUIRED_IDS) {
    assert.ok(ids.has(id), `missing id ${id}`);
  }
});

test("contexto AVIAT permanece en el DOM", () => {
  assert.match(html, /data-aviat-primary-label/);
  assert.match(html, /data-aviat-project-label/);
  assert.match(html, /data-aviat-assignment-label/);
  assert.ok((html.match(/class="aviat-context-bar"/g) || []).length >= 2);
});

test("body móvil protegido contra overflow horizontal", () => {
  const compact = html.slice(html.indexOf("compact-workspace-v1"), html.indexOf("/compact-workspace-v1"));
  assert.match(compact, /overflow-x:\s*hidden/);
  assert.match(compact, /@media \(max-width: 720px\)/);
});

test("densidad inicial es compact y hay migración versionada", () => {
  assert.match(js, /GRID_DENSITY_DEFAULT_VERSION\s*=\s*"compact-workspace-v1"/);
  assert.match(js, /logitec_grid_density_default_version/);
  assert.match(js, /localStorage\.setItem\(GRID_DENSITY_KEY,\s*"compact"\)/);
  assert.match(js, /localStorage\.getItem\(GRID_DENSITY_KEY\) \|\| "compact"/);
  assert.match(html, /data-grid-density="compact"/);
});

test("dashboard.js usa v=81", () => {
  assert.match(html, /dashboard\.js\?v=81/);
  assert.doesNotMatch(html, /dashboard\.js\?v=71/);
  assert.doesNotMatch(html, /dashboard\.js\?v=70/);
  assert.doesNotMatch(html, /dashboard\.js\?v=66/);
  assert.doesNotMatch(html, /dashboard\.js\?v=65/);
  assert.doesNotMatch(html, /dashboard\.js\?v=64/);
  assert.doesNotMatch(html, /dashboard\.js\?v=62/);
  assert.doesNotMatch(html, /dashboard\.js\?v=61/);
  assert.doesNotMatch(html, /dashboard\.js\?v=60/);
});

test("no aparecen textos técnicos nuevos visibles", () => {
  const body = html.slice(html.indexOf("<body"));
  const visible = body
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "");
  assert.doesNotMatch(visible, /compact-workspace-v1/);
  assert.doesNotMatch(visible, /GRID_DENSITY/);
  assert.doesNotMatch(visible, /data-ui-version/);
});
