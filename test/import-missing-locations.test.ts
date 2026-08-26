import assert from "node:assert/strict";
import { test } from "node:test";
import { HttpError } from "../src/shared/http-error.js";
import {
  assertImportLocationCreationAllowed,
  normalizeMissingLocationCodes
} from "../src/modules/imports/import-missing-locations.service.js";

function expectHttpError(fn: () => void, status: number) {
  assert.throws(fn, (error: unknown) => error instanceof HttpError && error.statusCode === status);
}

test("permite alta para el ADMIN dueño de un inventario validado", () => {
  assert.doesNotThrow(() =>
    assertImportLocationCreationAllowed(
      { context: "INVENTORY", status: "VALIDATED", createdById: "admin-1" },
      "admin-1"
    )
  );
  assert.doesNotThrow(() =>
    assertImportLocationCreationAllowed(
      { context: "INVENTORY", status: "READY", createdById: "admin-1" },
      "admin-1"
    )
  );
});

test("oculta lotes ajenos y bloquea contexto o estado incorrectos", () => {
  expectHttpError(
    () => assertImportLocationCreationAllowed(
      { context: "INVENTORY", status: "VALIDATED", createdById: "admin-2" },
      "admin-1"
    ),
    404
  );
  expectHttpError(
    () => assertImportLocationCreationAllowed(
      { context: "INBOUND", status: "VALIDATED", createdById: "admin-1" },
      "admin-1"
    ),
    409
  );
  expectHttpError(
    () => assertImportLocationCreationAllowed(
      { context: "INVENTORY", status: "MAPPED", createdById: "admin-1" },
      "admin-1"
    ),
    409
  );
});

test("normaliza y deduplica códigos seguros del archivo", () => {
  assert.deepEqual(
    normalizeMissingLocationCodes([
      { code: " an14-a " },
      { code: "AN14-A" },
      { code: "an26" },
      { code: "AN4-B" }
    ]),
    ["AN14-A", "AN26", "AN4-B"]
  );
});

test("rechaza códigos vacíos, con espacios internos o lotes excesivos", () => {
  expectHttpError(() => normalizeMissingLocationCodes([]), 400);
  expectHttpError(() => normalizeMissingLocationCodes([{ code: "AN 14-A" }]), 400);
  expectHttpError(
    () => normalizeMissingLocationCodes(Array.from({ length: 101 }, (_, index) => ({ code: `AN${index}` }))),
    400
  );
});
