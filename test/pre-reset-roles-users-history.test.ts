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
  HISTORY_CATEGORIES,
  OPERATIONAL_HISTORY_CONFIRMATION,
  OPERATIONAL_HISTORY_DECISION,
  OPERATIONAL_HISTORY_POLICY,
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

function matchesClient(where: unknown, clientId: string | null | undefined): boolean {
  if (!where || typeof where !== "object") return true;
  const record = where as Record<string, unknown>;
  if ("clientId" in record) {
    if (record.clientId === null) return clientId == null;
    if (typeof record.clientId === "string") return record.clientId === clientId;
  }
  if (record.inventory && typeof record.inventory === "object") {
    return matchesClient(record.inventory, clientId);
  }
  if (record.project && typeof record.project === "object") {
    return matchesClient(record.project, clientId);
  }
  if (record.requisition && typeof record.requisition === "object") {
    return matchesClient(record.requisition, clientId);
  }
  if (record.requisitionLine && typeof record.requisitionLine === "object") {
    return matchesClient(record.requisitionLine, clientId);
  }
  if (Array.isArray(record.OR)) {
    return record.OR.some((part) => matchesClient(part, clientId));
  }
  return true;
}

function deleteByClient<T extends { clientId?: string | null }>(rows: T[], where?: { clientId?: string }) {
  const before = rows.length;
  const next = rows.filter((row) => (where?.clientId ? row.clientId !== where.clientId : false));
  rows.length = 0;
  rows.push(...next);
  return { count: before - rows.length };
}

function createHistoryDb() {
  const state = {
    clients: [AVIAT, OTHER],
    incidents: [
      { id: "inc-a1", clientId: AVIAT.id, type: "WRONG_LOCATION", status: "OPEN", createdAt: new Date("2026-08-14T19:46:00Z"), warehouse: "TULTITLAN24", notes: "numeros adicionales" },
      { id: "inc-a2", clientId: AVIAT.id, type: "WRONG_LOCATION", status: "RESOLVED", createdAt: new Date("2026-08-05T05:11:00Z"), warehouse: "TULTITLAN24", notes: "PRUEBA DE INCIDENCIA DEMO" },
      { id: "inc-a3", clientId: AVIAT.id, type: "STOCK_MISMATCH", status: "RESOLVED", createdAt: new Date("2026-08-04T07:46:00Z"), warehouse: "TULTITLAN24", notes: "prueba manual" },
      { id: "inc-c2", clientId: OTHER.id, type: "DAMAGED", status: "OPEN", createdAt: new Date(), warehouse: "WH2", notes: "otro cliente" }
    ],
    comments: [
      { id: "c-a", clientId: AVIAT.id },
      { id: "c-2", clientId: OTHER.id }
    ],
    movements: [
      { id: "m-a", clientId: AVIAT.id, taskId: "t-a", requisitionLineId: "rl-a" },
      { id: "m-2", clientId: OTHER.id, taskId: "t-2", requisitionLineId: null }
    ],
    scans: [
      { id: "s-a", clientId: AVIAT.id },
      { id: "s-2", clientId: OTHER.id }
    ],
    activity: [
      { id: "al-a", clientId: AVIAT.id },
      { id: "al-global", clientId: null },
      { id: "al-2", clientId: OTHER.id }
    ],
    tasks: [
      { id: "t-a", clientId: AVIAT.id, requisitionId: "rq-a" },
      { id: "t-2", clientId: OTHER.id, requisitionId: "rq-2" }
    ],
    requisitions: [
      { id: "rq-a", clientId: AVIAT.id },
      { id: "rq-2", clientId: OTHER.id }
    ],
    importBatches: [
      { id: "ib-a", clientId: AVIAT.id },
      { id: "ib-2", clientId: OTHER.id }
    ],
    reservations: [
      { id: "res-a", clientId: AVIAT.id, inventoryId: "inv-a", inventoryLayerId: "ly-a", qty: 2, consumedQty: 0, releasedQty: 0 },
      { id: "res-2", clientId: OTHER.id, inventoryId: "inv-2", inventoryLayerId: "ly-2", qty: 5, consumedQty: 0, releasedQty: 0 }
    ],
    inventories: [
      { id: "inv-a", clientId: AVIAT.id, qty: 10, reservedQty: 2 },
      { id: "inv-2", clientId: OTHER.id, qty: 8, reservedQty: 5 }
    ],
    layers: [
      { id: "ly-a", reservedQty: 2 },
      { id: "ly-2", reservedQty: 5 }
    ],
    users: 4,
    products: 2,
    warehouses: 1,
    locations: 3,
    projects: 2
  };

  const byClient = <T extends { clientId?: string | null }>(rows: T[], where?: unknown) =>
    rows.filter((row) => matchesClient(where, row.clientId ?? null));

  const tx = {
    incident: {
      findMany: async ({ where }: { where?: { clientId?: string } }) => byClient(state.incidents, where),
      count: async ({ where }: { where?: { clientId?: string } }) => byClient(state.incidents, where).length,
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
      count: async ({ where }: { where?: { clientId?: string } }) => byClient(state.comments, where).length,
      deleteMany: async ({ where }: { where?: { clientId?: string } }) => deleteByClient(state.comments, where)
    },
    inventory: {
      count: async ({ where }: { where?: { clientId?: string } }) => byClient(state.inventories, where).length,
      update: async ({ where, data }: { where: { id: string }; data: { reservedQty?: { decrement: { toString(): string } | number } } }) => {
        const row = state.inventories.find((item) => item.id === where.id);
        if (row && data.reservedQty?.decrement != null) {
          row.reservedQty -= Number(data.reservedQty.decrement);
        }
        return row;
      }
    },
    inventoryLayer: {
      update: async ({ where, data }: { where: { id: string }; data: { reservedQty?: { decrement: { toString(): string } | number } } }) => {
        const row = state.layers.find((item) => item.id === where.id);
        if (row && data.reservedQty?.decrement != null) {
          row.reservedQty -= Number(data.reservedQty.decrement);
        }
        return row;
      }
    },
    inventoryMovement: {
      count: async ({ where }: { where?: { clientId?: string } }) => byClient(state.movements, where).length,
      updateMany: async ({ where, data }: { where?: { clientId?: string }; data: Record<string, unknown> }) => {
        const rows = byClient(state.movements, where);
        for (const row of rows) Object.assign(row, data);
        return { count: rows.length };
      },
      deleteMany: async ({ where }: { where?: { clientId?: string } }) => deleteByClient(state.movements, where)
    },
    scanEvent: {
      count: async ({ where }: { where?: { clientId?: string } }) => byClient(state.scans, where).length,
      deleteMany: async ({ where }: { where?: { clientId?: string } }) => deleteByClient(state.scans, where)
    },
    activityLog: {
      count: async ({ where }: { where?: { clientId?: string | null } }) => byClient(state.activity, where).length,
      deleteMany: async ({ where }: { where?: { clientId?: string } }) => deleteByClient(state.activity, where)
    },
    task: {
      count: async ({ where }: { where?: { clientId?: string } }) => byClient(state.tasks, where).length,
      findMany: async ({ where }: { where?: { clientId?: string } }) => byClient(state.tasks, where),
      updateMany: async ({ where, data }: { where?: { id?: { in: string[] } }; data: Record<string, unknown> }) => {
        const rows = state.tasks.filter((row) => !where?.id?.in || where.id.in.includes(row.id));
        for (const row of rows) Object.assign(row, data);
        return { count: rows.length };
      },
      deleteMany: async ({ where }: { where?: { id?: { in: string[] }; clientId?: string } }) => {
        const before = state.tasks.length;
        state.tasks = state.tasks.filter((row) => (where?.id?.in ? !where.id.in.includes(row.id) : row.clientId !== where?.clientId));
        return { count: before - state.tasks.length };
      }
    },
    requisition: {
      count: async ({ where }: { where?: unknown }) => {
        const clientId =
          where && typeof where === "object" && "project" in where
            ? (where as { project?: { clientId?: string } }).project?.clientId
            : (where as { clientId?: string } | undefined)?.clientId;
        return state.requisitions.filter((row) => !clientId || row.clientId === clientId).length;
      },
      deleteMany: async ({ where }: { where?: unknown }) => {
        const clientId =
          where && typeof where === "object" && "project" in where
            ? (where as { project?: { clientId?: string } }).project?.clientId
            : (where as { clientId?: string } | undefined)?.clientId;
        const before = state.requisitions.length;
        state.requisitions = state.requisitions.filter((row) => row.clientId !== clientId);
        return { count: before - state.requisitions.length };
      }
    },
    importBatch: {
      count: async ({ where }: { where?: { clientId?: string } }) => byClient(state.importBatches, where).length,
      deleteMany: async ({ where }: { where?: { clientId?: string } }) => deleteByClient(state.importBatches, where)
    },
    inventoryReservation: {
      count: async ({ where }: { where?: unknown }) => byClient(state.reservations, where).length,
      findMany: async ({ where }: { where?: unknown }) => byClient(state.reservations, where),
      deleteMany: async ({ where }: { where?: { id?: { in: string[] } } }) => {
        const before = state.reservations.length;
        state.reservations = state.reservations.filter((row) => !where?.id?.in || !where.id.in.includes(row.id));
        return { count: before - state.reservations.length };
      }
    },
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
  assert.match(html, /id="historyCleanAll"/);
  assert.match(html, /avatarUrl/);
  assert.match(sliceFunction(js, "selectedHistoryCategories"), /historyCleanAll/);
});

test("selección de historial admite all y no exige IDs de incidencias", () => {
  assert.throws(() => assertHistoryCategorySelection({}), /categoría/);
  const incidents = assertHistoryCategorySelection({ categories: ["incidents"] });
  assert.deepEqual(incidents.categories, ["incidents"]);
  const all = assertHistoryCategorySelection({ categories: ["all"] });
  assert.deepEqual(all.categories, [...HISTORY_CATEGORIES]);
});

test("preview de historial aísla AVIAT y no ejecuta", async () => {
  const { state, db } = createHistoryDb();
  const preview = await previewOperationalHistoryCleanup({ clientId: AVIAT.id }, db as never);
  assert.equal(preview.executesAutomatically, false);
  assert.equal(preview.policy, OPERATIONAL_HISTORY_POLICY);
  assert.equal(preview.decision, OPERATIONAL_HISTORY_DECISION);
  assert.equal(preview.canReachZeroOperationalHistory, true);
  assert.equal(preview.counts.incidents.total, 3);
  assert.equal(preview.counts.comments.total, 1);
  assert.equal(preview.counts.movements.total, 1);
  assert.equal(preview.integrity.cannotPurgeWithoutTouchingMasters.length, 0);
  assert.ok(preview.counts.incidents.records.some((row) => /numeros adicionales/i.test(row.notesPreview)));
  assert.ok(preview.counts.incidents.records.some((row) => /PRUEBA DE INCIDENCIA DEMO/i.test(row.notesPreview)));
  assert.equal(preview.mastersRetained.users, 4);
  assert.equal(state.incidents.length, 4);
  const other = await previewOperationalHistoryCleanup({ clientId: OTHER.id }, db as never);
  assert.equal(other.isAviat, false);
  assert.equal(other.counts.incidents.total, 0);
});

test("execute all llega a cero historial AVIAT y no toca maestros ni otro cliente", async () => {
  const { state, db } = createHistoryDb();
  const result = await executeOperationalHistoryCleanup(
    { userId: "u-admin", clientId: AVIAT.id },
    { confirmation: OPERATIONAL_HISTORY_CONFIRMATION, categories: ["all"] },
    db as never
  );
  assert.equal(result.reachedZeroOperationalHistory, true);
  assert.equal(result.deleted.incidents, 3);
  assert.equal(result.deleted.comments, 1);
  assert.equal(result.deleted.movements, 1);
  assert.equal(result.deleted.reservationsReleased, 1);
  assert.equal(state.incidents.some((row) => row.clientId === OTHER.id), true);
  assert.equal(state.comments.some((row) => row.clientId === OTHER.id), true);
  assert.equal(state.movements.some((row) => row.clientId === OTHER.id), true);
  assert.equal(state.inventories.find((row) => row.id === "inv-a")?.qty, 10);
  assert.equal(state.inventories.find((row) => row.id === "inv-a")?.reservedQty, 0);
  assert.equal(state.inventories.find((row) => row.id === "inv-2")?.reservedQty, 5);
  assert.equal(state.users, 4);
  assert.equal(state.products, 2);
  assert.equal(state.warehouses, 1);
  assert.equal(state.projects, 2);
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
