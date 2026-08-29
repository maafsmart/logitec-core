import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  applyFreeToSaleNormalized,
  classifyImportAssignment,
  isFreeToSaleLabel,
  summarizeImportAssignments
} from "../src/modules/imports/import-assignment.js";
import { applyMapping, buildSuggestedMapping } from "../src/modules/imports/import-mapping.js";
import { buildImportResumePayload, countUnresolved } from "../src/modules/imports/import-resume.service.js";
import { buildAssignment } from "../src/modules/inventory/inventory-assignment.js";

const js = readFileSync(new URL("../public/dashboard.js", import.meta.url), "utf8");
const html = readFileSync(new URL("../public/dashboard.html", import.meta.url), "utf8");
const routes = readFileSync(new URL("../src/modules/imports/imports.routes.ts", import.meta.url), "utf8");
const bulk = readFileSync(new URL("../src/modules/imports/import-execute-bulk.service.ts", import.meta.url), "utf8");
const cancelBlock = routes.slice(routes.indexOf('importsRouter.post("/:id/cancel"'), routes.indexOf('importsRouter.post("/:id/confirm"'));

function ftsRow(lotNumber = "FREE TO SALE", customer = "") {
  return classifyImportAssignment({ customer, lotNumber });
}

test("CUSTOMER vacío + FREE TO SALE clasifica FREE_TO_SALE con projectId null y sin unresolved", () => {
  const classified = ftsRow();
  assert.equal(classified.kind, "FREE_TO_SALE");
  assert.equal(classified.assignmentType, "FREE_TO_SALE");
  assert.equal(classified.projectId, null);
  assert.equal(classified.project, "");
  assert.equal(classified.createsCustomer, false);
  assert.equal(classified.createsProject, false);
  const normalized: Record<string, unknown> = { project: "should-clear", lotNumber: "FREE TO SALE" };
  applyFreeToSaleNormalized(normalized);
  assert.equal(normalized.assignmentType, "FREE_TO_SALE");
  assert.equal(normalized.projectId, null);
  assert.equal(normalized.project, "");
  assert.equal(normalized.projectName, null);
  assert.equal(normalized.projectCode, null);
  const summary = summarizeImportAssignments([
    {
      normalized: { ...normalized, sourceCustomer: "", lotNumber: "FREE TO SALE" },
      errors: []
    }
  ]);
  assert.equal(summary.freeToSaleAssigned, 1);
  assert.equal(summary.assignmentUnresolved, 0);
  assert.equal(summary.customerBlank, 1);
});

test("variaciones seguras de FREE TO SALE se normalizan", () => {
  for (const lotNumber of [" free to sale ", "FREE   TO\nSALE", "Free To Sale", "\tFREE TO SALE\t"]) {
    assert.equal(isFreeToSaleLabel(lotNumber), true, lotNumber);
    assert.equal(ftsRow(lotNumber).assignmentType, "FREE_TO_SALE", lotNumber);
  }
});

test("no acepta coincidencias parciales ni valores distintos", () => {
  for (const lotNumber of ["FREE TO SALE EXTRA", "FREE-TO-SALE", "FREETOSALE", "FREE", "TO SALE", "STOCK LIBRE"]) {
    assert.equal(isFreeToSaleLabel(lotNumber), false, lotNumber);
    assert.equal(ftsRow(lotNumber).kind, "UNRESOLVED", lotNumber);
  }
});

test("CUSTOMER vacío + otro LOTE permanece unresolved", () => {
  const classified = classifyImportAssignment({ customer: "", lotNumber: "LOT-99" });
  assert.equal(classified.kind, "UNRESOLVED");
  assert.equal(classified.assignmentType, "UNRESOLVED");
  assert.equal(classified.projectId, null);
});

test("CUSTOMER vacío + LOTE vacío permanece unresolved", () => {
  const classified = classifyImportAssignment({ customer: "  ", lotNumber: "" });
  assert.equal(classified.kind, "UNRESOLVED");
  assert.equal(classified.assignmentType, "UNRESOLVED");
});

test("CUSTOMER con proyecto válido no cambia a FREE_TO_SALE aunque el lote sea FREE TO SALE", () => {
  const classified = classifyImportAssignment({
    customer: "AVIAT NETWORKS",
    lotNumber: "FREE TO SALE"
  });
  assert.equal(classified.kind, "PROJECT_LOOKUP");
  assert.equal(classified.assignmentType, "PROJECT");
  assert.equal(classified.project, "AVIAT NETWORKS");
  assert.equal(classified.projectId, null);
  assert.equal(classified.createsProject, false);
});

test("no crea Customer ni Project para FREE TO SALE", () => {
  const classified = ftsRow();
  assert.equal(classified.createsCustomer, false);
  assert.equal(classified.createsProject, false);
  assert.doesNotMatch(bulk, /prisma\.customer\.create/);
  assert.doesNotMatch(bulk, /tx\.customer\.create/);
  assert.match(bulk, /assignment\.assignmentType !== "PROJECT" \|\| !row\.assignment\.projectId/);
  assert.match(bulk, /sample\.assignment\.assignmentType === "PROJECT" \? sample\.assignment\.projectId : null/);
});

test("mapping conserva project vacío y lotNumber FREE TO SALE, incluido el encabezado real", () => {
  const loteHeader = "LOTE\n(Sales Ordener )";
  const mapping = buildSuggestedMapping([
    "Material Number",
    "PO QT",
    "Ubicacion",
    "CUSTOMER",
    loteHeader,
    "SERIAL NUMBER",
    "TOTAL PO"
  ]);
  assert.equal(mapping["CUSTOMER"], "project");
  assert.equal(mapping[loteHeader], "lotNumber");
  assert.equal(mapping["TOTAL PO"], null);
  const mapped = applyMapping(
    {
      "Material Number": "SKU-1",
      "PO QT": "2",
      Ubicacion: "A-01",
      CUSTOMER: "",
      [loteHeader]: "FREE TO SALE",
      "SERIAL NUMBER": "N/A",
      "TOTAL PO": "100"
    },
    mapping
  );
  assert.equal(String(mapped.project ?? "").trim(), "");
  assert.equal(mapped.lotNumber, "FREE TO SALE");
  const classified = classifyImportAssignment({
    customer: mapped.project,
    lotNumber: mapped.lotNumber
  });
  assert.equal(classified.assignmentType, "FREE_TO_SALE");
  assert.equal(classified.project, "");
});

test("reanudación conserva assignmentType FREE_TO_SALE y 0 unresolved", () => {
  const rows = [
    {
      reviewState: "READY",
      normalized: {
        assignmentType: "FREE_TO_SALE",
        projectId: null,
        project: "",
        sourceCustomer: "",
        lotNumber: "FREE TO SALE"
      },
      errors: [],
      warnings: [],
      corrections: {},
      data: {},
      sourceRow: 1,
      validatedAt: new Date("2026-08-26T12:00:00.000Z")
    },
    {
      reviewState: "READY",
      normalized: {
        assignmentType: "PROJECT",
        projectId: "proj-1",
        project: "AVIAT",
        sourceCustomer: "AVIAT",
        lotNumber: "L-1"
      },
      errors: [],
      warnings: [],
      corrections: {},
      data: {},
      sourceRow: 2,
      validatedAt: new Date("2026-08-26T12:00:00.000Z")
    }
  ];
  assert.equal(countUnresolved(rows), 0);
  const payload = buildImportResumePayload(
    {
      id: "batch-1",
      context: "INVENTORY",
      originalFileName: "inventario.xlsx",
      sheetName: "Inventario Actual 22 Junio 2026",
      status: "READY",
      totalRows: 2,
      validRows: 2,
      invalidRows: 0,
      warningRows: 0,
      createdAt: new Date("2026-08-26T12:00:00.000Z"),
      confirmedAt: null,
      completedAt: null,
      metadata: {
        inventoryMode: "RECONCILE",
        mapping: { CUSTOMER: "project", [ "LOTE\n(Sales Ordener )" ]: "lotNumber" }
      },
      rows
    },
    { includeReview: true }
  );
  const summary = payload.assignmentSummary as {
    freeToSaleAssigned: number;
    projectAssigned: number;
    assignmentUnresolved: number;
    customerBlank: number;
  };
  assert.equal(payload.unresolvedCount, 0);
  assert.equal(summary.freeToSaleAssigned, 1);
  assert.equal(summary.projectAssigned, 1);
  assert.equal(summary.assignmentUnresolved, 0);
  assert.equal(summary.customerBlank, 1);
  const preview = (payload.previewRows as Array<{ normalized: { assignmentType: string } }>)[0];
  assert.equal(preview?.normalized.assignmentType, "FREE_TO_SALE");
});

test("cancelación elimina staging y declara inventoryChanged false", () => {
  assert.match(cancelBlock, /importRow\.deleteMany/);
  assert.match(cancelBlock, /inventoryChanged:\s*false/);
  assert.doesNotMatch(cancelBlock, /tx\.inventory\b/);
  assert.doesNotMatch(cancelBlock, /tx\.customer\b/);
});

test("confirmación aislada crea cubo FREE_TO_SALE con projectId null y conserva lote", () => {
  const classified = classifyImportAssignment({ customer: "", lotNumber: "FREE TO SALE" });
  const assignment = buildAssignment(classified.assignmentType, classified.projectId, "client-aviat");
  assert.equal(assignment.assignmentType, "FREE_TO_SALE");
  assert.equal(assignment.projectId, null);
  assert.equal(assignment.assignmentKey, "FREE_TO_SALE:client-aviat");
  assert.match(bulk, /lotNumber: n\.lotNumber \? String\(n\.lotNumber\) : null/);
  assert.match(bulk, /assignmentType !== "LEGACY_UNASSIGNED"/);
  assert.match(bulk, /assignmentType === "PROJECT" \? String\(n\.projectId \|\| ""\) : null/);
  assert.doesNotMatch(js, /inventoryProjectsCache\.push\(/);
});

test("resumen 1717 / 849 FREE_TO_SALE / 868 proyecto / 0 unresolved", () => {
  const rows = [
    ...Array.from({ length: 849 }, () => ({
      normalized: {
        assignmentType: "FREE_TO_SALE",
        sourceCustomer: "",
        project: "",
        lotNumber: "FREE TO SALE"
      },
      errors: []
    })),
    ...Array.from({ length: 868 }, () => ({
      normalized: {
        assignmentType: "PROJECT",
        sourceCustomer: "AVIAT",
        project: "AVIAT",
        projectId: "proj-1"
      },
      errors: []
    }))
  ];
  const summary = summarizeImportAssignments(rows);
  assert.equal(summary.totalRows, 1717);
  assert.equal(summary.customerBlank, 849);
  assert.equal(summary.freeToSaleAssigned, 849);
  assert.equal(summary.projectAssigned, 868);
  assert.equal(summary.assignmentUnresolved, 0);
});

test("la interfaz muestra FREE TO SALE y no lo trata como error pendiente ni lo mete a proyectos", () => {
  assert.match(js, /FREE TO SALE: \$\{formatImportCount\(importUi\.freeToSaleAssigned\)\}/);
  assert.match(js, /no pertenece a un proyecto/);
  assert.match(js, /no se añaden a la lista de proyectos/);
  assert.match(js, /fillInventoryProjectSelects[\s\S]*inventoryProjectsCache\.map/);
  assert.doesNotMatch(js, /inventoryProjectsCache\.push/);
  assert.match(html, /class="js-inventory-project-select"/);
});

test("LOGITEC, CUSTOMER OWNS, CUSTOMR OWNS y ASO no se clasifican como proyecto", () => {
  for (const customer of ["LOGITEC", "CUSTOMER OWNS", "CUSTOMR OWNS", "ASO"]) {
    const classified = classifyImportAssignment({ customer, lotNumber: "LOT-1" });
    assert.equal(classified.kind, "UNASSIGNED", customer);
    assert.equal(classified.assignmentType, "LEGACY_UNASSIGNED", customer);
    assert.equal(classified.projectId, null, customer);
    assert.equal(classified.createsProject, false, customer);
    const assignment = buildAssignment("LEGACY_UNASSIGNED", classified.projectId, "client-aviat");
    assert.equal(assignment.assignmentType, "LEGACY_UNASSIGNED", customer);
    assert.equal(assignment.projectId, null, customer);
  }
  const empty = classifyImportAssignment({ customer: "", lotNumber: "LOT-99" });
  assert.equal(empty.kind, "UNRESOLVED");
  assert.equal(empty.projectId, null);
  const real = classifyImportAssignment({ customer: "AVIAT NETWORKS" });
  assert.equal(real.kind, "PROJECT_LOOKUP");
  assert.equal(real.project, "AVIAT NETWORKS");
  const projectFn = js.slice(js.indexOf("function getAviatProjectFromRow"), js.indexOf("function getAviatProjectDisplayFromRow"));
  assert.match(projectFn, /row\?\.project\?\.code/);
  assert.doesNotMatch(projectFn, /product\?\.customer/);
  assert.match(js, /isForbiddenProjectLabel\(p\.code\)/);
});
