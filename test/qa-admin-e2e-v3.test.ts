import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  QA_E2E_V3_ADVISORY_LOCK_KEY,
  QA_E2E_V3_EXPIRES_AT,
  QA_E2E_V3_JWT_EXPIRES_IN,
  QA_E2E_V3_MARKER,
  QA_E2E_V3_TOKEN_HASH,
  isAllowedQaE2eV3Environment,
  isAllowedQaE2eV3Host,
  isAllowedQaE2eV3Origin,
  isAllowedQaE2eV3Request,
  isQaE2eV3Expired,
  isQaE2eV3JsonContentType,
  isQaE2eV3TokenCurrentlyValid,
  qaE2eV3TokenMatchesHash
} from "../src/modules/auth/qa-admin-e2e-v3.service.js";

const routes = readFileSync(new URL("../src/modules/auth/auth.routes.ts", import.meta.url), "utf8");
const service = readFileSync(new URL("../src/modules/auth/qa-admin-e2e-v3.service.ts", import.meta.url), "utf8");
const packageJson = readFileSync(new URL("../package.json", import.meta.url), "utf8");
const testSource = readFileSync(new URL(import.meta.url), "utf8");
const tokenSecretPath = fileURLToPath(new URL("../tmp/qa-admin-e2e-v3/token.secret", import.meta.url));
const versioned = [routes, service, packageJson, testSource];
const bridgeBlock = routes.slice(
  routes.indexOf('authRouter.post("/qa-admin-e2e-v3"'),
  routes.indexOf('authRouter.post("/login"')
);

const syntheticToken = "c".repeat(64);
const syntheticHash = createHash("sha256").update(syntheticToken, "utf8").digest("hex");
const wwwReq = {
  headers: {
    host: "www.control.logitec.com.mx",
    origin: "https://www.control.logitec.com.mx"
  }
};

test("origen correcto se acepta", () => {
  assert.equal(isAllowedQaE2eV3Origin("https://www.control.logitec.com.mx"), true);
  assert.equal(isAllowedQaE2eV3Request(wwwReq), true);
});

test("Origin null es rechazado", () => {
  assert.equal(isAllowedQaE2eV3Origin("null"), false);
  assert.equal(
    isAllowedQaE2eV3Request({
      headers: { host: "www.control.logitec.com.mx", origin: "null" }
    }),
    false
  );
});

test("origen ausente es rechazado", () => {
  assert.equal(isAllowedQaE2eV3Origin(undefined), false);
  assert.equal(isAllowedQaE2eV3Request({ headers: { host: "www.control.logitec.com.mx" } }), false);
});

test("host incorrecto no se acepta", () => {
  assert.equal(isAllowedQaE2eV3Host("www.control.logitec.com.mx"), true);
  assert.equal(isAllowedQaE2eV3Host("control.logitec.com.mx"), false);
  assert.equal(isAllowedQaE2eV3Host("localhost"), false);
  assert.equal(isAllowedQaE2eV3Origin("https://control.logitec.com.mx"), false);
  assert.equal(
    isAllowedQaE2eV3Request({
      headers: { host: "control.logitec.com.mx", origin: "https://www.control.logitec.com.mx" }
    }),
    false
  );
  assert.equal(isAllowedQaE2eV3Environment("production"), true);
  assert.equal(isAllowedQaE2eV3Environment("test"), false);
  assert.match(bridgeBlock, /isAllowedQaE2eV3Environment/);
  assert.match(bridgeBlock, /HttpError\(404/);
});

test("content-type incorrecto es rechazado", () => {
  assert.equal(isQaE2eV3JsonContentType("application/json"), true);
  assert.equal(isQaE2eV3JsonContentType("application/json; charset=utf-8"), true);
  assert.equal(isQaE2eV3JsonContentType("application/x-www-form-urlencoded"), false);
  assert.equal(isQaE2eV3JsonContentType(undefined), false);
  assert.match(bridgeBlock, /isQaE2eV3JsonContentType/);
  assert.match(bridgeBlock, /HttpError\(415/);
});

test("token incorrecto es inválido", () => {
  assert.equal(qaE2eV3TokenMatchesHash("d".repeat(64), syntheticHash), false);
});

test("token expirado es inválido", () => {
  assert.equal(isQaE2eV3Expired(new Date("2026-08-26T05:00:00.000Z"), "2026-08-26T04:00:00.000Z"), true);
  assert.equal(
    isQaE2eV3TokenCurrentlyValid(syntheticToken, {
      hash: syntheticHash,
      expiresAt: "2020-01-01T00:00:00.000Z",
      now: new Date("2026-08-26T00:00:00.000Z")
    }),
    false
  );
});

test("el marker no es reutilizable", () => {
  assert.equal(QA_E2E_V3_MARKER.length, 64);
  assert.match(bridgeBlock, /QA_ADMIN_E2E_V3_USED/);
  assert.match(bridgeBlock, /HttpError\(410/);
  assert.match(bridgeBlock, /pg_advisory_xact_lock/);
  assert.equal(typeof QA_E2E_V3_ADVISORY_LOCK_KEY, "number");
});

test("se selecciona únicamente ADMIN activo y no se crea usuario", () => {
  assert.match(bridgeBlock, /role:\s*"ADMIN"/);
  assert.match(bridgeBlock, /isActive:\s*true/);
  assert.doesNotMatch(bridgeBlock, /user\.create/);
  assert.doesNotMatch(bridgeBlock, /user\.update/);
  assert.doesNotMatch(bridgeBlock, /passwordHash/);
  assert.match(bridgeBlock, /HttpError\(503/);
});

test("respuesta JSON no-cache y claims correctos", () => {
  assert.match(bridgeBlock, /Cache-Control", "no-store, no-cache, must-revalidate"/);
  assert.match(bridgeBlock, /Pragma", "no-cache"/);
  assert.match(bridgeBlock, /Referrer-Policy", "no-referrer"/);
  assert.match(bridgeBlock, /X-Content-Type-Options", "nosniff"/);
  assert.match(bridgeBlock, /res\.status\(200\)\.json\(\{ accessToken \}\)/);
  assert.doesNotMatch(bridgeBlock, /type\("html"\)/);
  assert.doesNotMatch(bridgeBlock, /localStorage/);
  assert.match(bridgeBlock, /role:\s*admin\.role/);
  assert.match(bridgeBlock, /email:\s*admin\.email/);
  assert.match(bridgeBlock, /subject:\s*admin\.id/);
  assert.equal(QA_E2E_V3_JWT_EXPIRES_IN, "30m");
});

test("ActivityLog y archivos versionados no contienen token ni JWT", () => {
  const activityCreate = bridgeBlock.slice(
    bridgeBlock.indexOf("activityLog.create"),
    bridgeBlock.indexOf("return selected")
  );
  assert.doesNotMatch(activityCreate, /QA_E2E_V3_TOKEN_HASH|accessToken|passwordHash/);
  assert.match(activityCreate, /purpose:\s*"IMPORT_E2E_RECONCILE"/);
  assert.doesNotMatch(bridgeBlock, /console\.log\(accessToken/);
  assert.doesNotMatch(service, /console\.log/);
  if (existsSync(tokenSecretPath)) {
    const raw = readFileSync(tokenSecretPath, "utf8").trim();
    assert.equal(raw.length, 64);
    for (const source of versioned) {
      assert.equal(source.includes(raw), false);
    }
  }
  assert.equal(QA_E2E_V3_TOKEN_HASH.length, 64);
  assert.ok(Date.parse(QA_E2E_V3_EXPIRES_AT) > 0);
  assert.equal(randomBytes(8).length, 8);
});

test("timingSafeEqual es utilizado", () => {
  assert.match(service, /timingSafeEqual/);
});
