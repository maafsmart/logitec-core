import dotenv from "dotenv";
import { prisma } from "../../db/prisma.js";
import {
  ALLOW_ENV,
  CONFIRM_PHRASE,
  CLEAN_MODELS,
  OperationalResetError,
  assertDestructiveAuthorization,
  assertSafeOperationalResetEnv,
  runOperationalReset,
  type OperationalCounts
} from "./lib.js";

dotenv.config();

function parseArgs(argv: string[]) {
  const execute = argv.includes("--execute");
  const confirmArg = argv.find((item) => item.startsWith("--confirm="));
  const confirm = confirmArg ? confirmArg.slice("--confirm=".length) : null;
  return { execute, confirm };
}

function printCounts(label: string, counts: OperationalCounts) {
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

  const result = await runOperationalReset(prisma, { execute: args.execute });
  printCounts("ANTES", result.before);

  if (!args.execute) {
    console.log("\nDRY RUN: cero escrituras. Para ejecutar mañana:");
    console.log(`  ${ALLOW_ENV}=YES npm run dev:operational-reset -- --execute --confirm=${CONFIRM_PHRASE}`);
    return;
  }

  console.log("\nSNAPSHOT");
  console.log(
    JSON.stringify(
      {
        path: result.snapshotDir,
        manifest: result.snapshotManifest,
        pgDump: result.pgDump || "omitido (pg_dump ausente o pooler)",
        result: "PASS"
      },
      null,
      2
    )
  );

  const after = result.after;
  if (!after) {
    throw new OperationalResetError("RESET DEV FAIL: sin conteos posteriores.", "RESET_VERIFY");
  }
  printCounts("DESPUÉS", after);
  console.log("\nMAESTROS");
  console.log(
    JSON.stringify(
      {
        users: { before: result.before.users, after: after.users },
        clients: { before: result.before.clients, after: after.clients },
        projects: { before: result.before.projects, after: after.projects },
        products: { before: result.before.products, after: after.products },
        productProjects: { before: result.before.productProjects, after: after.productProjects },
        locations: { before: result.before.locations, after: after.locations }
      },
      null,
      2
    )
  );
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
