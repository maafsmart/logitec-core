import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const sql = readFileSync(
  new URL("../prisma/migrations/20260829050000_import_batch_client_ownership/migration.sql", import.meta.url),
  "utf8"
);
const schema = readFileSync(new URL("../prisma/schema.prisma", import.meta.url), "utf8");
const routes = readFileSync(new URL("../src/modules/imports/imports.routes.ts", import.meta.url), "utf8");
const reset = readFileSync(new URL("../src/modules/inventory/physical-reset.service.ts", import.meta.url), "utf8");
const missing = readFileSync(
  new URL("../src/modules/imports/import-missing-locations.service.ts", import.meta.url),
  "utf8"
);
const bulk = readFileSync(new URL("../src/modules/imports/import-execute-bulk.service.ts", import.meta.url), "utf8");
const scope = readFileSync(new URL("../src/modules/clients/client-scope.ts", import.meta.url), "utf8");

test("migración ImportBatch.clientId exige AVIAT único y no infiere por SKU", () => {
  assert.match(sql, /AVIAT_CLIENT_NOT_UNIQUE/);
  assert.match(sql, /UPPER\(TRIM\("code"\)\) = 'AVIAT'/);
  assert.match(sql, /IMPORT_BATCH_CLIENT_BACKFILL_FAILED/);
  assert.match(sql, /ALTER COLUMN "clientId" SET NOT NULL/);
  assert.match(sql, /ImportBatch_clientId_fkey/);
  assert.match(sql, /ON DELETE RESTRICT/);
  assert.match(sql, /User" u/);
  assert.doesNotMatch(sql, /product\.customer/i);
  assert.doesNotMatch(sql, /FROM "Product"/);
  assert.doesNotMatch(sql, /InventoryStock/);
});

test("schema ImportBatch.clientId es obligatorio y está en Client", () => {
  const batchBlock = schema.slice(schema.indexOf("model ImportBatch {"), schema.indexOf("model ImportRow {"));
  assert.match(batchBlock, /clientId\s+String\s*$/m);
  assert.doesNotMatch(batchBlock, /clientId\s+String\?/);
  assert.match(batchBlock, /onDelete: Restrict/);
  const clientBlock = schema.slice(schema.indexOf("model Client {"), schema.indexOf("model Customer {"));
  assert.match(clientBlock, /importBatches\s+ImportBatch\[\]/);
});

test("rutas y ejecución de importación quedan acotadas al operationalClientId", () => {
  assert.match(scope, /export function clientImportBatchWhere/);
  assert.match(routes, /where: clientImportBatchWhere\(req\.auth!\)/);
  assert.match(routes, /clientId: operationalClientId\(req\.auth!\)/);
  assert.match(routes, /findFirst\(\{\s*where:\s*\{\s*id,\s*clientId\s*\}/);
  assert.match(routes, /updateMany\(\{\s*where:\s*\{\s*id,\s*clientId/);
  assert.doesNotMatch(routes, /importBatch\.findUnique/);
  assert.match(missing, /where: \{ id: input\.batchId, clientId: input\.clientId \}/);
  assert.match(bulk, /where: \{ id: input\.batchId, clientId: input\.clientId \}/);
});

test("el reinicio solo borra ImportBatch del cliente AVIAT operativo", () => {
  assert.match(reset, /tx\.importBatch\.deleteMany\(\{\s*where:\s*\{\s*clientId:\s*aviatId\s*\}\s*\}\)/);
  assert.match(reset, /tx\.importBatch\.count\(\{\s*where:\s*clientWhere\s*\}\)/);
  assert.doesNotMatch(reset, /role:\s*"ADMIN"/);
  assert.doesNotMatch(reset, /createdBy:\s*\{\s*OR:/);
});
