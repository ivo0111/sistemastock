import { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";
import { mapearErrorPrisma } from "../utils/prismaErrors";
import { AppError } from "../utils/AppError";

interface BodyParserError {
  type?: string;
  limit?: number;
}

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

  // Errores de body-parser (express.json / urlencoded)
  const tipo = (err as BodyParserError | null)?.type;
  if (tipo === "entity.too.large") {
    const limiteMb = ((err as BodyParserError).limit ?? 0) / (1024 * 1024);
    return res.status(413).json({
      error: {
        code: "CUERPO_DEMASIADO_GRANDE",
        message: limiteMb > 0
          ? `El cuerpo de la petición supera el tamaño máximo permitido (${limiteMb} MB)`
          : "El cuerpo de la petición supera el tamaño máximo permitido",
      },
    });
  }
  if (tipo === "entity.parse.failed") {
    return res.status(400).json({
      error: { code: "JSON_INVALIDO", message: "El cuerpo de la petición no es un JSON válido" },
    });
  }

  // Errores conocidos de Prisma: se traducen a códigos HTTP con mensajes claros
  // en lugar de caer en un 500 genérico.
  const prismaError = mapearErrorPrisma(err);
  if (prismaError) {
    return res.status(prismaError.statusCode).json({
      error: { code: prismaError.code, message: prismaError.message },
    });
  }

  // Error no controlado: lo logueamos pero no exponemos detalles internos al cliente
  console.error(err);
  return res.status(500).json({
    error: { code: "INTERNAL_ERROR", message: "Ocurrió un error inesperado" },
  });
}
