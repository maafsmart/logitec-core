import assert from "node:assert/strict";
import { test } from "node:test";
import { applyMapping, buildSuggestedMapping } from "../src/modules/imports/import-mapping.js";
import { parseCsv, parseUpload } from "../src/modules/imports/import-parse.service.js";

test("fila operativa con descripción entrecomillada y coma", () => {
  const csv = [
    "SKU,DESCRIPTION,QTY,LOCATION",
    'A-100,"Steel plate, 2mm, galvanized",12,A-01'
  ].join("\n");

  const parsed = parseUpload(Buffer.from(csv, "utf8"), "quoted.csv");
  assert.equal(parsed.fileType, "CSV");
  assert.equal(parsed.sheets[0]?.rows.length, 1);
  const row = parsed.sheets[0]!.rows[0]!;
  assert.equal(row.SKU, "A-100");
  assert.equal(row.DESCRIPTION, "Steel plate, 2mm, galvanized");
  assert.equal(String(row.QTY), "12");
  assert.deepEqual(parseCsv(csv)[1], ["A-100", "Steel plate, 2mm, galvanized", "12", "A-01"]);
});

test("filas vacías que solo contienen index se ignoran", () => {
  const csv = [
    "index,SKU,QTY,LOCATION",
    "0,,,",
    "1,,,",
    "2,KEEP-1,4,B-02",
    "3,,,"
  ].join("\n");

  const parsed = parseUpload(Buffer.from(csv, "utf8"), "index-only.csv");
  const rows = parsed.sheets[0]!.rows;
  assert.equal(rows.length, 1);
  assert.equal(rows[0]!.SKU, "KEEP-1");
  assert.equal(String(rows[0]!.index), "2");
});

test("fila con index y otro dato operativo se conserva", () => {
  const csv = [
    "Unnamed: 0,SKU,QTY,LOCATION",
    "7,KEEP-2,1,C-03"
  ].join("\n");

  const parsed = parseUpload(Buffer.from(csv, "utf8"), "index-plus-data.csv");
  const rows = parsed.sheets[0]!.rows;
  assert.equal(rows.length, 1);
  assert.equal(rows[0]!.SKU, "KEEP-2");
  assert.equal(String(rows[0]!["Unnamed: 0"]), "7");
  assert.equal(String(rows[0]!.QTY), "1");
});

test("mapeo MXN/USD con Currency.1", () => {
  const headers = ["PO net Price", "Currency", "PO net Price_2", "Currency.1"];
  const rows = [
    {
      "PO net Price": "100.50",
      Currency: "MXN",
      "PO net Price_2": "5.25",
      "Currency.1": "USD"
    }
  ];
  const mapping = buildSuggestedMapping(headers, rows);
  assert.equal(mapping["PO net Price"], "unitPriceMxn");
  assert.equal(mapping["PO net Price_2"], "unitPriceUsd");
  const mapped = applyMapping(rows[0]!, mapping);
  assert.equal(mapped.unitPriceMxn, "100.50");
  assert.equal(mapped.unitPriceUsd, "5.25");
});

test("CUSTOMER vacío no copia FREE TO SALE desde LOTE al proyecto", () => {
  const headers = ["SKU", "CUSTOMER", "LOTE", "QTY", "LOCATION"];
  const mapping = buildSuggestedMapping(headers);
  assert.equal(mapping.CUSTOMER, "project");
  assert.equal(mapping.LOTE, "lotNumber");

  const mapped = applyMapping(
    {
      SKU: "FTS-1",
      CUSTOMER: "",
      LOTE: "FREE TO SALE",
      QTY: "3",
      LOCATION: "D-04"
    },
    mapping
  );

  assert.equal(String(mapped.project ?? "").trim(), "");
  assert.equal(mapped.lotNumber, "FREE TO SALE");
  assert.notEqual(String(mapped.project ?? "").trim().toUpperCase(), "FREE TO SALE");
});
