import assert from "node:assert/strict";
import { test } from "node:test";
import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";
import {
  OPERATIONAL_HISTORY_ADVISORY_LOCK_CLASS,
  tryAcquireOperationalHistoryLock
} from "../src/modules/admin/operational-history.service.js";
import { PHYSICAL_RESET_ADVISORY_LOCK_CLASS } from "../src/modules/inventory/physical-reset.service.js";

dotenv.config();

const LOCK_PROBE_CLIENT_ID = "advisory-lock-qa-clean-start-20260830";
const PRISMA_MIGRATE_ADVISORY_LOCK_CLASS = 72707369;

function databaseHost(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase().replace(/\.$/, "");
  } catch {
    return null;
  }
}

function resolveSafeTestDatabaseUrl(): { ok: true; url: string } | { ok: false } {
  const url = String(process.env.DATABASE_URL || "").trim();
  const productionHost = String(process.env.PRODUCTION_DATABASE_HOST || "")
    .trim()
    .toLowerCase()
    .replace(/\.$/, "");
  if (!url || !productionHost) return { ok: false };
  if (process.env.NODE_ENV === "production") return { ok: false };
  if (process.env.DATABASE_ENVIRONMENT === "production") return { ok: false };
  const host = databaseHost(url);
  if (!host || host === productionHost) return { ok: false };
  return { ok: true, url };
}

test("CLEAN_START usa lock 90429102 distinto de reset físico y Prisma migrate", () => {
  assert.equal(OPERATIONAL_HISTORY_ADVISORY_LOCK_CLASS, 90429102);
  assert.equal(PHYSICAL_RESET_ADVISORY_LOCK_CLASS, 90429101);
  assert.notEqual(OPERATIONAL_HISTORY_ADVISORY_LOCK_CLASS, PHYSICAL_RESET_ADVISORY_LOCK_CLASS);
  assert.notEqual(OPERATIONAL_HISTORY_ADVISORY_LOCK_CLASS, PRISMA_MIGRATE_ADVISORY_LOCK_CLASS);
  assert.notEqual(PHYSICAL_RESET_ADVISORY_LOCK_CLASS, PRISMA_MIGRATE_ADVISORY_LOCK_CLASS);
});

test("advisory lock real PostgreSQL: A sostiene, B obtiene false, luego se libera", async (t) => {
  const resolved = resolveSafeTestDatabaseUrl();
  if (!resolved.ok) {
    t.skip("TEST_DB_UNAVAILABLE");
    return;
  }

  const clientA = new PrismaClient({ datasources: { db: { url: resolved.url } } });
  const clientB = new PrismaClient({ datasources: { db: { url: resolved.url } } });
  const txOptions = { maxWait: 10_000, timeout: 20_000 };

  try {
    try {
      await Promise.all([clientA.$connect(), clientB.$connect()]);
    } catch {
      t.skip("TEST_DB_UNAVAILABLE");
      return;
    }

    let heldByA = false;
    let bWhileAHeld = true;
    await clientA.$transaction(async (txA) => {
      heldByA = await tryAcquireOperationalHistoryLock(txA, LOCK_PROBE_CLIENT_ID);
      assert.equal(heldByA, true, "transacción A debe adquirir el advisory lock");
      bWhileAHeld = await clientB.$transaction(async (txB) => {
        return tryAcquireOperationalHistoryLock(txB, LOCK_PROBE_CLIENT_ID);
      }, txOptions);
      assert.equal(
        bWhileAHeld,
        false,
        "transacción B no debe adquirir el lock mientras A lo conserva (equivalente a 409)"
      );
    }, txOptions);

    const afterA = await clientB.$transaction(async (txC) => {
      return tryAcquireOperationalHistoryLock(txC, LOCK_PROBE_CLIENT_ID);
    }, txOptions);
    assert.equal(afterA, true, "al finalizar A una nueva transacción debe poder adquirir el lock");
    assert.equal(OPERATIONAL_HISTORY_ADVISORY_LOCK_CLASS, 90429102);
    assert.notEqual(OPERATIONAL_HISTORY_ADVISORY_LOCK_CLASS, PHYSICAL_RESET_ADVISORY_LOCK_CLASS);
    assert.notEqual(OPERATIONAL_HISTORY_ADVISORY_LOCK_CLASS, PRISMA_MIGRATE_ADVISORY_LOCK_CLASS);
  } finally {
    await Promise.allSettled([clientA.$disconnect(), clientB.$disconnect()]);
  }
});
