import { prisma } from "../../lib/prisma";
import { AppError } from "../../utils/AppError";
import { EstadoVenta, FormaPago, TipoComprobante, TipoMovimientoStock, Prisma } from "@prisma/client";
import { Decimal } from "@prisma/client/runtime/library";
import { arcaConfig } from "../../config/arca.config";
import * as arcaService from "../arca/arca.service";
import { TipoComprobanteArca } from "../arca/arca.types";
import { generarHtmlComprobante } from "./comprobante.template";


interface ItemInput {
  productoId: number;
  cantidad: number;
  bonificacion?: number;
}

interface CrearVentaInput {
  clienteId?: number;
  items: ItemInput[];
  formaPago: FormaPago;
  descuento?: number;
  usuarioId: number;
}

export async function crearVenta(input: CrearVentaInput) {
  if (input.items.length === 0) {
    throw new AppError("VENTA_VACIA", "La venta necesita al menos un ítem", 400);
  }

  // Toda la operación es una única transacción: si falla el stock de cualquier
  // ítem, se revierte todo (no queda una venta a medio confirmar).
  return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    // Validar que el cliente exista antes de tocar stock: si no, la FK de
    // `ventas.cliente_id` revienta recién en el create y termina en 500.
    if (input.clienteId !== undefined) {
      const cliente = await tx.cliente.findUnique({
        where: { id: input.clienteId },
        select: { id: true },
      });
      if (!cliente) {
        throw new AppError("CLIENTE_NO_ENCONTRADO", `El cliente ${input.clienteId} no existe`, 404);
      }
    }

    let total = new Decimal(0);
    const itemsData: {
      productoId: number;
      cantidad: number;
      precioUnitario: Decimal;
      bonificacionPorcentaje: Decimal;
      subtotal: Decimal;
    }[] = [];

    for (const item of input.items) {
      if (item.cantidad <= 0) {
        throw new AppError("CANTIDAD_INVALIDA", "La cantidad debe ser mayor a cero", 400);
      }
      if (item.bonificacion !== undefined && (item.bonificacion < 0 || item.bonificacion > 100)) {
        throw new AppError("BONIFICACION_INVALIDA", "La bonificación debe estar entre 0 y 100", 400);
      }

      // SELECT ... FOR UPDATE (vía $queryRaw) bloquea la fila del producto hasta
      // que termine la transacción, evitando que dos ventas concurrentes
      // descuenten stock sobre el mismo valor "viejo" y vendan de más.
      // El precio de venta se lee de la BD en el mismo query: el cliente nunca
      // manda el precio (un vendedor no podría vender a $0 ni a precio arbitrario).
      const producto = await tx.$queryRaw<
        { id: number; stock_actual: number; nombre: string; precio_venta: string; activo: boolean }[]
      >`
        SELECT id, stock_actual, nombre, precio_venta, activo FROM productos WHERE id = ${item.productoId} FOR UPDATE
      `;

      if (producto.length === 0) {
        throw new AppError(
          "PRODUCTO_NO_ENCONTRADO",
          `El producto ${item.productoId} no existe`,
          404
        );
      }

      if (!producto[0].activo) {
        throw new AppError(
          "PRODUCTO_INACTIVO",
          `El producto "${producto[0].nombre}" está inactivo y no puede venderse`,
          409
        );
      }

      const stockDisponible = producto[0].stock_actual;
      if (stockDisponible < item.cantidad) {
        throw new AppError(
          "STOCK_INSUFICIENTE",
          `Stock insuficiente para "${producto[0].nombre}" (disponible: ${stockDisponible}, pedido: ${item.cantidad})`,
          409
        );
      }

      const precioUnitario = new Decimal(producto[0].precio_venta);
      const bonificacion = new Decimal(item.bonificacion ?? 0);
      const subtotal = precioUnitario
        .mul(item.cantidad)
        .mul(new Decimal(1).sub(bonificacion.div(100)));
      total = total.add(subtotal);

      itemsData.push({
        productoId: item.productoId,
        cantidad: item.cantidad,
        precioUnitario,
        bonificacionPorcentaje: bonificacion,
        subtotal,
      });

      // Descuenta stock y registra el movimiento
      await tx.producto.update({
        where: { id: item.productoId },
        data: { stockActual: { decrement: item.cantidad } },
      });
    }

    // El descuento se valida contra el subtotal calculado con precios de BD:
    // si lo supera, el total quedaría negativo (el front lo corrige, el backend no).
    const descuento = new Decimal(input.descuento ?? 0);
    if (descuento.isNegative()) {
      throw new AppError("DESCUENTO_INVALIDO", "El descuento no puede ser negativo", 400);
    }
    if (descuento.gt(total)) {
      throw new AppError(
        "DESCUENTO_INVALIDO",
        `El descuento (${descuento}) no puede superar el subtotal de la venta (${total})`,
        400
      );
    }
    total = total.sub(descuento);

    const venta = await tx.venta.create({
      data: {
        clienteId: input.clienteId,
        usuarioId: input.usuarioId,
        total,
        descuento,
        formaPago: input.formaPago,
        estado: EstadoVenta.CONFIRMADA,
        items: { create: itemsData },
      },
      include: { items: true },
    });

    // Un movimiento de stock por cada ítem, referenciando la venta
    for (const item of itemsData) {
      await tx.movimientoStock.create({
        data: {
          productoId: item.productoId,
          tipo: TipoMovimientoStock.VENTA,
          cantidad: -item.cantidad,
          usuarioId: input.usuarioId,
          referenciaTipo: "venta",
          referenciaId: venta.id,
        },
      });
    }

    return venta;
  });
}

export async function listarVentas(params: {
  desde?: Date;
  hasta?: Date;
  usuarioId?: number;
  estado?: EstadoVenta;
  page?: number;
  limit?: number;
}) {
  const { page = 1, limit = 20 } = params;

  const where = {
    fecha: { gte: params.desde, lte: params.hasta },
    usuarioId: params.usuarioId,
    estado: params.estado,
  };

  const [data, total] = await Promise.all([
    prisma.venta.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      include: { items: true, cliente: true, usuario: true },
      orderBy: { fecha: "desc" },
    }),
    prisma.venta.count({ where }),
  ]);

  return { data, total, page, limit };
}

export async function obtenerVenta(id: number) {
  const venta = await prisma.venta.findUnique({
    where: { id },
    include: { items: { include: { producto: true } }, cliente: true, usuario: true },
  });
  if (!venta) throw new AppError("VENTA_NO_ENCONTRADA", "La venta no existe", 404);
  return venta;
}

// Agregar después de obtenerVenta():
const includeComprobante = {
  items: { include: { producto: true } },
  cliente: true,
  usuario: true,
} satisfies Prisma.VentaInclude;

export async function generarComprobante(id: number, copias = 1): Promise<string> {
  // Transacción con lock de fila (FOR UPDATE): dos requests simultáneas no
  // pueden pedir dos CAE para la misma venta. El segundo request queda esperando
  // el lock; cuando le toca, el CAE ya está persistido y lo reutiliza.
  // El pedido a ARCA ocurre dentro de la transacción a propósito: es lo que
  // serializa la llamada externa. El timeout es más holgado por eso.
  const venta = await prisma.$transaction(
    async (tx: Prisma.TransactionClient) => {
      const filas = await tx.$queryRaw<{ id: number }[]>`
        SELECT id FROM ventas WHERE id = ${id} FOR UPDATE
      `;
      if (filas.length === 0) {
        throw new AppError("VENTA_NO_ENCONTRADA", "La venta no existe", 404);
      }

      let venta = await tx.venta.findUnique({ where: { id }, include: includeComprobante });
      if (!venta) throw new AppError("VENTA_NO_ENCONTRADA", "La venta no existe", 404);

      if (venta.estado === EstadoVenta.ANULADA) {
        throw new AppError(
          "VENTA_ANULADA",
          "No se puede generar el comprobante de una venta anulada",
          409
        );
      }

      // Si todavía no se pidió el CAE para esta venta, se pide una única vez y se
      // persiste: no tiene sentido (ni ARCA lo permite) pedir dos CAE distintos
      // para el mismo comprobante.
      if (!venta.cae) {
        const tipoComprobante = arcaService.determinarTipoComprobante(
          venta.cliente?.condicionIva ?? null
        ) as TipoComprobanteArca;

        const resultado = await arcaService.solicitarCAE({
          puntoVenta: arcaConfig.puntoVenta,
          tipoComprobante,
          importeTotal: Number(venta.total),
          fecha: venta.fecha,
          cuitReceptor: venta.cliente?.cuit ?? undefined,
        });

        venta = await tx.venta.update({
          where: { id },
          data: {
            tipoComprobante: tipoComprobante as TipoComprobante,
            puntoVenta: resultado.puntoVenta,
            numeroComprobante: resultado.numeroComprobante,
            cae: resultado.cae,
            caeVencimiento: resultado.caeVencimiento,
          },
          include: includeComprobante,
        });
      }

      return venta;
    },
    { maxWait: 5000, timeout: 30000 }
  );

  return generarHtmlComprobante(venta, undefined, copias);
}

export async function anularVenta(id: number, motivo: string, usuarioId: number) {
  return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    // Cambio de estado condicional (compare-and-swap): solo pasa a ANULADA si
    // todavía estaba CONFIRMADA. Si dos requests llegan en paralelo (doble click),
    // el segundo updateMany no matchea ninguna fila y no se devuelve el stock dos veces.
    const { count } = await tx.venta.updateMany({
      where: { id, estado: EstadoVenta.CONFIRMADA },
      data: { estado: EstadoVenta.ANULADA, motivoAnulacion: motivo },
    });

    if (count === 0) {
      const venta = await tx.venta.findUnique({ where: { id }, select: { estado: true } });
      if (!venta) throw new AppError("VENTA_NO_ENCONTRADA", "La venta no existe", 404);
      throw new AppError("VENTA_YA_ANULADA", "Esta venta ya fue anulada", 409);
    }

    const items = await tx.ventaItem.findMany({ where: { ventaId: id } });

    // Revierte stock por cada ítem
    for (const item of items) {
      await tx.producto.update({
        where: { id: item.productoId },
        data: { stockActual: { increment: item.cantidad } },
      });

      await tx.movimientoStock.create({
        data: {
          productoId: item.productoId,
          tipo: TipoMovimientoStock.DEVOLUCION,
          cantidad: item.cantidad,
          usuarioId,
          referenciaTipo: "venta",
          referenciaId: id,
          motivo,
        },
      });
    }

    return tx.venta.findUniqueOrThrow({ where: { id } });
  });
}
