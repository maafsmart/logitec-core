import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const schema = readFileSync(new URL("../prisma/schema.prisma", import.meta.url), "utf8");

test("schema conserva DATABASE_URL como conexión runtime pooled", () => {
  assert.match(schema, /url\s+=\s+env\("DATABASE_URL"\)/);
});

test("schema expone DIRECT_URL como directUrl para migraciones Prisma", () => {
  assert.match(schema, /directUrl\s+=\s+env\("DIRECT_URL"\)/);
});

test("datasource postgres mantiene provider y ambas URLs", () => {
  const blockStart = schema.indexOf("datasource db {");
  const blockEnd = schema.indexOf("}", blockStart);
  const block = schema.slice(blockStart, blockEnd);
  assert.match(block, /provider\s+=\s+"postgresql"/);
  assert.match(block, /url\s+=\s+env\("DATABASE_URL"\)/);
  assert.match(block, /directUrl\s+=\s+env\("DIRECT_URL"\)/);
});
