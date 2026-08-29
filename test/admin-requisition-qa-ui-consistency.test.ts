import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const html = readFileSync(new URL("../public/dashboard.html", import.meta.url), "utf8");
const js = readFileSync(new URL("../public/dashboard.js", import.meta.url), "utf8");
const fifoReserveSrc = readFileSync(new URL("../src/modules/requisitions/requisition.service.ts", import.meta.url), "utf8");
const pickingSrc = readFileSync(new URL("../src/modules/picking/picking.routes.ts", import.meta.url), "utf8");
const mutationSrc = readFileSync(
  new URL("../src/modules/inventory/inventory-mutation.service.ts", import.meta.url),
  "utf8"
);

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
  formScope: { projectId: string; assignmentType: string } | null,
  inventoryScope = { projectId: "", assignmentType: "" },
  context: typeof ATT_SKU_CONTEXT = ATT_SKU_CONTEXT,
  cache: Array<{ id: string; code: string; name: string }> = [
    { id: "p-att", code: "ATT", name: "AT&T COMUNICACIONES DIGITALES" }
  ]
) {
  const { buildSkuSelectedCardHtml } = new Function(
    `function getInventoryScope(){ return ${JSON.stringify(inventoryScope)}; }
    var inventoryProjectsCache = ${JSON.stringify(cache)};
    function inventoryStatusRecord(){ return null; }
    ${skuCardHarnessSource()}; return { buildSkuSelectedCardHtml };`
  )() as { buildSkuSelectedCardHtml: (ctx: unknown, detail: string, scope?: unknown) => string };
  return buildSkuSelectedCardHtml(context, "", formScope);
}

function classListFor(el: { className: string }) {
  return {
    add(name: string) {
      const parts = new Set(String(el.className || "").split(/\s+/).filter(Boolean));
      parts.add(name);
      el.className = [...parts].join(" ");
    },
    remove(name: string) {
      el.className = String(el.className || "")
        .split(/\s+/)
        .filter((part) => part && part !== name)
        .join(" ");
    },
    contains(name: string) {
      return String(el.className || "")
        .split(/\s+/)
        .includes(name);
    }
  };
}

function makeReqSkuDom() {
  const wrap: Record<string, unknown> = {};
  const sku: {
    id: string;
    value: string;
    dataset: Record<string, string | undefined>;
    focused: boolean;
    focus: () => void;
    closest: (sel: string) => unknown;
  } = {
    id: "reqSku",
    value: "004740-000005-000001",
    dataset: { skuSelectedId: "prod-att", skuSelectedCode: "004740-000005-000001" },
    focused: false,
    focus() {
      this.focused = true;
    },
    closest(sel: string) {
      return sel === "[data-pta]" ? wrap : null;
    }
  };
  const card: Record<string, unknown> = {
    className: "sku-selected-card",
    hidden: false,
    innerHTML: "✓ SKU seleccionado Radio"
  };
  card.classList = classListFor(card as { className: string });
  const list: Record<string, unknown> = {
    id: "reqSkuSuggestions",
    className: "product-typeahead-list",
    hidden: true,
    innerHTML: ""
  };
  list.classList = classListFor(list as { className: string });
  wrap.className = "product-typeahead";
  wrap.getAttribute = (name: string) => (name === "data-pta" ? "req" : null);
  wrap.querySelector = (sel: string) => {
    if (sel === "input") return sku;
    if (sel === ".sku-selected-card") return card;
    if (sel === ".sku-context-summary") return null;
    return null;
  };
  wrap.querySelectorAll = (sel: string) => {
    if (String(sel).includes("sku-selected-card") || String(sel).includes("sku-context-summary")) return [card];
    return [];
  };
  wrap.closest = (sel: string) => (sel === "[data-pta]" ? wrap : null);
  list.parentElement = wrap;
  list.closest = wrap.closest;
  const customer = { id: "reqCustomer", value: "ATT" };
  const cliente = { id: "reqCliente", value: "AT&T COMUNICACIONES DIGITALES" };
  const product = { id: "reqProduct", value: "Radio" };
  const document = {
    getElementById(id: string) {
      if (id === "reqSku") return sku;
      if (id === "reqSkuSuggestions") return list;
      if (id === "reqCustomer") return customer;
      if (id === "reqCliente") return cliente;
      if (id === "reqProduct") return product;
      if (id === "inventorySkuSelectedHost") return null;
      return null;
    }
  };
  return { sku, list, wrap, card, customer, product, document };
}

function loadReqSkuHarness(document: unknown) {
  const src = [
    "let requisitionSkuSelectedContext = null;",
    "let requisitionSkuSelectedListEl = null;",
    "const renderCalls = [];",
    "function renderSkuContext(listEl, context){ renderCalls.push(context); }",
    sliceFunction(js, "opsPrefixFromTypeahead"),
    sliceFunction(js, "hideSkuSelectedCard"),
    sliceFunction(js, "hideProductTypeaheadList"),
    sliceFunction(js, "clearSkuSelectionFields"),
    sliceFunction(js, "beginSkuChange"),
    sliceFunction(js, "invalidateSkuSelection"),
    sliceFunction(js, "rememberRequisitionSkuSelectedContext"),
    sliceFunction(js, "clearRequisitionSkuSelectedContext"),
    sliceFunction(js, "refreshRequisitionSkuSelectedCard")
  ].join("\n");
  return new Function(
    "document",
    `${src}; return {
      rememberRequisitionSkuSelectedContext,
      clearRequisitionSkuSelectedContext,
      refreshRequisitionSkuSelectedCard,
      beginSkuChange,
      invalidateSkuSelection,
      get context(){ return requisitionSkuSelectedContext; },
      get listEl(){ return requisitionSkuSelectedListEl; },
      get renderCalls(){ return renderCalls; }
    };`
  )(document) as {
    rememberRequisitionSkuSelectedContext: (listEl: unknown, context: unknown) => void;
    clearRequisitionSkuSelectedContext: () => void;
    refreshRequisitionSkuSelectedCard: () => void;
    beginSkuChange: (listEl: unknown, input: unknown) => void;
    invalidateSkuSelection: (listEl: unknown, input: unknown) => boolean;
    context: { product?: { sku?: string } } | null;
    listEl: unknown;
    renderCalls: Array<{ product?: { sku?: string } }>;
  };
}

function reqTableFns() {
  return new Function(
    `const PRIMARY_CLIENT_AVIAT_NAME = "AVIAT";
    ${sliceFunction(js, "isForbiddenProjectLabel")}
    ${sliceFunction(js, "canonicalClientDisplay")}
    ${sliceFunction(js, "formatReqTableClient")}
    ${sliceFunction(js, "formatReqTableProject")}
    return { formatReqTableClient, formatReqTableProject, canonicalClientDisplay };`
  )() as {
    formatReqTableClient: (row: unknown) => string;
    formatReqTableProject: (row: unknown) => string;
    canonicalClientDisplay: (row: unknown) => string;
  };
}

test("cache-buster dashboard.js?v=79 para consistencia visual de requisiciones", () => {
  assert.match(html, /dashboard\.js\?v=79/);
  assert.doesNotMatch(html, /dashboard\.js\?v=78/);
});

test("formulario AT&T + SKU ya cargado usa el proyecto de la requisición, no el alcance Inventario", () => {
  const htmlCard = renderSkuCard({ projectId: "p-att", assignmentType: "PROJECT" }, { projectId: "", assignmentType: "" });
  assert.match(htmlCard, /<dt>Cliente<\/dt><dd>AVIAT<\/dd>/);
  assert.match(htmlCard, /AT&amp;T COMUNICACIONES DIGITALES/);
  assert.match(htmlCard, /<dt>Disponible en este proyecto<\/dt><dd>2<\/dd>/);
  assert.match(htmlCard, /<dt>Ubicación<\/dt><dd>AN22-A/);
  assert.match(htmlCard, /<dt>Estatus<\/dt><dd>OPERATIONS<\/dd>/);
  assert.match(htmlCard, /<dt>Reservado<\/dt><dd>0<\/dd>/);
  assert.match(htmlCard, /<dt>No reservado<\/dt><dd>2<\/dd>/);
  assert.doesNotMatch(htmlCard, /Selecciona un proyecto/);
  assert.doesNotMatch(htmlCard, /<dt>Disponible en este proyecto<\/dt><dd>—<\/dd>/);
  assert.doesNotMatch(htmlCard, /<dt>Disponible en este proyecto<\/dt><dd>25<\/dd>/);
  assert.doesNotMatch(htmlCard, /<dt>Disponible en este proyecto<\/dt><dd>4<\/dd>/);
  assert.doesNotMatch(htmlCard, />LOGITEC</);
  assert.match(sliceFunction(js, "skuCardScopeFromTypeahead"), /reqSkuSuggestions/);
  assert.match(sliceFunction(js, "requisitionFormSkuCardScope"), /reqCustomer/);
  assert.doesNotMatch(sliceFunction(js, "requisitionFormSkuCardScope"), /getInventoryScope/);
  assert.match(sliceFunction(js, "renderSkuContext"), /skuCardScopeFromTypeahead\(listEl\)/);
  assert.match(sliceFunction(js, "buildSkuSelectedCardHtml"), /skuCardFocusFromContext\(context, scopeOverride\)/);
});

test("cambiar proyecto de la requisición re-renderiza la tarjeta y no borra el SKU", () => {
  const att = renderSkuCard({ projectId: "p-att", assignmentType: "PROJECT" });
  const empty = renderSkuCard(
    { projectId: "p-operbes", assignmentType: "PROJECT" },
    { projectId: "", assignmentType: "" },
    ATT_SKU_CONTEXT,
    [{ id: "p-operbes", code: "OPERBES", name: "OPERBES" }]
  );
  assert.match(att, /004740-000005-000001/);
  assert.match(empty, /004740-000005-000001/);
  assert.match(empty, /OPERBES/);
  const wire = sliceFunction(js, "wireOperationalForms");
  assert.match(wire, /refreshRequisitionSkuSelectedCard\(\)/);
  assert.doesNotMatch(wire, /skuSelectedId\s*=/);
  assert.doesNotMatch(sliceFunction(js, "refreshRequisitionSkuSelectedCard"), /\.value\s*=/);
  assert.doesNotMatch(sliceFunction(js, "fillSkuSelect"), /skuSelectedId/);
  const fill = sliceFunction(js, "fillSkuSelect");
  assert.ok(fill.indexOf('sel.tagName !== "SELECT"') < fill.indexOf("sel.innerHTML"));

  const dom = makeReqSkuDom();
  const fns = loadReqSkuHarness(dom.document);
  fns.rememberRequisitionSkuSelectedContext(dom.list, ATT_SKU_CONTEXT);
  assert.equal(fns.context?.product?.sku, "004740-000005-000001");
  assert.equal(dom.sku.value, "004740-000005-000001");
  assert.equal(dom.sku.dataset.skuSelectedId, "prod-att");
  dom.customer.value = "OPERBES";
  fns.refreshRequisitionSkuSelectedCard();
  assert.equal(dom.sku.value, "004740-000005-000001");
  assert.equal(dom.sku.dataset.skuSelectedId, "prod-att");
  assert.equal(dom.sku.dataset.skuSelectedCode, "004740-000005-000001");
  assert.equal(fns.renderCalls.length, 1);
  assert.equal(fns.renderCalls[0]?.product?.sku, "004740-000005-000001");
  assert.equal(fns.context?.product?.sku, "004740-000005-000001");
});

test("Cambiar SKU en requisición limpia input, IDs, tarjeta y contexto guardado", () => {
  assert.match(sliceFunction(js, "clearSkuSelectionFields"), /prefix === "req"/);
  assert.match(sliceFunction(js, "clearSkuSelectionFields"), /clearRequisitionSkuSelectedContext/);
  assert.match(sliceFunction(js, "hideSkuSelectedCard"), /clearRequisitionSkuSelectedContext/);
  assert.match(sliceFunction(js, "beginSkuChange"), /clearSkuSelectionFields/);
  const dom = makeReqSkuDom();
  const fns = loadReqSkuHarness(dom.document);
  fns.rememberRequisitionSkuSelectedContext(dom.list, ATT_SKU_CONTEXT);
  fns.beginSkuChange(dom.list, dom.sku);
  assert.equal(dom.sku.value, "");
  assert.equal(dom.sku.dataset.skuSelectedId, undefined);
  assert.equal(dom.sku.dataset.skuSelectedCode, undefined);
  assert.equal(dom.product.value, "");
  assert.equal(dom.card.hidden, true);
  assert.equal(String(dom.card.innerHTML), "");
  assert.equal(fns.context, null);
  assert.equal(fns.listEl, null);
  assert.equal(dom.sku.focused, true);
  assert.equal(dom.customer.value, "ATT");
});

test("después de limpiar el SKU, cambiar el proyecto no re-renderiza la tarjeta anterior", () => {
  const dom = makeReqSkuDom();
  const fns = loadReqSkuHarness(dom.document);
  fns.rememberRequisitionSkuSelectedContext(dom.list, ATT_SKU_CONTEXT);
  fns.beginSkuChange(dom.list, dom.sku);
  assert.equal(fns.context, null);
  const before = fns.renderCalls.length;
  dom.customer.value = "OPERBES";
  fns.refreshRequisitionSkuSelectedCard();
  assert.equal(fns.renderCalls.length, before);
  assert.equal(fns.context, null);
  assert.doesNotMatch(String(dom.card.innerHTML), /004740-000005-000001/);
  const edited = makeReqSkuDom();
  const editedFns = loadReqSkuHarness(edited.document);
  editedFns.rememberRequisitionSkuSelectedContext(edited.list, ATT_SKU_CONTEXT);
  edited.sku.value = "004740-000005-000001X";
  assert.equal(editedFns.invalidateSkuSelection(edited.list, edited.sku), true);
  assert.equal(editedFns.context, null);
  edited.customer.value = "OPERBES";
  editedFns.refreshRequisitionSkuSelectedCard();
  assert.equal(editedFns.renderCalls.length, 0);
});

test("seleccionar otro SKU guarda el contexto nuevo y el anterior no reaparece", () => {
  const otherSku = {
    ...ATT_SKU_CONTEXT,
    product: { sku: "OTHER-SKU-000001", name: "Otro radio" }
  };
  const dom = makeReqSkuDom();
  const fns = loadReqSkuHarness(dom.document);
  fns.rememberRequisitionSkuSelectedContext(dom.list, ATT_SKU_CONTEXT);
  fns.beginSkuChange(dom.list, dom.sku);
  assert.equal(fns.context, null);
  dom.sku.value = "OTHER-SKU-000001";
  dom.sku.dataset.skuSelectedId = "prod-other";
  dom.sku.dataset.skuSelectedCode = "OTHER-SKU-000001";
  fns.rememberRequisitionSkuSelectedContext(dom.list, otherSku);
  assert.equal(fns.context?.product?.sku, "OTHER-SKU-000001");
  fns.refreshRequisitionSkuSelectedCard();
  assert.equal(fns.renderCalls.length, 1);
  assert.equal(fns.renderCalls[0]?.product?.sku, "OTHER-SKU-000001");
  assert.notEqual(fns.renderCalls[0]?.product?.sku, "004740-000005-000001");
  assert.doesNotMatch(sliceFunction(js, "refreshInventorySkuSelectedCard"), /requisitionSkuSelected/);
  assert.doesNotMatch(sliceFunction(js, "clearInventorySkuSelectedContext"), /requisitionSkuSelected/);
});

test("proyecto de requisición sin saldo muestra 0 y no toma saldo global ni de otro proyecto", () => {
  const htmlCard = renderSkuCard(
    { projectId: "p-operbes", assignmentType: "PROJECT" },
    { projectId: "", assignmentType: "" },
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
});

test("tabla y panel de requisiciones muestran Cliente AVIAT desde la fuente canónica", () => {
  const { formatReqTableClient, formatReqTableProject, canonicalClientDisplay } = reqTableFns();
  const row = {
    project: { id: "p-att", code: "ATT", name: "AT&T COMUNICACIONES DIGITALES" },
    client: null,
    product: { customer: { name: "LOGITEC", code: "LOGITEC" } },
    lines: [{ product: { customer: { name: "LOGITEC" } } }]
  };
  assert.equal(formatReqTableClient(row), "AVIAT");
  assert.equal(canonicalClientDisplay(row), "AVIAT");
  assert.equal(formatReqTableClient({ client: { tradeName: "AVIAT", name: "AVIAT Networks" } }), "AVIAT");
  assert.equal(formatReqTableClient({ client: { name: "LOGITEC" } }), "AVIAT");
  assert.equal(
    formatReqTableProject(row),
    "AT&T COMUNICACIONES DIGITALES (ATT)"
  );
  assert.equal(formatReqTableProject({ project: { code: "LOGITEC", name: "LOGITEC" } }), "—");
  const clientFn = sliceFunction(js, "formatReqTableClient");
  assert.match(clientFn, /canonicalClientDisplay\(row\)/);
  assert.doesNotMatch(clientFn, /product\.customer/);
  assert.doesNotMatch(sliceFunction(js, "formatReqTableProject"), /product\.customer/);
  assert.doesNotMatch(sliceFunction(js, "renderRequisitionDetail"), /product\.customer/);
  assert.match(js, /label: "Cliente",\s*sortKey: \(t\) => formatReqTableClient\(t\)/);
  assert.match(sliceFunction(js, "loadRequisitionsList"), /columns: REQ_COLUMNS/);
  assert.match(sliceFunction(js, "renderRequisitionDetail"), /canonicalClientDisplay\(row\)/);
  assert.doesNotMatch(sliceFunction(js, "setGridDensity"), /REQ_COLUMNS/);
  assert.match(html, /data-density="compact"/);
  assert.match(html, /data-density="comfortable"/);
});

test("cancelación con panel abierto reemplaza el contenido inmediatamente sin cerrar/reabrir", async () => {
  const refresh = sliceFunction(js, "refreshRequisitionViews");
  const cancel = sliceFunction(js, "cancelRequisitionFromDetail");
  assert.ok(refresh.indexOf("fetchRequisitionById") < refresh.indexOf("loadRequisitionsList"));
  assert.match(refresh, /renderRequisitionDetail\(fresh\)/);
  assert.match(cancel, /renderRequisitionDetail\(data\)/);
  assert.ok(cancel.indexOf("renderRequisitionDetail(data)") < cancel.indexOf("refreshRequisitionViews(row.id)"));
  assert.match(sliceFunction(js, "fetchRequisitionById"), /cache: "no-store"/);

  const order: string[] = [];
  const rendered: Array<{ status?: string; totals?: { reservedQty?: string }; lines?: unknown[] }> = [];
  const refreshRequisitionViews = new Function(
    "authenticatedFetch",
    "renderRequisitionDetail",
    "loadRequisitionsList",
    "loadTasks",
    "loadStockStrip",
    "loadInventoryMovements",
    "loadTraceability",
    "loadScanEvents",
    `async ${sliceFunction(js, "fetchRequisitionById")}\nasync ${refresh}; return refreshRequisitionViews;`
  )(
    async () => {
      order.push("fetch");
      return {
        ok: true,
        json: async () => ({
          id: "req-1",
          number: "QA-UI-CANCEL",
          status: "CANCELLED",
          totals: { reservedQty: "0", requestedQty: "2", fulfilledQty: "0", pendingQty: "2" },
          project: { name: "AT&T COMUNICACIONES DIGITALES", code: "ATT" },
          client: { name: "AVIAT" },
          lines: [
            {
              reservedQty: "0",
              requestedQty: "2",
              fulfilledQty: "0",
              pendingQty: "2",
              reservations: [{ activeQty: "0", status: "RELEASED", inventoryId: "inv-1" }]
            }
          ]
        })
      };
    },
    (row: { status?: string }) => {
      order.push("render");
      rendered.push(row);
    },
    async () => {
      order.push("list");
    },
    async () => {
      order.push("tasks");
    },
    async () => {
      order.push("stock");
    },
    async () => {
      order.push("movements");
    },
    async () => {},
    async () => {}
  ) as (id: string) => Promise<void>;

  await refreshRequisitionViews("req-1");
  assert.equal(order[0], "fetch");
  assert.equal(order[1], "render");
  assert.ok(order.indexOf("render") < order.indexOf("list"));
  assert.equal(rendered[0]?.status, "CANCELLED");
  assert.equal(rendered[0]?.totals?.reservedQty, "0");

  const captured: { fields: Array<{ label: string; value: string }>; actions: Array<{ label: string }> } = {
    fields: [],
    actions: []
  };
  const renderRequisitionDetail = new Function(
    "openDetailDrawer",
    `const PRIMARY_CLIENT_AVIAT_NAME = "AVIAT";
    let currentRole = "ADMIN";
    ${sliceFunction(js, "isForbiddenProjectLabel")}
    ${sliceFunction(js, "canonicalClientDisplay")}
    ${sliceFunction(js, "reqQtyNumber")}
    ${sliceFunction(js, "formatQty")}
    ${sliceFunction(js, "groupRequisitionLineCubes")}
    ${sliceFunction(js, "lineReservableQty")}
    ${sliceFunction(js, "canSubmitRequisitionUi")}
    ${sliceFunction(js, "canApproveRequisitionUi")}
    ${sliceFunction(js, "canReserveRequisitionUi")}
    ${sliceFunction(js, "canPickReservedUi")}
    ${sliceFunction(js, "canCancelRequisitionUi")}
    ${sliceFunction(js, "canShowRequisitionCancel")}
    ${sliceFunction(js, "renderRequisitionDetail")}
    return renderRequisitionDetail;`
  )((title: string, fields: Array<{ label: string; value: string }>, actions: Array<{ label: string }>) => {
    captured.fields = fields;
    captured.actions = actions;
  }) as (row: unknown) => void;

  renderRequisitionDetail({
    id: "req-1",
    number: "QA-UI-CANCEL",
    status: "CANCELLED",
    project: { name: "AT&T COMUNICACIONES DIGITALES", code: "ATT" },
    client: { name: "AVIAT" },
    fulfillmentStatus: "PENDING",
    lines: [
      {
        product: { sku: "004740-000005-000001", name: "Radio" },
        requestedQty: "2",
        reservedQty: "0",
        fulfilledQty: "0",
        pendingQty: "2",
        stock: { projectAvailable: "2", freeToSaleAvailable: "0", otherProjectsAvailable: "0" },
        reservations: [{ activeQty: "0", status: "RELEASED", inventoryId: "inv-1", qty: "2", consumedQty: "0" }]
      }
    ]
  });
  const labels = captured.fields.map((f) => `${f.label}: ${f.value}`).join("\n");
  assert.match(labels, /Estado: CANCELLED/);
  assert.match(labels, /Cliente: AVIAT/);
  assert.match(labels, /AT&T COMUNICACIONES DIGITALES/);
  assert.match(labels, /Solicitado: 2/);
  assert.match(labels, /Reservado: 0/);
  assert.match(labels, /Pendiente: 2/);
  assert.doesNotMatch(labels, /Reserva activa/);
  assert.doesNotMatch(labels, /Cubo reservado/);
  assert.equal(
    captured.actions.some((a) => /Reservar|Surtir reservado|Cancelar requisición/.test(a.label)),
    false
  );
  assert.doesNotMatch(cancel, /closeDetailDrawer/);
  assert.doesNotMatch(refresh, /closeDetailDrawer/);
});

test("regresiones: picking FIFO serializado, cancelación e Inventario/AVIAT intactos", () => {
  assert.match(js, /function buildReservedFifoPickPayload/);
  assert.match(sliceFunction(js, "buildReservedFifoPickPayload"), /allocationMode: "FIFO"/);
  assert.match(js, /function refreshReservedPickEligibleSerials/);
  assert.match(js, /function addReservedPickSerialFromScan/);
  assert.match(js, /reqActionSerialCounter/);
  assert.match(html, /Escanear serie o IMEI/);
  assert.match(pickingSrc, /serialIds: z\.array/);
  assert.match(fifoReserveSrc, /SERIALS_MISSING_ON_LAYER/);
  assert.doesNotMatch(sliceFunction(fifoReserveSrc, "cancelRequisitionInTransaction"), /inventorySerial\.delete/);
  assert.doesNotMatch(sliceFunction(fifoReserveSrc, "cancelRequisitionInTransaction"), /inventoryLayerId: null/);
  assert.match(sliceFunction(fifoReserveSrc, "cancelRequisitionInTransaction"), /status: "RELEASED"/);
  assert.match(mutationSrc, /type === "RELOCATE"/);
  assert.match(sliceFunction(js, "skuCardFocusFromContext"), /FREE_TO_SALE/);
  assert.match(sliceFunction(js, "refreshInventorySkuSelectedCard"), /inventorySkuSelectedContext/);
  assert.doesNotMatch(sliceFunction(js, "skuCardFocusFromContext"), /reqCustomer/);
  assert.match(sliceFunction(js, "canonicalClientDisplay"), /PRIMARY_CLIENT_AVIAT_NAME/);
  assert.match(sliceFunction(js, "isForbiddenProjectLabel"), /LOGITEC/);
});
