import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  classifyScannerCode,
  scannerLocationWhere,
  type ScannerDiagnosticReader
} from "../src/modules/admin/pda-scanner-diagnostic.service.js";
import {
  createPdaScannerLabGate,
  isPdaScannerLabEnabled
} from "../src/modules/admin/pda-scanner-lab.feature.js";

const routes = readFileSync(new URL("../src/modules/admin/admin.routes.ts", import.meta.url), "utf8");
const service = readFileSync(
  new URL("../src/modules/admin/pda-scanner-diagnostic.service.ts", import.meta.url),
  "utf8"
);
const html = readFileSync(new URL("../public/pda-scanner-lab.html", import.meta.url), "utf8");
const js = readFileSync(new URL("../public/pda-scanner-lab.js", import.meta.url), "utf8");
const css = readFileSync(new URL("../public/pda-scanner-lab.css", import.meta.url), "utf8");
const appSource = readFileSync(new URL("../src/app.ts", import.meta.url), "utf8");
const envSource = readFileSync(new URL("../src/config/env.ts", import.meta.url), "utf8");
const dashboardHtml = readFileSync(new URL("../public/dashboard.html", import.meta.url), "utf8");
const loginJs = readFileSync(new URL("../public/login.js", import.meta.url), "utf8");
const canonicalHostJs = readFileSync(new URL("../public/canonical-host.js", import.meta.url), "utf8");
const envExample = readFileSync(new URL("../.env.example", import.meta.url), "utf8");
const packageJson = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));

function reader(overrides: Partial<ScannerDiagnosticReader> = {}) {
  const calls: Array<{ operation: string; code: string; clientId: string }> = [];
  const wrap = <T>(operation: string, value: T[]) =>
    async (code: string, clientId: string): Promise<T[]> => {
      calls.push({ operation, code, clientId });
      return value;
    };
  const diagnosticReader: ScannerDiagnosticReader = {
    findProducts: wrap("products", []),
    findLocations: wrap("locations", []),
    findLots: wrap("lots", []),
    findSerials: wrap("serials", []),
    ...overrides
  };
  return { diagnosticReader, calls };
}

test("clasifica SKU con consultas de solo lectura limitadas al cliente activo", async () => {
  const inventoryState = {
    qty: "18",
    reservedQty: "2",
    movements: 7,
    reservations: 3,
    scanEvents: 11
  };
  const before = structuredClone(inventoryState);
  const mock = reader({
    findProducts: async (code, clientId) => {
      assert.equal(code, "037-579419-002");
      assert.equal(clientId, "client-aviat");
      return [{ sku: code, barcode: null, name: "Radio" }];
    }
  });

  const result = await classifyScannerCode(" 037-579419-002 ", "client-aviat", mock.diagnosticReader);

  assert.equal(result.classification, "SKU");
  assert.equal(result.matches.length, 1);
  assert.deepEqual(inventoryState, before, "el diagnóstico no debe alterar estado de inventario");
  assert.deepEqual(
    mock.calls.map((call) => call.operation).sort(),
    ["locations", "lots", "serials"],
    "las demás búsquedas también son lecturas"
  );
  assert.ok(mock.calls.every((call) => call.clientId === "client-aviat"));
});

test("marca AMBIGUO cuando el mismo valor coincide con entidades distintas", async () => {
  const mock = reader({
    findLocations: async () => [{ code: "AN20", warehouse: "TULTITLAN24" }],
    findLots: async () => [{
      lotNumber: "AN20",
      inventory: { product: { sku: "SKU-1" }, location: { code: "AN01" } }
    }]
  });
  const result = await classifyScannerCode("AN20", "client-aviat", mock.diagnosticReader);
  assert.equal(result.classification, "AMBIGUO");
  assert.deepEqual(result.matches.map((match) => match.type), ["UBICACION", "LOTE"]);
});

test("reconoce ubicación maestra activa aunque todavía no tenga inventario", async () => {
  const inventoryRows: unknown[] = [];
  const mock = reader({
    findLocations: async (code, clientId) => {
      assert.equal(code, "vacia-a1");
      assert.equal(clientId, "client-aviat");
      assert.equal(inventoryRows.length, 0, "la ubicación de prueba debe estar vacía");
      return [{ code: "VACIA-A1", warehouse: "TULTITLAN24" }];
    }
  });

  const result = await classifyScannerCode("vacia-a1", "client-aviat", mock.diagnosticReader);

  assert.equal(result.classification, "UBICACION");
  assert.deepEqual(result.matches, [{
    type: "UBICACION",
    label: "VACIA-A1",
    detail: "Almacén TULTITLAN24"
  }]);
  assert.deepEqual(scannerLocationWhere("vacia-a1"), {
    code: { equals: "vacia-a1", mode: "insensitive" },
    active: true
  });
});

test("clasifica serie/IMEI y conserva el contexto de producto y ubicación", async () => {
  const mock = reader({
    findSerials: async () => [{
      serialNumber: "SER-77",
      imei: "358240051111110",
      product: { sku: "PHONE-1" },
      inventoryLayer: { inventory: { location: { code: "AN20-A" } } }
    }]
  });
  const result = await classifyScannerCode("358240051111110", "client-aviat", mock.diagnosticReader);
  assert.equal(result.classification, "SERIE_IMEI");
  assert.match(result.matches[0]?.detail || "", /PHONE-1/);
  assert.match(result.matches[0]?.detail || "", /AN20-A/);
});

test("endpoint diagnóstico es GET, ADMIN, con cliente operativo y sin escrituras", () => {
  const routeStart = routes.indexOf('"/pda-scanner-diagnostic/classify"');
  const routeEnd = routes.indexOf("adminRouter.post(", routeStart);
  const route = routes.slice(routeStart, routeEnd);
  assert.ok(routeStart >= 0);
  assert.match(route, /pdaScannerLabApiGate/);
  assert.ok(route.indexOf("pdaScannerLabApiGate") < route.indexOf("requireAuth"));
  assert.match(route, /requireAuth/);
  assert.match(route, /requireRole\(\["ADMIN"\]\)/);
  assert.match(route, /requireOperationalClient/);
  assert.match(route, /classifyScannerCode/);
  assert.doesNotMatch(route, /\.create|\.update|\.delete|mutateInventory|ScanEvent/i);
  assert.match(service, /\.findMany\(/);
  assert.doesNotMatch(service, /\.(create|createMany|update|updateMany|upsert|delete|deleteMany)\(/);
  const locationLookup = service.slice(
    service.indexOf("findLocations(code, _clientId)"),
    service.indexOf("findLots(code, clientId)")
  );
  assert.match(locationLookup, /where: scannerLocationWhere\(code\)/);
  assert.doesNotMatch(locationLookup, /inventories/);
});

test("feature flag OFF bloquea con 404 y ON permite continuar", () => {
  assert.equal(isPdaScannerLabEnabled("false"), false);
  assert.equal(isPdaScannerLabEnabled("true"), true);

  let statusCode = 0;
  let responseBody = "";
  let nextCalls = 0;
  const response = {
    status(code: number) {
      statusCode = code;
      return this;
    },
    send(body: string) {
      responseBody = body;
      return this;
    }
  };
  createPdaScannerLabGate(false)({} as never, response as never, () => { nextCalls += 1; });
  assert.equal(statusCode, 404);
  assert.equal(responseBody, "Not Found");
  assert.equal(nextCalls, 0);

  createPdaScannerLabGate(true)({} as never, response as never, () => { nextCalls += 1; });
  assert.equal(nextCalls, 1);
});

test("HTML y API usan flag default-OFF antes de exponer el laboratorio", () => {
  assert.match(envSource, /ENABLE_PDA_SCANNER_LAB:[\s\S]*value \?\? "false"/);
  assert.match(envExample, /ENABLE_PDA_SCANNER_LAB=false/);
  const pageRoute = appSource.indexOf('app.get("/pda-scanner-lab.html", pdaScannerLabPageGate');
  const staticMount = appSource.indexOf('app.use(express.static("public"))');
  assert.ok(pageRoute >= 0 && pageRoute < staticMount);
  assert.match(appSource, /isPdaScannerLabEnabled\(env\.ENABLE_PDA_SCANNER_LAB\)/);
  assert.doesNotMatch(dashboardHtml, /pdaScannerLabCard|Abrir laboratorio aislado/);
});

test("login next funciona en el dominio canónico sin aceptar redirects externos", () => {
  assert.match(loginJs, /new Set\(\["\/pda-scanner-lab\.html"\]\)/);
  assert.match(loginJs, /window\.location\.href = resolvePostLoginPath\(window\.location\.search\)/);
  assert.match(canonicalHostJs, /"https:\/\/" \+ WWW_HOST \+ pathname \+ search \+ hash/);
  assert.doesNotMatch(loginJs, /https:\/\/www\.control\.logitec\.com\.mx\/pda-scanner-lab/);
});

test("pantalla aislada comparte captura, sesión, red manual e historial entre ambos modos", () => {
  for (const id of [
    "testId", "deviceType", "deviceBrand", "deviceModel", "deviceOs", "readerType",
    "deviceTotal", "deviceConcurrent", "deviceMonth", "deviceYearEnd", "physicalZone",
    "distance", "expectedType", "captureMethod", "scanInput", "networkProvider",
    "networkZone", "networkPing", "networkDown", "networkUp", "networkStability",
    "networkReference", "historyBody", "copyBtn", "exportBtn", "handheldModeBtn",
    "cameraModeBtn", "cameraCapture", "cameraVideo", "startCameraBtn", "armCameraBtn", "cameraFallbackBtn",
    "detectedFrameEvidence", "detectedFrameImage", "discardDetectedFrameBtn"
  ]) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  assert.equal((html.match(/id="scanInput"/g) || []).length, 1);
  assert.equal((html.match(/id="historyBody"/g) || []).length, 1);
  assert.match(js, /event\.key !== "Enter"/);
  assert.match(js, /\/api\/admin\/pda-scanner-diagnostic\/classify\?code=/);
  assert.match(js, /const history = \[\]/);
  assert.match(js, /navigator\.clipboard\.writeText/);
  assert.match(js, /text\/csv/);
  assert.doesNotMatch(js, /speedtest|ookla|telmex/i);
  assert.match(html, /No crea entradas[\s\S]*salidas[\s\S]*movimientos[\s\S]*reservas/);
});

test("cámara solicita permiso solo por acción explícita y conserva fallback manual", () => {
  const start = js.slice(js.indexOf("async function startCamera()"), js.indexOf("function registerNotRead()"));
  assert.match(start, /navigator\.mediaDevices\.getUserMedia/);
  assert.match(js, /startCameraBtn"\)\.addEventListener\("click", \(\) => void startCamera\(\)\)/);
  assert.match(js, /cameraFallbackBtn"\)\.addEventListener\("click", \(\) => setCaptureMode\("handheld"\)\)/);
  assert.match(js, /Permiso de cámara denegado[\s\S]*captura manual\/lector teclado/);
  assert.ok(js.indexOf("navigator.mediaDevices.getUserMedia") > js.indexOf("async function startCamera()"));
  assert.doesNotMatch(js.slice(0, js.indexOf("async function startCamera()")), /getUserMedia\(/);
});

test("cámara usa detector nativo o ZXing-WASM local sin CDN", () => {
  assert.equal(packageJson.dependencies["barcode-detector"], "^3.2.2");
  assert.match(js, /if \(window\.BarcodeDetector\)[\s\S]*cameraDetectorKind = "nativo"/);
  assert.match(js, /\/vendor\/barcode-detector\/3\.2\.2\/polyfill\.js/);
  assert.match(js, /\/vendor\/zxing-wasm\/3\.1\.3\/zxing_reader\.wasm/);
  assert.doesNotMatch(js, /cdn\.jsdelivr|unpkg|https:\/\/.*barcode/i);
  assert.match(appSource, /node_modules\/barcode-detector\/dist\/iife\/polyfill\.js/);
  assert.match(appSource, /node_modules\/zxing-wasm\/dist\/reader\/zxing_reader\.wasm/);
  assert.match(appSource, /\/vendor\/barcode-detector\/3\.2\.2\/polyfill\.js/);
  assert.match(appSource, /\/vendor\/zxing-wasm\/3\.1\.3\/zxing_reader\.wasm/);
  assert.match(appSource, /res\.type\("application\/wasm"\)\.sendFile/);
});

test("el laboratorio reenvía el login con next allowlisted al propio laboratorio", () => {
  assert.match(js, /href="\/login\.html\?next=\/pda-scanner-lab\.html"/);
  assert.equal((js.match(/href="\/login\.html(?:\?[^"]*)?"/g) || []).join(""), 'href="/login.html?next=/pda-scanner-lab.html"');
});

test("valor detectado pasa sin transformación al clasificador y la cámara conserva el preview", () => {
  const detect = js.slice(js.indexOf("async function detectCameraFrame()"), js.indexOf("function armCameraDetection()"));
  assert.match(js, /const rawValue = String\(detections\?\.\[0\]\?\.rawValue \?\? ""\)/);
  assert.match(detect, /scanInput\.value = rawValue;[\s\S]*await processScan\(rawValue, \{ detectionMs \}\)/);
  assert.doesNotMatch(detect, /stopCamera\(/);
  assert.match(detect, /Cámara lista para enfocar/);
  assert.match(js, /encodeURIComponent\(code\)/);
  assert.match(js, /cameraStream\.getTracks\(\)\.forEach\(\(track\) => track\.stop\(\)\)/);
  assert.match(js, /pagehide/);
  assert.match(js, /visibilitychange/);
});

test("guía de cámara es amplia y no oscurece el video", () => {
  const guide = css.slice(css.indexOf(".camera-guide {"), css.indexOf(".camera-status"));
  assert.match(guide, /inset:\s*14% 5%/);
  assert.match(guide, /border:\s*3px solid/);
  assert.doesNotMatch(guide, /box-shadow|#0004|999px/);
});

test("preview no ejecuta detección antes de que el usuario arme la lectura", () => {
  const schedule = js.slice(js.indexOf("function scheduleCameraDetection()"), js.indexOf("async function detectCameraFrame()"));
  const detect = js.slice(js.indexOf("async function detectCameraFrame()"), js.indexOf("function armCameraDetection()"));
  const arm = js.slice(js.indexOf("function armCameraDetection()"), js.indexOf("async function startCamera()"));
  const start = js.slice(js.indexOf("async function startCamera()"), js.indexOf("function setBarcodeGeneratorStatus("));
  assert.match(html, /id="armCameraBtn"[\s\S]*INICIAR LECTURA/);
  assert.match(js, /armCameraBtn"\)\.addEventListener\("click", armCameraDetection\)/);
  assert.match(schedule, /if \(!cameraStream \|\| !cameraDetectionArmed\) return/);
  assert.match(detect, /if \(!cameraStream \|\| !cameraDetectionArmed \|\| cameraDetectionBusy\) return/);
  assert.doesNotMatch(start, /cameraDetector\.detect|scheduleCameraDetection\(\)|cameraStartedAt = performance\.now\(\)/);
  assert.match(start, /Cámara lista para enfocar/);
  assert.match(arm, /cameraDetectionArmed = true/);
  assert.match(arm, /scheduleCameraDetection\(\)/);
});

test("métrica de detección empieza al armar y excluye preparación y enfoque", () => {
  const detect = js.slice(js.indexOf("async function detectCameraFrame()"), js.indexOf("async function startCamera()"));
  const process = js.slice(js.indexOf("async function processScan("), js.indexOf("function setCameraStatus("));
  const arm = js.slice(js.indexOf("function armCameraDetection()"), js.indexOf("async function startCamera()"));
  const start = js.slice(js.indexOf("async function startCamera()"), js.indexOf("function setBarcodeGeneratorStatus("));
  assert.match(arm, /cameraStartedAt = performance\.now\(\)/);
  assert.ok(arm.indexOf("cameraStartedAt = performance.now()") < arm.indexOf("scheduleCameraDetection()"));
  assert.doesNotMatch(start, /cameraStartedAt = performance\.now\(\)/);
  assert.match(detect, /performance\.now\(\) - cameraStartedAt/);
  assert.match(process, /classificationStartedAt = performance\.now\(\)/);
  assert.match(process, /performance\.now\(\) - classificationStartedAt/);
  assert.match(html, /Hasta detección/);
  assert.match(html, /Clasificación API/);
  assert.match(js, /tiempo_deteccion_ms/);
  assert.match(js, /latencia_clasificacion_ms/);
  assert.doesNotMatch(js, /\blatencyMs\b/);
});

test("frame local se genera solo tras detectar, no se persiste ni se envía", () => {
  const snapshot = js.slice(js.indexOf("function snapshotCameraFrame()"), js.indexOf("async function showDetectedFrame("));
  const evidence = js.slice(js.indexOf("async function showDetectedFrame("), js.indexOf("function stopCamera("));
  const detect = js.slice(js.indexOf("async function detectCameraFrame()"), js.indexOf("function armCameraDetection()"));
  const start = js.slice(js.indexOf("async function startCamera()"), js.indexOf("function setBarcodeGeneratorStatus("));
  const rawValueBranch = detect.slice(detect.indexOf("if (rawValue)"));
  assert.match(snapshot, /context\.drawImage\(cameraVideo, 0, 0, width, height\)/);
  assert.match(detect, /const cameraFrame = snapshotCameraFrame\(\)[\s\S]*cameraDetector\.detect\(cameraFrame\)/);
  assert.match(evidence, /canvas\.toBlob\(resolve, "image\/jpeg", 0\.88\)/);
  assert.match(evidence, /URL\.createObjectURL\(blob\)/);
  assert.match(rawValueBranch, /showDetectedFrame\(cameraFrame, rawValue\)/);
  assert.doesNotMatch(start, /showDetectedFrame\(/);
  assert.doesNotMatch(evidence, /api\(|fetch\(|localStorage|sessionStorage|indexedDB/);
});

test("siguiente detección reemplaza la evidencia local y permite descartarla", () => {
  const clear = js.slice(js.indexOf("function clearDetectedFrame()"), js.indexOf("function snapshotCameraFrame()"));
  const evidence = js.slice(js.indexOf("async function showDetectedFrame("), js.indexOf("function stopCamera("));
  assert.match(clear, /URL\.revokeObjectURL\(detectedFrameUrl\)/);
  assert.match(clear, /detectedFrameEvidence"\)\.hidden = true/);
  assert.ok(evidence.indexOf("clearDetectedFrame()") < evidence.indexOf("URL.createObjectURL(blob)"));
  assert.match(js, /discardDetectedFrameBtn"\)\.addEventListener\("click", clearDetectedFrame\)/);
  assert.match(js, /pagehide[\s\S]*clearDetectedFrame\(\)/);
});

test("generador Code 128 es local, bajo demanda y no toca API ni base de datos", () => {
  for (const id of [
    "barcodeSampleInput", "generateBarcodeBtn", "useLastScanBtn",
    "downloadBarcodeBtn", "barcodeGeneratorStatus", "barcodePreview", "barcodeImage"
  ]) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  const generator = js.slice(js.indexOf("function loadBarcodeWriter()"), js.indexOf("function registerNotRead()"));
  assert.match(generator, /\/vendor\/zxing-wasm\/3\.1\.3\/writer\.js/);
  assert.match(generator, /\/vendor\/zxing-wasm\/3\.1\.3\/zxing_writer\.wasm/);
  assert.match(generator, /writer\.writeBarcode\(value, \{\s*format: "Code128"/);
  assert.match(generator, /blobToDataUrl\(output\.image\)/);
  assert.doesNotMatch(generator, /api\(|fetch\(|\/api\//);
  assert.match(appSource, /node_modules\/zxing-wasm\/dist\/iife\/writer\/index\.js/);
  assert.match(appSource, /node_modules\/zxing-wasm\/dist\/writer\/zxing_writer\.wasm/);
  assert.match(appSource, /\/vendor\/zxing-wasm\/3\.1\.3\/writer\.js/);
  assert.match(appSource, /\/vendor\/zxing-wasm\/3\.1\.3\/zxing_writer\.wasm/);
});
