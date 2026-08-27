import { HttpError } from "../../shared/http-error.js";

export type PhysicalInventoryLockKind = "RESET" | "CONFIRM";

let inFlight: PhysicalInventoryLockKind | null = null;

export function isPhysicalInventoryMutationInFlight(): boolean {
  return inFlight !== null;
}

export function isPhysicalResetInFlight(): boolean {
  return inFlight !== null;
}

export function currentPhysicalInventoryLock(): PhysicalInventoryLockKind | null {
  return inFlight;
}

export async function withPhysicalInventoryLock<T>(
  kind: PhysicalInventoryLockKind,
  fn: () => Promise<T>
): Promise<T> {
  if (inFlight) {
    throw new HttpError(
      409,
      inFlight === "RESET"
        ? "Ya hay un reinicio de inventario en curso."
        : "Ya hay una conciliación física de inventario en curso."
    );
  }
  inFlight = kind;
  try {
    return await fn();
  } finally {
    inFlight = null;
  }
}
