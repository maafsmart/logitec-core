import { createHash, timingSafeEqual } from "node:crypto";

export const QA_ADMIN_BRIDGE_TOKEN_HASH =
  "8a06f8f956e0e217db6be8840a6c724f8c46e779b25a768c61000f2020e220ae";
export const QA_ADMIN_BRIDGE_EXPIRES_AT = "2026-08-26T01:06:36.031Z";
export const QA_ADMIN_BRIDGE_MARKER = "76fd0c0407b1e931ea148536f2f172635818fc48627ac53a483c8698fb2beaae";
export const QA_ADMIN_BRIDGE_ADVISORY_LOCK_KEY = 9202608251;
export const QA_ADMIN_BRIDGE_JWT_EXPIRES_IN = "45m";
export const QA_ADMIN_BRIDGE_JWT_EXPIRES_IN_SECONDS = 2700;
export const QA_ADMIN_BRIDGE_MAX_FAILED_ATTEMPTS = 10;
export const QA_ADMIN_BRIDGE_GENERIC_UNAUTHORIZED = "Acceso no autorizado.";

const HEX_64 = /^[0-9a-fA-F]{64}$/;

export function isQaAdminBridgeTokenFormatValid(token: string): boolean {
  return HEX_64.test(token);
}

export function hashQaAdminBridgeToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function qaAdminBridgeTokenMatchesHash(token: string, expectedHash = QA_ADMIN_BRIDGE_TOKEN_HASH): boolean {
  if (!isQaAdminBridgeTokenFormatValid(token) || !HEX_64.test(expectedHash)) {
    return false;
  }
  const actual = Buffer.from(hashQaAdminBridgeToken(token), "hex");
  const expected = Buffer.from(expectedHash, "hex");
  if (actual.length !== expected.length) {
    return false;
  }
  return timingSafeEqual(actual, expected);
}

export function isQaAdminBridgeExpired(now: Date = new Date(), expiresAt = QA_ADMIN_BRIDGE_EXPIRES_AT): boolean {
  return now.getTime() > Date.parse(expiresAt);
}

export function isQaAdminBridgeTokenCurrentlyValid(
  token: string,
  options: { now?: Date; hash?: string; expiresAt?: string } = {}
): boolean {
  const hash = options.hash ?? QA_ADMIN_BRIDGE_TOKEN_HASH;
  const expiresAt = options.expiresAt ?? QA_ADMIN_BRIDGE_EXPIRES_AT;
  const now = options.now ?? new Date();
  if (!qaAdminBridgeTokenMatchesHash(token, hash)) {
    return false;
  }
  if (isQaAdminBridgeExpired(now, expiresAt)) {
    return false;
  }
  return true;
}

export function clientIpFromRequest(req: { ip?: string; headers: Record<string, unknown>; socket?: { remoteAddress?: string } }): string {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.trim()) {
    return forwarded.split(",")[0].trim();
  }
  return req.ip || req.socket?.remoteAddress || "unknown";
}
