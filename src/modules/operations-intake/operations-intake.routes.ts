import { Router, type NextFunction, type Request, type Response } from "express";
import multer from "multer";
import { z } from "zod";
import {
  isHugoOperationsFormEnabled,
  operationsIntakeStorageRoot
} from "./operations-intake.feature.js";
import {
  OPERATIONS_INTAKE_PROJECTS,
  OPERATIONS_INTAKE_SECTIONS,
  sectionTitleMap
} from "./operations-intake.schema.js";
import {
  addAttachment,
  createIntakeSession,
  readSession,
  saveSection,
  sessionToMarkdown,
  type SectionStatus
} from "./operations-intake.store.js";
import { prisma } from "../../db/prisma.js";

const operationsIntakeRouter = Router();

const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "application/pdf",
  "text/plain",
  "text/csv",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel"
]);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024, files: 1 }
});

function gate(_req: Request, res: Response, next: NextFunction) {
  if (!isHugoOperationsFormEnabled()) {
    res.status(404).json({ message: "Not Found" });
    return;
  }
  next();
}

operationsIntakeRouter.use(gate);
operationsIntakeRouter.use((_req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Pragma", "no-cache");
  next();
});

const sectionPayloadSchema = z.object({
  action: z.enum(["save", "confirm", "pending"]),
  respondents: z.record(z.unknown()).default({}),
  answers: z.record(z.unknown()).default({}),
  comments: z.record(z.string().max(2000)).default({}),
  flags: z.record(z.array(z.string().max(120)).max(5)).default({})
});

async function listProjects() {
  try {
    const aviatClient = await prisma.client.findFirst({
      where: {
        active: true,
        OR: [
          { code: { equals: "AVIAT", mode: "insensitive" } },
          { name: { equals: "AVIAT", mode: "insensitive" } }
        ]
      },
      select: { id: true }
    });
    if (!aviatClient) return OPERATIONS_INTAKE_PROJECTS;
    const projects = await prisma.customer.findMany({
      where: { clientId: aviatClient.id, active: true },
      select: { code: true, name: true, tradeName: true },
      orderBy: { code: "asc" }
    });
    const mapped = projects
      .filter((project) => !/FREE_TO_SALE/i.test(project.code))
      .map((project) => ({
        code: project.code,
        name: project.tradeName || project.name
      }));
    return mapped.length ? mapped : OPERATIONS_INTAKE_PROJECTS;
  } catch {
    return OPERATIONS_INTAKE_PROJECTS;
  }
}

const PROJECT_LOOKUP_TIMEOUT_MS = 5000;

async function listProjectsWithTimeout() {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  try {
    const projects = await Promise.race([
      listProjects(),
      new Promise<typeof OPERATIONS_INTAKE_PROJECTS>((resolve) => {
        timeoutId = setTimeout(() => resolve(OPERATIONS_INTAKE_PROJECTS), PROJECT_LOOKUP_TIMEOUT_MS);
      })
    ]);
    return projects;
  } catch {
    return OPERATIONS_INTAKE_PROJECTS;
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

const SESSION_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function logIntake(req: Request, event: string, detail: Record<string, unknown> = {}) {
  console.info("[operations-intake]", event, {
    ip: req.ip || req.socket.remoteAddress,
    userAgent: req.get("user-agent") || "",
    ...detail
  });
}

operationsIntakeRouter.get("/bootstrap", async (req, res) => {
  const started = Date.now();
  const projects = await listProjectsWithTimeout();
  logIntake(req, "bootstrap-ok", { ms: Date.now() - started, projectCount: projects.length });
  res.json({
    ok: true,
    qaOnly: true,
    sections: OPERATIONS_INTAKE_SECTIONS,
    projects,
    storageRootConfigured: Boolean(operationsIntakeStorageRoot())
  });
});

operationsIntakeRouter.post("/sessions", async (req, res) => {
  const started = Date.now();
  const session = await createIntakeSession(operationsIntakeStorageRoot());
  logIntake(req, "session-create", { ms: Date.now() - started, sessionId: session.sessionId });
  res.status(201).json({ ok: true, qaOnly: true, session });
});

operationsIntakeRouter.get("/sessions/:sessionId", async (req, res) => {
  const sessionId = req.params.sessionId;
  if (!SESSION_ID_PATTERN.test(sessionId)) {
    logIntake(req, "session-get-invalid-id", { sessionId });
    res.status(404).json({ message: "Sesión no encontrada" });
    return;
  }
  const started = Date.now();
  const session = await readSession(operationsIntakeStorageRoot(), sessionId);
  if (!session) {
    logIntake(req, "session-get-miss", { sessionId, ms: Date.now() - started });
    res.status(404).json({ message: "Sesión no encontrada" });
    return;
  }
  logIntake(req, "session-get-hit", { sessionId, ms: Date.now() - started });
  res.json({ ok: true, qaOnly: true, session });
});

operationsIntakeRouter.put("/sessions/:sessionId/sections/:sectionId", async (req, res) => {
  const body = sectionPayloadSchema.parse(req.body ?? {});
  const status: SectionStatus =
    body.action === "confirm" ? "confirmed" : body.action === "pending" ? "pending" : "draft";
  const eventType =
    body.action === "confirm"
      ? "FORM_SECTION_CONFIRMED"
      : body.action === "pending"
        ? "FORM_SECTION_PENDING"
        : "FORM_SECTION_SAVED";
  const session = await saveSection(
    operationsIntakeStorageRoot(),
    req.params.sessionId,
    req.params.sectionId,
    {
      status,
      respondents: body.respondents,
      answers: body.answers,
      comments: body.comments,
      flags: body.flags
    },
    eventType
  );
  res.json({ ok: true, qaOnly: true, event: eventType, session });
});

operationsIntakeRouter.post(
  "/sessions/:sessionId/sections/:sectionId/attachments",
  upload.single("file"),
  async (req, res) => {
    const fieldId = String(req.body?.fieldId || "section").slice(0, 80);
    const file = req.file;
    if (!file) {
      res.status(400).json({ message: "Archivo requerido" });
      return;
    }
    if (!ALLOWED_MIME.has(file.mimetype)) {
      res.status(415).json({ message: "Tipo de archivo no permitido" });
      return;
    }
    const attachment = await addAttachment(operationsIntakeStorageRoot(), req.params.sessionId, req.params.sectionId, fieldId, {
      originalName: file.originalname.slice(0, 180),
      mimeType: file.mimetype,
      buffer: file.buffer
    });
    res.status(201).json({ ok: true, qaOnly: true, attachment });
  }
);

operationsIntakeRouter.get("/sessions/:sessionId/export.json", async (req, res) => {
  const session = await readSession(operationsIntakeStorageRoot(), req.params.sessionId);
  if (!session) {
    res.status(404).json({ message: "Sesión no encontrada" });
    return;
  }
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="hugo-operations-${session.sessionId}.json"`);
  res.send(JSON.stringify(session, null, 2));
});

operationsIntakeRouter.get("/sessions/:sessionId/export.md", async (req, res) => {
  const session = await readSession(operationsIntakeStorageRoot(), req.params.sessionId);
  if (!session) {
    res.status(404).json({ message: "Sesión no encontrada" });
    return;
  }
  const markdown = sessionToMarkdown(session, sectionTitleMap());
  res.setHeader("Content-Type", "text/markdown; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="hugo-operations-${session.sessionId}.md"`);
  res.send(markdown);
});

export { operationsIntakeRouter, isHugoOperationsFormEnabled };
