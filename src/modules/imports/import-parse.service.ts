import * as XLSX from "xlsx";

export type ParsedSheet = {
  name: string;
  headerRowIndex: number;
  headers: string[];
  rows: Array<Record<string, unknown>>;
  totalDataRows: number;
};

export type ParsedWorkbook = {
  fileType: "XLSX" | "CSV";
  sheets: ParsedSheet[];
};

const MAX_ROWS = 20000;
const MAX_SHEETS = 30;

function cellToString(value: unknown): string {
  if (value == null) return "";
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "number") return String(value);
  return String(value).trim();
}

function scoreHeaderRow(values: unknown[]): number {
  const filled = values.filter((v) => cellToString(v) !== "").length;
  if (filled < 2) return -1;
  const textish = values.filter((v) => {
    const s = cellToString(v);
    return s && Number.isNaN(Number(s));
  }).length;
  return filled * 2 + textish;
}

function detectHeaderRow(matrix: unknown[][]): number {
  const limit = Math.min(matrix.length, 40);
  let bestIdx = 0;
  let bestScore = -1;
  for (let i = 0; i < limit; i += 1) {
    const score = scoreHeaderRow(matrix[i] || []);
    if (score > bestScore) {
      bestScore = score;
      bestIdx = i;
    }
  }
  return bestIdx;
}

function uniqueHeaders(raw: unknown[]): string[] {
  const seen = new Map<string, number>();
  return raw.map((value, idx) => {
    const base = cellToString(value) || `COL_${idx + 1}`;
    const count = seen.get(base) || 0;
    seen.set(base, count + 1);
    return count === 0 ? base : `${base}_${count + 1}`;
  });
}

function matrixToSheet(name: string, matrix: unknown[][]): ParsedSheet {
  if (!matrix.length) {
    return { name, headerRowIndex: 0, headers: [], rows: [], totalDataRows: 0 };
  }
  const headerRowIndex = detectHeaderRow(matrix);
  const headers = uniqueHeaders(matrix[headerRowIndex] || []);
  const rows: Array<Record<string, unknown>> = [];
  for (let r = headerRowIndex + 1; r < matrix.length; r += 1) {
    const line = matrix[r] || [];
    const obj: Record<string, unknown> = {};
    let empty = true;
    headers.forEach((header, c) => {
      const value = line[c];
      const normalized = value instanceof Date ? value.toISOString() : value ?? "";
      if (cellToString(normalized) !== "") empty = false;
      obj[header] = normalized;
    });
    if (!empty) rows.push(obj);
    if (rows.length >= MAX_ROWS) break;
  }
  return {
    name,
    headerRowIndex,
    headers,
    rows,
    totalDataRows: rows.length
  };
}

/** Robust CSV parser: quotes, commas, escaped newlines, BOM, CRLF/LF. */
export function parseCsv(text: string): string[][] {
  const input = text.replace(/^\uFEFF/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < input.length; i += 1) {
    const ch = input[i];
    const next = input[i + 1];
    if (inQuotes) {
      if (ch === '"' && next === '"') {
        current += '"';
        i += 1;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        current += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      continue;
    }
    if (ch === ",") {
      row.push(current);
      current = "";
      continue;
    }
    if (ch === "\n") {
      row.push(current);
      rows.push(row);
      row = [];
      current = "";
      continue;
    }
    if (ch === "\r") {
      if (next === "\n") continue;
      row.push(current);
      rows.push(row);
      row = [];
      current = "";
      continue;
    }
    current += ch;
  }
  if (current.length || row.length) {
    row.push(current);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => String(c).trim() !== ""));
}

export function parseUpload(buffer: Buffer, originalFileName: string): ParsedWorkbook {
  const lower = originalFileName.toLowerCase();
  if (lower.endsWith(".xlsm")) {
    throw new Error("XLSM_REJECTED");
  }
  if (lower.endsWith(".csv") || lower.endsWith(".txt")) {
    const text = buffer.toString("utf8");
    const matrix = parseCsv(text);
    return { fileType: "CSV", sheets: [matrixToSheet("CSV", matrix)] };
  }
  if (!(lower.endsWith(".xlsx") || lower.endsWith(".xls"))) {
    throw new Error("UNSUPPORTED_FILE_TYPE");
  }
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true, dense: false });
  const sheetNames = workbook.SheetNames || [];
  if (sheetNames.length > MAX_SHEETS) throw new Error("TOO_MANY_SHEETS");
  const sheets = sheetNames.map((name) => {
    const sheet = workbook.Sheets[name];
    const matrix = XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      defval: "",
      // Keep the stored value (not Excel's formatted display). In particular,
      // accounting zero displays as "$-" but must remain numeric 0.
      raw: true,
      blankrows: false
    }) as unknown[][];
    return matrixToSheet(name, matrix);
  });
  return { fileType: "XLSX", sheets };
}
