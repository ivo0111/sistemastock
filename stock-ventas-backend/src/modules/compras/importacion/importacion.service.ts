import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "../../../lib/prisma";
import { AppError } from "../../../utils/AppError";
import { extraerLineasPdf } from "./pdf";
import { normalizarCuit, parsearFactura } from "./parser";
import { buscarProveedorPorNombre, sugerirProductos } from "./matching";
import { combinarExtracciones, extraerConIa, iaConfigurada } from "./ia";
import { registrarCompraEnTx } from "../compras.service";
import type { AdvertenciaFactura, EncabezadoFactura, ItemImportado } from "./types";

const MAX_BYTES = 15 * 1024 * 1024;

const SELECTOR_IMPORTACION = {
  id: true,
  usuarioId: true,
  nombreArchivo: true,
  archivoMime: true,
  archivoHash: true,
  estado: true,
  motor: true,
  proveedorId: true,
  proveedorCuit: true,
  proveedorNombre: true,
  tipoComprobante: true,
  puntoVenta: true,
  numeroComprobante: true,
  fechaComprobante: true,
  subtotal: true,
  iva: true,
  percepciones: true,
  total: true,
  cae: true,
  itemsJson: true,
  advertencias: true,
  confianza: true,
  error: true,
  compraId: true,
  creadoEn: true,
  actualizadoEn: true,
  proveedor: { select: { id: true, nombre: true, cuit: true } },
} satisfies Prisma.ImportacionFacturaSelect;

type ImportacionSeleccionada = Prisma.ImportacionFacturaGetPayload<{
  select: typeof SELECTOR_IMPORTACION;
}>;

export interface ProductoNuevoInput {
  sku?: string;
  codigoBarras?: string;
  nombre: string;
  categoriaId?: number;
  precioVenta: number;
  stockMinimo?: number;
  unidadMedida?: string;
}

export interface ConfirmarItemInput {
  linea: number;
  productoId?: number;
  crearProducto?: ProductoNuevoInput;
  cantidad: number;
  precioUnitario: number;
  alicuotaIva?: number;
}

export interface ComprobanteEditado {
  tipoComprobante?: string | null;
  puntoVenta?: number | null;
  numeroComprobante?: string | null;
  fechaComprobante?: string | null;
  subtotal?: number | null;
  iva?: number | null;
  percepciones?: number | null;
  total?: number | null;
  cae?: string | null;
}

export interface ConfirmarImportacionInput {
  proveedorId?: number;
  crearProveedor?: {
    nombre: string;
    cuit?: string;
    condicionIva?: "RESPONSABLE_INSCRIPTO" | "MONOTRIBUTO" | "CONSUMIDOR_FINAL" | "EXENTO";
    contacto?: string;
    telefono?: string;
    email?: string;
  };
  items: ConfirmarItemInput[];
  actualizarPrecioCosto?: boolean;
  comprobante?: ComprobanteEditado;
}

function esPdf(buffer: Buffer): boolean {
  return buffer.subarray(0, 1024).includes("%PDF-");
}

function numero(valor: Prisma.Decimal | null): number | null {
  return valor === null ? null : Number(valor);
}

function aDto(row: ImportacionSeleccionada) {
  return {
    id: row.id,
    estado: row.estado,
    motor: row.motor,
    nombreArchivo: row.nombreArchivo,
    tieneArchivo: Boolean(row.archivoMime),
    archivoHash: row.archivoHash,
    proveedorId: row.proveedorId,
    proveedorCuit: row.proveedorCuit,
    proveedorNombre: row.proveedorNombre,
    proveedor: row.proveedor,
    tipoComprobante: row.tipoComprobante,
    puntoVenta: row.puntoVenta,
    numeroComprobante: row.numeroComprobante,
    fechaComprobante: row.fechaComprobante?.toISOString() ?? null,
    subtotal: numero(row.subtotal),
    iva: numero(row.iva),
    percepciones: numero(row.percepciones),
    total: numero(row.total),
    cae: row.cae,
    items: (row.itemsJson as unknown as ItemImportado[]) ?? [],
    advertencias: (row.advertencias as unknown as AdvertenciaFactura[] | null) ?? [],
    confianza: row.confianza,
    error: row.error,
    compraId: row.compraId,
    creadoEn: row.creadoEn.toISOString(),
    actualizadoEn: row.actualizadoEn.toISOString(),
  };
}

function fechaDesdeIso(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const coincidencia = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!coincidencia) return null;
  const fecha = new Date(
    Date.UTC(Number(coincidencia[1]), Number(coincidencia[2]) - 1, Number(coincidencia[3]), 12, 0, 0)
  );
  return Number.isNaN(fecha.getTime()) ? null : fecha;
}

function tipoComprobanteLimpio(valor: string | null | undefined): string | null {
  if (!valor) return null;
  const limpio = valor.trim().toUpperCase().replace(/\s+/g, "_");
  return limpio || null;
}

function skuBase(codigo: string | null, nombre: string): string {
  const fuente = codigo?.trim() || nombre;
  const limpio = fuente
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24);
  return limpio || "PRODUCTO";
}

async function skuDisponible(tx: Prisma.TransactionClient, base: string): Promise<string> {
  let candidato = base;
  let sufijo = 2;
  while (await tx.producto.findUnique({ where: { sku: candidato }, select: { id: true } })) {
    candidato = `${base}-${sufijo}`;
    sufijo += 1;
  }
  return candidato;
}

function esErrorUnico(error: unknown): error is Prisma.PrismaClientKnownRequestError {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

function codigoDuplicado(error: Prisma.PrismaClientKnownRequestError): string {
  const objetivo = String(error.meta?.target ?? "");
  if (objetivo.includes("numero_comprobante") || objetivo.includes("comprobante")) {
    return "COMPROBANTE_DUPLICADO";
  }
  if (objetivo.includes("sku")) return "SKU_DUPLICADO";
  if (objetivo.includes("codigo_barras")) return "CODIGO_BARRAS_DUPLICADO";
  if (objetivo.includes("cuit")) return "CUIT_DUPLICADO";
  return "DUPLICADO";
}

async function buscarProveedorExacto(
  cuit: string | null
): Promise<{ id: number; nombre: string; cuit: string | null } | null> {
  if (!cuit) return null;
  return prisma.proveedor.findUnique({
    where: { cuit },
    select: { id: true, nombre: true, cuit: true },
  });
}

export async function importarFactura(input: {
  buffer: Buffer;
  nombreArchivo?: string;
  usuarioId: number;
}) {
  if (input.buffer.length === 0) {
    throw new AppError("ARCHIVO_VACIO", "El archivo está vacío", 400);
  }
  if (input.buffer.length > MAX_BYTES) {
    throw new AppError(
      "ARCHIVO_MUY_GRANDE",
      `El PDF supera el máximo de ${Math.round(MAX_BYTES / 1024 / 1024)} MB`,
      413
    );
  }
  if (!esPdf(input.buffer)) {
    throw new AppError("ARCHIVO_NO_PDF", "El archivo no parece ser un PDF", 415);
  }

  let paginas;
  try {
    paginas = await extraerLineasPdf(input.buffer);
  } catch (error) {
    throw new AppError(
      "PDF_ILEGIBLE",
      `No se pudo leer el PDF: ${(error as Error).message}`,
      422
    );
  }

  const texto = paginas
    .flatMap((pagina) => pagina.lineas)
    .map((linea) => linea.texto)
    .join("\n");
  if (!texto.trim()) {
    throw new AppError(
      "PDF_SIN_TEXTO",
      "El PDF no tiene texto seleccionable (parece escaneado o una foto). " +
        "Por ahora hay que cargar la compra a mano o generar un PDF electrónico.",
      422
    );
  }

  let extraida = parsearFactura(paginas, { cuitEmisor: process.env.ARCA_CUIT_EMISOR });
  let motor: "LOCAL" | "IA" = "LOCAL";
  const advertencias: AdvertenciaFactura[] = [...extraida.advertencias];

  if (extraida.items.length === 0 && iaConfigurada()) {
    try {
      const conIa = await extraerConIa(extraida.texto);
      if (conIa) {
        extraida = combinarExtracciones(extraida, conIa);
        motor = "IA";
        advertencias.push({
          codigo: "IA_USADA",
          mensaje:
            "Los ítems se extrajeron con IA porque el parser local no los detectó. Revisalos con atención.",
        });
      }
    } catch (error) {
      advertencias.push({
        codigo: "IA_FALLIDA",
        mensaje: `La extracción con IA falló: ${(error as Error).message}`,
      });
    }
  }

  const encabezado: EncabezadoFactura = extraida.encabezado;
  const cuit = encabezado.proveedorCuit;
  const proveedorExacto = await buscarProveedorExacto(cuit);

  let proveedorSugerido: { id: number; nombre: string; puntaje: number } | null = null;
  if (!proveedorExacto && encabezado.proveedorNombre) {
    const proveedores = await prisma.proveedor.findMany({ select: { id: true, nombre: true } });
    const sugerencia = buscarProveedorPorNombre(encabezado.proveedorNombre, proveedores);
    if (sugerencia) {
      const encontrado = proveedores.find((p) => p.id === sugerencia.proveedorId);
      if (encontrado) {
        proveedorSugerido = {
          id: encontrado.id,
          nombre: encontrado.nombre,
          puntaje: Math.round(sugerencia.puntaje * 100),
        };
      }
    }
  }

  const productos = await prisma.producto.findMany({
    where: { activo: true },
    select: {
      id: true,
      sku: true,
      nombre: true,
      codigoBarras: true,
      precioCosto: true,
      precioVenta: true,
      alicuotaIva: true,
    },
  });

  const equivalencias = proveedorExacto
    ? await prisma.productoProveedor.findMany({
        where: { proveedorId: proveedorExacto.id },
        select: { codigoProveedor: true, productoId: true },
      })
    : [];

  const items = sugerirProductos(
    extraida.items,
    productos.map((producto) => ({
      id: producto.id,
      sku: producto.sku,
      nombre: producto.nombre,
      codigoBarras: producto.codigoBarras,
      precioCosto: Number(producto.precioCosto),
      precioVenta: Number(producto.precioVenta),
      alicuotaIva: Number(producto.alicuotaIva),
    })),
    equivalencias
  );

  const hash = createHash("sha256").update(input.buffer).digest("hex");

  const archivoPrevio = await prisma.importacionFactura.findFirst({
    where: { archivoHash: hash, estado: { in: ["PENDIENTE", "CONFIRMADA"] } },
    select: { id: true, estado: true },
    orderBy: { creadoEn: "desc" },
  });
  if (archivoPrevio) {
    advertencias.push({
      codigo: "ARCHIVO_DUPLICADO",
      mensaje: `Este mismo archivo ya se importó (importación #${archivoPrevio.id}, estado ${archivoPrevio.estado}).`,
    });
  }

  if (proveedorExacto && encabezado.tipoComprobante && encabezado.numeroComprobante) {
    const compraPrevia = await prisma.compra.findFirst({
      where: {
        proveedorId: proveedorExacto.id,
        tipoComprobante: encabezado.tipoComprobante,
        puntoVenta: encabezado.puntoVenta,
        numeroComprobante: encabezado.numeroComprobante,
      },
      select: { id: true },
    });
    if (compraPrevia) {
      advertencias.push({
        codigo: "COMPROBANTE_DUPLICADO",
        mensaje: `Ya existe la compra #${compraPrevia.id} con este mismo comprobante.`,
      });
    }
  }

  const importacion = await prisma.importacionFactura.create({
    data: {
      usuarioId: input.usuarioId,
      nombreArchivo: input.nombreArchivo?.slice(0, 200) ?? null,
      archivoMime: "application/pdf",
      archivoContenido: input.buffer,
      archivoHash: hash,
      estado: "PENDIENTE",
      motor,
      proveedorId: proveedorExacto?.id ?? null,
      proveedorCuit: encabezado.proveedorCuit,
      proveedorNombre: encabezado.proveedorNombre,
      tipoComprobante: encabezado.tipoComprobante,
      puntoVenta: encabezado.puntoVenta,
      numeroComprobante: encabezado.numeroComprobante,
      fechaComprobante: fechaDesdeIso(encabezado.fechaComprobante),
      subtotal: encabezado.subtotal,
      iva: encabezado.iva,
      percepciones: encabezado.percepciones,
      total: encabezado.total,
      cae: encabezado.cae,
      itemsJson: items as unknown as Prisma.InputJsonValue,
      advertencias: advertencias as unknown as Prisma.InputJsonValue,
      confianza: extraida.confianza,
    },
    select: SELECTOR_IMPORTACION,
  });

  return { ...aDto(importacion), proveedorSugerido };
}

export async function listarImportaciones(estado?: "PENDIENTE" | "CONFIRMADA" | "DESCARTADA") {
  const filas = await prisma.importacionFactura.findMany({
    where: estado ? { estado } : undefined,
    select: SELECTOR_IMPORTACION,
    orderBy: { creadoEn: "desc" },
    take: 50,
  });
  return filas.map(aDto);
}

export async function obtenerImportacion(id: number) {
  const fila = await prisma.importacionFactura.findUnique({
    where: { id },
    select: SELECTOR_IMPORTACION,
  });
  if (!fila) throw new AppError("IMPORTACION_NO_ENCONTRADA", "La importación no existe", 404);
  return aDto(fila);
}

export async function obtenerArchivoImportacion(id: number) {
  const fila = await prisma.importacionFactura.findUnique({
    where: { id },
    select: { archivoContenido: true, archivoMime: true, nombreArchivo: true },
  });
  if (!fila) throw new AppError("IMPORTACION_NO_ENCONTRADA", "La importación no existe", 404);
  if (!fila.archivoContenido) {
    throw new AppError("ARCHIVO_NO_ENCONTRADO", "La importación no tiene el PDF guardado", 404);
  }
  return {
    contenido: Buffer.from(fila.archivoContenido),
    mime: fila.archivoMime ?? "application/pdf",
    nombre: fila.nombreArchivo ?? `factura-${id}.pdf`,
  };
}

export async function descartarImportacion(id: number) {
  const resultado = await prisma.importacionFactura.updateMany({
    where: { id, estado: "PENDIENTE" },
    data: { estado: "DESCARTADA" },
  });
  if (resultado.count === 0) {
    const existe = await prisma.importacionFactura.findUnique({ where: { id }, select: { estado: true } });
    if (!existe) throw new AppError("IMPORTACION_NO_ENCONTRADA", "La importación no existe", 404);
    throw new AppError(
      "IMPORTACION_NO_PENDIENTE",
      `La importación ya está ${existe.estado.toLowerCase()}`,
      409
    );
  }
}

export async function confirmarImportacion(
  id: number,
  input: ConfirmarImportacionInput,
  usuarioId: number
) {
  try {
    return await prisma.$transaction(async (tx) => {
      // Marcar la importación como confirmada dentro de la transacción evita
      // que dos requests simultáneos generen dos compras. Si algo falla, el
      // rollback la devuelve a PENDIENTE.
      const tomada = await tx.importacionFactura.updateMany({
        where: { id, estado: "PENDIENTE" },
        data: { estado: "CONFIRMADA" },
      });
      if (tomada.count === 0) {
        const existe = await tx.importacionFactura.findUnique({
          where: { id },
          select: { estado: true },
        });
        if (!existe) throw new AppError("IMPORTACION_NO_ENCONTRADA", "La importación no existe", 404);
        throw new AppError(
          "IMPORTACION_NO_PENDIENTE",
          `La importación ya está ${existe.estado.toLowerCase()}`,
          409
        );
      }

      const importacion = await tx.importacionFactura.findUnique({
        where: { id },
        select: SELECTOR_IMPORTACION,
      });
      if (!importacion) throw new AppError("IMPORTACION_NO_ENCONTRADA", "La importación no existe", 404);

      const itemsParseados = (importacion.itemsJson as unknown as ItemImportado[]) ?? [];
      const porLinea = new Map(itemsParseados.map((item) => [item.linea, item]));

      if (itemsParseados.length > 0) {
        const lineasEnviadas = new Set(input.items.map((item) => item.linea));
        if (lineasEnviadas.size !== itemsParseados.length) {
          throw new AppError(
            "ITEMS_INCOMPLETOS",
            `La factura tiene ${itemsParseados.length} línea(s) y se enviaron ${lineasEnviadas.size}. Asigná un producto a todas.`,
            400
          );
        }
        for (const item of itemsParseados) {
          if (!lineasEnviadas.has(item.linea)) {
            throw new AppError(
              "ITEMS_INCOMPLETOS",
              `Falta asignar la línea ${item.linea}: "${item.descripcion}"`,
              400
            );
          }
        }
      }

      let proveedorId = input.proveedorId ?? importacion.proveedorId ?? null;
      let proveedorCuit = importacion.proveedorCuit;

      if (input.crearProveedor) {
        const cuit = input.crearProveedor.cuit ? normalizarCuit(input.crearProveedor.cuit) : null;
        if (input.crearProveedor.cuit && !cuit) {
          throw new AppError("CUIT_INVALIDO", "El CUIT del proveedor no es válido", 400);
        }
        const existente = cuit ? await tx.proveedor.findUnique({ where: { cuit } }) : null;
        if (existente) {
          proveedorId = existente.id;
          proveedorCuit = existente.cuit;
        } else {
          const creado = await tx.proveedor.create({
            data: {
              nombre: input.crearProveedor.nombre.trim(),
              cuit,
              condicionIva: input.crearProveedor.condicionIva ?? null,
              contacto: input.crearProveedor.contacto ?? null,
              telefono: input.crearProveedor.telefono ?? null,
              email: input.crearProveedor.email ?? null,
            },
          });
          proveedorId = creado.id;
          proveedorCuit = creado.cuit;
        }
      }

      if (!proveedorId) {
        throw new AppError(
          "PROVEEDOR_REQUERIDO",
          "Elegí un proveedor existente o creá uno para confirmar la compra",
          400
        );
      }

      const proveedor = await tx.proveedor.findUnique({ where: { id: proveedorId } });
      if (!proveedor) throw new AppError("PROVEEDOR_NO_ENCONTRADO", "El proveedor no existe", 404);

      const comprobante = input.comprobante;
      const tipoComprobante = tipoComprobanteLimpio(
        comprobante?.tipoComprobante ?? importacion.tipoComprobante
      );
      const puntoVenta = comprobante?.puntoVenta ?? importacion.puntoVenta;
      const numeroComprobante = comprobante?.numeroComprobante ?? importacion.numeroComprobante;
      const fechaComprobante =
        fechaDesdeIso(comprobante?.fechaComprobante) ?? importacion.fechaComprobante ?? null;
      const subtotal = comprobante?.subtotal ?? numero(importacion.subtotal);
      const iva = comprobante?.iva ?? numero(importacion.iva);
      const percepciones = comprobante?.percepciones ?? numero(importacion.percepciones);
      const total = comprobante?.total ?? numero(importacion.total);
      const cae = comprobante?.cae ?? importacion.cae;

      if (tipoComprobante && puntoVenta !== null && numeroComprobante) {
        const compraPrevia = await tx.compra.findFirst({
          where: {
            proveedorId,
            tipoComprobante,
            puntoVenta,
            numeroComprobante,
          },
          select: { id: true },
        });
        if (compraPrevia) {
          throw new AppError(
            "COMPROBANTE_DUPLICADO",
            `Ya existe la compra #${compraPrevia.id} con el comprobante ${tipoComprobante} ${puntoVenta}-${numeroComprobante}`,
            409
          );
        }
      }

      const items: Array<{
        productoId: number;
        cantidad: number;
        precioUnitario: number;
        descripcion: string | null;
        codigoProveedor: string | null;
        alicuotaIva: number | null;
      }> = [];

      for (const item of input.items) {
        const parsed = porLinea.get(item.linea);
        if (itemsParseados.length > 0 && !parsed) {
          throw new AppError("LINEA_INEXISTENTE", `La línea ${item.linea} no pertenece a la factura`, 400);
        }
        if (!Number.isInteger(item.cantidad) || item.cantidad <= 0) {
          throw new AppError(
            "CANTIDAD_INVALIDA",
            `La cantidad de la línea ${item.linea} debe ser un entero mayor a cero`,
            400
          );
        }

        let productoId = item.productoId;
        if (!productoId) {
          if (!item.crearProducto) {
            throw new AppError(
              "PRODUCTO_REQUERIDO",
              `Elegí un producto o creá uno para la línea ${item.linea}`,
              400
            );
          }
          const nuevo = item.crearProducto;
          const alicuota = item.alicuotaIva ?? parsed?.alicuotaIva ?? 21;
          const codigoBarras = nuevo.codigoBarras?.trim() || null;
          if (codigoBarras) {
            const existeBarra = await tx.producto.findUnique({
              where: { codigoBarras },
              select: { id: true },
            });
            if (existeBarra) {
              throw new AppError(
                "CODIGO_BARRAS_DUPLICADO",
                `Ya existe un producto con el código de barras ${codigoBarras}`,
                409
              );
            }
          }
          const sku =
            nuevo.sku?.trim() ||
            (await skuDisponible(tx, skuBase(parsed?.codigoProveedor ?? null, nuevo.nombre)));
          const creado = await tx.producto.create({
            data: {
              sku,
              codigoBarras,
              nombre: nuevo.nombre.trim(),
              categoriaId: nuevo.categoriaId ?? null,
              precioCosto: item.precioUnitario,
              precioVenta: nuevo.precioVenta,
              stockActual: 0,
              stockMinimo: nuevo.stockMinimo ?? 0,
              alicuotaIva: alicuota,
              unidadMedida: nuevo.unidadMedida?.trim() || "unidades",
            },
          });
          productoId = creado.id;
        } else if (item.crearProducto) {
          throw new AppError(
            "PRODUCTO_AMBIGUO",
            `La línea ${item.linea} no puede tener producto existente y producto nuevo a la vez`,
            400
          );
        }

        if (productoId === undefined) {
          throw new AppError("PRODUCTO_REQUERIDO", `Falta el producto de la línea ${item.linea}`, 400);
        }

        items.push({
          productoId,
          cantidad: item.cantidad,
          precioUnitario: item.precioUnitario,
          descripcion: parsed?.descripcion ?? null,
          codigoProveedor: parsed?.codigoProveedor ?? null,
          alicuotaIva: item.alicuotaIva ?? parsed?.alicuotaIva ?? null,
        });
      }

      const compra = await registrarCompraEnTx(tx, {
        proveedorId,
        usuarioId,
        items,
        actualizarPrecioCosto: input.actualizarPrecioCosto ?? true,
        origen: "IMPORTADA",
        fiscal: {
          tipoComprobante,
          puntoVenta,
          numeroComprobante,
          fechaComprobante,
          proveedorCuit,
          subtotal,
          iva,
          percepciones,
          cae,
        },
        total,
      });

      // Aprender la equivalencia producto <-> proveedor para la próxima vez.
      for (const item of items) {
        if (!item.codigoProveedor) continue;
        await tx.productoProveedor.upsert({
          where: {
            proveedorId_codigoProveedor: {
              proveedorId,
              codigoProveedor: item.codigoProveedor,
            },
          },
          create: {
            proveedorId,
            productoId: item.productoId,
            codigoProveedor: item.codigoProveedor,
            descripcionProveedor: item.descripcion,
            ultimoPrecio: item.precioUnitario,
          },
          update: {
            productoId: item.productoId,
            descripcionProveedor: item.descripcion,
            ultimoPrecio: item.precioUnitario,
          },
        });
      }

      await tx.importacionFactura.update({
        where: { id },
        data: {
          estado: "CONFIRMADA",
          compraId: compra.id,
          proveedorId,
          proveedorCuit,
          tipoComprobante,
          puntoVenta,
          numeroComprobante,
          fechaComprobante,
          subtotal,
          iva,
          percepciones,
          total,
          cae,
        },
      });

      return compra;
    });
  } catch (error) {
    if (esErrorUnico(error)) {
      const codigo = codigoDuplicado(error);
      const mensajes: Record<string, string> = {
        COMPROBANTE_DUPLICADO: "Ya existe una compra con ese comprobante",
        SKU_DUPLICADO: "Ya existe un producto con ese SKU",
        CODIGO_BARRAS_DUPLICADO: "Ya existe un producto con ese código de barras",
        CUIT_DUPLICADO: "Ya existe un proveedor con ese CUIT",
        DUPLICADO: "Ya existe un registro con esos datos",
      };
      throw new AppError(codigo, mensajes[codigo] ?? mensajes.DUPLICADO, 409);
    }
    throw error;
  }
}
