export const PROVISIONAL_CAPTURE_STATUSES = [
  "PENDIENTE DE SUPERVISIÓN",
  "REQUIERE ACLARACIÓN",
  "VALIDADO · PENDIENTE DE REGISTRO",
  "RECHAZADO ADMINISTRATIVAMENTE"
] as const;

export type ProvisionalCaptureStatus = (typeof PROVISIONAL_CAPTURE_STATUSES)[number];

export const PROVISIONAL_DECLARED_ACTION_IDS = [
  "consulta",
  "traslado",
  "acomodo",
  "salida",
  "recepcion",
  "etiquetado",
  "incidencia"
] as const;

export type ProvisionalDeclaredActionId = (typeof PROVISIONAL_DECLARED_ACTION_IDS)[number];

export function isPhysicalFloorAction(actionId: string): boolean {
  return Boolean(actionId) && actionId !== "consulta";
}

export function isProvisionalCaptureStatus(value: string): value is ProvisionalCaptureStatus {
  return (PROVISIONAL_CAPTURE_STATUSES as readonly string[]).includes(value);
}
