import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../db/prisma.js";
import { requireAuth, requireRole } from "../../middlewares/auth.middleware.js";
import { HttpError } from "../../shared/http-error.js";
import {
  assertAccessibleInventory,
  assertAccessibleLayer,
  assertAccessibleRequisition,
  clientRequisitionWhere,
  operationalClientId,
  requireOperationalClient
} from "../clients/client-scope.js";
import {
  RequisitionError,
  addRequisitionLine,
  approveRequisition,
  cancelRequisition,
  createRequisition,
  getRequisition,
  listRequisitions,
  releaseReservation,
  reserveLine,
  submitRequisition
} from "./requisition.service.js";

const requisitionsRouter = Router();

requisitionsRouter.use(requireAuth);
requisitionsRouter.use(requireOperationalClient);

async function loadAccessibleRequisition(req: import("express").Request, id: string) {
  const requisition = await getRequisition(id);
  await assertAccessibleRequisition(req.auth!, requisition);
  return requisition;
}

function mapError(res: import("express").Response, error: unknown) {
  if (error instanceof RequisitionError) {
    const status =
      error.code === "PROJECT_NOT_FOUND"
        ? 404
        : [
              "AMBIGUOUS_STOCK",
              "AMBIGUOUS_LAYER",
              "INSUFFICIENT_FREE",
              "OVER_LINE_RESERVE",
              "INSUFFICIENT_RESERVATION",
              "NO_STOCK",
              "RESERVATION_PROJECT_MISMATCH",
              "PICK_PROJECT_MISMATCH",
              "LINE_MISMATCH",
              "LAYER_ALLOCATION_CONFLICT",
              "INVALID_ALLOCATION_MODE",
              "PROJECT_NOT_AVAILABLE"
            ].includes(error.code)
          ? 409
          : 400;
    res.status(status).json({ code: error.code, message: error.message, details: error.details });
    return true;
  }
  if (error instanceof HttpError) {
    res.status(error.statusCode).json({ message: error.message });
    return true;
  }
  return false;
}

requisitionsRouter.get("/", requireRole(["ADMIN", "SUPERVISOR", "OPERATOR", "CLIENT"]), async (req, res) => {
  res.json(await listRequisitions(clientRequisitionWhere(req.auth!)));
});

requisitionsRouter.get("/:id", requireRole(["ADMIN", "SUPERVISOR", "OPERATOR", "CLIENT"]), async (req, res) => {
  const requisition = await getRequisition(z.string().min(1).parse(req.params.id));
  await assertAccessibleRequisition(req.auth!, requisition);
  res.json(requisition);
});

requisitionsRouter.post("/", requireRole(["ADMIN", "SUPERVISOR", "OPERATOR"]), async (req, res) => {
  try {
    const body = z
      .object({
        number: z.string().min(1).max(80),
        projectCode: z.string().min(1).max(80),
        priority: z.union([z.string(), z.number()]).optional(),
        reference: z.string().max(200).optional(),
        notes: z.string().max(2000).optional(),
        lines: z
          .array(
            z.object({
              sku: z.string().min(1).max(80),
              requestedQty: z.coerce.number().positive(),
              lotNumber: z.string().max(120).optional()
            })
          )
          .min(1)
      })
      .parse(req.body);
    const created = await createRequisition({
      ...body,
      userId: req.auth!.userId,
      clientId: operationalClientId(req.auth!)
    });
    res.status(201).json(created);
  } catch (error) {
    if (mapError(res, error)) return;
    throw error;
  }
});

requisitionsRouter.post("/:id/submit", requireRole(["ADMIN", "SUPERVISOR", "OPERATOR"]), async (req, res) => {
  try {
    const id = z.string().min(1).parse(req.params.id);
    await loadAccessibleRequisition(req, id);
    res.json(await submitRequisition(id, req.auth!.userId));
  } catch (error) {
    if (mapError(res, error)) return;
    throw error;
  }
});

requisitionsRouter.post("/:id/approve", requireRole(["ADMIN", "SUPERVISOR"]), async (req, res) => {
  try {
    const id = z.string().min(1).parse(req.params.id);
    await loadAccessibleRequisition(req, id);
    res.json(await approveRequisition(id, req.auth!.userId, req.auth!.role));
  } catch (error) {
    if (mapError(res, error)) return;
    throw error;
  }
});

requisitionsRouter.post("/:id/cancel", requireRole(["ADMIN", "SUPERVISOR"]), async (req, res) => {
  try {
    const id = z.string().min(1).parse(req.params.id);
    await loadAccessibleRequisition(req, id);
    res.json(await cancelRequisition(id, req.auth!.userId, req.auth!.role));
  } catch (error) {
    if (mapError(res, error)) return;
    throw error;
  }
});

requisitionsRouter.post("/:id/lines", requireRole(["ADMIN", "SUPERVISOR", "OPERATOR"]), async (req, res) => {
  try {
    const id = z.string().min(1).parse(req.params.id);
    const body = z
      .object({
        sku: z.string().min(1).max(80),
        requestedQty: z.coerce.number().positive()
      })
      .parse(req.body);
    await loadAccessibleRequisition(req, id);
    res.status(201).json(await addRequisitionLine(id, body, req.auth!.userId));
  } catch (error) {
    if (mapError(res, error)) return;
    throw error;
  }
});

requisitionsRouter.post("/:id/lines/:lineId/reservations", requireRole(["ADMIN", "SUPERVISOR"]), async (req, res) => {
  try {
    const body = z
      .object({
        qty: z.coerce.number().positive().optional(),
        quantity: z.coerce.number().positive().optional(),
        inventoryId: z.string().min(1).optional(),
        layerId: z.string().min(1).optional(),
        allocationMode: z.string().max(20).optional()
      })
      .parse(req.body);
    const qty = body.qty ?? body.quantity;
    if (qty == null) {
      res.status(400).json({ message: "qty o quantity es requerido." });
      return;
    }
    const requisitionId = z.string().min(1).parse(req.params.id);
    await loadAccessibleRequisition(req, requisitionId);
    if (body.inventoryId) await assertAccessibleInventory(req.auth!, body.inventoryId, prisma);
    if (body.layerId) await assertAccessibleLayer(req.auth!, body.layerId, prisma);
    res.status(201).json(
      await reserveLine({
        requisitionId,
        lineId: z.string().min(1).parse(req.params.lineId),
        qty,
        inventoryId: body.inventoryId,
        layerId: body.layerId,
        allocationMode: body.allocationMode,
        userId: req.auth!.userId,
        role: req.auth!.role
      })
    );
  } catch (error) {
    if (mapError(res, error)) return;
    throw error;
  }
});

requisitionsRouter.post("/reservations/:reservationId/release", requireRole(["ADMIN", "SUPERVISOR"]), async (req, res) => {
  try {
    const body = z
      .object({
        qty: z.coerce.number().positive().optional()
      })
      .parse(req.body ?? {});
    const reservationId = z.string().min(1).parse(req.params.reservationId);
    const reservation = await prisma.inventoryReservation.findUnique({
      where: { id: reservationId },
      include: {
        requisitionLine: {
          include: { requisition: { include: { project: true } } }
        }
      }
    });
    await assertAccessibleRequisition(req.auth!, reservation?.requisitionLine.requisition);
    res.json(
      await releaseReservation(
        reservationId,
        req.auth!.userId,
        req.auth!.role,
        body.qty
      )
    );
  } catch (error) {
    if (mapError(res, error)) return;
    throw error;
  }
});

requisitionsRouter.patch("/:id", requireRole(["ADMIN", "SUPERVISOR"]), async (req, res) => {
  const id = z.string().min(1).parse(req.params.id);
  const body = z
    .object({
      notes: z.string().max(2000).optional(),
      reference: z.string().max(200).optional(),
      priority: z.enum(["LOW", "NORMAL", "HIGH"]).optional()
    })
    .parse(req.body);
  const existing = await loadAccessibleRequisition(req, id);
  if (["CANCELLED", "COMPLETED"].includes(existing.status)) {
    throw new HttpError(409, "No se puede editar una requisición cerrada.");
  }
  await prisma.requisition.update({
    where: { id },
    data: {
      notes: body.notes === undefined ? undefined : body.notes.trim() || null,
      reference: body.reference === undefined ? undefined : body.reference.trim() || null,
      priority: body.priority
    }
  });
  res.json(await getRequisition(id));
});

export { requisitionsRouter };
