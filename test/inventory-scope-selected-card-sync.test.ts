import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const html = readFileSync(new URL("../public/dashboard.html", import.meta.url), "utf8");
const js = readFileSync(new URL("../public/dashboard.js", import.meta.url), "utf8");
const fifoReserveSrc = readFileSync(new URL("../src/modules/requisitions/requisition.service.ts", import.meta.url), "utf8");
const pickingSrc = readFileSync(new URL("../src/modules/picking/picking.routes.ts", import.meta.url), "utf8");

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
    toggle(name: string, force?: boolean) {
      const has = String(el.className || "")
        .split(/\s+/)
        .includes(name);
      const next = force == null ? !has : Boolean(force);
      if (next) this.add(name);
      else this.remove(name);
      return next;
    },
    contains(name: string) {
      return String(el.className || "")
        .split(/\s+/)
        .includes(name);
    }
  };
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

function mockAssignmentBtn(assignment: string) {
  const attrs: Record<string, string> = { "data-assignment": assignment };
  const btn = {
    className: "js-assignment-opt",
    disabled: false,
    style: {} as { display?: string },
    getAttribute(name: string) {
      return attrs[name] ?? null;
    },
    setAttribute(name: string, value: string) {
      attrs[name] = value;
    }
  };
  btn.classList = classListFor(btn);
  return btn;
}

function makeScopeDom() {
  const todas = mockAssignmentBtn("");
  const projectBtn = mockAssignmentBtn("PROJECT");
  const ftsBtn = mockAssignmentBtn("FREE_TO_SALE");
  const select = {
    className: "js-inventory-project-select",
    value: "p-att",
    innerHTML: "",
    disabled: false
  };
  const card = {
    className: "sku-selected-card",
    hidden: false,
    innerHTML: "",
    querySelector() {
      return null;
    },
    querySelectorAll() {
      return [];
    }
  };
  card.classList = classListFor(card);
  const host = {
    id: "inventorySkuSelectedHost",
    querySelector(sel: string) {
      return sel === ".sku-selected-card" ? card : sel === ".sku-context-summary" ? null : null;
    },
    querySelectorAll(sel: string) {
      if (String(sel).includes("sku-selected-card") || String(sel).includes("sku-context-summary")) return [card];
      return [];
    },
    appendChild(node: unknown) {
      return node;
    }
  };
  const input = {
    id: "invFilterSku",
    value: "004740-000005-000001",
    dataset: { skuSelectedId: "prod-1", skuSelectedCode: "004740-000005-000001" }
  };
  const wrap = {
    querySelector(sel: string) {
      if (sel === "input") return input;
      if (sel === ".sku-context-summary") return null;
      return null;
    },
    querySelectorAll() {
      return [];
    }
  };
  const list = {
    id: "invFilterSkuSuggestions",
    parentElement: wrap,
    className: "hidden",
    hidden: true
  };
  list.classList = classListFor(list);
  const byId: Record<string, unknown> = {
    inventorySkuSelectedHost: host,
    invFilterSkuSuggestions: list,
    invFilterSku: input,
    pickCandidates: null
  };
  const assignmentBtns = [todas, projectBtn, ftsBtn];
  return {
    document: {
      getElementById(id: string) {
        return byId[id] || null;
      },
      querySelectorAll(sel: string) {
        if (sel === ".js-assignment-opt") return assignmentBtns;
        if (sel === ".js-inventory-project-select") return [select];
        if (sel === "[data-aviat-primary-label]") return [];
        if (sel === "[data-aviat-project-label]") return [];
        if (sel === "[data-aviat-assignment-label]") return [];
        return [];
      }
    },
    todas,
    projectBtn,
    ftsBtn,
    select,
    card,
    host,
    input,
    list
  };
}

function loadHarness(document: unknown) {
  const src = [
    "const PRIMARY_CLIENT_AVIAT_NAME = 'AVIAT';",
    "let inventoryScope = { projectId: 'p-att', assignmentType: 'PROJECT' };",
    "let inventoryProjectsCache = [{ id: 'p-att', code: 'ATT', name: 'AT&T COMUNICACIONES DIGITALES' }];",
    "let inventorySkuSelectedContext = null;",
    "let inventorySkuSelectedListEl = null;",
    "let searchCalls = 0;",
    "function searchSkuSuggestions(){ searchCalls += 1; return []; }",
    "async function loadStockStrip(){}",
    "async function loadInventoryMovements(){}",
    "function updateInventoryScopeUi(){ fillInventoryProjectSelects(); }",
    "function hideProductTypeaheadList(){}",
    "function buildSkuContextDetailHtml(){ return ''; }",
    "function inventoryStatusRecord(){ return null; }",
    "function owningClientDisplayName(){ return 'AVIAT'; }",
    sliceFunction(js, "escCell"),
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
    sliceFunction(js, "formatQty"),
    sliceFunction(js, "buildSkuSelectedCardHtml"),
    sliceFunction(js, "getInventoryScope"),
    sliceFunction(js, "inventoryScopeFromAssignmentOpt"),
    sliceFunction(js, "rememberInventorySkuSelectedContext"),
    sliceFunction(js, "clearInventorySkuSelectedContext"),
    sliceFunction(js, "refreshInventorySkuSelectedCard"),
    sliceFunction(js, "fillInventoryProjectSelects"),
    sliceFunction(js, "inventoryScopeLabel"),
    sliceFunction(js, "inventoryAssignmentScopeLabel"),
    sliceFunction(js, "getAviatScopeSummaryText"),
    "async " + sliceFunction(js, "setInventoryScope"),
    sliceFunction(js, "renderSkuContext")
  ].join("\n");
  return new Function(
    "document",
    `${src}; return {
      getInventoryScope,
      inventoryScopeFromAssignmentOpt,
      setInventoryScope,
      renderSkuContext,
      refreshInventorySkuSelectedCard,
      fillInventoryProjectSelects,
      inventoryScopeLabel,
      inventoryAssignmentScopeLabel,
      getAviatScopeSummaryText,
      get searchCalls(){ return searchCalls; },
      get inventoryScope(){ return inventoryScope; }
    };`
  )(document);
}

test("dashboard.js usa cache-buster v=97 para sincronizar alcance y tarjeta", () => {
  assert.match(html, /dashboard\.js\?v=97/);
  assert.doesNotMatch(html, /dashboard\.js\?v=76/);
  assert.match(sliceFunction(js, "setInventoryScope"), /refreshInventorySkuSelectedCard\(\)/);
  assert.match(sliceFunction(js, "wireInventoryScopeUi"), /inventoryScopeFromAssignmentOpt\(assignmentType\)/);
  assert.doesNotMatch(
    sliceFunction(js, "wireInventoryScopeUi"),
    /projectId: assignmentType === "FREE_TO_SALE" \? "" : getInventoryScope\(\)\.projectId/
  );
});

test("partir de AT&T y pulsar Todas limpia projectId y activa Todas en un clic", async () => {
  const dom = makeScopeDom();
  const fns = loadHarness(dom.document);
  assert.equal(fns.getInventoryScope().projectId, "p-att");
  const next = fns.inventoryScopeFromAssignmentOpt("");
  assert.equal(next.projectId, "");
  assert.equal(next.assignmentType, "");
  await fns.setInventoryScope(next, { reload: true });
  assert.equal(fns.getInventoryScope().projectId, "");
  assert.equal(fns.getInventoryScope().assignmentType, "");
  assert.equal(dom.todas.classList.contains("active"), true);
  assert.equal(dom.projectBtn.classList.contains("active"), false);
  assert.equal(dom.ftsBtn.classList.contains("active"), false);
  assert.equal(dom.select.value, "");
  assert.equal(fns.inventoryAssignmentScopeLabel(), "Todas");
  assert.equal(fns.inventoryScopeLabel(), "Todos los proyectos");
});

test("la tarjeta pasa de AT&T=2 a Todas sin volver a buscar el SKU", async () => {
  const dom = makeScopeDom();
  const fns = loadHarness(dom.document);
  fns.renderSkuContext(dom.list, ATT_SKU_CONTEXT);
  assert.match(dom.card.innerHTML, /<dt>Cliente<\/dt><dd>AVIAT<\/dd>/);
  assert.match(dom.card.innerHTML, /<dt>Disponible en este proyecto<\/dt><dd>2<\/dd>/);
  assert.match(dom.card.innerHTML, /AN22-A/);
  assert.doesNotMatch(dom.card.innerHTML, />LOGITEC</);
  await fns.setInventoryScope(fns.inventoryScopeFromAssignmentOpt(""), { reload: true });
  assert.equal(fns.searchCalls, 0);
  assert.equal(dom.input.value, "004740-000005-000001");
  assert.equal(dom.input.dataset.skuSelectedId, "prod-1");
  assert.match(dom.card.innerHTML, /<dt>Proyecto<\/dt><dd>Selecciona un proyecto<\/dd>/);
  assert.match(dom.card.innerHTML, /<dt>Disponible en este proyecto<\/dt><dd>—<\/dd>/);
  assert.match(dom.card.innerHTML, /Total global: 25/);
  assert.match(dom.card.innerHTML, /Total en proyectos: 4 · Free to Sale: 21/);
  assert.doesNotMatch(dom.card.innerHTML, /<dt>Disponible en este proyecto<\/dt><dd>2<\/dd>/);
  assert.doesNotMatch(dom.card.innerHTML, /AT&amp;T COMUNICACIONES DIGITALES: 2/);
  assert.doesNotMatch(dom.card.innerHTML, />LOGITEC</);
  const summary = fns.getAviatScopeSummaryText();
  assert.match(summary, /Todos los proyectos/);
  assert.match(summary, /Todas/);
  assert.equal(fns.getInventoryScope().projectId, "");
});

test("Free to Sale limpia el proyecto y muestra 21; regresar a AT&T vuelve a 2", async () => {
  const dom = makeScopeDom();
  const fns = loadHarness(dom.document);
  fns.renderSkuContext(dom.list, ATT_SKU_CONTEXT);
  await fns.setInventoryScope(fns.inventoryScopeFromAssignmentOpt("FREE_TO_SALE"), { reload: true });
  assert.equal(fns.getInventoryScope().projectId, "");
  assert.equal(fns.getInventoryScope().assignmentType, "FREE_TO_SALE");
  assert.equal(dom.ftsBtn.classList.contains("active"), true);
  assert.equal(dom.todas.classList.contains("active"), false);
  assert.equal(dom.select.value, "");
  assert.match(dom.card.innerHTML, /<dt>Asignación<\/dt><dd>FREE TO SALE<\/dd>/);
  assert.match(dom.card.innerHTML, /<dt>Disponible en Free to Sale<\/dt><dd>21<\/dd>/);
  assert.match(dom.card.innerHTML, /Free to Sale: 21 · Total en proyectos: 4/);
  assert.doesNotMatch(dom.card.innerHTML, /AT&amp;T COMUNICACIONES DIGITALES/);
  assert.doesNotMatch(dom.card.innerHTML, />LOGITEC</);
  assert.equal(dom.input.value, "004740-000005-000001");
  assert.equal(fns.searchCalls, 0);

  await fns.setInventoryScope({ projectId: "p-att", assignmentType: "PROJECT" }, { reload: true });
  assert.equal(fns.getInventoryScope().projectId, "p-att");
  assert.equal(dom.projectBtn.classList.contains("active"), true);
  assert.match(dom.card.innerHTML, /<dt>Disponible en este proyecto<\/dt><dd>2<\/dd>/);
  assert.match(dom.card.innerHTML, /AT&amp;T COMUNICACIONES DIGITALES/);
  assert.match(dom.card.innerHTML, /AN22-A/);
  assert.equal(dom.input.value, "004740-000005-000001");
  assert.equal(fns.searchCalls, 0);
});

test("Con proyecto sin selección no inventa un proyecto y no hay fallback a otros saldos", async () => {
  const dom = makeScopeDom();
  const fns = loadHarness(dom.document);
  await fns.setInventoryScope(fns.inventoryScopeFromAssignmentOpt(""), { reload: false });
  const next = fns.inventoryScopeFromAssignmentOpt("PROJECT");
  assert.equal(next.projectId, "");
  assert.equal(next.assignmentType, "PROJECT");
  await fns.setInventoryScope(next, { reload: false });
  assert.equal(fns.getInventoryScope().projectId, "");
  assert.equal(fns.getInventoryScope().assignmentType, "PROJECT");
  assert.equal(dom.projectBtn.classList.contains("active"), true);
  assert.doesNotMatch(sliceFunction(js, "skuCardFocusFromContext"), /scoped\.length \? scoped : operationalLocations/);
});

test("AVIAT sigue como cliente, LOGITEC queda fuera, FIFO y cancelación permanecen", () => {
  assert.match(sliceFunction(js, "canonicalClientDisplay"), /owningClientDisplayName/);
  assert.match(js, /function isForbiddenProjectLabel/);
  assert.match(fifoReserveSrc, /planRelocateFifoAllocation/);
  assert.match(fifoReserveSrc, /allocationMode: "FIFO"/);
  assert.match(sliceFunction(fifoReserveSrc, "cancelRequisitionInTransaction"), /task\.updateMany/);
  assert.match(pickingSrc, /consumeReservationPick/);
  assert.match(js, /function buildReservedFifoPickPayload/);
  assert.match(js, /Cancelar requisición/);
});
