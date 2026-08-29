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
 * CLIENT product visibility comes from owned inventory or active project links.
 * Never from product.customer.
 */
export function clientProductWhere(auth: AuthContext): Prisma.ProductWhereInput {
  if (!isClientRole(auth)) return {};
  const clientId = scopedClientId(auth);
  return {
    OR: [
      { inventories: { some: { clientId } } },
      { productProjects: { some: { active: true, project: { clientId } } } }
    ]
  };
}

export function clientInventoryWhere(auth: AuthContext): Prisma.InventoryWhereInput {
  return isClientRole(auth) ? { clientId: scopedClientId(auth) } : {};
}

export function clientMovementWhere(auth: AuthContext): Prisma.InventoryMovementWhereInput {
  return isClientRole(auth) ? { clientId: scopedClientId(auth) } : {};
}

export function clientLayerWhere(auth: AuthContext): Prisma.InventoryLayerWhereInput {
  return isClientRole(auth) ? { inventory: clientInventoryWhere(auth) } : {};
}

export function clientSerialWhere(auth: AuthContext): Prisma.InventorySerialWhereInput {
  return isClientRole(auth) ? { clientId: scopedClientId(auth) } : {};
}

export function clientActivityWhere(auth: AuthContext): Prisma.ActivityLogWhereInput {
  return isClientRole(auth) ? { clientId: scopedClientId(auth) } : {};
}

export function clientScanWhere(auth: AuthContext): Prisma.ScanEventWhereInput {
  return isClientRole(auth) ? { clientId: scopedClientId(auth) } : {};
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
  return clientId ? { clientId } : {};
}

export function adminClientMovementFilter(clientId: string | undefined): Prisma.InventoryMovementWhereInput {
  return clientId ? { clientId } : {};
}

export function scopedInventoryWhere(
  auth: AuthContext,
  requestedClientId?: string | null,
  extra: Prisma.InventoryWhereInput[] = []
): Prisma.InventoryWhereInput {
  return {
    AND: [
      clientInventoryWhere(auth),
      adminClientInventoryFilter(effectiveRequestedClientId(auth, requestedClientId)),
      ...extra
    ]
  };
}

export function scopedMovementWhere(
  auth: AuthContext,
  requestedClientId?: string | null,
  extra: Prisma.InventoryMovementWhereInput[] = []
): Prisma.InventoryMovementWhereInput {
  return {
    AND: [
      clientMovementWhere(auth),
      adminClientMovementFilter(effectiveRequestedClientId(auth, requestedClientId)),
      ...extra
    ]
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

export async function assertAccessibleLayer(
  auth: AuthContext,
  layerId: string,
  db: {
    inventoryLayer: {
      findFirst: (args: { where: Prisma.InventoryLayerWhereInput; select: { id: true } }) => Promise<{ id: string } | null>;
    };
  }
): Promise<void> {
  const row = await db.inventoryLayer.findFirst({
    where: { AND: [{ id: layerId }, clientLayerWhere(auth)] },
    select: { id: true }
  });
  if (!row) {
    throw new HttpError(404, "Capa no encontrada.", "LAYER_NOT_FOUND");
  }
}

export async function assertAccessibleSerial(
  auth: AuthContext,
  serialId: string,
  db: {
    inventorySerial: {
      findFirst: (args: { where: Prisma.InventorySerialWhereInput; select: { id: true } }) => Promise<{ id: string } | null>;
    };
  }
): Promise<void> {
  const row = await db.inventorySerial.findFirst({
    where: { AND: [{ id: serialId }, clientSerialWhere(auth)] },
    select: { id: true }
  });
  if (!row) {
    throw new HttpError(404, "Serie no encontrada.", "SERIAL_NOT_FOUND");
  }
}

export async function assertAccessibleMovement(
  auth: AuthContext,
  movementId: string,
  db: {
    inventoryMovement: {
      findFirst: (args: { where: Prisma.InventoryMovementWhereInput; select: { id: true } }) => Promise<{ id: string } | null>;
    };
  }
): Promise<void> {
  const row = await db.inventoryMovement.findFirst({
    where: { AND: [{ id: movementId }, clientMovementWhere(auth)] },
    select: { id: true }
  });
  if (!row) {
    throw new HttpError(404, "Movimiento no encontrado.", "MOVEMENT_NOT_FOUND");
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
