import { Prisma, type PrismaClient } from "@prisma/client";
import { isForbiddenInventoryProjectRecord } from "../inventory/inventory-project-rules.js";

export const INVALID_LOGITEC_PROJECT_CODE = "LOGITEC";

export type InvalidLogitecAudit = {
  project: {
    id: string;
    clientId: string;
    code: string;
    name: string;
    active: boolean;
    createdAt: Date;
  } | null;
  refs: Record<string, number | string>;
  logitecOwnedProducts: number;
  inventoryCubesOnOwnedProducts: number;
  missingRealProjectLinks: Array<{ productId: string; sku: string; projectId: string; projectCode: string | null }>;
};

export type GlobalInventorySnapshot = {
  piezas: string;
  saldos: number;
  productos: number;
  movimientos: number;
  seriales: number;
  importBatch: number;
  totalProjects: number;
};

export type RemoveInvalidLogitecPlan = {
  audit: InvalidLogitecAudit;
  before: GlobalInventorySnapshot;
  safetyPass: boolean;
  blockingReasons: string[];
};

export type RemoveInvalidLogitecResult = {
  plan: RemoveInvalidLogitecPlan;
  after: GlobalInventorySnapshot;
  applied: {
    productsOwnerNulled: number;
    productProjectsDeleted: number;
    customerDeleted: boolean;
  };
  intact: boolean;
};

type Db = Pick<
  PrismaClient,
  | "$transaction"
  | "customer"
  | "product"
  | "productProject"
  | "inventory"
  | "inventoryMovement"
  | "requisition"
  | "activityLog"
  | "inventoryReservation"
  | "task"
  | "importBatch"
  | "inventorySerial"
>;

export async function snapshotGlobalCounts(db: Db): Promise<GlobalInventorySnapshot> {
  const [inventoryAgg, saldos, productos, movimientos, seriales, importBatch, totalProjects] =
    await Promise.all([
      db.inventory.aggregate({ _sum: { qty: true } }),
      db.inventory.count(),
      db.product.count(),
      db.inventoryMovement.count(),
      db.inventorySerial.count(),
      db.importBatch.count(),
      db.customer.count()
    ]);
  return {
    piezas: String(inventoryAgg._sum.qty ?? 0),
    saldos,
    productos,
    movimientos,
    seriales,
    importBatch,
    totalProjects
  };
}

async function refsForProjectId(db: Db, id: string) {
  const [
    inventoryAsProject,
    inventoryQty,
    productsAsOwner,
    productProjects,
    movementsFrom,
    movementsTo,
    requisitions,
    activityLogs,
    reservationsViaRequisition,
    tasksViaRequisition
  ] = await Promise.all([
    db.inventory.count({ where: { projectId: id } }),
    db.inventory.aggregate({ where: { projectId: id }, _sum: { qty: true } }),
    db.product.count({ where: { customerId: id } }),
    db.productProject.count({ where: { projectId: id } }),
    db.inventoryMovement.count({ where: { fromProjectId: id } }),
    db.inventoryMovement.count({ where: { toProjectId: id } }),
    db.requisition.count({ where: { projectId: id } }),
    db.activityLog.count({ where: { customerId: id } }),
    db.inventoryReservation.count({ where: { requisitionLine: { requisition: { projectId: id } } } }),
    db.task.count({ where: { requisition: { projectId: id } } })
  ]);
  return {
    inventoryAsProject,
    inventoryQtyAsProject: inventoryQty._sum.qty == null ? "0" : String(inventoryQty._sum.qty),
    productsAsOwner,
    productProjects,
    movementsFrom,
    movementsTo,
    requisitions,
    activityLogs,
    reservationsViaRequisition,
    tasksViaRequisition
  };
}

export async function auditInvalidLogitecProject(db: Db): Promise<InvalidLogitecAudit> {
  const project = await db.customer.findFirst({
    where: {
      OR: [
        { code: { equals: INVALID_LOGITEC_PROJECT_CODE, mode: "insensitive" } },
        { name: { equals: INVALID_LOGITEC_PROJECT_CODE, mode: "insensitive" } }
      ]
    },
    select: {
      id: true,
      clientId: true,
      code: true,
      name: true,
      active: true,
      createdAt: true
    }
  });
  if (!project) {
    return {
      project: null,
      refs: {},
      logitecOwnedProducts: 0,
      inventoryCubesOnOwnedProducts: 0,
      missingRealProjectLinks: []
    };
  }

  const refs = await refsForProjectId(db, project.id);
  const logitecProducts = await db.product.findMany({
    where: { customerId: project.id },
    select: { id: true, sku: true }
  });
  const projectCubes = logitecProducts.length
    ? await db.inventory.findMany({
        where: {
          productId: { in: logitecProducts.map((p) => p.id) },
          assignmentType: "PROJECT",
          projectId: { not: null }
        },
        select: {
          productId: true,
          projectId: true,
          project: { select: { code: true, name: true } },
          product: { select: { sku: true } }
        }
      })
    : [];

  const needed = new Map<string, { productId: string; sku: string; projectId: string; projectCode: string | null }>();
  for (const cube of projectCubes) {
    if (!cube.projectId || isForbiddenInventoryProjectRecord(cube.project)) continue;
    needed.set(`${cube.productId}::${cube.projectId}`, {
      productId: cube.productId,
      sku: cube.product.sku,
      projectId: cube.projectId,
      projectCode: cube.project?.code ?? null
    });
  }

  const existing =
    needed.size > 0
      ? await db.productProject.findMany({
          where: { OR: [...needed.values()].map((row) => ({ productId: row.productId, projectId: row.projectId })) },
          select: { productId: true, projectId: true }
        })
      : [];
  const existingSet = new Set(existing.map((row) => `${row.productId}::${row.projectId}`));
  const missingRealProjectLinks = [...needed.values()].filter(
    (row) => !existingSet.has(`${row.productId}::${row.projectId}`)
  );

  return {
    project,
    refs,
    logitecOwnedProducts: logitecProducts.length,
    inventoryCubesOnOwnedProducts: projectCubes.length,
    missingRealProjectLinks
  };
}

export async function planRemoveInvalidLogitecProject(db: Db): Promise<RemoveInvalidLogitecPlan> {
  const before = await snapshotGlobalCounts(db);
  const audit = await auditInvalidLogitecProject(db);
  const blockingReasons: string[] = [];
  if (!audit.project) {
    blockingReasons.push("LOGITEC project not found");
  } else if (audit.project.code.toUpperCase() !== INVALID_LOGITEC_PROJECT_CODE) {
    blockingReasons.push(`Unexpected project code ${audit.project.code}`);
  }
  if (Number(audit.refs.inventoryAsProject || 0) > 0) {
    blockingReasons.push("Inventory cubes still assigned to LOGITEC projectId");
  }
  if (Number(audit.refs.requisitions || 0) > 0) {
    blockingReasons.push("Requisitions still reference LOGITEC");
  }
  if (Number(audit.refs.reservationsViaRequisition || 0) > 0) {
    blockingReasons.push("Reservations still reference LOGITEC requisitions");
  }
  if (Number(audit.refs.tasksViaRequisition || 0) > 0) {
    blockingReasons.push("Tasks still reference LOGITEC requisitions");
  }
  if (audit.missingRealProjectLinks.length > 0) {
    blockingReasons.push(`Missing ${audit.missingRealProjectLinks.length} real ProductProject links for owned inventory`);
  }

  return {
    audit,
    before,
    safetyPass: blockingReasons.length === 0,
    blockingReasons
  };
}

export function snapshotsMatchOperationalData(
  before: GlobalInventorySnapshot,
  after: GlobalInventorySnapshot
): boolean {
  return (
    before.piezas === after.piezas &&
    before.saldos === after.saldos &&
    before.productos === after.productos &&
    before.movimientos === after.movimientos &&
    before.seriales === after.seriales &&
    before.importBatch === after.importBatch
  );
}

export async function executeRemoveInvalidLogitecProject(
  db: Db & { $transaction: PrismaClient["$transaction"] },
  opts: { dryRun?: boolean } = {}
): Promise<RemoveInvalidLogitecResult> {
  const plan = await planRemoveInvalidLogitecProject(db);
  if (!plan.audit.project) {
    return {
      plan,
      after: plan.before,
      applied: { productsOwnerNulled: 0, productProjectsDeleted: 0, customerDeleted: false },
      intact: true
    };
  }
  if (!plan.safetyPass) {
    throw new Error(`Unsafe to remove LOGITEC: ${plan.blockingReasons.join("; ")}`);
  }

  if (opts.dryRun) {
    return {
      plan,
      after: plan.before,
      applied: { productsOwnerNulled: 0, productProjectsDeleted: 0, customerDeleted: false },
      intact: true
    };
  }

  const projectId = plan.audit.project.id;
  const applied = await db.$transaction(async (tx) => {
    const productsOwnerNulled = await tx.product.updateMany({
      where: { customerId: projectId },
      data: { customerId: null }
    });
    const productProjectsDeleted = await tx.productProject.deleteMany({
      where: { projectId }
    });
    const remainingOwner = await tx.product.count({ where: { customerId: projectId } });
    const remainingPp = await tx.productProject.count({ where: { projectId } });
    const remainingInv = await tx.inventory.count({ where: { projectId } });
    const remainingReq = await tx.requisition.count({ where: { projectId } });
    if (remainingOwner || remainingPp || remainingInv || remainingReq) {
      throw new Error(
        `Leftover FKs owner=${remainingOwner} pp=${remainingPp} inv=${remainingInv} req=${remainingReq}`
      );
    }
    await tx.customer.delete({ where: { id: projectId } });
    return {
      productsOwnerNulled: productsOwnerNulled.count,
      productProjectsDeleted: productProjectsDeleted.count,
      customerDeleted: true
    };
  });

  const after = await snapshotGlobalCounts(db);
  const logitecRemaining = await db.customer.count({
    where: {
      OR: [
        { code: { equals: INVALID_LOGITEC_PROJECT_CODE, mode: "insensitive" } },
        { name: { equals: INVALID_LOGITEC_PROJECT_CODE, mode: "insensitive" } }
      ]
    }
  });

  const intact =
    snapshotsMatchOperationalData(plan.before, after) &&
    logitecRemaining === 0 &&
    after.totalProjects === plan.before.totalProjects - 1;

  return { plan, after, applied, intact };
}
