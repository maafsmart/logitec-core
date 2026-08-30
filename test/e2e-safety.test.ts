import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  E2eSafetyError,
  QA_E2E_USERS,
  REAL_ADMIN_EMAIL,
  assertE2eHarnessReady,
  assertE2eNotProduction,
  assertQaE2eEmail,
  assertRequiredE2eSecrets,
  formatE2eNetworkRow,
  sanitizeE2eEvidence,
  sanitizeE2eUrl,
  selectExistingActiveQaClient
} from "../src/scripts/e2e-safety.ts";

const ensureSource = readFileSync(new URL("../scripts/ensure-qa-e2e-users.ts", import.meta.url), "utf8");
const specSource = readFileSync(new URL("./e2e/roles-regression.spec.ts", import.meta.url), "utf8");
const safetySource = readFileSync(new URL("../src/scripts/e2e-safety.ts", import.meta.url), "utf8");

const DEV_ENV = {
  NODE_ENV: "development",
  DATABASE_ENVIRONMENT: "development",
  DATABASE_URL: "postgresql://u:p@127.0.0.1:5432/logitec_dev",
  PRODUCTION_DATABASE_HOST: "ep-prod.example.neon.tech",
  E2E_ADMIN_PASSWORD: "ephemeral-admin-secret",
  QA_E2E_PASSWORD: "ephemeral-qa-secret"
};

test("faltan secretos E2E → falla antes de cualquier mutación", () => {
  assert.throws(
    () => assertRequiredE2eSecrets({ ...DEV_ENV, E2E_ADMIN_PASSWORD: "", QA_E2E_PASSWORD: "" }),
    (err: unknown) => err instanceof E2eSafetyError && err.code === "E2E_SECRETS_MISSING"
  );
  assert.throws(
    () => assertE2eHarnessReady({ NODE_ENV: "development", DATABASE_ENVIRONMENT: "development" }),
    (err: unknown) => err instanceof E2eSafetyError && err.code === "E2E_SECRETS_MISSING"
  );
});

test("destino PROD → falla antes de cualquier mutación", () => {
  assert.throws(
    () =>
      assertE2eNotProduction({
        ...DEV_ENV,
        DATABASE_ENVIRONMENT: "production"
      }),
    (err: unknown) => err instanceof E2eSafetyError && err.code === "E2E_GUARD_DATABASE_ENVIRONMENT"
  );
  assert.throws(
    () =>
      assertE2eNotProduction({
        ...DEV_ENV,
        NODE_ENV: "production",
        DATABASE_ENVIRONMENT: "development"
      }),
    (err: unknown) => err instanceof E2eSafetyError && err.code === "E2E_GUARD_NODE_ENV"
  );
  assert.throws(
    () =>
      assertE2eNotProduction({
        ...DEV_ENV,
        DATABASE_URL: "postgresql://u:p@ep-prod.example.neon.tech/neondb"
      }),
    (err: unknown) => err instanceof E2eSafetyError && err.code === "E2E_GUARD_PROD_DATABASE"
  );
});

test("NODE_ENV !== production no basta: exige DATABASE_ENVIRONMENT=development", () => {
  assert.throws(
    () =>
      assertE2eNotProduction({
        ...DEV_ENV,
        NODE_ENV: "development",
        DATABASE_ENVIRONMENT: "qa"
      }),
    (err: unknown) => err instanceof E2eSafetyError && err.code === "E2E_GUARD_DATABASE_ENVIRONMENT"
  );
});

test("email no-QA → rechazado", () => {
  assert.throws(() => assertQaE2eEmail("admin@logitec.local"), (err: unknown) => {
    return err instanceof E2eSafetyError && err.code === "E2E_REAL_ADMIN_FORBIDDEN";
  });
  assert.throws(() => assertQaE2eEmail("rodrigo.maafs@gmail.com"), (err: unknown) => {
    return err instanceof E2eSafetyError && err.code === "E2E_EMAIL_NOT_QA";
  });
  assert.throws(() => assertQaE2eEmail("operator@logitec.local"), (err: unknown) => {
    return err instanceof E2eSafetyError && err.code === "E2E_EMAIL_NOT_QA";
  });
  assert.equal(assertQaE2eEmail("qa.client@logitec.local"), "qa.client@logitec.local");
});

test("cuenta ADMIN real/no-QA nunca es un objetivo del arnés", () => {
  assert.equal(REAL_ADMIN_EMAIL, "admin@logitec.local");
  assert.ok(Object.values(QA_E2E_USERS).every((u) => u.email !== REAL_ADMIN_EMAIL));
  assert.equal(QA_E2E_USERS.ADMIN.email, "qa.admin@logitec.local");
  assert.doesNotMatch(ensureSource, /admin@logitec\.local/);
  assert.doesNotMatch(specSource, /admin@logitec\.local/);
});

test("AVIAT → el arnés no crea ni reactiva clientes", () => {
  assert.throws(
    () =>
      selectExistingActiveQaClient({
        preferredCode: "AVIAT",
        rows: [{ id: "1", code: "AVIAT", active: false }]
      }),
    (err: unknown) => err instanceof E2eSafetyError && err.code === "E2E_CLIENT_INACTIVE"
  );
  assert.throws(
    () => selectExistingActiveQaClient({ preferredCode: "AVIAT", rows: [] }),
    (err: unknown) => err instanceof E2eSafetyError && err.code === "E2E_CLIENT_UNAVAILABLE"
  );
  const active = selectExistingActiveQaClient({
    preferredCode: "AVIAT",
    rows: [{ id: "cl_aviat_official", code: "AVIAT", active: true }]
  });
  assert.equal(active.id, "cl_aviat_official");
  assert.doesNotMatch(ensureSource, /prisma\.client\.create/);
  assert.doesNotMatch(ensureSource, /prisma\.client\.update/);
  assert.doesNotMatch(ensureSource, /data:\s*\{\s*active:\s*true/);
});

test("CLIENT QA existe en el namespace y no usa cuenta personal", () => {
  assert.equal(QA_E2E_USERS.CLIENT.email, "qa.client@logitec.local");
  assert.match(QA_E2E_USERS.CLIENT.email, /^qa\./);
  assert.doesNotMatch(QA_E2E_USERS.CLIENT.email, /gmail\.com/i);
});

test("evidencia E2E solo guarda método, URL sanitizada, status y resultados funcionales", () => {
  const row = formatE2eNetworkRow("POST", "http://127.0.0.1:3100/api/auth/login?token=abc", 200);
  assert.equal(row, "POST http://127.0.0.1:3100/api/auth/login?token=%5BREDACTED%5D 200");
  const evidence = sanitizeE2eEvidence({
    method: "POST",
    url: "/api/users",
    status: 400,
    password: "super-secret",
    token: "jwt-value",
    Authorization: "Bearer abc.def",
    cookie: "sid=1",
    body: { password: "x", email: "qa.admin@logitec.local" }
  });
  assert.deepEqual(evidence, {
    method: "POST",
    url: "/api/users",
    status: 400,
    password: "[REDACTED]",
    token: "[REDACTED]",
    Authorization: "[REDACTED]",
    cookie: "[REDACTED]",
    body: { password: "[REDACTED]", email: "qa.admin@logitec.local" }
  });
  assert.equal(sanitizeE2eUrl("https://user:secret@example.com/path"), "https://example.com/path");
});

test("el arnés no contiene contraseñas fallback hardcodeadas", () => {
  for (const source of [ensureSource, specSource, safetySource]) {
    assert.doesNotMatch(source, /E2E_ADMIN_PASSWORD\s*\|\|\s*["'][^"']+["']/);
    assert.doesNotMatch(source, /QA_E2E_PASSWORD\s*\|\|\s*["'][^"']+["']/);
    assert.doesNotMatch(source, /Admin1234/);
    assert.doesNotMatch(source, /QaUser1234/);
  }
});

test("DEV válido pasa el candado", () => {
  const secrets = assertE2eHarnessReady(DEV_ENV);
  assert.equal(secrets.adminPassword, DEV_ENV.E2E_ADMIN_PASSWORD);
  assert.equal(secrets.qaPassword, DEV_ENV.QA_E2E_PASSWORD);
});
