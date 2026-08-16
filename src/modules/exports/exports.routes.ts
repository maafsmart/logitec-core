import { Router } from "express";
import * as XLSX from "xlsx";
import { z } from "zod";
import { prisma } from "../../db/prisma.js";
import { requireAuth, requireRole } from "../../middlewares/auth.middleware.js";
import {
  clientInventoryWhere,
  clientMovementWhere,
  clientProductWhere,
  isClientRole
} from "../clients/client-scope.js";
import { parseMexicoCityDateFilter } from "../../shared/mexico-city-date.js";

const exportsRouter = Router();

function csvEscape(value: unknown): string {
  const s = value == null ? "" : String(value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function toCsv(headers: string[], rows: Array<Array<unknown>>): string {
  const lines = [headers.map(csvEscape).join(",")];
  for (const row of rows) lines.push(row.map(csvEscape).join(","));
  return `\uFEFF${lines.join("\r\n")}`;
}

exportsRouter.use(requireAuth);

exportsRouter.get("/inventory.csv", requireRole(["ADMIN", "SUPERVISOR", "OPERATOR", "CLIENT"]), async (req, res) => {
  const rows = await prisma.inventory.findMany({
    where: clientInventoryWhere(req.auth!),
    include: {
      product: { include: { customer: { include: { client: true } } } },
      location: true,
      layers: true
    },
    orderBy: { updatedAt: "desc" },
    take: 20000
  });
  const csv = toCsv(
    ["cliente", "proyecto", "sku", "producto", "ubicacion", "estado", "qty", "reservedQty", "freeQty", "lotes"],
    rows.map((r) => [
      r.product.customer?.client?.tradeName || r.product.customer?.client?.name || "",
      r.product.customer?.code || "",
      r.product.sku,
      r.product.name,
      r.location.code,
      r.status,
      r.qty.toString(),
      r.reservedQty.toString(),
      r.qty.minus(r.reservedQty).toString(),
      r.layers.map((l) => l.lotNumber || "").filter(Boolean).join("|")
    ])
  );
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", 'attachment; filename="inventory.csv"');
  res.send(csv);
});

exportsRouter.get("/movements.csv", requireRole(["ADMIN", "SUPERVISOR", "OPERATOR", "CLIENT"]), async (req, res) => {
  const query = z
    .object({
      from: z.string().optional(),
      to: z.string().optional(),
      sku: z.string().optional(),
      movementType: z.string().optional(),
      limit: z.coerce.number().int().min(1).max(20000).default(5000)
    })
    .parse(req.query);
  const createdAt: Record<string, Date> = {};
  if (query.from) {
    const d = parseMexicoCityDateFilter(query.from, "start");
    if (d) createdAt.gte = d;
  }
  if (query.to) {
    const d = parseMexicoCityDateFilter(query.to, "end");
    if (d) createdAt.lte = d;
  }
  const rows = await prisma.inventoryMovement.findMany({
    where: {
      AND: [
        clientMovementWhere(req.auth!),
        ...(Object.keys(createdAt).length ? [{ createdAt }] : []),
        ...(query.sku ? [{ product: { sku: { equals: query.sku, mode: "insensitive" as const } } }] : []),
        ...(query.movementType
          ? [{ movementType: { equals: query.movementType, mode: "insensitive" as const } }]
          : [])
      ]
    },
    include: {
      product: { include: { customer: { include: { client: true } } } },
      fromLocation: true,
      toLocation: true,
      user: true,
      requisitionLine: { include: { requisition: true } },
      inventoryLayer: true
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: query.limit
  });
  const csv = toCsv(
    ["fecha", "cliente", "proyecto", "sku", "tipo", "qty", "antes", "despues", "origen", "destino", "estado", "lote", "usuario", "requisicion", "referencia"],
    rows.map((r) => [
      r.createdAt.toISOString(),
      r.product.customer?.client?.tradeName || r.product.customer?.client?.name || "",
      r.product.customer?.code || "",
      r.product.sku,
      r.movementType,
      r.qty.toString(),
      r.quantityBefore.toString(),
      r.quantityAfter.toString(),
      r.fromLocation?.code || "",
      r.toLocation?.code || "",
      r.stockStatus || "",
      r.inventoryLayer?.lotNumber || "",
      r.user.fullName,
      r.requisitionLine?.requisition.number || "",
      r.reference || ""
    ])
  );
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", 'attachment; filename="movements.csv"');
  res.send(csv);
});

exportsRouter.get("/requisitions.csv", requireRole(["ADMIN", "SUPERVISOR", "OPERATOR"]), async (req, res) => {
  if (isClientRole(req.auth!)) {
    res.status(403).json({ message: "CLIENT no exporta requisiciones administrativas." });
    return;
  }
  const rows = await prisma.requisition.findMany({
    include: {
      project: { include: { client: true } },
      lines: { include: { product: true } },
      createdBy: true
    },
    orderBy: { createdAt: "desc" },
    take: 5000
  });
  const flat: Array<Array<unknown>> = [];
  for (const reqRow of rows) {
    for (const line of reqRow.lines) {
      flat.push([
        reqRow.number,
        reqRow.status,
        reqRow.project.client?.tradeName || reqRow.project.client?.name || "",
        reqRow.project.code,
        line.product.sku,
        line.requestedQty.toString(),
        line.fulfilledQty.toString(),
        reqRow.createdBy.fullName,
        reqRow.createdAt.toISOString()
      ]);
    }
  }
  const csv = toCsv(
    ["requisicion", "status", "cliente", "proyecto", "sku", "solicitado", "surtido", "usuario", "fecha"],
    flat
  );
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", 'attachment; filename="requisitions.csv"');
  res.send(csv);
});

exportsRouter.get("/products.csv", requireRole(["ADMIN", "SUPERVISOR", "OPERATOR", "CLIENT"]), async (req, res) => {
  const rows = await prisma.product.findMany({
    where: clientProductWhere(req.auth!),
    include: { customer: { include: { client: true } } },
    orderBy: { createdAt: "desc" },
    take: 20000
  });
  const csv = toCsv(
    ["sku", "barcode", "name", "description", "unit", "proyecto", "cliente", "serialControlled", "lotControlled", "warehouse"],
    rows.map((r) => [
      r.sku,
      r.barcode || "",
      r.name,
      r.description || "",
      r.unit,
      r.customer?.code || "",
      r.customer?.client?.tradeName || r.customer?.client?.name || "",
      r.serialControlled,
      r.lotControlled,
      r.warehouse
    ])
  );
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", 'attachment; filename="products.csv"');
  res.send(csv);
});

exportsRouter.get("/inventory.xlsx", requireRole(["ADMIN", "SUPERVISOR", "OPERATOR", "CLIENT"]), async (req, res) => {
  const inventories = await prisma.inventory.findMany({
    where: clientInventoryWhere(req.auth!),
    include: {
      product: { include: { customer: { include: { client: true } } } },
      location: true,
      layers: { include: { serials: true } }
    },
    take: 20000
  });
  const movements = await prisma.inventoryMovement.findMany({
    where: clientMovementWhere(req.auth!),
    include: {
      product: { include: { customer: { include: { client: true } } } },
      fromLocation: true,
      toLocation: true,
      user: true,
      requisitionLine: { include: { requisition: true } },
      inventoryLayer: true
    },
    orderBy: { createdAt: "desc" },
    take: 5000
  });

  const summaryMap = new Map<
    string,
    { client: string; project: string; qty: number; reserved: number; mxn: number; usd: number; missing: number }
  >();
  const detail: any[] = [];
  const serials: any[] = [];
  for (const inv of inventories) {
    const client = inv.product.customer?.client?.tradeName || inv.product.customer?.client?.name || "";
    const project = inv.product.customer?.code || "";
    const key = `${client}|${project}`;
    const current = summaryMap.get(key) || { client, project, qty: 0, reserved: 0, mxn: 0, usd: 0, missing: 0 };
    current.qty += Number(inv.qty);
    current.reserved += Number(inv.reservedQty);
    for (const layer of inv.layers) {
      const q = Number(layer.qty);
      if (layer.unitPriceMxn != null) current.mxn += q * Number(layer.unitPriceMxn);
      else if (layer.unitPriceUsd != null) current.usd += q * Number(layer.unitPriceUsd);
      else current.missing += q;
      detail.push({
        Cliente: client,
        Proyecto: project,
        SKU: inv.product.sku,
        Descripcion: inv.product.name,
        Ubicacion: inv.location.code,
        Estado: inv.status,
        Cantidad: Number(inv.qty),
        Reservada: Number(inv.reservedQty),
        NoReservada: Number(inv.qty) - Number(inv.reservedQty),
        Lote: layer.lotNumber || "",
        PrecioMXN: layer.unitPriceMxn != null ? Number(layer.unitPriceMxn) : "",
        PrecioUSD: layer.unitPriceUsd != null ? Number(layer.unitPriceUsd) : "",
        ValorMXN: layer.unitPriceMxn != null ? q * Number(layer.unitPriceMxn) : "",
        ValorUSD: layer.unitPriceUsd != null ? q * Number(layer.unitPriceUsd) : ""
      });
      for (const serial of layer.serials) {
        serials.push({
          SKU: inv.product.sku,
          Lote: layer.lotNumber || "",
          Serial: serial.serialNumber,
          IMEI: serial.imei || "",
          Ubicacion: inv.location.code,
          Estado: inv.status
        });
      }
    }
    summaryMap.set(key, current);
  }

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(
      [...summaryMap.values()].map((s) => ({
        Cliente: s.client,
        Proyecto: s.project,
        CantidadTotal: s.qty,
        CantidadReservada: s.reserved,
        CantidadNoReservada: s.qty - s.reserved,
        ValorMXN: s.mxn,
        ValorUSD: s.usd,
        CantidadSinPrecio: s.missing
      }))
    ),
    "Resumen"
  );
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(detail), "Detalle");
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(
      movements.map((m) => ({
        Fecha: m.createdAt.toISOString(),
        Cliente: m.product.customer?.client?.tradeName || m.product.customer?.client?.name || "",
        Proyecto: m.product.customer?.code || "",
        SKU: m.product.sku,
        Tipo: m.movementType,
        Qty: Number(m.qty),
        Antes: Number(m.quantityBefore),
        Despues: Number(m.quantityAfter),
        Origen: m.fromLocation?.code || "",
        Destino: m.toLocation?.code || "",
        Estado: m.stockStatus || "",
        Lote: m.inventoryLayer?.lotNumber || "",
        Usuario: m.user.fullName,
        Requisicion: m.requisitionLine?.requisition.number || "",
        Referencia: m.reference || ""
      }))
    ),
    "Movimientos"
  );
  if (serials.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(serials), "Seriales");
  const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", 'attachment; filename="inventory.xlsx"');
  res.send(buffer);
});

export { exportsRouter };
