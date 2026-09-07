import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, test } from "node:test";
import bcrypt from "bcryptjs";
import { readFileSync } from "node:fs";
import { app } from "../src/app.js";
import { prisma } from "../src/db/prisma.js";
import { signAccessToken } from "../src/middlewares/auth.middleware.js";

const routesSource = readFileSync(
  new URL("../src/modules/provisional-captures/provisional-captures.routes.ts", import.meta.url),
  "utf8"
);
const serviceSource = readFileSync(
  new URL("../src/modules/provisional-captures/provisional-capture.service.ts", import.meta.url),
  "utf8"
);

const AVIAT = {
  id: "client-aviat",
  code: "AVIAT",
  name: "AVIAT",
  tradeName: "AVIAT",
  legalName: "AVIAT SA",
  active: true
};

const passwordHash = bcrypt.hashSync("secret12", 4);
const users = {
  admin: {
    id: "u-admin",
    email: "admin@test.local",
    fullName: "Admin",
    role: "ADMIN" as const,
    isActive: true,
    clientId: null,
    client: null,
    passwordHash,
    mustChangePassword: false
  },
  supervisor: {
    id: "u-sup",
    email: "sup@test.local",
    fullName: "Supervisor",
    role: "SUPERVISOR" as const,
    isActive: true,
    clientId: AVIAT.id,
    client: { ...AVIAT },
    passwordHash,
    mustChangePassword: false
  },
  operator: {
    id: "u-op",
    email: "op@test.local",
    fullName: "Operator",
    role: "OPERATOR" as const,
    isActive: true,
    clientId: AVIAT.id,
    client: { ...AVIAT },
    passwordHash,
    mustChangePassword: false
  },
  clientAviat: {
    id: "u-cli-a",
    email: "aviat@test.local",
    fullName: "Cliente AVIAT",
    role: "CLIENT" as const,
    isActive: true,
    clientId: AVIAT.id,
    client: { ...AVIAT },
    passwordHash,
    mustChangePassword: false
  }
};

const projects = [{ id: "proj-att", code: "ATT", name: "AT&T", clientId: AVIAT.id, active: true }];

type CaptureRow = {
  id: string;
  clientId: string;
  createdById: string;
  declaredActionId: string;
  status: string;
  observation: string | null;
  readings: unknown;
  physicalStartedAt: Date;
  physicalEndedAt: Date;
  executorOperatorMode: boolean;
  device: string | null;
  projectId: string | null;
  reviewerId: string | null;
  reviewType: string | null;
  adminUpdatedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  createdBy: (typeof users)[keyof typeof users];
  reviewer: (typeof users)[keyof typeof users] | null;
  project: (typeof projects)[number] | null;
  reviews: ReviewRow[];
};

type ReviewRow = {
  id: string;
  captureId: string;
  reviewerId: string;
  reviewerRole: string;
  reviewType: string;
  status: string;
  createdAt: Date;
  reviewer: (typeof users)[keyof typeof users];
};

const captures: CaptureRow[] = [];
const reviews: ReviewRow[] = [];
let captureSeq = 0;
let reviewSeq = 0;

const sampleReading = {
  raw: "SKU-ONE",
  normalized: "SKU-ONE",
  classification: "SKU",
  project: "ATT"
};

function userById(id: string) {
  return Object.values(users).find((row) => row.id === id) || null;
}

function hydrateCapture(row: CaptureRow): CaptureRow {
  row.createdBy = userById(row.createdById) || row.createdBy;
  row.reviewer = row.reviewerId ? userById(row.reviewerId) : null;
  row.project = row.projectId ? projects.find((p) => p.id === row.projectId) || null : null;
  row.reviews = reviews
    .filter((r) => r.captureId === row.id)
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
    .map((r) => ({ ...r, reviewer: userById(r.reviewerId) || r.reviewer }));
  return row;
}

const originals: Array<{ model: string; method: string; fn: unknown }> = [];

function stub(model: string, method: string, fn: (...args: never[]) => unknown) {
  const delegate = (prisma as unknown as Record<string, Record<string, unknown>>)[model];
  originals.push({ model, method, fn: delegate[method] });
  delegate[method] = fn;
}

function restorePrisma() {
  for (const item of originals.splice(0)) {
    (prisma as unknown as Record<string, Record<string, unknown>>)[item.model][item.method] = item.fn as never;
  }
}

let server: http.Server;
let baseUrl = "";

function tokenFor(user: (typeof users)[keyof typeof users], operationalClientId?: string | null) {
  return signAccessToken({
    userId: user.id,
    role: user.role,
    email: user.email,
    operationalClientId: operationalClientId === undefined ? user.clientId : operationalClientId
  });
}

async function request(
  path: string,
  options: { method?: string; token?: string; body?: unknown } = {}
) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: options.method || "GET",
    headers: {
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
      ...(options.body ? { "Content-Type": "application/json" } : {})
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const text = await response.text();
  let json: Record<string, unknown> | null = null;
  try {
    json = text ? (JSON.parse(text) as Record<string, unknown>) : null;
  } catch {
    json = null;
  }
  return { status: response.status, text, json };
}

function createBody(overrides: Record<string, unknown> = {}) {
  return {
    declaredActionId: "traslado",
    observation: "obs",
    readings: [sampleReading],
    physicalStartedAt: "2026-09-06T18:00:00.000Z",
    physicalEndedAt: "2026-09-06T18:05:00.000Z",
    ...overrides
  };
}

before(async () => {
  stub("user", "findUnique", async ({ where }: { where: { id?: string; email?: string } }) =>
    Object.values(users).find((row) => row.id === where.id || row.email === where.email) || null
  );
  stub("client", "findUnique", async ({ where }: { where: { id?: string } }) =>
    where.id === AVIAT.id ? { ...AVIAT } : null
  );
  stub("customer", "findFirst", async ({ where }: { where: { clientId?: string; OR?: Array<{ code?: string; name?: string }> } }) => {
    if (where.clientId !== AVIAT.id) return null;
    const code = where.OR?.[0]?.code || where.OR?.[1]?.name;
    return projects.find((p) => p.code === code || p.name === code) || null;
  });
  stub("inventory", "findMany", async ({ where }: { where?: { clientId?: string } }) => {
    if (where?.clientId !== AVIAT.id) return [];
    return [
      {
        project: projects[0],
        product: { sku: "SKU-ONE" }
      }
    ];
  });
  stub("provisionalCapture", "findMany", async ({ where }: { where?: Record<string, unknown> }) => {
    let rows = captures.map((row) => hydrateCapture({ ...row }));
    if (where?.clientId) rows = rows.filter((row) => row.clientId === where.clientId);
    if (where?.createdById) rows = rows.filter((row) => row.createdById === where.createdById);
    if (where?.status) rows = rows.filter((row) => row.status === where.status);
    if (where?.projectId && typeof where.projectId === "object" && (where.projectId as { not: null }).not === null) {
      rows = rows.filter((row) => row.projectId);
    }
    return rows.slice(0, 100);
  });
  stub("provisionalCapture", "findFirst", async ({ where }: { where: Record<string, unknown> }) => {
    const id = typeof where.id === "string" ? where.id : undefined;
    const clientId = typeof where.clientId === "string" ? where.clientId : undefined;
    const row = captures.find((c) => (!id || c.id === id) && (!clientId || c.clientId === clientId));
    return row ? hydrateCapture({ ...row }) : null;
  });
  stub("provisionalCapture", "create", async ({ data, include }: { data: Partial<CaptureRow>; include?: unknown }) => {
    captureSeq += 1;
    const row: CaptureRow = {
      id: `cp-${captureSeq}`,
      clientId: String(data.clientId),
      createdById: String(data.createdById),
      declaredActionId: String(data.declaredActionId),
      status: String(data.status),
      observation: (data.observation as string | null) ?? null,
      readings: data.readings,
      physicalStartedAt: data.physicalStartedAt as Date,
      physicalEndedAt: data.physicalEndedAt as Date,
      executorOperatorMode: Boolean(data.executorOperatorMode),
      device: (data.device as string | null) ?? null,
      projectId: (data.projectId as string | null) ?? null,
      reviewerId: (data.reviewerId as string | null) ?? null,
      reviewType: (data.reviewType as string | null) ?? null,
      adminUpdatedAt: (data.adminUpdatedAt as Date | null) ?? null,
      createdAt: new Date(),
      updatedAt: new Date(),
      createdBy: userById(String(data.createdById))!,
      reviewer: data.reviewerId ? userById(String(data.reviewerId)) : null,
      project: data.projectId ? projects.find((p) => p.id === data.projectId) || null : null,
      reviews: []
    };
    captures.unshift(row);
    void include;
    return hydrateCapture({ ...row });
  });
  stub("provisionalCapture", "update", async ({ where, data, include }: { where: { id: string }; data: Partial<CaptureRow>; include?: unknown }) => {
    const row = captures.find((c) => c.id === where.id);
    assert.ok(row);
    Object.assign(row, data, { updatedAt: new Date() });
    void include;
    return hydrateCapture({ ...row });
  });
  stub("provisionalCapture", "findUniqueOrThrow", async ({ where }: { where: { id: string } }) => {
    const row = captures.find((c) => c.id === where.id);
    assert.ok(row);
    return hydrateCapture({ ...row });
  });
  stub("provisionalCaptureReview", "create", async ({ data, include }: { data: Partial<ReviewRow>; include?: unknown }) => {
    reviewSeq += 1;
    const row: ReviewRow = {
      id: `rev-${reviewSeq}`,
      captureId: String(data.captureId),
      reviewerId: String(data.reviewerId),
      reviewerRole: String(data.reviewerRole),
      reviewType: String(data.reviewType),
      status: String(data.status),
      createdAt: new Date(),
      reviewer: userById(String(data.reviewerId))!
    };
    reviews.push(row);
    void include;
    return row;
  });
  (prisma as unknown as { $transaction: (fn: (tx: typeof prisma) => Promise<unknown>) => Promise<unknown> }).$transaction =
    async (fn) => fn(prisma);

  await new Promise<void>((resolve) => {
    server = app.listen(0, "127.0.0.1", () => {
      baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
      resolve();
    });
  });
});

after(async () => {
  restorePrisma();
  await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
});

test("routes source: tenant scoping and role gates", () => {
  assert.match(routesSource, /requireOperationalClient/);
  assert.match(routesSource, /requireRole\(\["ADMIN", "SUPERVISOR", "OPERATOR"\]\)/);
  assert.match(routesSource, /patch\(\s*"\/:id\/review"/);
  assert.match(routesSource, /requireRole\(\["ADMIN", "SUPERVISOR"\]\)/);
  assert.match(routesSource, /requireNonClient\(req\.auth!/);
  assert.doesNotMatch(serviceSource, /inventory-mutation\.service/);
});

test("operator creates pending capture with auth actor", async () => {
  const res = await request("/api/provisional-captures", {
    method: "POST",
    token: tokenFor(users.operator),
    body: createBody()
  });
  assert.equal(res.status, 201);
  const capture = (res.json as { capture: CaptureRow }).capture;
  assert.equal(capture.createdById, users.operator.id);
  assert.equal(capture.createdBy.fullName, "Operator");
  assert.equal(capture.status, "PENDIENTE DE SUPERVISIÓN");
  assert.equal(capture.clientId, AVIAT.id);
});

test("operator list defaults to own captures only", async () => {
  const res = await request("/api/provisional-captures", { token: tokenFor(users.operator) });
  assert.equal(res.status, 200);
  const items = (res.json as { items: CaptureRow[] }).items;
  assert.ok(items.every((row) => row.createdById === users.operator.id));
});

test("supervisor can review and append history", async () => {
  const createRes = await request("/api/provisional-captures", {
    method: "POST",
    token: tokenFor(users.operator),
    body: createBody()
  });
  const captureId = (createRes.json as { capture: CaptureRow }).capture.id;
  const reviewRes = await request(`/api/provisional-captures/${captureId}/review`, {
    method: "PATCH",
    token: tokenFor(users.supervisor),
    body: { status: "VALIDADO · PENDIENTE DE REGISTRO" }
  });
  assert.equal(reviewRes.status, 200);
  const payload = reviewRes.json as { capture: CaptureRow; reviewEvent: ReviewRow };
  assert.equal(payload.capture.reviewerId, users.supervisor.id);
  assert.equal(payload.capture.reviewer?.fullName, "Supervisor");
  assert.equal(payload.reviewEvent.reviewerId, users.supervisor.id);
  assert.equal(payload.capture.reviews.length, 1);
});

test("operator cannot review", async () => {
  const createRes = await request("/api/provisional-captures", {
    method: "POST",
    token: tokenFor(users.operator),
    body: createBody()
  });
  const captureId = (createRes.json as { capture: CaptureRow }).capture.id;
  const reviewRes = await request(`/api/provisional-captures/${captureId}/review`, {
    method: "PATCH",
    token: tokenFor(users.operator),
    body: { status: "VALIDADO · PENDIENTE DE REGISTRO" }
  });
  assert.equal(reviewRes.status, 403);
});

test("admin validateNow creates validated capture and review event", async () => {
  const res = await request("/api/provisional-captures", {
    method: "POST",
    token: tokenFor(users.admin, AVIAT.id),
    body: createBody({ validateNow: true })
  });
  assert.equal(res.status, 201);
  const payload = res.json as { capture: CaptureRow; reviewHistory: ReviewRow[] };
  assert.equal(payload.capture.status, "VALIDADO · PENDIENTE DE REGISTRO");
  assert.equal(payload.capture.reviewerId, users.admin.id);
  assert.equal(payload.reviewHistory.length, 1);
});

test("validateNow blocked in operator mode flag", async () => {
  const res = await request("/api/provisional-captures", {
    method: "POST",
    token: tokenFor(users.supervisor),
    body: createBody({ validateNow: true, executorOperatorMode: true })
  });
  assert.equal(res.status, 403);
});

test("admin cannot create consulta capture", async () => {
  const res = await request("/api/provisional-captures", {
    method: "POST",
    token: tokenFor(users.admin, AVIAT.id),
    body: createBody({ declaredActionId: "consulta" })
  });
  assert.equal(res.status, 403);
});

test("client read-only hides unresolved project captures", async () => {
  const createRes = await request("/api/provisional-captures", {
    method: "POST",
    token: tokenFor(users.operator),
    body: createBody({ readings: [{ raw: "X", normalized: "X", classification: "SKU" }] })
  });
  assert.equal(createRes.status, 201);
  const hiddenId = (createRes.json as { capture: CaptureRow }).capture.id;
  assert.equal((createRes.json as { capture: CaptureRow }).capture.projectId, null);
  const listRes = await request("/api/provisional-captures", { token: tokenFor(users.clientAviat) });
  assert.equal(listRes.status, 200);
  const items = (listRes.json as { items: CaptureRow[] }).items;
  assert.ok(!items.some((row) => row.id === hiddenId));
});

test("unknown capture id returns 404 within tenant", async () => {
  const detailRes = await request("/api/provisional-captures/cp-missing", {
    token: tokenFor(users.supervisor)
  });
  assert.equal(detailRes.status, 404);
});

test("admin without client context cannot access tenant captures", async () => {
  const detailRes = await request("/api/provisional-captures/cp-1", {
    token: tokenFor(users.admin, null)
  });
  assert.equal(detailRes.status, 403);
});

test("POST rejects empty readings", async () => {
  const res = await request("/api/provisional-captures", {
    method: "POST",
    token: tokenFor(users.operator),
    body: createBody({ readings: [] })
  });
  assert.equal(res.status, 400);
});
