import {
  assertSafeOperationalResetEnv,
  getDatabaseHost,
  normalizeDatabaseHost
} from "./operational-reset/lib.js";

export const REAL_ADMIN_EMAIL = "admin@logitec.local";

export const QA_E2E_USERS = {
  ADMIN: { email: "qa.admin@logitec.local", fullName: "QA Admin", role: "ADMIN" as const },
  SUPERVISOR: { email: "qa.supervisor@logitec.local", fullName: "QA Supervisor", role: "SUPERVISOR" as const },
  OPERATOR: { email: "qa.operator@logitec.local", fullName: "QA Operator", role: "OPERATOR" as const },
  CLIENT: { email: "qa.client@logitec.local", fullName: "QA Client", role: "CLIENT" as const }
} as const;

export const QA_E2E_EMAIL_RE = /^qa\.[a-z0-9._+-]+@logitec\.local$/i;

const SENSITIVE_KEY_RE = /password|passwd|token|authorization|cookie|set-cookie|secret|credential|bearer/i;
const SENSITIVE_QUERY_RE = /^(password|token|access_token|refresh_token|authorization|cookie|secret)$/i;

export class E2eSafetyError extends Error {
  constructor(
    message: string,
    readonly code: string
  ) {
    super(message);
    this.name = "E2eSafetyError";
  }
}

export type E2eSecrets = {
  adminPassword: string;
  qaPassword: string;
};

export type QaClientRow = {
  id: string;
  code: string;
  active: boolean;
};

export function assertRequiredE2eSecrets(env: NodeJS.ProcessEnv = process.env): E2eSecrets {
  const adminPassword = String(env.E2E_ADMIN_PASSWORD || "").trim();
  const qaPassword = String(env.QA_E2E_PASSWORD || "").trim();
  if (!adminPassword || !qaPassword) {
    throw new E2eSafetyError(
      "Faltan secretos E2E (E2E_ADMIN_PASSWORD y QA_E2E_PASSWORD). El arnés no usa contraseñas por defecto.",
      "E2E_SECRETS_MISSING"
    );
  }
  if (adminPassword.length < 6 || qaPassword.length < 6) {
    throw new E2eSafetyError("Los secretos E2E deben tener al menos 6 caracteres.", "E2E_SECRETS_TOO_SHORT");
  }
  return { adminPassword, qaPassword };
}

export function assertE2eNotProduction(env: NodeJS.ProcessEnv = process.env): void {
  if (String(env.NODE_ENV || "").toLowerCase() === "production") {
    throw new E2eSafetyError("ABORT: NODE_ENV=production. El arnés E2E solo corre en DEV.", "E2E_GUARD_NODE_ENV");
  }
  const databaseEnvironment = String(env.DATABASE_ENVIRONMENT || "").trim().toLowerCase();
  if (databaseEnvironment !== "development") {
    throw new E2eSafetyError(
      "ABORT: E2E requiere DATABASE_ENVIRONMENT=development. No se puede demostrar DEV.",
      "E2E_GUARD_DATABASE_ENVIRONMENT"
    );
  }
  const databaseUrl = String(env.DATABASE_URL || "");
  if (!databaseUrl.trim()) {
    throw new E2eSafetyError("ABORT: DATABASE_URL ausente. No se puede demostrar DEV.", "E2E_GUARD_DATABASE_URL");
  }
  const protectedHost = env.PRODUCTION_DATABASE_HOST
    ? normalizeDatabaseHost(String(env.PRODUCTION_DATABASE_HOST))
    : "";
  if (!protectedHost) {
    throw new E2eSafetyError(
      "ABORT: PRODUCTION_DATABASE_HOST es obligatorio para demostrar que no se toca producción.",
      "E2E_GUARD_PROD_HOST_REQUIRED"
    );
  }
  const databaseHost = getDatabaseHost(databaseUrl);
  if (!databaseHost) {
    throw new E2eSafetyError("ABORT: DATABASE_URL inválida. No se puede demostrar DEV.", "E2E_GUARD_DATABASE_URL");
  }
  if (databaseHost === protectedHost) {
    throw new E2eSafetyError(
      "SEGURIDAD LOGITEC: el arnés E2E no puede utilizar la base de datos de producción.",
      "E2E_GUARD_PROD_DATABASE"
    );
  }
  assertSafeOperationalResetEnv(env);
}

export function assertE2eHarnessReady(env: NodeJS.ProcessEnv = process.env): E2eSecrets {
  const secrets = assertRequiredE2eSecrets(env);
  assertE2eNotProduction(env);
  return secrets;
}

export function assertQaE2eEmail(email: string): string {
  const normalized = String(email || "").trim().toLowerCase();
  if (!normalized) {
    throw new E2eSafetyError("Email E2E vacío.", "E2E_EMAIL_EMPTY");
  }
  if (normalized === REAL_ADMIN_EMAIL) {
    throw new E2eSafetyError(
      "El arnés E2E no puede usar ni modificar admin@logitec.local.",
      "E2E_REAL_ADMIN_FORBIDDEN"
    );
  }
  if (!QA_E2E_EMAIL_RE.test(normalized) || !normalized.endsWith("@logitec.local")) {
    throw new E2eSafetyError(
      "Email fuera del namespace QA (qa.*@logitec.local).",
      "E2E_EMAIL_NOT_QA"
    );
  }
  if (normalized.includes("gmail.com") || !normalized.startsWith("qa.")) {
    throw new E2eSafetyError("Email fuera del namespace QA.", "E2E_EMAIL_NOT_QA");
  }
  return normalized;
}

export function assertNotRealAdminMutation(email: string): void {
  assertQaE2eEmail(email);
}

export function selectExistingActiveQaClient(args: {
  preferredCode?: string | null;
  rows: QaClientRow[];
}): QaClientRow {
  const preferred = String(args.preferredCode || "AVIAT").trim();
  const exact = args.rows.find((row) => row.code.toLowerCase() === preferred.toLowerCase());
  if (exact && !exact.active) {
    throw new E2eSafetyError(
      `Cliente ${exact.code} existe pero está inactivo. El arnés no lo crea ni lo reactiva.`,
      "E2E_CLIENT_INACTIVE"
    );
  }
  if (exact?.active) return exact;
  const active = args.rows.find((row) => row.active);
  if (!active) {
    throw new E2eSafetyError(
      "No hay cliente DEV activo para QA. El arnés no crea ni reactiva AVIAT.",
      "E2E_CLIENT_UNAVAILABLE"
    );
  }
  return active;
}

export function sanitizeE2eUrl(raw: string): string {
  const value = String(raw || "");
  try {
    const hasProtocol = /^https?:\/\//i.test(value);
    const url = new URL(hasProtocol ? value : `http://e2e.local${value.startsWith("/") ? value : `/${value}`}`);
    url.password = "";
    url.username = "";
    for (const key of [...url.searchParams.keys()]) {
      if (SENSITIVE_QUERY_RE.test(key) || SENSITIVE_KEY_RE.test(key)) {
        url.searchParams.set(key, "[REDACTED]");
      }
    }
    if (hasProtocol) return `${url.origin}${url.pathname}${url.search}${url.hash}`;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return value.replace(/Bearer\s+[A-Za-z0-9._-]+/gi, "Bearer [REDACTED]");
  }
}

export function sanitizeE2eEvidence(value: unknown, keyHint = ""): unknown {
  if (value == null) return value;
  if (SENSITIVE_KEY_RE.test(keyHint)) return "[REDACTED]";
  if (typeof value === "string") {
    if (/^Bearer\s+/i.test(value) || (keyHint.toLowerCase() === "authorization")) return "[REDACTED]";
    if (/^https?:\/\//i.test(value) || value.startsWith("/")) return sanitizeE2eUrl(value.startsWith("/") ? `http://local.invalid${value}` : value).replace("http://local.invalid", "");
    return value.replace(/Bearer\s+[A-Za-z0-9._-]+/gi, "Bearer [REDACTED]");
  }
  if (Array.isArray(value)) return value.map((item) => sanitizeE2eEvidence(item, keyHint));
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      out[key] = sanitizeE2eEvidence(nested, key);
    }
    return out;
  }
  return value;
}

export function formatE2eNetworkRow(method: string, url: string, status: number): string {
  return `${method} ${sanitizeE2eUrl(url)} ${status}`;
}
