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

test("shell PWA v16.2.7", () => {
  assert.match(sw, /logitec-demo-shell-v16\.2\.7/);
  assert.match(html, /logitec-role-demo\.js\?v=16\.2\.7/);
  assert.match(html, /logitec-role-demo\.css\?v=16\.2\.7/);
});

test("CLIENT + EXCEL usa vista de valuación no disponible", () => {
  assert.match(js, /function clientExcelDemoSource\(/);
  assert.match(sliceFunction(js, "valuationView"), /clientExcelValuationUnavailableView\(\)/);
  const view = sliceFunction(js, "clientExcelValuationUnavailableView");
  assert.match(view, /Valuación no disponible en esta fuente demo/);
  assert.doesNotMatch(view, /fmtMxn\(totals\.totalValueMxn\)/);
  assert.match(view, /valuation-summary-unavailable/);
  assert.match(view, /valuation-money-value">—</);
  assert.match(view, /Piezas valuadas[\s\S]*kpi-value">—</);
  assert.match(view, /Cobertura económica/);
  assert.match(view, /valuation-unit">—</);
  assert.match(view, /valuation-total">—</);
});

test("drawer CLIENT + EXCEL no agrega campos monetarios engañosos", () => {
  const openStock = sliceFunction(js, "openStockDetail");
  assert.match(openStock, /!clientExcelDemoSource\(\)/);
});

test("Movimientos EXCEL conserva aviso sin historial", () => {
  assert.match(sliceFunction(js, "clientMovementsView"), /La fuente Excel no contiene historial de movimientos/);
});

test("gate contraseña y logout permanecen cableados", () => {
  assert.match(html, /id="mustChangePasswordBanner"/);
  assert.match(html, /id="logoutBtn"[^>]*>Cerrar sesión</);
  assert.match(sliceFunction(js, "wireAppShellActions"), /logoutBtn\?\.addEventListener\("click", forceLogout\)/);
  assert.match(js, /function submitMustChangePassword\(/);
});

test("CSS marca KPIs de valuación no disponible", () => {
  assert.match(css, /\.valuation-summary-unavailable/);
});
