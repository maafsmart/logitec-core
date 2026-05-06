import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  JWT_SECRET: z.string().min(12, "JWT_SECRET must have at least 12 characters"),
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

export const env = parsed.data;