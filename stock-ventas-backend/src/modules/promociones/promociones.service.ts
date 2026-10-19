import { prisma } from "../../lib/prisma";
import { AppError } from "../../utils/AppError";
import { Promocion, TipoPromocion } from "@prisma/client";

interface PromocionInput {
  nombre: string;
  tipo: TipoPromocion;
  productoId?: number | null;
  valor: number;
  cantidadMinima?: number;
  activo?: boolean;
  fechaInicio?: Date | null;
  fechaFin?: Date | null;
}

export async function listarPromociones() {
  return prisma.promocion.findMany({
    include: { producto: { select: { id: true, nombre: true, sku: true } } },
    orderBy: { creadoEn: "desc" },
  });
}

export async function obtenerPromocion(id: number) {
  const promocion = await prisma.promocion.findUnique({
    where: { id },
    include: { producto: { select: { id: true, nombre: true, sku: true } } },
  });
  if (!promocion) throw new AppError("PROMOCION_NO_ENCONTRADA", "La promoción no existe", 404);
  return promocion;
}

async function validarProducto(productoId?: number | null) {
  if (!productoId) return;
  const producto = await prisma.producto.findUnique({ where: { id: productoId } });
  if (!producto) {
    throw new AppError("PRODUCTO_NO_ENCONTRADO", `El producto ${productoId} no existe`, 404);
  }
}

function validarFechas(input: { fechaInicio?: Date | null; fechaFin?: Date | null }) {
  if (input.fechaInicio && input.fechaFin && input.fechaFin < input.fechaInicio) {
    throw new AppError(
      "FECHAS_INVALIDAS",
      "La fecha de fin no puede ser anterior a la fecha de inicio",
      400
    );
  }
}

export async function crearPromocion(input: PromocionInput) {
  await validarProducto(input.productoId);
  validarFechas(input);
  return prisma.promocion.create({
    data: {
      nombre: input.nombre,
      tipo: input.tipo,
      productoId: input.productoId ?? null,
      valor: input.valor,
      cantidadMinima: input.cantidadMinima ?? 1,
      activo: input.activo ?? true,
      fechaInicio: input.fechaInicio ?? null,
      fechaFin: input.fechaFin ?? null,
    },
  });
}

export async function actualizarPromocion(id: number, input: Partial<PromocionInput>) {
  await obtenerPromocion(id);
  await validarProducto(input.productoId);
  validarFechas(input);
  return prisma.promocion.update({ where: { id }, data: input });
}

export async function eliminarPromocion(id: number) {
  await obtenerPromocion(id);
  return prisma.promocion.delete({ where: { id } });
}

/** Promociones vigentes hoy (activo y dentro del rango de fechas, si tiene). */
export async function obtenerPromocionesActivas(ahora = new Date()): Promise<Promocion[]> {
  return prisma.promocion.findMany({
    where: {
      activo: true,
      AND: [
        { OR: [{ fechaInicio: null }, { fechaInicio: { lte: ahora } }] },
        { OR: [{ fechaFin: null }, { fechaFin: { gte: ahora } }] },
      ],
    },
    orderBy: { id: "asc" },
  });
}

// ─────────────────────────────────────────────
// Cálculo de la bonificación que aplica una promoción sobre una línea del
// carrito. Es la misma regla que replica el POS (src/utils/promociones.js):
//   - DESCUENTO_PORCENTUAL: `valor`% sobre la línea, si hay cantidad mínima.
//   - SEGUNDA_UNIDAD:       `valor`% sobre cada 2da unidad (bonificación
//                           equivalente de la línea = valor * pares / cantidad).
//   - DOS_POR_UNO:          2x1 → la mitad de las unidades (pares) sale gratis.
// Con `productoId` null la promoción aplica a todos los productos.
// ─────────────────────────────────────────────

function redondear2(valor: number): number {
  return Math.round(valor * 100) / 100;
}

function clamp0a100(valor: number): number {
  return Math.min(100, Math.max(0, valor));
}

export function bonificacionPorPromocion(promocion: Promocion, cantidad: number): number | null {
  const valor = Number(promocion.valor);

  switch (promocion.tipo) {
    case "DESCUENTO_PORCENTUAL": {
      if (cantidad < promocion.cantidadMinima) return null;
      return clamp0a100(redondear2(valor));
    }
    case "SEGUNDA_UNIDAD": {
      const minima = Math.max(2, promocion.cantidadMinima);
      if (cantidad < minima) return null;
      const unidadesDescontadas = Math.floor(cantidad / 2);
      return clamp0a100(redondear2((valor * unidadesDescontadas) / cantidad));
    }
    case "DOS_POR_UNO": {
      const minima = Math.max(2, promocion.cantidadMinima);
      if (cantidad < minima) return null;
      return clamp0a100(redondear2((100 * Math.floor(cantidad / 2)) / cantidad));
    }
    default:
      return null;
  }
}

export function esAplicableA(
  promocion: Promocion,
  productoId: number,
  ahora = new Date()
): boolean {
  if (!promocion.activo) return false;
  if (promocion.fechaInicio && promocion.fechaInicio > ahora) return false;
  if (promocion.fechaFin && promocion.fechaFin < ahora) return false;
  // null => promoción general (aplica a todos los productos)
  if (promocion.productoId !== null && promocion.productoId !== productoId) return false;
  return true;
}

/** Mejor promoción vigente para (producto, cantidad), o null si no aplica. */
export function mejorPromocionPara(
  promociones: Promocion[],
  productoId: number,
  cantidad: number,
  ahora = new Date()
): { promocion: Promocion; bonificacion: number } | null {
  let mejor: { promocion: Promocion; bonificacion: number } | null = null;

  for (const promocion of promociones) {
    if (!esAplicableA(promocion, productoId, ahora)) continue;
    const bonificacion = bonificacionPorPromocion(promocion, cantidad);
    if (bonificacion === null || bonificacion <= 0) continue;
    if (!mejor || bonificacion > mejor.bonificacion) {
      mejor = { promocion, bonificacion };
    }
  }

  return mejor;
}
