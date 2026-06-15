/**
 * One-off helper: read Logitec-style ENTRADAS CSV and emit inventory import lines.
 * Usage: node scripts/to-inventory-csv.mjs "d:\path\file.csv"
 */
import fs from "fs";

function parseCsvLine(line) {
  const values = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === "," && !inQuotes) {
      values.push(current.trim());
      current = "";
      continue;
    }
    current += ch;
  }
  values.push(current.trim());
  return values;
}

const inputPath = process.argv[2];
if (!inputPath) {
  console.error("Usage: node scripts/to-inventory-csv.mjs <path-to-entradas.csv>");
  process.exit(1);
}

const text = fs.readFileSync(inputPath, "utf8");
const lines = text.split(/\r?\n/).filter((l) => l.trim());
if (lines.length < 2) {
  console.error("Empty CSV");
  process.exit(1);
}

const header = parseCsvLine(lines[0]).map((h) => h.trim().toLowerCase());
const idxSku = header.findIndex((h) => h === "material number");
const idxPoQty = header.findIndex((h) => h === "po qt" || h === "po_qt");
if (idxSku < 0) {
  console.error("Missing column: Material Number");
  process.exit(1);
}

const bySku = new Map();
for (let i = 1; i < lines.length; i += 1) {
  const cols = parseCsvLine(lines[i]);
  const sku = (cols[idxSku] || "").trim();
  if (!sku) continue;

  let qty = 1;
  if (idxPoQty >= 0 && cols[idxPoQty]) {
    const raw = cols[idxPoQty].replace(/\s+/g, "").replace(",", ".");
    const n = Number(raw);
    if (!Number.isNaN(n) && n > 0) qty = n;
  }
  bySku.set(sku, (bySku.get(sku) || 0) + qty);
}

const sorted = [...bySku.entries()].sort((a, b) => b[1] - a[1]);
console.log("sku,quantity,warehouse,location,status");
let slot = 1;
for (const [sku, q] of sorted) {
  console.log(`${sku},${q},TULTITLAN24,TULTITLAN24-A1-R1-N${slot},AVAILABLE`);
  slot += 1;
}
