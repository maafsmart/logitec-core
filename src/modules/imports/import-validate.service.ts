import { Prisma } from "@prisma/client";
import { prisma } from "../../db/prisma.js";
import {
  CONTEXT_FIELDS,
  applyMapping,
  type CanonicalField,
  type ImportContext
} from "./import-mapping.js";

export type Issue = {
  field?: string;
  value?: unknown;
  code: string;
  message: string;
  severity: "ERROR" | "WARNING";
};

function asText(value: unknown): string {
  if (value == null) return "";
  return String(value).trim();
}

const SERIAL_PLACEHOLDERS = new Set(["N/A"]);

function asRealSerial(value: unknown): string {
  const serial = asText(value).toUpperCase();
  return SERIAL_PLACEHOLDERS.has(serial) ? "" : serial;
}

function isBlankPrice(value: unknown): boolean {
  const text = String(value ?? "")
    .replace(/[$€£]/g, "")
    .replace(/,/g, "")
    .replace(/\s+/g, "")
    .trim();
  return !text || /^[-–—]+$/.test(text) || /^(n\/?a|null|none)$/i.test(text);
}

function isPriceReviewMarker(value: unknown): boolean {
  return typeof value === "string" && value.trim() === "Revisar";
}

function asNumber(value: unknown): number | null {
  if (value == null || value === "") return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  // Accepts workbook formats like " $2,917.27 ", "2917.27", "(1,200.00)", " $- "
  if (isBlankPrice(value)) return null;
  let cleaned = String(value).trim();
  const negative = /^\(.*\)$/.test(cleaned);
  cleaned = cleaned
    .replace(/^\(|\)$/g, "")
    .replace(/[$€£]/g, "")
    .replace(/,/g, "")
    .replace(/\s+/g, "")
    .trim();
  if (!cleaned || cleaned === "-") return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return null;
  return negative ? -Math.abs(n) : n;
}

function asBool(value: unknown): boolean | null {
  const text = asText(value).toLowerCase();
  if (!text) return null;
  if (["1", "true", "yes", "si", "sí", "y"].includes(text)) return true;
  if (["0", "false", "no", "n"].includes(text)) return false;
  return null;
}

export async function validateMappedRows(
  context: ImportContext,
  rows: Array<Record<string, unknown>>,
  mapping: Record<string, CanonicalField | null>,
  options: {
    inventoryMode?: "APPEND" | "RECONCILE";
    priceCurrency?: "MXN" | "USD";
    correctionsBySourceRow?: Map<number, Record<string, unknown>>;
  } = {}
) {
  const fields = CONTEXT_FIELDS[context];
  const statuses = await prisma.inventoryStatusDefinition.findMany({ select: { code: true } });
  const statusSet = new Set(statuses.map((s) => s.code.toUpperCase()));
  const products = await prisma.product.findMany({
    select: { id: true, sku: true, customerId: true, serialControlled: true, lotControlled: true, active: true }
  });
  const productBySku = new Map(products.map((p) => [p.sku.toUpperCase(), p]));
  const locations = await prisma.location.findMany({ select: { id: true, code: true, active: true } });
  const locationByCode = new Map(locations.map((l) => [l.code.toUpperCase(), l]));
  const projects = await prisma.customer.findMany({
    select: { id: true, code: true, name: true, clientId: true, client: { select: { id: true, name: true, tradeName: true } } }
  });
  const projectByCode = new Map(projects.map((p) => [p.code.toUpperCase(), p]));
  const projectsByName = new Map<string, (typeof projects)[number][]>();
  for (const project of projects) {
    const key = project.name.trim().toUpperCase();
    projectsByName.set(key, [...(projectsByName.get(key) || []), project]);
  }
  const clients = await prisma.client.findMany({ select: { id: true, name: true, tradeName: true, legalName: true } });
  const existingSerials = await prisma.inventorySerial.findMany({ select: { serialNumber: true, imei: true, productId: true } });
  const serialSet = new Set(existingSerials.map((s) => s.serialNumber.toUpperCase()));
  const imeiSet = new Set(existingSerials.filter((s) => s.imei).map((s) => s.imei!.toUpperCase()));

  const fileSerials = new Set<string>();
  const fileImeis = new Set<string>();

  const validated = rows.map((raw, idx) => {
    const mapped = {
      ...applyMapping(raw, mapping),
      ...(options.correctionsBySourceRow?.get(idx + 1) || {})
    };
    const errors: Issue[] = [];
    const warnings: Issue[] = [];
    const normalized: Record<string, unknown> = { ...mapped };

    for (const required of fields.required) {
      if (!asText(mapped[required])) {
        errors.push({ field: required, code: "REQUIRED", message: `Campo requerido vacío: ${required}`, severity: "ERROR" });
      }
    }

    const qty = asNumber(mapped.qty);
    if (mapped.qty != null && mapped.qty !== "" && qty == null) {
      errors.push({ field: "qty", value: mapped.qty, code: "INVALID_QTY", message: "Cantidad inválida.", severity: "ERROR" });
    } else if (qty != null && qty < 0) {
      errors.push({ field: "qty", value: qty, code: "NEGATIVE_QTY", message: "Cantidad negativa no permitida.", severity: "ERROR" });
    } else if (qty != null) {
      normalized.qty = qty;
    }

    for (const priceField of ["unitPriceMxn", "unitPriceUsd"] as const) {
      if (mapped[priceField] == null || mapped[priceField] === "") {
        normalized[priceField] = null;
        continue;
      }
      if (isPriceReviewMarker(mapped[priceField])) {
        normalized[priceField] = null;
        warnings.push({
          field: priceField,
          value: mapped[priceField],
          code: "PRICE_REVIEW_REQUIRED",
          message: "Precio marcado como Revisar; requiere decisión antes de valorizar.",
          severity: "WARNING"
        });
      } else if (isBlankPrice(mapped[priceField])) {
        normalized[priceField] = null;
        warnings.push({
          field: priceField,
          value: mapped[priceField],
          code: "PRICE_PLACEHOLDER_EMPTY",
          message: "Marcador de precio sin valor; se conserva como precio nulo.",
          severity: "WARNING"
        });
      } else {
        const n = asNumber(mapped[priceField]);
        if (n == null || n < 0) {
          errors.push({ field: priceField, value: mapped[priceField], code: "INVALID_PRICE", message: "Precio inválido.", severity: "ERROR" });
        } else {
          normalized[priceField] = n;
        }
      }
    }
    if (options.priceCurrency === "MXN" && mapped.unitPriceMxn == null && mapped.unitPriceUsd == null) {
      const generic = asNumber((mapped as any).precio ?? mapped.unitPriceMxn);
      if (generic != null) normalized.unitPriceMxn = generic;
    }
    if (options.priceCurrency === "USD" && mapped.unitPriceUsd == null) {
      const generic = asNumber((mapped as any).precio ?? mapped.unitPriceUsd);
      if (generic != null) normalized.unitPriceUsd = generic;
    }

    const sku = asText(mapped.sku).toUpperCase();
    let matchedProduct: (typeof products)[number] | undefined;
    if (sku) {
      normalized.sku = sku;
      const product = productBySku.get(sku);
      matchedProduct = product;
      if (!product) {
        if (context === "PRODUCTS") {
          warnings.push({ field: "sku", value: sku, code: "NEW_SKU", message: "SKU nuevo: se creará.", severity: "WARNING" });
          normalized.action = "CREATE";
        } else if (context === "REQUISITIONS") {
          errors.push({ field: "sku", value: sku, code: "SKU_NOT_FOUND", message: "SKU no existe; requisición no puede importarse.", severity: "ERROR" });
        } else if (context === "INVENTORY" || context === "INBOUND") {
          warnings.push({ field: "sku", value: sku, code: "NEW_SKU", message: "SKU no existe en catálogo; se creará al confirmar.", severity: "WARNING" });
          normalized.action = "CREATE_PRODUCT_REQUIRED";
        }
      } else {
        normalized.productId = product.id;
        normalized.projectId = product.customerId;
        normalized.serialControlled = product.serialControlled;
        normalized.lotControlled = product.lotControlled;
        if (context === "PRODUCTS") normalized.action = "UPDATE";
      }
    }

    const location = asText(mapped.location).toUpperCase();
    if (location) {
      normalized.location = location;
      const loc = locationByCode.get(location);
      if (!loc) {
        if (context === "INVENTORY" || context === "INBOUND") {
          errors.push({
            field: "location",
            value: location,
            code: "SOURCE_LOCATION_NOT_IN_MASTER",
            message: "Ubicación presente en archivo, pero inexistente en datos maestros.",
            severity: "ERROR"
          });
        }
      } else {
        normalized.locationId = loc.id;
      }
    }

    const status = asText(mapped.status).toUpperCase();
    normalized.status = status;
    if ((context === "INVENTORY" || context === "INBOUND") && !status) {
      errors.push({
        field: "status",
        value: mapped.status,
        code: "STATUS_REQUIRED",
        message: "Estado requerido: no se asignará AVAILABLE automáticamente.",
        severity: "ERROR"
      });
    } else if ((context === "INVENTORY" || context === "INBOUND") && !statusSet.has(status)) {
      warnings.push({
        field: "status",
        value: status,
        code: "UNKNOWN_STATUS",
        message: "Estado no catalogado; se conservará el código sin convertirlo a AVAILABLE.",
        severity: "WARNING"
      });
    }

    const isInventoryImport = context === "INVENTORY" || context === "INBOUND";
    const projectCode = asText(mapped.project).toUpperCase();
    if (projectCode) {
      const nameMatches = projectsByName.get(projectCode) || [];
      const project = projectByCode.get(projectCode) || (nameMatches.length === 1 ? nameMatches[0] : undefined);
      if (!matchedProduct && isInventoryImport && nameMatches.length > 1 && !projectByCode.has(projectCode)) {
        errors.push({
          field: "project",
          value: projectCode,
          code: "NEW_SKU_PROJECT_REQUIRED",
          message: "SKU nuevo con proyecto ambiguo; no puede ejecutarse.",
          severity: "ERROR"
        });
      }
      if (!project) {
        if (context === "REQUISITIONS" || context === "PRODUCTS") {
          errors.push({ field: "project", value: projectCode, code: "PROJECT_NOT_FOUND", message: "Proyecto no encontrado.", severity: "ERROR" });
        } else if (context === "CLIENTS_PROJECTS") {
          warnings.push({
            field: "project",
            value: projectCode,
            code: "NEW_PROJECT",
            message: "Proyecto nuevo propuesto; se creará al confirmar.",
            severity: "WARNING"
          });
          normalized.action = "CREATE";
        } else {
          if (!matchedProduct && isInventoryImport) {
            errors.push({
              field: "project",
              value: projectCode,
              code: "NEW_SKU_PROJECT_REQUIRED",
              message: "SKU nuevo sin proyecto resuelto; no puede ejecutarse.",
              severity: "ERROR"
            });
          } else {
            warnings.push({ field: "project", value: projectCode, code: "PROJECT_UNRESOLVED", message: "Proyecto no resuelto; se conservará el proyecto canónico del producto.", severity: "WARNING" });
          }
        }
      } else {
        if (matchedProduct?.customerId && matchedProduct.customerId !== project.id && (context === "INVENTORY" || context === "INBOUND")) {
          errors.push({
            field: "project",
            value: projectCode,
            code: "PRODUCT_PROJECT_CONFLICT",
            message: "El proyecto fuente contradice el proyecto formal del producto.",
            severity: "ERROR"
          });
        }
        normalized.projectId = project.id;
        normalized.projectCode = project.code;
        normalized.clientId = project.clientId;
        normalized.clientName = project.client?.tradeName || project.client?.name || null;
      }
    } else if (!matchedProduct && isInventoryImport) {
      errors.push({
        field: "project",
        code: "NEW_SKU_PROJECT_REQUIRED",
        message: "SKU nuevo requiere un proyecto resuelto antes de ejecutar.",
        severity: "ERROR"
      });
    }

    const clientName = asText(mapped.client);
    if (clientName && !normalized.clientId) {
      const matches = clients.filter((c) => {
        const names = [c.name, c.tradeName, c.legalName].filter(Boolean).map((n) => n!.toUpperCase());
        return names.includes(clientName.toUpperCase());
      });
      if (matches.length === 1) {
        normalized.clientId = matches[0]!.id;
        normalized.clientName = matches[0]!.tradeName || matches[0]!.name;
      } else if (matches.length > 1) {
        errors.push({ field: "client", value: clientName, code: "CLIENT_AMBIGUOUS", message: "Cliente ambiguo.", severity: "ERROR" });
      } else if (context === "CLIENTS_PROJECTS") {
        warnings.push({ field: "client", value: clientName, code: "NEW_CLIENT", message: "Cliente nuevo propuesto.", severity: "WARNING" });
        normalized.action = "CREATE";
      } else {
        warnings.push({ field: "client", value: clientName, code: "CLIENT_UNRESOLVED", message: "Cliente no resuelto.", severity: "WARNING" });
      }
    }

    const serialInput = asText(mapped.serialNumber).toUpperCase();
    const serial = asRealSerial(mapped.serialNumber);
    if (SERIAL_PLACEHOLDERS.has(serialInput)) normalized.serialNumber = null;
    if (serial) {
      normalized.serialNumber = serial;
      if (fileSerials.has(serial)) {
        errors.push({ field: "serialNumber", value: serial, code: "SERIAL_DUPLICATE_FILE", message: "Serial duplicado en archivo.", severity: "ERROR" });
      }
      fileSerials.add(serial);
      if (serialSet.has(serial)) {
        errors.push({ field: "serialNumber", value: serial, code: "SERIAL_EXISTS", message: "Serial ya existe en sistema.", severity: "ERROR" });
      }
      if (qty != null && qty !== 1) {
        errors.push({ field: "qty", value: qty, code: "SERIAL_QTY", message: "Fila con serial debe tener cantidad 1.", severity: "ERROR" });
      }
    } else if (normalized.serialControlled === true && (context === "INVENTORY" || context === "INBOUND")) {
      warnings.push({ field: "serialNumber", code: "SERIAL_MISSING", message: "Producto serializado sin serial.", severity: "WARNING" });
    }

    const imei = asText(mapped.imei).toUpperCase();
    if (imei) {
      normalized.imei = imei;
      if (fileImeis.has(imei)) {
        errors.push({ field: "imei", value: imei, code: "IMEI_DUPLICATE_FILE", message: "IMEI duplicado en archivo.", severity: "ERROR" });
      }
      fileImeis.add(imei);
      if (imeiSet.has(imei)) {
        errors.push({ field: "imei", value: imei, code: "IMEI_EXISTS", message: "IMEI ya existe en sistema.", severity: "ERROR" });
      }
    }

    const lot = asText(mapped.lotNumber);
    if (lot) normalized.lotNumber = lot;
    else if (normalized.lotControlled === true && (context === "INVENTORY" || context === "INBOUND")) {
      warnings.push({ field: "lotNumber", code: "LOT_MISSING", message: "Producto con control de lote sin lote.", severity: "WARNING" });
    }

    for (const boolField of ["serialControlled", "lotControlled"] as const) {
      if (mapped[boolField] != null && mapped[boolField] !== "") {
        const b = asBool(mapped[boolField]);
        if (b == null) errors.push({ field: boolField, value: mapped[boolField], code: "INVALID_BOOL", message: "Booleano inválido.", severity: "ERROR" });
        else normalized[boolField] = b;
      }
    }

    if (!normalized.action) {
      if (errors.length) normalized.action = "REJECT";
      else if (context === "PRODUCTS") normalized.action = productBySku.has(sku) ? "UPDATE" : "CREATE";
      else normalized.action = "IMPORT";
    }

    return {
      sourceRow: idx + 1,
      data: raw,
      normalized,
      errors,
      warnings,
      action: String(normalized.action || "IMPORT")
    };
  });

  const validRows = validated.filter((r) => r.errors.length === 0).length;
  const invalidRows = validated.filter((r) => r.errors.length > 0).length;
  const warningRows = validated.filter((r) => r.warnings.length > 0).length;

  let valuation = { mxn: 0, usd: 0, missingPriceQty: 0 };
  for (const row of validated) {
    const qty = Number(row.normalized.qty || 0);
    const mxn = row.normalized.unitPriceMxn != null ? Number(row.normalized.unitPriceMxn) : null;
    const usd = row.normalized.unitPriceUsd != null ? Number(row.normalized.unitPriceUsd) : null;
    if (mxn != null) valuation.mxn += qty * mxn;
    if (usd != null) valuation.usd += qty * usd;
    if (mxn == null && usd == null && qty > 0) valuation.missingPriceQty += qty;
  }

  return {
    rows: validated,
    summary: {
      totalRows: validated.length,
      validRows,
      invalidRows,
      warningRows,
      valuation
    }
  };
}

export async function buildInventoryReconcileDiff(
  rows: Array<{ normalized: Record<string, unknown>; errors: Issue[] }>
) {
  const current = await prisma.inventory.findMany({
    include: {
      product: { select: { sku: true, customer: { select: { code: true } } } },
      location: { select: { code: true } },
      layers: { select: { lotNumber: true, qty: true } }
    }
  });
  const currentMap = new Map<string, number>();
  for (const inv of current) {
    const project = inv.product.customer?.code || "";
    const key = `${project}|${inv.product.sku}|${inv.location.code}|${inv.status}|`;
    currentMap.set(key, Number(inv.qty));
    for (const layer of inv.layers) {
      const lotKey = `${project}|${inv.product.sku}|${inv.location.code}|${inv.status}|${layer.lotNumber || ""}`;
      currentMap.set(lotKey, Number(layer.qty));
    }
  }
  const fileMap = new Map<string, number>();
  const requiredLocationMap = new Map<string, { location: string; records: number; fileQty: number }>();
  for (const row of rows) {
    const missingLocation = row.errors.some((issue) => issue.code === "SOURCE_LOCATION_NOT_IN_MASTER");
    if (!missingLocation) continue;
    const location = String(row.normalized.location || "").trim().toUpperCase();
    if (!location) continue;
    const entry = requiredLocationMap.get(location) || { location, records: 0, fileQty: 0 };
    entry.records += 1;
    entry.fileQty += Number(row.normalized.qty || 0);
    requiredLocationMap.set(location, entry);
  }
  for (const row of rows.filter((r) => r.errors.length === 0)) {
    const project = String(row.normalized.projectCode || "");
    const sku = String(row.normalized.sku || "");
    const location = String(row.normalized.location || "");
    const status = String(row.normalized.status || "AVAILABLE");
    const lot = String(row.normalized.lotNumber || "");
    const key = `${project}|${sku}|${location}|${status}|${lot}`;
    fileMap.set(key, (fileMap.get(key) || 0) + Number(row.normalized.qty || 0));
  }
  const keys = new Set([...currentMap.keys(), ...fileMap.keys()]);
  const diffs = [...keys]
    .map((key) => {
      const [project, sku, location, status, lot] = key.split("|");
      const actual = currentMap.get(key) || 0;
      const file = fileMap.get(key) || 0;
      return { project: project || null, sku, location, status, lot: lot || null, actual, file, delta: file - actual };
    })
    .filter((d) => d.delta !== 0)
    .slice(0, 500);
  return {
    differences: diffs,
    requiredNewLocations: [...requiredLocationMap.values()].sort(
      (a, b) => b.records - a.records || a.location.localeCompare(b.location)
    )
  };
}

export function toDecimal(value: unknown): Prisma.Decimal | null {
  const n = asNumber(value);
  return n == null ? null : new Prisma.Decimal(n);
}
