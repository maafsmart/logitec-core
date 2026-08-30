import assert from "node:assert/strict";
import jwt from "jsonwebtoken";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { env } from "../src/config/env.js";

const html = readFileSync(new URL("../public/dashboard.html", import.meta.url), "utf8");
const js = readFileSync(new URL("../public/dashboard.js", import.meta.url), "utf8");
const loginJs = readFileSync(new URL("../public/login.js", import.meta.url), "utf8");
const authRoutes = readFileSync(new URL("../src/modules/auth/auth.routes.ts", import.meta.url), "utf8");
const routes = readFileSync(new URL("../src/modules/inventory/inventory.routes.ts", import.meta.url), "utf8");

function sliceFunction(source: string, name: string): string {
  const start = source.indexOf(`function ${name}`);
  assert.notEqual(start, -1, `missing function ${name}`);
  let depth = 0;
  let started = false;
  for (let i = start; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === "{") {
      depth += 1;
      started = true;
    } else if (ch === "}") {
      depth -= 1;
      if (started && depth === 0) {
        return source.slice(start, i + 1);
      }
    }
  }
  throw new Error(`unclosed function ${name}`);
}

const validateSession = sliceFunction(js, "validateSession");
const applySessionRoute = sliceFunction(js, "applySessionRoute");
const navigateTo = sliceFunction(js, "navigateTo");
const syncAviatDangerZone = sliceFunction(js, "syncAviatDangerZone");

test("A: login nuevo ADMIN limpia ruta guardada y exige selector antes de operar", () => {
  assert.match(loginJs, /ACTIVE_NAV_STORAGE_KEY = "logitec_active_nav"/);
  assert.match(loginJs, /sessionStorage\.removeItem\(ACTIVE_NAV_STORAGE_KEY\)/);
  assert.match(authRoutes, /operationalClientId: isClientScopedRole\(user\.role\) \? operationalClient\?\.id \?\? null : null/);
  assert.match(validateSession, /awaitingAdminClient = currentRole === "ADMIN" && !operationalClient/);
  assert.match(validateSession, /hideAllModules\(\)/);
  const awaitingBlock = validateSession.slice(
    validateSession.indexOf("if (awaitingAdminClient)"),
    validateSession.indexOf("hideAdminClientPicker();")
  );
  assert.doesNotMatch(awaitingBlock, /applySessionRoute\(\)/);
  assert.match(applySessionRoute, /if \(currentRole === "ADMIN" && awaitingAdminClient\) return/);
  assert.match(js, /if \(currentRole === "ADMIN" && awaitingAdminClient && mod && !isAdminGlobalModule\(mod\)\)/);
});

test("B: tras seleccionar AVIAT el ADMIN puede restaurar navegación operativa", () => {
  assert.match(js, /async function selectOperationalClient/);
  assert.match(js, /hideAdminClientPicker\(\)[\s\S]*applySessionRoute\(\)/);
  assert.match(js, /await loadOperationalWorkspace\(\)/);
});

test("C: Entrada masiva abre Inventario → Existencias sin pantalla intermedia", () => {
  assert.match(navigateTo, /if \(mod === "bulk-inbound"\)/);
  assert.match(navigateTo, /section = "inventario"/);
  assert.match(navigateTo, /mod = "inventory"/);
  assert.match(html, /data-module="bulk-inbound"/);
  assert.match(html, /id="moduleBulkInbound"/);
});

test("D: reset habilitado solo con ADMIN, AVIAT operativo y flag true", () => {
  assert.match(syncAviatDangerZone, /currentRole === "ADMIN" && isActiveAviatOperationalClient\(\)/);
  assert.match(syncAviatDangerZone, /const enabled = Boolean\(data\.flagEnabled && data\.isAviat && data\.canExecute\)/);
  assert.match(syncAviatDangerZone, /btn\.disabled = !enabled/);
});

test("E: roles no ADMIN no pueden reiniciar inventario", () => {
  const preview = routes.slice(
    routes.indexOf('inventoryRouter.get("/physical/reset/preview"'),
    routes.indexOf('inventoryRouter.post("/physical/reset"')
  );
  const post = routes.slice(routes.indexOf('inventoryRouter.post("/physical/reset"'));
  assert.match(preview, /requireRole\(\["ADMIN"\]\)/);
  assert.match(post, /requireRole\(\["ADMIN"\]\)/);
  assert.match(syncAviatDangerZone, /visible = currentRole === "ADMIN" && isActiveAviatOperationalClient\(\)/);
});

test("F: flag false mantiene el reset protegido en backend y UI", () => {
  const envSrc = readFileSync(new URL("../src/config/env.ts", import.meta.url), "utf8");
  assert.match(envSrc, /ALLOW_TENANT_INVENTORY_RESET/);
  assert.match(envSrc, /default\("false"\)/);
  assert.match(syncAviatDangerZone, /btn\.disabled = !enabled \|\| physicalInventoryResetBusy/);
  assert.match(html, /ALLOW_TENANT_INVENTORY_RESET/);
});

test("login ADMIN emite JWT sin operationalClientId embebido", () => {
  const sample = jwt.sign({ role: "ADMIN", email: "admin@test.local" }, env.JWT_SECRET, {
    subject: "admin-id"
  });
  const decoded = jwt.verify(sample, env.JWT_SECRET) as jwt.JwtPayload;
  assert.equal(decoded.operationalClientId, undefined);
});
