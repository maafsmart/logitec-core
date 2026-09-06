import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const js = readFileSync(new URL("../public/logitec-role-demo.js", import.meta.url), "utf8");

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

function evalShouldAutofocusScanInputOnMount(matchMediaImpl: (query: string) => { matches: boolean }, maxTouchPoints = 0) {
  const fnBlock = sliceFunction(js, "shouldAutofocusScanInputOnMount");
  return new Function(
    "window",
    "navigator",
    `${fnBlock}; return shouldAutofocusScanInputOnMount;`
  )({ matchMedia: matchMediaImpl }, { maxTouchPoints });
}

test("wireScannerInput evita autofocus en táctil pero conserva Captura manual", () => {
  const wire = sliceFunction(js, "wireScannerInput");
  assert.match(wire, /if \(shouldAutofocusScanInputOnMount\(\)\) \{[\s\S]*input\.focus\(\)/);
  assert.match(wire, /getElementById\("scanManual"\)[\s\S]*input\.focus\(\)/);
});

test("shouldAutofocusScanInputOnMount desactiva foco en móvil coarse/touch", () => {
  const shouldAutofocus = evalShouldAutofocusScanInputOnMount((query) => ({
    matches: query.includes("pointer: coarse") || query.includes("hover: none")
  }), 5);
  assert.equal(shouldAutofocus(), false);
});

test("shouldAutofocusScanInputOnMount conserva foco en desktop sin touch", () => {
  const shouldAutofocus = evalShouldAutofocusScanInputOnMount(() => ({ matches: false }), 0);
  assert.equal(shouldAutofocus(), true);
});

test("cámara y Enter del escáner permanecen cableados", () => {
  const wire = sliceFunction(js, "wireScannerInput");
  assert.match(wire, /event\.key === "Enter"/);
  assert.match(wire, /wireDemoScannerCamera\(onSubmit\)/);
  assert.doesNotMatch(wire, /readonly|disabled/);
});
