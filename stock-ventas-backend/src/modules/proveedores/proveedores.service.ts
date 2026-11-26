import { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { AppError } from "../../utils/AppError";
import { normalizarCuit } from "../compras/importacion/parser";

interface ProveedorInput {
  nombre: string;
  cuit?: string | null;
  condicionIva?: "RESPONSABLE_INSCRIPTO" | "MONOTRIBUTO" | "CONSUMIDOR_FINAL" | "EXENTO" | null;
  contacto?: string | null;
  telefono?: string | null;
  email?: string | null;
}

/** Solo incluye los campos presentes: sirve para create y para update parcial. */
function normalizarDatos(input: Partial<ProveedorInput>): Record<string, unknown> {
  const datos: Record<string, unknown> = {};

  if (input.nombre !== undefined) datos.nombre = input.nombre.trim();
  if (input.cuit !== undefined) {
    const texto = input.cuit?.trim() ?? "";
    const cuit = texto ? normalizarCuit(texto) : null;
    if (texto && !cuit) {
      throw new AppError("CUIT_INVALIDO", "El CUIT debe tener 11 dígitos", 400);
    }
    datos.cuit = cuit;
  }
  if (input.condicionIva !== undefined) datos.condicionIva = input.condicionIva;
  if (input.contacto !== undefined) datos.contacto = input.contacto?.trim() || null;
  if (input.telefono !== undefined) datos.telefono = input.telefono?.trim() || null;
  if (input.email !== undefined) datos.email = input.email?.trim() || null;

  return datos;
}

function duplicado(error: unknown): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
    throw new AppError("CUIT_DUPLICADO", "Ya existe un proveedor con ese CUIT", 409);
  }
  throw error;
}

export async function listarProveedores() {
  return prisma.proveedor.findMany({ orderBy: { nombre: "asc" } });
}

export async function obtenerProveedor(id: number) {
  const proveedor = await prisma.proveedor.findUnique({ where: { id } });
  if (!proveedor) throw new AppError("PROVEEDOR_NO_ENCONTRADO", "El proveedor no existe", 404);
  return proveedor;
}

export async function crearProveedor(input: ProveedorInput) {
  try {
    return await prisma.proveedor.create({
      data: normalizarDatos(input) as Prisma.ProveedorUncheckedCreateInput,
    });
  } catch (error) {
    duplicado(error);
  }
}

export async function actualizarProveedor(id: number, input: Partial<ProveedorInput>) {
  await obtenerProveedor(id);
  try {
    return await prisma.proveedor.update({
      where: { id },
      data: normalizarDatos(input) as Prisma.ProveedorUncheckedUpdateInput,
    });
  } catch (error) {
    duplicado(error);
  }
}

export async function eliminarProveedor(id: number) {
  await obtenerProveedor(id);

  const comprasAsociadas = await prisma.compra.count({ where: { proveedorId: id } });
  if (comprasAsociadas > 0) {
    throw new AppError(
      "PROVEEDOR_EN_USO",
      `No se puede borrar: tiene ${comprasAsociadas} compra(s) asociada(s). Los proveedores con historial no se eliminan.`,
      409
    );
  }

  return prisma.proveedor.delete({ where: { id } });
}
