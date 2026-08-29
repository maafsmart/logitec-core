import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { isForbiddenInventoryProjectRecord, isOperationalProjectRecord } from "../src/modules/inventory/inventory-project-rules.js";

const html = readFileSync(new URL("../public/dashboard.html", import.meta.url), "utf8");
const js = readFileSync(new URL("../public/dashboard.js", import.meta.url), "utf8");
const skuSearchSrc = readFileSync(new URL("../src/modules/catalog/sku-search.service.ts", import.meta.url), "utf8");
const serviceSrc = readFileSync(new URL("../src/modules/requisitions/requisition.service.ts", import.meta.url), "utf8");
const pickingSrc = readFileSync(new URL("../src/modules/picking/picking.routes.ts", import.meta.url), "utf8");
const fifoReserveSrc = readFileSync(new URL("../src/modules/requisitions/requisition.service.ts", import.meta.url), "utf8");

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

const OPERATIONAL_SELECT_IDS = [
  "inventoryProjectSelect",
  "ccInventoryProjectSelect",
  "projectsViewProjectSelect",
  "reqCustomer",
  "outboundCustomer",
  "pickProject",
  "taskProjectSelect",
  "assignDestProject",
  "inboundProjectId"
];

test("ningún selector operativo se llena desde productsCache.customer", () => {
  assert.match(sliceFunction(js, "fillCustomerSelect"), /getOperationalProjectsForSelect\(\)/);
  assert.match(sliceFunction(js, "fillInventoryProjectSelects"), /inventoryProjectsCache/);
  assert.match(sliceFunction(js, "populatePickContextSelects"), /getOperationalProjectsForSelect\(\)/);
  assert.match(sliceFunction(js, "populateSmartOperationalFields"), /getOperationalProjectsForSelect\(\)/);
  assert.match(sliceFunction(js, "fillInboundProjectSelect"), /realActiveCatalogProjects/);
  assert.match(sliceFunction(js, "realActiveCatalogProjects"), /getOperationalProjectsForSelect\(\)/);
  for (const id of OPERATIONAL_SELECT_IDS) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  assert.doesNotMatch(sliceFunction(js, "searchSkuSuggestions"), /projectCode: product\.customer\?\.code/);
  assert.match(sliceFunction(js, "searchSkuSuggestions"), /projectCode: ""/);
});

test("autocompletar SKU no escribe LOGITEC como proyecto", () => {
  const inv = sliceFunction(js, "wireAllProductTypeaheads");
  assert.doesNotMatch(inv, /invFilterCustomer[\s\S]{0,80}item\.projectCode/);
  assert.doesNotMatch(inv, /invFilterCliente[\s\S]{0,80}item\.projectName/);
  assert.match(sliceFunction(js, "applyCatalogSuggestionToOps"), /isSuggestedOperationalProject\(item\)/);
  assert.match(sliceFunction(js, "wireReqLineSkuTypeahead"), /isSuggestedOperationalProject\(item\)/);
  assert.match(sliceFunction(js, "applyPickSuggestion"), /isSuggestedOperationalProject\(selectedCube\)/);
  const suggested = sliceFunction(js, "isSuggestedOperationalProject");
  assert.match(suggested, /isOperationalProjectRecord/);
  assert.doesNotMatch(suggested, /product\.customer/);
});

const ATT_SKU_CONTEXT = {
  product: { sku: "004740-000005-000001", name: "Radio" },
  client: { name: "AVIAT", tradeName: "AVIAT" },
  project: { id: "logitec", code: "LOGITEC", name: "LOGITEC" },
  assignmentBreakdown: {
    projects: [
      { id: "p-att", code: "ATT", name: "AT&T COMUNICACIONES DIGITALES", qty: "2", reservedQty: "0", unreservedQty: "2" },
      { id: "p-other", code: "AIRBUS", name: "AIRBUS", qty: "2", reservedQty: "0", unreservedQty: "2" }
    ],
    freeToSale: { qty: "21", reservedQty: "0", unreservedQty: "21" },
    other: { qty: "0", reservedQty: "0", unreservedQty: "0" }
  },
  inventory: {
    totalQty: "25",
    totalUnreservedQty: "25",
    locations: [
      {
        project: { id: "p-att", code: "ATT", name: "AT&T COMUNICACIONES DIGITALES" },
        assignmentType: "PROJECT",
        locationCode: "AN22-A",
        status: "OPERATIONS",
        qty: "2",
        reservedQty: "0",
        unreservedQty: "2"
      },
      { assignmentType: "FREE_TO_SALE", locationCode: "AN10-A", qty: "21", reservedQty: "0", unreservedQty: "21" },
      {
        project: { id: "p-other", code: "AIRBUS", name: "AIRBUS" },
        assignmentType: "PROJECT",
        locationCode: "AN01-A",
        qty: "2",
        reservedQty: "0",
        unreservedQty: "2"
      }
    ]
  }
};

function skuCardHarnessSource() {
  return [
    "const PRIMARY_CLIENT_AVIAT_NAME = 'AVIAT';",
    sliceFunction(js, "isForbiddenProjectLabel"),
    sliceFunction(js, "isOperationalProjectRecord"),
    sliceFunction(js, "canonicalClientDisplay"),
    sliceFunction(js, "historicalNonOperationalAssignmentLabel"),
    sliceFunction(js, "assignmentDisplayLabel"),
    sliceFunction(js, "formatInventoryStatus"),
    sliceFunction(js, "skuQtyNumber"),
    sliceFunction(js, "skuSelectedLocationLabel"),
    sliceFunction(js, "skuCardProjectLabel"),
    sliceFunction(js, "skuCardSumRows"),
    sliceFunction(js, "skuCardResolveScopedProject"),
    sliceFunction(js, "skuCardFocusFromContext"),
    sliceFunction(js, "escCell"),
    sliceFunction(js, "formatQty"),
    sliceFunction(js, "buildSkuSelectedCardHtml")
  ].join("\n");
}

function renderSkuCard(
  scope: { projectId: string; assignmentType: string },
  context: typeof ATT_SKU_CONTEXT = ATT_SKU_CONTEXT,
  cache: Array<{ id: string; code: string; name: string }> = []
) {
  const { buildSkuSelectedCardHtml } = new Function(
    `function getInventoryScope(){ return ${JSON.stringify(scope)}; }
    var inventoryProjectsCache = ${JSON.stringify(cache)};
    function inventoryStatusRecord(){ return null; }
    ${skuCardHarnessSource()}; return { buildSkuSelectedCardHtml };`
  )();
  return buildSkuSelectedCardHtml(context, "");
}

test("la tarjeta con AT&T activo muestra AVIAT, AT&T y disponible 2 no 25", () => {
  const htmlCard = renderSkuCard({ projectId: "p-att", assignmentType: "PROJECT" });
  assert.match(htmlCard, /<dt>Cliente<\/dt><dd>AVIAT<\/dd>/);
  assert.match(htmlCard, /AT&amp;T COMUNICACIONES DIGITALES/);
  assert.match(htmlCard, /<dt>Disponible en este proyecto<\/dt><dd>2<\/dd>/);
  assert.match(htmlCard, /<dt>Ubicación<\/dt><dd>AN22-A/);
  assert.match(htmlCard, /<dt>Estatus<\/dt><dd>OPERATIONS<\/dd>/);
  assert.match(htmlCard, /<dt>Reservado<\/dt><dd>0<\/dd>/);
  assert.match(htmlCard, /<dt>No reservado<\/dt><dd>2<\/dd>/);
  assert.match(htmlCard, /Total global: 25/);
  assert.match(htmlCard, /AT&amp;T COMUNICACIONES DIGITALES: 2 · Free to Sale: 21 · otros proyectos: 2/);
  assert.doesNotMatch(htmlCard, /<dt>Disponible en este proyecto<\/dt><dd>25<\/dd>/);
  assert.doesNotMatch(htmlCard, /<dt>Disponible en este proyecto<\/dt><dd>4<\/dd>/);
  assert.doesNotMatch(htmlCard, />LOGITEC</);
});

test("proyecto seleccionado sin saldo muestra 0 y no usa otro proyecto", () => {
  assert.doesNotMatch(sliceFunction(js, "skuCardFocusFromContext"), /scoped\.length \? scoped : operationalLocations/);
  const htmlCard = renderSkuCard(
    { projectId: "p-operbes", assignmentType: "PROJECT" },
    ATT_SKU_CONTEXT,
    [{ id: "p-operbes", code: "OPERBES", name: "OPERBES" }]
  );
  assert.match(htmlCard, /<dt>Cliente<\/dt><dd>AVIAT<\/dd>/);
  assert.match(htmlCard, /OPERBES/);
  assert.match(htmlCard, /<dt>Disponible en este proyecto<\/dt><dd>0<\/dd>/);
  assert.match(htmlCard, /Sin existencia en este proyecto/);
  assert.doesNotMatch(htmlCard, /<dt>Ubicación<\/dt><dd>AN22-A/);
  assert.doesNotMatch(htmlCard, /<dt>Ubicación<\/dt><dd>AN01-A/);
  assert.doesNotMatch(htmlCard, /<dt>Disponible en este proyecto<\/dt><dd>2<\/dd>/);
  assert.doesNotMatch(htmlCard, /<dt>Disponible en este proyecto<\/dt><dd>21<\/dd>/);
  assert.doesNotMatch(htmlCard, /<dt>Disponible en este proyecto<\/dt><dd>25<\/dd>/);
  assert.doesNotMatch(htmlCard, />LOGITEC</);
  assert.match(htmlCard, /Total global: 25/);
  assert.match(htmlCard, /OPERBES: 0 · Free to Sale: 21 · otros proyectos: 4/);
});

test("alcance Todos no atribuye la suma al primer proyecto ni cambia filtros", () => {
  const htmlCard = renderSkuCard({ projectId: "", assignmentType: "" });
  assert.match(htmlCard, /<dt>Proyecto<\/dt><dd>Selecciona un proyecto<\/dd>/);
  assert.match(htmlCard, /<dt>Disponible en este proyecto<\/dt><dd>—<\/dd>/);
  assert.match(htmlCard, /Total global: 25/);
  assert.match(htmlCard, /Total en proyectos: 4 · Free to Sale: 21/);
  assert.doesNotMatch(htmlCard, /Proyectos: 0/);
  assert.doesNotMatch(htmlCard, /AT&amp;T COMUNICACIONES DIGITALES/);
  assert.doesNotMatch(htmlCard, /<dt>Disponible en este proyecto<\/dt><dd>2<\/dd>/);
  assert.doesNotMatch(htmlCard, /<dt>Disponible en este proyecto<\/dt><dd>4<\/dd>/);
  assert.doesNotMatch(htmlCard, /<dt>Disponible en este proyecto<\/dt><dd>25<\/dd>/);
  assert.doesNotMatch(htmlCard, /<dt>Ubicación<\/dt><dd>AN22-A/);
  assert.doesNotMatch(sliceFunction(js, "skuCardFocusFromContext"), /invFilterCustomer|invFilterCliente|inventoryScope\.projectId\s*=/);
  assert.doesNotMatch(sliceFunction(js, "buildSkuSelectedCardHtml"), /invFilterCustomer|inventoryScope\.projectId\s*=/);
});

test("alcance FREE_TO_SALE muestra exclusivamente Free to Sale", () => {
  const htmlCard = renderSkuCard({ projectId: "", assignmentType: "FREE_TO_SALE" });
  assert.match(htmlCard, /<dt>Asignación<\/dt><dd>FREE TO SALE<\/dd>/);
  assert.match(htmlCard, /<dt>Disponible en Free to Sale<\/dt><dd>21<\/dd>/);
  assert.match(htmlCard, /<dt>Ubicación<\/dt><dd>AN10-A/);
  assert.doesNotMatch(htmlCard, /<dt>Proyecto<\/dt>/);
  assert.doesNotMatch(htmlCard, /AT&amp;T COMUNICACIONES DIGITALES/);
  assert.doesNotMatch(htmlCard, /<dt>Disponible en este proyecto<\/dt>/);
  assert.doesNotMatch(htmlCard, /<dt>Disponible en Free to Sale<\/dt><dd>25<\/dd>/);
  assert.doesNotMatch(htmlCard, /<dt>Disponible en Free to Sale<\/dt><dd>2<\/dd>/);
  assert.match(htmlCard, /Total global: 25/);
  assert.match(htmlCard, /Free to Sale: 21 · Total en proyectos: 4/);
  assert.doesNotMatch(htmlCard, /Free to Sale: 21 · Free to Sale: 21/);
  assert.doesNotMatch(htmlCard, /otros proyectos:/);
});

test("la tarjeta conserva ancho legible y no nace en la columna compacta", () => {
  const cssStart = html.indexOf(".sku-selected-card {");
  const css = html.slice(cssStart, html.indexOf(".assignee-hint {", cssStart));
  assert.match(css, /min-width:\s*min\(100%, 28rem\)/);
  assert.match(css, /repeat\(auto-fit, minmax\(9\.5rem, 1fr\)\)/);
  assert.match(css, /max-height:\s*160px/);
  assert.match(html, /id="inventorySkuSelectedHost"/);
  assert.match(sliceFunction(js, "renderSkuContext"), /inventorySkuSelectedHost/);
  assert.match(html, /dashboard\.js\?v=76/);
});

test("OS-2026-001 muestra Cliente AVIAT y no deriva el proyecto del catálogo", () => {
  const render = sliceFunction(js, "renderRequisitionDetail");
  assert.match(render, /canonicalClientDisplay\(row\)/);
  assert.match(render, /row\.project \? `\$\{row\.project\.name\} \(\$\{row\.project\.code\}\)`/);
  const canon = sliceFunction(js, "canonicalClientDisplay");
  assert.match(canon, /PRIMARY_CLIENT_AVIAT_NAME/);
  assert.match(canon, /isForbiddenProjectLabel/);
  assert.equal(
    new Function(
      `${sliceFunction(js, "isForbiddenProjectLabel")}; const PRIMARY_CLIENT_AVIAT_NAME = "AVIAT"; ${canon}; return canonicalClientDisplay({ client: null });`
    )(),
    "AVIAT"
  );
});

test("cancelar refresca panel y tabla sin recargar la página", () => {
  const cancel = sliceFunction(js, "cancelRequisitionFromDetail");
  const refresh = sliceFunction(js, "refreshRequisitionViews");
  assert.match(cancel, /refreshRequisitionViews\(row\.id\)/);
  assert.match(refresh, /loadRequisitionsList\(\)/);
  assert.match(refresh, /fetchRequisitionById\(reqId\)/);
  assert.match(refresh, /renderRequisitionDetail\(fresh\)/);
  assert.doesNotMatch(refresh, /location\.reload/);
  assert.doesNotMatch(cancel, /location\.reload/);
  assert.match(sliceFunction(js, "authenticatedFetch"), /cache: options\.cache \|\| "no-store"/);
  assert.match(sliceFunction(js, "canShowRequisitionCancel"), /APPROVED/);
  assert.match(sliceFunction(js, "canShowRequisitionCancel"), /IN_PROGRESS/);
});

test("backend no presenta LOGITEC como proyecto del SKU y sigue rechazándolo en altas", () => {
  const ctx = sliceFunction(skuSearchSrc, "getSkuContext");
  assert.match(ctx, /project: null/);
  assert.match(ctx, /assignmentBreakdown/);
  assert.match(ctx, /isForbiddenInventoryProjectRecord/);
  assert.doesNotMatch(ctx, /project: product\.customer/);
  assert.doesNotMatch(ctx, /mapSkuClient\(product\.customer\?\.client\)/);
  assert.match(ctx, /catalogOwner:/);
  assert.match(serviceSrc, /PROJECT_NOT_AVAILABLE/);
  assert.equal(isForbiddenInventoryProjectRecord({ code: "LOGITEC", name: "LOGITEC" }), true);
  assert.equal(isOperationalProjectRecord({ code: "LOGITEC", name: "LOGITEC", active: true }), false);
  assert.equal(isOperationalProjectRecord({ code: "ATT", name: "AT&T COMUNICACIONES DIGITALES", active: true }), true);
});

test("backend no deriva el cliente operativo desde product.customer.client", () => {
  const ctx = sliceFunction(skuSearchSrc, "getSkuContext");
  assert.match(ctx, /const operationalClient = mapSkuClient\(/);
  assert.match(ctx, /inventory\.assignmentType === "PROJECT"/);
  assert.match(ctx, /inventory\.project\.client/);
  assert.doesNotMatch(ctx, /mapSkuClient\(product\.customer\?\.client\)/);
  assert.doesNotMatch(ctx, /\|\| mapSkuClient\(product\.customer/);
});

test("FIFO reserva/picking y cancelación v75 permanecen intactos", () => {
  assert.match(fifoReserveSrc, /planRelocateFifoAllocation/);
  assert.match(fifoReserveSrc, /allocationMode: "FIFO"/);
  assert.match(sliceFunction(fifoReserveSrc, "cancelRequisitionInTransaction"), /task\.updateMany/);
  assert.match(pickingSrc, /consumeReservationPick/);
  assert.match(js, /function buildReservedFifoPickPayload/);
  assert.match(js, /Cancelar requisición/);
  assert.match(js, /\/api\/requisitions\/\$\{encodeURIComponent\(row\.id\)\}\/cancel/);
});
