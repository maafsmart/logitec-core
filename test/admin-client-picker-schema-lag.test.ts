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
const pickerSrc = readFileSync(new URL("../src/modules/clients/client-picker-query.ts", import.meta.url), "utf8");
const js = readFileSync(new URL("../public/dashboard.js", import.meta.url), "utf8");

const LEGACY_ROW = {
  id: "cl_tenant_norte",
  name: "Tenant Norte",
  active: true,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-02T00:00:00.000Z")
};

function missingColumn(column: string) {
  return new Prisma.PrismaClientKnownRequestError(`The column \`${column}\` does not exist in the current database.`, {
    code: "P2022",
    clientVersion: "5.22.0",
    meta: { column }
  });
}

function duckMissingColumn(column: string) {
  return {
    code: "P2022",
    message: `The column \`${column}\` does not exist in the current database.`,
    meta: { column }
  };
}

function sqlParts(query: unknown) {
  const record = query as { strings?: string[]; values?: unknown[] };
  if (record && typeof record === "object" && Array.isArray(record.strings)) {
    return { text: record.strings.join(" "), values: record.values ?? [] };
  }
  return { text: String(query ?? ""), values: [] as unknown[] };
}

function pickerDb(
  handler: (args: Record<string, unknown>) => Promise<unknown>,
  queryRaw?: (query: Prisma.Sql) => Promise<unknown>
): ClientPickerDb {
  const db: ClientPickerDb = {
    client: {
      findMany: async (args) => {
        const result = await handler(args);
        return Array.isArray(result) ? result : [];
      },
      findUnique: async (args) => handler(args)
    }
  };
  if (queryRaw) db.$queryRaw = queryRaw;
  return db;
}

test("P2022 de columna faltante se reconoce como schema lag", () => {
  assert.equal(isMissingSchemaObjectError(missingColumn("Client.code")), true);
  assert.equal(isMissingSchemaObjectError(new Error("boom")), false);
});

test("P2021/P2022 se reconocen por error.code sin instanceof", () => {
  assert.equal(isMissingSchemaObjectError(duckMissingColumn("Client.code")), true);
  assert.equal(isMissingSchemaObjectError({ code: "P2021", message: 'The table `Client` does not exist' }), true);
  assert.equal(isMissingSchemaObjectError({ code: "P2002", message: "unique" }), false);
});

test("errores de auth no se tratan como schema lag", () => {
  assert.equal(isMissingSchemaObjectError({ statusCode: 401, message: "Token no proporcionado" }), false);
  assert.equal(isMissingSchemaObjectError({ status: 403, code: "P2022", message: "column" }), false);
  assert.equal(isMissingSchemaObjectError({ code: "PASSWORD_CHANGE_REQUIRED", message: "x" }), false);
  assert.equal(isMissingSchemaObjectError({ name: "JsonWebTokenError", message: "invalid" }), false);
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

test("si todos los selects Prisma ricos fallan, el SQL legacy devuelve el cliente y se serializa", async () => {
  const sqlCalls: Array<{ text: string; values: unknown[] }> = [];
  const db = pickerDb(
    async () => {
      throw duckMissingColumn("Client.code");
    },
    async (query) => {
      const parts = sqlParts(query);
      sqlCalls.push(parts);
      assert.match(parts.text, /SELECT\s+"id",\s+"name",\s+"active",\s+"createdAt",\s+"updatedAt"/);
      assert.match(parts.text, /FROM\s+"Client"/);
      assert.doesNotMatch(parts.text, /_count|legalName|tradeName|"code"|JOIN|projects/i);
      assert.doesNotMatch(parts.text, /AVIAT/i);
      return [{ ...LEGACY_ROW }];
    }
  );
  const rows = await findClientsForPicker(db, { where: {}, orderBy: [], take: 200 });
  assert.equal(sqlCalls.length, 1);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].id, "cl_tenant_norte");
  assert.equal(rows[0].name, "Tenant Norte");
  assert.equal(rows[0].code, undefined);
  assert.deepEqual(serializeOperationalClient(rows[0]), {
    id: "cl_tenant_norte",
    code: "Tenant Norte",
    name: "Tenant Norte",
    tradeName: null,
    legalName: null,
    active: true
  });
});

test("select-client SQL legacy filtra por id exacto y serializa", async () => {
  const sqlCalls: Array<{ text: string; values: unknown[] }> = [];
  const db = pickerDb(
    async () => {
      throw duckMissingColumn("Client.code");
    },
    async (query) => {
      const parts = sqlParts(query);
      sqlCalls.push(parts);
      assert.match(parts.text, /WHERE\s+"id"\s*=/);
      assert.equal(parts.values[0], "cl_tenant_norte");
      assert.doesNotMatch(parts.text, /AVIAT/i);
      return [{ ...LEGACY_ROW }];
    }
  );
  const client = await findClientForSelect(db, "cl_tenant_norte");
  assert.ok(client);
  assert.equal(sqlCalls.length, 1);
  assert.equal(client.id, "cl_tenant_norte");
  assert.equal(serializeOperationalClient(client).code, "Tenant Norte");
});

test("picker scoped por tenant usa id exacto en el SQL legacy y no lista toda la tabla", async () => {
  const sqlCalls: Array<{ text: string; values: unknown[] }> = [];
  const db = pickerDb(
    async () => {
      throw duckMissingColumn("Client.code");
    },
    async (query) => {
      const parts = sqlParts(query);
      sqlCalls.push(parts);
      assert.match(parts.text, /WHERE\s+"id"\s*=/);
      assert.equal(parts.values[0], "cl_tenant_norte");
      return [{ ...LEGACY_ROW }];
    }
  );
  const rows = await findClientsForPicker(db, {
    where: { id: "cl_tenant_norte" },
    orderBy: [],
    take: 200
  });
  assert.equal(sqlCalls.length, 1);
  assert.equal(rows[0].id, "cl_tenant_norte");
});

test("picker scoped sin clientId no dispara SQL de listado global", async () => {
  let sqlCalls = 0;
  const db = pickerDb(
    async () => {
      throw duckMissingColumn("Client.code");
    },
    async () => {
      sqlCalls += 1;
      return [{ ...LEGACY_ROW }];
    }
  );
  const rows = await findClientsForPicker(db, { where: { id: "" }, orderBy: [], take: 200 });
  assert.equal(sqlCalls, 0);
  assert.deepEqual(rows, []);
});

test("401 de auth se propaga y no cae al SQL legacy", async () => {
  let sqlCalls = 0;
  const db = pickerDb(
    async () => {
      throw Object.assign(new Error("Token no proporcionado"), { statusCode: 401 });
    },
    async () => {
      sqlCalls += 1;
      return [{ ...LEGACY_ROW }];
    }
  );
  await assert.rejects(
    () => findClientsForPicker(db, { where: {}, orderBy: [], take: 200 }),
    (err: unknown) => (err as { statusCode?: number }).statusCode === 401
  );
  assert.equal(sqlCalls, 0);
});

test("rutas ADMIN picker y select-client usan el fallback de schema lag", () => {
  assert.match(clientsSrc, /findClientsForPicker/);
  assert.match(authSrc, /findClientForSelect/);
  assert.match(authSrc, /serializeOperationalClient/);
  assert.match(js, /async function loadAdminClientCatalog/);
  assert.match(js, /authenticatedFetch\("\/api\/clients"\)/);
  assert.match(js, /\/api\/auth\/select-client/);
  assert.match(js, /if \(!response \|\| !response.ok\) return row/);
  assert.match(js, /function adminClientCatalogLoadError/);
  assert.match(js, /No se pudieron cargar los clientes\. HTTP \$\{response\.status\}/);
  const gateHelper = js.slice(
    js.indexOf("function adminClientCatalogLoadError"),
    js.indexOf("async function loadAdminClientCatalog")
  );
  assert.doesNotMatch(gateHelper, /token|Bearer|accessToken/i);
  assert.doesNotMatch(pickerSrc, /AVIAT/);
  assert.match(pickerSrc, /WHERE "id" = \$\{/);
  assert.match(pickerSrc, /SELECT "id", "name", "active", "createdAt", "updatedAt"/);
});
