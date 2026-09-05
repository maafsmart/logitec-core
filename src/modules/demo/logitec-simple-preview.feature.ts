import { env } from "../../config/env.js";

export function isLogitecSimplePreviewEnabled(): boolean {
  return env.NODE_ENV !== "production" && env.ENABLE_LOGITEC_SIMPLE_PREVIEW === "true";
}

export function demoInventoryExcelPath(): string | null {
  const configured = env.LOGITEC_DEMO_INVENTORY_XLSX_PATH?.trim();
  return configured || null;
}

export function demoInventoryExcelSheetName(): string | null {
  const configured = env.LOGITEC_DEMO_INVENTORY_SHEET_NAME?.trim();
  return configured || null;
}
