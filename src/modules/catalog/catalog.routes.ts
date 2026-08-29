import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../db/prisma.js";
import { requireAuth, requireRole } from "../../middlewares/auth.middleware.js";
import { logClientActivity } from "../activity/activity-log.service.js";
import { HttpError } from "../../shared/http-error.js";
import { clientCustomerWhere, clientInventoryWhere, clientProductWhere, isClientRole, requireOperationalClient } from "../clients/client-scope.js";
import {
  MASTER_DEACTIVATE_CODES,
  createProjectRecord,
  setProjectActive,
  updateProjectRecord
} from "../master-data/master-data.service.js";
import { getSkuContext, searchSkuProducts } from "./sku-search.service.js";
import { isForbiddenInventoryProjectRecord } from "../inventory/inventory-project-rules.js";
import { ensureCanonicalProductProject } from "../inventory/inventory-assignment.js";
import { canExposeEconomicValuation } from "../inventory/inventory-economic-access.js";
import {
  calculateInventoryValuation,
  summarizeStockAssignments
} from "../inventory/inventory-valuation.service.js";

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
  active: z.coerce.boolean().default(true),
  clientId: z.string().min(1),
  tradeName: z.string().max(250).nullable().optional(),
  legalName: z.string().max(250).nullable().optional(),
  rfc: z.string().max(20).nullable().optional(),
  address: z.string().max(500).nullable().optional(),
  phone: z.string().max(40).nullable().optional(),
  email: z.string().email().max(250).nullable().optional(),
  primaryContact: z.string().max(160).nullable().optional(),
  contactTitle: z.string().max(160).nullable().optional(),
  contactPhone: z.string().max(40).nullable().optional(),
  contactEmail: z.string().email().max(250).nullable().optional(),
  notes: z.string().max(2000).nullable().optional()
});

const updateCustomerSchema = createCustomerSchema.partial();

const projectClientSelect = {
  id: true,
  code: true,
  name: true,
  legalName: true,
  tradeName: true,
  rfc: true,
  address: true,
  phone: true,
  email: true,
  primaryContact: true,
  contactTitle: true,
  contactPhone: true,
  contactEmail: true,
  active: true
} as const;

const catalogImportSchema = z.object({
  csv: z.string().min(1),
  mode: z.enum(["preview", "apply"]).default("preview"),
  autoCreateCustomers: z.coerce.boolean().default(false),
  clientId: z.string().min(1).optional()
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

function resolveCustomerCode(customerInput: string): string {
  const trimmed = customerInput.trim();
  if (!trimmed) return "";
  if (/^[A-Z0-9_]{1,60}$/i.test(trimmed)) return trimmed.toUpperCase();
  return normalizeCustomerCode(trimmed);
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
catalogRouter.use(requireOperationalClient);

catalogRouter.get("/products/search", async (req, res) => {
  const query = z.string().trim().min(1).max(160).parse(req.query.q);
  const limit = z.coerce.number().int().min(1).max(50).optional().parse(req.query.limit) ?? 30;
  res.json(await searchSkuProducts(query, req.auth!, limit));
});

catalogRouter.get("/products/:id/context", async (req, res) => {
  const id = z.string().min(1).parse(req.params.id);
  res.json(await getSkuContext(id, req.auth!));
});

catalogRouter.get("/products", async (req, res) => {
  const products = await prisma.product.findMany({
    where: clientProductWhere(req.auth!),
    orderBy: { createdAt: "desc" },
    take: 400,
    include: {
      productProjects: {
        where: { active: true },
        select: {
          projectId: true,
          project: { select: { id: true, code: true, name: true } }
        }
      }
    }
  });
  const productIds = products.map((product) => product.id);
  const inventories = productIds.length
    ? await prisma.inventory.findMany({
        where: {
          AND: [clientInventoryWhere(req.auth!), { productId: { in: productIds }, qty: { gt: 0 } }]
        },
        select: {
          productId: true,
          assignmentType: true,
          qty: true,
          project: { select: { id: true, code: true, name: true } },
          layers: {
            where: { qty: { gt: 0 } },
            select: { qty: true, reservedQty: true, unitPriceMxn: true, unitPriceUsd: true }
          }
        }
      })
    : [];
  const byProduct = new Map<string, typeof inventories>();
  for (const inventory of inventories) {
    const current = byProduct.get(inventory.productId) || [];
    current.push(inventory);
    byProduct.set(inventory.productId, current);
  }
  const exposeEconomic = canExposeEconomicValuation(req.auth!.role);
  res.json(
    products.map((product) => {
      const stockRows = byProduct.get(product.id) || [];
      const stockAssignments = summarizeStockAssignments(stockRows);
      const valuation = exposeEconomic
        ? calculateInventoryValuation(stockRows.flatMap((row) => row.layers))
        : undefined;
      return {
        ...product,
        stockAssignments,
        ...(valuation ? { valuation } : {})
      };
    })
  );
});

catalogRouter.post("/products", requireRole(["ADMIN"]), async (req, res) => {
  const data = createProductSchema.parse(req.body);
  let customerId: string | null = null;
  if (data.customerCode?.trim()) {
    const customer = await prisma.customer.findFirst({
      where: { code: data.customerCode.trim().toUpperCase(), clientId: req.auth!.operationalClientId! }
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
  await ensureCanonicalProductProject(prisma, product.id, product.customerId);
  await logClientActivity({
    type: "PRODUCT_CREATE",
    subtype: "MANUAL",
    reference: product.sku,
    userId: req.auth!.userId,
    productId: product.id,
    customerId: product.customerId,
    clientId: req.auth!.operationalClientId!,
    warehouse: product.warehouse,
    metadata: { sku: product.sku, barcode: product.barcode }
  });
  res.status(201).json(product);
});

catalogRouter.get("/customers", async (req, res) => {
  const customers = await prisma.customer.findMany({
    where: {
      AND: [clientCustomerWhere(req.auth!), isClientRole(req.auth!) ? { active: true } : {}]
    },
    orderBy: { createdAt: "desc" },
    take: 200,
    include: { client: { select: projectClientSelect } }
  });
  res.json(customers.filter((row) => !isForbiddenInventoryProjectRecord(row)));
});

catalogRouter.post("/customers", requireRole(["ADMIN"]), async (req, res) => {
  const data = createCustomerSchema.parse(req.body);
  const customer = await createProjectRecord(prisma as never, {
    ...data,
    clientId: req.auth!.operationalClientId!
  });
  res.status(201).json(customer);
});

catalogRouter.get("/customers/:id", async (req, res) => {
  const id = z.string().min(1).parse(req.params.id);
  const customer = await prisma.customer.findFirst({
    where: { AND: [{ id }, clientCustomerWhere(req.auth!)] },
    include: { client: { select: projectClientSelect } }
  });
  if (!customer) {
    throw new HttpError(404, "Proyecto no encontrado.");
  }
  res.json({ ...customer, inheritedClient: customer.client });
});

catalogRouter.put("/customers/:id", requireRole(["ADMIN"]), async (req, res) => {
  const id = z.string().min(1).parse(req.params.id);
  const data = updateCustomerSchema.parse(req.body);
  res.json(await updateProjectRecord(prisma as never, id, data));
});

catalogRouter.patch("/customers/:id/active", requireRole(["ADMIN"]), async (req, res) => {
  const id = z.string().min(1).parse(req.params.id);
  const { active } = z.object({ active: z.coerce.boolean() }).parse(req.body);
  res.json(await setProjectActive(prisma as never, id, active));
});

// Legacy compatibility for current UI label "clientes" (Customer = proyecto).
catalogRouter.get("/clients", async (req, res) => {
  const customers = await prisma.customer.findMany({
    where: {
      AND: [clientCustomerWhere(req.auth!), isClientRole(req.auth!) ? { active: true } : {}]
    },
    orderBy: { createdAt: "desc" },
    take: 200
  });
  res.json(
    customers
      .filter((c) => !isForbiddenInventoryProjectRecord(c))
      .map((c) => ({ id: c.id, code: c.code, name: c.name, email: null, active: c.active }))
  );
});

catalogRouter.delete("/customers/:id", requireRole(["ADMIN"]), async (_req, _res) => {
  throw new HttpError(
    409,
    "No se permite el borrado físico de proyectos. Desactívelo si ya no debe usarse en operaciones nuevas.",
    MASTER_DEACTIVATE_CODES.PHYSICAL_DELETE_DISABLED
  );
});

catalogRouter.post("/import/products", requireRole(["ADMIN"]), async (req, res) => {
  const { csv, mode, autoCreateCustomers, clientId: ownerClientId } = catalogImportSchema.parse(req.body);

  const lines = csv
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length < 2) {
    throw new HttpError(400, "CSV debe incluir encabezado y al menos una fila.");
  }

  const header = parseCsvLine(lines[0]).map((h) => h.trim().toLowerCase());
  const idxCustomer = header.findIndex((h) => h === "customer" || h === "cliente" || h === "customer_code");
  const idxCustomerName = header.findIndex(
    (h) => h === "customername" || h === "customer_name" || h === "cliente_nombre"
  );
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
    const customerDisplayName =
      idxCustomerName >= 0 ? (cols[idxCustomerName] || "").trim() : customerInput;
    const customerCode = resolveCustomerCode(customerInput);
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
        where: { name: { equals: customerDisplayName || customerInput, mode: "insensitive" } }
      });
    }
    if (!customer && mode === "apply" && autoCreateCustomers) {
      if (!customerCode || customerCode === "LOGITEC") {
        unknownCustomers.add(customerInput || customerCode || "(vacío)");
        preview.push({ sku, action: "SKIP", reason: "CUSTOMER vacío o reservado; no se crea automáticamente." });
        skipped += 1;
        continue;
      }
      if (!ownerClientId) {
        preview.push({ sku, action: "SKIP", reason: "proyecto nuevo requiere cliente propietario" });
        skipped += 1;
        continue;
      }
      const owner = await prisma.client.findUnique({ where: { id: ownerClientId }, select: { id: true, active: true } });
      if (!owner?.active) {
        preview.push({ sku, action: "SKIP", reason: "cliente propietario no encontrado o inactivo" });
        skipped += 1;
        continue;
      }
      customer = await prisma.customer.create({
        data: {
          code: customerCode,
          name: customerDisplayName || customerInput || customerCode,
          clientId: owner.id,
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
        const createdProduct = await prisma.product.create({
          data: {
            sku,
            warehouse: "TULTITLAN24",
            ...payload
          }
        });
        await ensureCanonicalProductProject(prisma, createdProduct.id, createdProduct.customerId);
        created += 1;
      }
      continue;
    }

    preview.push({ sku, action: "UPDATE" });
    if (mode === "apply") {
      const updatedProduct = await prisma.product.update({
        where: { sku },
        data: payload
      });
      await ensureCanonicalProductProject(prisma, updatedProduct.id, updatedProduct.customerId);
      updated += 1;
    }
  }

  if (mode === "apply") {
    await logClientActivity({
      type: "IMPORT",
      subtype: "CSV_CATALOG",
      reference: "catalog_bulk",
      userId: req.auth!.userId,
      clientId: req.auth!.operationalClientId!,
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
