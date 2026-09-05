import { env } from "../../config/env.js";

export function isHugoOperationsFormEnabled(): boolean {
  if (env.NODE_ENV === "production" || env.DATABASE_ENVIRONMENT === "production") {
    return false;
  }
  return env.ENABLE_HUGO_OPERATIONS_FORM === "true";
}

export function operationsIntakeStorageRoot(): string {
  return env.HUGO_OPERATIONS_INTAKE_DIR.trim();
}
