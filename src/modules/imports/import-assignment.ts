import {
  isCompanyProjectLabel,
  isOwnershipStatusLabel
} from "../inventory/inventory-project-rules.js";

export const FREE_TO_SALE_LABEL = "FREE TO SALE";
export const FREE_TO_SALE_TYPE = "FREE_TO_SALE";

export type ImportAssignmentType = "PROJECT" | "FREE_TO_SALE" | "UNRESOLVED" | "LEGACY_UNASSIGNED";
export type ImportAssignmentKind = "FREE_TO_SALE" | "UNRESOLVED" | "PROJECT_LOOKUP" | "UNASSIGNED";

export type ClassifiedImportAssignment = {
  kind: ImportAssignmentKind;
  assignmentType: ImportAssignmentType;
  projectId: null;
  project: string;
  createsCustomer: false;
  createsProject: false;
};

export type ImportAssignmentSummary = {
  totalRows: number;
  customerBlank: number;
  freeToSaleAssigned: number;
  projectAssigned: number;
  assignmentUnresolved: number;
};

function asText(value: unknown): string {
  if (value == null) return "";
  return String(value).trim();
}

export function normalizeImportLabel(value: unknown): string {
  return asText(value).replace(/\s+/g, " ").toUpperCase();
}

export function isFreeToSaleLabel(value: unknown): boolean {
  return normalizeImportLabel(value) === FREE_TO_SALE_LABEL;
}

function isFreeToSaleAssignmentMarker(value: unknown): boolean {
  const norm = normalizeImportLabel(value);
  return norm === FREE_TO_SALE_LABEL || norm === FREE_TO_SALE_TYPE;
}

function freeToSaleResult(): ClassifiedImportAssignment {
  return {
    kind: "FREE_TO_SALE",
    assignmentType: "FREE_TO_SALE",
    projectId: null,
    project: "",
    createsCustomer: false,
    createsProject: false
  };
}

function unassignedResult(): ClassifiedImportAssignment {
  return {
    kind: "UNASSIGNED",
    assignmentType: "LEGACY_UNASSIGNED",
    projectId: null,
    project: "",
    createsCustomer: false,
    createsProject: false
  };
}

/**
 * Central assignment classifier for inventory import rows.
 * Mapping must keep CUSTOMER and LOTE separate; this function never copies LOTE into project.
 */
export function classifyImportAssignment(input: {
  customer?: unknown;
  lotNumber?: unknown;
  assignmentType?: unknown;
}): ClassifiedImportAssignment {
  const customer = asText(input.customer);
  const customerNorm = normalizeImportLabel(customer);

  if (isFreeToSaleAssignmentMarker(input.assignmentType)) {
    return freeToSaleResult();
  }
  if (isFreeToSaleLabel(customer)) {
    return freeToSaleResult();
  }
  if (isCompanyProjectLabel(customerNorm) || isOwnershipStatusLabel(customerNorm)) {
    return unassignedResult();
  }
  if (customerNorm) {
    return {
      kind: "PROJECT_LOOKUP",
      assignmentType: "PROJECT",
      projectId: null,
      project: customer,
      createsCustomer: false,
      createsProject: false
    };
  }
  if (isFreeToSaleLabel(input.lotNumber)) {
    return freeToSaleResult();
  }
  return {
    kind: "UNRESOLVED",
    assignmentType: "UNRESOLVED",
    projectId: null,
    project: "",
    createsCustomer: false,
    createsProject: false
  };
}

export function applyFreeToSaleNormalized(normalized: Record<string, unknown>): void {
  normalized.assignmentType = "FREE_TO_SALE";
  normalized.projectId = null;
  normalized.projectCode = null;
  normalized.projectName = null;
  normalized.project = "";
}

export function applyUnassignedNormalized(normalized: Record<string, unknown>): void {
  normalized.assignmentType = "LEGACY_UNASSIGNED";
  normalized.projectId = null;
  normalized.projectCode = null;
  normalized.projectName = null;
  normalized.project = "";
}

export function summarizeImportAssignments(
  rows: Array<{
    normalized?: Record<string, unknown> | null;
    errors?: Array<{ code?: string }> | null;
    reviewState?: string | null;
  }>
): ImportAssignmentSummary {
  const summary: ImportAssignmentSummary = {
    totalRows: 0,
    customerBlank: 0,
    freeToSaleAssigned: 0,
    projectAssigned: 0,
    assignmentUnresolved: 0
  };
  for (const row of rows) {
    if (row.reviewState === "IGNORED") continue;
    summary.totalRows += 1;
    const n = row.normalized && typeof row.normalized === "object" && !Array.isArray(row.normalized) ? row.normalized : {};
    if (!asText(n.sourceCustomer ?? n.project)) summary.customerBlank += 1;
    const type = String(n.assignmentType || "");
    if (type === "FREE_TO_SALE") {
      summary.freeToSaleAssigned += 1;
      continue;
    }
    if (type === "PROJECT") {
      summary.projectAssigned += 1;
      continue;
    }
    if (type === "LEGACY_UNASSIGNED") {
      continue;
    }
    const unresolved =
      type === "UNRESOLVED" ||
      (Array.isArray(row.errors) && row.errors.some((issue) => issue?.code === "ASSIGNMENT_UNRESOLVED"));
    if (unresolved) summary.assignmentUnresolved += 1;
  }
  return summary;
}
