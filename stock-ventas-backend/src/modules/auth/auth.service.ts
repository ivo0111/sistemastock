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
    {
      id: user.id,
      usuario: user.usuario,
      rol: user.rol,
      debeCambiarPassword: user.debeCambiarPassword,
    },
    process.env.JWT_SECRET as string,
    { expiresIn: process.env.JWT_EXPIRES_IN || "8h" } as jwt.SignOptions
  );

  return {
    token,
    // El frontend usa esta bandera para redirigir al cambio obligatorio y el
    // backend, vía requireAuth, bloquea cualquier otra operación mientras siga
    // en true (así no se puede saltear la pantalla llamando a la API directo).
    debeCambiarPassword: user.debeCambiarPassword,
    usuario: {
      id: user.id,
      nombre: user.nombre,
      usuario: user.usuario,
      rol: user.rol,
      debeCambiarPassword: user.debeCambiarPassword,
    },
  };
}
