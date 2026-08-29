import { NextFunction, Request, Response } from "express";
import { Prisma } from "@prisma/client";
import { HttpError } from "../../shared/http-error.js";
import type { UserRole } from "../../middlewares/auth.middleware.js";
import { prisma } from "../../db/prisma.js";

export type AuthContext = {
  role: UserRole;
  clientId: string | null;
  operationalClientId?: string | null;
  operationalClientInvalid?: boolean;
  userId?: string;
};

const EMPTY_ID_LIST = { in: [] as string[] };

export function isClientRole(auth: AuthContext): boolean {
  return auth.role === "CLIENT";
}

export function isClientScopedRole(role: UserRole | string): boolean {
  return role === "SUPERVISOR" || role === "OPERATOR" || role === "CLIENT";
}

export function scopedClientId(auth: AuthContext): string {
  if (!isClientRole(auth)) {
    throw new HttpError(403, "Esta operación requiere un usuario CLIENT.");
  }
  if (!auth.clientId) {
    throw new HttpError(403, "Usuario CLIENT sin cliente asignado.", "USER_CLIENT_REQUIRED");
  }
  return auth.clientId;
}

export function operationalClientId(auth: AuthContext): string {
  if (isClientScopedRole(auth.role)) {
    const id = auth.clientId?.trim() || auth.operationalClientId?.trim();
    if (!id) {
      throw new HttpError(403, "El usuario no tiene un cliente asignado.", "USER_CLIENT_REQUIRED");
    }
    return id;
  }
  if (auth.operationalClientInvalid) {
    throw new HttpError(403, "El cliente seleccionado no existe o está inactivo.", "CLIENT_CONTEXT_INVALID");
  }
  const id = auth.operationalClientId?.trim();
  if (!id) {
    throw new HttpError(403, "Selecciona un cliente antes de continuar.", "CLIENT_CONTEXT_REQUIRED");
  }
  return id;
}

export async function resolveOperationalClientContext(req: Request): Promise<{ clientId: string }> {
  if (!req.auth) {
    throw new HttpError(401, "Sesion no autenticada");
  }
  if (isClientScopedRole(req.auth.role)) {
    if (!req.auth.clientId) {
      throw new HttpError(403, "El usuario no tiene un cliente asignado.", "USER_CLIENT_REQUIRED");
    }
    req.auth.operationalClientId = req.auth.clientId;
    return { clientId: req.auth.clientId };
  }
  if (req.auth.role !== "ADMIN") {
    throw new HttpError(403, "No autorizado para esta operacion");
  }
  const claimed = req.auth.operationalClientId?.trim();
  if (!claimed) {
    throw new HttpError(403, "Selecciona un cliente antes de continuar.", "CLIENT_CONTEXT_REQUIRED");
  }
  const client = await prisma.client.findUnique({
    where: { id: claimed },
    select: { id: true, active: true }
  });
  if (!client?.active) {
    req.auth.operationalClientInvalid = true;
    throw new HttpError(403, "El cliente seleccionado no existe o está inactivo.", "CLIENT_CONTEXT_INVALID");
  }
  req.auth.operationalClientId = client.id;
  return { clientId: client.id };
}

export async function requireOperationalClient(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await resolveOperationalClientContext(req);
    next();
  } catch (error) {
    next(error);
  }
}

export function clientCustomerWhere(auth: AuthContext): Prisma.CustomerWhereInput {
  return { clientId: operationalClientId(auth) };
}

export function clientRequisitionWhere(auth: AuthContext): Prisma.RequisitionWhereInput {
  return { project: { clientId: operationalClientId(auth) } };
}

export function clientReservationWhere(auth: AuthContext): Prisma.InventoryReservationWhereInput {
  return { inventory: clientInventoryWhere(auth) };
}

export function clientTaskWhere(auth: AuthContext): Prisma.TaskWhereInput {
  const clientId = operationalClientId(auth);
  const userId = auth.userId;
  return {
    OR: [
      { requisition: { project: { clientId } } },
      ...(userId
        ? [{ AND: [{ requisitionId: null }, { OR: [{ assignedToId: userId }, { createdById: userId }] }] }]
        : [{ requisition: { project: { clientId } } }])
    ]
  };
}

/**
 * CLIENT/SUPERVISOR/OPERATOR/ADMIN-in-context product visibility comes from
 * owned inventory or active project links. Never from product.customer.
 */
export function clientProductWhere(auth: AuthContext): Prisma.ProductWhereInput {
  const clientId = operationalClientId(auth);
  return {
    OR: [
      { inventories: { some: { clientId } } },
      { productProjects: { some: { active: true, project: { clientId } } } }
    ]
  };
}

export function clientInventoryWhere(auth: AuthContext): Prisma.InventoryWhereInput {
  return { clientId: operationalClientId(auth) };
}

export function clientMovementWhere(auth: AuthContext): Prisma.InventoryMovementWhereInput {
  return { clientId: operationalClientId(auth) };
}

export function clientLayerWhere(auth: AuthContext): Prisma.InventoryLayerWhereInput {
  return { inventory: clientInventoryWhere(auth) };
}

export function clientSerialWhere(auth: AuthContext): Prisma.InventorySerialWhereInput {
  return { clientId: operationalClientId(auth) };
}

export function clientActivityWhere(auth: AuthContext): Prisma.ActivityLogWhereInput {
  return { clientId: operationalClientId(auth) };
}

export function clientScanWhere(auth: AuthContext): Prisma.ScanEventWhereInput {
  return { clientId: operationalClientId(auth) };
}

export function clientListWhere(auth: AuthContext): Prisma.ClientWhereInput {
  if (auth.role === "ADMIN") return {};
  return { id: operationalClientId(auth) };
}

export function emptyIdWhere(): { id: { in: string[] } } {
  return { id: EMPTY_ID_LIST };
}

/** Query/body clientId never expands access. Bound roles ignore it; ADMIN uses JWT context. */
export function effectiveRequestedClientId(auth: AuthContext, _requested?: string | null): string | undefined {
  if (isClientScopedRole(auth.role) || auth.role === "ADMIN") return undefined;
  return undefined;
}

export function adminClientInventoryFilter(_clientId: string | undefined): Prisma.InventoryWhereInput {
  return {};
}

export function adminClientMovementFilter(_clientId: string | undefined): Prisma.InventoryMovementWhereInput {
  return {};
}

export function scopedInventoryWhere(
  auth: AuthContext,
  _requestedClientId?: string | null,
  extra: Prisma.InventoryWhereInput[] = []
): Prisma.InventoryWhereInput {
  return {
    AND: [clientInventoryWhere(auth), ...extra]
  };
}

export function scopedMovementWhere(
  auth: AuthContext,
  _requestedClientId?: string | null,
  extra: Prisma.InventoryMovementWhereInput[] = []
): Prisma.InventoryMovementWhereInput {
  return {
    AND: [clientMovementWhere(auth), ...extra]
  };
}

export function requireNonClient(auth: AuthContext): void {
  if (isClientRole(auth)) {
    throw new HttpError(403, "Los usuarios CLIENT tienen acceso de solo lectura a información de su cliente.");
  }
}

export function assertSameOperationalClient(auth: AuthContext, ownerClientId: string | null | undefined): void {
  const expected = operationalClientId(auth);
  if (!ownerClientId || ownerClientId !== expected) {
    throw new HttpError(409, "La operación no pertenece al cliente activo.", "CROSS_CLIENT_OPERATION");
  }
}

export async function assertAccessibleProject(
  auth: AuthContext,
  projectId: string | null | undefined,
  db: { customer: { findFirst: (args: { where: Prisma.CustomerWhereInput; select: { id: true; clientId: true } }) => Promise<{ id: string; clientId: string } | null> } }
): Promise<void> {
  if (!projectId) {
    throw new HttpError(404, "Proyecto no encontrado.", "PROJECT_NOT_FOUND");
  }
  const project = await db.customer.findFirst({
    where: { id: projectId, clientId: operationalClientId(auth) },
    select: { id: true, clientId: true }
  });
  if (!project) {
    throw new HttpError(404, "Proyecto no encontrado.", "PROJECT_NOT_FOUND");
  }
}

export async function assertAccessibleInventory(
  auth: AuthContext,
  inventoryId: string,
  db: {
    inventory: {
      findFirst: (args: { where: Prisma.InventoryWhereInput; select: { id: true; clientId: true } }) => Promise<{ id: string; clientId: string } | null>;
    };
  }
): Promise<void> {
  const row = await db.inventory.findFirst({
    where: { id: inventoryId },
    select: { id: true, clientId: true }
  });
  if (!row) {
    throw new HttpError(404, "Línea de inventario no encontrada.", "INVENTORY_NOT_FOUND");
  }
  if (row.clientId !== operationalClientId(auth)) {
    throw new HttpError(409, "La operación no pertenece al cliente activo.", "CROSS_CLIENT_OPERATION");
  }
}

export async function assertAccessibleLayer(
  auth: AuthContext,
  layerId: string,
  db: {
    inventoryLayer: {
      findFirst: (args: {
        where: Prisma.InventoryLayerWhereInput;
        select: { id: true; inventory: { select: { clientId: true } } };
      }) => Promise<{ id: string; inventory: { clientId: string } } | null>;
    };
  }
): Promise<void> {
  const row = await db.inventoryLayer.findFirst({
    where: { id: layerId },
    select: { id: true, inventory: { select: { clientId: true } } }
  });
  if (!row) {
    throw new HttpError(404, "Capa no encontrada.", "LAYER_NOT_FOUND");
  }
  if (row.inventory.clientId !== operationalClientId(auth)) {
    throw new HttpError(409, "La operación no pertenece al cliente activo.", "CROSS_CLIENT_OPERATION");
  }
}

export async function assertAccessibleSerial(
  auth: AuthContext,
  serialId: string,
  db: {
    inventorySerial: {
      findFirst: (args: { where: Prisma.InventorySerialWhereInput; select: { id: true; clientId: true } }) => Promise<{ id: string; clientId: string } | null>;
    };
  }
): Promise<void> {
  const row = await db.inventorySerial.findFirst({
    where: { id: serialId },
    select: { id: true, clientId: true }
  });
  if (!row) {
    throw new HttpError(404, "Serie no encontrada.", "SERIAL_NOT_FOUND");
  }
  if (row.clientId !== operationalClientId(auth)) {
    throw new HttpError(409, "La operación no pertenece al cliente activo.", "CROSS_CLIENT_OPERATION");
  }
}

export async function assertAccessibleMovement(
  auth: AuthContext,
  movementId: string,
  db: {
    inventoryMovement: {
      findFirst: (args: { where: Prisma.InventoryMovementWhereInput; select: { id: true; clientId: true } }) => Promise<{ id: string; clientId: string } | null>;
    };
  }
): Promise<void> {
  const row = await db.inventoryMovement.findFirst({
    where: { id: movementId },
    select: { id: true, clientId: true }
  });
  if (!row) {
    throw new HttpError(404, "Movimiento no encontrado.", "MOVEMENT_NOT_FOUND");
  }
  if (row.clientId !== operationalClientId(auth)) {
    throw new HttpError(409, "La operación no pertenece al cliente activo.", "CROSS_CLIENT_OPERATION");
  }
}

export async function assertAccessibleRequisition(
  auth: AuthContext,
  requisition: { project?: { clientId?: string | null } | null } | null | undefined
): Promise<void> {
  if (!requisition) {
    throw new HttpError(404, "Requisición no encontrada.", "REQUISITION_NOT_FOUND");
  }
  if (requisition.project?.clientId !== operationalClientId(auth)) {
    throw new HttpError(409, "La operación no pertenece al cliente activo.", "CROSS_CLIENT_OPERATION");
  }
}

export async function assertAccessibleTask(
  auth: AuthContext,
  task: { id?: string; requisition?: { project?: { clientId?: string | null } | null } | null } | null | undefined
): Promise<void> {
  if (!task) {
    throw new HttpError(404, "Tarea no encontrada.", "TASK_NOT_FOUND");
  }
  const owner = task.requisition?.project?.clientId;
  if (owner && owner !== operationalClientId(auth)) {
    throw new HttpError(409, "La operación no pertenece al cliente activo.", "CROSS_CLIENT_OPERATION");
  }
}
