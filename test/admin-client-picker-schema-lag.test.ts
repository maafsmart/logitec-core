import assert from "node:assert/strict";
import { test } from "node:test";
import { Prisma } from "@prisma/client";
import { readFileSync } from "node:fs";
import {
  findClientForSelect,
  findClientsForPicker,
  isMissingSchemaObjectError,
  serializeOperationalClient,
  type ClientPickerDb
} from "../src/modules/clients/client-picker-query.js";

const clientsSrc = readFileSync(new URL("../src/modules/clients/clients.routes.ts", import.meta.url), "utf8");
const authSrc = readFileSync(new URL("../src/modules/auth/auth.routes.ts", import.meta.url), "utf8");
const js = readFileSync(new URL("../public/dashboard.js", import.meta.url), "utf8");

function missingColumn(column: string) {
  return new Prisma.PrismaClientKnownRequestError(`The column \`${column}\` does not exist in the current database.`, {
    code: "P2022",
    clientVersion: "5.22.0",
    meta: { column }
  });
}

function pickerDb(handler: (args: Record<string, unknown>) => Promise<unknown>): ClientPickerDb {
  return {
    client: {
      findMany: async (args) => {
        const result = await handler(args);
        return Array.isArray(result) ? result : [];
      },
      findUnique: async (args) => handler(args)
    }
  };
}

test("P2022 de columna faltante se reconoce como schema lag", () => {
  assert.equal(isMissingSchemaObjectError(missingColumn("Client.code")), true);
  assert.equal(isMissingSchemaObjectError(new Error("boom")), false);
});

test("GET picker cae a columnas base si falta Customer.clientId (_count.projects)", async () => {
  const calls: unknown[] = [];
  const db = pickerDb(async (args) => {
    calls.push(args.select);
    const select = args.select as Record<string, unknown>;
    if (select && "_count" in select) throw missingColumn("Customer.clientId");
    return [{ id: "cl_aviat_official", name: "AVIAT", code: "AVIAT", active: true }];
  });
  const rows = await findClientsForPicker(db, {
    where: {},
    orderBy: [{ active: "desc" }, { name: "asc" }],
    take: 200
  });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].id, "cl_aviat_official");
  assert.equal(rows[0].code, "AVIAT");
  assert.equal(calls.length, 2);
});

test("GET picker cae a id/name/active si falta Client.code", async () => {
  const db = pickerDb(async (args) => {
    const select = args.select as Record<string, unknown>;
    if (select && ("code" in select || "_count" in select)) throw missingColumn("Client.code");
    return [{ id: "cl_aviat_official", name: "AVIAT", active: true }];
  });
  const rows = await findClientsForPicker(db, { where: {}, orderBy: [], take: 200 });
  assert.equal(rows[0].id, "cl_aviat_official");
  assert.equal(rows[0].name, "AVIAT");
  assert.equal(rows[0].code, undefined);
  const operational = serializeOperationalClient(rows[0]);
  assert.equal(operational.code, "AVIAT");
  assert.equal(operational.name, "AVIAT");
});

test("select-client usa el mismo fallback y no exige _count", async () => {
  const db = pickerDb(async (args) => {
    const select = args.select as Record<string, unknown>;
    if (select && "_count" in select) throw missingColumn("Customer.clientId");
    if (select && "code" in select) throw missingColumn("Client.code");
    return { id: "cl_aviat_official", name: "AVIAT", active: true };
  });
  const client = await findClientForSelect(db, "cl_aviat_official");
  assert.ok(client);
  assert.equal(client.name, "AVIAT");
  assert.deepEqual(serializeOperationalClient(client), {
    id: "cl_aviat_official",
    code: "AVIAT",
    name: "AVIAT",
    tradeName: null,
    legalName: null,
    active: true
  });
});

test("rutas ADMIN picker y select-client usan el fallback de schema lag", () => {
  assert.match(clientsSrc, /findClientsForPicker/);
  assert.match(authSrc, /findClientForSelect/);
  assert.match(authSrc, /serializeOperationalClient/);
  assert.match(js, /async function loadAdminClientCatalog/);
  assert.match(js, /authenticatedFetch\("\/api\/clients"\)/);
  assert.match(js, /\/api\/auth\/select-client/);
  assert.match(js, /if \(!response \|\| !response.ok\) return row/);
});
