import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const QA_PASSWORD = process.env.QA_E2E_PASSWORD || "QaUser1234";

async function upsertUser(input: {
  email: string;
  fullName: string;
  role: "ADMIN" | "SUPERVISOR" | "OPERATOR" | "CLIENT";
  clientId: string | null;
}) {
  const passwordHash = await bcrypt.hash(QA_PASSWORD, 10);
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
    clientId: null
  });
  await upsertUser({
    email: "qa.supervisor@logitec.local",
    fullName: "QA Supervisor",
    role: "SUPERVISOR",
    clientId: aviat.id
  });
  await upsertUser({
    email: "qa.operator@logitec.local",
    fullName: "QA Operator",
    role: "OPERATOR",
    clientId: aviat.id
  });
  await upsertUser({
    email: "qa.client@logitec.local",
    fullName: "QA Client",
    role: "CLIENT",
    clientId: aviat.id
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
