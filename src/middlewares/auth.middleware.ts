import { NextFunction, Request, Response } from "express";
import jwt, { JwtPayload } from "jsonwebtoken";
import { env } from "../config/env.js";
import { HttpError } from "../shared/http-error.js";

type UserRole = "ADMIN" | "OPERATOR" | "SUPERVISOR" | "CLIENT";

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
      };
    }
  }
}

export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  const token = req.headers.authorization?.replace("Bearer ", "");
  if (!token) {
    throw new HttpError(401, "Token no proporcionado");
  }

  try {
    const decoded = jwt.verify(token, env.JWT_SECRET) as AuthPayload;
    req.auth = {
      userId: decoded.sub,
      role: decoded.role,
      email: decoded.email
    };
    next();
  } catch {
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
