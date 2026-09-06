import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const appHtml = readFileSync(new URL("../public/app.html", import.meta.url), "utf8");
const appManifest = readFileSync(new URL("../public/app.webmanifest", import.meta.url), "utf8");
const appSw = readFileSync(new URL("../public/app-sw.js", import.meta.url), "utf8");
const demoManifest = readFileSync(new URL("../public/manifest.webmanifest", import.meta.url), "utf8");
const demoSw = readFileSync(new URL("../public/logitec-role-demo-sw.js", import.meta.url), "utf8");
const dashboardHtml = readFileSync(new URL("../public/dashboard.html", import.meta.url), "utf8");
const loginJs = readFileSync(new URL("../public/login.js", import.meta.url), "utf8");
const demoJs = readFileSync(new URL("../public/logitec-role-demo.js", import.meta.url), "utf8");
const previewSrc = readFileSync(
  new URL("../src/modules/demo/logitec-simple-preview.feature.ts", import.meta.url),
  "utf8"
);
const appSrc = readFileSync(new URL("../src/app.ts", import.meta.url), "utf8");

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

test("/app.html expone la interfaz V16 oficial sin banners demo visibles", () => {
  assert.match(appHtml, /data-interface-mode="official"/);
  assert.match(appHtml, /logitec-role-demo\.js\?v=16\.2\.7/);
  assert.match(appHtml, /logitec-role-demo\.css\?v=16\.2\.7/);
  assert.match(appHtml, /class="demo-env-banner hidden"[^>]*hidden/);
  assert.match(appHtml, /id="demoEnvBadge"[^>]*hidden/);
  assert.match(appHtml, /id="dataSourceBadge"[^>]*hidden/);
});

test("login allowlist incluye /app.html y conserva dashboard como fallback", () => {
  const resolvePostLoginPath = new Function(
    `${sliceFunction(loginJs, "isSafeInternalPostLoginPath")}\n${sliceFunction(loginJs, "resolvePostLoginPath")}\nreturn resolvePostLoginPath;`
  )();
  assert.equal(resolvePostLoginPath("?next=%2Fapp.html"), "/app.html");
  assert.equal(resolvePostLoginPath(""), "/dashboard.html");
  assert.match(loginJs, /"\/app\.html"/);
});

test("/app.html usa BD real y no depende de Excel preview", () => {
  assert.match(demoJs, /const OFFICIAL_APP/);
  assert.match(demoJs, /async function loadOperationalSources\(\)/);
  assert.match(demoJs, /if \(OFFICIAL_APP\) \{\s*if \(!\(await loadDbSource\(\)\)\)/);
  assert.match(demoJs, /async function loadExcelSource\(\) \{\s*if \(OFFICIAL_APP\) return false;/);
  assert.match(demoJs, /if \(OFFICIAL_APP\) \{\s*applyOfficialAppChrome\(\)/);
  assert.match(demoJs, /dataSourceFooter\.textContent = "Fuente: BD operativa"/);
});

test("demo Excel sigue bloqueado cuando NODE_ENV=production", () => {
  assert.match(previewSrc, /return env\.NODE_ENV !== "production" && env\.ENABLE_LOGITEC_SIMPLE_PREVIEW === "true"/);
});

test("/app.html queda servido por static en cualquier NODE_ENV", () => {
  assert.match(appSrc, /express\.static\(publicDir\)/);
  assert.match(appHtml, /data-interface-mode="official"/);
});

test("cámara V16 conserva getUserMedia y BarcodeDetector nativo / fallback WASM", () => {
  assert.match(demoJs, /getUserMedia/);
  assert.match(demoJs, /BarcodeDetector/);
  assert.match(demoJs, /barcode-detector/);
});

test("/dashboard.html permanece intacto como rollback", () => {
  assert.match(dashboardHtml, /dashboard\.js/);
  assert.doesNotMatch(dashboardHtml, /\/app\.html/);
});

test("PWA oficial /app.html usa manifest y SW separados del demo", () => {
  const parsed = JSON.parse(appManifest) as { id: string; start_url: string };
  assert.equal(parsed.start_url, "/app.html");
  assert.equal(parsed.id, "/logitec-core-wms-app");
  assert.match(appHtml, /rel="manifest" href="\/app\.webmanifest"/);
  assert.doesNotMatch(appHtml, /manifest\.webmanifest/);
  assert.match(demoJs, /OFFICIAL_APP \? "\/app-sw\.js" : "\/logitec-role-demo-sw\.js"/);
});

test("manifest demo conserva start_url logitec-role-demo.html", () => {
  const parsed = JSON.parse(demoManifest) as { id: string; start_url: string };
  assert.equal(parsed.start_url, "/logitec-role-demo.html");
  assert.equal(parsed.id, "/logitec-core-wms");
});

test("SW oficial cachea solo shell /app.html y no API/login/tokens", () => {
  assert.match(appSw, /\/app\.html/);
  assert.match(appSw, /\/app\.webmanifest/);
  assert.doesNotMatch(appSw, /\/logitec-role-demo\.html/);
  assert.doesNotMatch(appSw, /\/manifest\.webmanifest/);
  assert.match(appSw, /if \(url\.pathname\.startsWith\("\/api\/"\)\) return;/);
  assert.match(appSw, /if \(url\.pathname\.startsWith\("\/login"\)\) return;/);
  assert.match(appSw, /if \(url\.pathname\.includes\("token"\)\) return;/);
});

test("SW demo previo no se altera", () => {
  assert.match(demoSw, /logitec-demo-shell-v16\.2\.7/);
  assert.match(demoSw, /\/logitec-role-demo\.html/);
  assert.match(demoSw, /\/manifest\.webmanifest/);
  assert.match(demoSw, /if \(url\.pathname\.startsWith\("\/api\/"\)\) return;/);
});

test("app.ts expone manifest/SW oficial y shell V16 sin gate preview", () => {
  assert.match(appSrc, /\/app\.webmanifest/);
  assert.match(appSrc, /\/app-sw\.js/);
  assert.match(appSrc, /logitec-role-demo\.css/);
  assert.match(appSrc, /logitec-role-demo\.js/);
  assert.match(appSrc, /sendLogitecPreviewAsset\(req, res, "logitec-role-demo\.html"/);
});
