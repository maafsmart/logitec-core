import { NextFunction, Request, Response } from "express";
import { prisma } from "../../db/prisma.js";
import { HttpError } from "../../shared/http-error.js";
import {
  digestPdaSecret,
  expirePdaGrant,
  pdaGrantFailure,
  PDA_COOKIE_NAME
} from "./pda-auth.service.js";

declare global {
  namespace Express {
    interface Request {
      pdaAuth?: {
        grantId: string;
        grantPublicId: string;
        clientId: string;
        sessionId: string;
        createdById: string;
        scopes: string[];
        expiresAt: Date;
      };
    }
  }
}

function cookieValue(header: string | undefined, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const [key, ...value] = part.trim().split("=");
    if (key === name) return decodeURIComponent(value.join("="));
  }
  return null;
}

export function assertPdaSameOrigin(req: Request, _res: Response, next: NextFunction): void {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
  const fetchSite = req.get("sec-fetch-site");
  if (fetchSite === "same-origin") return next();
  if (fetchSite) {
    throw new HttpError(403, "Origen PDA no permitido.", "PDA_CSRF_REJECTED");
  }
  const origin = req.get("origin");
  if (origin) {
    const allowedHosts = new Set([
      req.get("host"),
      req.get("x-forwarded-host"),
      "www.control.logitec.com.mx"
    ].filter(Boolean));
    let source: URL;
    try {
      source = new URL(origin);
    } catch {
      throw new HttpError(403, "Origen PDA no permitido.", "PDA_CSRF_REJECTED");
    }
    const canonical = source.protocol === "https:" && source.host === "www.control.logitec.com.mx";
    if (!allowedHosts.has(source.host) && !canonical) {
      throw new HttpError(403, "Origen PDA no permitido.", "PDA_CSRF_REJECTED");
    }
  }
  next();
}

export async function requirePdaGrant(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const token = cookieValue(req.headers.cookie, PDA_COOKIE_NAME);
  if (!token) throw new HttpError(401, "Grant PDA no proporcionado.", "PDA_GRANT_REQUIRED");

  const grant = await prisma.pdaLabGrant.findUnique({
    where: { tokenDigest: digestPdaSecret(token) },
    select: {
      id: true,
      publicId: true,
      clientId: true,
      sessionId: true,
      createdById: true,
      scopes: true,
      status: true,
      expiresAt: true
    }
  });
  if (!grant) throw new HttpError(401, "Grant PDA inválido.", "PDA_GRANT_INVALID");
  const failure = pdaGrantFailure(grant);
  if (failure === "PDA_GRANT_REVOKED") {
    throw new HttpError(401, "Grant PDA revocado.", failure);
  }
  if (failure === "PDA_GRANT_EXPIRED") {
    await expirePdaGrant(grant.id);
    throw new HttpError(401, "Grant PDA expirado.", failure);
  }

  req.pdaAuth = {
    grantId: grant.id,
    grantPublicId: grant.publicId,
    clientId: grant.clientId,
    sessionId: grant.sessionId,
    createdById: grant.createdById,
    scopes: grant.scopes,
    expiresAt: grant.expiresAt
  };
  void prisma.pdaLabGrant.update({
    where: { id: grant.id },
    data: { lastUsedAt: new Date() }
  }).catch(() => {});
  next();
}

export function requirePdaScope(scope: string) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.pdaAuth?.scopes.includes(scope)) {
      throw new HttpError(403, "Scope PDA insuficiente.", "PDA_SCOPE_REQUIRED");
    }
    next();
  };
}

export async function requirePdaReleaseReceipt(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  const token = cookieValue(req.headers.cookie, PDA_COOKIE_NAME);
  if (!token) throw new HttpError(401, "Grant PDA no proporcionado.", "PDA_GRANT_REQUIRED");
  const grant = await prisma.pdaLabGrant.findUnique({
    where: { tokenDigest: digestPdaSecret(token) },
    select: {
      id: true,
      publicId: true,
      clientId: true,
      sessionId: true,
      createdById: true,
      scopes: true,
      status: true,
      expiresAt: true,
      revokeReason: true
    }
  });
  if (!grant || grant.status !== "REVOKED" || grant.revokeReason !== "RUN_RELEASED") {
    throw new HttpError(401, "No existe recibo de liberación.", "PDA_RELEASE_RECEIPT_INVALID");
  }
  req.pdaAuth = {
    grantId: grant.id,
    grantPublicId: grant.publicId,
    clientId: grant.clientId,
    sessionId: grant.sessionId,
    createdById: grant.createdById,
    scopes: grant.scopes,
    expiresAt: grant.expiresAt
  };
  next();
}
