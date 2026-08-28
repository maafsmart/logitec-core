import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  CANCELLABLE_IMPORT_STATUSES,
  RESUMABLE_IMPORT_STATUSES,
  buildCancelledImportMetadata,
  isCancellableImportStatus,
  isMutableImportStatus,
  isResumableImportStatus
} from "../src/modules/imports/import-resume.service.js";

const routes = readFileSync(new URL("../src/modules/imports/imports.routes.ts", import.meta.url), "utf8");
const html = readFileSync(new URL("../public/dashboard.html", import.meta.url), "utf8");
const js = readFileSync(new URL("../public/dashboard.js", import.meta.url), "utf8");

const cancelBlock = routes.slice(routes.indexOf('importsRouter.post("/:id/cancel"'), routes.indexOf('importsRouter.post("/:id/confirm"'));

test("UPLOADED es cancelable", () => {
  assert.equal(isCancellableImportStatus("UPLOADED"), true);
});

test("MAPPED es cancelable", () => {
  assert.equal(isCancellableImportStatus("MAPPED"), true);
});

test("VALIDATED es cancelable", () => {
  assert.equal(isCancellableImportStatus("VALIDATED"), true);
});

test("READY es cancelable", () => {
  assert.equal(isCancellableImportStatus("READY"), true);
});

test("FAILED es cancelable", () => {
  assert.equal(isCancellableImportStatus("FAILED"), true);
});

test("PROCESSING no es cancelable", () => {
  assert.equal(isCancellableImportStatus("PROCESSING"), false);
});

test("COMPLETED no es cancelable", () => {
  assert.equal(isCancellableImportStatus("COMPLETED"), false);
});

test("CANCELLED no es cancelable", () => {
  assert.equal(isCancellableImportStatus("CANCELLED"), false);
});

test("CANCELLED no es mutable", () => {
  assert.equal(isMutableImportStatus("CANCELLED"), false);
  assert.equal(isMutableImportStatus("COMPLETED"), false);
  assert.equal(isMutableImportStatus("PROCESSING"), false);
  assert.equal(isMutableImportStatus("READY"), true);
});

test("CANCELLED no pertenece a RESUMABLE_IMPORT_STATUSES", () => {
  assert.equal(isResumableImportStatus("CANCELLED"), false);
  assert.ok(!(RESUMABLE_IMPORT_STATUSES as readonly string[]).includes("CANCELLED"));
  assert.ok(CANCELLABLE_IMPORT_STATUSES.includes("FAILED"));
});

test("buildCancelledImportMetadata elimina parsedRows y rows, conserva encabezados y no muta el original", () => {
  const original = {
    selectedSheet: "Inventario",
    inventoryMode: "APPEND",
    priceCurrency: "MXN",
    mapping: { SKU: "sku" },
    valuation: { total: 10 },
    parsedRows: [{ SKU: "SECRET" }],
    sheets: [
      {
        name: "Inventario",
        headerRowIndex: 0,
        headers: ["SKU", "QTY"],
        totalDataRows: 1717,
        rows: [{ SKU: "SECRET" }]
      }
    ]
  };
  const snapshot = JSON.parse(JSON.stringify(original));
  const cancelled = buildCancelledImportMetadata(original, {
    cancelledById: "user-1",
    cancelledAt: new Date("2026-08-25T12:00:00.000Z")
  });
  assert.deepEqual(original, snapshot);
  assert.equal("parsedRows" in cancelled, false);
  assert.equal(cancelled.selectedSheet, "Inventario");
  assert.equal(cancelled.inventoryMode, "APPEND");
  assert.equal(cancelled.priceCurrency, "MXN");
  assert.deepEqual(cancelled.mapping, { SKU: "sku" });
  assert.deepEqual(cancelled.valuation, { total: 10 });
  assert.deepEqual(cancelled.sheets, [
    {
      name: "Inventario",
      headerRowIndex: 0,
      headers: ["SKU", "QTY"],
      totalDataRows: 1717
    }
  ]);
  assert.equal("rows" in (cancelled.sheets as Array<Record<string, unknown>>)[0]!, false);
  assert.equal(cancelled.cancelledAt, "2026-08-25T12:00:00.000Z");
  assert.equal(cancelled.cancelledById, "user-1");
  assert.equal(cancelled.cancelReason, "CANCELLED_BY_ADMIN");
});

test("la ruta usa updateMany condicionado y elimina exclusivamente ImportRow", () => {
  assert.match(cancelBlock, /updateMany/);
  assert.match(cancelBlock, /CANCELLABLE_IMPORT_STATUSES/);
  assert.match(cancelBlock, /createdById:\s*userId/);
  assert.match(cancelBlock, /importRow\.deleteMany/);
  assert.doesNotMatch(cancelBlock, /importBatch\.delete/);
  assert.doesNotMatch(cancelBlock, /tx\.inventory\b/);
  assert.doesNotMatch(cancelBlock, /inventoryLayer/);
  assert.doesNotMatch(cancelBlock, /inventoryMovement/);
  assert.doesNotMatch(cancelBlock, /inventorySerial/);
  assert.doesNotMatch(cancelBlock, /tx\.product\b/);
  assert.doesNotMatch(cancelBlock, /tx\.customer\b/);
  assert.doesNotMatch(cancelBlock, /tx\.location\b/);
  assert.doesNotMatch(cancelBlock, /tx\.requisition\b/);
  assert.match(cancelBlock, /inventoryChanged:\s*false/);
});

test("GET /active excluye CANCELLED por estados resumibles", () => {
  assert.match(routes, /status:\s*\{\s*in:\s*\[\.\.\.RESUMABLE_IMPORT_STATUSES\]\s*\}/);
  assert.equal(isResumableImportStatus("CANCELLED"), false);
});

test("la interfaz llama /cancel y conserva ambos botones y el modal", () => {
  assert.match(js, /\/api\/imports\/\$\{id\}\/cancel/);
  assert.match(html, /id="importResumeDiscardBtn"/);
  assert.match(html, /id="importCancelBtn"/);
  assert.match(html, /id="importCancelModal"/);
  assert.match(html, />Cancelar importación temporal</);
  assert.doesNotMatch(html, /Descartar de la interfaz/);
  assert.doesNotMatch(js, /discardResumableImportUi/);
  assert.match(html, /data-import-cancel-version="server-cancel-v1"/);
  assert.match(html, /dashboard\.js\?v=69/);
});
