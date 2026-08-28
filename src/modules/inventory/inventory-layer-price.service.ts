import { Prisma } from "@prisma/client";
import { prisma } from "../../db/prisma.js";
import { logActivity } from "../activity/activity-log.service.js";
import { calculateInventoryValuation } from "./inventory-valuation.service.js";

export class LayerPriceError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly statusCode = 400
  ) {
    super(message);
  }
}

const PRICE_PATTERN = /^\d+(\.\d{1,4})?$/;

export function parseLayerUnitPriceMxn(value: unknown): Prisma.Decimal {
  if (value == null || value === "") {
    throw new LayerPriceError("PRICE_REQUIRED", "Indica un precio en MXN.");
  }
  const raw = String(value).trim().replace(",", ".");
  if (!PRICE_PATTERN.test(raw)) {
    throw new LayerPriceError(
      "INVALID_PRICE",
      "El precio debe ser un importe no negativo con hasta cuatro decimales."
    );
  }
  const price = new Prisma.Decimal(raw);
  if (!price.isFinite() || price.lt(0)) {
    throw new LayerPriceError(
      "INVALID_PRICE",
      "El precio debe ser un importe no negativo con hasta cuatro decimales."
    );
  }
  return price;
}

export function layerPriceOnlyData(unitPriceMxn: Prisma.Decimal): { unitPriceMxn: Prisma.Decimal } {
  return { unitPriceMxn };
}

export async function updateInventoryLayerUnitPriceMxn(input: {
  layerId: string;
  unitPriceMxn: unknown;
  userId: string;
}) {
  const price = parseLayerUnitPriceMxn(input.unitPriceMxn);
  const layer = await prisma.inventoryLayer.findUnique({
    where: { id: input.layerId },
    include: {
      inventory: {
        include: {
          product: { select: { id: true, sku: true, name: true, customerId: true } },
          location: { select: { id: true, code: true, warehouse: true } },
          project: { select: { id: true, code: true, name: true } }
        }
      }
    }
  });
  if (!layer) {
    throw new LayerPriceError("LAYER_NOT_FOUND", "Capa de inventario no encontrada.", 404);
  }

  const previous = layer.unitPriceMxn;
  const updated = await prisma.$transaction(async (tx) => {
    const next = await tx.inventoryLayer.update({
      where: { id: layer.id },
      data: layerPriceOnlyData(price)
    });
    await logActivity(
      {
        type: "INVENTORY",
        subtype: "LAYER_PRICE_UPDATE",
        reference: layer.inventory.product.sku,
        userId: input.userId,
        productId: layer.inventory.product.id,
        customerId: layer.inventory.projectId || layer.inventory.product.customerId,
        warehouse: layer.inventory.location.warehouse,
        location: layer.inventory.location.code,
        qty: layer.qty,
        result: "OK",
        metadata: {
          layerId: layer.id,
          inventoryId: layer.inventoryId,
          lotNumber: layer.lotNumber,
          qtyAffected: layer.qty.toString(),
          previousUnitPriceMxn: previous?.toString() ?? null,
          newUnitPriceMxn: price.toString(),
          assignmentType: layer.inventory.assignmentType,
          projectId: layer.inventory.projectId
        }
      },
      tx
    );
    return next;
  });

  const siblings = await prisma.inventoryLayer.findMany({
    where: { inventoryId: layer.inventoryId, qty: { gt: 0 } },
    select: {
      id: true,
      lotNumber: true,
      qty: true,
      reservedQty: true,
      unitPriceMxn: true,
      unitPriceUsd: true
    }
  });

  return {
    layer: {
      id: updated.id,
      inventoryId: updated.inventoryId,
      qty: updated.qty.toString(),
      reservedQty: updated.reservedQty.toString(),
      lotNumber: updated.lotNumber,
      unitPriceMxn: updated.unitPriceMxn?.toString() ?? null,
      unitPriceUsd: updated.unitPriceUsd?.toString() ?? null
    },
    qtyAffected: layer.qty.toString(),
    previousUnitPriceMxn: previous?.toString() ?? null,
    newUnitPriceMxn: price.toString(),
    valuation: calculateInventoryValuation(siblings),
    inventory: {
      id: layer.inventory.id,
      assignmentType: layer.inventory.assignmentType,
      projectId: layer.inventory.projectId,
      sku: layer.inventory.product.sku,
      name: layer.inventory.product.name,
      location: layer.inventory.location.code,
      project: layer.inventory.project
        ? { id: layer.inventory.project.id, code: layer.inventory.project.code, name: layer.inventory.project.name }
        : null
    }
  };
}
