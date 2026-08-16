import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../db/prisma.js";
import { requireAuth, requireRole } from "../../middlewares/auth.middleware.js";
import { HttpError } from "../../shared/http-error.js";
import { isClientRole, scopedClientId } from "./client-scope.js";

const clientsRouter = Router();

const clientFieldsSchema = z.object({
  name: z.string().min(1).max(160).optional(),
  legalName: z.string().min(1).max(250).nullable().optional(),
  tradeName: z.string().min(1).max(250).nullable().optional(),
  rfc: z.string().min(1).max(20).nullable().optional(),
  address: z.string().min(1).max(500).nullable().optional(),
  city: z.string().min(1).max(120).nullable().optional(),
  state: z.string().min(1).max(120).nullable().optional(),
  postalCode: z.string().min(1).max(20).nullable().optional(),
  phone: z.string().min(1).max(40).nullable().optional(),
  alternatePhone: z.string().min(1).max(40).nullable().optional(),
  email: z.string().email().max(250).nullable().optional(),
  primaryContact: z.string().min(1).max(160).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  active: z.coerce.boolean().optional()
});

const clientSelect = {
  id: true,
  name: true,
  legalName: true,
  tradeName: true,
  rfc: true,
  address: true,
  city: true,
  state: true,
  postalCode: true,
  phone: true,
  alternatePhone: true,
  email: true,
  primaryContact: true,
  notes: true,
  active: true,
  createdAt: true,
  updatedAt: true
} as const;

const projectClientSelect = {
  id: true,
  name: true,
  legalName: true,
  tradeName: true,
  active: true
} as const;

function optionalText(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed || null;
}

function createClientData(data: z.infer<typeof clientFieldsSchema>) {
  const legalName = optionalText(data.legalName);
  const tradeName = optionalText(data.tradeName);

  return {
    name: optionalText(data.name) || tradeName || legalName || "Cliente sin nombre",
    legalName,
    tradeName,
    rfc: optionalText(data.rfc),
    address: optionalText(data.address),
    city: optionalText(data.city),
    state: optionalText(data.state),
    postalCode: optionalText(data.postalCode),
    phone: optionalText(data.phone),
    alternatePhone: optionalText(data.alternatePhone),
    email: optionalText(data.email)?.toLowerCase() || null,
    primaryContact: optionalText(data.primaryContact),
    notes: optionalText(data.notes)
  };
}

function updateClientData(data: z.infer<typeof clientFieldsSchema>) {
  const update: Record<string, string | null> = {};
  const fields = [
    "legalName",
    "tradeName",
    "rfc",
    "address",
    "city",
    "state",
    "postalCode",
    "phone",
    "alternatePhone",
    "primaryContact",
    "notes"
  ] as const;

  for (const field of fields) {
    if (data[field] !== undefined) {
      update[field] = optionalText(data[field]);
    }
  }
  if (data.email !== undefined) {
    update.email = optionalText(data.email)?.toLowerCase() || null;
  }
  if (data.name !== undefined) {
    update.name = optionalText(data.name) || "Cliente sin nombre";
  }
  return update;
}

clientsRouter.use(requireAuth);

clientsRouter.get("/", async (req, res) => {
  const clients = await prisma.client.findMany({
    where: isClientRole(req.auth!) ? { id: scopedClientId(req.auth!) } : {},
    orderBy: [{ active: "desc" }, { name: "asc" }],
    take: 200,
    select: {
      ...clientSelect,
      _count: { select: { projects: true } }
    }
  });
  res.json(clients);
});

clientsRouter.post("/", requireRole(["ADMIN"]), async (req, res) => {
  const data = clientFieldsSchema.parse(req.body);
  const client = await prisma.client.create({
    data: { ...createClientData(data), active: data.active ?? true },
    select: clientSelect
  });
  res.status(201).json(client);
});

clientsRouter.get("/:id", async (req, res) => {
  const id = z.string().min(1).parse(req.params.id);
  if (isClientRole(req.auth!) && id !== scopedClientId(req.auth!)) {
    throw new HttpError(403, "No autorizado para consultar otro cliente.");
  }
  const client = await prisma.client.findUnique({
    where: { id },
    select: {
      ...clientSelect,
      projects: {
        orderBy: { createdAt: "desc" },
        select: { id: true, code: true, name: true, active: true, createdAt: true }
      }
    }
  });
  if (!client) {
    throw new HttpError(404, "Cliente no encontrado.");
  }
  res.json(client);
});

clientsRouter.get("/:id/projects", async (req, res) => {
  const clientId = z.string().min(1).parse(req.params.id);
  if (isClientRole(req.auth!) && clientId !== scopedClientId(req.auth!)) {
    throw new HttpError(403, "No autorizado para consultar proyectos de otro cliente.");
  }
  const client = await prisma.client.findUnique({ where: { id: clientId }, select: { id: true } });
  if (!client) {
    throw new HttpError(404, "Cliente no encontrado.");
  }
  const projects = await prisma.customer.findMany({
    where: { clientId },
    orderBy: { createdAt: "desc" },
    include: { client: { select: projectClientSelect } }
  });
  res.json(projects);
});

clientsRouter.put("/:id", requireRole(["ADMIN"]), async (req, res) => {
  const id = z.string().min(1).parse(req.params.id);
  const data = clientFieldsSchema.parse(req.body);
  const existing = await prisma.client.findUnique({ where: { id }, select: { active: true } });
  if (!existing) {
    throw new HttpError(404, "Cliente no encontrado.");
  }
  const client = await prisma.client.update({
    where: { id },
    data: {
      ...updateClientData(data),
      active: data.active ?? existing.active
    },
    select: clientSelect
  });
  res.json(client);
});

clientsRouter.patch("/:id/active", requireRole(["ADMIN"]), async (req, res) => {
  const id = z.string().min(1).parse(req.params.id);
  const { active } = z.object({ active: z.coerce.boolean() }).parse(req.body);
  const existing = await prisma.client.findUnique({ where: { id }, select: { id: true } });
  if (!existing) {
    throw new HttpError(404, "Cliente no encontrado.");
  }
  const client = await prisma.client.update({
    where: { id },
    data: { active },
    select: clientSelect
  });
  res.json(client);
});

export { clientsRouter };
