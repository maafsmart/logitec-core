import { Prisma } from "@prisma/client";

type ValuationLayer = {
  qty: Prisma.Decimal;
  unitPriceMxn: Prisma.Decimal | null;
  unitPriceUsd: Prisma.Decimal | null;
};

export function calculateInventoryValuation(layers: ValuationLayer[]) {
  let totalValueMxn = new Prisma.Decimal(0);
  let totalValueUsd = new Prisma.Decimal(0);
  let valuedQtyMxn = new Prisma.Decimal(0);
  let valuedQtyUsd = new Prisma.Decimal(0);
  let unvaluedQty = new Prisma.Decimal(0);

  for (const layer of layers) {
    const hasMxn = layer.unitPriceMxn !== null;
    const hasUsd = layer.unitPriceUsd !== null;
    if (hasMxn) {
      totalValueMxn = totalValueMxn.plus(layer.qty.mul(layer.unitPriceMxn!));
      valuedQtyMxn = valuedQtyMxn.plus(layer.qty);
    }
    if (hasUsd) {
      totalValueUsd = totalValueUsd.plus(layer.qty.mul(layer.unitPriceUsd!));
      valuedQtyUsd = valuedQtyUsd.plus(layer.qty);
    }
    if (!hasMxn && !hasUsd) unvaluedQty = unvaluedQty.plus(layer.qty);
  }

  return {
    totalValueMxn: totalValueMxn.toString(),
    totalValueUsd: totalValueUsd.toString(),
    valuedQtyMxn: valuedQtyMxn.toString(),
    valuedQtyUsd: valuedQtyUsd.toString(),
    unvaluedQty: unvaluedQty.toString()
  };
}
