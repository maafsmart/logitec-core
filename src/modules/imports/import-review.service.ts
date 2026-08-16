import { Prisma } from "@prisma/client";
import { HttpError } from "../../shared/http-error.js";
import { FREE_TO_SALE_LABEL } from "./import-validate.service.js";

export const IMPORT_CORRECTION_FIELDS = [
  "location",
  "project",
  "client",
  "status",
  "unitPriceMxn",
  "unitPriceUsd",
  "lotNumber",
  "reference",
  "assignmentType"
] as const;

export type ImportCorrectionField = (typeof IMPORT_CORRECTION_FIELDS)[number];

type ReviewRow = {
  id: string;
  sourceRow: number;
  reviewState: string;
  data: Prisma.JsonValue;
  corrections: Prisma.JsonValue | null;
  normalized: Prisma.JsonValue | null;
  errors: Prisma.JsonValue | null;
  warnings: Prisma.JsonValue | null;
};

function asMeta(value: Prisma.JsonValue | null | undefined): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, any>) : {};
}

function rowIssues(row: ReviewRow): any[] {
  return [
    ...(Array.isArray(row.errors) ? row.errors : []),
    ...(Array.isArray(row.warnings) ? row.warnings : [])
  ];
}

export type ReviewMatchFilters = {
  sku?: string;
  lotNumber?: string;
  location?: string;
  status?: string;
  description?: string;
};

function matchesFilters(row: ReviewRow, match?: ReviewMatchFilters) {
  if (!match) return true;
  const n = asMeta(row.normalized);
  const data = asMeta(row.data);
  const sku = String(n.sku || data.sku || "").toUpperCase();
  const lot = String(n.lotNumber || "").toUpperCase();
  const location = String(n.location || "").toUpperCase();
  const status = String(n.status || "").toUpperCase();
  const description = String(n.name || n.description || "").toUpperCase();
  if (match.sku && sku !== match.sku.trim().toUpperCase()) return false;
  if (match.lotNumber && lot !== match.lotNumber.trim().toUpperCase()) return false;
  if (match.location && location !== match.location.trim().toUpperCase()) return false;
  if (match.status && status !== match.status.trim().toUpperCase()) return false;
  if (match.description && !description.includes(match.description.trim().toUpperCase())) return false;
  return true;
}

export function selectReviewTargets(
  rows: ReviewRow[],
  input: {
    scope: "SINGLE" | "SELECTED" | "ALL_MATCHING";
    sourceRows?: number[];
    issueCode?: string;
    issueValue?: unknown;
    match?: ReviewMatchFilters;
  }
) {
  let targets = rows.filter((row) => input.sourceRows?.includes(row.sourceRow));
  if (input.scope === "ALL_MATCHING") {
    targets = rows.filter((row) =>
      rowIssues(row).some(
        (issue: any) =>
          issue.code === input.issueCode && (input.issueValue === undefined || issue.value === input.issueValue)
      )
    );
  }
  targets = targets.filter((row) => matchesFilters(row, input.match));
  if (!targets.length) throw new HttpError(400, "No hay filas seleccionadas para corregir.");
  return targets;
}

export function buildAssignmentCorrection(field: ImportCorrectionField, value: unknown) {
  const next: Record<string, unknown> = {};
  if (field === "assignmentType" || (field === "project" && String(value || "").trim().toUpperCase() === FREE_TO_SALE_LABEL)) {
    next.assignmentType = "FREE_TO_SALE";
    next.project = "";
    return next;
  }
  if (field === "project") {
    next.assignmentType = "PROJECT";
    next.project = value;
    return next;
  }
  next[field] = value;
  return next;
}

export function assignmentAuditPayload(row: ReviewRow, field: ImportCorrectionField, value: unknown) {
  const n = asMeta(row.normalized);
  const original = {
    sourceCustomer: n.sourceCustomer ?? n.project ?? null,
    assignmentType: n.assignmentType ?? null,
    projectId: n.projectId ?? null,
    projectCode: n.projectCode ?? n.projectName ?? null
  };
  const next =
    field === "assignmentType" || String(value || "").trim().toUpperCase() === FREE_TO_SALE_LABEL
      ? { assignmentType: "FREE_TO_SALE", projectId: null, projectCode: null, project: null }
      : field === "project"
        ? { assignmentType: "PROJECT", project: value }
        : { [field]: value };
  return { original, next };
}

export function buildReviewGroups(rows: ReviewRow[], match?: ReviewMatchFilters) {
  const counts = { READY: 0, WARNING: 0, BLOCKED: 0, IGNORED: 0 };
  const groups = new Map<
    string,
    {
      issueCode: string;
      field: string;
      sourceValue: unknown;
      records: number;
      sourceRows: number[];
      subgroups: Array<{ sku: string; lotNumber: string; location: string; status: string; records: number; sourceRows: number[] }>;
    }
  >();
  const filtered = rows.filter((row) => matchesFilters(row, match));
  for (const row of filtered) {
    counts[row.reviewState as keyof typeof counts] = (counts[row.reviewState as keyof typeof counts] || 0) + 1;
    if (row.reviewState === "IGNORED") continue;
    const n = asMeta(row.normalized);
    for (const issue of rowIssues(row)) {
      if (issue.code === "RECONCILE_PREVIEW_ONLY") continue;
      const key = `${issue.code}|${issue.field || ""}|${JSON.stringify(issue.value ?? "")}`;
      const group = groups.get(key) || {
        issueCode: issue.code,
        field: issue.field || "",
        sourceValue: issue.value,
        records: 0,
        sourceRows: [] as number[],
        subgroups: [] as Array<{ sku: string; lotNumber: string; location: string; status: string; records: number; sourceRows: number[] }>
      };
      group.records += 1;
      group.sourceRows.push(row.sourceRow);
      if (issue.code === "ASSIGNMENT_UNRESOLVED") {
        const subKey = `${String(n.sku || "").toUpperCase()}|${String(n.lotNumber || "")}|${String(n.location || "")}|${String(n.status || "")}`;
        let sub = group.subgroups.find(
          (item) =>
            `${item.sku}|${item.lotNumber}|${item.location}|${item.status}` === subKey
        );
        if (!sub) {
          sub = {
            sku: String(n.sku || ""),
            lotNumber: String(n.lotNumber || ""),
            location: String(n.location || ""),
            status: String(n.status || ""),
            records: 0,
            sourceRows: []
          };
          group.subgroups.push(sub);
        }
        sub.records += 1;
        sub.sourceRows.push(row.sourceRow);
      }
      groups.set(key, group);
    }
  }
  return {
    counts,
    groups: [...groups.values()]
      .map((group) => ({
        ...group,
        subgroups: group.subgroups.sort((a, b) => b.records - a.records || a.sku.localeCompare(b.sku))
      }))
      .sort((a, b) => b.records - a.records),
    rows: filtered
  };
}

export function assertImportConfirmable(rows: Array<{ reviewState: string; normalized: Prisma.JsonValue | null }>) {
  const visible = rows.filter((row) => row.reviewState !== "IGNORED");
  const blocked = visible.filter((row) => row.reviewState === "BLOCKED").length;
  if (blocked > 0) {
    throw new HttpError(409, `Existen ${blocked} registros pendientes de corrección.`);
  }
  const unresolved = visible.filter((row) => asMeta(row.normalized).assignmentType === "UNRESOLVED").length;
  if (unresolved > 0) {
    throw new HttpError(409, `Existen ${unresolved} filas UNRESOLVED. No se pueden confirmar sin asignación explícita.`);
  }
}
