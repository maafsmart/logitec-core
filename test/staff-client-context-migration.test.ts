import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const sql = readFileSync(
  new URL("../prisma/migrations/20260829030000_staff_client_context/migration.sql", import.meta.url),
  "utf8"
);
const schema = readFileSync(new URL("../prisma/schema.prisma", import.meta.url), "utf8");

test("migración staff_client_context backfill AVIAT inequívoco y no infiere por SKU", () => {
  assert.match(sql, /AVIAT_CLIENT_NOT_UNIQUE/);
  assert.match(sql, /UPPER\(TRIM\("code"\)\) = 'AVIAT'/);
  assert.match(sql, /AND "role" IN \('SUPERVISOR', 'OPERATOR'\)/);
  assert.match(sql, /User_scoped_role_client_required/);
  assert.match(sql, /CHECK \(\("role" = 'ADMIN'\) OR \("clientId" IS NOT NULL\)\)/);
  assert.match(sql, /SCAN_CLIENT_BACKFILL_FAILED/);
  assert.match(sql, /ALTER COLUMN "clientId" SET NOT NULL/);
  assert.match(sql, /LOCATION_COMPOSITE_UNIQUE_MISSING/);
  assert.match(sql, /DROP INDEX IF EXISTS "Location_code_key"/);
  assert.doesNotMatch(sql, /User\.email/);
  assert.doesNotMatch(sql, /product\.customer/i);
  assert.doesNotMatch(sql, /ActivityLog/);
});

test("schema ScanEvent.clientId obligatorio y Location unique compuesto", () => {
  const scanBlock = schema.slice(schema.indexOf("model ScanEvent {"), schema.indexOf("model Client {"));
  assert.match(scanBlock, /clientId\s+String\s*$/m);
  assert.doesNotMatch(scanBlock, /clientId\s+String\?/);
  const locationBlock = schema.slice(schema.indexOf("model Location {"), schema.indexOf("\nmodel Inventory {"));
  assert.match(locationBlock, /@@unique\(\[warehouseId, code\]\)/);
  assert.doesNotMatch(locationBlock, /code\s+String\s+@unique/);
});
