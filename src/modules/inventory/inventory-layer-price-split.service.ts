import { Prisma } from "@prisma/client";
import { prisma } from "../../db/prisma.js";
import { logActivity } from "../activity/activity-log.service.js";
import { calculateInventoryValuation } from "./inventory-valuation.service.js";
import { LayerPriceError, parseLayerUnitPriceMxn } from "./inventory-layer-price.service.js";

const QTY_PATTERN = /^\d+(\.\d{1,4})?$/;
const ZERO = new Prisma.Decimal(0);

export function parseLayerQtyToValue(value: unknown): Prisma.Decimal {
  if (value == null) {
    throw new LayerPriceError("QTY_REQUIRED", "Indica la cantidad a valuar.");
  }
  const raw = String(value).trim().replace(",", ".");
  if (!raw) {
    throw new LayerPriceError("QTY_REQUIRED", "Indica la cantidad a valuar.");
  }
  if (!QTY_PATTERN.test(raw)) {
    throw new LayerPriceError(
      "INVALID_QTY",
      "La cantidad debe ser mayor que 0 con hasta cuatro decimales."
    );
  }
  const qty = new Prisma.Decimal(raw);
  if (!qty.isFinite() || qty.lte(0)) {
    throw new LayerPriceError("INVALID_QTY", "La cantidad debe ser mayor que 0 con hasta cuatro decimales.");
  }
  return qty;
}

type LayerPriceShape = {
  id: string;
  inventoryId: string;
  qty: Prisma.Decimal;
  reservedQty: Prisma.Decimal;
  lotNumber: string | null;
  unitPriceMxn: Prisma.Decimal | null;
  unitPriceUsd: Prisma.Decimal | null;
};

type SplitDb = {
  inventoryLayer: { findUnique: typeof prisma.inventoryLayer.findUnique };
  $transaction: <T>(
    fn: (tx: Prisma.TransactionClient) => Promise<T>,
    options?: { maxWait?: number; timeout?: number }
  ) => Promise<T>;
};

function serializeLayer(layer: LayerPriceShape) {
  return {
    id: layer.id,
    inventoryId: layer.inventoryId,
    qty: layer.qty.toString(),
    reservedQty: layer.reservedQty.toString(),
    lotNumber: layer.lotNumber,
    unitPriceMxn: layer.unitPriceMxn?.toString() ?? null,
    unitPriceUsd: layer.unitPriceUsd?.toString() ?? null
  };
}

function inventoryPayload(inventory: {
  id: string;
  assignmentType: string;
  projectId: string | null;
  product: { sku: string; name: string };
  location: { code: string };
  project: { id: string; code: string; name: string } | null;
}) {
  return {
    id: inventory.id,
    assignmentType: inventory.assignmentType,
    projectId: inventory.projectId,
    sku: inventory.product.sku,
    name: inventory.product.name,
    location: inventory.location.code,
    project: inventory.project
      ? { id: inventory.project.id, code: inventory.project.code, name: inventory.project.name }
      : null
  };
}

async function assertLayerQtyTotal(
  tx: Prisma.TransactionClient,
  inventoryId: string,
  expectedQty: Prisma.Decimal
) {
  const layers = await tx.inventoryLayer.findMany({
    where: { inventoryId },
    select: { qty: true }
  });
  const sum = layers.reduce((acc, layer) => acc.plus(layer.qty), ZERO);
  if (!sum.equals(expectedQty)) {
    throw new LayerPriceError(
      "LAYER_QTY_TOTAL_MISMATCH",
      "La suma de capas no coincide con el saldo del cubo.",
      409
    );
  }
}

export async function splitUnpricedInventoryLayerPrice(
  input: {
    layerId: string;
    qtyToValue: unknown;
    unitPriceMxn: unknown;
    userId: string;
  },
  db: SplitDb = prisma
) {
  const qtyToValue = parseLayerQtyToValue(input.qtyToValue);
  const price = parseLayerUnitPriceMxn(input.unitPriceMxn);

  const loaded = await db.inventoryLayer.findUnique({
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
  if (!loaded) {
    throw new LayerPriceError("LAYER_NOT_FOUND", "Capa de inventario no encontrada.", 404);
  }

  return db.$transaction(
    async (tx) => {
      await tx.$queryRaw(
        Prisma.sql`SELECT "id" FROM "Inventory" WHERE "id" = ${loaded.inventoryId} ORDER BY "id" FOR UPDATE`
      );
      await tx.$queryRaw(
        Prisma.sql`SELECT "id" FROM "InventoryLayer" WHERE "inventoryId" = ${loaded.inventoryId} ORDER BY "id" FOR UPDATE`
      );

      const layer = await tx.inventoryLayer.findUnique({
        where: { id: loaded.id },
        include: {
          inventory: {
            include: {
              product: { select: { id: true, sku: true, name: true, customerId: true } },
              location: { select: { id: true, code: true, warehouse: true } },
              project: { select: { id: true, code: true, name: true } }
            }
          },
          _count: { select: { serials: true } }
        }
      });
      if (!layer) {
        throw new LayerPriceError("LAYER_CHANGED", "La capa fue modificada por otra operación.", 409);
      }
      if (layer.unitPriceMxn != null) {
        throw new LayerPriceError(
          "LAYER_ALREADY_PRICED",
          "Esta capa ya tiene precio. Usa la edición completa de precio.",
          409
        );
      }
      if (!layer.qty.equals(loaded.qty) || !layer.reservedQty.equals(loaded.reservedQty)) {
        throw new LayerPriceError("LAYER_CHANGED", "La capa fue modificada por otra operación.", 409);
      }
      if (qtyToValue.greaterThan(layer.qty)) {
        throw new LayerPriceError("QTY_EXCEEDS_LAYER", "La cantidad a valuar no puede superar la cantidad de la capa.");
      }

      const isFullLayer = qtyToValue.equals(layer.qty);
      const unreserved = layer.qty.minus(layer.reservedQty);
      if (!isFullLayer && qtyToValue.greaterThan(unreserved)) {
        throw new LayerPriceError(
          "QTY_EXCEEDS_UNRESERVED",
          "La cantidad a valuar no puede superar el saldo no reservado."
        );
      }
      if (!isFullLayer && layer._count.serials > 0) {
        throw new LayerPriceError(
          "SERIAL_SELECTION_REQUIRED",
          "La capa contiene series; requiere selección explícita de seriales.",
          409
        );
      }

      const inventoryQty = layer.inventory.qty;
      const assignmentType = layer.inventory.assignmentType;
      const projectId = layer.inventory.projectId;
      const qtyBefore = layer.qty;
      let sourceLayer: LayerPriceShape = layer;
      let valuedLayer: LayerPriceShape = layer;
      let qtyRemaining = ZERO;
      let subtype = "LAYER_PRICE_UPDATE";

      if (isFullLayer) {
        const next = await tx.inventoryLayer.update({
          where: { id: layer.id },
          data: { unitPriceMxn: price }
        });
        sourceLayer = next;
        valuedLayer = next;
        qtyRemaining = ZERO;
      } else {
        const nextQty = layer.qty.minus(qtyToValue);
        const next = await tx.inventoryLayer.update({
          where: { id: layer.id },
          data: { qty: nextQty }
        });
        const created = await tx.inventoryLayer.create({
          data: {
            inventoryId: layer.inventoryId,
            lotNumber: layer.lotNumber,
            qty: qtyToValue,
            reservedQty: ZERO,
            receivedAt: layer.receivedAt,
            unitPriceMxn: price,
            unitPriceUsd: layer.unitPriceUsd,
            sourceReference: layer.sourceReference,
            sourceType: layer.sourceType
          }
        });
        sourceLayer = next;
        valuedLayer = created;
        qtyRemaining = next.qty;
        subtype = "LAYER_PRICE_SPLIT";
      }

      const inventoryAfter = await tx.inventory.findUniqueOrThrow({
        where: { id: layer.inventoryId },
        select: {
          qty: true,
          reservedQty: true,
          assignmentType: true,
          assignmentKey: true,
          projectId: true
        }
      });
      if (
        !inventoryAfter.qty.equals(inventoryQty) ||
        !inventoryAfter.reservedQty.equals(layer.inventory.reservedQty) ||
        inventoryAfter.assignmentType !== assignmentType ||
        inventoryAfter.assignmentKey !== layer.inventory.assignmentKey ||
        inventoryAfter.projectId !== projectId
      ) {
        throw new LayerPriceError("INVENTORY_CUBE_CHANGED", "El cubo de inventario no debe modificarse al valuar.", 409);
      }
      await assertLayerQtyTotal(tx, layer.inventoryId, inventoryAfter.qty);

      await logActivity(
        {
          type: "INVENTORY",
          subtype,
          reference: layer.inventory.product.sku,
          userId: input.userId,
          productId: layer.inventory.product.id,
          customerId: layer.inventory.projectId || layer.inventory.product.customerId,
          warehouse: layer.inventory.location.warehouse,
          location: layer.inventory.location.code,
          qty: qtyToValue,
          result: "OK",
          metadata: {
            inventoryId: layer.inventoryId,
            sourceLayerId: layer.id,
            valuedLayerId: valuedLayer.id,
            qtyBefore: qtyBefore.toString(),
            qtyValued: qtyToValue.toString(),
            qtyRemaining: qtyRemaining.toString(),
            previousUnitPriceMxn: null,
            newUnitPriceMxn: price.toString(),
            assignmentType,
            projectId,
            lotNumber: layer.lotNumber,
            userId: input.userId
          }
        },
        tx
      );

      const siblings = await tx.inventoryLayer.findMany({
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
        split: !isFullLayer,
        sourceLayer: serializeLayer(sourceLayer),
        valuedLayer: serializeLayer(valuedLayer),
        qtyAffected: qtyToValue.toString(),
        qtyBefore: qtyBefore.toString(),
        qtyRemaining: qtyRemaining.toString(),
        previousUnitPriceMxn: null,
        newUnitPriceMxn: price.toString(),
        valuation: calculateInventoryValuation(siblings),
        inventory: inventoryPayload(layer.inventory)
      };
    },
    { maxWait: 5_000, timeout: 15_000 }
  );
}
