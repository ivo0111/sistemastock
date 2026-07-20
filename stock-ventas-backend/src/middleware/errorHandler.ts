import { Request, Response, NextFunction } from "express";
import { AppError } from "../utils/AppError";

export function errorHandler(err: unknown, req: Request, res: Response, next: NextFunction) {
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      error: { code: err.code, message: err.message },
    });
  }

  // Error no controlado: lo logueamos pero no exponemos detalles internos al cliente
  console.error(err);
  return res.status(500).json({
    error: { code: "INTERNAL_ERROR", message: "Ocurrió un error inesperado" },
  });
}
