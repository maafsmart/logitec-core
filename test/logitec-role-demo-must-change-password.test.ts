import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const html = readFileSync(new URL("../public/logitec-role-demo.html", import.meta.url), "utf8");
const js = readFileSync(new URL("../public/logitec-role-demo.js", import.meta.url), "utf8");
const css = readFileSync(new URL("../public/logitec-role-demo.css", import.meta.url), "utf8");
const sw = readFileSync(new URL("../public/logitec-role-demo-sw.js", import.meta.url), "utf8");

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

test("shell PWA v16.2.7 incluye gate cambio contraseña", () => {
  assert.match(sw, /logitec-demo-shell-v16\.2\.7/);
  assert.match(html, /logitec-role-demo\.js\?v=16\.2\.7/);
  assert.match(html, /id="mustChangePasswordBanner"/);
  assert.match(html, /Cambio de contraseña obligatorio|contraseña nueva antes de operar/);
});

test("mustChangePassword=true impide cargar inventario antes del cambio", () => {
  const bootFn = sliceFunction(js, "boot");
  const continueFn = sliceFunction(js, "continueBootAfterAuth");
  assert.match(continueFn, /sessionMustChangePassword\(\)/);
  assert.match(continueFn, /renderMustChangePasswordPanel\(\)/);
  assert.match(continueFn, /applyMustChangePasswordGate\(true\)/);
  assert.doesNotMatch(continueFn, /loadDbSource\(\)[\s\S]{0,80}sessionMustChangePassword/);
  const gateBranch = continueFn.slice(continueFn.indexOf("sessionMustChangePassword"));
  assert.doesNotMatch(gateBranch.slice(0, gateBranch.indexOf("applyMustChangePasswordGate(false)") >= 0 ? gateBranch.indexOf("applyMustChangePasswordGate(false)") : gateBranch.length), /loadDbSource\(\)/);
  assert.match(bootFn, /continueBootAfterAuth\(sessionUser\)/);
});

test("POST /api/auth/change-password permitido en guardFetch y Proxy", () => {
  assert.match(js, /function isSelfPasswordChangeWrite\(/);
  assert.match(js, /path === "\/api\/auth\/change-password"/);
  assert.match(sliceFunction(js, "isDemoWriteAllowed"), /isSelfPasswordChangeWrite\(url, method\)/);
  assert.match(sliceFunction(js, "guardFetch"), /isDemoWriteAllowed\(url, method\)/);
  assert.match(js, /window\.fetch = new Proxy\(fetch[\s\S]*isDemoWriteAllowed\(url, method\)/);
});

test("formulario exige confirmación y no persiste contraseñas", () => {
  assert.match(js, /id="pwaConfirmPassword"/);
  assert.match(sliceFunction(js, "submitMustChangePassword"), /newPassword !== confirmPassword/);
  assert.match(sliceFunction(js, "submitMustChangePassword"), /\/api\/auth\/change-password/);
  assert.match(sliceFunction(js, "submitMustChangePassword"), /clearMustChangePasswordFields\(\)/);
  assert.doesNotMatch(sliceFunction(js, "submitMustChangePassword"), /localStorage|sessionStorage/);
  assert.doesNotMatch(sliceFunction(js, "renderMustChangePasswordPanel"), /localStorage|sessionStorage/);
});

test("éxito retira gate y reanuda boot con inventario", () => {
  const resumeFn = sliceFunction(js, "resumeBootAfterPasswordChange");
  assert.match(resumeFn, /applyMustChangePasswordGate\(false\)/);
  assert.match(resumeFn, /loadDbSource\(\)/);
  assert.match(resumeFn, /render\(\)/);
  assert.match(sliceFunction(js, "submitMustChangePassword"), /resumeBootAfterPasswordChange\(\)/);
});

test("gate oculta navegación operativa y mantiene cerrar sesión", () => {
  assert.match(css, /body\.must-change-password #wmsSectionBar/);
  assert.match(css, /body\.must-change-password \.sidebar/);
  assert.doesNotMatch(css, /#logoutBtn[\s\S]*display:\s*none/);
  assert.match(html, /id="logoutBtn"[^>]*>Cerrar sesión</);
  assert.match(sliceFunction(js, "applyMustChangePasswordGate"), /must-change-password/);
});

test("mensajes del gate hablan de contraseña, no de Excel", () => {
  assert.match(sliceFunction(js, "renderMustChangePasswordPanel"), /Cambio de contraseña obligatorio/);
  assert.match(js, /Completa todos los campos de contraseña/);
  assert.match(js, /La nueva contraseña y la confirmación deben coincidir/);
  assert.match(js, /No se pudo actualizar la contraseña/);
  const gateBranch = js.match(/if \(sessionMustChangePassword\(\)\) \{[\s\S]*?renderMustChangePasswordPanel\(\);\s*return;/);
  assert.ok(gateBranch, "gate branch missing");
  assert.doesNotMatch(gateBranch[0], /Excel/);
});
