import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  QA_E2E_V2_ADVISORY_LOCK_KEY,
  QA_E2E_V2_EXPIRES_AT,
  QA_E2E_V2_JWT_EXPIRES_IN,
  QA_E2E_V2_MARKER,
  QA_E2E_V2_STORAGE_KEY,
  QA_E2E_V2_TOKEN_HASH,
  buildQaE2eV2SessionHtml,
  isAllowedQaE2eV2Host,
  isAllowedQaE2eV2Origin,
  isAllowedQaE2eV2Request,
  isQaE2eV2Expired,
  isQaE2eV2TokenCurrentlyValid,
  qaE2eV2TokenMatchesHash
} from "../src/modules/auth/qa-admin-e2e-v2.service.js";

const routes = readFileSync(new URL("../src/modules/auth/auth.routes.ts", import.meta.url), "utf8");
const service = readFileSync(new URL("../src/modules/auth/qa-admin-e2e-v2.service.ts", import.meta.url), "utf8");
const packageJson = readFileSync(new URL("../package.json", import.meta.url), "utf8");
const testSource = readFileSync(new URL(import.meta.url), "utf8");
const tokenSecretPath = fileURLToPath(new URL("../tmp/qa-admin-e2e-v2/token.secret", import.meta.url));
const versioned = [routes, service, packageJson, testSource];
const bridgeBlock = routes.slice(
  routes.indexOf('authRouter.post("/qa-admin-e2e-v2"'),
  routes.indexOf('authRouter.post("/login"')
);

const syntheticToken = "c".repeat(64);
const syntheticHash = createHash("sha256").update(syntheticToken, "utf8").digest("hex");

test("token incorrecto es inválido", () => {
  assert.equal(qaE2eV2TokenMatchesHash("d".repeat(64), syntheticHash), false);
});

test("token expirado es inválido", () => {
  assert.equal(isQaE2eV2Expired(new Date("2026-08-26T03:00:00.000Z"), "2026-08-26T02:00:00.000Z"), true);
  assert.equal(
    isQaE2eV2TokenCurrentlyValid(syntheticToken, {
      hash: syntheticHash,
      expiresAt: "2020-01-01T00:00:00.000Z",
      now: new Date("2026-08-26T00:00:00.000Z")
    }),
    false
  );
});

test("el marker no es reutilizable", () => {
  assert.equal(QA_E2E_V2_MARKER.length, 64);
  assert.match(bridgeBlock, /QA_ADMIN_E2E_V2_USED/);
  assert.match(bridgeBlock, /HttpError\(410/);
  assert.match(bridgeBlock, /pg_advisory_xact_lock/);
  assert.equal(typeof QA_E2E_V2_ADVISORY_LOCK_KEY, "number");
});

test("host y origen incorrectos no se aceptan", () => {
  assert.equal(isAllowedQaE2eV2Host("www.control.logitec.com.mx"), true);
  assert.equal(isAllowedQaE2eV2Host("control.logitec.com.mx"), false);
  assert.equal(isAllowedQaE2eV2Host("localhost"), false);
  assert.equal(isAllowedQaE2eV2Origin("https://www.control.logitec.com.mx"), true);
  assert.equal(isAllowedQaE2eV2Origin("https://control.logitec.com.mx"), false);
  assert.equal(
    isAllowedQaE2eV2Request({
      headers: { host: "control.logitec.com.mx", origin: "https://www.control.logitec.com.mx" }
    }),
    false
  );
  assert.match(bridgeBlock, /isAllowedQaE2eV2Request/);
  assert.match(bridgeBlock, /HttpError\(404/);
});

test("se selecciona únicamente ADMIN activo y no se crea usuario", () => {
  assert.match(bridgeBlock, /role:\s*"ADMIN"/);
  assert.match(bridgeBlock, /isActive:\s*true/);
  assert.doesNotMatch(bridgeBlock, /user\.create/);
  assert.doesNotMatch(bridgeBlock, /user\.update/);
  assert.doesNotMatch(bridgeBlock, /passwordHash/);
  assert.match(bridgeBlock, /HttpError\(503/);
});

test("respuesta HTML no-cache persiste la llave token y redirige", () => {
  assert.equal(QA_E2E_V2_STORAGE_KEY, "token");
  const html = buildQaE2eV2SessionHtml("aaa.bbb.ccc");
  assert.match(html, /localStorage\.setItem\(key, value\)/);
  assert.match(html, /localStorage\.getItem\(key\) !== value/);
  assert.match(html, /location\.replace\("\/dashboard\.html"\)/);
  assert.match(html, /No se pudo guardar la sesión/);
  assert.match(bridgeBlock, /Cache-Control", "no-store"/);
  assert.match(bridgeBlock, /Referrer-Policy", "no-referrer"/);
  assert.match(bridgeBlock, /buildQaE2eV2SessionHtml/);
  assert.match(bridgeBlock, /type\("html"\)/);
  assert.equal(QA_E2E_V2_JWT_EXPIRES_IN, "30m");
});

test("ActivityLog y archivos versionados no contienen token ni JWT", () => {
  const activityCreate = bridgeBlock.slice(
    bridgeBlock.indexOf("activityLog.create"),
    bridgeBlock.indexOf("return selected")
  );
  assert.doesNotMatch(activityCreate, /QA_E2E_V2_TOKEN_HASH|accessToken|passwordHash/);
  assert.match(activityCreate, /purpose:\s*"IMPORT_E2E_RECONCILE"/);
  assert.doesNotMatch(bridgeBlock, /console\.log\(accessToken/);
  if (existsSync(tokenSecretPath)) {
    const raw = readFileSync(tokenSecretPath, "utf8").trim();
    assert.equal(raw.length, 64);
    for (const source of versioned) {
      assert.equal(source.includes(raw), false);
    }
  }
  assert.equal(QA_E2E_V2_TOKEN_HASH.length, 64);
  assert.ok(Date.parse(QA_E2E_V2_EXPIRES_AT) > 0);
  assert.equal(randomBytes(8).length, 8);
});

test("timingSafeEqual es utilizado", () => {
  assert.match(service, /timingSafeEqual/);
});
