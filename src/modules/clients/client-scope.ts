import { Prisma } from "@prisma/client";
import { HttpError } from "../../shared/http-error.js";
import type { UserRole } from "../../middlewares/auth.middleware.js";

type AuthContext = {
  role: UserRole;
  clientId: string | null;
};

const EMPTY_ID_LIST = { in: [] as string[] };

export function isClientRole(auth: AuthContext): boolean {
  return auth.role === "CLIENT";
}

export function scopedClientId(auth: AuthContext): string {
  if (!isClientRole(auth)) {
    throw new HttpError(403, "Esta operación requiere un usuario CLIENT.");
  }
  if (!auth.clientId) {
    throw new HttpError(403, "Usuario CLIENT sin cliente asignado.");
  }
  return auth.clientId;
}

export function clientCustomerWhere(auth: AuthContext): Prisma.CustomerWhereInput {
  return isClientRole(auth) ? { clientId: scopedClientId(auth) } : {};
}

export function clientRequisitionWhere(auth: AuthContext): Prisma.RequisitionWhereInput {
  return isClientRole(auth) ? { project: { clientId: scopedClientId(auth) } } : {};
}

export function clientReservationWhere(auth: AuthContext): Prisma.InventoryReservationWhereInput {
  if (!isClientRole(auth)) return {};
  return { inventory: clientInventoryWhere(auth) };
}

export function clientTaskWhere(auth: AuthContext): Prisma.TaskWhereInput {
  if (!isClientRole(auth)) return {};
  return { requisition: { project: { clientId: scopedClientId(auth) } } };
}

/**
 * CLIENT product visibility comes from project assignment, never from product.customer.
 */
export function clientProductWhere(auth: AuthContext): Prisma.ProductWhereInput {
  if (!isClientRole(auth)) return {};
  const clientId = scopedClientId(auth);
  return {
    OR: [
      { inventories: { some: { assignmentType: "PROJECT", project: { clientId } } } },
      { productProjects: { some: { active: true, project: { clientId } } } }
    ]
  };
}

export function clientInventoryWhere(auth: AuthContext): Prisma.InventoryWhereInput {
  if (!isClientRole(auth)) return {};
  const clientId = scopedClientId(auth);
  return {
    assignmentType: "PROJECT",
    project: { clientId }
  };
}

export function clientMovementWhere(auth: AuthContext): Prisma.InventoryMovementWhereInput {
  if (!isClientRole(auth)) return {};
  const clientId = scopedClientId(auth);
  return {
    OR: [
      { toProject: { clientId } },
      { fromProject: { clientId } },
      { requisitionLine: { requisition: { project: { clientId } } } }
    ]
  };
}

export function clientLayerWhere(auth: AuthContext): Prisma.InventoryLayerWhereInput {
  return isClientRole(auth) ? { inventory: clientInventoryWhere(auth) } : {};
}

export function clientSerialWhere(auth: AuthContext): Prisma.InventorySerialWhereInput {
  if (!isClientRole(auth)) return {};
  return {
    OR: [
      { inventoryLayer: { inventory: clientInventoryWhere(auth) } },
      { AND: [{ inventoryLayerId: null }, { product: clientProductWhere(auth) }] }
    ]
  };
}

export function clientActivityWhere(auth: AuthContext): Prisma.ActivityLogWhereInput {
  if (!isClientRole(auth)) return {};
  const clientId = scopedClientId(auth);
  return {
    OR: [
      { customer: { clientId } },
      { task: { requisition: { project: { clientId } } } },
      { product: { inventories: { some: { assignmentType: "PROJECT", project: { clientId } } } } }
    ]
  };
}

export function clientScanWhere(auth: AuthContext): Prisma.ScanEventWhereInput {
  if (!isClientRole(auth)) return {};
  const clientId = scopedClientId(auth);
  return {
    OR: [
      { task: { requisition: { project: { clientId } } } },
      { product: { inventories: { some: { assignmentType: "PROJECT", project: { clientId } } } } }
    ]
  };
}

export function emptyIdWhere(): { id: { in: string[] } } {
  return { id: EMPTY_ID_LIST };
}

/** CLIENT cannot spoof another client via query/body clientId. */
export function effectiveRequestedClientId(auth: AuthContext, requested?: string | null): string | undefined {
  if (isClientRole(auth)) return undefined;
  const id = requested?.trim();
  return id || undefined;
}

export function adminClientInventoryFilter(clientId: string | undefined): Prisma.InventoryWhereInput {
  return clientId ? { project: { clientId } } : {};
}

export function adminClientMovementFilter(clientId: string | undefined): Prisma.InventoryMovementWhereInput {
  if (!clientId) return {};
  return {
    OR: [{ toProject: { clientId } }, { fromProject: { clientId } }, { requisitionLine: { requisition: { project: { clientId } } } }]
  };
}

export function requireNonClient(auth: AuthContext): void {
  if (isClientRole(auth)) {
    throw new HttpError(403, "Los usuarios CLIENT tienen acceso de solo lectura a información de su cliente.");
  }
}

export async function assertAccessibleProject(
  auth: AuthContext,
  projectId: string | null | undefined,
  db: { customer: { findFirst: (args: { where: Prisma.CustomerWhereInput; select: { id: true } }) => Promise<{ id: string } | null> } }
): Promise<void> {
  if (!projectId) {
    throw new HttpError(404, "Proyecto no encontrado.", "PROJECT_NOT_FOUND");
  }
  const where: Prisma.CustomerWhereInput = isClientRole(auth)
    ? { id: projectId, clientId: scopedClientId(auth) }
    : { id: projectId };
  const project = await db.customer.findFirst({ where, select: { id: true } });
  if (!project) {
    throw new HttpError(404, "Proyecto no encontrado.", "PROJECT_NOT_FOUND");
  }
}

export async function assertAccessibleInventory(
  auth: AuthContext,
  inventoryId: string,
  db: { inventory: { findFirst: (args: { where: Prisma.InventoryWhereInput; select: { id: true } }) => Promise<{ id: string } | null> } }
): Promise<void> {
  const row = await db.inventory.findFirst({
    where: { AND: [{ id: inventoryId }, clientInventoryWhere(auth)] },
    select: { id: true }
  });
  if (!row) {
    throw new HttpError(404, "Línea de inventario no encontrada.", "INVENTORY_NOT_FOUND");
  }
}

export async function assertAccessibleRequisition(
  auth: AuthContext,
  requisition: { project?: { clientId?: string | null } | null } | null | undefined
): Promise<void> {
  if (!requisition) {
    throw new HttpError(404, "Requisición no encontrada.", "REQUISITION_NOT_FOUND");
  }
  if (!isClientRole(auth)) return;
  if (requisition.project?.clientId !== scopedClientId(auth)) {
    throw new HttpError(404, "Requisición no encontrada.", "REQUISITION_NOT_FOUND");
  }
}
