import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { Prisma, type PrismaClient } from "@prisma/client";

export const CONFIRM_PHRASE = "RESET_LOGITEC_DEV_OPERATIONAL_DATA";
export const ALLOW_ENV = "ALLOW_DEV_OPERATIONAL_RESET";

export const OPERATIONAL_ACTIVITY_TYPES = [
  "RECEIVE",
  "INBOUND",
  "OUTBOUND",
  "ADJUSTMENT",
  "RELOCATE",
  "PICK",
  "INVENTORY_ASSIGNMENT_TRANSFER",
  "REQUISITION",
  "QA"
] as const;

export const OPERATIONAL_IMPORT_SUBTYPES = ["INVENTORY", "INBOUND"] as const;

export const CLEAN_MODELS = [
  "ImportRowAudit",
  "ImportRow",
  "ImportBatch",
  "InventoryReservation",
  "InventoryMovement",
  "InventorySerial",
  "InventoryLayer",
  "Inventory",
  "InventoryStock",
  "ScanEvent",
  "RequisitionLine",
  "Requisition",
  "TaskPickOrRequisition"
] as const;

export class OperationalResetError extends Error {
  constructor(
    message: string,
    readonly code: string
  ) {
    super(message);
    this.name = "OperationalResetError";
  }
}

export function getDatabaseHost(databaseUrl: string): string | null {
  try {
    return new URL(databaseUrl).hostname.toLowerCase().replace(/\.$/, "");
  } catch {
    return null;
  }
}

export function normalizeDatabaseHost(host: string): string {
  return host.trim().toLowerCase().replace(/\.$/, "");
}

export function assertSafeOperationalResetEnv(env: NodeJS.ProcessEnv = process.env): void {
  if (String(env.NODE_ENV || "").toLowerCase() === "production") {
    throw new OperationalResetError("ABORT: NODE_ENV=production. Reset operativo solo en DEV.", "GUARD_NODE_ENV");
  }
  if (String(env.DATABASE_ENVIRONMENT || "").toLowerCase() === "production") {
    throw new OperationalResetError(
      "ABORT: DATABASE_ENVIRONMENT=production. Reset operativo solo en DEV.",
      "GUARD_DATABASE_ENVIRONMENT"
    );
  }
  const databaseUrl = String(env.DATABASE_URL || "");
  if (!databaseUrl) {
    throw new OperationalResetError("ABORT: DATABASE_URL ausente.", "GUARD_DATABASE_URL");
  }
  const databaseHost = getDatabaseHost(databaseUrl);
  const protectedHost = env.PRODUCTION_DATABASE_HOST
    ? normalizeDatabaseHost(env.PRODUCTION_DATABASE_HOST)
    : "";
  if (!protectedHost) {
    throw new OperationalResetError(
      "ABORT: PRODUCTION_DATABASE_HOST es obligatorio para el reset DEV.",
      "GUARD_PROD_HOST_REQUIRED"
    );
  }
  if (databaseHost && databaseHost === protectedHost) {
    throw new OperationalResetError(
      "SEGURIDAD LOGITEC: desarrollo no puede utilizar la base de datos de producción.",
      "GUARD_PROD_DATABASE"
    );
  }
}

export function assertDestructiveAuthorization(args: {
  execute: boolean;
  confirm: string | null;
  env?: NodeJS.ProcessEnv;
}): void {
  if (!args.execute) return;
  const env = args.env ?? process.env;
  if (env[ALLOW_ENV] !== "YES") {
    throw new OperationalResetError(
      `ABORT: falta ${ALLOW_ENV}=YES para ejecución destructiva.`,
      "GUARD_ALLOW"
    );
  }
  if (args.confirm !== CONFIRM_PHRASE) {
    throw new OperationalResetError(
      `ABORT: falta --confirm=${CONFIRM_PHRASE}`,
      "GUARD_CONFIRM"
    );
  }
}

export type OperationalCounts = {
  inventoryQty: string;
  layerQty: string;
  inventoryReserved: string;
  layerReserved: string;
  inventoryRows: number;
  productProjects: number;
  users: number;
  clients: number;
  projects: number;
  products: number;
  locations: number;
  inventoryStock: number;
  inventoryLayerRows: number;
  inventorySerials: number;
  inventoryReservations: number;
  inventoryMovements: number;
  requisitions: number;
  requisitionLines: number;
  scanEvents: number;
  importBatches: number;
  importRows: number;
  importRowAudits: number;
  pickTasks: number;
  activityOperational: number;
  activityPreserved: number;
  incidents: number;
  comments: number;
  tasksTotal: number;
};

export async function measureOperationalCounts(db: PrismaClient | Prisma.TransactionClient): Promise<OperationalCounts> {
  const [
    invQty,
    layerQty,
    invRes,
    layerRes,
    inventoryRows,
    productProjects,
    users,
    clients,
    projects,
    products,
    locations,
    inventoryStock,
    inventoryLayerRows,
    inventorySerials,
    inventoryReservations,
    inventoryMovements,
    requisitions,
    requisitionLines,
    scanEvents,
    importBatches,
    importRows,
    importRowAudits,
    pickTasks,
    activityOperational,
    activityTotal,
    incidents,
    comments,
    tasksTotal
  ] = await Promise.all([
    db.inventory.aggregate({ _sum: { qty: true } }),
    db.inventoryLayer.aggregate({ _sum: { qty: true } }),
    db.inventory.aggregate({ _sum: { reservedQty: true } }),
    db.inventoryLayer.aggregate({ _sum: { reservedQty: true } }),
    db.inventory.count(),
    db.productProject.count(),
    db.user.count(),
    db.client.count(),
    db.customer.count(),
    db.product.count(),
    db.location.count(),
    db.inventoryStock.count(),
    db.inventoryLayer.count(),
    db.inventorySerial.count(),
    db.inventoryReservation.count(),
    db.inventoryMovement.count(),
    db.requisition.count(),
    db.requisitionLine.count(),
    db.scanEvent.count(),
    db.importBatch.count(),
    db.importRow.count(),
    db.importRowAudit.count(),
    db.task.count({ where: { OR: [{ type: "PICK" }, { requisitionId: { not: null } }] } }),
    db.activityLog.count({ where: operationalActivityWhere() }),
    db.activityLog.count(),
    db.incident.count(),
    db.comment.count(),
    db.task.count()
  ]);
  return {
    inventoryQty: invQty._sum.qty?.toString() ?? "0",
    layerQty: layerQty._sum.qty?.toString() ?? "0",
    inventoryReserved: invRes._sum.reservedQty?.toString() ?? "0",
    layerReserved: layerRes._sum.reservedQty?.toString() ?? "0",
    inventoryRows,
    productProjects,
    users,
    clients,
    projects,
    products,
    locations,
    inventoryStock,
    inventoryLayerRows,
    inventorySerials,
    inventoryReservations,
    inventoryMovements,
    requisitions,
    requisitionLines,
    scanEvents,
    importBatches,
    importRows,
    importRowAudits,
    pickTasks,
    activityOperational,
    activityPreserved: activityTotal - activityOperational,
    incidents,
    comments,
    tasksTotal
  };
}

function operationalActivityWhere(): Prisma.ActivityLogWhereInput {
  return {
    OR: [
      { type: { in: [...OPERATIONAL_ACTIVITY_TYPES] } },
      { type: "IMPORT", subtype: { in: [...OPERATIONAL_IMPORT_SUBTYPES] } }
    ]
  };
}

function jsonSafe(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (Prisma.Decimal.isDecimal(value)) return value.toString();
  if (Array.isArray(value)) return value.map(jsonSafe);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      const lowered = key.toLowerCase();
      if (
        lowered.includes("password") ||
        lowered.includes("secret") ||
        lowered.includes("token") ||
        lowered.includes("database_url") ||
        lowered.includes("credential")
      ) {
        continue;
      }
      out[key] = jsonSafe(item);
    }
    return out;
  }
  return value;
}

async function dumpModel(
  snapshotDir: string,
  model: string,
  rows: unknown[]
): Promise<{ model: string; rows: number; bytes: number }> {
  const filePath = path.join(snapshotDir, `${model}.json`);
  const payload = JSON.stringify(jsonSafe(rows), null, 2);
  fs.writeFileSync(filePath, payload);
  return { model, rows: rows.length, bytes: Buffer.byteLength(payload) };
}

export async function createOperationalSnapshot(
  db: PrismaClient,
  snapshotDir: string,
  meta: { gitSha: string; environment: string; counts: OperationalCounts }
) {
  fs.mkdirSync(snapshotDir, { recursive: true });
  const files = await Promise.all([
    dumpModel(snapshotDir, "ImportRowAudit", await db.importRowAudit.findMany()),
    dumpModel(snapshotDir, "ImportRow", await db.importRow.findMany()),
    dumpModel(snapshotDir, "ImportBatch", await db.importBatch.findMany()),
    dumpModel(snapshotDir, "InventoryReservation", await db.inventoryReservation.findMany()),
    dumpModel(snapshotDir, "InventoryMovement", await db.inventoryMovement.findMany()),
    dumpModel(snapshotDir, "InventorySerial", await db.inventorySerial.findMany()),
    dumpModel(snapshotDir, "InventoryLayer", await db.inventoryLayer.findMany()),
    dumpModel(snapshotDir, "Inventory", await db.inventory.findMany()),
    dumpModel(snapshotDir, "InventoryStock", await db.inventoryStock.findMany()),
    dumpModel(snapshotDir, "ScanEvent", await db.scanEvent.findMany()),
    dumpModel(snapshotDir, "RequisitionLine", await db.requisitionLine.findMany()),
    dumpModel(snapshotDir, "Requisition", await db.requisition.findMany()),
    dumpModel(
      snapshotDir,
      "TaskPickOrRequisition",
      await db.task.findMany({ where: { OR: [{ type: "PICK" }, { requisitionId: { not: null } }] } })
    )
  ]);

  const activityRows = await db.activityLog.findMany({ where: operationalActivityWhere() });
  files.push(await dumpModel(snapshotDir, "ActivityLogOperational", activityRows));

  const manifest = {
    createdAt: new Date().toISOString(),
    environment: meta.environment,
    gitSha: meta.gitSha,
    models: files.map((file) => file.model),
    files,
    counts: meta.counts,
    note: "Snapshot lógico de datos operativos DEV. No contiene credenciales. No es inventario oficial."
  };
  const manifestPath = path.join(snapshotDir, "manifest.json");
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  if (!fs.statSync(manifestPath).size) {
    throw new OperationalResetError("ABORT: manifest.json vacío.", "SNAPSHOT_EMPTY");
  }
  return { snapshotDir, manifestPath, files };
}

export function verifyOperationalSnapshot(
  snapshotDir: string,
  expected: OperationalCounts,
  live: OperationalCounts
) {
  if (!fs.existsSync(snapshotDir)) {
    throw new OperationalResetError("ABORT: snapshot no existe.", "SNAPSHOT_MISSING");
  }
  const manifestPath = path.join(snapshotDir, "manifest.json");
  if (!fs.existsSync(manifestPath) || !fs.statSync(manifestPath).size) {
    throw new OperationalResetError("ABORT: manifest.json ausente o vacío.", "SNAPSHOT_MANIFEST");
  }
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as {
    models: string[];
    files: Array<{ model: string; rows: number }>;
    counts: OperationalCounts;
  };
  const required = [...CLEAN_MODELS, "ActivityLogOperational"];
  for (const model of required) {
    const filePath = path.join(snapshotDir, `${model}.json`);
    if (!fs.existsSync(filePath) || !fs.statSync(filePath).size) {
      throw new OperationalResetError(`ABORT: snapshot incompleto (${model}).`, "SNAPSHOT_MODEL_MISSING");
    }
  }
  const countKeys: Array<keyof OperationalCounts> = [
    "inventoryQty",
    "layerQty",
    "inventoryReserved",
    "layerReserved",
    "inventoryRows",
    "productProjects",
    "inventoryMovements",
    "requisitions",
    "inventorySerials"
  ];
  for (const key of countKeys) {
    if (String(expected[key]) !== String(live[key]) || String(manifest.counts[key]) !== String(live[key])) {
      throw new OperationalResetError(
        `ABORT: conteos del snapshot no coinciden con la BD (${String(key)}).`,
        "SNAPSHOT_COUNT_MISMATCH"
      );
    }
  }
}

export type ResetScope = {
  productIds?: string[];
};

export async function deleteOperationalData(tx: Prisma.TransactionClient, scope?: ResetScope) {
  const productIds = scope?.productIds;
  if (productIds?.length) {
    await tx.inventoryReservation.deleteMany({ where: { inventory: { productId: { in: productIds } } } });
    await tx.inventoryMovement.deleteMany({ where: { productId: { in: productIds } } });
    await tx.inventorySerial.deleteMany({ where: { productId: { in: productIds } } });
    await tx.inventoryLayer.deleteMany({ where: { inventory: { productId: { in: productIds } } } });
    await tx.inventory.deleteMany({ where: { productId: { in: productIds } } });
    await tx.inventoryStock.deleteMany({ where: { productId: { in: productIds } } });
    await tx.scanEvent.deleteMany({ where: { productId: { in: productIds } } });
    await tx.activityLog.deleteMany({
      where: { AND: [operationalActivityWhere(), { productId: { in: productIds } }] }
    });
    const lines = await tx.requisitionLine.findMany({
      where: { productId: { in: productIds } },
      select: { id: true, requisitionId: true }
    });
    const lineIds = lines.map((line) => line.id);
    if (lineIds.length) {
      await tx.inventoryReservation.deleteMany({ where: { requisitionLineId: { in: lineIds } } });
      await tx.requisitionLine.deleteMany({ where: { id: { in: lineIds } } });
    }
    const requisitionIds = [...new Set(lines.map((line) => line.requisitionId))];
    for (const requisitionId of requisitionIds) {
      const leftover = await tx.requisitionLine.count({ where: { requisitionId } });
      if (!leftover) {
        await tx.task.deleteMany({ where: { requisitionId } });
        await tx.requisition.deleteMany({ where: { id: requisitionId } });
      }
    }
    return;
  }

  await tx.importRowAudit.deleteMany();
  await tx.importRow.deleteMany();
  await tx.importBatch.deleteMany();
  await tx.inventoryReservation.deleteMany();
  await tx.inventoryMovement.deleteMany();
  await tx.inventorySerial.deleteMany();
  await tx.inventoryLayer.deleteMany();
  await tx.inventory.deleteMany();
  await tx.inventoryStock.deleteMany();
  await tx.scanEvent.deleteMany();
  await tx.activityLog.deleteMany({ where: operationalActivityWhere() });
  await tx.requisitionLine.deleteMany();
  await tx.task.deleteMany({ where: { OR: [{ type: "PICK" }, { requisitionId: { not: null } }] } });
  await tx.requisition.deleteMany();
}

export function snapshotRoot(): string {
  return path.resolve("tmp/operational-reset-snapshots");
}

export function newSnapshotDir(): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return path.join(snapshotRoot(), stamp);
}

export function gitSha(): string {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  } catch {
    return "unknown";
  }
}

export function tryOptionalPgDump(snapshotDir: string, databaseUrl: string): string | null {
  try {
    execFileSync("pg_dump", ["--version"], { stdio: "ignore" });
  } catch {
    return null;
  }
  if (/pgbouncer=true/i.test(databaseUrl) || /-pooler\./i.test(databaseUrl)) {
    return null;
  }
  const dumpPath = path.join(snapshotDir, "dev.pgdump");
  try {
    execFileSync("pg_dump", ["--no-owner", "--no-acl", `--file=${dumpPath}`, databaseUrl], {
      stdio: "ignore",
      env: { ...process.env, PGPASSWORD: undefined }
    });
    return fs.existsSync(dumpPath) && fs.statSync(dumpPath).size ? dumpPath : null;
  } catch {
    return null;
  }
}
