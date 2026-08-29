import { InventoryAssignmentType, Prisma } from "@prisma/client";
import { InventoryMutationError } from "./inventory-errors.js";
import { isForbiddenInventoryProjectLabel, isForbiddenInventoryProjectRecord } from "./inventory-project-rules.js";

export type InventoryAssignment = {
  assignmentType: InventoryAssignmentType;
  projectId: string | null;
  assignmentKey: string;
  clientId: string;
};

export type InboundAssignmentInput = {
  assignmentType?: "PROJECT" | "FREE_TO_SALE";
  projectId?: string | null;
  clientId?: string | null;
};

export function projectAssignmentKey(projectId: string): string {
  return `P:${projectId}`;
}

export function freeToSaleAssignmentKey(clientId: string): string {
  return `FREE_TO_SALE:${clientId}`;
}

export function legacyUnassignedAssignmentKey(clientId: string): string {
  return `LEGACY_UNASSIGNED:${clientId}`;
}

export function assertAssignmentClientId(clientId: string | null | undefined): string {
  const id = clientId?.trim();
  if (!id) {
    throw new InventoryMutationError("CLIENT_REQUIRED", "La asignación requiere un cliente propietario.");
  }
  return id;
}

export function buildAssignment(
  assignmentType: InventoryAssignmentType,
  projectId: string | null,
  clientId: string
): InventoryAssignment {
  const ownerClientId = assertAssignmentClientId(clientId);
  if (assignmentType === "PROJECT") {
    if (!projectId) {
      throw new InventoryMutationError("PROJECT_REQUIRED", "La asignación PROJECT requiere projectId.");
    }
    return {
      assignmentType,
      projectId,
      assignmentKey: projectAssignmentKey(projectId),
      clientId: ownerClientId
    };
  }
  if (assignmentType === "FREE_TO_SALE") {
    if (projectId) {
      throw new InventoryMutationError("PROJECT_MUST_BE_NULL", "FREE TO SALE no admite projectId.");
    }
    return {
      assignmentType,
      projectId: null,
      assignmentKey: freeToSaleAssignmentKey(ownerClientId),
      clientId: ownerClientId
    };
  }
  if (projectId) {
    throw new InventoryMutationError("PROJECT_MUST_BE_NULL", "LEGACY_UNASSIGNED no admite projectId.");
  }
  return {
    assignmentType: "LEGACY_UNASSIGNED",
    projectId: null,
    assignmentKey: legacyUnassignedAssignmentKey(ownerClientId),
    clientId: ownerClientId
  };
}

export function assignmentFromInventory(inventory: {
  assignmentType: InventoryAssignmentType;
  projectId: string | null;
  assignmentKey: string;
  clientId: string;
}): InventoryAssignment {
  return {
    assignmentType: inventory.assignmentType,
    projectId: inventory.projectId,
    assignmentKey: inventory.assignmentKey,
    clientId: inventory.clientId
  };
}

function isForbiddenClientRecord(client: { code?: string | null; name?: string | null; tradeName?: string | null; legalName?: string | null }) {
  return (
    isForbiddenInventoryProjectLabel(client.code) ||
    isForbiddenInventoryProjectLabel(client.name) ||
    isForbiddenInventoryProjectLabel(client.tradeName) ||
    isForbiddenInventoryProjectLabel(client.legalName)
  );
}

export async function assertAssignableClient(
  tx: Prisma.TransactionClient,
  clientId: string | null | undefined
): Promise<{ id: string }> {
  const id = assertAssignmentClientId(clientId);
  const client = await tx.client.findUnique({
    where: { id },
    select: { id: true, code: true, name: true, tradeName: true, legalName: true, active: true }
  });
  if (!client || isForbiddenClientRecord(client)) {
    throw new InventoryMutationError("CLIENT_NOT_FOUND", "Cliente propietario no encontrado.");
  }
  if (!client.active) {
    throw new InventoryMutationError("CLIENT_INACTIVE", "El cliente propietario no está activo.");
  }
  return { id: client.id };
}

export function assertSameOwningClient(sourceClientId: string, destinationClientId: string): void {
  if (sourceClientId !== destinationClientId) {
    throw new InventoryMutationError(
      "CROSS_CLIENT_TRANSFER",
      "No se puede cambiar el cliente propietario del inventario en esta operación."
    );
  }
}

export async function resolveInboundAssignment(
  tx: Prisma.TransactionClient,
  _product: { customerId: string | null; customer?: { clientId: string | null } | null },
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
    const client = await assertAssignableClient(tx, input.clientId);
    return buildAssignment("FREE_TO_SALE", null, client.id);
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
  if (!project.clientId) {
    throw new InventoryMutationError("PROJECT_CLIENT_REQUIRED", "El proyecto destino no tiene cliente propietario.");
  }
  if (input.clientId && input.clientId.trim() && input.clientId.trim() !== project.clientId) {
    throw new InventoryMutationError(
      "PROJECT_WRONG_CLIENT",
      "El cliente indicado no coincide con el propietario del proyecto."
    );
  }
  return buildAssignment("PROJECT", project.id, project.clientId);
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
    toAssignmentKey: assignment.assignmentKey,
    clientId: assignment.clientId
  };
}

export function outboundAssignmentFields(assignment: InventoryAssignment) {
  return {
    fromAssignmentType: assignment.assignmentType,
    fromProjectId: assignment.projectId,
    fromAssignmentKey: assignment.assignmentKey,
    clientId: assignment.clientId
  };
}

export function sameAssignmentFields(assignment: InventoryAssignment) {
  return {
    ...outboundAssignmentFields(assignment),
    ...inboundAssignmentFields(assignment)
  };
}
