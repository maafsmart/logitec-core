import "dotenv/config";
import { prisma } from "../db/prisma.js";
import { env } from "../config/env.js";
import {
  auditInvalidLogitecProject,
  executeRemoveInvalidLogitecProject,
  planRemoveInvalidLogitecProject
} from "../modules/master-data/remove-invalid-logitec-project.service.js";

const dryRun = process.argv.includes("--dry-run");
const auditOnly = process.argv.includes("--audit-only");
const allowProduction = process.argv.includes("--allow-production");

async function main() {
  const host = new URL(env.DATABASE_URL).hostname;
  const isProductionHost = env.PRODUCTION_DATABASE_HOST
    ? host.toLowerCase() === env.PRODUCTION_DATABASE_HOST.toLowerCase().replace(/\.$/, "")
    : host.startsWith("ep-empty-mountain-apt3mtzv");

  if (isProductionHost && !allowProduction) {
    throw new Error("Production host detected. Re-run with --allow-production after QA PASS.");
  }

  if (auditOnly) {
    const audit = await auditInvalidLogitecProject(prisma);
    const plan = await planRemoveInvalidLogitecProject(prisma);
    console.log(JSON.stringify({ host, audit, plan }, null, 2));
    return;
  }

  const result = await executeRemoveInvalidLogitecProject(prisma, { dryRun });
  console.log(
    JSON.stringify(
      {
        host,
        dryRun,
        safetyPass: result.plan.safetyPass,
        blockingReasons: result.plan.blockingReasons,
        before: result.plan.before,
        after: result.after,
        applied: result.applied,
        intact: result.intact,
        audit: result.plan.audit
      },
      null,
      2
    )
  );
  if (!result.intact) process.exitCode = 2;
}

main()
  .catch((error) => {
    console.error(JSON.stringify({ ok: false, error: String(error?.message || error) }));
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
