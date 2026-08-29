import { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { HttpError } from "../shared/http-error.js";
import { OperationalResetError, isProductionResetGuard } from "../scripts/operational-reset/lib.js";

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof HttpError) {
    res.status(err.statusCode).json(err.code ? { message: err.message, code: err.code } : { message: err.message });
    return;
  }

  if (err instanceof OperationalResetError) {
    if (isProductionResetGuard(err.code)) {
      res.status(404).json({ message: "Not found" });
      return;
    }
    console.error("[lab-reset]", err.code, err.message);
    res.status(400).json({ message: err.message });
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
