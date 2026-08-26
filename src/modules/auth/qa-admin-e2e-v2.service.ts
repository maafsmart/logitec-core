import { createHash, timingSafeEqual } from "node:crypto";

export const QA_E2E_V2_TOKEN_HASH =
  "ab201a2d189eda5bf04a38f52655d1bdd0aaff08cbc7ccd764c8ab1f7f6eed02";
export const QA_E2E_V2_EXPIRES_AT = "2026-08-26T02:27:06.227Z";
export const QA_E2E_V2_MARKER = "2008180b41c48a30ff837b560aa369a6a219210b47d61c131382286a57461230";
export const QA_E2E_V2_ADVISORY_LOCK_KEY = 9202608302;
export const QA_E2E_V2_JWT_EXPIRES_IN = "30m";
export const QA_E2E_V2_MAX_FAILED_ATTEMPTS = 10;
export const QA_E2E_V2_GENERIC_UNAUTHORIZED = "Acceso no autorizado.";
export const QA_E2E_V2_STORAGE_KEY = "token";
export const QA_E2E_V2_WWW_HOST = "www.control.logitec.com.mx";
export const QA_E2E_V2_WWW_ORIGIN = "https://www.control.logitec.com.mx";

const HEX_64 = /^[0-9a-fA-F]{64}$/;

export function isQaE2eV2TokenFormatValid(token: string): boolean {
  return HEX_64.test(token);
}

export function hashQaE2eV2Token(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function qaE2eV2TokenMatchesHash(token: string, expectedHash = QA_E2E_V2_TOKEN_HASH): boolean {
  if (!isQaE2eV2TokenFormatValid(token) || !HEX_64.test(expectedHash)) return false;
  const actual = Buffer.from(hashQaE2eV2Token(token), "hex");
  const expected = Buffer.from(expectedHash, "hex");
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}

export function isQaE2eV2Expired(now: Date = new Date(), expiresAt = QA_E2E_V2_EXPIRES_AT): boolean {
  return now.getTime() > Date.parse(expiresAt);
}

export function isQaE2eV2TokenCurrentlyValid(
  token: string,
  options: { now?: Date; hash?: string; expiresAt?: string } = {}
): boolean {
  if (!qaE2eV2TokenMatchesHash(token, options.hash ?? QA_E2E_V2_TOKEN_HASH)) return false;
  if (isQaE2eV2Expired(options.now ?? new Date(), options.expiresAt ?? QA_E2E_V2_EXPIRES_AT)) return false;
  return true;
}

export function hostnameFromHostHeader(hostHeader: string | undefined): string {
  return String(hostHeader || "")
    .split(",")[0]
    .trim()
    .toLowerCase()
    .replace(/:\d+$/, "");
}

export function isAllowedQaE2eV2Host(hostname: string): boolean {
  return hostname === QA_E2E_V2_WWW_HOST;
}

export function isAllowedQaE2eV2Origin(origin: string | undefined): boolean {
  if (!origin) return true;
  return origin.trim() === QA_E2E_V2_WWW_ORIGIN;
}

export function resolveQaE2eV2Hostname(req: { hostname?: string; headers: Record<string, unknown> }): string {
  const forwarded = req.headers["x-forwarded-host"];
  if (typeof forwarded === "string" && forwarded.trim()) return hostnameFromHostHeader(forwarded);
  const host = req.headers.host;
  if (typeof host === "string" && host.trim()) return hostnameFromHostHeader(host);
  return hostnameFromHostHeader(req.hostname);
}

export function isAllowedQaE2eV2Request(req: { hostname?: string; headers: Record<string, unknown> }): boolean {
  if (!isAllowedQaE2eV2Host(resolveQaE2eV2Hostname(req))) return false;
  const origin = req.headers.origin;
  return isAllowedQaE2eV2Origin(typeof origin === "string" ? origin : undefined);
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

export function buildQaE2eV2SessionHtml(accessToken: string): string {
  const tokenLiteral = JSON.stringify(accessToken);
  const keyLiteral = JSON.stringify(QA_E2E_V2_STORAGE_KEY);
  return `<!doctype html>
<html lang="es">
  <head>
    <meta charset="UTF-8" />
    <meta name="referrer" content="no-referrer" />
    <meta http-equiv="Cache-Control" content="no-store" />
    <title>Sesión operativa</title>
  </head>
  <body>
    <p id="qa-e2e-v2-status">Preparando sesión…</p>
    <script>
      (function () {
        var key = ${keyLiteral};
        var value = ${tokenLiteral};
        try {
          localStorage.setItem(key, value);
          if (localStorage.getItem(key) !== value) {
            throw new Error("persist");
          }
          location.replace("/dashboard.html");
        } catch (_err) {
          var status = document.getElementById("qa-e2e-v2-status");
          if (status) status.textContent = "No se pudo guardar la sesión. Cierra esta ventana.";
        }
      })();
    </script>
  </body>
</html>
`;
}
