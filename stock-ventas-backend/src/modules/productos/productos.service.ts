import { prisma } from "../../lib/prisma";
import { AppError } from "../../utils/AppError";
import { TipoMovimientoStock, Prisma } from "@prisma/client";

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

  // stockActual <= stockMinimo compara dos columnas entre sí, algo que Prisma
  // no soporta en `where`: se resuelve con SQL crudo. Los ids se usan como
  // filtro ANTES de paginar, así total y páginas quedan consistentes.
  if (stockBajo) {
    const bajos = await prisma.$queryRaw<{ id: number }[]>`
      SELECT id FROM productos
      WHERE activo = true AND stock_actual <= stock_minimo
    `;
    where.id = { in: bajos.map((p) => p.id) };
  }

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

  return { data, total, page, limit };
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
  codigoBarras?: string | null;
  categoriaId?: number;
  precioCosto?: number;
  precioVenta?: number;
  stockMinimo?: number;
  alicuotaIva?: number;
  unidadMedida?: string;
}

export async function actualizarProducto(id: number, input: ActualizarProductoInput) {
  await obtenerProducto(id); // valida que exista

  // "" o solo espacios => borrar el código de barras (null). undefined => no se toca.
  const codigoBarras =
    input.codigoBarras === null
      ? null
      : typeof input.codigoBarras === "string"
        ? input.codigoBarras.trim() || null
        : undefined;

  if (codigoBarras) {
    const existeCB = await prisma.producto.findFirst({
      where: { codigoBarras, id: { not: id } },
    });
    if (existeCB) throw new AppError("CODIGO_BARRAS_DUPLICADO", "Ya existe otro producto con ese código de barras", 409);
  }

  return prisma.producto.update({ where: { id }, data: { ...input, codigoBarras } });
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
  return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    // SELECT ... FOR UPDATE bloquea la fila del producto hasta que termine la
    // transacción: nadie puede vender ni ajustar el mismo producto en el medio,
    // así la validación de stock se hace sobre el valor final que se actualiza.
    const filas = await tx.$queryRaw<{ id: number; stock_actual: number; nombre: string }[]>`
      SELECT id, stock_actual, nombre FROM productos WHERE id = ${productoId} FOR UPDATE
    `;

    if (filas.length === 0) {
      throw new AppError("PRODUCTO_NO_ENCONTRADO", "El producto no existe", 404);
    }

    const stockActual = Number(filas[0].stock_actual);
    const nuevoStock = stockActual + cantidad;
    if (nuevoStock < 0) {
      throw new AppError(
        "STOCK_INSUFICIENTE",
        `El ajuste dejaría el stock en negativo (disponible: ${stockActual}, ajuste: ${cantidad})`,
        409
      );
    }

    await tx.movimientoStock.create({
      data: {
        productoId,
        tipo: TipoMovimientoStock.AJUSTE,
        cantidad,
        usuarioId,
        motivo,
      },
    });

    // Incremento atómico en lugar de escribir un valor absoluto: aunque otra
    // transacción hubiera modificado el stock, nunca se pisa, se suma/resta.
    return tx.producto.update({
      where: { id: productoId },
      data: { stockActual: { increment: cantidad } },
    });
  });
}

// ─────────────────────────────────────────────
// Importación masiva de productos
// ─────────────────────────────────────────────

export interface FilaImportacion {
  sku: string;
  nombre: string;
  categoriaNombre?: string;
  precioCosto: number;
  precioVenta: number;
  stockActual?: number;
  stockMinimo?: number;
  codigoBarras?: string;
  alicuotaIva?: number;
  unidadMedida?: string;
  accionSiExiste?: "actualizar" | "omitir";
}

export interface ResultadoImportacion {
  creados: number;
  actualizados: number;
  omitidos: number;
  errores: Array<{ sku: string; motivo: string }>;
}

export async function verificarExistencia(skus: string[], codigosBarras: string[]) {
  const skusExistentes = await prisma.producto.findMany({
    where: { sku: { in: skus } },
    select: { sku: true },
  });
  const codigosExistentes = await prisma.producto.findMany({
    where: { codigoBarras: { in: codigosBarras.filter(Boolean) } },
    select: { codigoBarras: true },
  });
  return {
    skusExistentes: skusExistentes.map((p) => p.sku),
    codigosExistentes: codigosExistentes.map((p) => p.codigoBarras!),
  };
}

const LOTE_IMPORTACION = 50;
const TIMEOUT_LOTE_MS = 15000;
const TIMEOUT_FILA_MS = 10000;

type AccionFila = "creado" | "actualizado" | "omitido";

async function procesarFila(
  tx: Prisma.TransactionClient,
  fila: FilaImportacion,
  mapaCategorias: Map<string, number>,
  usuarioId: number
): Promise<AccionFila> {
  const productoExistente = await tx.producto.findUnique({ where: { sku: fila.sku } });

  if (!productoExistente) {
    // SKU no existe → crear
    const nuevoProducto = await tx.producto.create({
      data: {
        sku: fila.sku,
        nombre: fila.nombre,
        categoriaId: fila.categoriaNombre ? mapaCategorias.get(fila.categoriaNombre) ?? null : null,
        precioCosto: fila.precioCosto,
        precioVenta: fila.precioVenta,
        stockActual: fila.stockActual ?? 0,
        stockMinimo: fila.stockMinimo ?? 0,
        codigoBarras: fila.codigoBarras || null,
        alicuotaIva: fila.alicuotaIva ?? 21,
        unidadMedida: fila.unidadMedida ?? "unidades",
      },
    });

    // Registrar movimiento de stock inicial si aplica
    if ((fila.stockActual ?? 0) > 0) {
      await tx.movimientoStock.create({
        data: {
          productoId: nuevoProducto.id,
          tipo: TipoMovimientoStock.AJUSTE_INICIAL,
          cantidad: fila.stockActual!,
          usuarioId,
        },
      });
    }

    return "creado";
  }

  if (fila.accionSiExiste !== "actualizar") {
    // SKU existe + "omitir" (o no definido) → contar como omitido
    return "omitido";
  }

  // SKU existe + "actualizar" → actualizar solo campos con valor definido
  const dataActualizar: Record<string, any> = {};

  if (fila.nombre !== undefined) dataActualizar.nombre = fila.nombre;
  if (fila.categoriaNombre !== undefined) {
    const catId = fila.categoriaNombre ? mapaCategorias.get(fila.categoriaNombre) ?? null : null;
    dataActualizar.categoria = catId ? { connect: { id: catId } } : { disconnect: true };
  }
  if (fila.precioCosto !== undefined) dataActualizar.precioCosto = fila.precioCosto;
  if (fila.precioVenta !== undefined) dataActualizar.precioVenta = fila.precioVenta;
  if (fila.stockMinimo !== undefined) dataActualizar.stockMinimo = fila.stockMinimo;
  if (fila.codigoBarras !== undefined) dataActualizar.codigoBarras = fila.codigoBarras || null;
  if (fila.alicuotaIva !== undefined) dataActualizar.alicuotaIva = fila.alicuotaIva;
  if (fila.unidadMedida !== undefined) dataActualizar.unidadMedida = fila.unidadMedida;

  if (fila.stockActual !== undefined) {
    // El CSV trae el stock "objetivo": se bloquea la fila, se calcula la
    // diferencia contra el stock vigente y se aplica con increment para
    // no pisar ventas/ajustes concurrentes ni desfasar la auditoría.
    const stockRows = await tx.$queryRaw<{ stock_actual: number }[]>`
      SELECT stock_actual FROM productos WHERE id = ${productoExistente.id} FOR UPDATE
    `;
    const stockActual = Number(stockRows[0].stock_actual);
    const diff = fila.stockActual - stockActual;

    if (diff !== 0) {
      dataActualizar.stockActual = { increment: diff };
      await tx.movimientoStock.create({
        data: {
          productoId: productoExistente.id,
          tipo: TipoMovimientoStock.AJUSTE,
          cantidad: diff,
          usuarioId,
          motivo: "Importación masiva - ajuste de stock",
        },
      });
    }
  }

  await tx.producto.update({
    where: { id: productoExistente.id },
    data: dataActualizar,
  });

  return "actualizado";
}

function contarResultado(resultado: ResultadoImportacion, accion: AccionFila) {
  if (accion === "creado") resultado.creados++;
  else if (accion === "actualizado") resultado.actualizados++;
  else resultado.omitidos++;
}

export async function importarProductos(
  filas: FilaImportacion[],
  usuarioId: number
): Promise<ResultadoImportacion> {
  const resultado: ResultadoImportacion = { creados: 0, actualizados: 0, omitidos: 0, errores: [] };

  // 1. Validación previa: SKUs y códigos de barras duplicados dentro del archivo
  const skusVistos = new Set<string>();
  const codigosVistos = new Set<string>();
  const filasValidas: FilaImportacion[] = [];

  for (const fila of filas) {
    if (skusVistos.has(fila.sku)) {
      resultado.errores.push({ sku: fila.sku, motivo: "SKU duplicado dentro del archivo" });
      continue;
    }
    skusVistos.add(fila.sku);

    const codigo = fila.codigoBarras?.trim();
    if (codigo) {
      if (codigosVistos.has(codigo)) {
        resultado.errores.push({
          sku: fila.sku,
          motivo: `Código de barras "${codigo}" duplicado dentro del archivo`,
        });
        continue;
      }
      codigosVistos.add(codigo);
    }

    filasValidas.push(fila);
  }

  // 2. Validación previa: códigos de barras ya asignados a otro producto en BD
  let filasProcesables = filasValidas;
  if (codigosVistos.size > 0) {
    const existentes = await prisma.producto.findMany({
      where: { codigoBarras: { in: [...codigosVistos] } },
      select: { sku: true, codigoBarras: true },
    });
    const skuPorCodigo = new Map(existentes.map((p) => [p.codigoBarras!, p.sku]));

    filasProcesables = [];
    for (const fila of filasValidas) {
      const codigo = fila.codigoBarras?.trim();
      const skuPropietario = codigo ? skuPorCodigo.get(codigo) : undefined;
      if (skuPropietario && skuPropietario !== fila.sku) {
        resultado.errores.push({
          sku: fila.sku,
          motivo: `Código de barras "${codigo}" ya pertenece al producto ${skuPropietario}`,
        });
        continue;
      }
      filasProcesables.push(fila);
    }
  }

  // 3. Upsert de categorías (una sola pasada, fuera de los lotes)
  const mapaCategorias = new Map<string, number>();
  const categoriasUnicas = [...new Set(filasProcesables.map((f) => f.categoriaNombre).filter(Boolean))] as string[];
  for (const nombre of categoriasUnicas) {
    const categoria = await prisma.categoria.upsert({
      where: { nombre },
      update: {},
      create: { nombre },
    });
    mapaCategorias.set(nombre, categoria.id);
  }

  // 4. Procesar en lotes con timeout explícito; si un lote falla, se reintenta
  //    fila por fila para aislar la fila problemática (en Postgres, un error
  //    aborta la transacción entera, por eso el fallback).
  for (let i = 0; i < filasProcesables.length; i += LOTE_IMPORTACION) {
    const lote = filasProcesables.slice(i, i + LOTE_IMPORTACION);

    try {
      const acciones: AccionFila[] = [];
      await prisma.$transaction(
        async (tx: Prisma.TransactionClient) => {
          for (const fila of lote) {
            acciones.push(await procesarFila(tx, fila, mapaCategorias, usuarioId));
          }
        },
        { maxWait: 5000, timeout: TIMEOUT_LOTE_MS }
      );
      // Contar solo lo que realmente se consolidó (commit OK)
      acciones.forEach((accion) => contarResultado(resultado, accion));
    } catch {
      // Reintentar fila por fila para aislar la fila que rompió el lote
      for (const fila of lote) {
        try {
          const accion = await prisma.$transaction(
            (tx: Prisma.TransactionClient) => procesarFila(tx, fila, mapaCategorias, usuarioId),
            { maxWait: 2000, timeout: TIMEOUT_FILA_MS }
          );
          contarResultado(resultado, accion);
        } catch (err: any) {
          resultado.errores.push({
            sku: fila.sku,
            motivo: err?.message ?? "Error desconocido al procesar la fila",
          });
        }
      }
    }
  }

  return resultado;
}

