import { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { HttpError } from "../shared/http-error.js";

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof HttpError) {
    res.status(err.statusCode).json({ message: err.message });
    return;
  }

  if (err instanceof ZodError) {
    res.status(400).json({
      message: "Payload invalido",
      issues: err.issues
    });
    return;
  }

  res.status(500).json({ message: "Error interno del servidor" });
}
