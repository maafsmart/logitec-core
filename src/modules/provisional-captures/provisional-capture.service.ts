import type { Prisma } from "@prisma/client";
import { UserRole } from "../../middlewares/auth.middleware.js";
import { prisma } from "../../db/prisma.js";
import { HttpError } from "../../shared/http-error.js";
import type { AuthContext } from "../clients/client-scope.js";
import { operationalClientId } from "../clients/client-scope.js";
import {
  isPhysicalFloorAction,
  isProvisionalCaptureStatus,
  type ProvisionalCaptureStatus
} from "./provisional-capture.constants.js";

type ReadingInput = {
  raw?: unknown;
  normalized?: unknown;
  classification?: unknown;
  project?: unknown;
};

const userPublicSelect = {
  id: true,
  fullName: true,
  email: true,
  role: true
} as const;

const captureInclude = {
  createdBy: { select: userPublicSelect },
  reviewer: { select: userPublicSelect },
  project: { select: { id: true, code: true, name: true, tradeName: true } },
  reviews: {
    orderBy: { createdAt: "asc" as const },
    include: { reviewer: { select: userPublicSelect } }
  }
} satisfies Prisma.ProvisionalCaptureInclude;

export type ProvisionalCaptureDto = Prisma.ProvisionalCaptureGetPayload<{ include: typeof captureInclude }>;

function readingClassificationKind(reading: ReadingInput): string | null {
  const cls = String(reading?.classification || "").trim().toUpperCase();
  if (cls.startsWith("UBICACIÓN") || cls.startsWith("UBICACION")) return "UBICACIÓN";
  if (cls.startsWith("SKU")) return "SKU";
  if (cls.startsWith("SAP")) return "SAP";
  if (cls.startsWith("PEDIDO")) return "PEDIDO";
  if (cls.startsWith("PARTIDA")) return "PARTIDA";
  if (cls.startsWith("SERIE")) return "SERIE";
  return null;
}

function normalizedReadingToken(reading: ReadingInput): string {
  return String(reading?.normalized || reading?.raw || "")
    .trim()
    .toUpperCase();
}

function isAuthorizedProjectCode(code: string): boolean {
  const p = String(code || "").trim();
  if (!p) return false;
  if (/^sin proyecto$/i.test(p)) return false;
  if (/^free[_\s-]*to[_\s-]*sale$/i.test(p)) return false;
  return true;
}

async function resolveProjectIdFromReadings(
  clientId: string,
  readings: ReadingInput[]
): Promise<string | null> {
  const projectCodes = new Set<string>();

  for (const reading of readings) {
    const kind = readingClassificationKind(reading);
    if (!kind || kind === "UBICACIÓN") continue;

    const explicitProject = String(reading?.project || "").trim();
    if (explicitProject && isAuthorizedProjectCode(explicitProject)) {
      projectCodes.add(explicitProject);
      continue;
    }

    const norm = normalizedReadingToken(reading);
    if (!norm) continue;

    const inventories = await prisma.inventory.findMany({
      where: { clientId },
      select: {
        project: { select: { id: true, code: true, name: true, active: true } },
        product: { select: { sku: true } }
      },
      take: 5000
    });

    const matches = inventories.filter((row) => {
      const projectCode = String(row.project?.code || row.project?.name || "").trim();
      if (!row.project?.active || !isAuthorizedProjectCode(projectCode)) return false;
      switch (kind) {
        case "SKU":
          return String(row.product?.sku || "").toUpperCase() === norm;
        default:
          return false;
      }
    });

    const codes = new Set(
      matches.map((row) => String(row.project?.code || row.project?.name || "").trim()).filter(Boolean)
    );
    if (codes.size !== 1) continue;
    projectCodes.add([...codes][0]);
  }

  if (projectCodes.size !== 1) return null;

  const code = [...projectCodes][0];
  const project = await prisma.customer.findFirst({
    where: { clientId, active: true, OR: [{ code }, { name: code }] },
    select: { id: true }
  });
  return project?.id ?? null;
}

export function reviewTypeForStatusChange(input: {
  executorId: string;
  reviewerId: string;
  reviewerRole: UserRole | string;
  nextStatus: ProvisionalCaptureStatus;
}): string | null {
  const isSelf = input.executorId === input.reviewerId;
  const prefix = input.reviewerRole === "ADMIN" ? "Administrador" : "Supervisor";
  if (input.nextStatus === "VALIDADO · PENDIENTE DE REGISTRO") {
    return isSelf ? `Autovalidación de ${prefix}` : `Validación de ${prefix}`;
  }
  if (input.nextStatus === "REQUIERE ACLARACIÓN") {
    return `Revisión de ${prefix} · requiere aclaración`;
  }
  if (input.nextStatus === "RECHAZADO ADMINISTRATIVAMENTE") {
    return `Rechazo administrativo de ${prefix}`;
  }
  if (input.nextStatus === "PENDIENTE DE SUPERVISIÓN") {
    return `Reapertura administrativa de ${prefix}`;
  }
  return null;
}

function assertCanCreateCapture(auth: AuthContext, declaredActionId: string, executorOperatorMode: boolean) {
  if (auth.role === "CLIENT") {
    throw new HttpError(403, "Los usuarios CLIENT no pueden crear capturas provisionales.");
  }
  if (auth.role === "ADMIN" && !isPhysicalFloorAction(declaredActionId)) {
    throw new HttpError(403, "El administrador solo puede registrar acciones físicas de piso.");
  }
  if (auth.role === "SUPERVISOR" && !executorOperatorMode && !isPhysicalFloorAction(declaredActionId)) {
    throw new HttpError(403, "El supervisor solo puede registrar acciones físicas de piso fuera de modo operador.");
  }
}

function assertCanValidateNow(auth: AuthContext, declaredActionId: string, executorOperatorMode: boolean) {
  if (auth.role !== "ADMIN" && auth.role !== "SUPERVISOR") {
    throw new HttpError(403, "Solo SUPERVISOR o ADMIN pueden validar inmediatamente.");
  }
  if (executorOperatorMode) {
    throw new HttpError(403, "No se puede validar inmediatamente en modo operador.");
  }
  if (!isPhysicalFloorAction(declaredActionId)) {
    throw new HttpError(403, "Solo acciones físicas de piso pueden validarse inmediatamente.");
  }
}

async function loadCaptureForAuth(auth: AuthContext, id: string): Promise<ProvisionalCaptureDto> {
  const clientId = operationalClientId(auth);
  const capture = await prisma.provisionalCapture.findFirst({
    where: { id, clientId },
    include: captureInclude
  });
  if (!capture) {
    throw new HttpError(404, "Captura provisional no encontrada.");
  }
  if (auth.role === "CLIENT") {
    if (!capture.projectId || !capture.project) {
      throw new HttpError(404, "Captura provisional no encontrada.");
    }
  }
  return capture;
}

export async function createProvisionalCapture(
  auth: AuthContext,
  input: {
    declaredActionId: string;
    observation?: string | null;
    readings: ReadingInput[];
    physicalStartedAt: Date;
    physicalEndedAt: Date;
    validateNow?: boolean;
    executorOperatorMode?: boolean;
    device?: string | null;
  }
): Promise<ProvisionalCaptureDto> {
  if (auth.role === "CLIENT") {
    throw new HttpError(403, "Los usuarios CLIENT no pueden crear capturas provisionales.");
  }
  if (!input.readings.length) {
    throw new HttpError(400, "Se requiere al menos una lectura.");
  }

  const executorOperatorMode = Boolean(input.executorOperatorMode);
  assertCanCreateCapture(auth, input.declaredActionId, executorOperatorMode);

  const validateNow = Boolean(input.validateNow);
  if (validateNow) {
    assertCanValidateNow(auth, input.declaredActionId, executorOperatorMode);
  }

  const clientId = operationalClientId(auth);
  const createdById = auth.userId!;
  const projectId = await resolveProjectIdFromReadings(clientId, input.readings);
  const initialStatus: ProvisionalCaptureStatus = validateNow
    ? "VALIDADO · PENDIENTE DE REGISTRO"
    : "PENDIENTE DE SUPERVISIÓN";

  return prisma.$transaction(async (tx) => {
    const capture = await tx.provisionalCapture.create({
      data: {
        clientId,
        createdById,
        declaredActionId: input.declaredActionId,
        status: initialStatus,
        observation: input.observation?.trim() || null,
        readings: input.readings as Prisma.InputJsonValue,
        physicalStartedAt: input.physicalStartedAt,
        physicalEndedAt: input.physicalEndedAt,
        executorOperatorMode,
        device: input.device?.trim() || null,
        projectId,
        reviewerId: validateNow ? createdById : null,
        reviewType: validateNow
          ? reviewTypeForStatusChange({
              executorId: createdById,
              reviewerId: createdById,
              reviewerRole: auth.role,
              nextStatus: initialStatus
            })
          : null,
        adminUpdatedAt: validateNow ? new Date() : null
      },
      include: captureInclude
    });

    if (validateNow) {
      const reviewType = reviewTypeForStatusChange({
        executorId: createdById,
        reviewerId: createdById,
        reviewerRole: auth.role,
        nextStatus: initialStatus
      });
      if (!reviewType) {
        throw new HttpError(400, "No se pudo registrar la validación inicial.");
      }
      await tx.provisionalCaptureReview.create({
        data: {
          captureId: capture.id,
          reviewerId: createdById,
          reviewerRole: auth.role,
          reviewType,
          status: initialStatus
        }
      });
    }

    return tx.provisionalCapture.findUniqueOrThrow({
      where: { id: capture.id },
      include: captureInclude
    });
  });
}

export async function listProvisionalCaptures(
  auth: AuthContext,
  query: { status?: string; mine?: boolean }
): Promise<ProvisionalCaptureDto[]> {
  const clientId = operationalClientId(auth);
  const where: Prisma.ProvisionalCaptureWhereInput = { clientId };

  if (query.status) {
    if (!isProvisionalCaptureStatus(query.status)) {
      throw new HttpError(400, "Estado de captura no válido.");
    }
    where.status = query.status;
  }

  if (auth.role === "OPERATOR" || (query.mine && auth.role !== "CLIENT")) {
    where.createdById = auth.userId;
  }

  if (auth.role === "CLIENT") {
    where.projectId = { not: null };
    where.project = { clientId, active: true };
  }

  return prisma.provisionalCapture.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 100,
    include: captureInclude
  });
}

export async function getProvisionalCapture(auth: AuthContext, id: string): Promise<ProvisionalCaptureDto> {
  return loadCaptureForAuth(auth, id);
}

export async function reviewProvisionalCapture(
  auth: AuthContext,
  id: string,
  nextStatus: string
): Promise<{ capture: ProvisionalCaptureDto; reviewEvent: ProvisionalCaptureDto["reviews"][number] }> {
  if (auth.role === "CLIENT" || auth.role === "OPERATOR") {
    throw new HttpError(403, "No autorizado para revisar capturas provisionales.");
  }
  if (!isProvisionalCaptureStatus(nextStatus)) {
    throw new HttpError(400, "Estado de captura no válido.");
  }

  const clientId = operationalClientId(auth);
  const reviewerId = auth.userId!;

  return prisma.$transaction(async (tx) => {
    const existing = await tx.provisionalCapture.findFirst({
      where: { id, clientId },
      select: { id: true, status: true, createdById: true }
    });
    if (!existing) {
      throw new HttpError(404, "Captura provisional no encontrada.");
    }
    if (existing.status === nextStatus) {
      throw new HttpError(409, "La captura ya tiene ese estado.");
    }

    const reviewType = reviewTypeForStatusChange({
      executorId: existing.createdById,
      reviewerId,
      reviewerRole: auth.role,
      nextStatus
    });
    if (!reviewType) {
      throw new HttpError(400, "Transición de estado no permitida.");
    }

    const now = new Date();
    const reviewEvent = await tx.provisionalCaptureReview.create({
      data: {
        captureId: existing.id,
        reviewerId,
        reviewerRole: auth.role,
        reviewType,
        status: nextStatus
      },
      include: { reviewer: { select: userPublicSelect } }
    });

    const capture = await tx.provisionalCapture.update({
      where: { id: existing.id },
      data: {
        status: nextStatus,
        reviewerId,
        reviewType,
        adminUpdatedAt: now
      },
      include: captureInclude
    });

    return { capture, reviewEvent };
  });
}
