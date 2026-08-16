import { NextFunction, Request, Response } from "express";
import jwt, { JwtPayload } from "jsonwebtoken";
import { env } from "../config/env.js";
import { HttpError } from "../shared/http-error.js";
import { prisma } from "../db/prisma.js";

export type UserRole = "ADMIN" | "OPERATOR" | "SUPERVISOR" | "CLIENT";
const userRoles: readonly UserRole[] = ["ADMIN", "OPERATOR", "SUPERVISOR", "CLIENT"];

type AuthPayload = JwtPayload & {
  sub: string;
  role: UserRole;
  email: string;
};

declare global {
  namespace Express {
    interface Request {
      auth?: {
        userId: string;
        role: UserRole;
        email: string;
        clientId: string | null;
      };
    }
  }
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
        client: { select: { active: true } }
      }
    });
    if (!user?.isActive) {
      throw new HttpError(401, "Sesion invalida o usuario desactivado");
    }
    if (!userRoles.includes(user.role as UserRole)) {
      throw new HttpError(403, "Rol de usuario no autorizado");
    }
    if (user.role === "CLIENT" && (!user.clientId || !user.client?.active)) {
      throw new HttpError(403, "Usuario CLIENT sin cliente activo asignado");
    }
    req.auth = {
      userId: user.id,
      role: user.role as UserRole,
      email: user.email,
      clientId: user.clientId
    };
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
