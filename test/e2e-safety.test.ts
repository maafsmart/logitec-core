import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import {
  E2eSafetyError,
  QA_E2E_USERS,
  REAL_ADMIN_EMAIL,
  assertE2eHarnessReady,
  assertE2eNotProduction,
  assertE2eWebServerReady,
  assertQaE2eEmail,
  assertRequiredE2eSecrets,
  startE2eWebServer,
  E2E_WEB_SERVER_OS_ALLOWLIST,
  buildE2eWebServerEnv,
  findLeakedSecretMarkers,
  formatE2eNetworkRow,
  sanitizeE2eEvidence,
  sanitizeE2eUrl,
  sanitizePlaywrightResultsDump,
  selectExistingActiveQaClient
} from "../src/scripts/e2e-safety.ts";

const ensureSource = readFileSync(new URL("../scripts/ensure-qa-e2e-users.ts", import.meta.url), "utf8");
const specSource = readFileSync(new URL("./e2e/roles-regression.spec.ts", import.meta.url), "utf8");
const safetySource = readFileSync(new URL("../src/scripts/e2e-safety.ts", import.meta.url), "utf8");
const playwrightConfigSource = readFileSync(new URL("../playwright.config.ts", import.meta.url), "utf8");
const teardownSource = readFileSync(new URL("../scripts/e2e-global-teardown.ts", import.meta.url), "utf8");
const webServerSource = readFileSync(new URL("../scripts/e2e-web-server.ts", import.meta.url), "utf8");

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
  for (const source of [ensureSource, specSource, safetySource, playwrightConfigSource]) {
    assert.doesNotMatch(source, /E2E_ADMIN_PASSWORD\s*\|\|\s*["'][^"']+["']/);
    assert.doesNotMatch(source, /QA_E2E_PASSWORD\s*\|\|\s*["'][^"']+["']/);
    assert.doesNotMatch(source, /Admin1234/);
    assert.doesNotMatch(source, /QaUser1234/);
  }
});

test("playwright-results.json no conserva env con secretos", () => {
  assert.doesNotMatch(playwrightConfigSource, /\.\.\.\s*process\.env/);
  assert.doesNotMatch(playwrightConfigSource, /Object\.entries\(\s*process\.env/);
  assert.match(playwrightConfigSource, /buildE2eWebServerEnv/);
  assert.match(playwrightConfigSource, /e2e-web-server\.ts/);
  assert.match(teardownSource, /sanitizePlaywrightResultsDump/);
  const dumped = {
    config: {
      webServer: {
        env: {
          PATH: "C:\\Windows",
          E2E_ADMIN_PASSWORD: "should-not-remain",
          QA_E2E_PASSWORD: "should-not-remain",
          DATABASE_URL: "postgresql://u:p@127.0.0.1:5432/logitec_dev"
        }
      }
    },
    suites: [{ specs: [{ title: "ok", tests: [{ results: [{ status: "passed" }] }] }] }]
  };
  const clean = sanitizePlaywrightResultsDump(dumped) as {
    config: { webServer: { env: { redacted?: boolean } } };
    suites: unknown;
  };
  assert.deepEqual(clean.config.webServer.env, { redacted: true });
  assert.ok(clean.suites);
  const serialized = JSON.stringify(clean);
  assert.doesNotMatch(serialized, /should-not-remain/);
  assert.doesNotMatch(serialized, /postgresql:\/\//);
});

test("webServer.env es allowlist: secretos de process.env no entran al objeto serializable", () => {
  const poisoned: NodeJS.ProcessEnv = {
    PATH: "C:\\Windows\\system32",
    PATHEXT: ".COM;.EXE",
    SYSTEMROOT: "C:\\Windows",
    NODE_ENV: "production",
    DATABASE_ENVIRONMENT: "production",
    JWT_SECRET: "SHOULD_NOT_LEAK",
    API_TOKEN: "SHOULD_NOT_LEAK",
    AUTHORIZATION: "SHOULD_NOT_LEAK",
    COOKIE: "SHOULD_NOT_LEAK",
    DATABASE_URL: "postgresql://SHOULD_NOT_LEAK",
    SESSION_SECRET: "SHOULD_NOT_LEAK",
    RANDOM_PRIVATE_VALUE: "SHOULD_NOT_LEAK",
    E2E_ADMIN_PASSWORD: "SHOULD_NOT_LEAK",
    QA_E2E_PASSWORD: "SHOULD_NOT_LEAK"
  };
  const env = buildE2eWebServerEnv(poisoned, 3100);
  assert.equal(env.NODE_ENV, "development");
  assert.equal(env.DATABASE_ENVIRONMENT, "development");
  assert.equal(env.PORT, "3100");
  assert.equal(env.PATH, "C:\\Windows\\system32");
  assert.equal(env.JWT_SECRET, undefined);
  assert.equal(env.API_TOKEN, undefined);
  assert.equal(env.AUTHORIZATION, undefined);
  assert.equal(env.COOKIE, undefined);
  assert.equal(env.DATABASE_URL, undefined);
  assert.equal(env.SESSION_SECRET, undefined);
  assert.equal(env.RANDOM_PRIVATE_VALUE, undefined);
  assert.equal(env.E2E_ADMIN_PASSWORD, undefined);
  const serialized = JSON.stringify({ webServer: { env } });
  assert.equal(serialized.includes("SHOULD_NOT_LEAK"), false);
  assert.deepEqual(findLeakedSecretMarkers(serialized), []);
  const allowed = new Set<string>(["NODE_ENV", "DATABASE_ENVIRONMENT", "PORT", ...E2E_WEB_SERVER_OS_ALLOWLIST]);
  for (const key of Object.keys(env)) {
    assert.ok(allowed.has(key), `clave fuera de allowlist: ${key}`);
  }
  assert.ok(!("JWT_SECRET" in env));
  assert.ok(!("DATABASE_URL" in env));
});

test("evidencia E2E regenerada no contiene marcadores de secreto", () => {
  const dir = path.resolve("test/e2e/evidence");
  if (!existsSync(dir)) return;
  const targets = ["playwright-results.json", "audit-report.md", "console.log", "network.log"];
  for (const file of targets) {
    const full = path.join(dir, file);
    if (!existsSync(full)) continue;
    const text = readFileSync(full, "utf8");
    const hits = findLeakedSecretMarkers(text);
    assert.deepEqual(hits, [], `${file} contiene marcadores: ${hits.join(", ")}`);
  }
  const extraJson = existsSync(dir)
    ? readdirSync(dir).filter((name) => name.endsWith(".json") && name !== "playwright-results.json")
    : [];
  for (const name of extraJson) {
    const text = readFileSync(path.join(dir, name), "utf8");
    const hits = findLeakedSecretMarkers(text);
    assert.deepEqual(hits, [], `${name} contiene marcadores: ${hits.join(", ")}`);
  }
});

test("DEV válido pasa el candado", () => {
  const secrets = assertE2eHarnessReady(DEV_ENV);
  assert.equal(secrets.adminPassword, DEV_ENV.E2E_ADMIN_PASSWORD);
  assert.equal(secrets.qaPassword, DEV_ENV.QA_E2E_PASSWORD);
});

test("wrapper E2E: dotenv → guard → import; no maquilla NODE_ENV/DATABASE_ENVIRONMENT", () => {
  assert.match(webServerSource, /dotenv\.config\(\)/);
  assert.match(
    webServerSource,
    /dotenv\.config\(\)[\s\S]*startE2eWebServer\([\s\S]*import\("\.\.\/src\/server\.ts"\)/
  );
  assert.doesNotMatch(webServerSource, /process\.env\.NODE_ENV\s*=/);
  assert.doesNotMatch(webServerSource, /process\.env\.DATABASE_ENVIRONMENT\s*=/);
});

test("wrapper E2E aborta ANTES de importar el servidor en destinos inseguros", async () => {
  const cases: Array<{ name: string; env: NodeJS.ProcessEnv; code: string }> = [
    {
      name: "A DATABASE_URL = host de producción",
      env: { ...DEV_ENV, DATABASE_URL: "postgresql://u:p@ep-prod.example.neon.tech/neondb" },
      code: "E2E_GUARD_PROD_DATABASE"
    },
    {
      name: "B falta PRODUCTION_DATABASE_HOST",
      env: { ...DEV_ENV, PRODUCTION_DATABASE_HOST: "" },
      code: "E2E_GUARD_PROD_HOST_REQUIRED"
    },
    {
      name: "C DATABASE_ENVIRONMENT no es development",
      env: { ...DEV_ENV, DATABASE_ENVIRONMENT: "qa" },
      code: "E2E_GUARD_DATABASE_ENVIRONMENT"
    },
    {
      name: "D NODE_ENV es production",
      env: { ...DEV_ENV, NODE_ENV: "production" },
      code: "E2E_GUARD_NODE_ENV"
    }
  ];
  for (const row of cases) {
    let imported = false;
    await assert.rejects(
      () =>
        startE2eWebServer({
          env: row.env,
          loadServer: async () => {
            imported = true;
            throw new Error("server must not start");
          }
        }),
      (err: unknown) => err instanceof E2eSafetyError && err.code === row.code,
      row.name
    );
    assert.equal(imported, false, `${row.name}: el servidor no debe importarse`);
  }
  let started = false;
  await startE2eWebServer({
    env: DEV_ENV,
    loadServer: async () => {
      started = true;
    }
  });
  assert.equal(started, true);
  assert.doesNotThrow(() => assertE2eWebServerReady(DEV_ENV));
});
