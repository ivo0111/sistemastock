// Espejo del cálculo del backend
// (stock-ventas-backend/src/modules/promociones/promociones.service.ts).
// Si se cambia una regla acá, hay que cambiarla también allá: el backend
// recalcula la bonificación mínima al confirmar la venta.

const redondear2 = v => Math.round(v * 100) / 100
const clamp0a100 = v => Math.min(100, Math.max(0, v))

export function bonificacionPorPromocion(promocion, cantidad) {
  const valor = Number(promocion.valor)
  const cantidadMinima = Number(promocion.cantidadMinima ?? 1)

  switch (promocion.tipo) {
    case 'DESCUENTO_PORCENTUAL': {
      if (cantidad < cantidadMinima) return null
      return clamp0a100(redondear2(valor))
    }
    case 'SEGUNDA_UNIDAD': {
      if (cantidad < Math.max(2, cantidadMinima)) return null
      const unidadesDescontadas = Math.floor(cantidad / 2)
      return clamp0a100(redondear2((valor * unidadesDescontadas) / cantidad))
    }
    case 'DOS_POR_UNO': {
      if (cantidad < Math.max(2, cantidadMinima)) return null
      return clamp0a100(redondear2((100 * Math.floor(cantidad / 2)) / cantidad))
    }
    default:
      return null
  }
}

export function mejorPromocionPara(promociones, productoId, cantidad, ahora = new Date()) {
  let mejor = null
  for (const promocion of promociones) {
    if (!promocion.activo) continue
    if (promocion.fechaInicio && new Date(promocion.fechaInicio) > ahora) continue
    if (promocion.fechaFin && new Date(promocion.fechaFin) < ahora) continue
    // productoId null => promoción general (aplica a todos los productos)
    if (promocion.productoId != null && Number(promocion.productoId) !== productoId) continue
    const bonificacion = bonificacionPorPromocion(promocion, cantidad)
    if (bonificacion == null || bonificacion <= 0) continue
    if (!mejor || bonificacion > mejor.bonificacion) {
      mejor = { promocion, bonificacion }
    }
  }
  return mejor
}
