import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const html = readFileSync(new URL("../public/dashboard.html", import.meta.url), "utf8");
const js = readFileSync(new URL("../public/dashboard.js", import.meta.url), "utf8");

function sliceFunction(source: string, name: string): string {
  const token = `function ${name}(`;
  const start = source.indexOf(token);
  assert.ok(start >= 0, `missing function ${name}`);
  const brace = source.indexOf("{", start);
  assert.ok(brace >= 0, `missing body for ${name}`);
  let depth = 0;
  for (let i = brace; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === "{") depth += 1;
    else if (ch === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  throw new Error(`unclosed function ${name}`);
}

const persistSrc = sliceFunction(js, "persistNavRoute");
const readSrc = sliceFunction(js, "readStoredNavRoute");
const clearSrc = sliceFunction(js, "clearStoredNavRoute");
const resolveSrc = sliceFunction(js, "resolveStoredNavRoute");
const isSafeSrc = sliceFunction(js, "isSafeNavToken");
const applyDefaultSrc = sliceFunction(js, "applyDefaultLandingRoute");
const applySessionSrc = sliceFunction(js, "applySessionRoute");
const forceLogoutSrc = sliceFunction(js, "forceLogout");
const validateSessionSrc = sliceFunction(js, "validateSession");
const navigateToSrc = sliceFunction(js, "navigateTo");

function makeRuntime(opts: {
  role?: string;
  userSelected?: boolean;
  pending?: { section: string | null; module: string | null } | null;
  currentModuleName?: string | null;
  hashOpens?: boolean;
} = {}) {
  const store: Record<string, string> = {};
  const sessionStorage = {
    getItem(key: string) {
      return Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null;
    },
    setItem(key: string, value: string) {
      store[key] = String(value);
    },
    removeItem(key: string) {
      delete store[key];
    }
  };
  const role = opts.role || "ADMIN";
  const pendingJson = JSON.stringify(opts.pending ?? null);
  const body = `
    const ACTIVE_NAV_STORAGE_KEY = "logitec_active_nav";
    const NAV_SECTION_MODULES = {
      inicio: ["control", "tasks", "picking", "incidents"],
      operacion: ["inbound", "bulk-inbound", "requisitions", "picking", "relocate", "outbound"],
      inventario: ["inventory", "clients", "catalog", "projects", "warehouses", "locations"],
      control: ["incidents", "traceability", "reports"],
      sistema: ["users", "config", "account"]
    };
    const NAV_SECTION_DEFAULTS = {
      inicio: "control",
      operacion: "inbound",
      inventario: "inventory",
      control: "incidents",
      sistema: "users"
    };
    const roleModules = {
      ADMIN: ["control", "tasks", "picking", "inbound", "bulk-inbound", "relocate", "requisitions", "outbound", "incidents", "inventory", "catalog", "projects", "warehouses", "locations", "clients", "traceability", "reports", "users", "config", "account"],
      CLIENT: ["inventory", "catalog", "projects", "warehouses", "locations", "requisitions", "traceability", "reports", "account"]
    };
    const defaultLandingModule = { ADMIN: "control", SUPERVISOR: "control", OPERATOR: "tasks", CLIENT: "inventory" };
    let currentRole = ${JSON.stringify(role)};
    let awaitingAdminClient = false;
    let currentModuleName = ${JSON.stringify(opts.currentModuleName ?? null)};
    let userSelectedNavDuringBoot = ${opts.userSelected ? "true" : "false"};
    let pendingUserNav = ${pendingJson};
    const navigations = [];
    function navigateTo(section, module) {
      navigations.push({ section, module: module || null });
      if (module) currentModuleName = module;
    }
    function resolveSectionForModule(moduleName, preferredSection) {
      if (preferredSection && (NAV_SECTION_MODULES[preferredSection] || []).includes(moduleName)) {
        return preferredSection;
      }
      for (const [section, modules] of Object.entries(NAV_SECTION_MODULES)) {
        if (modules.includes(moduleName)) return section;
      }
      return preferredSection || "inicio";
    }
    function applyModuleDeepLinkFromHash() { return ${opts.hashOpens ? "true" : "false"}; }
    ${isSafeSrc}
    ${clearSrc}
    ${persistSrc}
    ${readSrc}
    ${resolveSrc}
    ${applyDefaultSrc}
    ${applySessionSrc}
    return {
      persistNavRoute,
      readStoredNavRoute,
      clearStoredNavRoute,
      resolveStoredNavRoute,
      applySessionRoute,
      navigations,
      getStored() { return sessionStorage.getItem(ACTIVE_NAV_STORAGE_KEY); }
    };
  `;
  return new Function("sessionStorage", body)(sessionStorage);
}

test("F5 restaura Operación → Reubicación", () => {
  const rt = makeRuntime({ role: "ADMIN" });
  rt.persistNavRoute("operacion", "relocate");
  assert.equal(rt.resolveStoredNavRoute("ADMIN").section, "operacion");
  assert.equal(rt.resolveStoredNavRoute("ADMIN").module, "relocate");
  rt.applySessionRoute();
  assert.deepEqual(rt.navigations, [{ section: "operacion", module: "relocate" }]);
  assert.match(html, /Movimiento interno \/ Reubicación/);
  assert.match(html, /data-module="relocate"/);
});

test("F5 restaura Inventario → Existencias", () => {
  const rt = makeRuntime({ role: "ADMIN" });
  rt.persistNavRoute("inventario", "inventory");
  assert.equal(rt.resolveStoredNavRoute("ADMIN").module, "inventory");
  rt.applySessionRoute();
  assert.deepEqual(rt.navigations, [{ section: "inventario", module: "inventory" }]);
  assert.match(html, />Existencias</);
  assert.match(navigateToSrc, /persistNavRoute\(section, mod\)/);
});

test("una selección durante una inicialización lenta no es reemplazada por Inicio", () => {
  const applyIdx = validateSessionSrc.indexOf("applySessionRoute()");
  const workspaceIdx = validateSessionSrc.indexOf("loadOperationalWorkspace");
  assert.ok(applyIdx >= 0 && workspaceIdx > applyIdx, "applySessionRoute must run before data load");
  assert.match(js, /async function loadOperationalWorkspace/);
  assert.match(js, /loadCatalogData/);
  assert.match(js, /loadStockStrip/);
  assert.match(js, /noteUserNavChoice\(section, mod\)/);
  const rt = makeRuntime({
    role: "ADMIN",
    userSelected: true,
    pending: { section: "operacion", module: "relocate" }
  });
  rt.persistNavRoute("inicio", "control");
  rt.applySessionRoute();
  assert.deepEqual(rt.navigations, [{ section: "operacion", module: "relocate" }]);
  assert.notEqual(rt.navigations[0].section, "inicio");
});

test("sin ruta guardada, abre Inicio", () => {
  const rt = makeRuntime({ role: "ADMIN" });
  assert.equal(rt.readStoredNavRoute(), null);
  rt.applySessionRoute();
  assert.deepEqual(rt.navigations, [{ section: "inicio", module: "control" }]);
});

test("una ruta inválida o no autorizada abre la pantalla permitida", () => {
  const invalid = makeRuntime({ role: "ADMIN" });
  invalid.persistNavRoute("no-existe", "relocate");
  assert.equal(invalid.resolveStoredNavRoute("ADMIN"), null);
  invalid.applySessionRoute();
  assert.deepEqual(invalid.navigations, [{ section: "inicio", module: "control" }]);

  const forbidden = makeRuntime({ role: "CLIENT" });
  forbidden.persistNavRoute("operacion", "relocate");
  assert.equal(forbidden.resolveStoredNavRoute("CLIENT"), null);
  forbidden.applySessionRoute();
  assert.deepEqual(forbidden.navigations, [{ section: "inventario", module: "inventory" }]);
});

test("cerrar sesión elimina la ruta guardada", () => {
  const rt = makeRuntime({ role: "ADMIN" });
  rt.persistNavRoute("inventario", "inventory");
  assert.ok(rt.getStored());
  rt.clearStoredNavRoute();
  assert.equal(rt.getStored(), null);
  assert.equal(rt.readStoredNavRoute(), null);
  assert.match(forceLogoutSrc, /clearStoredNavRoute\(\)/);
  assert.ok(forceLogoutSrc.indexOf("clearStoredNavRoute") < forceLogoutSrc.indexOf('removeItem("token")'));
});

test("la corrección no realiza escrituras de inventario", () => {
  const navBlock = [persistSrc, applySessionSrc, applyDefaultSrc, forceLogoutSrc, validateSessionSrc].join("\n");
  assert.doesNotMatch(navBlock, /method:\s*"(POST|PATCH|PUT|DELETE)"/i);
  assert.doesNotMatch(persistSrc, /\/api\/inventory/);
  assert.doesNotMatch(applySessionSrc, /\/api\/inventory/);
  assert.doesNotMatch(forceLogoutSrc, /\/api\//);
  assert.match(html, /dashboard\.js\?v=92/);
  assert.doesNotMatch(html, /dashboard\.js\?v=66/);
  assert.doesNotMatch(html, /dashboard\.js\?v=65/);
  assert.doesNotMatch(html, /dashboard\.js\?v=64/);
  assert.doesNotMatch(html, /dashboard\.js\?v=62/);
  assert.match(js, /sessionStorage\.setItem\(ACTIVE_NAV_STORAGE_KEY/);
  assert.doesNotMatch(persistSrc, /token|password|email/);
});
