import dotenv from "dotenv";
import { prisma } from "../../db/prisma.js";
import {
  ALLOW_ENV,
  CONFIRM_PHRASE,
  CLEAN_MODELS,
  OperationalResetError,
  assertDestructiveAuthorization,
  assertSafeOperationalResetEnv,
  createOperationalSnapshot,
  deleteOperationalData,
  gitSha,
  measureOperationalCounts,
  newSnapshotDir,
  tryOptionalPgDump,
  verifyOperationalSnapshot
} from "./lib.js";

dotenv.config();

function parseArgs(argv: string[]) {
  const execute = argv.includes("--execute");
  const confirmArg = argv.find((item) => item.startsWith("--confirm="));
  const confirm = confirmArg ? confirmArg.slice("--confirm=".length) : null;
  return { execute, confirm };
}

function printCounts(label: string, counts: Awaited<ReturnType<typeof measureOperationalCounts>>) {
  console.log(`\n${label}`);
  console.log(
    JSON.stringify(
      {
        inventoryRows: counts.inventoryRows,
        inventoryQty: counts.inventoryQty,
        layerRows: counts.inventoryLayerRows,
        layerQty: counts.layerQty,
        reserved: counts.inventoryReserved,
        layerReserved: counts.layerReserved,
        movements: counts.inventoryMovements,
        serials: counts.inventorySerials,
        reservations: counts.inventoryReservations,
        requisitions: counts.requisitions,
        requisitionLines: counts.requisitionLines,
        scanEvents: counts.scanEvents,
        importBatches: counts.importBatches,
        pickTasks: counts.pickTasks,
        activityOperational: counts.activityOperational,
        activityPreserved: counts.activityPreserved,
        masters: {
          users: counts.users,
          clients: counts.clients,
          projects: counts.projects,
          products: counts.products,
          productProjects: counts.productProjects,
          locations: counts.locations
        },
        preservedUntouched: {
          incidents: counts.incidents,
          comments: counts.comments,
          tasksTotal: counts.tasksTotal
        }
      },
      null,
      2
    )
  );
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  try {
    assertSafeOperationalResetEnv(process.env);
    assertDestructiveAuthorization(args);
  } catch (error) {
    if (error instanceof OperationalResetError) {
      console.error(error.message);
      process.exitCode = 2;
      return;
    }
    throw error;
  }

  const host = (() => {
    try {
      return new URL(process.env.DATABASE_URL || "").hostname;
    } catch {
      return "(unreadable)";
    }
  })();

  console.log("LOGITEC DEV operational reset");
  console.log(
    JSON.stringify(
      {
        mode: args.execute ? "EXECUTE" : "DRY RUN",
        NODE_ENV: process.env.NODE_ENV || "development",
        DATABASE_ENVIRONMENT: process.env.DATABASE_ENVIRONMENT || "development",
        databaseHost: host,
        identifiedAs: "DEV",
        allowEnv: process.env[ALLOW_ENV] === "YES",
        modelsToClean: [...CLEAN_MODELS, "ActivityLogOperational"],
        modelsPreserved: [
          "User",
          "Client",
          "Customer",
          "Product",
          "ProductProject",
          "Location",
          "InventoryStatusDefinition"
        ],
        modelsNotTouched: ["Comment", "Incident", "Task(non-PICK)", "ActivityLog(admin/unknown)"]
      },
      null,
      2
    )
  );

  const before = await measureOperationalCounts(prisma);
  printCounts("ANTES", before);

  if (!args.execute) {
    console.log("\nDRY RUN: cero escrituras. Para ejecutar mañana:");
    console.log(`  ${ALLOW_ENV}=YES npm run dev:operational-reset -- --execute --confirm=${CONFIRM_PHRASE}`);
    return;
  }

  const snapshotDir = newSnapshotDir();
  const snapshot = await createOperationalSnapshot(prisma, snapshotDir, {
    gitSha: gitSha(),
    environment: process.env.DATABASE_ENVIRONMENT || process.env.NODE_ENV || "development",
    counts: before
  });
  const liveAfterSnapshot = await measureOperationalCounts(prisma);
  verifyOperationalSnapshot(snapshot.snapshotDir, before, liveAfterSnapshot);
  const pgDump = tryOptionalPgDump(snapshot.snapshotDir, process.env.DATABASE_URL || "");

  console.log("\nSNAPSHOT");
  console.log(
    JSON.stringify(
      {
        path: snapshot.snapshotDir,
        manifest: snapshot.manifestPath,
        pgDump: pgDump || "omitido (pg_dump ausente o pooler)",
        result: "PASS"
      },
      null,
      2
    )
  );

  await prisma.$transaction((tx) => deleteOperationalData(tx), { maxWait: 10_000, timeout: 180_000 });

  const after = await measureOperationalCounts(prisma);
  printCounts("DESPUÉS", after);
  console.log("\nMAESTROS");
  console.log(
    JSON.stringify(
      {
        users: { before: before.users, after: after.users },
        clients: { before: before.clients, after: after.clients },
        projects: { before: before.projects, after: after.projects },
        products: { before: before.products, after: after.products },
        productProjects: { before: before.productProjects, after: after.productProjects },
        locations: { before: before.locations, after: after.locations }
      },
      null,
      2
    )
  );

  const mastersOk =
    before.users === after.users &&
    before.clients === after.clients &&
    before.projects === after.projects &&
    before.products === after.products &&
    before.productProjects === after.productProjects &&
    before.locations === after.locations;
  const inventoryClear =
    after.inventoryRows === 0 &&
    after.inventoryQty === "0" &&
    after.layerQty === "0" &&
    after.inventoryReserved === "0" &&
    after.layerReserved === "0";
  if (!mastersOk || !inventoryClear) {
    throw new OperationalResetError("RESET DEV FAIL: maestros o inventario no quedaron como se esperaba.", "RESET_VERIFY");
  }
  console.log("\nResultado: RESET DEV PASS");
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
