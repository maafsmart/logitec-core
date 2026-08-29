import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const html = readFileSync(new URL("../public/dashboard.html", import.meta.url), "utf8");
const js = readFileSync(new URL("../public/dashboard.js", import.meta.url), "utf8");

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

function sliceBlock(source: string, token: string): string {
  const start = source.indexOf(token);
  assert.ok(start >= 0, `missing ${token}`);
  const brace = source.indexOf("{", start);
  assert.ok(brace >= 0, `missing body for ${token}`);
  let depth = 0;
  for (let i = brace; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === "{") depth += 1;
    else if (ch === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  throw new Error(`unclosed ${token}`);
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

function makeInboundDom(opts?: { sku?: string; productId?: string; productName?: string }) {
  const skuValue = opts?.sku ?? "2223158-4";
  const productIdValue = opts?.productId ?? "prod-1";
  const wrap: Record<string, unknown> = {
    getAttribute(name: string) {
      return name === "data-pta" ? "inbound" : null;
    }
  };
  const sku: Record<string, unknown> = {
    id: "inboundSku",
    value: skuValue,
    dataset: { skuSelectedId: productIdValue, skuSelectedCode: skuValue },
    focused: false,
    focus() {
      sku.focused = true;
    },
    closest(sel: string) {
      return sel === "[data-pta]" ? wrap : null;
    }
  };
  const list: Record<string, unknown> = {
    id: "inboundSkuSuggestions",
    className: "",
    hidden: false,
    innerHTML: `<button type="button" class="product-typeahead-item">2223158-4</button>`,
    parentElement: wrap,
    closest(sel: string) {
      return sel === "[data-pta]" ? wrap : null;
    }
  };
  list.classList = classListFor(list as { className: string });
  const card: Record<string, unknown> = {
    className: "sku-selected-card",
    hidden: false,
    innerHTML: "✓ SKU seleccionado"
  };
  card.classList = classListFor(card as { className: string });
  const product = { id: "inboundProduct", value: opts?.productName ?? "Equipo de radio" };
  const productId = { id: "inboundProductId", value: productIdValue };
  const assignment = { id: "inboundAssignmentType", value: "PROJECT" };
  const project = { id: "inboundProjectId", value: "proj-aviat" };
  const qty = { id: "inboundQty", value: "2" };
  const status = { id: "inboundStatus", value: "AVAILABLE" };
  const warehouse = { id: "inboundWarehouse", value: "TULTITLAN24" };
  const location = { id: "inboundLocation", value: "AN14-F" };
  const submit = { id: "inboundSubmitBtn", disabled: false };
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
  const byId: Record<string, unknown> = {
    inboundSku: sku,
    inboundProduct: product,
    inboundProductId: productId,
    inboundAssignmentType: assignment,
    inboundProjectId: project,
    inboundQty: qty,
    inboundStatus: status,
    inboundWarehouse: warehouse,
    inboundLocation: location,
    inboundSubmitBtn: submit
  };
  return {
    document: {
      getElementById(id: string) {
        return byId[id] || null;
      }
    },
    sku,
    product,
    productId,
    assignment,
    project,
    qty,
    status,
    warehouse,
    location,
    submit,
    list,
    card,
    wrap
  };
}

function loadSkuFns(document: unknown) {
  const src = [
    sliceFunction(js, "inboundHasSystemSkuSelection"),
    sliceFunction(js, "inboundAssignmentTypeValue"),
    sliceFunction(js, "inboundSelectedProjectId"),
    sliceFunction(js, "inboundFormIsComplete"),
    sliceFunction(js, "syncInboundSubmitEnabled"),
    sliceFunction(js, "hideSkuSelectedCard"),
    sliceFunction(js, "hideProductTypeaheadList"),
    sliceFunction(js, "opsPrefixFromTypeahead"),
    sliceFunction(js, "clearSkuSelectionFields"),
    sliceFunction(js, "beginSkuChange"),
    sliceFunction(js, "invalidateSkuSelection")
  ].join("\n");
  return new Function(
    "document",
    `${src}; return { inboundHasSystemSkuSelection, inboundFormIsComplete, syncInboundSubmitEnabled, hideSkuSelectedCard, hideProductTypeaheadList, beginSkuChange, invalidateSkuSelection };`
  )(document);
}

test("dashboard.js usa cache-buster v=73 para la tarjeta de SKU", () => {
  assert.match(html, /dashboard\.js\?v=73/);
  assert.doesNotMatch(html, /dashboard\.js\?v=65/);
});

test("Registrar entrada nace deshabilitado y exige inboundProductId", () => {
  assert.match(html, /id="inboundProductId"/);
  assert.match(html, /id="inboundSubmitBtn"[^>]*\bdisabled\b/);
  assert.match(html, /data-pta="inbound"/);
});

test("la tarjeta de SKU tiene estilo compacto y distinto al meta operativo", () => {
  const cssStart = html.indexOf(".sku-selected-card {");
  assert.ok(cssStart > 0);
  const css = html.slice(cssStart, html.indexOf(".sku-selected-detail-body", cssStart) + 80);
  assert.match(css, /background:\s*#ecfdf5/);
  assert.match(css, /border:\s*1\.5px solid #059669/);
  assert.doesNotMatch(css, /operational-table-meta/);
  assert.doesNotMatch(css, /#0d1730/);
});

test("al elegir una sugerencia se cierra la lista antes de mostrar contexto", () => {
  const wireSrc = sliceFunction(js, "wireProductTypeahead");
  const pickSrc = sliceBlock(wireSrc, "const pick = (item) =>");
  const closeIdx = pickSrc.indexOf("close();");
  const loadIdx = pickSrc.indexOf("loadSkuContext");
  const hideIdx = pickSrc.indexOf("hideProductTypeaheadList(listEl)");
  const renderIdx = pickSrc.indexOf("renderSkuContext");
  assert.ok(closeIdx >= 0, "pick must close the list");
  assert.ok(closeIdx < loadIdx, "close() must run before loading context");
  assert.ok(hideIdx > loadIdx && hideIdx < renderIdx, "list must stay closed when the card renders");
  const renderSrc = sliceFunction(js, "renderSkuContext");
  assert.match(renderSrc, /hideProductTypeaheadList\(listEl\)/);
  assert.match(renderSrc, /sku-selected-card/);
  assert.doesNotMatch(renderSrc, /sku-context-summary operational-table-meta/);
});

test("hideProductTypeaheadList vacía y oculta las sugerencias", () => {
  const dom = makeInboundDom();
  const fns = loadSkuFns(dom.document);
  fns.hideProductTypeaheadList(dom.list);
  assert.equal(dom.list.hidden, true);
  assert.ok(String(dom.list.className).includes("hidden"));
  assert.equal(dom.list.innerHTML, "");
});

test("la tarjeta compacta muestra SKU, producto, existencia, disponible y ubicación o saldos", () => {
  const src = [
    sliceFunction(js, "escCell"),
    sliceFunction(js, "formatQty"),
    sliceFunction(js, "skuSelectedLocationLabel"),
    sliceFunction(js, "buildSkuSelectedCardHtml")
  ].join("\n");
  const { skuSelectedLocationLabel, buildSkuSelectedCardHtml } = new Function(
    `${src}; return { skuSelectedLocationLabel, buildSkuSelectedCardHtml };`
  )();

  assert.equal(skuSelectedLocationLabel([]), "Sin existencia");
  assert.equal(skuSelectedLocationLabel([{ locationCode: "AN14-F", warehouse: "TULTITLAN24" }]), "AN14-F · TULTITLAN24");
  assert.equal(
    skuSelectedLocationLabel([
      { locationCode: "AN14-F" },
      { locationCode: "AN15-A" }
    ]),
    "2 saldos"
  );

  const oneLoc = buildSkuSelectedCardHtml(
    {
      product: { sku: "2223158-4", name: "Equipo de radio" },
      inventory: { totalQty: "12", totalUnreservedQty: "10", locations: [{ locationCode: "AN14-F", warehouse: "TULTITLAN24" }] }
    },
    "Capas: 3 · Valor MXN 1,000.00"
  );
  assert.match(oneLoc, /✓ SKU seleccionado/);
  assert.match(oneLoc, /<dt>SKU<\/dt><dd>2223158-4<\/dd>/);
  assert.match(oneLoc, /<dt>Producto<\/dt><dd>Equipo de radio<\/dd>/);
  assert.match(oneLoc, /<dt>Existencia actual<\/dt>/);
  assert.match(oneLoc, /<dt>Cantidad disponible<\/dt>/);
  assert.match(oneLoc, /<dt>Ubicación<\/dt><dd>AN14-F · TULTITLAN24<\/dd>/);
  assert.match(oneLoc, />Cambiar SKU</);
  assert.match(oneLoc, /<details class="sku-selected-detail">/);
  assert.match(oneLoc, />Ver detalle</);
  assert.ok(oneLoc.indexOf("Ver detalle") < oneLoc.indexOf("Capas: 3"));

  const manyLoc = buildSkuSelectedCardHtml(
    {
      product: { sku: "SKU-2", name: "Pieza" },
      inventory: { totalQty: "4", totalUnreservedQty: "4", locations: [{ locationCode: "A" }, { locationCode: "B" }, { locationCode: "C" }] }
    },
    "detalle extenso"
  );
  assert.match(manyLoc, /<dt>Saldos<\/dt><dd>3 saldos<\/dd>/);
  assert.ok(manyLoc.indexOf("Ver detalle") < manyLoc.indexOf("detalle extenso"));
});

test("Cambiar SKU limpia productId, SKU y producto y reabre la búsqueda sin tocar proyecto, almacén ni ubicación", () => {
  const beginSrc = sliceFunction(js, "beginSkuChange");
  const clearSrc = sliceFunction(js, "clearSkuSelectionFields");
  assert.doesNotMatch(beginSrc, /inboundAssignmentType|inboundProjectId|inboundWarehouse|inboundLocation|inboundWarehouseSelect|inboundLocationSelect/);
  assert.doesNotMatch(clearSrc, /inboundWarehouse|inboundLocation|inboundWarehouseSelect|inboundLocationSelect/);
  assert.match(beginSrc, /focus/);
  assert.match(clearSrc, /inboundProductId/);

  const dom = makeInboundDom();
  const fns = loadSkuFns(dom.document);
  fns.beginSkuChange(dom.list, dom.sku);

  assert.equal(dom.sku.value, "");
  assert.equal(dom.sku.dataset.skuSelectedId, undefined);
  assert.equal(dom.sku.dataset.skuSelectedCode, undefined);
  assert.equal(dom.product.value, "");
  assert.equal(dom.productId.value, "");
  assert.equal(dom.sku.focused, true);
  assert.equal(dom.assignment.value, "PROJECT");
  assert.equal(dom.project.value, "proj-aviat");
  assert.equal(dom.warehouse.value, "TULTITLAN24");
  assert.equal(dom.location.value, "AN14-F");
  assert.equal(dom.card.hidden, true);
  assert.equal(dom.list.hidden, true);
  assert.equal(dom.list.innerHTML, "");
  assert.equal(dom.submit.disabled, true);
});

test("editar el texto después de seleccionar invalida productId y producto", () => {
  const wireSrc = sliceFunction(js, "wireProductTypeahead");
  assert.match(wireSrc, /invalidateSkuSelection\(listEl, input\)/);
  const invalidSrc = sliceFunction(js, "invalidateSkuSelection");
  assert.match(invalidSrc, /keepSkuText: true/);

  const dom = makeInboundDom();
  const fns = loadSkuFns(dom.document);
  (dom.sku as { value: string }).value = "2223158-4X";
  const changed = fns.invalidateSkuSelection(dom.list, dom.sku);
  assert.equal(changed, true);
  assert.equal(dom.sku.value, "2223158-4X");
  assert.equal(dom.sku.dataset.skuSelectedId, undefined);
  assert.equal(dom.product.value, "");
  assert.equal(dom.productId.value, "");
  assert.equal(dom.assignment.value, "PROJECT");
  assert.equal(dom.project.value, "proj-aviat");
  assert.equal(dom.warehouse.value, "TULTITLAN24");
  assert.equal(dom.location.value, "AN14-F");
  assert.equal(dom.submit.disabled, true);
});

test("Registrar entrada permanece desactivado si hay texto pero no un SKU seleccionado del sistema", () => {
  const submitSrc = sliceFunction(js, "submitOperationalMovement");
  const guardIdx = submitSrc.indexOf("inboundHasSystemSkuSelection");
  const skuIdx = submitSrc.indexOf('if (!sku)');
  const findIdx = submitSrc.indexOf("findProductBySku");
  assert.ok(guardIdx >= 0, "submit must require inboundProductId");
  assert.ok(guardIdx < skuIdx && guardIdx < findIdx, "productId guard must run before SKU text / catalog lookup");
  assert.match(submitSrc, /Seleccione un SKU de las sugerencias/);
  assert.match(js, /btn\.disabled = !inboundFormIsComplete\(\)/);

  const empty = makeInboundDom({ productId: "" });
  empty.productId.value = "  ";
  const emptyFns = loadSkuFns(empty.document);
  assert.equal(emptyFns.inboundHasSystemSkuSelection(), false);
  emptyFns.syncInboundSubmitEnabled();
  assert.equal(empty.submit.disabled, true);

  const selected = makeInboundDom({ productId: "prod-1" });
  const selectedFns = loadSkuFns(selected.document);
  assert.equal(selectedFns.inboundHasSystemSkuSelection(), true);
  selected.assignment.value = "";
  selectedFns.syncInboundSubmitEnabled();
  assert.equal(selected.submit.disabled, true, "SKU selected without assignment must stay disabled");

  const typedOnly = makeInboundDom({ sku: "2223158-4", productId: "" });
  typedOnly.productId.value = "";
  typedOnly.sku.dataset.skuSelectedId = undefined;
  const typedFns = loadSkuFns(typedOnly.document);
  assert.equal(typedFns.inboundHasSystemSkuSelection(), false);
  typedFns.syncInboundSubmitEnabled();
  assert.equal(typedOnly.submit.disabled, true);
});
