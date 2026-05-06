import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  if (process.env.NODE_ENV === "production") {
    return;
  }

  const email = "admin@logitec.local";
  const passwordHash = await bcrypt.hash("Admin1234", 10);
  await prisma.user.upsert({
    where: { email },
    update: {
      fullName: "Administrador Logitec",
      passwordHash,
      role: "ADMIN",
      isActive: true
    },
    create: {
      email,
      fullName: "Administrador Logitec",
      passwordHash,
      role: "ADMIN",
      isActive: true
    }
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