import { Prisma } from "@prisma/client";
import { isForbiddenInventoryProjectRecord } from "./inventory-project-rules.js";

const ZERO = new Prisma.Decimal(0);
const HUNDRED = new Prisma.Decimal(100);
const MONEY_DP = 2;
const QTY_DP = 4;
const ROUND = Prisma.Decimal.ROUND_HALF_UP;

export type ValuationStatus = "COMPLETE" | "PARTIAL" | "NONE";

export type ValuationLayer = {
  id?: string;
  lotNumber?: string | null;
  qty: Prisma.Decimal | string | number;
  reservedQty?: Prisma.Decimal | string | number | null;
  unitPriceMxn: Prisma.Decimal | string | number | null;
  unitPriceUsd?: Prisma.Decimal | string | number | null;
};

export type LayerValuationBreakdown = {
  id: string | null;
  lotNumber: string | null;
  qty: string;
  reservedQty: string;
  unitPriceMxn: string | null;
  unitPriceUsd: string | null;
  layerValueMxn: string | null;
  valued: boolean;
};

export type InventoryValuation = {
  qtyTotal: string;
  qtyValued: string;
  qtyUnvalued: string;
  qtyReserved: string;
  totalValueMxn: string | null;
  availableValueMxn: string | null;
  avgUnitPriceMxn: string | null;
  minUnitPriceMxn: string | null;
  maxUnitPriceMxn: string | null;
  coveragePct: string;
  status: ValuationStatus;
  isPartial: boolean;
  currency: "MXN";
  hasMixedUnitPrices: boolean;
  totalValueUsd: string | null;
  valuedQtyMxn: string;
  valuedQtyUsd: string;
  unvaluedQty: string;
  layers: LayerValuationBreakdown[];
};

export type StockAssignmentProject = {
  id: string;
  code: string;
  name: string;
};

export type StockAssignmentSummary = {
  projects: StockAssignmentProject[];
  hasFreeToSale: boolean;
  label: string;
};

function toDec(value: Prisma.Decimal | string | number | null | undefined): Prisma.Decimal | null {
  if (value == null || value === "") return null;
  try {
    const parsed = new Prisma.Decimal(value);
    if (!parsed.isFinite()) return null;
    return parsed;
  } catch {
    return null;
  }
}

function money(value: Prisma.Decimal): string {
  return value.toDecimalPlaces(MONEY_DP, ROUND).toFixed(MONEY_DP);
}

function qtyStr(value: Prisma.Decimal): string {
  return value.toDecimalPlaces(QTY_DP, ROUND).toString();
}

function priceStr(value: Prisma.Decimal): string {
  return value.toFixed();
}

export function calculateInventoryValuation(layers: ValuationLayer[]): InventoryValuation {
  let qtyTotal = ZERO;
  let qtyValued = ZERO;
  let qtyUnvalued = ZERO;
  let qtyReserved = ZERO;
  let totalValueMxn = ZERO;
  let availableValueMxn = ZERO;
  let totalValueUsd = ZERO;
  let valuedQtyUsd = ZERO;
  let hasValuedMxn = false;
  let hasValuedUsd = false;
  let minUnit: Prisma.Decimal | null = null;
  let maxUnit: Prisma.Decimal | null = null;
  const distinctPrices = new Set<string>();
  const breakdown: LayerValuationBreakdown[] = [];

  for (const layer of layers) {
    const qty = toDec(layer.qty) ?? ZERO;
    if (qty.lte(0)) continue;
    const reserved = toDec(layer.reservedQty) ?? ZERO;
    const reservedClamped = reserved.lt(0) ? ZERO : reserved.gt(qty) ? qty : reserved;
    const availableQty = qty.minus(reservedClamped);
    const unitMxn = toDec(layer.unitPriceMxn);
    const unitUsd = toDec(layer.unitPriceUsd);
    const valued = unitMxn !== null;
    qtyTotal = qtyTotal.plus(qty);
    qtyReserved = qtyReserved.plus(reservedClamped);

    let layerValueMxn: string | null = null;
    if (valued) {
      const value = qty.mul(unitMxn);
      const availableValue = availableQty.gt(0) ? availableQty.mul(unitMxn) : ZERO;
      totalValueMxn = totalValueMxn.plus(value);
      availableValueMxn = availableValueMxn.plus(availableValue);
      qtyValued = qtyValued.plus(qty);
      hasValuedMxn = true;
      layerValueMxn = money(value);
      distinctPrices.add(priceStr(unitMxn));
      minUnit = minUnit == null || unitMxn.lt(minUnit) ? unitMxn : minUnit;
      maxUnit = maxUnit == null || unitMxn.gt(maxUnit) ? unitMxn : maxUnit;
    } else {
      qtyUnvalued = qtyUnvalued.plus(qty);
    }
    if (unitUsd !== null) {
      totalValueUsd = totalValueUsd.plus(qty.mul(unitUsd));
      valuedQtyUsd = valuedQtyUsd.plus(qty);
      hasValuedUsd = true;
    }

    breakdown.push({
      id: layer.id ?? null,
      lotNumber: layer.lotNumber ?? null,
      qty: qtyStr(qty),
      reservedQty: qtyStr(reservedClamped),
      unitPriceMxn: unitMxn != null ? priceStr(unitMxn) : null,
      unitPriceUsd: unitUsd != null ? priceStr(unitUsd) : null,
      layerValueMxn,
      valued
    });
  }

  let status: ValuationStatus = "NONE";
  if (qtyTotal.gt(0) && qtyUnvalued.eq(0) && qtyValued.gt(0)) status = "COMPLETE";
  else if (qtyValued.gt(0) && qtyUnvalued.gt(0)) status = "PARTIAL";

  const coveragePct = qtyTotal.gt(0) ? qtyValued.mul(HUNDRED).div(qtyTotal) : ZERO;
  const avgUnitPriceMxn = qtyValued.gt(0) ? totalValueMxn.div(qtyValued) : null;

  return {
    qtyTotal: qtyStr(qtyTotal),
    qtyValued: qtyStr(qtyValued),
    qtyUnvalued: qtyStr(qtyUnvalued),
    qtyReserved: qtyStr(qtyReserved),
    totalValueMxn: hasValuedMxn ? money(totalValueMxn) : null,
    availableValueMxn: hasValuedMxn ? money(availableValueMxn) : null,
    avgUnitPriceMxn: avgUnitPriceMxn != null ? money(avgUnitPriceMxn) : null,
    minUnitPriceMxn: minUnit != null ? money(minUnit) : null,
    maxUnitPriceMxn: maxUnit != null ? money(maxUnit) : null,
    coveragePct: coveragePct.toDecimalPlaces(MONEY_DP, ROUND).toFixed(MONEY_DP),
    status,
    isPartial: status === "PARTIAL",
    currency: "MXN",
    hasMixedUnitPrices: distinctPrices.size > 1,
    totalValueUsd: hasValuedUsd ? money(totalValueUsd) : null,
    valuedQtyMxn: qtyStr(qtyValued),
    valuedQtyUsd: qtyStr(valuedQtyUsd),
    unvaluedQty: qtyStr(qtyUnvalued),
    layers: breakdown
  };
}

export function summarizeStockAssignments(
  inventories: Array<{
    qty: Prisma.Decimal | string | number;
    assignmentType: string;
    project?: { id: string; code: string; name: string } | null;
  }>
): StockAssignmentSummary {
  const projects = new Map<string, StockAssignmentProject>();
  let hasFreeToSale = false;
  for (const inventory of inventories) {
    const qty = toDec(inventory.qty) ?? ZERO;
    if (qty.lte(0)) continue;
    if (inventory.assignmentType === "FREE_TO_SALE") {
      hasFreeToSale = true;
      continue;
    }
    const project = inventory.project;
    if (!project || isForbiddenInventoryProjectRecord(project)) continue;
    projects.set(project.id, { id: project.id, code: project.code, name: project.name });
  }
  const list = [...projects.values()].sort((a, b) => a.name.localeCompare(b.name, "es"));
  let label = "Sin existencias asignadas";
  if (list.length && hasFreeToSale) {
    label = `${list.map((project) => project.name).join(", ")} · Free to Sale`;
  } else if (list.length) {
    label = list.map((project) => (project.code ? `${project.name} (${project.code})` : project.name)).join(", ");
  } else if (hasFreeToSale) {
    label = "Free to Sale";
  }
  return { projects: list, hasFreeToSale, label };
}

export function publicValuationForRole(
  valuation: InventoryValuation,
  expose: boolean
): InventoryValuation | undefined {
  return expose ? valuation : undefined;
}
