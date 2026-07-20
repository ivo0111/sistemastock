import { prisma } from "../../lib/prisma";
import { AppError } from "../../utils/AppError";

export async function listarCategorias() {
  return prisma.categoria.findMany({ orderBy: { nombre: "asc" } });
}

export async function crearCategoria(nombre: string) {
  const existe = await prisma.categoria.findUnique({ where: { nombre } });
  if (existe) throw new AppError("CATEGORIA_DUPLICADA", "Ya existe una categoría con ese nombre", 409);
  return prisma.categoria.create({ data: { nombre } });
}

export async function actualizarCategoria(id: number, nombre: string) {
  const categoria = await prisma.categoria.findUnique({ where: { id } });
  if (!categoria) throw new AppError("CATEGORIA_NO_ENCONTRADA", "La categoría no existe", 404);
  return prisma.categoria.update({ where: { id }, data: { nombre } });
}

export async function eliminarCategoria(id: number) {
  const categoria = await prisma.categoria.findUnique({ where: { id } });
  if (!categoria) throw new AppError("CATEGORIA_NO_ENCONTRADA", "La categoría no existe", 404);

  const productosAsociados = await prisma.producto.count({ where: { categoriaId: id, activo: true } });
  if (productosAsociados > 0) {
    throw new AppError(
      "CATEGORIA_EN_USO",
      `No se puede borrar: tiene ${productosAsociados} producto(s) activo(s) asociado(s)`,
      409
    );
  }

  return prisma.categoria.delete({ where: { id } });
}