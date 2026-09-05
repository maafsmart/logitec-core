import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const html = readFileSync(new URL("../public/logitec-role-demo.html", import.meta.url), "utf8");
const js = readFileSync(new URL("../public/logitec-role-demo.js", import.meta.url), "utf8");
const policies = readFileSync(new URL("../docs/POLITICAS_SISTEMA_LOGITEC_CORE_WMS.md", import.meta.url), "utf8");

test("cache-buster v=15.3", () => {
  assert.match(html, /logitec-role-demo\.js\?v=16.1.3/);
});

test("POL-003 registrada como APROBADA", () => {
  assert.match(policies, /## POL-003 · Escáner transversal y autoridad por rol/);
  assert.match(policies, /\*\*Estado:\*\* APROBADA/);
  assert.match(policies, /Autovalidación de Supervisor/);
});

test("un solo motor scanner reutilizado", () => {
  assert.match(js, /function renderScannerWorkspace\(/);
  assert.match(js, /function wireScannerInput\(/);
  assert.match(js, /function classifyScanCodeLocal\(/);
  assert.match(js, /function roleFreeScanView\(/);
  assert.doesNotMatch(js, /function operatorFreeScanView\(/);
  assert.doesNotMatch(js, /function adminScannerEngine\(/);
});

test("Supervisor centro operacion expone ESCANEO LIBRE directo", () => {
  assert.match(js, /function supervisorOperationCenter\([\s\S]*data-start-free-scan>ESCANEO LIBRE/);
});

test("Admin centro control expone scanner consulta y captura física", () => {
  assert.match(js, /function controlCenter\([\s\S]*data-start-free-scan>ESCANEO LIBRE/);
  assert.match(js, /ESCÁNER LIBRE · CONSULTA ADMINISTRATIVA · READ-ONLY/);
  assert.match(js, /function renderFreeScanActionsPanel\(session, ctx\) \{[\s\S]*ctx === "admin"/);
  assert.match(js, /GUARDAR PENDIENTE/);
});

test("Supervisor validar ahora registra autovalidacion", () => {
  assert.match(js, /function validateProvisionalCaptureNow\(/);
  assert.match(js, /Autovalidación de Supervisor/);
  assert.match(js, /data-validate-provisional-now/);
  assert.match(js, /ENVIAR A PENDIENTES/);
});

test("Cliente sin scanner", () => {
  const clientBlock = js.slice(js.indexOf("CLIENT:"), js.indexOf("const state = {"));
  assert.doesNotMatch(clientBlock, /ESCANEO LIBRE/);
});
