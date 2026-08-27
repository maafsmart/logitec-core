export const COMPANY_PROJECT_LABELS = ["LOGITEC"] as const;
export const OWNERSHIP_STATUS_LABELS = ["CUSTOMER OWNS", "CUSTOMR OWNS", "ASO"] as const;
export const FREE_TO_SALE_PROJECT_LABELS = ["FREE TO SALE", "FREE_TO_SALE"] as const;

export function normalizeProjectLabel(value: unknown): string {
  if (value == null) return "";
  return String(value).trim().replace(/\s+/g, " ").toUpperCase();
}

export function isCompanyProjectLabel(value: unknown): boolean {
  return (COMPANY_PROJECT_LABELS as readonly string[]).includes(normalizeProjectLabel(value));
}

export function isOwnershipStatusLabel(value: unknown): boolean {
  return (OWNERSHIP_STATUS_LABELS as readonly string[]).includes(normalizeProjectLabel(value));
}

export function isFreeToSaleProjectLabel(value: unknown): boolean {
  return (FREE_TO_SALE_PROJECT_LABELS as readonly string[]).includes(normalizeProjectLabel(value));
}

export function isForbiddenInventoryProjectLabel(value: unknown): boolean {
  return (
    isCompanyProjectLabel(value) ||
    isOwnershipStatusLabel(value) ||
    isFreeToSaleProjectLabel(value)
  );
}

export function isRealInventoryProjectLabel(value: unknown): boolean {
  const normalized = normalizeProjectLabel(value);
  return Boolean(normalized) && !isForbiddenInventoryProjectLabel(normalized);
}

export function isForbiddenInventoryProjectRecord(record: { code?: unknown; name?: unknown } | null | undefined): boolean {
  if (!record) return true;
  return isForbiddenInventoryProjectLabel(record.code) || isForbiddenInventoryProjectLabel(record.name);
}
