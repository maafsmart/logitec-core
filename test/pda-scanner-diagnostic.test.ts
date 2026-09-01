import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  classifyScannerCode,
  scannerLocationWhere,
  type ScannerDiagnosticReader
} from "../src/modules/admin/pda-scanner-diagnostic.service.js";

const routes = readFileSync(new URL("../src/modules/admin/admin.routes.ts", import.meta.url), "utf8");
const service = readFileSync(
  new URL("../src/modules/admin/pda-scanner-diagnostic.service.ts", import.meta.url),
  "utf8"
);
const html = readFileSync(new URL("../public/pda-scanner-lab.html", import.meta.url), "utf8");
const js = readFileSync(new URL("../public/pda-scanner-lab.js", import.meta.url), "utf8");

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

test("pantalla aislada cubre teclado Enter, sesión, red manual y cámara documentada", () => {
  for (const id of [
    "testId", "deviceType", "deviceBrand", "deviceModel", "deviceOs", "readerType",
    "deviceTotal", "deviceConcurrent", "deviceMonth", "deviceYearEnd", "physicalZone",
    "distance", "expectedType", "captureMethod", "scanInput", "networkProvider",
    "networkZone", "networkPing", "networkDown", "networkUp", "networkStability",
    "networkReference", "historyBody", "copyBtn", "exportBtn"
  ]) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  assert.match(js, /event\.key !== "Enter"/);
  assert.match(js, /\/api\/admin\/pda-scanner-diagnostic\/classify\?code=/);
  assert.match(js, /const history = \[\]/);
  assert.match(js, /navigator\.clipboard\.writeText/);
  assert.match(js, /text\/csv/);
  assert.doesNotMatch(js, /speedtest|ookla|telmex/i);
  assert.doesNotMatch(js, /BarcodeDetector|getUserMedia|mediaDevices/);
  assert.match(html, /BarcodeDetector no ofrece compatibilidad uniforme/);
  assert.match(html, /No crea entradas[\s\S]*salidas[\s\S]*movimientos[\s\S]*reservas/);
});
