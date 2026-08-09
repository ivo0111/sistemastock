import { prisma } from "../../lib/prisma";
import { AppError } from "../../utils/AppError";
import { TipoMovimientoStock, Prisma, Producto } from "@prisma/client";

interface ListarParams {
  busqueda?: string;
  categoriaId?: number;
  stockBajo?: boolean;
  page?: number;
  limit?: number;
}

export async function listarProductos(params: ListarParams) {
  const { busqueda, categoriaId, stockBajo, page = 1, limit = 20 } = params;

  const where: any = { activo: true };
  if (busqueda) {
    where.OR = [
      { nombre: { contains: busqueda, mode: "insensitive" } },
      { sku: { contains: busqueda, mode: "insensitive" } },
      { codigoBarras: { contains: busqueda, mode: "insensitive" } },
    ];
  }
  if (categoriaId) where.categoriaId = categoriaId;

  const [data, total] = await Promise.all([
    prisma.producto.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      include: { categoria: true },
      orderBy: { nombre: "asc" },
    }),
    prisma.producto.count({ where }),
  ]);

  // stockBajo se filtra en memoria porque compara dos columnas entre sí
  // (Prisma no soporta comparar column vs column directamente en `where`)
  const filtered = stockBajo ? data.filter((p: Producto) => p.stockActual <= p.stockMinimo) : data;

  return { data: filtered, total, page, limit };
}

export async function buscarProductosRapido(query: string) {
  return prisma.producto.findMany({
    where: {
      activo: true,
      OR: [
        { nombre: { contains: query, mode: "insensitive" } },
        { sku: { contains: query, mode: "insensitive" } },
        { codigoBarras: { contains: query, mode: "insensitive" } },
      ],
    },
    select: { id: true, sku: true, codigoBarras: true, nombre: true, precioVenta: true, stockActual: true },
    take: 10,
  });
}

export async function obtenerProductosParaEtiquetas(ids: number[]) {
  return prisma.producto.findMany({
    where: { id: { in: ids } },
    select: { id: true, sku: true, codigoBarras: true, nombre: true, precioVenta: true },
    orderBy: { nombre: "asc" },
  });
}

export async function obtenerProducto(id: number) {
  const producto = await prisma.producto.findUnique({ where: { id } });
  if (!producto) throw new AppError("PRODUCTO_NO_ENCONTRADO", "El producto no existe", 404);
  return producto;
}

interface CrearProductoInput {
  sku: string;
  codigoBarras?: string;
  nombre: string;
  categoriaId?: number;
  precioCosto: number;
  precioVenta: number;
  stockInicial: number;
  stockMinimo: number;
  alicuotaIva?: number;
  unidadMedida?: string;
  usuarioId: number;
}

export async function crearProducto(input: CrearProductoInput) {
  const existe = await prisma.producto.findUnique({ where: { sku: input.sku } });
  if (existe) throw new AppError("SKU_DUPLICADO", "Ya existe un producto con ese SKU", 409);

  if (input.codigoBarras) {
    const existeCB = await prisma.producto.findUnique({ where: { codigoBarras: input.codigoBarras } });
    if (existeCB) throw new AppError("CODIGO_BARRAS_DUPLICADO", "Ya existe un producto con ese código de barras", 409);
  }

  // Creación de producto + movimiento de stock inicial en una sola transacción
  return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const producto = await tx.producto.create({
       data: {
         sku: input.sku,
         codigoBarras: input.codigoBarras || null,
         nombre: input.nombre,
         categoriaId: input.categoriaId,
         precioCosto: input.precioCosto,
         precioVenta: input.precioVenta,
         stockActual: input.stockInicial,
         stockMinimo: input.stockMinimo,
         alicuotaIva: input.alicuotaIva,
         unidadMedida: input.unidadMedida,
       },
    });

    if (input.stockInicial > 0) {
      await tx.movimientoStock.create({
        data: {
          productoId: producto.id,
          tipo: TipoMovimientoStock.AJUSTE_INICIAL,
          cantidad: input.stockInicial,
          usuarioId: input.usuarioId,
        },
      });
    }

    return producto;
  });
}

interface ActualizarProductoInput {
  nombre?: string;
  codigoBarras?: string;
  categoriaId?: number;
  precioCosto?: number;
  precioVenta?: number;
  stockMinimo?: number;
  alicuotaIva?: number;
  unidadMedida?: string;
}

export async function actualizarProducto(id: number, input: ActualizarProductoInput) {
  await obtenerProducto(id); // valida que exista

  if (input.codigoBarras) {
    const existeCB = await prisma.producto.findFirst({
      where: { codigoBarras: input.codigoBarras, id: { not: id } },
    });
    if (existeCB) throw new AppError("CODIGO_BARRAS_DUPLICADO", "Ya existe otro producto con ese código de barras", 409);
  }

  return prisma.producto.update({ where: { id }, data: { ...input, codigoBarras: input.codigoBarras ?? undefined } });
}

export async function eliminarProducto(id: number) {
  await obtenerProducto(id);
  // Baja lógica: nunca se borra físicamente un producto con movimientos asociados
  return prisma.producto.update({ where: { id }, data: { activo: false } });
}

export async function ajustarStock(
  productoId: number,
  cantidad: number,
  motivo: string,
  usuarioId: number
) {
  const producto = await obtenerProducto(productoId);

  const nuevoStock = producto.stockActual + cantidad;
  if (nuevoStock < 0) {
    throw new AppError("STOCK_INSUFICIENTE", "El ajuste dejaría el stock en negativo", 409);
  }

  return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    await tx.movimientoStock.create({
      data: {
        productoId,
        tipo: TipoMovimientoStock.AJUSTE,
        cantidad,
        usuarioId,
        motivo,
      },
    });

    return tx.producto.update({
      where: { id: productoId },
      data: { stockActual: nuevoStock },
    });
  });
}

