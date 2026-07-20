import { prisma } from "../../lib/prisma";
import { AppError } from "../../utils/AppError";
import { EstadoCompra, TipoMovimientoStock, Prisma } from "@prisma/client";
import { Decimal } from "@prisma/client/runtime/library";

interface ItemInput {
  productoId: number;
  cantidad: number;
  precioUnitario: number;
}

interface CrearCompraInput {
  proveedorId: number;
  items: ItemInput[];
  usuarioId: number;
  actualizarPrecioCosto?: boolean; // si true, actualiza precioCosto del producto con el de esta compra
}

export async function crearCompra(input: CrearCompraInput) {
  if (input.items.length === 0) {
    throw new AppError("COMPRA_VACIA", "La compra necesita al menos un ítem", 400);
  }

  const proveedor = await prisma.proveedor.findUnique({ where: { id: input.proveedorId } });
  if (!proveedor) {
    throw new AppError("PROVEEDOR_NO_ENCONTRADO", "El proveedor no existe", 404);
  }

  // Igual que en ventas: todo en una única transacción. Acá no hay riesgo de
  // "sobre-compra" (no puede quedar negativo), pero sí queremos atomicidad:
  // si falla un ítem a mitad de camino, no queremos productos con stock
  // sumado a medias.
  return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    let total = new Decimal(0);
    const itemsData: { productoId: number; cantidad: number; precioUnitario: number }[] = [];

    for (const item of input.items) {
      const producto = await tx.producto.findUnique({ where: { id: item.productoId } });
      if (!producto) {
        throw new AppError(
          "PRODUCTO_NO_ENCONTRADO",
          `El producto ${item.productoId} no existe`,
          404
        );
      }

      total = total.add(new Decimal(item.precioUnitario).mul(item.cantidad));
      itemsData.push(item);

      await tx.producto.update({
        where: { id: item.productoId },
        data: {
          stockActual: { increment: item.cantidad },
          ...(input.actualizarPrecioCosto ? { precioCosto: item.precioUnitario } : {}),
        },
      });
    }

    const compra = await tx.compra.create({
      data: {
        proveedorId: input.proveedorId,
        total,
        estado: EstadoCompra.RECIBIDA,
        items: { create: itemsData },
      },
      include: { items: true },
    });

    for (const item of itemsData) {
      await tx.movimientoStock.create({
        data: {
          productoId: item.productoId,
          tipo: TipoMovimientoStock.COMPRA,
          cantidad: item.cantidad,
          usuarioId: input.usuarioId,
          referenciaTipo: "compra",
          referenciaId: compra.id,
        },
      });
    }

    return compra;
  });
}

export async function listarCompras(params: {
  desde?: Date;
  hasta?: Date;
  proveedorId?: number;
  page?: number;
  limit?: number;
}) {
  const { page = 1, limit = 20 } = params;

  const where = {
    fecha: { gte: params.desde, lte: params.hasta },
    proveedorId: params.proveedorId,
  };

  const [data, total] = await Promise.all([
    prisma.compra.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      include: { items: true, proveedor: true },
      orderBy: { fecha: "desc" },
    }),
    prisma.compra.count({ where }),
  ]);

  return { data, total, page, limit };
}

export async function obtenerCompra(id: number) {
  const compra = await prisma.compra.findUnique({
    where: { id },
    include: { items: { include: { producto: true } }, proveedor: true },
  });
  if (!compra) throw new AppError("COMPRA_NO_ENCONTRADA", "La compra no existe", 404);
  return compra;
}