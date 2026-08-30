import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD || "Admin1234";
const QA_PASSWORD = process.env.QA_E2E_PASSWORD || "QaUser1234";

async function upsertUser(input: {
  email: string;
  fullName: string;
  role: "ADMIN" | "SUPERVISOR" | "OPERATOR" | "CLIENT";
  clientId: string | null;
  password: string;
}) {
  const passwordHash = await bcrypt.hash(input.password, 10);
  await prisma.user.upsert({
    where: { email: input.email },
    update: {
      fullName: input.fullName,
      passwordHash,
      role: input.role,
      clientId: input.clientId,
      isActive: true,
      mustChangePassword: false
    },
    create: {
      email: input.email,
      fullName: input.fullName,
      passwordHash,
      role: input.role,
      clientId: input.clientId,
      isActive: true,
      mustChangePassword: false
    }
  });
}

async function main() {
  if (process.env.NODE_ENV === "production") {
    throw new Error("QA e2e users must not be created in production.");
  }
  let aviat = await prisma.client.findFirst({
    where: { code: { equals: "AVIAT", mode: "insensitive" } },
    select: { id: true, code: true, active: true }
  });
  if (!aviat) {
    aviat = await prisma.client.create({
      data: {
        code: "AVIAT",
        name: "AVIAT",
        tradeName: "AVIAT",
        legalName: "AVIAT SA",
        active: true
      },
      select: { id: true, code: true, active: true }
    });
  } else if (!aviat.active) {
    aviat = await prisma.client.update({
      where: { id: aviat.id },
      data: { active: true },
      select: { id: true, code: true, active: true }
    });
  }

  await upsertUser({
    email: "admin@logitec.local",
    fullName: "Administrador Logitec",
    role: "ADMIN",
    clientId: null,
    password: ADMIN_PASSWORD
  });
  await upsertUser({
    email: "qa.supervisor@logitec.local",
    fullName: "QA Supervisor",
    role: "SUPERVISOR",
    clientId: aviat.id,
    password: QA_PASSWORD
  });
  await upsertUser({
    email: "qa.operator@logitec.local",
    fullName: "QA Operator",
    role: "OPERATOR",
    clientId: aviat.id,
    password: QA_PASSWORD
  });
  await upsertUser({
    email: "qa.client@logitec.local",
    fullName: "QA Client",
    role: "CLIENT",
    clientId: aviat.id,
    password: QA_PASSWORD
  });
}

main()
  .finally(async () => {
    await prisma.$disconnect();
  })
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
