import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../db/prisma.js";
import { requireAuth, requireRole } from "../../middlewares/auth.middleware.js";
import { logActivity } from "../activity/activity-log.service.js";
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
  mode: z.enum(["preview", "apply"]).default("preview"),
  autoCreateCustomers: z.coerce.boolean().default(false)
});

function parseCsvLine(line: string): string[] {
  const values: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === "," && !inQuotes) {
      values.push(current.trim());
      current = "";
      continue;
    }
    current += ch;
  }
  values.push(current.trim());
  return values;
}

function normalizeCustomerCode(nameOrCode: string): string {
  const raw = nameOrCode.trim().toUpperCase();
  if (!raw) return "";
  if (raw.length <= 12 && /^[A-Z0-9_-]+$/.test(raw)) return raw;
  return raw
    .replace(/[^A-Z0-9 ]+/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 3)
    .map((p) => p.slice(0, 4))
    .join("")
    .slice(0, 20);
}

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
  await logActivity({
    type: "PRODUCT_CREATE",
    subtype: "MANUAL",
    reference: product.sku,
    userId: req.auth!.userId,
    productId: product.id,
    customerId: product.customerId,
    warehouse: product.warehouse,
    metadata: { sku: product.sku, barcode: product.barcode }
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
  res.json(customers.map((c) => ({ id: c.id, code: c.code, name: c.name, email: null, active: c.active })));
});

catalogRouter.delete("/customers/:id", requireRole(["ADMIN"]), async (req, res) => {
  const id = z.string().min(1).parse(req.params.id);
  const customer = await prisma.customer.findUnique({ where: { id } });
  if (!customer) {
    throw new HttpError(404, "Cliente no encontrado.");
  }

  const linkedProducts = await prisma.product.count({
    where: { customerId: id }
  });
  if (linkedProducts > 0) {
    throw new HttpError(
      400,
      `No se puede eliminar cliente ${customer.code}: tiene ${linkedProducts} productos ligados.`
    );
  }

  await prisma.customer.delete({ where: { id } });
  res.json({ message: "Cliente eliminado.", id });
});

catalogRouter.post("/import/products", requireRole(["ADMIN"]), async (req, res) => {
  const { csv, mode, autoCreateCustomers } = catalogImportSchema.parse(req.body);

  const lines = csv
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length < 2) {
    throw new HttpError(400, "CSV debe incluir encabezado y al menos una fila.");
  }

  const header = parseCsvLine(lines[0]).map((h) => h.trim().toLowerCase());
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
  const idxSupplier = header.findIndex((h) => h === "supplier" || h === "proveedor");
  const idxSupplierPo = header.findIndex((h) => h === "supplier po" || h === "supplier_po" || h === "supplierpo");

  if (idxCustomer < 0 || idxSku < 0 || idxName < 0) {
    throw new HttpError(400, "CSV catálogo requiere customer, sku y name/description.");
  }

  const preview: Array<{ sku: string; action: "CREATE" | "UPDATE" | "SKIP"; reason?: string }> = [];
  const unknownCustomers = new Set<string>();
  const detectedSuppliers = new Set<string>();
  const detectedSupplierPo = new Set<string>();
  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (let i = 1; i < lines.length; i += 1) {
    const cols = parseCsvLine(lines[i]);
    const customerInput = (cols[idxCustomer] || "").trim();
    const customerCode = normalizeCustomerCode(customerInput);
    const sku = cols[idxSku];
    const name = cols[idxName];
    if (idxSupplier >= 0 && cols[idxSupplier]?.trim()) detectedSuppliers.add(cols[idxSupplier].trim());
    if (idxSupplierPo >= 0 && cols[idxSupplierPo]?.trim()) detectedSupplierPo.add(cols[idxSupplierPo].trim());
    if (!customerCode || !sku || !name) {
      preview.push({ sku: sku || `row-${i + 1}`, action: "SKIP", reason: "customer/sku/name vacios" });
      skipped += 1;
      continue;
    }

    let customer = await prisma.customer.findUnique({ where: { code: customerCode } });
    if (!customer) {
      customer = await prisma.customer.findFirst({
        where: { name: { equals: customerInput, mode: "insensitive" } }
      });
    }
    if (!customer && mode === "apply" && autoCreateCustomers) {
      customer = await prisma.customer.create({
        data: {
          code: customerCode,
          name: customerInput || customerCode,
          active: true
        }
      });
    }
    if (!customer) {
      unknownCustomers.add(customerInput || customerCode);
      preview.push({ sku, action: "SKIP", reason: `customer no existe: ${customerInput || customerCode}` });
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

  if (mode === "apply") {
    await logActivity({
      type: "IMPORT",
      subtype: "CSV_CATALOG",
      reference: "catalog_bulk",
      userId: req.auth!.userId,
      metadata: {
        created,
        updated,
        skipped,
        autoCreateCustomers,
        unknownCustomers: Array.from(unknownCustomers),
        suppliersSample: Array.from(detectedSuppliers).slice(0, 20),
        supplierPoSample: Array.from(detectedSupplierPo).slice(0, 20)
      }
    });
  }

  res.json({
    mode,
    autoCreateCustomers,
    created,
    updated,
    skipped,
    preview,
    unknownCustomers: Array.from(unknownCustomers),
    suppliersDetected: Array.from(detectedSuppliers).slice(0, 50),
    supplierPoDetected: Array.from(detectedSupplierPo).slice(0, 50)
  });
});

export { catalogRouter };
