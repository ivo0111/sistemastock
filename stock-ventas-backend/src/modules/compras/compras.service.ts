import { prisma } from "../../lib/prisma";
import { AppError } from "../../utils/AppError";
import { EstadoCompra, TipoMovimientoStock, OrigenCompra, Prisma } from "@prisma/client";
import { Decimal } from "@prisma/client/runtime/library";

export interface ItemCompraInput {
  productoId: number;
  cantidad: number;
  precioUnitario: number;
  /** Datos de la factura; en compras manuales van vacíos. */
  descripcion?: string | null;
  codigoProveedor?: string | null;
  alicuotaIva?: number | null;
}

export interface DatosFiscalesCompra {
  tipoComprobante?: string | null;
  puntoVenta?: number | null;
  numeroComprobante?: string | null;
  fechaComprobante?: Date | null;
  proveedorCuit?: string | null;
  subtotal?: number | null;
  iva?: number | null;
  percepciones?: number | null;
  cae?: string | null;
}

export interface RegistrarCompraInput {
  proveedorId: number;
  usuarioId: number;
  items: ItemCompraInput[];
  /** Si true, actualiza precioCosto del producto con el de esta compra. */
  actualizarPrecioCosto?: boolean;
  origen?: OrigenCompra;
  fiscal?: DatosFiscalesCompra;
  /** Total a pagar según la factura. Si falta, se usa la suma de los ítems. */
  total?: number | null;
}

interface CrearCompraInput {
  proveedorId: number;
  items: ItemCompraInput[];
  usuarioId: number;
  actualizarPrecioCosto?: boolean;
}

/**
 * Registra una compra (y su impacto de stock) dentro de una transacción ya
 * abierta. Lo usan tanto la carga manual como la confirmación de facturas
 * importadas, para que no existan dos caminos con reglas distintas.
 */
export async function registrarCompraEnTx(tx: Prisma.TransactionClient, input: RegistrarCompraInput) {
  if (input.items.length === 0) {
    throw new AppError("COMPRA_VACIA", "La compra necesita al menos un ítem", 400);
  }

  const proveedor = await tx.proveedor.findUnique({ where: { id: input.proveedorId } });
  if (!proveedor) {
    throw new AppError("PROVEEDOR_NO_ENCONTRADO", "El proveedor no existe", 404);
  }

  let sumaItems = new Decimal(0);
  const itemsData: Array<ItemCompraInput> = [];

  for (const item of input.items) {
    const producto = await tx.producto.findUnique({ where: { id: item.productoId } });
    if (!producto) {
      throw new AppError(
        "PRODUCTO_NO_ENCONTRADO",
        `El producto ${item.productoId} no existe`,
        404
      );
    }

    // Igual que en ventas: no se puede comprar un producto dado de baja.
    // Si hay que reactivarlo, se hace aparte (editar el producto).
    if (!producto.activo) {
      throw new AppError(
        "PRODUCTO_INACTIVO",
        `El producto "${producto.nombre}" está inactivo y no puede comprarse`,
        409
      );
    }

    sumaItems = sumaItems.add(new Decimal(item.precioUnitario).mul(item.cantidad));
    itemsData.push(item);

    await tx.producto.update({
      where: { id: item.productoId },
      data: {
        stockActual: { increment: item.cantidad },
        ...(input.actualizarPrecioCosto ? { precioCosto: item.precioUnitario } : {}),
      },
    });
  }

  const total = input.total === undefined || input.total === null
    ? sumaItems
    : new Decimal(input.total);

  const fiscal = input.fiscal ?? {};
  const compra = await tx.compra.create({
    data: {
      proveedorId: input.proveedorId,
      usuarioId: input.usuarioId,
      total,
      estado: EstadoCompra.RECIBIDA,
      origen: input.origen ?? OrigenCompra.MANUAL,
      tipoComprobante: fiscal.tipoComprobante ?? null,
      puntoVenta: fiscal.puntoVenta ?? null,
      numeroComprobante: fiscal.numeroComprobante ?? null,
      fechaComprobante: fiscal.fechaComprobante ?? null,
      proveedorCuit: fiscal.proveedorCuit ?? null,
      subtotal: fiscal.subtotal ?? null,
      iva: fiscal.iva ?? null,
      percepciones: fiscal.percepciones ?? null,
      cae: fiscal.cae ?? null,
      items: {
        create: itemsData.map((item) => ({
          productoId: item.productoId,
          cantidad: item.cantidad,
          precioUnitario: item.precioUnitario,
          descripcion: item.descripcion ?? null,
          codigoProveedor: item.codigoProveedor ?? null,
          alicuotaIva: item.alicuotaIva ?? null,
        })),
      },
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
}

export async function crearCompra(input: CrearCompraInput) {
  return prisma.$transaction((tx) =>
    registrarCompraEnTx(tx, {
      proveedorId: input.proveedorId,
      usuarioId: input.usuarioId,
      items: input.items,
      actualizarPrecioCosto: input.actualizarPrecioCosto,
      origen: OrigenCompra.MANUAL,
    })
  );
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
      include: {
        items: true,
        proveedor: true,
        usuario: { select: { id: true, nombre: true } },
      },
      orderBy: { fecha: "desc" },
    }),
    prisma.compra.count({ where }),
  ]);

  return { data, total, page, limit };
}

export async function obtenerCompra(id: number) {
  const compra = await prisma.compra.findUnique({
    where: { id },
    include: {
      items: { include: { producto: true } },
      proveedor: true,
      usuario: { select: { id: true, nombre: true } },
      importacion: {
        select: { id: true, nombreArchivo: true, creadoEn: true, motor: true },
      },
    },
  });
  if (!compra) throw new AppError("COMPRA_NO_ENCONTRADA", "La compra no existe", 404);
  return compra;
}
