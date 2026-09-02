import type { NextFunction, Request, Response } from "express";
import { env } from "../../config/env.js";
import { HttpError } from "../../shared/http-error.js";
import {
  authenticatePdaGrant,
  tokenFromCookie,
  type PdaGrantContext
} from "./pda-auth.service.js";

declare global {
  namespace Express {
    interface Request {
      pdaGrant?: PdaGrantContext;
    }
  }
}

function expectedOrigins(req: Request): string[] {
  const host = req.get("x-forwarded-host") || req.get("host");
  if (!host) return [];
  const forwardedProtocol = req.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const protocol = forwardedProtocol || req.protocol;
  return [`${protocol}://${host}`];
}

export function requirePdaSameOrigin(req: Request, _res: Response, next: NextFunction): void {
  if (!["POST", "PUT", "PATCH", "DELETE"].includes(req.method.toUpperCase())) {
    next();
    return;
  }
  const origin = req.get("origin");
  const fetchSite = req.get("sec-fetch-site");
  if (
    (!origin && env.NODE_ENV !== "test") ||
    (origin && !expectedOrigins(req).includes(origin)) ||
    (fetchSite && fetchSite !== "same-origin")
  ) {
    throw new HttpError(403, "Origen PDA no autorizado.", "PDA_ORIGIN_FORBIDDEN");
  }
  if (!req.is("application/json")) {
    throw new HttpError(415, "Las mutaciones PDA requieren JSON.", "PDA_JSON_REQUIRED");
  }
  next();
}

export async function requirePdaGrant(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  const token = tokenFromCookie(req.headers.cookie);
  if (!token) throw new HttpError(401, "Capacidad PDA no proporcionada.", "PDA_GRANT_REQUIRED");
  req.pdaGrant = await authenticatePdaGrant(token);
  next();
}
