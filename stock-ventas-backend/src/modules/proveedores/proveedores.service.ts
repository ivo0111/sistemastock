import { prisma } from "../../lib/prisma";
import { AppError } from "../../utils/AppError";

interface ProveedorInput {
  nombre: string;
  contacto?: string;
  telefono?: string;
  email?: string;
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
  return prisma.proveedor.create({ data: input });
}

export async function actualizarProveedor(id: number, input: Partial<ProveedorInput>) {
  await obtenerProveedor(id);
  return prisma.proveedor.update({ where: { id }, data: input });
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