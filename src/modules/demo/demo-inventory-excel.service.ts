import { readFileSync, statSync } from "node:fs";
import path from "node:path";
import {
  applyMapping,
  buildSuggestedMapping,
  normalizeHeader,
  type CanonicalField
} from "../imports/import-mapping.js";
import { parseUpload, type ParsedSheet, type ParsedWorkbook } from "../imports/import-parse.service.js";

export type DemoInventoryItem = {
  sku: string;
  description?: string;
  project?: string;
  client?: string;
  location: string;
  qty: number;
  pedido?: string;
  partida?: string;
  sap?: string;
  serialNumber?: string;
  status?: string;
  lotNumber?: string;
  barcode?: string;
  reference?: string;
};

export type DemoInventoryPayload = {
  source: "EXCEL_READ_ONLY";
  available: true;
  fileLabel: string;
  sheetName: string;
  summary: {
    pieces: number;
    balances: number;
    locations: number;
    rows: number;
    products: number;
    projects: number;
  };
  items: DemoInventoryItem[];
};

const REQUIRED_FIELDS: CanonicalField[] = ["sku", "qty", "location"];

const EXTRA_HEADER_ALIASES: Record<"pedido" | "partida" | "sap", string[]> = {
  pedido: ["pedido", "sales ordener", "sales order", "orden de venta", "sales ord"],
  partida: ["partida", "line item", "posicion", "item line"],
  sap: ["sap", "sap number", "sap material"]
};

function asText(value: unknown): string {
  if (value == null) return "";
  return String(value).trim();
}

function asNumber(value: unknown): number | null {
  if (value == null || value === "") return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  let cleaned = String(value).trim();
  if (!cleaned || /^[-–—]+$/.test(cleaned)) return null;
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

function resolveConfiguredExcelPath(configuredPath: string): string {
  const resolved = path.resolve(configuredPath);
  const stat = statSync(resolved);
  if (!stat.isFile()) {
    throw new Error("DEMO_EXCEL_NOT_FILE");
  }
  const ext = path.extname(resolved).toLowerCase();
  if (![".xlsx", ".xls", ".csv"].includes(ext)) {
    throw new Error("DEMO_EXCEL_UNSUPPORTED");
  }
  return resolved;
}

function headerMatches(header: string, aliases: string[]): boolean {
  const normalized = normalizeHeader(header);
  return aliases.some((alias) => normalized === alias || normalized.includes(alias));
}

function extractExtraFields(
  raw: Record<string, unknown>,
  headers: string[]
): Pick<DemoInventoryItem, "pedido" | "partida" | "sap"> {
  const out: Pick<DemoInventoryItem, "pedido" | "partida" | "sap"> = {};
  for (const header of headers) {
    const value = asText(raw[header]);
    if (!value) continue;
    if (!out.pedido && headerMatches(header, EXTRA_HEADER_ALIASES.pedido)) out.pedido = value;
    if (!out.partida && headerMatches(header, EXTRA_HEADER_ALIASES.partida)) out.partida = value;
    if (!out.sap && headerMatches(header, EXTRA_HEADER_ALIASES.sap)) out.sap = value;
  }
  return out;
}

function sheetHasInventoryShape(sheet: ParsedSheet): boolean {
  const mapping = buildSuggestedMapping(sheet.headers, sheet.rows);
  return REQUIRED_FIELDS.every((field) => Object.values(mapping).includes(field));
}

export function pickInventorySheet(workbook: ParsedWorkbook, preferredSheetName?: string | null): ParsedSheet {
  if (preferredSheetName) {
    const exact = workbook.sheets.find((sheet) => sheet.name === preferredSheetName);
    if (exact) return exact;
    const fuzzy = workbook.sheets.find((sheet) =>
      normalizeHeader(sheet.name).includes(normalizeHeader(preferredSheetName))
    );
    if (fuzzy) return fuzzy;
    throw new Error("DEMO_EXCEL_SHEET_NOT_FOUND");
  }

  const inventarioSheet = workbook.sheets.find((sheet) => /inventario/i.test(sheet.name));
  if (inventarioSheet && sheetHasInventoryShape(inventarioSheet)) return inventarioSheet;

  const ranked = [...workbook.sheets]
    .filter((sheet) => sheetHasInventoryShape(sheet))
    .sort((a, b) => b.totalDataRows - a.totalDataRows);
  if (!ranked.length) throw new Error("DEMO_EXCEL_SHEET_NOT_FOUND");
  return ranked[0]!;
}

function buildItem(
  raw: Record<string, unknown>,
  mapped: Record<string, unknown>,
  headers: string[]
): DemoInventoryItem | null {
  const sku = asText(mapped.sku);
  const location = asText(mapped.location);
  const qty = asNumber(mapped.qty);
  if (!sku || !location || qty == null || qty <= 0) return null;

  const extras = extractExtraFields(raw, headers);
  const description = asText(mapped.name) || asText(mapped.description) || undefined;
  const project = asText(mapped.project) || undefined;
  const client = asText(mapped.client) || undefined;
  const serialNumber = asText(mapped.serialNumber) || undefined;
  const status = asText(mapped.status) || undefined;
  const lotNumber = asText(mapped.lotNumber) || undefined;
  const barcode = asText(mapped.barcode) || undefined;
  const reference = asText(mapped.reference) || undefined;
  const sap = extras.sap || sku;

  const item: DemoInventoryItem = {
    sku,
    location,
    qty,
    sap
  };
  if (description) item.description = description;
  if (project) item.project = project;
  if (client) item.client = client;
  if (extras.pedido) item.pedido = extras.pedido;
  else if (lotNumber && !/^free to sale$/i.test(lotNumber)) item.pedido = lotNumber;
  if (extras.partida) item.partida = extras.partida;
  if (serialNumber) item.serialNumber = serialNumber;
  if (status) item.status = status;
  if (lotNumber) item.lotNumber = lotNumber;
  if (barcode) item.barcode = barcode;
  if (reference) item.reference = reference;
  return item;
}

let cachedPayload: { mtimeMs: number; path: string; payload: DemoInventoryPayload } | null = null;

export function loadDemoInventoryFromExcel(configuredPath: string, preferredSheetName?: string | null): DemoInventoryPayload {
  const resolvedPath = resolveConfiguredExcelPath(configuredPath);
  const stat = statSync(resolvedPath);
  if (cachedPayload && cachedPayload.path === resolvedPath && cachedPayload.mtimeMs === stat.mtimeMs) {
    return cachedPayload.payload;
  }

  const buffer = readFileSync(resolvedPath);
  const parsed = parseUpload(buffer, path.basename(resolvedPath));
  const sheet = pickInventorySheet(parsed, preferredSheetName);
  const mapping = buildSuggestedMapping(sheet.headers, sheet.rows);
  const missingRequired = REQUIRED_FIELDS.filter((field) => !Object.values(mapping).includes(field));
  if (missingRequired.length) {
    throw new Error("DEMO_EXCEL_MAPPING_INCOMPLETE");
  }

  const items: DemoInventoryItem[] = [];
  for (const raw of sheet.rows) {
    const mapped = applyMapping(raw, mapping);
    const item = buildItem(raw, mapped, sheet.headers);
    if (item) items.push(item);
  }

  const pieces = items.reduce((sum, row) => sum + row.qty, 0);
  const locations = new Set(items.map((row) => row.location)).size;
  const products = new Set(items.map((row) => row.sku)).size;
  const projects = new Set(items.map((row) => row.project).filter(Boolean)).size;

  const payload: DemoInventoryPayload = {
    source: "EXCEL_READ_ONLY",
    available: true,
    fileLabel: "Inventario oficial",
    sheetName: sheet.name,
    summary: {
      pieces,
      balances: items.length,
      locations,
      rows: items.length,
      products,
      projects
    },
    items
  };

  cachedPayload = { mtimeMs: stat.mtimeMs, path: resolvedPath, payload };
  return payload;
}
