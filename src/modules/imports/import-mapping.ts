export type ImportContext = "INVENTORY" | "INBOUND" | "REQUISITIONS" | "PRODUCTS" | "CLIENTS_PROJECTS";

export type CanonicalField =
  | "sku"
  | "barcode"
  | "name"
  | "description"
  | "qty"
  | "location"
  | "status"
  | "lotNumber"
  | "serialNumber"
  | "imei"
  | "unitPriceMxn"
  | "unitPriceUsd"
  | "receivedAt"
  | "reference"
  | "notes"
  | "client"
  | "project"
  | "unit"
  | "serialControlled"
  | "lotControlled"
  | "warehouse"
  | "priority"
  | "requisitionNumber"
  | "legalName"
  | "tradeName"
  | "rfc"
  | "email"
  | "phone";

const ALIASES: Record<CanonicalField, string[]> = {
  sku: ["sku", "material", "material number", "item", "product code", "codigo", "código", "codigo producto"],
  barcode: ["barcode", "ean", "upc", "codigo de barras", "código de barras"],
  name: ["name", "product", "producto", "description", "descripcion", "descripción", "material description"],
  description: ["description", "descripcion", "descripción", "detalle"],
  qty: ["qty", "quantity", "po qt", "cantidad", "cant", "qty on hand", "stock"],
  location: ["location", "ubicacion", "ubicación", "bin", "loc", "almacen ubicacion"],
  status: ["status", "estado", "stock status", "inventory status"],
  lotNumber: ["lot", "lote", "lot number", "batch", "batch number"],
  serialNumber: ["serial", "serial number", "serie", "número de serie", "numero de serie"],
  imei: ["imei", "imei number"],
  unitPriceMxn: ["unit price mxn", "precio mxn", "precio unitario mxn", "po net price", "po net price mxn", "precio"],
  unitPriceUsd: ["unit price usd", "precio usd", "precio unitario usd", "po net price usd"],
  receivedAt: ["received at", "fecha recepcion", "fecha recepción", "receipt date", "fecha"],
  reference: ["reference", "referencia", "po number", "po no", "orden compra", "requisition"],
  notes: ["notes", "notas", "comentarios", "obs", "observaciones"],
  client: ["client", "cliente", "customer name", "razon social", "razón social", "trade name"],
  project: ["project", "proyecto", "customer", "customer project", "project code", "codigo proyecto"],
  unit: ["unit", "uom", "unidad"],
  serialControlled: ["serial controlled", "serializado", "requiere serie"],
  lotControlled: ["lot controlled", "lote controlado", "requiere lote"],
  warehouse: ["warehouse", "almacen", "almacén"],
  priority: ["priority", "prioridad"],
  requisitionNumber: ["requisition", "requisition number", "numero requisicion", "número requisición", "folio"],
  legalName: ["legal name", "razon social", "razón social"],
  tradeName: ["trade name", "nombre comercial"],
  rfc: ["rfc", "tax id"],
  email: ["email", "correo"],
  phone: ["phone", "telefono", "teléfono"]
};

export const CONTEXT_FIELDS: Record<
  ImportContext,
  { required: CanonicalField[]; optional: CanonicalField[] }
> = {
  INVENTORY: {
    required: ["sku", "qty", "location"],
    optional: ["status", "lotNumber", "serialNumber", "imei", "unitPriceMxn", "unitPriceUsd", "receivedAt", "reference", "project", "client", "barcode", "name"]
  },
  INBOUND: {
    required: ["sku", "qty", "location"],
    optional: ["status", "lotNumber", "serialNumber", "imei", "unitPriceMxn", "unitPriceUsd", "receivedAt", "reference", "project", "notes"]
  },
  REQUISITIONS: {
    required: ["requisitionNumber", "project", "sku", "qty"],
    optional: ["priority", "reference", "notes", "client"]
  },
  PRODUCTS: {
    required: ["sku", "name"],
    optional: ["barcode", "description", "unit", "project", "serialControlled", "lotControlled", "warehouse"]
  },
  CLIENTS_PROJECTS: {
    required: ["client", "project"],
    optional: ["legalName", "tradeName", "rfc", "email", "phone", "notes"]
  }
};

export function normalizeHeader(value: string): string {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\r\n]+/g, " ")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

export function suggestField(header: string): CanonicalField | null {
  const normalized = normalizeHeader(header);
  if (!normalized) return null;
  // Never map aggregate totals as unit price / reference.
  if (/^total\b/.test(normalized)) return null;
  for (const [field, aliases] of Object.entries(ALIASES) as Array<[CanonicalField, string[]]>) {
    if (aliases.includes(normalized)) return field;
  }
  // Prefer longest whole-token / prefix alias; ignore very short aliases in fuzzy mode.
  let best: { field: CanonicalField; score: number } | null = null;
  for (const [field, aliases] of Object.entries(ALIASES) as Array<[CanonicalField, string[]]>) {
    for (const alias of aliases) {
      if (alias.length < 4) continue;
      const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const asWord = new RegExp(`(?:^|\\s)${escaped}(?:\\s|$|\\()`);
      const asPrefix = normalized.startsWith(`${alias} `) || normalized.startsWith(`${alias}(`);
      if (asWord.test(normalized) || asPrefix || normalized === alias) {
        const score = alias.length;
        if (!best || score > best.score) best = { field, score };
      }
    }
  }
  return best?.field ?? null;
}

function baseHeader(value: string): string {
  return normalizeHeader(value).replace(/_\d+$/, "");
}

function priceCurrencyFromBlock(
  headers: string[],
  rows: Array<Record<string, unknown>>,
  priceIndex: number
): "MXN" | "USD" | null {
  const currencyIndex = headers.findIndex(
    (header, index) => index > priceIndex && index <= priceIndex + 2 && baseHeader(header) === "currency"
  );
  if (currencyIndex < 0) return null;
  const currencyHeader = headers[currencyIndex]!;
  const values = new Set(
    rows
      .map((row) => String(row[currencyHeader] ?? "").trim().toUpperCase())
      .filter(Boolean)
  );
  if (values.size !== 1) return null;
  return values.has("MXN") ? "MXN" : values.has("USD") ? "USD" : null;
}

export function buildSuggestedMapping(
  headers: string[],
  rows: Array<Record<string, unknown>> = []
): Record<string, CanonicalField | null> {
  const mapping: Record<string, CanonicalField | null> = {};
  const used = new Set<CanonicalField>();
  const duplicatedPriceColumns = headers
    .map((header, index) => ({ header, index }))
    .filter(({ header }) => baseHeader(header) === "po net price");

  for (const [index, header] of headers.entries()) {
    const currency = duplicatedPriceColumns.length > 1 && baseHeader(header) === "po net price"
      ? priceCurrencyFromBlock(headers, rows, index)
      : null;
    const suggested = currency === "MXN"
      ? "unitPriceMxn"
      : currency === "USD"
        ? "unitPriceUsd"
        : duplicatedPriceColumns.length > 1 && baseHeader(header) === "po net price"
          ? null
          : suggestField(header);
    if (suggested && !used.has(suggested)) {
      mapping[header] = suggested;
      used.add(suggested);
    } else {
      mapping[header] = suggested && !used.has(suggested) ? suggested : null;
      if (mapping[header]) used.add(mapping[header]!);
    }
  }
  return mapping;
}

export function applyMapping(
  row: Record<string, unknown>,
  mapping: Record<string, CanonicalField | null>
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [header, field] of Object.entries(mapping)) {
    if (!field) continue;
    if (out[field] == null || out[field] === "") out[field] = row[header];
  }
  return out;
}
