import type { NextFunction, Request, Response } from "express";

export function isPdaScannerLabEnabled(value: "true" | "false"): boolean {
  return value === "true";
}

export function createPdaScannerLabGate(enabled: boolean) {
  return (_req: Request, res: Response, next: NextFunction): void => {
    if (!enabled) {
      res.status(404).send("Not Found");
      return;
    }
    next();
  };
}
