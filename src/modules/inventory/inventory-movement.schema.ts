import { z } from "zod";

const movementTypes = ["IN", "OUT", "ADJUST_SET"] as const;

export const createMovementSchema = z
  .object({
    sku: z.string().min(1).max(80),
    warehouse: z.string().min(1).max(80).optional(),
    location: z.string().min(1).max(120).optional(),
    status: z.string().trim().max(80).optional(),
    type: z.enum(movementTypes),
    quantity: z.coerce.number(),
    reference: z.string().max(120).optional(),
    notes: z.string().max(500).optional(),
    taskId: z.string().optional(),
    inventoryId: z.string().min(1).optional(),
    layerId: z.string().min(1).optional(),
    lotNumber: z.string().min(1).max(120).optional(),
    unitPriceMxn: z.unknown().optional(),
    unitPriceUsd: z.coerce.number().nonnegative().optional(),
    assignmentType: z.enum(["PROJECT", "FREE_TO_SALE"]).optional(),
    projectId: z.string().min(1).nullable().optional(),
    clientId: z.string().min(1).nullable().optional(),
    serialIds: z.array(z.string().min(1).max(120)).max(1_000).optional(),
    serials: z
      .array(
        z.object({
          serialNumber: z.string().trim().min(1).max(120),
          imei: z.string().trim().max(120).optional().nullable()
        })
      )
      .max(1_000)
      .optional()
  })
  .superRefine((data, ctx) => {
    if (data.type === "ADJUST_SET") {
      if (data.quantity < 0) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Ajuste debe ser mayor o igual a 0." });
      }
    } else if (data.quantity <= 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Entrada y salida requieren cantidad mayor a 0." });
    }
    if ((data.serialIds?.length || 0) > 0 && data.type !== "OUT") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "serialIds solo aplica a salidas."
      });
    }
    if ((data.serials?.length || 0) > 0 && data.type !== "IN") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "serials solo aplica a entradas."
      });
    }
    if (data.type === "IN" && (data.serials?.length || 0) > 0) {
      if (!Number.isInteger(data.quantity)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "La cantidad serializada debe ser un entero."
        });
      } else if (data.serials!.length !== data.quantity) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "El número de series debe coincidir con la cantidad."
        });
      }
    }
    if (data.type === "IN") {
      if (data.assignmentType !== "PROJECT" && data.assignmentType !== "FREE_TO_SALE") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "La entrada requiere asignación PROJECT o FREE_TO_SALE."
        });
      }
      if (data.assignmentType === "PROJECT" && !data.projectId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "La asignación PROJECT requiere projectId."
        });
      }
      if (data.assignmentType === "FREE_TO_SALE" && data.projectId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "FREE TO SALE no admite projectId."
        });
      }
      if (data.assignmentType === "FREE_TO_SALE" && !data.clientId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "FREE TO SALE requiere el cliente propietario."
        });
      }
    }
  });
