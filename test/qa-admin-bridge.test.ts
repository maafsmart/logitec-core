import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  QA_ADMIN_BRIDGE_ADVISORY_LOCK_KEY,
  QA_ADMIN_BRIDGE_EXPIRES_AT,
  QA_ADMIN_BRIDGE_JWT_EXPIRES_IN,
  QA_ADMIN_BRIDGE_JWT_EXPIRES_IN_SECONDS,
  QA_ADMIN_BRIDGE_MARKER,
  QA_ADMIN_BRIDGE_TOKEN_HASH,
  hashQaAdminBridgeToken,
  isQaAdminBridgeExpired,
  isQaAdminBridgeTokenCurrentlyValid,
  isQaAdminBridgeTokenFormatValid,
  qaAdminBridgeTokenMatchesHash
} from "../src/modules/auth/qa-admin-bridge.service.js";

const routes = readFileSync(new URL("../src/modules/auth/auth.routes.ts", import.meta.url), "utf8");
const service = readFileSync(new URL("../src/modules/auth/qa-admin-bridge.service.ts", import.meta.url), "utf8");
const packageJson = readFileSync(new URL("../package.json", import.meta.url), "utf8");
const testSource = readFileSync(new URL(import.meta.url), "utf8");
const tokenSecretPath = fileURLToPath(new URL("../tmp/qa-admin-bridge/token.secret", import.meta.url));
const versionedSources = [routes, service, packageJson, testSource];
const bridgeBlock = routes.slice(
  routes.indexOf('authRouter.post("/qa-admin-bridge"'),
  routes.indexOf('authRouter.post("/login"')
);

const syntheticToken = "a".repeat(64);
const syntheticHash = createHash("sha256").update(syntheticToken, "utf8").digest("hex");
const future = new Date("2099-01-01T00:00:00.000Z");
const past = new Date("2000-01-01T00:00:00.000Z");

test("token correcto antes de expirar es válido", () => {
  assert.equal(
    isQaAdminBridgeTokenCurrentlyValid(syntheticToken, {
      hash: syntheticHash,
      expiresAt: future.toISOString(),
      now: new Date("2026-08-26T00:00:00.000Z")
    }),
    true
  );
});

test("token incorrecto es inválido", () => {
  const other = "b".repeat(64);
  assert.equal(qaAdminBridgeTokenMatchesHash(other, syntheticHash), false);
  assert.equal(
    isQaAdminBridgeTokenCurrentlyValid(other, {
      hash: syntheticHash,
      expiresAt: future.toISOString(),
      now: new Date()
    }),
    false
  );
});

test("longitud o formato incorrectos son inválidos", () => {
  assert.equal(isQaAdminBridgeTokenFormatValid("abc"), false);
  assert.equal(isQaAdminBridgeTokenFormatValid("g".repeat(64)), false);
  assert.equal(isQaAdminBridgeTokenFormatValid(syntheticToken.slice(0, 63)), false);
  assert.equal(qaAdminBridgeTokenMatchesHash("not-a-token", syntheticHash), false);
});

test("token expirado es inválido", () => {
  assert.equal(isQaAdminBridgeExpired(past, future.toISOString()), false);
  assert.equal(isQaAdminBridgeExpired(future, past.toISOString()), true);
  assert.equal(
    isQaAdminBridgeTokenCurrentlyValid(syntheticToken, {
      hash: syntheticHash,
      expiresAt: "2020-01-01T00:00:00.000Z",
      now: new Date("2026-08-26T00:00:00.000Z")
    }),
    false
  );
});

test("timingSafeEqual es utilizado", () => {
  assert.match(service, /timingSafeEqual/);
  assert.match(service, /qaAdminBridgeTokenMatchesHash[\s\S]*timingSafeEqual/);
});

test("sólo existe hash en código versionado, no el token crudo", () => {
  assert.equal(QA_ADMIN_BRIDGE_TOKEN_HASH.length, 64);
  assert.match(QA_ADMIN_BRIDGE_TOKEN_HASH, /^[0-9a-f]{64}$/);
  assert.match(service, /QA_ADMIN_BRIDGE_TOKEN_HASH/);
  assert.doesNotMatch(service, /\btoken:\s*["'][0-9a-fA-F]{64}["']/);
  assert.doesNotMatch(routes, /\btoken:\s*["'][0-9a-fA-F]{64}["']/);
  if (existsSync(tokenSecretPath)) {
    const raw = readFileSync(tokenSecretPath, "utf8").trim();
    assert.equal(raw.length, 64);
    for (const source of versionedSources) {
      assert.equal(source.includes(raw), false);
    }
  }
});

test("el marker no es reutilizable según la ruta", () => {
  assert.equal(QA_ADMIN_BRIDGE_MARKER.length, 64);
  assert.match(bridgeBlock, /QA_ADMIN_BRIDGE_USED/);
  assert.match(bridgeBlock, /alreadyUsed/);
  assert.match(bridgeBlock, /HttpError\(410/);
  assert.match(bridgeBlock, /reference:\s*QA_ADMIN_BRIDGE_MARKER/);
});

test("la ruta usa advisory lock", () => {
  assert.equal(typeof QA_ADMIN_BRIDGE_ADVISORY_LOCK_KEY, "number");
  assert.match(bridgeBlock, /pg_advisory_xact_lock/);
  assert.match(bridgeBlock, /QA_ADMIN_BRIDGE_ADVISORY_LOCK_KEY/);
});

test("ActivityLog no contiene token ni hash", () => {
  const activityCreate = bridgeBlock.slice(
    bridgeBlock.indexOf("activityLog.create"),
    bridgeBlock.indexOf("return selected")
  );
  assert.match(activityCreate, /activityLog\.create/);
  assert.match(activityCreate, /purpose:\s*"IMPORT_E2E_RECONCILE"/);
  assert.match(activityCreate, /singleUse:\s*true/);
  assert.doesNotMatch(activityCreate, /tokenHash|accessToken|passwordHash/);
  assert.doesNotMatch(activityCreate, /QA_ADMIN_BRIDGE_TOKEN_HASH/);
});

test("se selecciona únicamente ADMIN activo", () => {
  assert.match(bridgeBlock, /role:\s*"ADMIN"/);
  assert.match(bridgeBlock, /isActive:\s*true/);
  assert.match(bridgeBlock, /orderBy:\s*\{\s*createdAt:\s*"asc"/);
  assert.doesNotMatch(bridgeBlock, /user\.create/);
});

test("JWT máximo 45 minutos", () => {
  assert.equal(QA_ADMIN_BRIDGE_JWT_EXPIRES_IN, "45m");
  assert.equal(QA_ADMIN_BRIDGE_JWT_EXPIRES_IN_SECONDS, 2700);
  assert.match(bridgeBlock, /expiresIn:\s*QA_ADMIN_BRIDGE_JWT_EXPIRES_IN/);
  assert.match(bridgeBlock, /expiresInSeconds:\s*QA_ADMIN_BRIDGE_JWT_EXPIRES_IN_SECONDS/);
});

test("no se crea ni modifica User ni passwordHash", () => {
  assert.doesNotMatch(bridgeBlock, /user\.create/);
  assert.doesNotMatch(bridgeBlock, /user\.update/);
  assert.doesNotMatch(bridgeBlock, /passwordHash/);
  assert.doesNotMatch(service, /passwordHash/);
  assert.doesNotMatch(service, /user\.create/);
});

test("hashQaAdminBridgeToken produce SHA-256 hex", () => {
  const sample = randomBytes(32).toString("hex");
  assert.equal(hashQaAdminBridgeToken(sample), createHash("sha256").update(sample, "utf8").digest("hex"));
});

test("expiración publicada es ISO y futura respecto a 2026-08-25", () => {
  assert.ok(Date.parse(QA_ADMIN_BRIDGE_EXPIRES_AT) > Date.parse("2026-08-25T00:00:00.000Z"));
});
