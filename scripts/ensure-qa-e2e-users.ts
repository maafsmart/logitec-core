import dotenv from "dotenv";
import bcrypt from "bcryptjs";

dotenv.config();

import {
  QA_E2E_USERS,
  REAL_ADMIN_EMAIL,
  assertE2eHarnessReady,
  assertQaE2eEmail,
  selectExistingActiveQaClient,
  type QaClientRow
} from "../src/scripts/e2e-safety.js";

async function main() {
  const secrets = assertE2eHarnessReady(process.env);

  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient();
  try {
    const preferredCode = String(process.env.E2E_CLIENT_CODE || "AVIAT").trim();
    const rows = (await prisma.client.findMany({
      select: { id: true, code: true, active: true }
    })) as QaClientRow[];
    const client = selectExistingActiveQaClient({ preferredCode, rows });

    const passwordByRole = {
      ADMIN: secrets.adminPassword,
      SUPERVISOR: secrets.qaPassword,
      OPERATOR: secrets.qaPassword,
      CLIENT: secrets.qaPassword
    } as const;

    for (const spec of Object.values(QA_E2E_USERS)) {
      const email = assertQaE2eEmail(spec.email);
      if (email === REAL_ADMIN_EMAIL) {
        throw new Error("E2E_REAL_ADMIN_FORBIDDEN");
      }
      const passwordHash = await bcrypt.hash(passwordByRole[spec.role], 10);
      const clientId = spec.role === "ADMIN" ? null : client.id;
      await prisma.user.upsert({
        where: { email },
        update: {
          fullName: spec.fullName,
          passwordHash,
          role: spec.role,
          clientId,
          isActive: true,
          mustChangePassword: false
        },
        create: {
          email,
          fullName: spec.fullName,
          passwordHash,
          role: spec.role,
          clientId,
          isActive: true,
          mustChangePassword: false
        }
      });
    }

    console.log(
      JSON.stringify({
        ok: true,
        qaUsers: Object.values(QA_E2E_USERS).map((u) => u.email),
        clientCode: client.code,
        realAdminTouched: false,
        aviatCreated: false,
        aviatReactivated: false
      })
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch(async (err) => {
  const code = typeof err?.code === "string" ? err.code : "E2E_ENSURE_FAILED";
  console.error(JSON.stringify({ ok: false, code, message: String(err?.message || err) }));
  process.exit(1);
});
