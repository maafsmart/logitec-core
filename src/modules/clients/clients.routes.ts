import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../db/prisma.js";
import { requireAuth, requireRole } from "../../middlewares/auth.middleware.js";
import { HttpError } from "../../shared/http-error.js";
import { isClientScopedRole } from "./client-scope.js";
import { createClientRecord, setClientActive, updateClientRecord } from "../master-data/master-data.service.js";
import { isForbiddenInventoryProjectRecord } from "../inventory/inventory-project-rules.js";

const clientsRouter = Router();

const clientFieldsSchema = z.object({
  code: z.string().min(1).max(60).optional(),
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
  contactTitle: z.string().max(160).nullable().optional(),
  contactPhone: z.string().max(40).nullable().optional(),
  contactEmail: z.string().email().max(250).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  active: z.coerce.boolean().optional()
});

const createClientSchema = clientFieldsSchema.extend({
  code: z.string().min(1).max(60),
  name: z.string().min(1).max(160)
});

const clientSelect = {
  id: true,
  code: true,
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
  contactTitle: true,
  contactPhone: true,
  contactEmail: true,
  notes: true,
  active: true,
  createdAt: true,
  updatedAt: true
} as const;

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

clientsRouter.use(requireAuth);

clientsRouter.get("/", async (req, res) => {
  const clients = await prisma.client.findMany({
    where: req.auth!.role === "ADMIN" ? {} : { id: req.auth!.clientId || "" },
    orderBy: [{ active: "desc" }, { name: "asc" }],
    take: 200,
    select: {
      ...clientSelect,
      _count: { select: { projects: true } }
    }
  });
  res.json(clients.filter((row) => !isForbiddenInventoryProjectRecord({ code: row.code, name: row.name })));
});

clientsRouter.post("/", requireRole(["ADMIN"]), async (req, res) => {
  const data = createClientSchema.parse(req.body);
  const created = await createClientRecord(prisma as never, data);
  const client = await prisma.client.findUnique({
    where: { id: created.id },
    select: {
      ...clientSelect,
      projects: {
        orderBy: { createdAt: "desc" },
        select: { id: true, code: true, name: true, active: true, createdAt: true }
      }
    }
  });
  res.status(201).json(client);
});

clientsRouter.get("/:id", async (req, res) => {
  const id = z.string().min(1).parse(req.params.id);
  if (isClientScopedRole(req.auth!.role) && id !== req.auth!.clientId) {
    throw new HttpError(404, "Cliente no encontrado.");
  }
  const client = await prisma.client.findUnique({
    where: { id },
    select: {
      ...clientSelect,
      projects: {
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          code: true,
          name: true,
          tradeName: true,
          legalName: true,
          active: true,
          createdAt: true
        }
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
  if (isClientScopedRole(req.auth!.role) && clientId !== req.auth!.clientId) {
    throw new HttpError(404, "Cliente no encontrado.");
  }
  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: projectClientSelect
  });
  if (!client) {
    throw new HttpError(404, "Cliente no encontrado.");
  }
  const projects = await prisma.customer.findMany({
    where: { clientId },
    orderBy: { createdAt: "desc" },
    include: { client: { select: projectClientSelect } }
  });
  res.json(projects.map((project) => ({ ...project, inheritedClient: client })));
});

clientsRouter.put("/:id", requireRole(["ADMIN"]), async (req, res) => {
  const id = z.string().min(1).parse(req.params.id);
  const data = clientFieldsSchema.parse(req.body);
  const updated = await updateClientRecord(prisma as never, id, data);
  const client = await prisma.client.findUnique({ where: { id: updated.id }, select: clientSelect });
  res.json(client);
});

clientsRouter.patch("/:id/active", requireRole(["ADMIN"]), async (req, res) => {
  const id = z.string().min(1).parse(req.params.id);
  const { active } = z.object({ active: z.coerce.boolean() }).parse(req.body);
  const updated = await setClientActive(prisma as never, id, active);
  const client = await prisma.client.findUnique({ where: { id: updated.id }, select: clientSelect });
  res.json(client);
});

export { clientsRouter };
