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

type ClassifyResult = {
  raw: string;
  normalized: string;
  classification: string;
  match: { type: string; value: string } | null;
  reason?: string;
};

const normalizeScannerRawValueSrc = sliceFunction(js, "normalizeScannerRawValue");
const isPureNumericTokenSrc = sliceFunction(js, "isPureNumericToken");
const normalizeForClassificationSrc = sliceFunction(js, "normalizeForClassification");
const classifyScanCodeLocalSrc = sliceFunction(js, "classifyScanCodeLocal");

const makeClassifier = new Function(
  `var state;
${normalizeScannerRawValueSrc}
${isPureNumericTokenSrc}
${normalizeForClassificationSrc}
${classifyScanCodeLocalSrc}
return function makeClassifier(stock) {
  state = { stock };
  return function classifyRaw(raw) {
    return classifyScanCodeLocal(raw);
  };
};`
) as () => (stock: unknown[]) => (raw: string) => ClassifyResult;

const classify = makeClassifier();

const mockStock = [
  {
    product: { sku: "002957", name: "Demo SKU" },
    location: { code: "AN22-A" },
    sap: "358240051111110",
    pedido: "45003182",
    partida: "00010",
    serialNumber: "8811223344",
    qty: 24
  }
];

const classifyWithStock = classify(mockStock);

test("cache-buster logitec-role-demo v=15.3", () => {
  assert.match(html, /logitec-role-demo\.js\?v=16.1.1/);
  assert.match(html, /logitec-role-demo\.css\?v=16.1.1/);
});

test("número que coincide con Pedido se clasifica como PEDIDO", () => {
  const result = classifyWithStock("45003182");
  assert.equal(result.classification, "PEDIDO");
  assert.equal(result.match?.type, "PEDIDO");
  assert.notEqual(result.classification, "CANTIDAD");
});

test("número que coincide con SAP se clasifica como SAP", () => {
  const result = classifyWithStock("358240051111110");
  assert.equal(result.classification, "SAP");
  assert.equal(result.match?.type, "SAP");
  assert.notEqual(result.classification, "CANTIDAD");
});

test("número que coincide con Partida se clasifica como PARTIDA", () => {
  const result = classifyWithStock("00010");
  assert.equal(result.classification, "PARTIDA");
  assert.equal(result.match?.type, "PARTIDA");
  assert.notEqual(result.classification, "CANTIDAD");
});

test("número sin coincidencia queda SIN CLASIFICAR con razón de no-cantidad", () => {
  const result = classifyWithStock("12345");
  assert.equal(result.classification, "SIN CLASIFICAR");
  assert.equal(result.reason, "Valor numérico sin contexto · no se infiere como cantidad");
  assert.notEqual(result.classification, "CANTIDAD");
});

test("classifyScanCodeLocal no infiere CANTIDAD en ningún caso numérico", () => {
  const samples = ["45003182", "358240051111110", "00010", "12345", "24"];
  for (const code of samples) {
    const result = classifyWithStock(code);
    assert.notEqual(result.classification, "CANTIDAD", `code ${code} must not become CANTIDAD`);
  }
});

test("RAW se preserva y ]C1 se normaliza antes del cotejo", () => {
  const result = classifyWithStock("]C145003182");
  assert.equal(result.raw, "]C145003182");
  assert.equal(result.classification, "PEDIDO");
});
