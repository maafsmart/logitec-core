import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const html = readFileSync(new URL("../public/logitec-role-demo.html", import.meta.url), "utf8");
const js = readFileSync(new URL("../public/logitec-role-demo.js", import.meta.url), "utf8");

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

const dictionaryConst = js.slice(js.indexOf("const LOGITEC_IDENTIFICATION_DICTIONARY"), js.indexOf("const DECLARED_FLOOR_ACTIONS"));

const harnessSrc = `
${dictionaryConst}
${sliceFunction(js, "normalizeScannerRawValue")}
${sliceFunction(js, "isPureNumericToken")}
${sliceFunction(js, "normalizeForClassification")}
${sliceFunction(js, "classifyScanCodeLocal")}
${sliceFunction(js, "identifyWithLogitecDictionary")}
${sliceFunction(js, "buildDigitalEntryOrdersFromStock")}
${sliceFunction(js, "oedLineMatchesClassification")}
${sliceFunction(js, "predictDigitalEntryLineMatches")}
var state = { stock: [] };
return { state, identifyWithLogitecDictionary, buildDigitalEntryOrdersFromStock, predictDigitalEntryLineMatches };
`;

type Harness = {
  state: { stock: unknown[] };
  identifyWithLogitecDictionary: (raw: string) => {
    raw: string;
    normalized: string;
    classification: string;
    dictionary: { kind: string } | null;
    reason?: string;
  };
  buildDigitalEntryOrdersFromStock: (stock: unknown[]) => Array<{
    id: string;
    project: string;
    lines: Array<{ lineId: string; sku: string; pedido?: string; sap?: string; partida?: string; serialHint?: string }>;
  }>;
  predictDigitalEntryLineMatches: (
    order: { lines: Array<{ lineId: string; sku: string; pedido?: string; sap?: string; partida?: string; serialHint?: string }> },
    classified: { normalized: string; classification: string; reason?: string }
  ) => { status: string; matches: unknown[]; message: string };
};

const mockStock = [
  {
    product: { sku: "002957", name: "Radio enlace" },
    location: { code: "AN100" },
    project: { code: "PROJ-ALPHA" },
    qty: 10,
    sap: "358240051111110",
    pedido: "45003182",
    partida: "00010"
  },
  {
    product: { sku: "002957", name: "Radio enlace B" },
    location: { code: "AN105" },
    project: { code: "PROJ-ALPHA" },
    qty: 5,
    sap: "358240051111110",
    pedido: "45009999",
    partida: "00020"
  },
  {
    product: { sku: "SKU-LOC" },
    location: { code: "AN203" },
    project: { code: "PROJ-BETA" },
    qty: 1
  }
];

test("cache-buster v=16.1", () => {
  assert.match(html, /logitec-role-demo\.js\?v=16\.1/);
  assert.match(html, /logitec-role-demo\.css\?v=16\.1/);
});

test("diccionario de identificación incluye tipos LOGITEC aprobados", () => {
  assert.match(dictionaryConst, /kind: "SKU"/);
  assert.match(dictionaryConst, /kind: "SAP"/);
  assert.match(dictionaryConst, /kind: "PEDIDO"/);
  assert.match(dictionaryConst, /kind: "PARTIDA"/);
  assert.match(dictionaryConst, /kind: "SERIE"/);
  assert.match(dictionaryConst, /kind: "UBICACIÓN"/);
});

test("buildDigitalEntryOrdersFromStock genera OED demo por proyecto autorizado", () => {
  const h = new Function(harnessSrc)() as Harness;
  const orders = h.buildDigitalEntryOrdersFromStock(mockStock);
  assert.ok(orders.length >= 2);
  assert.match(orders[0].id, /OED-DEMO-/);
  assert.ok(orders.some((o) => o.project === "PROJ-ALPHA"));
  assert.ok(orders.some((o) => o.project === "PROJ-BETA"));
});

test("SKU inequívoco en OED activa → matched", () => {
  const h = new Function(harnessSrc)() as Harness;
  h.state.stock = mockStock;
  const order = h.buildDigitalEntryOrdersFromStock(mockStock).find((o) => o.project === "PROJ-BETA");
  assert.ok(order);
  assert.equal(order!.lines.length, 1);
  const classified = h.identifyWithLogitecDictionary("SKU-LOC");
  const prediction = h.predictDigitalEntryLineMatches(order!, classified);
  assert.equal(prediction.status, "matched");
});

test("SKU compartido por dos líneas OED → ambiguous fail-closed", () => {
  const h = new Function(harnessSrc)() as Harness;
  h.state.stock = mockStock;
  const order = h.buildDigitalEntryOrdersFromStock(mockStock).find((o) => o.project === "PROJ-ALPHA");
  assert.ok(order);
  assert.ok(order!.lines.length >= 2);
  const classified = h.identifyWithLogitecDictionary("002957");
  const prediction = h.predictDigitalEntryLineMatches(order!, classified);
  assert.equal(prediction.status, "ambiguous");
});

test("Pedido específico → matched cuando desambigua SKU duplicado", () => {
  const h = new Function(harnessSrc)() as Harness;
  h.state.stock = mockStock;
  const order = h.buildDigitalEntryOrdersFromStock(mockStock).find((o) => o.project === "PROJ-ALPHA");
  const classified = h.identifyWithLogitecDictionary("45003182");
  const prediction = h.predictDigitalEntryLineMatches(order!, classified);
  assert.equal(prediction.status, "matched");
});

test("ubicación y numérico sin contexto → insufficient", () => {
  const h = new Function(harnessSrc)() as Harness;
  h.state.stock = mockStock;
  const order = h.buildDigitalEntryOrdersFromStock(mockStock)[0];
  const loc = h.identifyWithLogitecDictionary("AN203");
  h.state.stock = mockStock;
  const locClassified = h.identifyWithLogitecDictionary("AN203");
  assert.equal(h.predictDigitalEntryLineMatches(order, locClassified).status, "insufficient");
  const numeric = h.identifyWithLogitecDictionary("999999");
  assert.equal(h.predictDigitalEntryLineMatches(order, numeric).status, "insufficient");
});

test("identifyWithLogitecDictionary adjunta entrada del diccionario", () => {
  const h = new Function(harnessSrc)() as Harness;
  h.state.stock = mockStock;
  const identified = h.identifyWithLogitecDictionary("45003182");
  assert.equal(identified.classification, "PEDIDO");
  assert.equal(identified.dictionary?.kind, "PEDIDO");
});

test("Admin y Supervisor exponen módulo pre_reception", () => {
  assert.match(js, /id: "pre_reception", label: "Pre-recepción documental"/);
  assert.match(sliceFunction(js, "preReceptionDocumentalView"), /Orden de entrada digital/);
  assert.match(sliceFunction(js, "preReceptionDocumentalView"), /NO REGISTRA ENTRADA FÍSICA/);
});

test("pre-recepción no muta movimientos oficiales", () => {
  assert.doesNotMatch(sliceFunction(js, "submitPreReceptionConsultation"), /state\.movements/);
  assert.doesNotMatch(sliceFunction(js, "buildDigitalEntryOrdersFromStock"), /state\.movements/);
});

test("V14/V15 scanner y capturas provisionales intactos", () => {
  assert.match(js, /function classifyScanCodeLocal\(/);
  assert.match(js, /function updateProvisionalCaptureStatus\(/);
  assert.match(js, /function clientVisibleOfficialMovements\(/);
  assert.doesNotMatch(sliceFunction(js, "submitPreReceptionConsultation"), /finalizeProvisionalCapture/);
});

test("demo bloquea escrituras no-GET", () => {
  assert.match(js, /Demo read-only: \$\{method\} bloqueado/);
});
