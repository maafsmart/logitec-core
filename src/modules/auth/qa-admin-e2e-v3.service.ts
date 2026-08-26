import { createHash, timingSafeEqual } from "node:crypto";

export const QA_E2E_V3_TOKEN_HASH =
  "d0e64e48e1357cfd00ccdef85a8705ae18e35dd96b05bf4517b844e234e100d4";
export const QA_E2E_V3_EXPIRES_AT = "2026-08-26T04:59:40.224Z";
export const QA_E2E_V3_MARKER = "4ce1239642104a4f45a91f7194402f56ce9c56b32831bee0576c75a25ac00438";
export const QA_E2E_V3_ADVISORY_LOCK_KEY = 9202609303;
export const QA_E2E_V3_JWT_EXPIRES_IN = "30m";
export const QA_E2E_V3_MAX_FAILED_ATTEMPTS = 10;
export const QA_E2E_V3_GENERIC_UNAUTHORIZED = "Acceso no autorizado.";
export const QA_E2E_V3_WWW_HOST = "www.control.logitec.com.mx";
export const QA_E2E_V3_WWW_ORIGIN = "https://www.control.logitec.com.mx";

const HEX_64 = /^[0-9a-fA-F]{64}$/;

export function isQaE2eV3TokenFormatValid(token: string): boolean {
  return HEX_64.test(token);
}

export function hashQaE2eV3Token(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function qaE2eV3TokenMatchesHash(token: string, expectedHash = QA_E2E_V3_TOKEN_HASH): boolean {
  if (!isQaE2eV3TokenFormatValid(token) || !HEX_64.test(expectedHash)) return false;
  const actual = Buffer.from(hashQaE2eV3Token(token), "hex");
  const expected = Buffer.from(expectedHash, "hex");
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}

export function isQaE2eV3Expired(now: Date = new Date(), expiresAt = QA_E2E_V3_EXPIRES_AT): boolean {
  return now.getTime() > Date.parse(expiresAt);
}

export function isQaE2eV3TokenCurrentlyValid(
  token: string,
  options: { now?: Date; hash?: string; expiresAt?: string } = {}
): boolean {
  if (!qaE2eV3TokenMatchesHash(token, options.hash ?? QA_E2E_V3_TOKEN_HASH)) return false;
  if (isQaE2eV3Expired(options.now ?? new Date(), options.expiresAt ?? QA_E2E_V3_EXPIRES_AT)) return false;
  return true;
}

export function hostnameFromHostHeader(hostHeader: string | undefined): string {
  return String(hostHeader || "")
    .split(",")[0]
    .trim()
    .toLowerCase()
    .replace(/:\d+$/, "");
}

export function isAllowedQaE2eV3Host(hostname: string): boolean {
  return hostname === QA_E2E_V3_WWW_HOST;
}

export function isAllowedQaE2eV3Origin(origin: string | undefined): boolean {
  if (typeof origin !== "string") return false;
  const trimmed = origin.trim();
  if (!trimmed || trimmed.toLowerCase() === "null") return false;
  return trimmed === QA_E2E_V3_WWW_ORIGIN;
}

export function isAllowedQaE2eV3Environment(nodeEnv: string | undefined): boolean {
  return nodeEnv === "production";
}

export function isQaE2eV3JsonContentType(contentType: string | string[] | undefined): boolean {
  const raw = Array.isArray(contentType) ? contentType[0] : contentType;
  if (!raw) return false;
  return raw.split(";")[0].trim().toLowerCase() === "application/json";
}

export function resolveQaE2eV3Hostname(req: { hostname?: string; headers: Record<string, unknown> }): string {
  const forwarded = req.headers["x-forwarded-host"];
  if (typeof forwarded === "string" && forwarded.trim()) return hostnameFromHostHeader(forwarded);
  const host = req.headers.host;
  if (typeof host === "string" && host.trim()) return hostnameFromHostHeader(host);
  return hostnameFromHostHeader(req.hostname);
}

export function isAllowedQaE2eV3Request(req: { hostname?: string; headers: Record<string, unknown> }): boolean {
  if (!isAllowedQaE2eV3Host(resolveQaE2eV3Hostname(req))) return false;
  const origin = req.headers.origin;
  return isAllowedQaE2eV3Origin(typeof origin === "string" ? origin : undefined);
}

export function clientIpFromRequest(req: {
  ip?: string;
  headers: Record<string, unknown>;
  socket?: { remoteAddress?: string };
}): string {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.trim()) return forwarded.split(",")[0].trim();
  return req.ip || req.socket?.remoteAddress || "unknown";
}
