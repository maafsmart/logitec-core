import { NextFunction, Request, Response } from "express";
import jwt, { JwtPayload } from "jsonwebtoken";
import { env } from "../config/env.js";
import { HttpError } from "../shared/http-error.js";
import { prisma } from "../db/prisma.js";

export type UserRole = "ADMIN" | "OPERATOR" | "SUPERVISOR" | "CLIENT";
const userRoles: readonly UserRole[] = ["ADMIN", "OPERATOR", "SUPERVISOR", "CLIENT"];

export const PASSWORD_CHANGE_REQUIRED = "PASSWORD_CHANGE_REQUIRED";

function isAllowedDuringPasswordChange(req: Request): boolean {
  const path = `${req.baseUrl || ""}${req.path || ""}`.replace(/\/+$/, "") || "/";
  const method = req.method.toUpperCase();
  return (
    (method === "GET" && path === "/api/auth/me") ||
    (method === "POST" && path === "/api/auth/change-password")
  );
}

function isBoundClientRole(role: string): boolean {
  return role === "SUPERVISOR" || role === "OPERATOR" || role === "CLIENT";
}

export type AuthPayload = JwtPayload & {
  sub: string;
  role: UserRole;
  email: string;
  operationalClientId?: string;
};

declare global {
  namespace Express {
    interface Request {
      auth?: {
        userId: string;
        role: UserRole;
        email: string;
        clientId: string | null;
        operationalClientId: string | null;
        operationalClientInvalid?: boolean;
      };
    }
  }
}

export function signAccessToken(input: {
  userId: string;
  role: UserRole;
  email: string;
  operationalClientId?: string | null;
}): string {
  const payload: { role: UserRole; email: string; operationalClientId?: string } = {
    role: input.role,
    email: input.email
  };
  if (input.role === "ADMIN" && input.operationalClientId) {
    payload.operationalClientId = input.operationalClientId;
  }
  return jwt.sign(payload, env.JWT_SECRET, {
    subject: input.userId,
    expiresIn: "8h"
  });
}

export async function requireAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const token = req.headers.authorization?.replace("Bearer ", "");
  if (!token) {
    throw new HttpError(401, "Token no proporcionado");
  }

  try {
    const decoded = jwt.verify(token, env.JWT_SECRET) as AuthPayload;
    if (!decoded.sub) {
      throw new HttpError(401, "Token invalido o expirado");
    }
    const user = await prisma.user.findUnique({
      where: { id: decoded.sub },
      select: {
        id: true,
        email: true,
        role: true,
        isActive: true,
        clientId: true,
        mustChangePassword: true,
        client: { select: { active: true } }
      }
    });
    if (!user?.isActive) {
      throw new HttpError(401, "Sesion invalida o usuario desactivado");
    }
    if (!userRoles.includes(user.role as UserRole)) {
      throw new HttpError(403, "Rol de usuario no autorizado");
    }
    const role = user.role as UserRole;
    if (isBoundClientRole(role) && (!user.clientId || !user.client?.active)) {
      throw new HttpError(403, "El usuario no tiene un cliente activo asignado.", "USER_CLIENT_REQUIRED");
    }

    let operationalClientId: string | null = isBoundClientRole(role) ? user.clientId : null;
    let operationalClientInvalid = false;
    if (role === "ADMIN") {
      const claimed = typeof decoded.operationalClientId === "string" ? decoded.operationalClientId.trim() : "";
      if (claimed) {
        const contextClient = await prisma.client.findUnique({
          where: { id: claimed },
          select: { id: true, active: true }
        });
        if (contextClient?.active) {
          operationalClientId = contextClient.id;
        } else {
          operationalClientInvalid = true;
          operationalClientId = null;
        }
      }
    }

    req.auth = {
      userId: user.id,
      role,
      email: user.email,
      clientId: user.clientId,
      operationalClientId,
      operationalClientInvalid
    };
    if (user.mustChangePassword && !isAllowedDuringPasswordChange(req)) {
      throw new HttpError(
        403,
        "Debes cambiar tu contraseña temporal antes de continuar.",
        PASSWORD_CHANGE_REQUIRED
      );
    }
    next();
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(401, "Token invalido o expirado");
  }
}

export function requireRole(allowedRoles: UserRole[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.auth) {
      throw new HttpError(401, "Sesion no autenticada");
    }

    if (!allowedRoles.includes(req.auth.role)) {
      throw new HttpError(403, "No autorizado para esta operacion");
    }

    next();
  };
}
