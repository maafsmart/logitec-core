import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const html = readFileSync(new URL("../public/logitec-role-demo.html", import.meta.url), "utf8");
const js = readFileSync(new URL("../public/logitec-role-demo.js", import.meta.url), "utf8");
const css = readFileSync(new URL("../public/logitec-role-demo.css", import.meta.url), "utf8");

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

test("badge demo refleja inventario read-only, no toda la app", () => {
  assert.match(html, /DEMO · INVENTARIO SOLO LECTURA/);
  assert.doesNotMatch(html, /DEMO · SOLO LECTURA/);
});

test("/api/auth/me integrado en bootstrap", () => {
  assert.match(js, /async function loadSessionUser\(\)/);
  assert.match(sliceFunction(js, "boot"), /loadSessionUser\(\)/);
  assert.match(js, /function applySessionFromMe\(/);
  assert.match(js, /state\.sessionUser = user/);
});

test("rol real separado de vista Director", () => {
  assert.match(js, /function realSessionRole\(\)/);
  assert.match(js, /function isRealAdmin\(\)/);
  assert.match(sliceFunction(js, "sessionRoleLabel"), /realSessionRole\(\)/);
  assert.match(js, /function applyDirectorView\(role\)/);
});

test("ADMIN real ve módulo usuarios y accesos", () => {
  assert.match(js, /function renderUsersModule\(/);
  assert.match(sliceFunction(js, "renderUsersModule"), /isRealAdmin\(\)/);
  assert.match(js, /Usuarios y accesos/);
  assert.match(sliceFunction(js, "renderModule"), /if \(m === "users"\) return renderUsersModule\(\)/);
});

test("configuración segura abre usuarios y accesos", () => {
  assert.match(sliceFunction(js, "renderConfigModule"), /data-open-users-module/);
  assert.match(sliceFunction(js, "renderConfigModule"), /isRealAdmin\(\)/);
  assert.doesNotMatch(sliceFunction(js, "renderConfigModule"), /lab-reset|physical\/reset|aviatDangerZone/i);
});

test("alta edición activar desactivar y reset password usan API users", () => {
  assert.match(sliceFunction(js, "submitCreateUser"), /apiFetch\("\/api\/users"/);
  assert.match(sliceFunction(js, "submitEditUser"), /method: "PATCH"/);
  assert.match(sliceFunction(js, "submitDeactivateUser"), /method: "DELETE"/);
  assert.match(sliceFunction(js, "submitReactivateUser"), /isActive: true/);
  assert.match(sliceFunction(js, "submitResetUserPassword"), /\/reset-password/);
});

test("selector de clientes usa GET /api/clients", () => {
  assert.match(sliceFunction(js, "ensureClientsCache"), /apiGet\("\/api\/clients"\)/);
  assert.match(js, /function renderClientSelectOptions\(/);
});

test("write guard permite /api/users para ADMIN real y change-password propio", () => {
  assert.match(js, /function isUsersAdminWrite\(/);
  assert.match(js, /function isSelfPasswordChangeWrite\(/);
  assert.match(js, /function isDemoWriteAllowed\(/);
  assert.match(js, /path === "\/api\/users" \|\| path\.startsWith\("\/api\/users\/"\)/);
  assert.match(sliceFunction(js, "isUsersAdminWrite"), /!isRealAdmin\(\)/);
  assert.match(sliceFunction(js, "guardFetch"), /isDemoWriteAllowed\(url, method\)/);
  assert.match(js, /window\.fetch = new Proxy\(fetch/);
});

test("inventario y otras escrituras siguen bloqueadas", () => {
  assert.match(js, /Demo read-only: \$\{method\} bloqueado/);
  assert.match(js, /return Promise\.reject\(new Error\("Demo read-only"\)\)/);
});

test("drawer y modal temporal reutilizados", () => {
  assert.match(html, /id="gridDetailDrawer"/);
  assert.match(html, /id="userTempPasswordModal"/);
  assert.match(js, /function openUserFormDrawer\(/);
  assert.match(js, /function openUserTempPasswordModal\(/);
  assert.match(js, /COPIAR/);
  assert.match(css, /\.user-access-card/);
  assert.match(css, /\.user-temp-password-modal/);
});

test("roles distintos de ADMIN no incluyen users en NAV", () => {
  const navStart = js.indexOf("const NAV =");
  for (const role of ["SUPERVISOR", "OPERATOR", "CLIENT"]) {
    const roleStart = js.indexOf(`${role}:`, navStart);
    const nextRole = ["SUPERVISOR", "OPERATOR", "CLIENT", "ADMIN"].find((r) => js.indexOf(`${r}:`, roleStart + 1) > roleStart);
    const end = nextRole ? js.indexOf(`${nextRole}:`, roleStart + 1) : js.indexOf("const state", roleStart);
    const slice = js.slice(roleStart, end);
    assert.doesNotMatch(slice, /id: "users"/, `${role} must not expose users nav`);
  }
});

test("Director visual no otorga ADMIN real", () => {
  assert.match(js, /function isRealAdmin\(\)[\s\S]{0,120}realSessionRole\(\) === "ADMIN"/);
  assert.match(sliceFunction(js, "renderUsersModule"), /isRealAdmin\(\)/);
});

test("closeUserTempPasswordModal oculta modal y borra valor sensible del DOM", () => {
  const closeFn = sliceFunction(js, "closeUserTempPasswordModal");
  assert.match(closeFn, /modal\.hidden = true/);
  assert.match(closeFn, /setAttribute\("hidden"/);
  assert.match(closeFn, /classList\.add\("hidden"\)/);
  assert.match(closeFn, /valueEl\) valueEl\.textContent = ""/);
  assert.match(closeFn, /resetUserTempPasswordCopyFeedback/);
  assert.match(sliceFunction(js, "boot"), /closeUserTempPasswordModal\(\)/);
});

test("copy temporal usa clipboard con fallback execCommand sin persistencia", () => {
  const copyFn = sliceFunction(js, "copyTextWithFallback");
  assert.match(copyFn, /navigator\.clipboard\.writeText/);
  assert.match(copyFn, /document\.execCommand\("copy"\)/);
  assert.doesNotMatch(copyFn, /localStorage|sessionStorage|console\.(log|info|debug)/);
  assert.doesNotMatch(sliceFunction(js, "openUserTempPasswordModal"), /window\.prompt/);
  assert.match(js, /USER_TEMP_PASSWORD_COPY_OK = "COPIADO"/);
  assert.match(js, /USER_TEMP_PASSWORD_COPY_FAIL = "COPIA NO DISPONIBLE"/);
  assert.match(sliceFunction(js, "showUserTempPasswordCopyFeedback"), /USER_TEMP_PASSWORD_COPY_OK/);
  assert.match(sliceFunction(js, "showUserTempPasswordCopyFeedback"), /USER_TEMP_PASSWORD_COPY_FAIL/);
});

test("modal temporal apila sheet sobre backdrop y permite clics", () => {
  assert.match(html, /id="userTempPasswordCopyFeedback"/);
  assert.match(css, /\.user-temp-password-modal\[hidden\]/);
  assert.match(css, /\.user-temp-password-modal\.hidden/);
  assert.match(css, /\.user-temp-password-backdrop[\s\S]*z-index:\s*0/);
  assert.match(css, /\.user-temp-password-sheet[\s\S]*z-index:\s*1/);
  assert.match(css, /pointer-events:\s*auto/);
  assert.match(sliceFunction(js, "unwireUserTempPasswordCloseHandlers"), /removeEventListener/);
  assert.match(sliceFunction(js, "wireUserTempPasswordCloseHandlers"), /unwireUserTempPasswordCloseHandlers\(\)/);
  assert.doesNotMatch(sliceFunction(js, "wireUserTempPasswordCloseHandlers"), /tempPasswordWired/);
  assert.match(sliceFunction(js, "wireDetailDrawer"), /isUserTempPasswordModalOpen\(\)/);
});

test("shell PWA v16.2.7 invalida cache anterior", () => {
  const sw = readFileSync(new URL("../public/logitec-role-demo-sw.js", import.meta.url), "utf8");
  assert.match(sw, /logitec-demo-shell-v16\.2\.7/);
  assert.match(html, /logitec-role-demo\.js\?v=16\.2\.7/);
});

test("cerrar sesión visible y cableado en shell PWA", () => {
  assert.match(html, /id="logoutBtn"[^>]*>Cerrar sesión</);
  assert.match(sliceFunction(js, "forceLogout"), /localStorage\.removeItem\("token"\)/);
  assert.match(sliceFunction(js, "forceLogout"), /window\.location\.replace\("\/login\.html\?next="/);
  assert.match(sliceFunction(js, "forceLogout"), /encodeURIComponent\("\/logitec-role-demo\.html"\)/);
  assert.match(sliceFunction(js, "forceLogout"), /stopDemoCamera/);
  assert.match(sliceFunction(js, "forceLogout"), /closeUserTempPasswordModal/);
  assert.match(sliceFunction(js, "forceLogout"), /closeDetailDrawer/);
  assert.match(sliceFunction(js, "wireAppShellActions"), /logoutBtn\?\.addEventListener\("click", forceLogout\)/);
  assert.doesNotMatch(css, /#logoutBtn[\s\S]*display:\s*none/);
});
