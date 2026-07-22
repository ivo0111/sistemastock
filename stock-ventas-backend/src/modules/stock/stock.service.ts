import { prisma } from "../../lib/prisma";
import { Prisma, TipoMovimientoStock } from "@prisma/client";

interface ListarMovimientosParams {
  productoId?: number;
  tipo?: TipoMovimientoStock;
  desde?: Date;
  hasta?: Date;
  page?: number;
  limit?: number;
}

// Lectura de la tabla movimientos_stock — es la fuente de verdad de auditoría
// para todo cambio de stock (venta, compra, ajuste manual, devolución, alta
// inicial). Este endpoint no escribe nada, solo consulta.
export async function listarMovimientos(params: ListarMovimientosParams) {
  const { page = 1, limit = 20 } = params;

  const where: Prisma.MovimientoStockWhereInput = {
    productoId: params.productoId,
    tipo: params.tipo,
    fecha: { gte: params.desde, lte: params.hasta },
  };

  const [rows, total] = await Promise.all([
    prisma.movimientoStock.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { fecha: "desc" },
      include: {
        producto: { select: { nombre: true } },
        usuario: { select: { nombre: true } },
      },
    }),
    prisma.movimientoStock.count({ where }),
  ]);

  const data = rows.map((m) => ({
    id: m.id,
    fecha: m.fecha,
    producto_id: m.productoId,
    producto_nombre: m.producto.nombre,
    tipo: m.tipo.toLowerCase(),
    cantidad: m.cantidad,
    usuario_id: m.usuarioId,
    usuario_nombre: m.usuario.nombre,
    referencia_tipo: m.referenciaTipo ?? undefined,
    referencia_id: m.referenciaId ?? undefined,
    motivo: m.motivo ?? undefined,
  }));

  return { data, total, page, limit };
}