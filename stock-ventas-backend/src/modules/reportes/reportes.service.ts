import { prisma } from "../../lib/prisma";
import { Prisma, EstadoVenta } from "@prisma/client";
import { AppError } from "../../utils/AppError";

type Agrupacion = "dia" | "semana" | "mes";

const TRUNC_POR_AGRUPACION: Record<Agrupacion, string> = {
  dia: "day",
  semana: "week",
  mes: "month",
};

export async function reporteVentas(desde: Date, hasta: Date, agruparPor: Agrupacion = "dia") {
  const trunc = TRUNC_POR_AGRUPACION[agruparPor];
  if (!trunc) {
    throw new AppError("AGRUPACION_INVALIDA", "agrupar_por debe ser dia, semana o mes", 400);
  }

  // date_trunc no acepta bind params para la unidad, pero `trunc` sale de un
  // mapeo fijo (no del input crudo del usuario), así que no hay riesgo de
  // inyección SQL acá.
  const rows = await prisma.$queryRaw<
    { periodo: Date; total: string; cantidad_ventas: bigint }[]
  >(
    Prisma.sql`
      SELECT
        date_trunc(${trunc}, fecha) AS periodo,
        SUM(total) AS total,
        COUNT(*) AS cantidad_ventas
      FROM ventas
      WHERE estado = 'CONFIRMADA' AND fecha BETWEEN ${desde} AND ${hasta}
      GROUP BY periodo
      ORDER BY periodo ASC
    `
  );

  return rows.map((r) => ({
    periodo: r.periodo,
    total: Number(r.total),
    cantidadVentas: Number(r.cantidad_ventas),
  }));
}

export async function productosMasVendidos(desde: Date, hasta: Date, limit = 10) {
  const rows = await prisma.$queryRaw<
    { producto_id: number; nombre: string; cantidad_vendida: bigint; total_vendido: string }[]
  >(
    Prisma.sql`
      SELECT
        p.id AS producto_id,
        p.nombre AS nombre,
        SUM(vi.cantidad) AS cantidad_vendida,
        SUM(vi.subtotal) AS total_vendido
      FROM venta_items vi
      JOIN ventas v ON v.id = vi.venta_id
      JOIN productos p ON p.id = vi.producto_id
      WHERE v.estado = 'CONFIRMADA' AND v.fecha BETWEEN ${desde} AND ${hasta}
      GROUP BY p.id, p.nombre
      ORDER BY cantidad_vendida DESC
      LIMIT ${limit}
    `
  );

  return rows.map((r) => ({
    productoId: r.producto_id,
    nombre: r.nombre,
    cantidadVendida: Number(r.cantidad_vendida),
    totalVendido: Number(r.total_vendido),
  }));
}

// Ganancia bruta = precio de venta de cada ítem - costo ACTUAL del producto.
// Importante: usa el precioCosto de hoy, no el que tenía el producto en el
// momento de cada venta (eso requeriría guardar el costo histórico por ítem,
// que el modelo actual no contempla). Es una aproximación razonable para un
// negocio chico, pero puede desviarse si los costos cambiaron mucho en el
// período consultado.
export async function reporteMargen(desde: Date, hasta: Date) {
  const rows = await prisma.$queryRaw<
    { total_ventas: string; total_costo: string }[]
  >(
    Prisma.sql`
      SELECT
        SUM(vi.subtotal) AS total_ventas,
        SUM(vi.cantidad * p.precio_costo) AS total_costo
      FROM venta_items vi
      JOIN ventas v ON v.id = vi.venta_id
      JOIN productos p ON p.id = vi.producto_id
      WHERE v.estado = 'CONFIRMADA' AND v.fecha BETWEEN ${desde} AND ${hasta}
    `
  );

  const totalVentas = Number(rows[0]?.total_ventas ?? 0);
  const totalCosto = Number(rows[0]?.total_costo ?? 0);

  return {
    totalVentas,
    totalCosto,
    gananciaBruta: totalVentas - totalCosto,
    margenPorcentaje: totalVentas > 0 ? ((totalVentas - totalCosto) / totalVentas) * 100 : 0,
    nota: "Calculado con el precio de costo actual de cada producto, no el histórico al momento de la venta.",
  };
}

export async function productosStockBajo() {
  return prisma.$queryRaw<
    { id: number; sku: string; nombre: string; stock_actual: number; stock_minimo: number }[]
  >(
    Prisma.sql`
      SELECT id, sku, nombre, stock_actual, stock_minimo
      FROM productos
      WHERE activo = true AND stock_actual <= stock_minimo
      ORDER BY (stock_actual - stock_minimo) ASC
    `
  );
}