import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../db/prisma.js";
import { requireAuth, requireRole } from "../../middlewares/auth.middleware.js";
import { HttpError } from "../../shared/http-error.js";

const catalogRouter = Router();

const createProductSchema = z.object({
  customerCode: z.string().min(1).max(60).optional(),
  sku: z.string().min(1).max(80),
  barcode: z.string().min(1).max(120).optional(),
  name: z.string().min(1).max(160),
  description: z.string().max(500).optional(),
  unit: z.string().min(1).max(20).default("EA"),
  serialControlled: z.coerce.boolean().default(false),
  lotControlled: z.coerce.boolean().default(false),
  warehouse: z.string().min(1).max(80).default("TULTITLAN24")
});

const createCustomerSchema = z.object({
  code: z.string().min(1).max(60),
  name: z.string().min(1).max(160),
  active: z.coerce.boolean().default(true)
});

const catalogImportSchema = z.object({
  csv: z.string().min(1),
  mode: z.enum(["preview", "apply"]).default("preview")
});

catalogRouter.use(requireAuth);

catalogRouter.get("/products", async (_req, res) => {
  const products = await prisma.product.findMany({
    orderBy: { createdAt: "desc" },
    take: 400,
    include: {
      customer: {
        select: { code: true, name: true }
      }
    }
  });
  res.json(products);
});

catalogRouter.post("/products", requireRole(["ADMIN"]), async (req, res) => {
  const data = createProductSchema.parse(req.body);
  let customerId: string | null = null;
  if (data.customerCode?.trim()) {
    const customer = await prisma.customer.findUnique({
      where: { code: data.customerCode.trim().toUpperCase() }
    });
    if (!customer) {
      throw new HttpError(400, `Customer no existe: ${data.customerCode}`);
    }
    customerId = customer.id;
  }
  const product = await prisma.product.create({
    data: {
      customerId,
      sku: data.sku.trim(),
      barcode: data.barcode?.trim() || null,
      name: data.name.trim(),
      description: data.description?.trim() || null,
      unit: data.unit.trim(),
      serialControlled: data.serialControlled,
      lotControlled: data.lotControlled,
      warehouse: data.warehouse.trim()
    }
  });
  res.status(201).json(product);
});

catalogRouter.get("/customers", async (_req, res) => {
  const customers = await prisma.customer.findMany({
    orderBy: { createdAt: "desc" },
    take: 200
  });
  res.json(customers);
});

catalogRouter.post("/customers", requireRole(["ADMIN"]), async (req, res) => {
  const data = createCustomerSchema.parse(req.body);
  const customer = await prisma.customer.create({
    data: {
      code: data.code.trim().toUpperCase(),
      name: data.name.trim(),
      active: data.active
    }
  });
  res.status(201).json(customer);
});

// Legacy compatibility for current UI label "clientes"
catalogRouter.get("/clients", async (_req, res) => {
  const customers = await prisma.customer.findMany({
    orderBy: { createdAt: "desc" },
    take: 200
  });
  res.json(customers.map((c) => ({ id: c.id, name: c.name, email: null, active: c.active })));
});

catalogRouter.post("/import/products", requireRole(["ADMIN"]), async (req, res) => {
  const { csv, mode } = catalogImportSchema.parse(req.body);

  const lines = csv
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length < 2) {
    throw new HttpError(400, "CSV debe incluir encabezado y al menos una fila.");
  }

  const header = lines[0].split(",").map((h) => h.trim().toLowerCase());
  const idxCustomer = header.findIndex((h) => h === "customer" || h === "cliente" || h === "customer_code");
  const idxSku = header.findIndex((h) => h === "sku" || h === "material number" || h === "material_number");
  const idxBarcode = header.findIndex((h) => h === "barcode" || h === "ean");
  const idxName = header.findIndex(
    (h) => h === "name" || h === "material description" || h === "material_description" || h === "descripcion"
  );
  const idxUnit = header.findIndex((h) => h === "unit" || h === "unidad");
  const idxSerial = header.findIndex((h) => h === "serialcontrolled" || h === "serial_controlled" || h === "serial");
  const idxLot = header.findIndex((h) => h === "lotcontrolled" || h === "lot_controlled" || h === "lote");
  const idxActive = header.findIndex((h) => h === "active" || h === "activo");

  if (idxCustomer < 0 || idxSku < 0 || idxName < 0) {
    throw new HttpError(400, "CSV catálogo requiere customer, sku y name/description.");
  }

  const preview: Array<{ sku: string; action: "CREATE" | "UPDATE" | "SKIP"; reason?: string }> = [];
  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (let i = 1; i < lines.length; i += 1) {
    const cols = lines[i].split(",").map((c) => c.trim());
    const customerCode = cols[idxCustomer]?.toUpperCase();
    const sku = cols[idxSku];
    const name = cols[idxName];
    if (!customerCode || !sku || !name) {
      preview.push({ sku: sku || `row-${i + 1}`, action: "SKIP", reason: "customer/sku/name vacios" });
      skipped += 1;
      continue;
    }

    const customer = await prisma.customer.findUnique({ where: { code: customerCode } });
    if (!customer) {
      preview.push({ sku, action: "SKIP", reason: `customer no existe: ${customerCode}` });
      skipped += 1;
      continue;
    }

    const current = await prisma.product.findUnique({ where: { sku } });
    const payload = {
      customerId: customer.id,
      barcode: idxBarcode >= 0 ? cols[idxBarcode] || null : null,
      name,
      description: name,
      unit: idxUnit >= 0 && cols[idxUnit] ? cols[idxUnit] : "EA",
      serialControlled:
        idxSerial >= 0 ? ["1", "true", "si", "yes"].includes((cols[idxSerial] || "").toLowerCase()) : false,
      lotControlled: idxLot >= 0 ? ["1", "true", "si", "yes"].includes((cols[idxLot] || "").toLowerCase()) : false,
      active: idxActive >= 0 ? !["0", "false", "no"].includes((cols[idxActive] || "").toLowerCase()) : true
    };

    if (!current) {
      preview.push({ sku, action: "CREATE" });
      if (mode === "apply") {
        await prisma.product.create({
          data: {
            sku,
            warehouse: "TULTITLAN24",
            ...payload
          }
        });
        created += 1;
      }
      continue;
    }

    preview.push({ sku, action: "UPDATE" });
    if (mode === "apply") {
      await prisma.product.update({
        where: { sku },
        data: payload
      });
      updated += 1;
    }
  }

  res.json({
    mode,
    created,
    updated,
    skipped,
    preview
  });
});

export { catalogRouter };
