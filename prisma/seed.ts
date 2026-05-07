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

  const baseProducts = [
    { sku: "SKU-0001", barcode: "750000000001", name: "Producto Demo 1" },
    { sku: "SKU-0002", barcode: "750000000002", name: "Producto Demo 2" },
    { sku: "SKU-0003", barcode: "750000000003", name: "Producto Demo 3" }
  ];

  for (const product of baseProducts) {
    await prisma.product.upsert({
      where: { sku: product.sku },
      update: {
        barcode: product.barcode,
        name: product.name,
        active: true,
        warehouse: "TULTITLAN24"
      },
      create: {
        sku: product.sku,
        barcode: product.barcode,
        name: product.name,
        warehouse: "TULTITLAN24",
        active: true
      }
    });
  }
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