import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const nodeEnvironments = ["development", "test", "production"] as const;
const databaseEnvironments = ["development", "qa", "production"] as const;

const envSchema = z.object({
  NODE_ENV: z.enum(nodeEnvironments).default("development"),
  DATABASE_ENVIRONMENT: z
    .enum(databaseEnvironments)
    .optional()
    .transform((value) => value || (process.env.NODE_ENV === "production" ? "production" : process.env.NODE_ENV === "test" ? "qa" : "development")),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  PRODUCTION_DATABASE_HOST: z.string().trim().min(1).optional(),
  JWT_SECRET: z.string().min(12, "JWT_SECRET must have at least 12 characters"),
  ALLOW_TENANT_INVENTORY_RESET: z.preprocess(
    (value) => {
      const raw = String(value ?? "false").trim().toLowerCase();
      return raw === "true" ? "true" : "false";
    },
    z.enum(["true", "false"]).default("false")
  ),
  PORT: z.preprocess(
    (value) => {
      const raw = typeof value === "string" ? value.trim() : value;
      if (raw === undefined || raw === null || raw === "") return 3000;
      const parsedPort = Number(raw);
      if (!Number.isFinite(parsedPort) || Number.isNaN(parsedPort)) return 3000;
      return parsedPort;
    },
    z.number().int().positive().default(3000)
  )
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const flattened = parsed.error.flatten();
  console.error("ENV validation failed. Check your environment variables.");
  Object.entries(flattened.fieldErrors).forEach(([field, errors]) => {
    if (errors?.length) {
      console.error(`- ${field}: ${errors.join(", ")}`);
    }
  });
  process.exit(1);
}

function getDatabaseHost(databaseUrl: string) {
  try {
    return new URL(databaseUrl).hostname.toLowerCase().replace(/\.$/, "");
  } catch {
    return null;
  }
}

function normalizeDatabaseHost(host: string) {
  return host.trim().toLowerCase().replace(/\.$/, "");
}

const configured = parsed.data;
const expectedDatabaseEnvironment =
  configured.NODE_ENV === "production"
    ? "production"
    : configured.NODE_ENV === "test"
      ? "qa"
      : "development";

if (configured.DATABASE_ENVIRONMENT !== expectedDatabaseEnvironment) {
  console.error(
    `ENV validation failed: DATABASE_ENVIRONMENT must be "${expectedDatabaseEnvironment}" when NODE_ENV is "${configured.NODE_ENV}".`
  );
  process.exit(1);
}

if (configured.NODE_ENV !== "production") {
  const protectedHost = configured.PRODUCTION_DATABASE_HOST
    ? normalizeDatabaseHost(configured.PRODUCTION_DATABASE_HOST)
    : "";
  const databaseHost = getDatabaseHost(configured.DATABASE_URL);

  if (!protectedHost) {
    console.error(
      "ENV validation failed: PRODUCTION_DATABASE_HOST is required outside production."
    );
    process.exit(1);
  }

  if (databaseHost && databaseHost === protectedHost) {
    console.error(
      "SEGURIDAD LOGITEC: desarrollo no puede utilizar la base de datos de producción."
    );
    process.exit(1);
  }
}

export const env = configured;