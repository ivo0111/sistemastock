import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { prisma } from "../../lib/prisma";
import { AppError } from "../../utils/AppError";

export async function login(usuario: string, password: string) {
  const user = await prisma.usuario.findUnique({ where: { usuario } });

  if (!user || !user.activo) {
    throw new AppError("CREDENCIALES_INVALIDAS", "Usuario o contraseña incorrectos", 401);
  }

  const passwordOk = await bcrypt.compare(password, user.passwordHash);
  if (!passwordOk) {
    throw new AppError("CREDENCIALES_INVALIDAS", "Usuario o contraseña incorrectos", 401);
  }

  const token = jwt.sign(
    { id: user.id, usuario: user.usuario, rol: user.rol },
    process.env.JWT_SECRET as string,
    { expiresIn: process.env.JWT_EXPIRES_IN || "8h" } as jwt.SignOptions
  );

  return {
    token,
    usuario: { id: user.id, nombre: user.nombre, usuario: user.usuario, rol: user.rol },
  };
}
