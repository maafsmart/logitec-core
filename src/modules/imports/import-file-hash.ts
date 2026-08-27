import { createHash } from "node:crypto";

export function sha256Hex(buffer: Buffer | Uint8Array): string {
  return createHash("sha256").update(buffer).digest("hex").toUpperCase();
}

export function normalizeSha256(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/[^A-F0-9]/g, "");
}

export function isSha256Hex(value: unknown): boolean {
  return /^[A-F0-9]{64}$/.test(normalizeSha256(value));
}
