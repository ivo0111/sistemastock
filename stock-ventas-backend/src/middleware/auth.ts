import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { AppError } from "../utils/AppError";
import { Rol } from "@prisma/client";

export interface AuthPayload {
  id: number;
  usuario: string;
  rol: Rol;
  debeCambiarPassword?: boolean;
}

declare global {
  namespace Express {
    interface Request {
      auth?: AuthPayload;
    }
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return next(new AppError("NO_AUTORIZADO", "Falta token de autenticación", 401));
  }

  const token = header.slice("Bearer ".length);
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET as string) as AuthPayload;
    req.auth = payload;

    // Contraseña inicial: el único endpoint autenticado permitido es el cambio
    // de la propia contraseña. El frontend también redirige, pero esta guarda
    // evita que se saltee llamando a la API directamente con el token inicial.
    const path = req.originalUrl.split("?")[0];
    const esCambioPassword = /\/auth\/cambiar-password\/?$/.test(path);
    if (payload.debeCambiarPassword && !esCambioPassword) {
      return next(
        new AppError(
          "CAMBIO_PASSWORD_REQUERIDO",
          "Tenés que cambiar la contraseña inicial antes de usar el sistema",
          403
        )
      );
    }

    next();
  } catch {
    return next(new AppError("TOKEN_INVALIDO", "Token inválido o expirado", 401));
  }
}

// Uso: requireRole("ADMIN") como middleware después de requireAuth
export function requireRole(...roles: Rol[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.auth) {
      return next(new AppError("NO_AUTORIZADO", "Falta autenticación", 401));
    }
    if (!roles.includes(req.auth.rol)) {
      return next(new AppError("PERMISO_DENEGADO", "No tenés permiso para esta acción", 403));
    }
    next();
  };
}
