import { randomBytes } from "node:crypto";
import { z } from "zod";
import { HttpError } from "../../shared/http-error.js";

export const USER_PUBLIC_SELECT = {
  id: true,
  email: true,
  fullName: true,
  role: true,
  clientId: true,
  isActive: true,
  mustChangePassword: true,
  phone: true,
  alternatePhone: true,
  address: true,
  city: true,
  state: true,
  postalCode: true,
  jobTitle: true,
  notes: true,
  avatarUrl: true,
  createdAt: true,
  client: { select: { id: true, name: true, tradeName: true, code: true, active: true } }
} as const;

const optionalText = (max: number) =>
  z
    .string()
    .max(max)
    .optional()
    .nullable()
    .transform((value) => {
      if (value == null) return value;
      const trimmed = value.trim();
      return trimmed.length ? trimmed : null;
    });

export const userProfileSchema = z.object({
  phone: optionalText(40),
  alternatePhone: optionalText(40),
  address: optionalText(200),
  city: optionalText(80),
  state: optionalText(80),
  postalCode: optionalText(16),
  jobTitle: optionalText(80),
  notes: optionalText(2000),
  avatarUrl: z
    .string()
    .max(500)
    .optional()
    .nullable()
    .transform((value) => {
      if (value == null) return value;
      const trimmed = value.trim();
      return trimmed.length ? trimmed : null;
    })
    .refine((value) => value == null || /^https?:\/\//i.test(value), {
      message: "avatarUrl debe ser una URL http(s). No se aceptan archivos ni base64."
    })
});

export const selfProfileSchema = userProfileSchema.extend({
  fullName: z.string().min(1).max(160).optional()
});

export function profileDataFromParsed(
  data: z.infer<typeof userProfileSchema> | z.infer<typeof selfProfileSchema>
): Record<string, string | null | undefined> {
  const next: Record<string, string | null | undefined> = {};
  for (const key of [
    "phone",
    "alternatePhone",
    "address",
    "city",
    "state",
    "postalCode",
    "jobTitle",
    "notes",
    "avatarUrl"
  ] as const) {
    if (key in data) next[key] = data[key];
  }
  return next;
}

export function assertNoPasswordHashExposure(payload: unknown): void {
  if (!payload || typeof payload !== "object") return;
  if ("passwordHash" in payload) {
    throw new HttpError(500, "La respuesta no puede exponer passwordHash.", "PASSWORD_HASH_LEAK");
  }
}

export function generateTemporaryPassword(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const bytes = randomBytes(14);
  let out = "";
  for (const byte of bytes) {
    out += alphabet[byte % alphabet.length];
  }
  return out;
}

export function publicUserJson<T extends Record<string, unknown>>(user: T): T {
  const { passwordHash: _ignored, ...safe } = user as T & { passwordHash?: unknown };
  assertNoPasswordHashExposure(safe);
  return safe as T;
}
