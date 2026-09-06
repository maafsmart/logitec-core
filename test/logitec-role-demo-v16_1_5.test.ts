import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const html = readFileSync(new URL("../public/logitec-role-demo.html", import.meta.url), "utf8");
const js = readFileSync(new URL("../public/logitec-role-demo.js", import.meta.url), "utf8");
const css = readFileSync(new URL("../public/logitec-role-demo.css", import.meta.url), "utf8");
const pdaJs = readFileSync(new URL("../public/pda-scanner-lab.js", import.meta.url), "utf8");

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

test("cache buster v16.2.7", () => {
  assert.match(html, /logitec-role-demo\.css\?v=16\.2\.7/);
  assert.match(html, /logitec-role-demo\.js\?v=16\.2\.7/);
});

test("scroll móvil usa window y scan-mode-active desde JS", () => {
  assert.match(js, /function getMobileScrollPosition\(\)/);
  assert.match(js, /function restoreMobileScrollPosition\(/);
  assert.match(js, /window\.scrollY/);
  assert.match(js, /window\.scrollTo/);
  assert.match(js, /function syncScanPriorityUi\(\)/);
  assert.match(js, /scan-mode-active/);
  assert.match(js, /function isScanPriorityActive\(\)/);
  assert.match(css, /--mobile-chrome-bottom-space/);
  assert.match(css, /body\.scan-mode-active #directorViewBar/);
});

test("director móvil compacto con panel desplegable y flash de rol", () => {
  assert.match(html, /id="directorMobileToggle"[^>]*>VISTA DIRECTOR/);
  assert.match(html, /id="directorMobileSheet"/);
  assert.match(html, /id="directorMobileClose"/);
  assert.match(html, /director-view-bar-actions-mobile/);
  assert.match(js, /function isCompactDirectorLayout\(\)/);
  assert.match(js, /function openDirectorMobilePanel\(\)/);
  assert.match(js, /function closeDirectorMobilePanel\(\)/);
  assert.match(js, /function ensureDirectorMobilePanelClosed\(/);
  assert.match(js, /function flashDirectorRole\(/);
  assert.match(js, /handleDirectorRoleSelect/);
  assert.match(js, /aria-expanded/);
  assert.match(css, /\.director-mobile-dock/);
  assert.match(css, /max-height:\s*min\(60vh,\s*420px\)/);
  assert.match(css, /body\.director-mobile-panel-open/);
  assert.match(css, /@media \(max-width: 640px\)[\s\S]*\.director-view-bar[\s\S]*background:\s*transparent/);
});

test("concentración móvil usa etiqueta compacta sin cambiar lógica", () => {
  assert.match(js, /function syncConcentrationExitLabel\(\)/);
  assert.match(js, /Salir concentración/);
  assert.match(css, /body\.focus-mode \.concentration-overlay/);
  assert.match(css, /body\.focus-mode \.concentration-exit-btn/);
});

test("focus-mode móvil permite scroll de window", () => {
  assert.match(css, /@media \(max-width: 640px\)[\s\S]*body\.focus-mode[\s\S]*overflow:\s*auto/);
  assert.match(css, /@media \(max-width: 640px\)[\s\S]*body\.focus-mode #mobileEmulationFrame \.app-shell[\s\S]*position:\s*static/);
});

test("escáner demo conserva teclado+Enter y no tenía getUserMedia antes del módulo cámara", () => {
  assert.match(sliceFunction(js, "wireScannerInput"), /event\.key === "Enter"/);
  assert.match(sliceFunction(js, "wireScannerInput"), /wireDemoScannerCamera\(onSubmit\)/);
  assert.doesNotMatch(
    js.slice(0, js.indexOf("async function startDemoCamera()")),
    /getUserMedia\(/
  );
});

test("renderScannerWorkspace incluye botón, video y controles de cámara", () => {
  const workspace = sliceFunction(js, "renderScannerWorkspace");
  assert.match(workspace, /id="scanCameraToggle"[^>]*>CÁMARA DEL CELULAR/);
  assert.match(workspace, /id="scanCameraVideo"[^>]*playsinline/);
  assert.match(workspace, /id="scanStartCameraBtn"[^>]*>ABRIR CÁMARA/);
  assert.match(workspace, /id="scanArmCameraBtn"[^>]*>INICIAR LECTURA/);
  assert.match(workspace, /id="scanStopCameraBtn"[^>]*>DETENER CÁMARA/);
  assert.match(workspace, /id="scanValue"/);
});

test("startDemoCamera solicita cámara trasera y permiso explícito", () => {
  const start = sliceFunction(js, "startDemoCamera");
  assert.match(start, /navigator\.mediaDevices\.getUserMedia/);
  assert.match(start, /facingMode:\s*\{\s*ideal:\s*"environment"\s*\}/);
  assert.match(start, /solicitando permiso explícito/);
  assert.doesNotMatch(start, /cameraDetector\.detect|scheduleDemoCameraDetection/);
});

test("detector nativo y fallback ZXing-WASM local", () => {
  const create = sliceFunction(js, "createDemoCameraDetector");
  const polyfill = sliceFunction(js, "loadDemoBarcodeDetectorPolyfill");
  assert.match(create, /if \(window\.BarcodeDetector\)[\s\S]*demoCameraDetectorKind = "nativo"/);
  assert.match(polyfill, /\/vendor\/barcode-detector\/3\.2\.2\/polyfill\.js/);
  assert.match(create, /\/vendor\/zxing-wasm\/3\.1\.3\/zxing_reader\.wasm/);
  assert.match(create, /demoCameraDetectorKind = "ZXing-WASM"/);
  assert.match(pdaJs, /\/vendor\/barcode-detector\/3\.2\.2\/polyfill\.js/);
});

test("código detectado entra por scanValue y manejador existente", () => {
  const detect = sliceFunction(js, "detectDemoCameraFrame");
  assert.match(detect, /input\.value = rawValue/);
  assert.match(detect, /onSubmit\(input\)/);
  assert.match(detect, /demoCameraSubmitHandler/);
  assert.match(sliceFunction(js, "wireDemoScannerCamera"), /demoCameraSubmitHandler = onSubmit/);
});

test("libera tracks al detener o cambiar módulo", () => {
  const halt = sliceFunction(js, "haltDemoCameraCapture");
  assert.match(halt, /window\.clearTimeout\(demoCameraTimer\)/);
  assert.match(halt, /demoCameraRunId \+= 1/);
  assert.match(halt, /getTracks\(\)\.forEach\(\(track\) => track\.stop\(\)\)/);
  assert.match(halt, /demoCameraStream = null/);
  assert.match(sliceFunction(js, "navigateModule"), /stopDemoCamera\(/);
  assert.match(sliceFunction(js, "renderContent"), /stopDemoCamera\(""\)/);
  assert.match(js, /visibilitychange[\s\S]*stopDemoCamera\("Pestaña oculta/);
});

test("protección contra duplicados en la misma lectura", () => {
  const detect = sliceFunction(js, "detectDemoCameraFrame");
  assert.match(detect, /demoCameraSeenCodes\.has\(rawValue\)/);
  assert.match(detect, /runId !== demoCameraRunId/);
  assert.match(sliceFunction(js, "advanceDemoCameraCandidate"), /demoCameraStabilityFrames/);
});

test("Precios no incluye cámara del escáner compartido", () => {
  const valuation = sliceFunction(js, "valuationView");
  assert.doesNotMatch(valuation, /scanCameraToggle|scanCameraVideo|getUserMedia/);
  assert.match(sliceFunction(js, "renderModule"), /if \(m === "prices"\) return valuationView\(\)/);
  assert.doesNotMatch(sliceFunction(js, "renderModule"), /valuationView[\s\S]*renderScannerWorkspace/);
});

test("indicación horizontal solo móvil junto a tablas anchas", () => {
  assert.match(css, /\.mobile-table-scroll-hint[\s\S]*display:\s*none/);
  assert.match(css, /@media \(max-width: 640px\)[\s\S]*\.mobile-table-scroll-hint[\s\S]*display:\s*block/);
  assert.match(sliceFunction(js, "mobileTableScrollHint"), /Desliza horizontalmente para ver todas las columnas/);
  assert.match(sliceFunction(js, "inventoryTable"), /mobileTableScrollHint\(\)/);
  assert.match(sliceFunction(js, "valuationView"), /mobileTableScrollHint\(\)/);
});

test("cámara no escribe inventario nuevo", () => {
  const detect = sliceFunction(js, "detectDemoCameraFrame");
  const freeScan = sliceFunction(js, "submitFreeScanReading");
  assert.doesNotMatch(detect, /state\.stock\.push|PATCH|POST|PUT|DELETE/);
  assert.doesNotMatch(freeScan, /state\.stock\.push/);
  assert.match(freeScan, /session\.readings\.push/);
  assert.match(js, /Demo read-only/);
});

test("mensajes claros cuando falta HTTPS, permiso o compatibilidad", () => {
  const start = sliceFunction(js, "startDemoCamera");
  assert.match(start, /La cámara requiere HTTPS o localhost/);
  assert.match(start, /Permiso de cámara denegado/);
  assert.match(start, /Este navegador no ofrece acceso a cámara/);
});
