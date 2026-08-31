const SENSITIVE_KEY = /pass|secret|token|cookie|authorization|database_url|connection.?string|jwt|credential|api[_-]?key/i;
const POSTGRES_URL = /postgres(?:ql)?:\/\/[^\s'"\\]+/gi;
const USERINFO_URL = /[a-z][a-z0-9+.-]*:\/\/[^/\s'"\\:]+:[^@\s'"\\]+@[^\s'"\\]+/gi;
const BEARER = /Bearer\s+[A-Za-z0-9._~+/=-]+/gi;
const JWT = /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g;
const AUTH_HEADER = /\b(authorization|cookie|set-cookie)\s*[:=]\s*[^\r\n]+/gi;

export function sanitizeLogText(value: string): string {
  return value
    .replace(POSTGRES_URL, "[redacted-url]")
    .replace(USERINFO_URL, "[redacted-url]")
    .replace(BEARER, "Bearer [redacted]")
    .replace(JWT, "[redacted-jwt]")
    .replace(AUTH_HEADER, "$1=[redacted]");
}

export function sanitizeLogValue(value: unknown): unknown {
  if (value == null) return value;
  if (typeof value === "string") return sanitizeLogText(value);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) return value.map(sanitizeLogValue);
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      out[key] = SENSITIVE_KEY.test(key) ? "[redacted]" : sanitizeLogValue(nested);
    }
    return out;
  }
  return String(value);
}

export function safeErrorLog(error: unknown): {
  name: string;
  code?: string;
  constraint?: unknown;
  modelName?: unknown;
  field?: unknown;
  message: string;
  stack?: string;
} {
  const err = error as {
    name?: string;
    code?: unknown;
    meta?: { constraint?: unknown; modelName?: unknown; field_name?: unknown; field?: unknown };
    message?: string;
    stack?: string;
    constructor?: { name?: string };
  };
  const meta = err?.meta && typeof err.meta === "object" ? err.meta : undefined;
  const message = sanitizeLogText(err instanceof Error ? err.message : String(error));
  const stack = typeof err?.stack === "string" ? sanitizeLogText(err.stack) : undefined;
  return {
    name: err instanceof Error ? err.name : String(err?.constructor?.name || typeof error),
    code: typeof err?.code === "string" && err.code ? err.code : undefined,
    constraint: meta?.constraint,
    modelName: meta?.modelName,
    field: meta?.field_name ?? meta?.field,
    message,
    stack
  };
}
