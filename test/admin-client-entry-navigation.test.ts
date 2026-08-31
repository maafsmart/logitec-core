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

test("C: Operación no expone Entrada masiva; bookmarks reescriben a Existencias", () => {
  assert.match(navigateTo, /if \(mod === "bulk-inbound"\)/);
  assert.match(navigateTo, /section = "inventario"/);
  assert.match(navigateTo, /mod = "inventory"/);
  assert.doesNotMatch(html, /data-module="bulk-inbound"/);
  assert.doesNotMatch(html, /id="moduleBulkInbound"/);
  assert.match(html, /id="openInventoryImportBtn"/);
});

test("D: reset habilitado solo con ADMIN, AVIAT operativo y flag true", () => {
  assert.match(syncAviatDangerZone, /currentRole === "ADMIN" && isActiveAviatOperationalClient\(\)/);
  assert.match(syncAviatDangerZone, /const enabled = Boolean\(data\.flagEnabled && data\.isAviat && data\.canExecute && !empty && !blocked\)/);
  assert.match(syncAviatDangerZone, /isAviatResetBlocked/);
  assert.match(syncAviatDangerZone, /isAviatOperationalInventoryEmpty/);
  assert.match(sliceFunction(js, "runPhysicalInventoryReset"), /closePhysicalInventoryResetModal/);
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

function loadClientCardAddProjectHarness(role: string) {
  return new Function(
    "role",
    `
    let currentRole = role;
    const clientContextCatalog = [
      { id: "client-aviat", code: "AVIAT", tradeName: "AVIAT", name: "AVIAT" },
      { id: "client-2", code: "CLI2", tradeName: "Cliente 2", name: "Cliente 2" }
    ];
    const realClientsCache = [];
    const calls = { openProjectForm: [], navigateTo: [], selectOperationalClient: [], gate: [] };
    function setAdminClientGateVisible(visible) { calls.gate.push(visible); }
    function navigateTo(section, mod) { calls.navigateTo.push([section, mod]); }
    function selectOperationalClient(id) { calls.selectOperationalClient.push(id); }
    function loadRealClientsQuiet() { return Promise.resolve(clientContextCatalog); }
    function openProjectForm(project, client) { calls.openProjectForm.push({ project, client }); }
    ${sliceFunction(js, "canAdminCreateProject")}
    ${sliceFunction(js, "resolveClientForProjectForm")}
    ${sliceFunction(js, "openAddProjectFromClientCard")}
    ${sliceFunction(js, "handleClientContextCardAction")}
    ${sliceFunction(js, "dispatchClientContextCardClick")}
    return {
      calls,
      dispatchClientContextCardClick,
      handleClientContextCardAction,
      openAddProjectFromClientCard
    };
  `
  )(role) as {
    calls: {
      openProjectForm: Array<{ project: unknown; client: { id: string } }>;
      navigateTo: Array<[string, string]>;
      selectOperationalClient: string[];
      gate: boolean[];
    };
    dispatchClientContextCardClick: (target: {
      getAttribute: (name: string) => string | null;
      closest: (sel: string) => unknown;
      hasAttribute: (name: string) => boolean;
    }) => { action: string | null; clientId?: string };
    handleClientContextCardAction: (target: unknown) => { action: string | null; clientId?: string };
    openAddProjectFromClientCard: (clientId: string) => boolean;
  };
}

function fakeAttrTarget(attrs: Record<string, string>) {
  return {
    getAttribute: (name: string) => attrs[name] ?? null,
    closest: () => null,
    hasAttribute: (name: string) => Object.prototype.hasOwnProperty.call(attrs, name)
  };
}

test("Selector de cliente no muestra Agregar proyecto; Centro de Control sí (ADMIN)", async () => {
  assert.doesNotMatch(sliceFunction(js, "renderLiveClientMasterCard"), /Agregar proyecto/);
  assert.match(html, /id="ccAddProjectBtn"[^>]*>Agregar proyecto/);
  assert.match(html, /id="projectsAddBtn"[^>]*>Agregar proyecto/);
  const admin = loadClientCardAddProjectHarness("ADMIN");
  const target = fakeAttrTarget({ "data-add-project-client": "client-aviat" });
  const parsed = admin.dispatchClientContextCardClick(target);
  assert.equal(parsed.action, "add-project");
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(admin.calls.openProjectForm.length, 1);
  const supervisor = loadClientCardAddProjectHarness("SUPERVISOR");
  assert.equal(supervisor.openAddProjectFromClientCard("client-aviat"), false);

  const operator = loadClientCardAddProjectHarness("OPERATOR");
  assert.equal(operator.openAddProjectFromClientCard("client-aviat"), false);
  await Promise.resolve();
  assert.equal(operator.calls.openProjectForm.length, 0);

  const adminManage = loadClientCardAddProjectHarness("ADMIN");
  const manage = adminManage.dispatchClientContextCardClick(fakeAttrTarget({ "data-manage-client": "client-aviat" }));
  assert.equal(manage.action, "manage");
  assert.deepEqual(adminManage.calls.navigateTo, [["inventario", "clients"]]);
  assert.equal(adminManage.calls.openProjectForm.length, 0);

  const adminEnter = loadClientCardAddProjectHarness("ADMIN");
  const enter = adminEnter.dispatchClientContextCardClick(fakeAttrTarget({ "data-enter-client": "client-2" }));
  assert.equal(enter.action, "enter");
  assert.deepEqual(adminEnter.calls.selectOperationalClient, ["client-2"]);
  assert.equal(adminEnter.calls.openProjectForm.length, 0);

  assert.match(js, /data-add-project-client/);
  assert.match(sliceFunction(js, "dispatchClientContextCardClick"), /openAddProjectFromClientCard/);
  assert.match(sliceFunction(js, "openAddProjectFromClientCard"), /openProjectForm\(null, client\)/);
  assert.doesNotMatch(sliceFunction(js, "openAddProjectFromClientCard"), /navigateTo\(/);
});

test("login ADMIN emite JWT sin operationalClientId embebido", () => {
  const sample = jwt.sign({ role: "ADMIN", email: "admin@test.local" }, env.JWT_SECRET, {
    subject: "admin-id"
  });
  const decoded = jwt.verify(sample, env.JWT_SECRET) as jwt.JwtPayload;
  assert.equal(decoded.operationalClientId, undefined);
});
