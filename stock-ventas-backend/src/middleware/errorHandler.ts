import { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";
import { Prisma } from "@prisma/client";
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

  // Errores conocidos de Prisma: se traducen a códigos HTTP con mensajes claros
  // en lugar de caer en un 500 genérico.
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    const targets = Array.isArray(err.meta?.target) ? (err.meta.target as string[]) : [];

    switch (err.code) {
      case "P2002": // violación de constraint único
        return res.status(409).json({
          error: {
            code: "RECURSO_DUPLICADO",
            message: targets.length
              ? `Ya existe un registro con ese valor en: ${targets.join(", ")}`
              : "Ya existe un registro con esos datos",
          },
        });
      case "P2003": // foreign key inválida
        return res.status(409).json({
          error: {
            code: "REFERENCIA_INVALIDA",
            message: "No se puede completar la operación: la referencia no existe o el registro tiene datos asociados",
          },
        });
      case "P2025": // registro a actualizar/eliminar no existe
        return res.status(404).json({
          error: { code: "RECURSO_NO_ENCONTRADO", message: "El registro no existe o fue eliminado" },
        });
    }
  }

  // Error no controlado: lo logueamos pero no exponemos detalles internos al cliente
  console.error(err);
  return res.status(500).json({
    error: { code: "INTERNAL_ERROR", message: "Ocurrió un error inesperado" },
  });
}
