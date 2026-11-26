import { Router } from "express";
import type { NextFunction, Request, Response } from "express";
import multer from "multer";
import { z } from "zod";
import { asyncHandler } from "../../../utils/asyncHandler";
import { AppError } from "../../../utils/AppError";
import { requireAuth, requireRole } from "../../../middleware/auth";
import * as service from "./importacion.service";

const router = Router();

router.use(requireAuth);
router.use(requireRole("ADMIN"));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024, files: 1 },
});

function recibirArchivo(req: Request, res: Response, next: NextFunction) {
  upload.single("archivo")(req, res, (error: unknown) => {
    if (!error) return next();
    if (error instanceof multer.MulterError) {
      const mensaje =
        error.code === "LIMIT_FILE_SIZE"
          ? "El PDF supera el máximo de 15 MB"
          : `No se pudo leer el archivo: ${error.message}`;
      return next(new AppError("ARCHIVO_INVALIDO", mensaje, 400));
    }
    return next(new AppError("ARCHIVO_INVALIDO", (error as Error).message, 400));
  });
}

const productoNuevoSchema = z.object({
  sku: z.string().min(1).max(50).optional(),
  codigoBarras: z.string().max(80).optional(),
  nombre: z.string().min(1).max(200),
  categoriaId: z.number().int().positive().optional(),
  precioVenta: z.number().nonnegative(),
  stockMinimo: z.number().int().nonnegative().optional(),
  unidadMedida: z.string().min(1).max(40).optional(),
});

const itemConfirmarSchema = z
  .object({
    linea: z.number().int().positive(),
    productoId: z.number().int().positive().optional(),
    crearProducto: productoNuevoSchema.optional(),
    cantidad: z.number().int().positive(),
    precioUnitario: z.number().nonnegative(),
    alicuotaIva: z.number().optional(),
  })
  .refine((item) => Boolean(item.productoId) !== Boolean(item.crearProducto), {
    message: "Cada línea debe tener un producto existente o uno nuevo (no ambos)",
  });

const comprobanteSchema = z.object({
  tipoComprobante: z.string().max(20).nullable().optional(),
  puntoVenta: z.number().int().nonnegative().nullable().optional(),
  numeroComprobante: z.string().max(30).nullable().optional(),
  fechaComprobante: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida").nullable().optional(),
  subtotal: z.number().nonnegative().nullable().optional(),
  iva: z.number().nonnegative().nullable().optional(),
  percepciones: z.number().nonnegative().nullable().optional(),
  total: z.number().nonnegative().nullable().optional(),
  cae: z.string().max(30).nullable().optional(),
});

const confirmarSchema = z.object({
  proveedorId: z.number().int().positive().optional(),
  crearProveedor: z
    .object({
      nombre: z.string().min(1).max(200),
      cuit: z.string().max(20).optional(),
      condicionIva: z
        .enum(["RESPONSABLE_INSCRIPTO", "MONOTRIBUTO", "CONSUMIDOR_FINAL", "EXENTO"])
        .optional(),
      contacto: z.string().max(200).optional(),
      telefono: z.string().max(60).optional(),
      email: z.string().email().optional(),
    })
    .optional(),
  items: z.array(itemConfirmarSchema).min(1),
  actualizarPrecioCosto: z.boolean().optional(),
  comprobante: comprobanteSchema.optional(),
});

router.post(
  "/",
  recibirArchivo,
  asyncHandler(async (req, res) => {
    const archivo = req.file;
    if (!archivo) {
      throw new AppError("ARCHIVO_REQUERIDO", "Adjuntá el PDF de la factura en el campo 'archivo'", 400);
    }
    const importacion = await service.importarFactura({
      buffer: archivo.buffer,
      nombreArchivo: archivo.originalname,
      usuarioId: req.auth!.id,
    });
    res.status(201).json(importacion);
  })
);

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const query = z
      .object({
        estado: z.enum(["PENDIENTE", "CONFIRMADA", "DESCARTADA"]).optional(),
      })
      .parse(req.query);
    const importaciones = await service.listarImportaciones(query.estado);
    res.json(importaciones);
  })
);

router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const importacion = await service.obtenerImportacion(Number(req.params.id));
    res.json(importacion);
  })
);

router.get(
  "/:id/archivo",
  asyncHandler(async (req, res) => {
    const archivo = await service.obtenerArchivoImportacion(Number(req.params.id));
    const nombre = archivo.nombre.replace(/[^\w.-]+/g, "_");
    res.setHeader("Content-Type", archivo.mime);
    res.setHeader("Content-Disposition", `inline; filename="${nombre}"`);
    res.send(archivo.contenido);
  })
);

router.post(
  "/:id/confirmar",
  asyncHandler(async (req, res) => {
    const input = confirmarSchema.parse(req.body);
    const compra = await service.confirmarImportacion(Number(req.params.id), input, req.auth!.id);
    res.status(201).json(compra);
  })
);

router.post(
  "/:id/descartar",
  asyncHandler(async (req, res) => {
    await service.descartarImportacion(Number(req.params.id));
    res.status(204).send();
  })
);

export default router;
