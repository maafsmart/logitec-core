import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, test } from "node:test";
import bcrypt from "bcryptjs";
import { readFileSync } from "node:fs";
import { app } from "../src/app.js";
import { prisma } from "../src/db/prisma.js";
import { signAccessToken } from "../src/middlewares/auth.middleware.js";
import { canExposeEconomicValuation } from "../src/modules/inventory/inventory-economic-access.js";
import {
  OPERATIONAL_HISTORY_CONFIRMATION,
  OPERATIONAL_HISTORY_DECISION,
  assertHistoryCategorySelection,
  executeOperationalHistoryCleanup,
  previewOperationalHistoryCleanup
} from "../src/modules/admin/operational-history.service.js";
import { generateTemporaryPassword } from "../src/modules/users/user-profile.js";

const html = readFileSync(new URL("../public/dashboard.html", import.meta.url), "utf8");
const js = readFileSync(new URL("../public/dashboard.js", import.meta.url), "utf8");
const usersRoutes = readFileSync(new URL("../src/modules/users/users.routes.ts", import.meta.url), "utf8");
const authRoutes = readFileSync(new URL("../src/modules/auth/auth.routes.ts", import.meta.url), "utf8");
const adminRoutes = readFileSync(new URL("../src/modules/admin/admin.routes.ts", import.meta.url), "utf8");
const physicalReset = readFileSync(new URL("../src/modules/inventory/physical-reset.service.ts", import.meta.url), "utf8");

function sliceFunction(source: string, name: string): string {
  const token = `function ${name}(`;
  const start = source.indexOf(token);
  assert.ok(start >= 0, `missing function ${name}`);
  const from = source.lastIndexOf("\n", start) >= 0 ? source.lastIndexOf("\n", start) + 1 : start;
  const next = source.indexOf("\nfunction ", start + token.length);
  const nextAsync = source.indexOf("\nasync function ", start + token.length);
  const candidates = [next, nextAsync].filter((n) => n >= 0);
  const end = candidates.length ? Math.min(...candidates) : source.length;
  return source.slice(from, end);
}

const AVIAT = { id: "client-aviat", code: "AVIAT", name: "AVIAT", tradeName: "AVIAT", legalName: "AVIAT", active: true };
const OTHER = { id: "client-2", code: "CLI2", name: "Cliente 2", tradeName: "Cliente 2", legalName: "C2", active: true };
const passwordHash = bcrypt.hashSync("secret12", 4);
const users = {
  admin: { id: "u-admin", email: "admin@test.local", fullName: "Admin", role: "ADMIN" as const, isActive: true, clientId: null, client: null, passwordHash, mustChangePassword: false },
  supervisor: { id: "u-sup", email: "sup@test.local", fullName: "Sup", role: "SUPERVISOR" as const, isActive: true, clientId: AVIAT.id, client: AVIAT, passwordHash, mustChangePassword: false },
  operator: { id: "u-op", email: "op@test.local", fullName: "Op", role: "OPERATOR" as const, isActive: true, clientId: AVIAT.id, client: AVIAT, passwordHash, mustChangePassword: false },
  client: { id: "u-cli", email: "cli@test.local", fullName: "Cli", role: "CLIENT" as const, isActive: true, clientId: AVIAT.id, client: AVIAT, passwordHash, mustChangePassword: false }
};

let lastUserUpdate: { id?: string; data?: Record<string, unknown> } = {};
const originals: Array<{ model: string; method: string; fn: unknown }> = [];

function stub(model: string, method: string, fn: (...args: never[]) => unknown) {
  const delegate = (prisma as unknown as Record<string, Record<string, unknown>>)[model];
  originals.push({ model, method, fn: delegate[method] });
  delegate[method] = fn;
}

function restore() {
  for (const item of originals.splice(0)) {
    (prisma as unknown as Record<string, Record<string, unknown>>)[item.model][item.method] = item.fn as never;
  }
}

function tokenFor(user: (typeof users)[keyof typeof users], operationalClientId?: string | null) {
  return signAccessToken({
    userId: user.id,
    role: user.role,
    email: user.email,
    operationalClientId: operationalClientId === undefined ? user.clientId : operationalClientId
  });
}

let server: http.Server;
let baseUrl = "";

async function request(path: string, options: { method?: string; token?: string; body?: unknown } = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: options.method || "GET",
    headers: {
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
      ...(options.body ? { "Content-Type": "application/json" } : {})
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const text = await response.text();
  let json: Record<string, unknown> | unknown[] | null = null;
  try {
    json = text ? (JSON.parse(text) as Record<string, unknown>) : null;
  } catch {
    json = null;
  }
  return { status: response.status, json, text };
}

function countByClient<T extends { clientId?: string | null }>(rows: T[], clientId?: string) {
  return rows.filter((row) => !clientId || row.clientId === clientId).length;
}

function createHistoryDb() {
  const state = {
    clients: [AVIAT, OTHER],
    incidents: [
      { id: "inc-a1", clientId: AVIAT.id, type: "DAMAGED", status: "OPEN", createdAt: new Date(), warehouse: "WH", notes: "ensayo AVIAT" },
      { id: "inc-c2", clientId: OTHER.id, type: "DAMAGED", status: "OPEN", createdAt: new Date(), warehouse: "WH2", notes: "otro cliente" }
    ],
    comments: [
      { id: "c-a", clientId: AVIAT.id },
      { id: "c-2", clientId: OTHER.id }
    ],
    users: 4,
    products: 2,
    warehouses: 1,
    locations: 3,
    projects: 2
  };
  const tx = {
    incident: {
      findMany: async ({ where }: { where?: { clientId?: string } }) =>
        state.incidents.filter((row) => !where?.clientId || row.clientId === where.clientId),
      deleteMany: async ({ where }: { where?: { clientId?: string; id?: { in: string[] }; type?: { in: string[] } } }) => {
        const before = state.incidents.length;
        state.incidents = state.incidents.filter((row) => {
          if (where?.clientId && row.clientId !== where.clientId) return true;
          if (where?.id?.in && !where.id.in.includes(row.id)) return true;
          if (where?.type?.in && !where.type.in.includes(row.type)) return true;
          return false;
        });
        return { count: before - state.incidents.length };
      }
    },
    comment: {
      count: async ({ where }: { where?: { clientId?: string } }) => countByClient(state.comments, where?.clientId),
      deleteMany: async ({ where }: { where?: { clientId?: string } }) => {
        const before = state.comments.length;
        state.comments = state.comments.filter((row) => row.clientId !== where?.clientId);
        return { count: before - state.comments.length };
      }
    },
    inventory: { count: async () => 0 },
    inventoryMovement: { count: async () => 0 },
    scanEvent: { count: async () => 0 },
    activityLog: { count: async () => 0 },
    task: { count: async () => 0 },
    requisition: { count: async () => 0 },
    importBatch: { count: async () => 0 },
    user: { count: async () => state.users },
    product: { count: async () => state.products },
    warehouse: { count: async () => state.warehouses },
    location: { count: async () => state.locations },
    customer: { count: async () => state.projects },
    client: {
      findMany: async () => state.clients,
      count: async () => state.clients.length
    }
  };
  return {
    state,
    db: {
      $transaction: async <T>(fn: (client: typeof tx) => Promise<T>) => fn(tx)
    }
  };
}

test("matriz de roles: precios, import, users y maestros", () => {
  assert.equal(canExposeEconomicValuation("ADMIN"), true);
  assert.equal(canExposeEconomicValuation("SUPERVISOR"), true);
  assert.equal(canExposeEconomicValuation("CLIENT"), true);
  assert.equal(canExposeEconomicValuation("OPERATOR"), false);
  assert.match(sliceFunction(js, "canSeeEconomicValuation"), /\["ADMIN", "SUPERVISOR", "CLIENT"\]/);
  assert.match(sliceFunction(js, "canEditEconomicValuation"), /currentRole === "ADMIN"/);
  assert.match(sliceFunction(js, "applyRoleNavigation"), /btn\.disabled = false/);
  assert.match(js, /SUPERVISOR:[\s\S]{0,400}"account"/);
  assert.doesNotMatch(js, /SUPERVISOR:[\s\S]{0,400}"users"/);
  assert.doesNotMatch(js, /OPERATOR:[\s\S]{0,400}"users"/);
  assert.doesNotMatch(js, /CLIENT:[\s\S]{0,400}"config"/);
  assert.match(usersRoutes, /requireRole\(\["ADMIN"\]\)/);
  assert.match(usersRoutes, /\/:id\/reset-password"/);
  assert.match(usersRoutes, /select: USER_PUBLIC_SELECT/);
  assert.doesNotMatch(usersRoutes, /select:[\s\S]{0,120}passwordHash/);
  assert.match(authRoutes, /authRouter\.patch\("\/me"/);
  assert.match(authRoutes, /SELF_ESCALATION_FORBIDDEN/);
  assert.match(adminRoutes, /operational-history\/preview"/);
  assert.match(adminRoutes, /requireRole\(\["ADMIN"\]\)/);
  assert.match(html, /no forman parte de este reset de inventario|no borra/);
  assert.doesNotMatch(physicalReset, /incident\.deleteMany/);
});

test("UI ficha, reset de contraseña y historial no se autoejecutan", () => {
  assert.match(html, /id="editUserForm"/);
  assert.match(html, /id="accountProfileForm"/);
  assert.match(html, /id="resetPasswordModal"/);
  assert.match(html, /id="operationalHistorySection"/);
  assert.match(html, /id="mustChangePasswordBanner"/);
  assert.match(js, /data-reset-password-user/);
  assert.match(js, /\/api\/users\/\$\{encodeURIComponent\(id\)\}\/reset-password/);
  assert.match(js, /\/api\/admin\/operational-history\/preview/);
  assert.match(sliceFunction(js, "syncHistoryExecuteEnabled"), /LIMPIAR HISTORIAL OPERATIVO DE AVIAT/);
  assert.match(sliceFunction(js, "loadOperationalHistoryPreview"), /authenticatedFetch\("\/api\/admin\/operational-history\/preview"\)/);
  assert.doesNotMatch(sliceFunction(js, "validateSession"), /loadOperationalHistoryPreview/);
  assert.doesNotMatch(sliceFunction(js, "loadOperationalWorkspace"), /operational-history\/cleanup/);
  assert.doesNotMatch(html, /passwordHash/);
});

test("selección de historial exige categoría; incidents no se borran en bloque", () => {
  assert.throws(() => assertHistoryCategorySelection({}), /categoría/);
  assert.throws(
    () => assertHistoryCategorySelection({ categories: ["incidents"] }),
    (error: { code?: string }) => error.code === OPERATIONAL_HISTORY_DECISION
  );
  const ok = assertHistoryCategorySelection({ categories: ["incidents"], incidentIds: ["inc-a1"] });
  assert.deepEqual(ok.incidentIds, ["inc-a1"]);
});

test("preview de historial aísla AVIAT y no ejecuta", async () => {
  const { state, db } = createHistoryDb();
  const preview = await previewOperationalHistoryCleanup({ clientId: AVIAT.id }, db as never);
  assert.equal(preview.executesAutomatically, false);
  assert.equal(preview.decision, OPERATIONAL_HISTORY_DECISION);
  assert.equal(preview.leftoverOutsideInventoryReset.incidents.total, 1);
  assert.equal(preview.leftoverOutsideInventoryReset.comments.total, 1);
  assert.equal(preview.mastersRetained.users, 4);
  assert.equal(state.incidents.length, 2);
  const other = await previewOperationalHistoryCleanup({ clientId: OTHER.id }, db as never);
  assert.equal(other.isAviat, false);
  assert.equal(other.leftoverOutsideInventoryReset.incidents.total, 0);
});

test("execute historial borra solo selección AVIAT y no maestros ni otro cliente", async () => {
  const { state, db } = createHistoryDb();
  const result = await executeOperationalHistoryCleanup(
    { userId: "u-admin", clientId: AVIAT.id },
    { confirmation: OPERATIONAL_HISTORY_CONFIRMATION, categories: ["incidents", "comments"], incidentIds: ["inc-a1"] },
    db as never
  );
  assert.equal(result.deleted.incidents, 1);
  assert.equal(result.deleted.comments, 1);
  assert.equal(state.incidents.some((row) => row.id === "inc-c2"), true);
  assert.equal(state.comments.some((row) => row.clientId === OTHER.id), true);
  assert.equal(state.users, 4);
  assert.equal(state.products, 2);
  await assert.rejects(
    () =>
      executeOperationalHistoryCleanup(
        { userId: "u-admin", clientId: OTHER.id },
        { confirmation: OPERATIONAL_HISTORY_CONFIRMATION, categories: ["comments"] },
        db as never
      ),
    /AVIAT/
  );
});

before(async () => {
  stub("user", "findUnique", async ({ where }: { where: { id?: string; email?: string } }) =>
    Object.values(users).find((row) => row.id === where.id || row.email === where.email) || null
  );
  stub("user", "findMany", async () => Object.values(users));
  stub("user", "update", async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
    lastUserUpdate = { id: where.id, data };
    const current = Object.values(users).find((row) => row.id === where.id);
    if (data.passwordHash && current) current.passwordHash = String(data.passwordHash);
    if (data.mustChangePassword !== undefined && current) current.mustChangePassword = Boolean(data.mustChangePassword);
    if (data.fullName && current) current.fullName = String(data.fullName);
    return { ...current, ...data, id: where.id, client: current?.client || null };
  });
  stub("client", "findUnique", async ({ where }: { where: { id?: string } }) =>
    [AVIAT, OTHER].find((row) => row.id === where.id) || null
  );
  server = http.createServer(app);
  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address() as AddressInfo;
      baseUrl = `http://127.0.0.1:${address.port}`;
      resolve();
    });
  });
});

after(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
  restore();
});

test("HTTP users/reset/history: solo ADMIN; otros 403", async () => {
  const admin = tokenFor(users.admin, AVIAT.id);
  const list = await request("/api/users", { token: admin });
  assert.equal(list.status, 200);
  for (const user of [users.supervisor, users.operator, users.client]) {
    const token = tokenFor(user);
    assert.equal((await request("/api/users", { token })).status, 403, `${user.role} users`);
    assert.equal(
      (await request("/api/users/u-op/reset-password", { method: "POST", token, body: {} })).status,
      403,
      `${user.role} reset`
    );
    assert.equal((await request("/api/admin/operational-history/preview", { token })).status, 403, `${user.role} history`);
    assert.equal(
      (
        await request("/api/admin/operational-history/cleanup", {
          method: "POST",
          token,
          body: { confirmation: OPERATIONAL_HISTORY_CONFIRMATION, categories: ["comments"] }
        })
      ).status,
      403,
      `${user.role} cleanup`
    );
  }
});

test("HTTP reset ADMIN asigna temporal, no desactiva y no expone hash", async () => {
  lastUserUpdate = {};
  const admin = tokenFor(users.admin, AVIAT.id);
  const res = await request("/api/users/u-op/reset-password", { method: "POST", token: admin, body: {} });
  assert.equal(res.status, 200);
  const json = res.json as Record<string, unknown>;
  assert.equal(typeof json.temporaryPassword, "string");
  assert.ok(String(json.temporaryPassword).length >= 6);
  assert.equal(json.mustChangePassword, true);
  assert.equal(json.shownOnce, true);
  assert.ok(!("passwordHash" in json));
  assert.equal(json.isActive, true);
  assert.equal(lastUserUpdate.data?.mustChangePassword, true);
  assert.equal(lastUserUpdate.data?.isActive, undefined);
  assert.ok(await bcrypt.compare(String(json.temporaryPassword), users.operator.passwordHash));
  const oldStillWorks = await bcrypt.compare("secret12", users.operator.passwordHash);
  assert.equal(oldStillWorks, false);
});

test("HTTP Mi cuenta edita ficha propia y no escala rol", async () => {
  const token = tokenFor(users.operator);
  const ok = await request("/api/auth/me", {
    method: "PATCH",
    token,
    body: { fullName: "Operador Editado", phone: "5550001111" }
  });
  assert.equal(ok.status, 200);
  const forbidden = await request("/api/auth/me", {
    method: "PATCH",
    token,
    body: { role: "ADMIN", clientId: OTHER.id }
  });
  assert.equal(forbidden.status, 403);
});

test("temporal generado no es hash y change-password limpia mustChangePassword", () => {
  const temp = generateTemporaryPassword();
  assert.ok(temp.length >= 12);
  assert.doesNotMatch(temp, /\$2[aby]\$/);
  assert.match(authRoutes, /mustChangePassword: false/);
  assert.match(sliceFunction(js, "applyMustChangePasswordGate"), /must-change-password/);
});
