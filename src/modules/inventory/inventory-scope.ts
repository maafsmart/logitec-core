import { Prisma } from "@prisma/client";

export type InventoryScopeQuery = {
  projectId?: string;
  assignmentType?: "PROJECT" | "FREE_TO_SALE";
};

export function inventoryScopeWhere(scope: InventoryScopeQuery): Prisma.InventoryWhereInput {
  if (scope.projectId) {
    return { assignmentType: "PROJECT", projectId: scope.projectId };
  }
  if (scope.assignmentType === "PROJECT") {
    return { assignmentType: "PROJECT" };
  }
  if (scope.assignmentType === "FREE_TO_SALE") {
    return { assignmentType: "FREE_TO_SALE", projectId: null };
  }
  return {};
}

export function movementScopeWhere(scope: InventoryScopeQuery): Prisma.InventoryMovementWhereInput {
  if (scope.projectId) {
    return {
      OR: [{ fromProjectId: scope.projectId }, { toProjectId: scope.projectId }]
    };
  }
  if (scope.assignmentType === "PROJECT") {
    return {
      OR: [{ fromAssignmentType: "PROJECT" }, { toAssignmentType: "PROJECT" }]
    };
  }
  if (scope.assignmentType === "FREE_TO_SALE") {
    return {
      OR: [{ fromAssignmentType: "FREE_TO_SALE" }, { toAssignmentType: "FREE_TO_SALE" }]
    };
  }
  return {};
}

export function hasInventoryScope(scope: InventoryScopeQuery): boolean {
  return Boolean(scope.projectId || scope.assignmentType);
}
