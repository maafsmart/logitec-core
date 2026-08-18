import path from "node:path";
import { prisma } from "../../db/prisma.js";
import {
  OperationalResetError,
  assertSafeOperationalResetEnv,
  isProductionResetGuard,
  measureOperationalCounts,
  runOperationalReset,
  toLabResetMasterCounts,
  toLabResetUiCounts
} from "../../scripts/operational-reset/lib.js";
import { HttpError } from "../../shared/http-error.js";

let labResetInFlight = false;

function friendlyLabResetMessage(error: OperationalResetError): string {
  switch (error.code) {
    case "GUARD_PROD_HOST_REQUIRED":
      return "El entorno DEV no está configurado de forma segura para este reinicio.";
    case "GUARD_DATABASE_URL":
      return "No hay conexión de base de datos configurada.";
    case "SNAPSHOT_EMPTY":
    case "SNAPSHOT_MISSING":
    case "SNAPSHOT_MANIFEST":
    case "SNAPSHOT_MODEL_MISSING":
    case "SNAPSHOT_COUNT_MISMATCH":
      return "No se pudo crear el respaldo previo. No se eliminaron datos.";
    case "RESET_VERIFY":
      return "El reinicio no pudo verificarse. Los maestros o los datos operativos no quedaron como se esperaba.";
    default:
      return "No se pudo reiniciar el laboratorio.";
  }
}

export function mapLabResetError(error: unknown): HttpError {
  if (error instanceof HttpError) return error;
  if (error instanceof OperationalResetError) {
    if (isProductionResetGuard(error.code)) {
      console.error("[lab-reset] blocked by production guard", error.code);
      return new HttpError(404, "Not found");
    }
    if (error.code === "RESET_IN_PROGRESS") {
      return new HttpError(409, "Ya hay un reinicio de laboratorio en curso.");
    }
    console.error("[lab-reset]", error.code, error.message);
    return new HttpError(400, friendlyLabResetMessage(error));
  }
  console.error("[lab-reset]", error);
  return new HttpError(500, "No se pudo reiniciar el laboratorio. Revisa el registro técnico.");
}

export function assertLabResetAvailable(env: NodeJS.ProcessEnv = process.env): void {
  try {
    assertSafeOperationalResetEnv(env);
  } catch (error) {
    throw mapLabResetError(error);
  }
}

export function isLabResetInFlight(): boolean {
  return labResetInFlight;
}

export async function previewLabReset() {
  assertLabResetAvailable();
  const counts = await measureOperationalCounts(prisma);
  return {
    available: true,
    environment: process.env.DATABASE_ENVIRONMENT || process.env.NODE_ENV || "development",
    counts: toLabResetUiCounts(counts),
    masters: toLabResetMasterCounts(counts)
  };
}

export async function executeLabReset(userId: string) {
  assertLabResetAvailable();
  if (labResetInFlight) {
    throw new HttpError(409, "Ya hay un reinicio de laboratorio en curso.");
  }
  labResetInFlight = true;
  console.log("[lab-reset] starting", { userId, environment: process.env.DATABASE_ENVIRONMENT || process.env.NODE_ENV });
  try {
    const result = await runOperationalReset(prisma, { execute: true });
    if (!result.after || !result.snapshotDir) {
      throw new OperationalResetError("RESET DEV FAIL: sin resultado de ejecución.", "RESET_VERIFY");
    }
    const snapshotPath = path.relative(process.cwd(), result.snapshotDir) || result.snapshotDir;
    console.log("[lab-reset] completed", {
      userId,
      snapshot: snapshotPath,
      before: toLabResetUiCounts(result.before),
      after: toLabResetUiCounts(result.after)
    });
    return {
      ok: true,
      message: "Laboratorio reiniciado correctamente",
      snapshot: {
        id: path.basename(result.snapshotDir),
        path: snapshotPath.replace(/\\/g, "/")
      },
      before: toLabResetUiCounts(result.before),
      after: toLabResetUiCounts(result.after),
      masters: {
        before: toLabResetMasterCounts(result.before),
        after: toLabResetMasterCounts(result.after)
      }
    };
  } catch (error) {
    throw mapLabResetError(error);
  } finally {
    labResetInFlight = false;
  }
}
