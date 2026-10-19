import { prisma } from "../../lib/prisma";
import { AppError } from "../../utils/AppError";
import { EstadoVenta, FormaPago, Prisma } from "@prisma/client";
import { Decimal } from "@prisma/client/runtime/library";

// Cada usuario tiene a lo sumo UNA caja abierta (garantizado también por el
// índice único parcial "caja_abierta_unica_por_usuario" en la BD). Varias
// cajas pueden estar abiertas en paralelo, una por cajero.
async function obtenerCajaAbiertaDeUsuario(usuarioId: number) {
  return prisma.caja.findFirst({
    where: { usuarioId, fechaCierre: null },
    orderBy: { fechaApertura: "desc" },
  });
}

export async function abrirCaja(usuarioId: number, montoInicial: number) {
  // Chequeo previo: da el error amigable en el caso normal (sin carrera).
  const cajaAbierta = await obtenerCajaAbiertaDeUsuario(usuarioId);
  if (cajaAbierta) {
    throw new AppError(
      "CAJA_YA_ABIERTA",
      "Ya tenés una caja abierta. Cerrala antes de abrir otra.",
      409
    );
  }

  try {
    // La condición de carrera la resuelve la BD: si dos aperturas simultáneas
    // del mismo usuario pasan el chequeo de arriba, solo un INSERT sobrevive al
    // índice único y el otro revienta con P2002 (que traducimos al mismo 409).
    return await prisma.caja.create({
      data: { usuarioId, montoInicial },
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw new AppError(
        "CAJA_YA_ABIERTA",
        "Ya tenés una caja abierta. Cerrala antes de abrir otra.",
        409
      );
    }
    throw err;
  }
}

// Total vendido en efectivo DENTRO de esa caja (ventas imputadas por cajaId),
// desde que se abrió. Solo ventas confirmadas: las anuladas no suman.
// (Antes se calculaba por rango de fechas + forma de pago, lo que se rompía
// en cuanto había más de una caja abierta en el mismo período.)
async function calcularVentasEfectivoCaja(cajaId: number, hasta = new Date()) {
  const resultado = await prisma.venta.aggregate({
    where: {
      cajaId,
      fecha: { lte: hasta },
      formaPago: FormaPago.EFECTIVO,
      estado: EstadoVenta.CONFIRMADA,
    },
    _sum: { total: true },
  });
  return resultado._sum.total ?? new Decimal(0);
}

interface OpcionesCierre {
  /** Solo ADMIN puede cerrar una caja que no es suya, indicando cuál. */
  cajaId?: number;
  esAdmin?: boolean;
}

export async function cerrarCaja(
  usuarioId: number,
  montoFinalContado: number,
  opciones: OpcionesCierre = {}
) {
  let caja;

  if (opciones.cajaId !== undefined) {
    caja = await prisma.caja.findUnique({ where: { id: opciones.cajaId } });
    if (!caja || caja.fechaCierre !== null) {
      throw new AppError("NO_HAY_CAJA_ABIERTA", "La caja indicada no existe o ya está cerrada", 409);
    }
    if (caja.usuarioId !== usuarioId && !opciones.esAdmin) {
      throw new AppError("CAJA_NO_PROPIA", "Solo podés cerrar tu propia caja", 403);
    }
  } else {
    caja = await obtenerCajaAbiertaDeUsuario(usuarioId);
    if (!caja) {
      throw new AppError("NO_HAY_CAJA_ABIERTA", "No tenés ninguna caja abierta para cerrar", 409);
    }
  }

  const ahora = new Date();
  const ventasEfectivo = await calcularVentasEfectivoCaja(caja.id, ahora);
  const montoFinalEsperado = caja.montoInicial.add(ventasEfectivo);
  const diferencia = new Decimal(montoFinalContado).sub(montoFinalEsperado);

  // Cierre condicional (compare-and-swap sobre fechaCierre = null): si dos
  // requests cierran la misma caja en paralelo, solo el primero gana.
  const { count } = await prisma.caja.updateMany({
    where: { id: caja.id, fechaCierre: null },
    data: {
      fechaCierre: ahora,
      montoFinalContado,
      montoFinalEsperado,
      diferencia,
    },
  });

  if (count === 0) {
    throw new AppError("CAJA_YA_CERRADA", "La caja ya fue cerrada", 409);
  }

  return prisma.caja.findUniqueOrThrow({ where: { id: caja.id } });
}

export async function obtenerEstadoActual(usuarioId: number) {
  const caja = await obtenerCajaAbiertaDeUsuario(usuarioId);
  if (!caja) {
    return { abierta: false as const };
  }

  const ahora = new Date();
  const ventasEfectivo = await calcularVentasEfectivoCaja(caja.id, ahora);
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
    include: { usuario: { select: { id: true, nombre: true } } },
  });
}
