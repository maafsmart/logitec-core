import { InventoryAssignmentType, Prisma } from "@prisma/client";
import { InventoryMutationError } from "./inventory-errors.js";

export type InventoryAssignment = {
  assignmentType: InventoryAssignmentType;
  projectId: string | null;
  assignmentKey: string;
};

export type InboundAssignmentInput = {
  assignmentType?: "PROJECT" | "FREE_TO_SALE";
  projectId?: string | null;
};

export function projectAssignmentKey(projectId: string): string {
  return `P:${projectId}`;
}

export function buildAssignment(
  assignmentType: InventoryAssignmentType,
  projectId: string | null
): InventoryAssignment {
  if (assignmentType === "PROJECT") {
    if (!projectId) {
      throw new InventoryMutationError("PROJECT_REQUIRED", "La asignación PROJECT requiere projectId.");
    }
    return {
      assignmentType,
      projectId,
      assignmentKey: projectAssignmentKey(projectId)
    };
  }
  if (assignmentType === "FREE_TO_SALE") {
    if (projectId) {
      throw new InventoryMutationError("PROJECT_MUST_BE_NULL", "FREE TO SALE no admite projectId.");
    }
    return { assignmentType, projectId: null, assignmentKey: "FREE_TO_SALE" };
  }
  if (projectId) {
    throw new InventoryMutationError("PROJECT_MUST_BE_NULL", "LEGACY_UNASSIGNED no admite projectId.");
  }
  return { assignmentType: "LEGACY_UNASSIGNED", projectId: null, assignmentKey: "LEGACY_UNASSIGNED" };
}

export function assignmentFromInventory(inventory: {
  assignmentType: InventoryAssignmentType;
  projectId: string | null;
  assignmentKey: string;
}): InventoryAssignment {
  return {
    assignmentType: inventory.assignmentType,
    projectId: inventory.projectId,
    assignmentKey: inventory.assignmentKey
  };
}

export async function resolveInboundAssignment(
  tx: Prisma.TransactionClient,
  product: { customerId: string | null },
  input: InboundAssignmentInput
): Promise<InventoryAssignment> {
  const explicitType = input.assignmentType;
  const hasExplicitProject = input.projectId !== undefined;
  const explicitProjectId = input.projectId ?? null;

  if (explicitType === "FREE_TO_SALE") {
    if (hasExplicitProject && explicitProjectId) {
      throw new InventoryMutationError("PROJECT_MUST_BE_NULL", "FREE TO SALE no admite projectId.");
    }
    return buildAssignment("FREE_TO_SALE", null);
  }

  if (explicitType === "PROJECT" || hasExplicitProject) {
    if (!explicitProjectId) {
      throw new InventoryMutationError("PROJECT_REQUIRED", "La asignación PROJECT requiere projectId.");
    }
    const project = await tx.customer.findUnique({ where: { id: explicitProjectId }, select: { id: true } });
    if (!project) {
      throw new InventoryMutationError("PROJECT_NOT_FOUND", "Proyecto no encontrado.");
    }
    return buildAssignment("PROJECT", project.id);
  }

  if (product.customerId) {
    return buildAssignment("PROJECT", product.customerId);
  }

  throw new InventoryMutationError(
    "ASSIGNMENT_REQUIRED",
    "La entrada requiere asignación PROJECT o FREE_TO_SALE; no se crearán existencias LEGACY_UNASSIGNED."
  );
}

export async function ensureCanonicalProductProject(
  tx: { productProject: Prisma.TransactionClient["productProject"] },
  productId: string,
  projectId: string | null | undefined
) {
  if (!projectId) return;
  await tx.productProject.upsert({
    where: { productId_projectId: { productId, projectId } },
    update: { active: true },
    create: { productId, projectId, active: true }
  });
}

export function inboundAssignmentFields(assignment: InventoryAssignment) {
  return {
    toAssignmentType: assignment.assignmentType,
    toProjectId: assignment.projectId,
    toAssignmentKey: assignment.assignmentKey
  };
}

export function outboundAssignmentFields(assignment: InventoryAssignment) {
  return {
    fromAssignmentType: assignment.assignmentType,
    fromProjectId: assignment.projectId,
    fromAssignmentKey: assignment.assignmentKey
  };
}

export function sameAssignmentFields(assignment: InventoryAssignment) {
  return {
    ...outboundAssignmentFields(assignment),
    ...inboundAssignmentFields(assignment)
  };
}
