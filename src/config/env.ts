import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  JWT_SECRET: z.string().min(12, "JWT_SECRET must have at least 12 characters"),
  PORT: z.coerce.number().int().positive().default(3000)
})
  .superRefine((data, ctx) => {
    const isSqlite = data.DATABASE_URL.startsWith("file:");
    const isPostgres =
      data.DATABASE_URL.startsWith("postgresql://") ||
      data.DATABASE_URL.startsWith("postgres://");

    if (!isSqlite && !isPostgres) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["DATABASE_URL"],
        message:
          "DATABASE_URL must use sqlite (file:...) or PostgreSQL (postgresql:// or postgres://)."
      });
    }

    if (data.NODE_ENV === "production" && !isPostgres) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["DATABASE_URL"],
        message:
          "In production, DATABASE_URL must be PostgreSQL (postgresql://... or postgres://...)."
      });
    }
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