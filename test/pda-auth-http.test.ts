import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import type { Server } from "node:http";
import { app } from "../src/app.js";
import { prisma } from "../src/db/prisma.js";
import { digestPdaSecret } from "../src/modules/pda/pda-auth.service.js";

const secret = "pda-one-shot-secret-with-256-bits-of-test-material-123";
let consumed = false;
let grantStatus = "ACTIVE";
let revokeReason: string | null = null;
let runStatus = "RECONCILED";
let capturedSessionTenant = "";
let server: Server;
let baseUrl = "";

const challenge = {
  id: "challenge-db",
  publicId: "PAIR-http-test",
  clientId: "tenant-a",
  sessionId: "session-a",
  secretDigest: digestPdaSecret(secret),
  attempts: 0,
  maxAttempts: 5,
  expiresAt: new Date(Date.now() + 60_000),
  consumedAt: null as Date | null,
  createdById: "admin-a",
  session: { status: "OPEN", testId: "PDA-20260902-HTTP01" }
};

const grantRecord = {
  id: "grant-db",
  publicId: "GRANT-http-test",
  clientId: "tenant-a",
  sessionId: "session-a",
  createdById: "admin-a",
  scopes: ["pda:run", "pda:capture", "pda:release"],
  status: grantStatus,
  revokeReason,
  expiresAt: new Date(Date.now() + 60_000)
};

const tx = {
  pdaPairingChallenge: {
    findUnique: async () => ({ ...challenge, consumedAt: consumed ? new Date() : null }),
    update: async () => ({}),
    updateMany: async () => {
      if (consumed) return { count: 0 };
      consumed = true;
      return { count: 1 };
    }
  },
  pdaLabGrant: {
    findFirst: async () => ({ id: "grant-db" }),
    create: async () => ({
      publicId: grantRecord.publicId,
      expiresAt: grantRecord.expiresAt,
      sessionId: grantRecord.sessionId
    }),
    updateMany: async () => {
      grantStatus = "REVOKED";
      revokeReason = "RUN_RELEASED";
      return { count: 1 };
    }
  },
  pdaTestSession: {
    findFirst: async ({ where }: { where: { clientId: string } }) => {
      capturedSessionTenant = where.clientId;
      return { id: "session-a" };
    },
    update: async () => ({})
  },
  pdaTestReading: {
    findMany: async () => []
  },
  pdaCaptureRun: {
    findFirst: async ({ where }: { where: { publicId?: string } }) =>
      where.publicId
        ? {
            id: "run-db",
            publicId: "RUN-http-test",
            clientId: "tenant-a",
            sessionId: "session-a",
            grantId: "grant-db",
            status: runStatus,
            epoch: 1,
            version: 1,
            lastAcceptedSeq: 0,
            sealedThroughSeq: 0
          }
        : null,
    create: async () => ({
      id: "run-db",
      publicId: "RUN-http-test",
      clientId: "tenant-a",
      sessionId: "session-a",
      grantId: "grant-db",
      status: "ACTIVE",
      epoch: 1,
      version: 1,
      lastAcceptedSeq: 0,
      sealedThroughSeq: null
    }),
    updateMany: async () => {
      runStatus = "RELEASED";
      return { count: 1 };
    },
    count: async () => 0
  }
};

before(async () => {
  (prisma as unknown as { $transaction: unknown }).$transaction =
    async (operation: (client: typeof tx) => unknown) => operation(tx);
  (prisma.pdaLabGrant as unknown as { findUnique: unknown }).findUnique = async () => ({
    ...grantRecord,
    status: grantStatus,
    revokeReason
  });
  (prisma.pdaLabGrant as unknown as { update: unknown }).update = async () => ({});
  (prisma.pdaPairingChallenge as unknown as { findUnique: unknown }).findUnique =
    async () => ({ ...challenge, consumedAt: consumed ? new Date() : null });
  (prisma.pdaPairingChallenge as unknown as { updateMany: unknown }).updateMany =
    async () => ({ count: 1 });
  (prisma.pdaCaptureRun as unknown as { findFirst: unknown }).findFirst =
    async () => ({
      id: "run-db",
      publicId: "RUN-http-test",
      clientId: "tenant-a",
      sessionId: "session-a",
      grantId: "grant-db",
      status: runStatus,
      epoch: 1,
      version: 1,
      lastAcceptedSeq: 0,
      sealedThroughSeq: 0,
      session: { testId: "PDA-20260902-HTTP01", status: "OPEN" }
    });
  server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
});

test("pairing HTTP entrega cookie restringida y rechaza replay one-shot", async () => {
  const first = await fetch(`${baseUrl}/api/pda/pair/exchange`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "https://www.control.logitec.com.mx",
      "Sec-Fetch-Site": "same-origin"
    },
    body: JSON.stringify({ challengeId: challenge.publicId, secret })
  });
  assert.equal(first.status, 201);
  const setCookie = first.headers.get("set-cookie") || "";
  assert.match(setCookie, /^logitec_pda=/);
  assert.match(setCookie, /HttpOnly/i);
  assert.match(setCookie, /Secure/i);
  assert.match(setCookie, /SameSite=Strict/i);
  assert.match(setCookie, /Path=\/api\/pda/i);

  const replay = await fetch(`${baseUrl}/api/pda/pair/exchange`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ challengeId: challenge.publicId, secret })
  });
  assert.equal(replay.status, 409);
  assert.equal((await replay.json()).code, "PDA_PAIRING_REPLAY");
});

test("tenant enviado por cliente no cambia tenant fijado por grant", async () => {
  const paired = await fetch(`${baseUrl}/api/pda/pair/exchange`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ challengeId: "PAIR-second", secret })
  });
  // The challenge is one-shot in this fake; use the original cookie captured from an explicit synthetic value.
  void paired;
  const cookie = `logitec_pda=${encodeURIComponent("http-test-token")}`;
  const response = await fetch(`${baseUrl}/api/pda/runs`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ clientId: "tenant-b", deviceType: "PDA" })
  });
  assert.equal(response.status, 201);
  assert.equal(capturedSessionTenant, "tenant-a");
});

test("release revoca server-side y el bearer capturado responde 401", async () => {
  const cookie = `logitec_pda=${encodeURIComponent("http-test-token")}`;
  const release = await fetch(`${baseUrl}/api/pda/runs/RUN-http-test/release`, {
    method: "POST",
    headers: { Cookie: cookie }
  });
  assert.equal(release.status, 200);
  assert.equal((await release.json()).status, "SAFE_TO_RETURN");

  const receipt = await fetch(`${baseUrl}/api/pda/runs/RUN-http-test/release-status`, {
    headers: { Cookie: cookie }
  });
  assert.equal(receipt.status, 200);
  assert.equal((await receipt.json()).status, "SAFE_TO_RETURN");

  const replay = await fetch(`${baseUrl}/api/pda/status`, { headers: { Cookie: cookie } });
  assert.equal(replay.status, 401);
  assert.equal((await replay.json()).code, "PDA_GRANT_REVOKED");
});
