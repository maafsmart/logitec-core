import { InventoryAssignmentType, Prisma } from "@prisma/client";
import { InventoryMutationError } from "./inventory-errors.js";
import { isForbiddenInventoryProjectRecord } from "./inventory-project-rules.js";

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

async function ownerClientIdForProduct(
  tx: Prisma.TransactionClient,
  product: { customerId: string | null; customer?: { clientId: string | null } | null }
): Promise<string | null> {
  if (product.customer?.clientId) return product.customer.clientId;
  if (!product.customerId) return null;
  const owner = await tx.customer.findUnique({
    where: { id: product.customerId },
    select: { clientId: true }
  });
  return owner?.clientId ?? null;
}

export async function resolveInboundAssignment(
  tx: Prisma.TransactionClient,
  product: { customerId: string | null; customer?: { clientId: string | null } | null },
  input: InboundAssignmentInput
): Promise<InventoryAssignment> {
  const explicitType = input.assignmentType;
  const explicitProjectId = input.projectId ?? null;

  if (explicitType !== "PROJECT" && explicitType !== "FREE_TO_SALE") {
    throw new InventoryMutationError(
      "ASSIGNMENT_REQUIRED",
      "La entrada requiere asignación PROJECT o FREE_TO_SALE; no se crearán existencias LEGACY_UNASSIGNED."
    );
  }

  if (explicitType === "FREE_TO_SALE") {
    if (explicitProjectId) {
      throw new InventoryMutationError("PROJECT_MUST_BE_NULL", "FREE TO SALE no admite projectId.");
    }
    return buildAssignment("FREE_TO_SALE", null);
  }

  if (!explicitProjectId) {
    throw new InventoryMutationError("PROJECT_REQUIRED", "La asignación PROJECT requiere projectId.");
  }
  const project = await tx.customer.findUnique({
    where: { id: explicitProjectId },
    select: { id: true, code: true, name: true, active: true, clientId: true }
  });
  if (!project || isForbiddenInventoryProjectRecord(project)) {
    throw new InventoryMutationError("PROJECT_NOT_FOUND", "Proyecto no encontrado.");
  }
  if (!project.active) {
    throw new InventoryMutationError("PROJECT_INACTIVE", "El proyecto destino no está activo.");
  }
  const ownerClientId = await ownerClientIdForProduct(tx, product);
  if (ownerClientId && project.clientId !== ownerClientId) {
    throw new InventoryMutationError(
      "PROJECT_WRONG_CLIENT",
      "No se puede asignar a un proyecto de otro cliente."
    );
  }
  return buildAssignment("PROJECT", project.id);
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
