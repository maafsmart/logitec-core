import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { createMovementSchema } from "../src/modules/inventory/inventory-movement.schema.js";

const html = readFileSync(new URL("../public/dashboard.html", import.meta.url), "utf8");
const js = readFileSync(new URL("../public/dashboard.js", import.meta.url), "utf8");
const routes = readFileSync(new URL("../src/modules/inventory/inventory.routes.ts", import.meta.url), "utf8");

function sliceFunction(source: string, name: string): string {
  const token = `function ${name}(`;
  const start = source.indexOf(token);
  assert.ok(start >= 0, `missing function ${name}`);
  let paren = 0;
  let brace = -1;
  for (let i = start + token.length - 1; i < source.length; i += 1) {
    const ch = source[i];
    if (brace < 0) {
      if (ch === "(") paren += 1;
      else if (ch === ")") {
        paren -= 1;
        if (paren === 0) {
          brace = source.indexOf("{", i);
          if (brace < 0) break;
          i = brace - 1;
        }
      }
      continue;
    }
    if (ch === "{") paren += 1;
    else if (ch === "}") {
      paren -= 1;
      if (paren === 0) return source.slice(start, i + 1);
    }
  }
  throw new Error(`unclosed function ${name}`);
}

function inventoryHtml() {
  const start = html.indexOf('id="moduleInventory"');
  const end = html.indexOf('id="moduleCatalog"');
  assert.ok(start >= 0 && end > start);
  return html.slice(start, end);
}

function inboundHtml() {
  const start = html.indexOf('id="moduleInbound"');
  const end = html.indexOf('id="moduleOutbound"');
  assert.ok(start >= 0 && end > start);
  return html.slice(start, end);
}

test("Existencias ya no tiene movementForm ni el formulario genérico de movimiento", () => {
  const inventory = inventoryHtml();
  assert.doesNotMatch(html, /id="movementForm"/);
  assert.doesNotMatch(html, /id="moveSku"/);
  assert.doesNotMatch(html, /id="moveType"/);
  assert.doesNotMatch(html, /id="moveQty"/);
  assert.doesNotMatch(html, /id="moveRef"/);
  assert.doesNotMatch(html, /id="moveNotes"/);
  assert.doesNotMatch(html, /id="moveWarehouse"/);
  assert.doesNotMatch(html, /id="moveLocation"/);
  assert.doesNotMatch(html, /id="moveStatus"/);
  assert.doesNotMatch(html, /id="movementBtn"/);
  assert.doesNotMatch(html, /id="movementError"/);
  assert.doesNotMatch(inventory, /Registrar movimiento/);
  assert.doesNotMatch(inventory, />Entrada \(\+\)/);
  assert.doesNotMatch(inventory, /ADJUST_SET/);
});

test("submitMovement y sus listeners ya no existen", () => {
  assert.doesNotMatch(js, /function submitMovement\s*\(/);
  assert.doesNotMatch(js, /\bsubmitMovement\b/);
  assert.doesNotMatch(js, /getElementById\("movementForm"\)/);
  assert.doesNotMatch(js, /getElementById\("moveSku"\)/);
  assert.doesNotMatch(js, /addEventListener\("submit", submitMovement\)/);
  assert.doesNotMatch(js, /fillInventoryStatusSelect\("moveStatus"/);
});

test("Existencias no puede hacer POST a /api/inventory/movements", () => {
  const inventory = inventoryHtml();
  assert.doesNotMatch(inventory, /\/api\/inventory\/movements/);
  const submitSrc = sliceFunction(js, "submitOperationalMovement");
  assert.match(submitSrc, /authenticatedFetch\("\/api\/inventory\/movements"/);
  assert.match(submitSrc, /method:\s*"POST"/);
  const postsOutsideSubmit = js.replace(submitSrc, "");
  assert.doesNotMatch(
    postsOutsideSubmit,
    /authenticatedFetch\("\/api\/inventory\/movements"[\s\S]{0,120}method:\s*"POST"/
  );
});

test("el panel ADMIN dirige a Operación con las claves canónicas", () => {
  const inventory = inventoryHtml();
  assert.match(inventory, /id="inventoryOpsNavPanel"/);
  assert.match(
    inventory,
    /Los movimientos de inventario se registran desde Operación para conservar asignación, ubicación y trazabilidad\./
  );
  assert.match(
    inventory,
    /id="inventoryGoInboundBtn"[^>]*data-goto-module="inbound"[^>]*data-nav-section="operacion"[^>]*>Entradas \/ Recepción</
  );
  assert.match(
    inventory,
    /id="inventoryGoRelocateBtn"[^>]*data-goto-module="relocate"[^>]*data-nav-section="operacion"[^>]*>Movimiento interno \/ Reubicación</
  );
  assert.match(
    inventory,
    /id="inventoryGoOutboundBtn"[^>]*data-goto-module="outbound"[^>]*data-nav-section="operacion"[^>]*>Salidas \/ Despacho</
  );
  const applyRoleSrc = sliceFunction(js, "applyRoleNavigation");
  assert.match(applyRoleSrc, /inventoryOpsNavPanel[\s\S]*classList\.toggle\("hidden", role !== "ADMIN"\)/);
  assert.match(html, /dashboard\.js\?v=72/);
});

test("los tres botones navegan al módulo canónico y no mutan inventario", () => {
  const navigations: Array<[string, string]> = [];
  const buttons = [
    { module: "inbound", section: "operacion" },
    { module: "relocate", section: "operacion" },
    { module: "outbound", section: "operacion" }
  ].map(({ module, section }) => {
    const btn: { dataset: Record<string, string>; trigger?: () => void; getAttribute: (name: string) => string | null; addEventListener: (type: string, fn: () => void) => void } = {
      dataset: {},
      getAttribute(name: string) {
        if (name === "data-goto-module") return module;
        if (name === "data-nav-section") return section;
        return null;
      },
      addEventListener(_type: string, fn: () => void) {
        btn.trigger = fn;
      }
    };
    return btn;
  });
  const wireQuickActions = new Function(
    "document",
    "navigateTo",
    "activateModule",
    `${sliceFunction(js, "wireQuickActions")}; return wireQuickActions;`
  )(
    { querySelectorAll: () => buttons },
    (section: string, mod: string) => {
      navigations.push([section, mod]);
    },
    () => {
      throw new Error("activateModule no debe usarse cuando hay data-nav-section");
    }
  );
  wireQuickActions();
  for (const btn of buttons) {
    assert.equal(typeof btn.trigger, "function");
    btn.trigger!();
  }
  assert.deepEqual(navigations, [
    ["operacion", "inbound"],
    ["operacion", "relocate"],
    ["operacion", "outbound"]
  ]);

  const wireSrc = sliceFunction(js, "wireQuickActions");
  const navSrc = sliceFunction(js, "navigateTo");
  assert.doesNotMatch(wireSrc, /authenticatedFetch/);
  assert.doesNotMatch(wireSrc, /method:\s*"(POST|PATCH|PUT|DELETE)"/i);
  assert.doesNotMatch(navSrc, /authenticatedFetch/);
  assert.doesNotMatch(navSrc, /method:\s*"(POST|PATCH|PUT|DELETE)"/i);
  assert.doesNotMatch(navSrc, /\/api\/inventory\/movements/);
});

test("recepción canónica Free to Sale y Proyecto sigue en Operación", () => {
  const inbound = inboundHtml();
  assert.match(inbound, /id="inboundAssignmentType"/);
  assert.match(inbound, /<option value="FREE_TO_SALE">Free to Sale<\/option>/);
  assert.match(inbound, /<option value="PROJECT">Proyecto<\/option>/);
  assert.match(js, /sku-selected-card/);
  assert.match(js, /function renderSkuContext\(/);
  assert.match(js, /function beginSkuChange\(/);
  assert.match(js, /✓ SKU seleccionado/);
  const submitSrc = sliceFunction(js, "submitOperationalMovement");
  assert.match(submitSrc, /assignmentType = inboundAssignmentType/);
  assert.match(submitSrc, /authenticatedFetch\("\/api\/inventory\/movements"/);
  assert.match(routes, /inventoryRouter\.post\("\/movements"/);
  assert.match(routes, /createMovementSchema\.parse\(req\.body\)/);
});

test("el schema Zod de IN acepta Free to Sale y Proyecto y rechaza asignación ausente", () => {
  const fts = createMovementSchema.safeParse({
    sku: "SKU-001",
    type: "IN",
    quantity: 1,
    location: "AN14-F",
    assignmentType: "FREE_TO_SALE",
    projectId: null
  });
  assert.equal(fts.success, true, fts.success ? "" : JSON.stringify(fts.error.issues));

  const project = createMovementSchema.safeParse({
    sku: "SKU-001",
    type: "IN",
    quantity: 1,
    location: "AN14-F",
    assignmentType: "PROJECT",
    projectId: "proj-1"
  });
  assert.equal(project.success, true, project.success ? "" : JSON.stringify(project.error.issues));

  const missing = createMovementSchema.safeParse({
    sku: "SKU-001",
    type: "IN",
    quantity: 1,
    location: "AN14-F"
  });
  assert.equal(missing.success, false);
  if (!missing.success) {
    assert.ok(
      missing.error.issues.some((issue) => issue.message === "La entrada requiere asignación PROJECT o FREE_TO_SALE.")
    );
  }
});

test("esta opción A no escribe inventario", () => {
  const thisFile = readFileSync(new URL(import.meta.url), "utf8");
  assert.doesNotMatch(thisFile, /prisma\.(inventory|inventoryLayer|inventoryMovement)\.(create|update|delete)/);
});
