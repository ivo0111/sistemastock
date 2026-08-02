import { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";
import { AppError } from "../utils/AppError";

export function errorHandler(err: unknown, req: Request, res: Response, next: NextFunction) {
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      error: { code: err.code, message: err.message },
    });
  }

  if (err instanceof ZodError) {
    const campos = err.errors.map(e => {
      const path = e.path.join(".");
      return path ? `${path}: ${e.message}` : e.message;
    });
    return res.status(400).json({
      error: {
        code: "VALIDACION",
        message: "Datos inválidos: " + campos.join("; "),
        details: err.errors,
      },
    });
  }

  // Error no controlado: lo logueamos pero no exponemos detalles internos al cliente
  console.error(err);
  return res.status(500).json({
    error: { code: "INTERNAL_ERROR", message: "Ocurrió un error inesperado" },
  });
}
