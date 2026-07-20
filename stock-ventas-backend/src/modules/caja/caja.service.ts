import { prisma } from "../../lib/prisma";
import { AppError } from "../../utils/AppError";
import { EstadoVenta, FormaPago } from "@prisma/client";
import { Decimal } from "@prisma/client/runtime/library";

async function obtenerCajaAbierta() {
  return prisma.caja.findFirst({
    where: { fechaCierre: null },
    orderBy: { fechaApertura: "desc" },
  });
}

export async function abrirCaja(usuarioId: number, montoInicial: number) {
  const cajaAbierta = await obtenerCajaAbierta();
  if (cajaAbierta) {
    throw new AppError(
      "CAJA_YA_ABIERTA",
      "Ya hay una caja abierta. Cerrala antes de abrir una nueva.",
      409
    );
  }

  return prisma.caja.create({
    data: { usuarioId, montoInicial },
  });
}

// Total vendido en efectivo desde que se abrió la caja hasta ahora (o hasta
// una fecha de corte dada). Solo cuenta ventas confirmadas — las anuladas no
// suman a la caja.
async function calcularVentasEfectivo(desde: Date, hasta: Date) {
  const resultado = await prisma.venta.aggregate({
    where: {
      fecha: { gte: desde, lte: hasta },
      formaPago: FormaPago.EFECTIVO,
      estado: EstadoVenta.CONFIRMADA,
    },
    _sum: { total: true },
  });
  return resultado._sum.total ?? new Decimal(0);
}

export async function cerrarCaja(usuarioId: number, montoFinalContado: number) {
  const caja = await obtenerCajaAbierta();
  if (!caja) {
    throw new AppError("NO_HAY_CAJA_ABIERTA", "No hay ninguna caja abierta para cerrar", 409);
  }

  const ahora = new Date();
  const ventasEfectivo = await calcularVentasEfectivo(caja.fechaApertura, ahora);
  const montoFinalEsperado = caja.montoInicial.add(ventasEfectivo);
  const diferencia = new Decimal(montoFinalContado).sub(montoFinalEsperado);

  return prisma.caja.update({
    where: { id: caja.id },
    data: {
      fechaCierre: ahora,
      montoFinalContado,
      montoFinalEsperado,
      diferencia,
    },
  });
}

export async function obtenerEstadoActual() {
  const caja = await obtenerCajaAbierta();
  if (!caja) {
    return { abierta: false as const };
  }

  const ahora = new Date();
  const ventasEfectivo = await calcularVentasEfectivo(caja.fechaApertura, ahora);
  const totalEsperadoHastaAhora = caja.montoInicial.add(ventasEfectivo);

  return {
    abierta: true as const,
    caja,
    ventasEfectivoAcumuladas: ventasEfectivo,
    totalEsperadoHastaAhora,
  };
}

export async function listarHistorialCajas(params: { desde?: Date; hasta?: Date }) {
  return prisma.caja.findMany({
    where: {
      fechaApertura: { gte: params.desde, lte: params.hasta },
      fechaCierre: { not: null },
    },
    orderBy: { fechaApertura: "desc" },
  });
}