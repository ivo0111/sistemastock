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
  precioUnitario: number;
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
    let total = new Decimal(0);
    const itemsData: {
      productoId: number;
      cantidad: number;
      precioUnitario: number;
      subtotal: Decimal;
    }[] = [];

    for (const item of input.items) {
      // SELECT ... FOR UPDATE (vía $queryRaw) bloquea la fila del producto hasta
      // que termine la transacción, evitando que dos ventas concurrentes
      // descuenten stock sobre el mismo valor "viejo" y vendan de más.
      const producto = await tx.$queryRaw<{ id: number; stock_actual: number; nombre: string }[]>`
        SELECT id, stock_actual, nombre FROM productos WHERE id = ${item.productoId} FOR UPDATE
      `;

      if (producto.length === 0) {
        throw new AppError(
          "PRODUCTO_NO_ENCONTRADO",
          `El producto ${item.productoId} no existe`,
          404
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

      const subtotal = new Decimal(item.precioUnitario).mul(item.cantidad);
      total = total.add(subtotal);

      itemsData.push({
        productoId: item.productoId,
        cantidad: item.cantidad,
        precioUnitario: item.precioUnitario,
        subtotal,
      });

      // Descuenta stock y registra el movimiento
      await tx.producto.update({
        where: { id: item.productoId },
        data: { stockActual: { decrement: item.cantidad } },
      });
    }

    const descuento = new Decimal(input.descuento ?? 0);
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

export async function generarComprobante(id: number): Promise<string> {
  let venta = await prisma.venta.findUnique({ where: { id }, include: includeComprobante });
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

    venta = await prisma.venta.update({
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

  return generarHtmlComprobante(venta);
}

export async function anularVenta(id: number, motivo: string, usuarioId: number) {
  return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const venta = await tx.venta.findUnique({ where: { id }, include: { items: true } });
    if (!venta) throw new AppError("VENTA_NO_ENCONTRADA", "La venta no existe", 404);
    if (venta.estado === EstadoVenta.ANULADA) {
      throw new AppError("VENTA_YA_ANULADA", "Esta venta ya fue anulada", 409);
    }

    // Revierte stock por cada ítem
    for (const item of venta.items) {
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
          referenciaId: venta.id,
          motivo,
        },
      });
    }

    return tx.venta.update({
      where: { id },
      data: { estado: EstadoVenta.ANULADA, motivoAnulacion: motivo },
    });
  });
}
