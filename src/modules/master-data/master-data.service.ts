import { Prisma } from "@prisma/client";
import { HttpError } from "../../shared/http-error.js";
import { isForbiddenInventoryProjectLabel } from "../inventory/inventory-project-rules.js";

export const MASTER_DEACTIVATE_CODES = {
  HAS_PHYSICAL_INVENTORY: "HAS_PHYSICAL_INVENTORY",
  HAS_ACTIVE_RESERVATIONS: "HAS_ACTIVE_RESERVATIONS",
  HAS_ACTIVE_REQUISITIONS: "HAS_ACTIVE_REQUISITIONS",
  HAS_ACTIVE_TASKS: "HAS_ACTIVE_TASKS",
  HAS_ACTIVE_PROJECTS: "HAS_ACTIVE_PROJECTS",
  HAS_ACTIVE_LOCATIONS: "HAS_ACTIVE_LOCATIONS",
  HAS_OPERATIONAL_RELATIONS: "HAS_OPERATIONAL_RELATIONS",
  DUPLICATE_CODE: "DUPLICATE_CODE",
  PROJECT_CLIENT_REQUIRED: "PROJECT_CLIENT_REQUIRED",
  FORBIDDEN_MASTER_LABEL: "FORBIDDEN_MASTER_LABEL",
  PHYSICAL_DELETE_DISABLED: "PHYSICAL_DELETE_DISABLED",
  PROJECT_HAS_OPERATIONAL_HISTORY: "PROJECT_HAS_OPERATIONAL_HISTORY",
  WAREHOUSE_CODE_IMMUTABLE: "WAREHOUSE_CODE_IMMUTABLE"
} as const;

export type MasterDataDb = {
  client: {
    findUnique: (args: unknown) => Promise<any>;
    findFirst: (args: unknown) => Promise<any>;
    create: (args: unknown) => Promise<any>;
    update: (args: unknown) => Promise<any>;
  };
  customer: {
    findUnique: (args: unknown) => Promise<any>;
    findFirst: (args: unknown) => Promise<any>;
    findMany: (args: unknown) => Promise<any[]>;
    create: (args: unknown) => Promise<any>;
    update: (args: unknown) => Promise<any>;
    count: (args: unknown) => Promise<number>;
  };
  warehouse: {
    findUnique: (args: unknown) => Promise<any>;
    findFirst: (args: unknown) => Promise<any>;
    create: (args: unknown) => Promise<any>;
    update: (args: unknown) => Promise<any>;
  };
  location: {
    findUnique: (args: unknown) => Promise<any>;
    findFirst: (args: unknown) => Promise<any>;
    create: (args: unknown) => Promise<any>;
    update: (args: unknown) => Promise<any>;
    count: (args: unknown) => Promise<number>;
  };
  inventory: {
    count: (args: unknown) => Promise<number>;
    aggregate: (args: unknown) => Promise<{ _sum: { qty: Prisma.Decimal | null; reservedQty: Prisma.Decimal | null } }>;
  };
  inventoryReservation: { count: (args: unknown) => Promise<number> };
  requisition: { count: (args: unknown) => Promise<number> };
  task: { count: (args: unknown) => Promise<number> };
  product: { count: (args: unknown) => Promise<number> };
  productProject: { count: (args: unknown) => Promise<number> };
  inventoryMovement: { count: (args: unknown) => Promise<number> };
  inventoryLayer: { count: (args: unknown) => Promise<number> };
  activityLog: { count: (args: unknown) => Promise<number> };
};

function optionalText(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed || null;
}

export function normalizeMasterCode(value: string): string {
  return value.trim().toUpperCase();
}

export function assertAllowedMasterLabel(code: string, name: string): void {
  if (isForbiddenInventoryProjectLabel(code) || isForbiddenInventoryProjectLabel(name)) {
    throw new HttpError(
      400,
      "LOGITEC, Free to Sale, ASO y Customer Owns no son clientes ni proyectos operativos.",
      MASTER_DEACTIVATE_CODES.FORBIDDEN_MASTER_LABEL
    );
  }
}

function conflict(code: string, message: string): never {
  throw new HttpError(409, message, code);
}

async function countPhysicalInventory(db: MasterDataDb, where: Prisma.InventoryWhereInput): Promise<number> {
  return db.inventory.count({ where: { AND: [where, { qty: { gt: 0 } }] } });
}

async function countActiveReservations(db: MasterDataDb, where: Prisma.InventoryReservationWhereInput): Promise<number> {
  return db.inventoryReservation.count({ where: { AND: [where, { status: "ACTIVE" }] } });
}

async function countActiveRequisitions(db: MasterDataDb, where: Prisma.RequisitionWhereInput): Promise<number> {
  return db.requisition.count({
    where: { AND: [where, { status: { notIn: ["CANCELLED", "FULFILLED", "CLOSED"] } }] }
  });
}

async function countActiveTasks(db: MasterDataDb, where: Prisma.TaskWhereInput): Promise<number> {
  return db.task.count({
    where: { AND: [where, { status: { in: ["PENDING", "ASSIGNED", "IN_PROGRESS"] } }] }
  });
}

export type ClientWriteInput = {
  code: string;
  name: string;
  legalName?: string | null;
  tradeName?: string | null;
  rfc?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
  phone?: string | null;
  alternatePhone?: string | null;
  email?: string | null;
  primaryContact?: string | null;
  contactTitle?: string | null;
  contactPhone?: string | null;
  contactEmail?: string | null;
  notes?: string | null;
  active?: boolean;
};

export async function createClientRecord(db: MasterDataDb, input: ClientWriteInput) {
  const code = normalizeMasterCode(input.code);
  const name = input.name.trim();
  if (!code || !name) {
    throw new HttpError(400, "Código y nombre comercial son obligatorios.");
  }
  assertAllowedMasterLabel(code, name);
  const existing = await db.client.findUnique({ where: { code } });
  if (existing) {
    conflict(MASTER_DEACTIVATE_CODES.DUPLICATE_CODE, `Ya existe un cliente con código ${code}.`);
  }
  try {
    return await db.client.create({
      data: {
        code,
        name,
        legalName: optionalText(input.legalName),
        tradeName: optionalText(input.tradeName) || name,
        rfc: optionalText(input.rfc),
        address: optionalText(input.address),
        city: optionalText(input.city),
        state: optionalText(input.state),
        postalCode: optionalText(input.postalCode),
        phone: optionalText(input.phone),
        alternatePhone: optionalText(input.alternatePhone),
        email: optionalText(input.email)?.toLowerCase() || null,
        primaryContact: optionalText(input.primaryContact),
        contactTitle: optionalText(input.contactTitle),
        contactPhone: optionalText(input.contactPhone),
        contactEmail: optionalText(input.contactEmail)?.toLowerCase() || null,
        notes: optionalText(input.notes),
        active: input.active ?? true
      }
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      conflict(MASTER_DEACTIVATE_CODES.DUPLICATE_CODE, `Ya existe un cliente con código ${code}.`);
    }
    throw error;
  }
}

export async function updateClientRecord(db: MasterDataDb, id: string, input: Partial<ClientWriteInput>) {
  const existing = await db.client.findUnique({ where: { id } });
  if (!existing) throw new HttpError(404, "Cliente no encontrado.");
  const code = input.code !== undefined ? normalizeMasterCode(input.code) : existing.code;
  const name = input.name !== undefined ? input.name.trim() : existing.name;
  if (!code || !name) {
    throw new HttpError(400, "Código y nombre comercial son obligatorios.");
  }
  assertAllowedMasterLabel(code, name);
  if (code !== existing.code) {
    const duplicate = await db.client.findUnique({ where: { code } });
    if (duplicate) {
      conflict(MASTER_DEACTIVATE_CODES.DUPLICATE_CODE, `Ya existe un cliente con código ${code}.`);
    }
  }
  return db.client.update({
    where: { id },
    data: {
      ...(input.code !== undefined ? { code } : {}),
      ...(input.name !== undefined ? { name } : {}),
      ...(input.legalName !== undefined ? { legalName: optionalText(input.legalName) } : {}),
      ...(input.tradeName !== undefined ? { tradeName: optionalText(input.tradeName) } : {}),
      ...(input.rfc !== undefined ? { rfc: optionalText(input.rfc) } : {}),
      ...(input.address !== undefined ? { address: optionalText(input.address) } : {}),
      ...(input.city !== undefined ? { city: optionalText(input.city) } : {}),
      ...(input.state !== undefined ? { state: optionalText(input.state) } : {}),
      ...(input.postalCode !== undefined ? { postalCode: optionalText(input.postalCode) } : {}),
      ...(input.phone !== undefined ? { phone: optionalText(input.phone) } : {}),
      ...(input.alternatePhone !== undefined ? { alternatePhone: optionalText(input.alternatePhone) } : {}),
      ...(input.email !== undefined ? { email: optionalText(input.email)?.toLowerCase() || null } : {}),
      ...(input.primaryContact !== undefined ? { primaryContact: optionalText(input.primaryContact) } : {}),
      ...(input.contactTitle !== undefined ? { contactTitle: optionalText(input.contactTitle) } : {}),
      ...(input.contactPhone !== undefined ? { contactPhone: optionalText(input.contactPhone) } : {}),
      ...(input.contactEmail !== undefined ? { contactEmail: optionalText(input.contactEmail)?.toLowerCase() || null } : {}),
      ...(input.notes !== undefined ? { notes: optionalText(input.notes) } : {}),
      ...(input.active !== undefined ? { active: input.active } : {})
    }
  });
}

export async function setClientActive(db: MasterDataDb, id: string, active: boolean) {
  const existing = await db.client.findUnique({ where: { id }, select: { id: true } });
  if (!existing) throw new HttpError(404, "Cliente no encontrado.");
  if (!active) {
    const activeProjects = await db.customer.count({ where: { clientId: id, active: true } });
    if (activeProjects > 0) {
      conflict(
        MASTER_DEACTIVATE_CODES.HAS_ACTIVE_PROJECTS,
        "No se puede desactivar el cliente: tiene proyectos activos."
      );
    }
    const inventory = await countPhysicalInventory(db, { clientId: id });
    if (inventory > 0) {
      conflict(
        MASTER_DEACTIVATE_CODES.HAS_PHYSICAL_INVENTORY,
        "No se puede desactivar el cliente: tiene inventario físico."
      );
    }
    const reservations = await countActiveReservations(db, { inventory: { clientId: id } });
    if (reservations > 0) {
      conflict(
        MASTER_DEACTIVATE_CODES.HAS_ACTIVE_RESERVATIONS,
        "No se puede desactivar el cliente: tiene reservas activas."
      );
    }
  }
  return db.client.update({ where: { id }, data: { active } });
}

export type ProjectWriteInput = {
  clientId: string;
  code: string;
  name: string;
  tradeName?: string | null;
  legalName?: string | null;
  rfc?: string | null;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  primaryContact?: string | null;
  contactTitle?: string | null;
  contactPhone?: string | null;
  contactEmail?: string | null;
  notes?: string | null;
  active?: boolean;
};

export async function createProjectRecord(db: MasterDataDb, input: ProjectWriteInput) {
  const clientId = input.clientId?.trim();
  if (!clientId) {
    throw new HttpError(400, "Todo proyecto debe pertenecer a un cliente.", MASTER_DEACTIVATE_CODES.PROJECT_CLIENT_REQUIRED);
  }
  const client = await db.client.findUnique({ where: { id: clientId }, select: { id: true, active: true } });
  if (!client) throw new HttpError(400, "Cliente real no encontrado.");
  const code = normalizeMasterCode(input.code);
  const name = input.name.trim();
  if (!code || !name) throw new HttpError(400, "Código y nombre del proyecto son obligatorios.");
  assertAllowedMasterLabel(code, name);
  const duplicate = await db.customer.findUnique({ where: { code } });
  if (duplicate) {
    conflict(MASTER_DEACTIVATE_CODES.DUPLICATE_CODE, `Ya existe un proyecto con código ${code}.`);
  }
  try {
    return await db.customer.create({
      data: {
        clientId,
        code,
        name,
        tradeName: optionalText(input.tradeName),
        legalName: optionalText(input.legalName),
        rfc: optionalText(input.rfc),
        address: optionalText(input.address),
        phone: optionalText(input.phone),
        email: optionalText(input.email)?.toLowerCase() || null,
        primaryContact: optionalText(input.primaryContact),
        contactTitle: optionalText(input.contactTitle),
        contactPhone: optionalText(input.contactPhone),
        contactEmail: optionalText(input.contactEmail)?.toLowerCase() || null,
        notes: optionalText(input.notes),
        active: input.active ?? true
      },
      include: { client: true }
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      conflict(MASTER_DEACTIVATE_CODES.DUPLICATE_CODE, `Ya existe un proyecto con código ${code}.`);
    }
    throw error;
  }
}

export async function updateProjectRecord(db: MasterDataDb, id: string, input: Partial<ProjectWriteInput>) {
  const existing = await db.customer.findUnique({ where: { id } });
  if (!existing) throw new HttpError(404, "Proyecto no encontrado.");
  const clientId = input.clientId !== undefined ? input.clientId.trim() : existing.clientId;
  if (!clientId) {
    throw new HttpError(400, "Todo proyecto debe pertenecer a un cliente.", MASTER_DEACTIVATE_CODES.PROJECT_CLIENT_REQUIRED);
  }
  const client = await db.client.findUnique({ where: { id: clientId }, select: { id: true } });
  if (!client) throw new HttpError(400, "Cliente real no encontrado.");
  const code = input.code !== undefined ? normalizeMasterCode(input.code) : existing.code;
  const name = input.name !== undefined ? input.name.trim() : existing.name;
  assertAllowedMasterLabel(code, name);
  if (code !== existing.code) {
    const duplicate = await db.customer.findUnique({ where: { code } });
    if (duplicate) conflict(MASTER_DEACTIVATE_CODES.DUPLICATE_CODE, `Ya existe un proyecto con código ${code}.`);
  }
  if (clientId !== existing.clientId) {
    const [inventory, layers, reservations, requisitions, tasks, movements, activity] = await Promise.all([
      db.inventory.count({ where: { projectId: id } }),
      db.inventoryLayer.count({ where: { inventory: { projectId: id } } }),
      db.inventoryReservation.count({ where: { inventory: { projectId: id } } }),
      db.requisition.count({ where: { projectId: id } }),
      db.task.count({ where: { requisition: { projectId: id } } }),
      db.inventoryMovement.count({
        where: { OR: [{ fromProjectId: id }, { toProjectId: id }] }
      }),
      db.activityLog.count({ where: { customerId: id } })
    ]);
    if (inventory + layers + reservations + requisitions + tasks + movements + activity > 0) {
      conflict(
        MASTER_DEACTIVATE_CODES.PROJECT_HAS_OPERATIONAL_HISTORY,
        "No se puede cambiar el cliente de un proyecto con inventario, reservas, requisiciones, tareas, movimientos o historial."
      );
    }
  }
  return db.customer.update({
    where: { id },
    data: {
      clientId,
      ...(input.code !== undefined ? { code } : {}),
      ...(input.name !== undefined ? { name } : {}),
      ...(input.tradeName !== undefined ? { tradeName: optionalText(input.tradeName) } : {}),
      ...(input.legalName !== undefined ? { legalName: optionalText(input.legalName) } : {}),
      ...(input.rfc !== undefined ? { rfc: optionalText(input.rfc) } : {}),
      ...(input.address !== undefined ? { address: optionalText(input.address) } : {}),
      ...(input.phone !== undefined ? { phone: optionalText(input.phone) } : {}),
      ...(input.email !== undefined ? { email: optionalText(input.email)?.toLowerCase() || null } : {}),
      ...(input.primaryContact !== undefined ? { primaryContact: optionalText(input.primaryContact) } : {}),
      ...(input.contactTitle !== undefined ? { contactTitle: optionalText(input.contactTitle) } : {}),
      ...(input.contactPhone !== undefined ? { contactPhone: optionalText(input.contactPhone) } : {}),
      ...(input.contactEmail !== undefined ? { contactEmail: optionalText(input.contactEmail)?.toLowerCase() || null } : {}),
      ...(input.notes !== undefined ? { notes: optionalText(input.notes) } : {}),
      ...(input.active !== undefined ? { active: input.active } : {})
    },
    include: { client: true }
  });
}

export async function setProjectActive(db: MasterDataDb, id: string, active: boolean) {
  const existing = await db.customer.findUnique({ where: { id } });
  if (!existing) throw new HttpError(404, "Proyecto no encontrado.");
  if (!active) {
    const inventory = await countPhysicalInventory(db, { projectId: id });
    if (inventory > 0) {
      conflict(MASTER_DEACTIVATE_CODES.HAS_PHYSICAL_INVENTORY, "No se puede desactivar el proyecto: tiene inventario físico.");
    }
    const reservations = await countActiveReservations(db, { inventory: { projectId: id } });
    if (reservations > 0) {
      conflict(MASTER_DEACTIVATE_CODES.HAS_ACTIVE_RESERVATIONS, "No se puede desactivar el proyecto: tiene reservas activas.");
    }
    const requisitions = await countActiveRequisitions(db, { projectId: id });
    if (requisitions > 0) {
      conflict(MASTER_DEACTIVATE_CODES.HAS_ACTIVE_REQUISITIONS, "No se puede desactivar el proyecto: tiene requisiciones activas.");
    }
    const tasks = await countActiveTasks(db, { requisition: { projectId: id } });
    if (tasks > 0) {
      conflict(MASTER_DEACTIVATE_CODES.HAS_ACTIVE_TASKS, "No se puede desactivar el proyecto: tiene tareas activas.");
    }
  }
  return db.customer.update({ where: { id }, data: { active }, include: { client: true } });
}

export type WarehouseWriteInput = {
  code: string;
  name: string;
  address?: string | null;
  manager?: string | null;
  phone?: string | null;
  email?: string | null;
  hours?: string | null;
  notes?: string | null;
  active?: boolean;
};

export async function createWarehouseRecord(db: MasterDataDb, input: WarehouseWriteInput) {
  const code = normalizeMasterCode(input.code);
  const name = input.name.trim();
  if (!code || !name) throw new HttpError(400, "Código y nombre del almacén son obligatorios.");
  const duplicate = await db.warehouse.findUnique({ where: { code } });
  if (duplicate) conflict(MASTER_DEACTIVATE_CODES.DUPLICATE_CODE, `Ya existe un almacén con código ${code}.`);
  return db.warehouse.create({
    data: {
      code,
      name,
      address: optionalText(input.address),
      manager: optionalText(input.manager),
      phone: optionalText(input.phone),
      email: optionalText(input.email)?.toLowerCase() || null,
      hours: optionalText(input.hours),
      notes: optionalText(input.notes),
      active: input.active ?? true
    }
  });
}

export async function updateWarehouseRecord(db: MasterDataDb, id: string, input: Partial<WarehouseWriteInput>) {
  const existing = await db.warehouse.findUnique({ where: { id } });
  if (!existing) throw new HttpError(404, "Almacén no encontrado.");
  const code = input.code !== undefined ? normalizeMasterCode(input.code) : existing.code;
  const name = input.name !== undefined ? input.name.trim() : existing.name;
  if (code !== existing.code) {
    const duplicate = await db.warehouse.findUnique({ where: { code } });
    if (duplicate) conflict(MASTER_DEACTIVATE_CODES.DUPLICATE_CODE, `Ya existe un almacén con código ${code}.`);
    const locationCount = await db.location.count({
      where: { OR: [{ warehouseId: id }, { warehouse: existing.code }] }
    });
    const movements = await db.inventoryMovement.count({
      where: { warehouse: existing.code }
    });
    if (locationCount > 0 || movements > 0) {
      conflict(
        MASTER_DEACTIVATE_CODES.WAREHOUSE_CODE_IMMUTABLE,
        "No se puede cambiar el código de un almacén con ubicaciones o historial."
      );
    }
  }
  return db.warehouse.update({
    where: { id },
    data: {
      ...(input.code !== undefined ? { code } : {}),
      ...(input.name !== undefined ? { name } : {}),
      ...(input.address !== undefined ? { address: optionalText(input.address) } : {}),
      ...(input.manager !== undefined ? { manager: optionalText(input.manager) } : {}),
      ...(input.phone !== undefined ? { phone: optionalText(input.phone) } : {}),
      ...(input.email !== undefined ? { email: optionalText(input.email)?.toLowerCase() || null } : {}),
      ...(input.hours !== undefined ? { hours: optionalText(input.hours) } : {}),
      ...(input.notes !== undefined ? { notes: optionalText(input.notes) } : {}),
      ...(input.active !== undefined ? { active: input.active } : {})
    }
  });
}

export async function setWarehouseActive(db: MasterDataDb, id: string, active: boolean) {
  const existing = await db.warehouse.findUnique({ where: { id } });
  if (!existing) throw new HttpError(404, "Almacén no encontrado.");
  if (!active) {
    const inventory = await countPhysicalInventory(db, { location: { warehouseId: existing.id } });
    if (inventory > 0) {
      conflict(MASTER_DEACTIVATE_CODES.HAS_PHYSICAL_INVENTORY, "No se puede desactivar el almacén: tiene inventario físico.");
    }
    const reservations = await countActiveReservations(db, { inventory: { location: { warehouseId: existing.id } } });
    if (reservations > 0) {
      conflict(MASTER_DEACTIVATE_CODES.HAS_ACTIVE_RESERVATIONS, "No se puede desactivar el almacén: tiene reservas activas.");
    }
    const tasks = await countActiveTasks(db, { warehouse: existing.code });
    if (tasks > 0) {
      conflict(MASTER_DEACTIVATE_CODES.HAS_ACTIVE_TASKS, "No se puede desactivar el almacén: tiene tareas activas.");
    }
    const activeLocations = await db.location.count({ where: { warehouseId: existing.id, active: true } });
    if (activeLocations > 0) {
      conflict(MASTER_DEACTIVATE_CODES.HAS_ACTIVE_LOCATIONS, "No se puede desactivar el almacén: tiene ubicaciones activas.");
    }
  }
  return db.warehouse.update({ where: { id }, data: { active } });
}

export type LocationWriteInput = {
  warehouseId?: string | null;
  warehouse?: string;
  code?: string | null;
  description?: string | null;
  zone?: string | null;
  rack?: string | null;
  level?: string | null;
  position?: string | null;
  notes?: string | null;
  active?: boolean;
};

async function resolveWarehouseRecord(
  db: MasterDataDb,
  input: { warehouseId?: string | null; warehouse?: string | null }
) {
  const warehouseId = optionalText(input.warehouseId);
  if (warehouseId) {
    const byId = await db.warehouse.findUnique({ where: { id: warehouseId } });
    if (!byId) throw new HttpError(400, "Almacén no encontrado.");
    return byId;
  }
  const code = input.warehouse ? normalizeMasterCode(input.warehouse) : "";
  if (!code) throw new HttpError(400, "El almacén es obligatorio.");
  const byCode = await db.warehouse.findUnique({ where: { code } });
  if (!byCode) throw new HttpError(400, "Almacén no encontrado.");
  return byCode;
}

function composeLocationCode(input: LocationWriteInput & { warehouse: string }): string {
  const explicit = optionalText(input.code);
  if (explicit) return normalizeMasterCode(explicit);
  const warehouse = normalizeMasterCode(input.warehouse);
  const zone = optionalText(input.zone) || "-";
  const rack = optionalText(input.rack) || "-";
  const level = optionalText(input.level) || "-";
  const position = optionalText(input.position) || "-";
  return `${warehouse}-${zone}-${rack}-${level}-${position}`.toUpperCase();
}

export async function createLocationRecord(db: MasterDataDb, input: LocationWriteInput) {
  const warehouseRow = await resolveWarehouseRecord(db, input);
  const warehouse = warehouseRow.code;
  const code = composeLocationCode({ ...input, warehouse });
  const duplicate = await db.location.findFirst({
    where: { warehouseId: warehouseRow.id, code }
  });
  if (duplicate) {
    conflict(MASTER_DEACTIVATE_CODES.DUPLICATE_CODE, `Ya existe una ubicación con código ${code}.`);
  }
  try {
    return await db.location.create({
      data: {
        warehouseId: warehouseRow.id,
        warehouse,
        code,
        description: optionalText(input.description),
        zone: optionalText(input.zone)?.toUpperCase() || "-",
        rack: optionalText(input.rack)?.toUpperCase() || "-",
        level: optionalText(input.level)?.toUpperCase() || "-",
        position: optionalText(input.position)?.toUpperCase() || "-",
        notes: optionalText(input.notes),
        active: input.active ?? true
      }
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      conflict(MASTER_DEACTIVATE_CODES.DUPLICATE_CODE, `Ya existe una ubicación con código ${code}.`);
    }
    throw error;
  }
}

export async function updateLocationRecord(db: MasterDataDb, id: string, input: Partial<LocationWriteInput>) {
  const existing = await db.location.findUnique({ where: { id } });
  if (!existing) throw new HttpError(404, "Ubicación no encontrada.");
  const warehouseRow =
    input.warehouseId !== undefined || input.warehouse !== undefined
      ? await resolveWarehouseRecord(db, {
          warehouseId: input.warehouseId ?? existing.warehouseId,
          warehouse: input.warehouse ?? existing.warehouse
        })
      : await resolveWarehouseRecord(db, {
          warehouseId: existing.warehouseId,
          warehouse: existing.warehouse
        });
  const warehouse = warehouseRow.code;
  const code =
    input.code !== undefined ||
    input.warehouse !== undefined ||
    input.warehouseId !== undefined ||
    input.zone !== undefined ||
    input.rack !== undefined
      ? composeLocationCode({
          warehouse,
          code: input.code !== undefined ? input.code : existing.code,
          zone: input.zone !== undefined ? input.zone : existing.zone,
          rack: input.rack !== undefined ? input.rack : existing.rack,
          level: input.level !== undefined ? input.level : existing.level,
          position: input.position !== undefined ? input.position : existing.position
        })
      : existing.code;
  if (code !== existing.code || warehouseRow.id !== existing.warehouseId) {
    const duplicate = await db.location.findFirst({
      where: { AND: [{ warehouseId: warehouseRow.id, code }, { id: { not: id } }] }
    });
    if (duplicate) conflict(MASTER_DEACTIVATE_CODES.DUPLICATE_CODE, `Ya existe una ubicación con código ${code}.`);
  }
  return db.location.update({
    where: { id },
    data: {
      warehouseId: warehouseRow.id,
      warehouse,
      code,
      ...(input.description !== undefined ? { description: optionalText(input.description) } : {}),
      ...(input.zone !== undefined ? { zone: optionalText(input.zone)?.toUpperCase() || "-" } : {}),
      ...(input.rack !== undefined ? { rack: optionalText(input.rack)?.toUpperCase() || "-" } : {}),
      ...(input.level !== undefined ? { level: optionalText(input.level)?.toUpperCase() || "-" } : {}),
      ...(input.position !== undefined ? { position: optionalText(input.position)?.toUpperCase() || "-" } : {}),
      ...(input.notes !== undefined ? { notes: optionalText(input.notes) } : {}),
      ...(input.active !== undefined ? { active: input.active } : {})
    }
  });
}

export async function setLocationActive(db: MasterDataDb, id: string, active: boolean) {
  const existing = await db.location.findUnique({ where: { id } });
  if (!existing) throw new HttpError(404, "Ubicación no encontrada.");
  if (!active) {
    const inventory = await countPhysicalInventory(db, { locationId: id });
    if (inventory > 0) {
      conflict(MASTER_DEACTIVATE_CODES.HAS_PHYSICAL_INVENTORY, "No se puede desactivar la ubicación: tiene inventario físico.");
    }
    const reservations = await countActiveReservations(db, { inventory: { locationId: id } });
    if (reservations > 0) {
      conflict(MASTER_DEACTIVATE_CODES.HAS_ACTIVE_RESERVATIONS, "No se puede desactivar la ubicación: tiene reservas activas.");
    }
    const tasks = await countActiveTasks(db, { warehouse: existing.warehouse, reference: existing.code });
    if (tasks > 0) {
      conflict(MASTER_DEACTIVATE_CODES.HAS_ACTIVE_TASKS, "No se puede desactivar la ubicación: tiene tareas activas.");
    }
  }
  return db.location.update({ where: { id }, data: { active } });
}

export async function warehouseOperationalStats(
  db: MasterDataDb,
  warehouse: { id: string; code: string },
  clientId: string
) {
  const [locationCount, qtyAgg] = await Promise.all([
    db.location.count({ where: { warehouseId: warehouse.id } }),
    db.inventory.aggregate({
      where: { clientId, location: { warehouseId: warehouse.id }, qty: { gt: 0 } },
      _sum: { qty: true, reservedQty: true }
    })
  ]);
  return {
    locationCount,
    qty: qtyAgg._sum.qty?.toString() ?? "0",
    reservedQty: qtyAgg._sum.reservedQty?.toString() ?? "0"
  };
}
