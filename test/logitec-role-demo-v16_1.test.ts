import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const html = readFileSync(new URL("../public/logitec-role-demo.html", import.meta.url), "utf8");
const js = readFileSync(new URL("../public/logitec-role-demo.js", import.meta.url), "utf8");
const css = readFileSync(new URL("../public/logitec-role-demo.css", import.meta.url), "utf8");
const pol = readFileSync(new URL("../docs/POLITICAS_SISTEMA_LOGITEC_CORE_WMS.md", import.meta.url), "utf8");

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
const demoDocsConst = js.slice(js.indexOf("const DEMO_INBOUND_DOCUMENTS"), js.indexOf("function digitalizeInboundDocuments"));

const harnessSrc = `
${dictionaryConst}
${demoDocsConst}
${sliceFunction(js, "normalizeScannerRawValue")}
${sliceFunction(js, "isPureNumericToken")}
${sliceFunction(js, "normalizeForClassification")}
${sliceFunction(js, "classifyScanCodeLocal")}
${sliceFunction(js, "identifyWithLogitecDictionary")}
${sliceFunction(js, "digitalizeInboundDocuments")}
${sliceFunction(js, "findDigitalEntryOrder")}
${sliceFunction(js, "findOedLine")}
${sliceFunction(js, "normalizedToken")}
${sliceFunction(js, "oedLineMatchesToken")}
${sliceFunction(js, "oedCompatibleLineIds")}
${js.slice(js.indexOf("const OED_DOCUMENT_CLASSIFICATION_PRIORITY"), js.indexOf("function corpusRowsMatchingToken"))}
${sliceFunction(js, "corpusRowsMatchingToken")}
${sliceFunction(js, "isKnownInCorpus")}
${sliceFunction(js, "corpusEntryStatus")}
${sliceFunction(js, "buildIdentificationCorpusEntries")}
${sliceFunction(js, "createEmptyPreReceptionSession")}
${sliceFunction(js, "ensurePreReceptionSession")}
${sliceFunction(js, "resolveProgressiveStatus")}
${sliceFunction(js, "applyPreReceptionReading")}
${sliceFunction(js, "replayPreReceptionSession")}
var state = {
  stock: [],
  digitalEntryOrders: [],
  activeDigitalEntryOrderId: null,
  preReceptionSession: null,
  identificationCorpusEntries: []
};
function initDemo(stock) {
  state.stock = stock || [];
  state.digitalEntryOrders = digitalizeInboundDocuments();
  state.identificationCorpusEntries = buildIdentificationCorpusEntries();
  state.preReceptionSession = null;
}
return {
  state,
  initDemo,
  identifyWithLogitecDictionary,
  digitalizeInboundDocuments,
  applyPreReceptionReading,
  replayPreReceptionSession,
  createEmptyPreReceptionSession,
  findDigitalEntryOrder,
  findOedLine,
  buildIdentificationCorpusEntries
};
`;

type Reading = {
  raw: string;
  normalized: string;
  classification: string;
  candidateCountBefore: number | null;
  candidateCountAfter: number | null;
  resultStatus: string;
  message: string;
};

type Harness = {
  state: {
    stock: unknown[];
    digitalEntryOrders: Array<{ id: string; lines: Array<{ lineId: string; sku: string }> }>;
    preReceptionSession: {
      oedId: string | null;
      readings: Reading[];
      candidateLineIds: string[] | null;
      status: string;
      identifiedLineId: string | null;
    } | null;
    identificationCorpusEntries: unknown[];
  };
  initDemo: (stock?: unknown[]) => void;
  digitalizeInboundDocuments: () => Array<{ id: string; sourceNote?: string; lines: unknown[] }>;
  applyPreReceptionReading: (raw: string, oedId: string) => Harness["state"]["preReceptionSession"];
  replayPreReceptionSession: (oedId: string, raws: string[]) => Harness["state"]["preReceptionSession"];
  createEmptyPreReceptionSession: (oedId: string | null) => Harness["state"]["preReceptionSession"];
  findDigitalEntryOrder: (oedId: string) => { lines: Array<{ lineId: string; sku: string }> } | undefined;
  findOedLine: (order: { lines: Array<{ lineId: string; sku: string }> }, lineId: string) => { lineId: string; sku: string } | null;
  buildIdentificationCorpusEntries: () => Array<{ value: string; type: string; status: string }>;
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
    product: { sku: "SKU-LOC" },
    location: { code: "AN203" },
    project: { code: "PROJ-BETA" },
    qty: 1
  }
];

const OED_PROG = "OED-DEMO-PROG-001";

function makeHarness(stock = mockStock): Harness {
  const h = new Function(harnessSrc)() as Harness;
  h.initDemo(stock);
  return h;
}

test("cache-buster v=16.2.7", () => {
  assert.match(html, /logitec-role-demo\.js\?v=16\.2\.7/);
  assert.match(html, /logitec-role-demo\.css\?v=16\.2\.7/);
});

test("POL-004 registrada como APROBADA con resumen técnico", () => {
  assert.match(pol, /POL-004 — APROBADA/);
  assert.match(pol, /cotejo progresivo/i);
  assert.match(pol, /intersección/i);
});

test("OED proviene de documentación externa DEMO, no del stock", () => {
  const h = makeHarness([]);
  const orders = h.digitalizeInboundDocuments();
  assert.equal(orders.length, 3);
  assert.ok(orders.some((o) => o.id === OED_PROG));
  assert.match(String(orders[0].sourceNote), /no genera administrativamente/i);
  assert.doesNotMatch(js, /function buildDigitalEntryOrdersFromStock\(/);
});

test("cotejo progresivo 8 → 3 → 1 sin resolución arbitraria", () => {
  const h = makeHarness();
  h.replayPreReceptionSession(OED_PROG, ["PO-PROG-8"]);
  assert.equal(h.state.preReceptionSession!.candidateLineIds!.length, 8);
  assert.equal(h.state.preReceptionSession!.readings[0].resultStatus, "AMBIGUO");
  assert.equal(h.state.preReceptionSession!.readings[0].candidateCountBefore, null);
  assert.equal(h.state.preReceptionSession!.readings[0].candidateCountAfter, 8);
  assert.equal(h.state.preReceptionSession!.readings[0].classification, "PEDIDO");

  h.applyPreReceptionReading("00020", OED_PROG);
  assert.equal(h.state.preReceptionSession!.candidateLineIds!.length, 3);
  assert.equal(h.state.preReceptionSession!.readings[1].candidateCountBefore, 8);
  assert.equal(h.state.preReceptionSession!.readings[1].candidateCountAfter, 3);
  assert.equal(h.state.preReceptionSession!.readings[1].classification, "PARTIDA");

  h.applyPreReceptionReading("SKU-GRP-C", OED_PROG);
  const session = h.state.preReceptionSession!;
  assert.equal(session.candidateLineIds!.length, 1);
  assert.equal(session.status, "IDENTIFICADO");
  assert.equal(session.identifiedLineId, "L-03");
  assert.equal(session.readings[2].resultStatus, "IDENTIFICADO");
  assert.equal(session.readings[2].classification, "SKU");
  assert.match(session.readings[2].message, /INEQUÍVOCA/i);
  assert.doesNotMatch(sliceFunction(js, "applyPreReceptionReading"), /\.find\(\(line\)/);
});

test("primera lectura genera múltiples candidatos", () => {
  const h = makeHarness();
  h.applyPreReceptionReading("PO-PROG-8", OED_PROG);
  assert.ok((h.state.preReceptionSession!.candidateLineIds?.length || 0) > 1);
});

test("lectura sin coincidencia OED conserva clasificación stock o SIN CLASIFICAR", () => {
  const h = makeHarness([]);
  h.applyPreReceptionReading("REF-DEMO-INEXISTENTE-XYZ", OED_PROG);
  assert.equal(h.state.preReceptionSession!.readings[0].classification, "SIN CLASIFICAR");
  h.applyPreReceptionReading("999888777", OED_PROG);
  assert.equal(h.state.preReceptionSession!.readings[1].classification, "SIN CLASIFICAR");
});

test("conocido fuera de OED → CONOCIDO_NO_ESPERADO", () => {
  const h = makeHarness();
  h.applyPreReceptionReading("002957", OED_PROG);
  const last = h.state.preReceptionSession!.readings.at(-1)!;
  assert.equal(last.resultStatus, "CONOCIDO_NO_ESPERADO");
});

test("desconocido → DESCONOCIDO", () => {
  const h = makeHarness([]);
  h.applyPreReceptionReading("REF-DEMO-INEXISTENTE-XYZ", OED_PROG);
  assert.equal(h.state.preReceptionSession!.readings[0].resultStatus, "DESCONOCIDO");
});

test("incompatibilidad acumulada → CONTRADICTORIO", () => {
  const h = makeHarness();
  h.replayPreReceptionSession(OED_PROG, ["PO-PROG-8", "00020"]);
  h.applyPreReceptionReading("SKU-GRP-H", OED_PROG);
  const last = h.state.preReceptionSession!.readings.at(-1)!;
  assert.equal(last.resultStatus, "CONTRADICTORIO");
  assert.equal(h.state.preReceptionSession!.candidateLineIds!.length, 3);
});

test("descartar última lectura recalcula candidatos", () => {
  const h = makeHarness();
  h.replayPreReceptionSession(OED_PROG, ["PO-PROG-8", "00020", "SKU-GRP-C"]);
  assert.equal(h.state.preReceptionSession!.identifiedLineId, "L-03");
  h.replayPreReceptionSession(OED_PROG, ["PO-PROG-8", "00020"]);
  assert.equal(h.state.preReceptionSession!.candidateLineIds!.length, 3);
  assert.equal(h.state.preReceptionSession!.identifiedLineId, null);
});

test("reinicio limpia sesión sin borrar OED ni diccionario", () => {
  const h = makeHarness();
  h.replayPreReceptionSession(OED_PROG, ["PO-PROG-8"]);
  const ordersBefore = h.state.digitalEntryOrders.length;
  const corpusBefore = h.state.identificationCorpusEntries.length;
  h.state.preReceptionSession = h.createEmptyPreReceptionSession(OED_PROG);
  assert.equal(h.state.preReceptionSession!.readings.length, 0);
  assert.equal(h.state.preReceptionSession!.candidateLineIds, null);
  assert.equal(h.state.digitalEntryOrders.length, ordersBefore);
  assert.equal(h.state.identificationCorpusEntries.length, corpusBefore);
});

test("RAW permanece intacto y numérico desconocido → INSUFICIENTE", () => {
  const h = makeHarness();
  const raw = "  PO-PROG-8  ";
  h.applyPreReceptionReading(raw, OED_PROG);
  assert.equal(h.state.preReceptionSession!.readings[0].raw, raw);
  h.applyPreReceptionReading("999888777", OED_PROG);
  const numeric = h.state.preReceptionSession!.readings.at(-1)!;
  assert.equal(numeric.resultStatus, "INSUFICIENTE");
  assert.match(numeric.message, /numérico|cantidad/i);
});

test("identificación única expone campos de línea OED", () => {
  const h = makeHarness();
  h.replayPreReceptionSession(OED_PROG, ["PO-PROG-8", "00020", "SKU-GRP-C"]);
  const order = h.findDigitalEntryOrder(OED_PROG)!;
  const line = h.findOedLine(order, h.state.preReceptionSession!.identifiedLineId!)!;
  assert.equal(line.sku, "SKU-GRP-C");
  assert.match(sliceFunction(js, "renderPreReceptionAutocompletePanel"), /SKU.*Pedido.*SAP.*Lote.*Partida.*Descripción.*Proyecto/s);
});

test("Admin ve diccionario corpus READ-ONLY", () => {
  assert.match(sliceFunction(js, "preReceptionDocumentalView"), /state\.role === "ADMIN" \? renderIdentificationCorpusPanel\(\{ collapsible: true \}\)/);
  assert.match(sliceFunction(js, "renderIdentificationCorpusPanel"), /Valor.*Tipo.*Proyecto.*Relaciones.*Coincidencias.*Estado/s);
  const h = makeHarness();
  assert.ok(h.buildIdentificationCorpusEntries().length > 0);
});

test("Supervisor accede a pre_reception; Cliente no", () => {
  assert.match(js, /id: "pre_reception".*Pre-recepción documental/s);
  assert.match(sliceFunction(js, "renderModule"), /state\.role === "ADMIN" \|\| \(state\.role === "SUPERVISOR"/);
  assert.doesNotMatch(js.slice(js.indexOf("CLIENT:"), js.indexOf("CLIENT:") + 800), /pre_reception/);
});

test("Operador ejecuta tarea OED sin administrar documentos", () => {
  assert.match(js, /oedId: "OED-DEMO-PROG-001"/);
  assert.match(sliceFunction(js, "operatorOedReceptionFlow"), /renderScannerWorkspace/);
  assert.match(sliceFunction(js, "operatorOedReceptionFlow"), /Operador no administra OED/);
  assert.match(sliceFunction(js, "operatorTaskFlow"), /if \(task\.oedId\) return operatorOedReceptionFlow/);
});

test("pre-recepción no muta stock ni movimientos", () => {
  assert.doesNotMatch(sliceFunction(js, "applyPreReceptionReading"), /state\.stock/);
  assert.doesNotMatch(sliceFunction(js, "applyPreReceptionReading"), /state\.movements/);
  assert.doesNotMatch(sliceFunction(js, "digitalizeInboundDocuments"), /state\.stock/);
});

test("V14/V15 scanner y capturas provisionales intactos", () => {
  assert.match(js, /function classifyScanCodeLocal\(/);
  assert.match(js, /function updateProvisionalCaptureStatus\(/);
  assert.match(js, /function clientVisibleOfficialMovements\(/);
  assert.doesNotMatch(sliceFunction(js, "applyPreReceptionReading"), /finalizeProvisionalCapture/);
});

test("V15.3.3 trazabilidad dual Supervisor intacta", () => {
  assert.match(js, /function renderDualTraceFilterBar\(/);
  assert.match(sliceFunction(js, "supervisorMovementsView"), /renderDualTraceFilterBar/);
});

test("demo bloquea escrituras no-GET", () => {
  assert.match(js, /Demo read-only: \$\{method\} bloqueado/);
});

test("precios y valuación son consultables por los cuatro roles", () => {
  const navStart = js.indexOf("const NAV =");
  const adminStart = js.indexOf("ADMIN:", navStart);
  const supervisorStart = js.indexOf("SUPERVISOR:", adminStart);
  const operatorStart = js.indexOf("OPERATOR:", supervisorStart);
  const clientStart = js.indexOf("CLIENT:", operatorStart);
  const adminNav = js.slice(adminStart, supervisorStart);
  const supervisorNav = js.slice(supervisorStart, operatorStart);
  const operatorNav = js.slice(operatorStart, clientStart);
  const clientNav = js.slice(clientStart, js.indexOf("const state", clientStart));
  for (const nav of [adminNav, supervisorNav, operatorNav, clientNav]) {
    assert.match(nav, /id: "prices"/);
  }
  assert.match(sliceFunction(js, "renderModule"), /if \(m === "prices"\) return valuationView\(\)/);
  assert.match(sliceFunction(js, "valuationView"), /DEMO READ-ONLY/);
  assert.doesNotMatch(sliceFunction(js, "valuationView"), /guardFetch|POST|PATCH|PUT|DELETE/);
});

test("agregación económica conserva centavos y cobertura", () => {
  const src = `
    ${sliceFunction(js, "normalizedRowValuation")}
    ${sliceFunction(js, "aggregateValuation")}
    return { normalizedRowValuation, aggregateValuation };
  `;
  const h = new Function(src)() as {
    aggregateValuation: (rows: unknown[]) => { totalValueMxn: number; qtyValued: number; qtyUnvalued: number; coveragePct: string };
  };
  const result = h.aggregateValuation([
    { qty: 3, valuation: { qtyTotal: 3, qtyValued: 3, qtyUnvalued: 0, totalValueMxn: "1.11", status: "COMPLETE" } },
    { qty: 2, valuation: { qtyTotal: 2, qtyValued: 1, qtyUnvalued: 1, totalValueMxn: "2.22", status: "PARTIAL" } }
  ]);
  assert.equal(result.totalValueMxn, 3.33);
  assert.equal(result.qtyValued, 4);
  assert.equal(result.qtyUnvalued, 1);
  assert.equal(result.coveragePct, "80.00");
});

test("modo celular alterna y la barra reserva su altura real", () => {
  assert.match(sliceFunction(js, "syncDirectorViewUi"), /VOLVER A DESKTOP.*MODO CELULAR/);
  assert.match(sliceFunction(js, "wireDirectorViewBarActions"), /setMobileEmulation\(!state\.mobileEmulation\)/);
  assert.match(sliceFunction(js, "syncDirectorDockSpacing"), /--mobile-chrome-bottom-space/);
  assert.match(css, /padding-bottom:\s*var\(--mobile-chrome-bottom-space, 48px\)/);
  assert.doesNotMatch(css, /director-view-bar-actions\s*\{\s*grid-template-columns:\s*1fr/);
  assert.match(css, /@container logitec-mobile[\s\S]*?\.wms-section-bar \.nav-section-tabs[\s\S]*?overflow-x:\s*auto/);
});
