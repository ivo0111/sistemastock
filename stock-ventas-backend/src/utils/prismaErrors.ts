import { Prisma } from "@prisma/client";
import { AppError } from "./AppError";

export interface ErrorMapeado {
  statusCode: number;
  code: string;
  message: string;
}

// Traduce los errores conocidos de Prisma a un estado HTTP y un mensaje apto
// para el usuario. Devuelve null para cualquier otro error.
export function mapearErrorPrisma(err: unknown): ErrorMapeado | null {
  if (!(err instanceof Prisma.PrismaClientKnownRequestError)) return null;

  const targets = Array.isArray(err.meta?.target) ? (err.meta.target as string[]) : [];

  switch (err.code) {
    case "P2002": // violación de constraint único
      return {
        statusCode: 409,
        code: "RECURSO_DUPLICADO",
        message: targets.length
          ? `Ya existe un registro con ese valor en: ${targets.join(", ")}`
          : "Ya existe un registro con esos datos",
      };
    case "P2003": // foreign key inválida
      return {
        statusCode: 409,
        code: "REFERENCIA_INVALIDA",
        message: "No se puede completar la operación: la referencia no existe o el registro tiene datos asociados",
      };
    case "P2025": // registro a actualizar/eliminar no existe
      return {
        statusCode: 404,
        code: "RECURSO_NO_ENCONTRADO",
        message: "El registro no existe o fue eliminado",
      };
    default:
      return null;
  }
}

// Mensaje apto para el usuario final, para contextos que no pasan por el
// errorHandler de Express (p. ej. el motivo de cada fila en la importación
// masiva de productos). El error real se loguea del lado servidor.
export function mensajeErrorUsuario(err: unknown): string {
  if (err instanceof AppError) return err.message;
  const mapeado = mapearErrorPrisma(err);
  if (mapeado) return mapeado.message;
  return "Error inesperado al procesar la fila";
}
