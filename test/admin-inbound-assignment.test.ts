import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { InventoryMutationError } from "../src/modules/inventory/inventory-errors.js";
import { resolveInboundAssignment } from "../src/modules/inventory/inventory-assignment.js";

const html = readFileSync(new URL("../public/dashboard.html", import.meta.url), "utf8");
const js = readFileSync(new URL("../public/dashboard.js", import.meta.url), "utf8");
const routes = readFileSync(new URL("../src/modules/inventory/inventory.routes.ts", import.meta.url), "utf8");
const movementSchemaSrc = readFileSync(new URL("../src/modules/inventory/inventory-movement.schema.ts", import.meta.url), "utf8");
const assignmentSrc = readFileSync(new URL("../src/modules/inventory/inventory-assignment.ts", import.meta.url), "utf8");

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

function inboundHtml() {
  const start = html.indexOf('id="moduleInbound"');
  const end = html.indexOf('id="moduleOutbound"');
  assert.ok(start >= 0 && end > start);
  return html.slice(start, end);
}

function mockTx(projects: Record<string, { id: string; code: string; name: string; active: boolean; clientId: string | null }>) {
  return {
    customer: {
      async findUnique({ where }: { where: { id: string } }) {
        return projects[where.id] || null;
      }
    }
  };
}

const aviatProject = {
  id: "proj-att",
  code: "ATT_COMUNICACIONES_DIGITALES",
  name: "ATT Comunicaciones Digitales",
  active: true,
  clientId: "client-aviat"
};
const otherClientProject = {
  id: "proj-other",
  code: "OTHER_CLIENT_PRJ",
  name: "Otro cliente",
  active: true,
  clientId: "client-other"
};
const inactiveProject = {
  id: "proj-off",
  code: "ATT_OLD",
  name: "ATT viejo",
  active: false,
  clientId: "client-aviat"
};
const product = { customerId: "proj-att", customer: { clientId: "client-aviat" } };

test("el formulario de recepción tiene asignación vacía, Free to Sale y Proyecto", () => {
  const inbound = inboundHtml();
  assert.match(inbound, /id="inboundAssignmentType"/);
  assert.match(inbound, /— Seleccionar asignación —/);
  assert.match(inbound, /<option value="FREE_TO_SALE">Free to Sale<\/option>/);
  assert.match(inbound, /<option value="PROJECT">Proyecto<\/option>/);
  assert.doesNotMatch(inbound, /<option value="FREE_TO_SALE"[^>]*selected/);
  assert.doesNotMatch(inbound, /<option value="PROJECT"[^>]*selected/);
  assert.match(inbound, /id="inboundProjectField"/);
  assert.match(inbound, /class="field hidden" id="inboundProjectField"/);
  assert.match(inbound, /id="inboundProjectId"/);
  assert.doesNotMatch(inbound, /Agregar proyecto/);
  assert.doesNotMatch(inbound, /id="inboundCustomer"/);
});

test("AVAILABLE se muestra al usuario como Disponible", () => {
  assert.match(js, /code\.toUpperCase\(\) === "AVAILABLE"\) return "Disponible"/);
  const fillSrc = sliceFunction(js, "fillInventoryStatusSelect");
  assert.match(fillSrc, /formatInventoryStatus\(code\)/);
  const formatSrc = sliceFunction(js, "formatInventoryStatus");
  const formatInventoryStatus = new Function(`${formatSrc}; function inventoryStatusRecord(){ return { code: "AVAILABLE", label: "AVAILABLE" }; } return formatInventoryStatus;`)();
  assert.equal(formatInventoryStatus("AVAILABLE"), "Disponible");
});

test("el predictor SKU funciona en Free to Sale y en Proyecto y no infiere proyecto", () => {
  const wireSrc = sliceFunction(js, "wireAllProductTypeaheads");
  assert.match(wireSrc, /prefix === "inbound"[\s\S]*inboundTypeaheadProjectCode\(\)/);
  const predictSrc = sliceFunction(js, "inboundTypeaheadProjectCode");
  assert.match(predictSrc, /inboundAssignmentTypeValue\(\) !== "PROJECT"/);
  const applySrc = sliceFunction(js, "applyCatalogSuggestionToOps");
  assert.match(applySrc, /item\.projectCode && prefix !== "inbound"/);
});

test("Registrar entrada se desactiva con datos incompletos y exige SKU del sistema", () => {
  const completeSrc = sliceFunction(js, "inboundFormIsComplete");
  assert.match(completeSrc, /FREE_TO_SALE/);
  assert.match(completeSrc, /PROJECT/);
  assert.match(completeSrc, /inboundHasSystemSkuSelection/);
  assert.match(completeSrc, /inboundQty/);
  assert.match(completeSrc, /inboundWarehouse/);
  assert.match(completeSrc, /inboundLocation/);
  assert.match(completeSrc, /inboundStatus/);
  assert.match(js, /btn\.disabled = !inboundFormIsComplete\(\)/);

  const src = [
    sliceFunction(js, "inboundHasSystemSkuSelection"),
    sliceFunction(js, "inboundAssignmentTypeValue"),
    sliceFunction(js, "inboundSelectedProjectId"),
    sliceFunction(js, "inboundFormIsComplete")
  ].join("\n");
  const fields: Record<string, { value: string }> = {
    inboundProductId: { value: "prod-1" },
    inboundAssignmentType: { value: "FREE_TO_SALE" },
    inboundProjectId: { value: "" },
    inboundQty: { value: "2" },
    inboundWarehouse: { value: "TULTITLAN24" },
    inboundLocation: { value: "AN14-F" },
    inboundStatus: { value: "AVAILABLE" }
  };
  const inboundFormIsComplete = new Function(
    "document",
    `${src}; return inboundFormIsComplete;`
  )({ getElementById: (id: string) => fields[id] || null });

  assert.equal(inboundFormIsComplete(), true);
  fields.inboundProductId.value = "";
  assert.equal(inboundFormIsComplete(), false, "texto/SKU sin productId");
  fields.inboundProductId.value = "prod-1";
  fields.inboundQty.value = "";
  assert.equal(inboundFormIsComplete(), false, "sin cantidad");
  fields.inboundQty.value = "2";
  fields.inboundLocation.value = "";
  assert.equal(inboundFormIsComplete(), false, "sin ubicación");
  fields.inboundLocation.value = "AN14-F";
  fields.inboundAssignmentType.value = "";
  assert.equal(inboundFormIsComplete(), false, "sin asignación");
  fields.inboundAssignmentType.value = "PROJECT";
  fields.inboundProjectId.value = "";
  assert.equal(inboundFormIsComplete(), false, "proyecto obligatorio");
  fields.inboundProjectId.value = "proj-att";
  assert.equal(inboundFormIsComplete(), true);
});

test("pasar de Proyecto a Free to Sale limpia projectId y oculta el campo", () => {
  const field = { className: "field", classList: {
    toggle(name: string, on: boolean) {
      field.className = on ? `field ${name}` : "field";
    }
  } };
  const assignment = { value: "PROJECT" };
  const project = { value: "proj-att" };
  const submit = { disabled: false };
  const document = {
    getElementById(id: string) {
      if (id === "inboundAssignmentType") return assignment;
      if (id === "inboundProjectField") return field;
      if (id === "inboundProjectId") return project;
      if (id === "inboundSubmitBtn") return submit;
      if (id === "inboundProductId") return { value: "prod-1" };
      if (id === "inboundQty") return { value: "1" };
      if (id === "inboundWarehouse") return { value: "TULTITLAN24" };
      if (id === "inboundLocation") return { value: "AN14-F" };
      if (id === "inboundStatus") return { value: "AVAILABLE" };
      return null;
    }
  };
  const src = [
    "function fillInboundProjectSelect() {}",
    sliceFunction(js, "inboundHasSystemSkuSelection"),
    sliceFunction(js, "inboundAssignmentTypeValue"),
    sliceFunction(js, "inboundSelectedProjectId"),
    sliceFunction(js, "inboundFormIsComplete"),
    sliceFunction(js, "syncInboundSubmitEnabled"),
    sliceFunction(js, "syncInboundAssignmentUi")
  ].join("\n");
  const syncInboundAssignmentUi = new Function("document", `${src}; return syncInboundAssignmentUi;`)(document);
  assignment.value = "FREE_TO_SALE";
  syncInboundAssignmentUi();
  assert.equal(project.value, "");
  assert.match(field.className, /hidden/);
});

test("submit de entrada envía asignación canónica y no infiere proyecto por SKU o lote", () => {
  const submitSrc = sliceFunction(js, "submitOperationalMovement");
  assert.match(submitSrc, /assignmentType = inboundAssignmentType/);
  assert.match(submitSrc, /projectId = inboundAssignmentType === "FREE_TO_SALE" \? null : inboundProjectId/);
  assert.doesNotMatch(submitSrc, /lote[\s\S]{0,80}assignmentType/);
  assert.match(submitSrc, /inboundHasSystemSkuSelection/);
  const inboundBlock = submitSrc.slice(submitSrc.indexOf('kind === "in"'));
  assert.doesNotMatch(inboundBlock.slice(0, 800), /product\.customer\?\.code/);
});

test("recepción Free to Sale usa helpers canónicos con projectId null", async () => {
  const tx = mockTx({ "proj-att": aviatProject });
  const assignment = await resolveInboundAssignment(tx as never, product, {
    assignmentType: "FREE_TO_SALE",
    projectId: null
  });
  assert.equal(assignment.assignmentType, "FREE_TO_SALE");
  assert.equal(assignment.projectId, null);
  assert.equal(assignment.assignmentKey, "FREE_TO_SALE");
  await assert.rejects(
    () => resolveInboundAssignment(tx as never, product, { assignmentType: "FREE_TO_SALE", projectId: "proj-att" }),
    (err: unknown) => err instanceof InventoryMutationError && err.code === "PROJECT_MUST_BE_NULL"
  );
});

test("recepción por proyecto exige proyecto activo del mismo cliente", async () => {
  const tx = mockTx({
    "proj-att": aviatProject,
    "proj-other": otherClientProject,
    "proj-off": inactiveProject
  });
  const ok = await resolveInboundAssignment(tx as never, product, {
    assignmentType: "PROJECT",
    projectId: "proj-att"
  });
  assert.equal(ok.assignmentType, "PROJECT");
  assert.equal(ok.projectId, "proj-att");
  assert.equal(ok.assignmentKey, "P:proj-att");

  await assert.rejects(
    () => resolveInboundAssignment(tx as never, product, { assignmentType: "PROJECT" }),
    (err: unknown) => err instanceof InventoryMutationError && err.code === "PROJECT_REQUIRED"
  );
  await assert.rejects(
    () => resolveInboundAssignment(tx as never, product, { assignmentType: "PROJECT", projectId: "proj-off" }),
    (err: unknown) => err instanceof InventoryMutationError && err.code === "PROJECT_INACTIVE"
  );
  await assert.rejects(
    () => resolveInboundAssignment(tx as never, product, { assignmentType: "PROJECT", projectId: "proj-other" }),
    (err: unknown) => err instanceof InventoryMutationError && err.code === "PROJECT_WRONG_CLIENT"
  );
});

test("no infiere proyecto por SKU ni por customerId del producto", async () => {
  const tx = mockTx({ "proj-att": aviatProject });
  await assert.rejects(
    () => resolveInboundAssignment(tx as never, product, {}),
    (err: unknown) => err instanceof InventoryMutationError && err.code === "ASSIGNMENT_REQUIRED"
  );
  assert.doesNotMatch(assignmentSrc, /product\.customerId\) \{\s*\n\s*const owner/);
  assert.match(assignmentSrc, /buildAssignment\("FREE_TO_SALE", null\)/);
  assert.match(assignmentSrc, /buildAssignment\("PROJECT", project\.id\)/);
  assert.match(routes, /createMovementSchema\.parse\(req\.body\)/);
  assert.match(movementSchemaSrc, /data\.type === "IN"/);
  assert.match(movementSchemaSrc, /assignmentType !== "PROJECT" && data\.assignmentType !== "FREE_TO_SALE"/);
  assert.match(movementSchemaSrc, /FREE TO SALE no admite projectId/);
});

test("las pruebas de interfaz de recepción no escriben inventario", () => {
  const thisFile = readFileSync(new URL(import.meta.url), "utf8");
  assert.doesNotMatch(thisFile, /prisma\.(inventory|inventoryLayer|inventoryMovement)\.(create|update|delete)/);
  assert.doesNotMatch(js.slice(js.indexOf("function inboundFormIsComplete"), js.indexOf("function syncInboundSubmitEnabled")), /authenticatedFetch/);
  assert.doesNotMatch(sliceFunction(js, "syncInboundAssignmentUi"), /method:\s*"POST"/);
  assert.doesNotMatch(sliceFunction(js, "fillInboundProjectSelect"), /method:\s*"POST"/);
});
