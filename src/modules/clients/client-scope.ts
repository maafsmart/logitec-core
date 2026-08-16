import { Prisma } from "@prisma/client";
import { HttpError } from "../../shared/http-error.js";
import type { UserRole } from "../../middlewares/auth.middleware.js";

type AuthContext = {
  role: UserRole;
  clientId: string | null;
};

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

export function clientProductWhere(auth: AuthContext): Prisma.ProductWhereInput {
  if (!isClientRole(auth)) return {};
  const clientId = scopedClientId(auth);
  return {
    OR: [
      { customer: { clientId } },
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
      {
        AND: [
          { fromAssignmentKey: null },
          { toAssignmentKey: null },
          { product: { customer: { clientId } } }
        ]
      }
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
      { product: { customer: { clientId } } }
    ]
  };
}

export function requireNonClient(auth: AuthContext): void {
  if (isClientRole(auth)) {
    throw new HttpError(403, "Los usuarios CLIENT tienen acceso de solo lectura a información de su cliente.");
  }
}
