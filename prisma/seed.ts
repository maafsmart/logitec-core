import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const email = "admin@logitec.local";
  const exists = await prisma.user.findUnique({ where: { email } });
  if (exists) return;

  const passwordHash = await bcrypt.hash("Admin1234", 10);
  await prisma.user.create({
    data: {
      email,
      fullName: "Administrador Logitec",
      passwordHash,
      role: "ADMIN"
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