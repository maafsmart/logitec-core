import type { UserRole } from "../../middlewares/auth.middleware.js";

export function canExposeEconomicValuation(role: UserRole | string | null | undefined): boolean {
  return role === "ADMIN";
}
