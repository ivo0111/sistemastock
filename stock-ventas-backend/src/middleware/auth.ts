import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { AppError } from "../utils/AppError";
import { Rol } from "@prisma/client";

export interface AuthPayload {
  id: number;
  usuario: string;
  rol: Rol;
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
