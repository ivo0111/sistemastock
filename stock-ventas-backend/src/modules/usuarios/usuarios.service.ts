import bcrypt from "bcrypt";
import { prisma } from "../../lib/prisma";
import { AppError } from "../../utils/AppError";
import { Rol } from "@prisma/client";

const SELECT_USUARIO = { id: true, nombre: true, usuario: true, rol: true, activo: true } as const;

const ROUNDS_BCRYPT = 10;

export async function listarUsuarios() {
  return prisma.usuario.findMany({ select: SELECT_USUARIO, orderBy: { nombre: "asc" } });
}

interface CrearUsuarioInput {
  nombre: string;
  usuario: string;
  password: string;
  rol: Rol;
}

export async function crearUsuario(input: CrearUsuarioInput) {
  const existe = await prisma.usuario.findUnique({ where: { usuario: input.usuario } });
  if (existe) throw new AppError("USUARIO_DUPLICADO", "Ya existe un usuario con ese nombre de usuario", 409);

  const passwordHash = await bcrypt.hash(input.password, ROUNDS_BCRYPT);
  return prisma.usuario.create({
    data: {
      nombre: input.nombre,
      usuario: input.usuario,
      passwordHash,
      rol: input.rol,
    },
    select: SELECT_USUARIO,
  });
}

interface ActualizarUsuarioInput {
  nombre?: string;
  password?: string;
  rol?: Rol;
  activo?: boolean;
}

export async function actualizarUsuario(id: number, input: ActualizarUsuarioInput) {
  const usuario = await prisma.usuario.findUnique({ where: { id } });
  if (!usuario) throw new AppError("USUARIO_NO_ENCONTRADO", "El usuario no existe", 404);

  const data: { nombre?: string; passwordHash?: string; rol?: Rol; activo?: boolean } = {};
  if (input.nombre !== undefined) data.nombre = input.nombre;
  if (input.rol !== undefined) data.rol = input.rol;
  if (input.activo !== undefined) data.activo = input.activo;
  if (input.password) data.passwordHash = await bcrypt.hash(input.password, ROUNDS_BCRYPT);

  return prisma.usuario.update({ where: { id }, data, select: SELECT_USUARIO });
}

// Cambio de contraseña del propio usuario (cualquier rol logueado)
export async function cambiarPasswordPropia(usuarioId: number, passwordActual: string, passwordNuevo: string) {
  const usuario = await prisma.usuario.findUnique({ where: { id: usuarioId } });
  if (!usuario) throw new AppError("USUARIO_NO_ENCONTRADO", "El usuario no existe", 404);

  const ok = await bcrypt.compare(passwordActual, usuario.passwordHash);
  if (!ok) throw new AppError("PASSWORD_ACTUAL_INCORRECTA", "La contraseña actual es incorrecta", 400);

  const passwordHash = await bcrypt.hash(passwordNuevo, ROUNDS_BCRYPT);
  await prisma.usuario.update({ where: { id: usuarioId }, data: { passwordHash } });
}
