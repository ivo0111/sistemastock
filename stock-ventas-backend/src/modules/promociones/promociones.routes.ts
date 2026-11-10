import { Router } from "express";
import { z } from "zod";
import { TipoPromocion } from "@prisma/client";
import { asyncHandler } from "../../utils/asyncHandler";
import { requireAuth, requireRole } from "../../middleware/auth";
import { zFechaDesde, zFechaHasta } from "../../utils/fechas";
import * as service from "./promociones.service";

const router = Router();

router.use(requireAuth);

const promocionBaseSchema = z.object({
  nombre: z.string().min(1),
  tipo: z.nativeEnum(TipoPromocion),
  productoId: z.number().int().positive().nullable().optional(),
  valor: z.number().min(0).max(100),
  cantidadMinima: z.number().int().min(1).optional(),
  activo: z.boolean().optional(),
  // Fechas como día del negocio (YYYY-MM-DD, hora Argentina). z.coerce.date()
  // las interpretaba como 00:00 UTC, y un "válido hasta el 12" terminaba a las
  // 21:00 del 11 (día corrido en el POS y en la grilla).
  fechaInicio: zFechaDesde.nullable().optional(),
  fechaFin: zFechaHasta.nullable().optional(),
});

const promocionSchema = promocionBaseSchema
  .refine((p) => !(p.fechaInicio && p.fechaFin && p.fechaFin < p.fechaInicio), {
    message: "La fecha de fin no puede ser anterior a la fecha de inicio",
    path: ["fechaFin"],
  });

// Vigentes para el POS: cualquier usuario logueado puede verlas.
router.get(
  "/activas",
  asyncHandler(async (req, res) => {
    const promociones = await service.obtenerPromocionesActivas();
    res.json(promociones);
  })
);

router.get(
  "/",
  requireRole("ADMIN"),
  asyncHandler(async (req, res) => {
    const promociones = await service.listarPromociones();
    res.json(promociones);
  })
);

router.post(
  "/",
  requireRole("ADMIN"),
  asyncHandler(async (req, res) => {
    const input = promocionSchema.parse(req.body);
    const promocion = await service.crearPromocion(input);
    res.status(201).json(promocion);
  })
);

const idParamSchema = z.coerce.number().int().positive();

router.put(
  "/:id",
  requireRole("ADMIN"),
  asyncHandler(async (req, res) => {
    const id = idParamSchema.parse(req.params.id);
    const input = promocionBaseSchema.partial().parse(req.body);
    const promocion = await service.actualizarPromocion(id, input);
    res.json(promocion);
  })
);

router.delete(
  "/:id",
  requireRole("ADMIN"),
  asyncHandler(async (req, res) => {
    const id = idParamSchema.parse(req.params.id);
    await service.eliminarPromocion(id);
    res.status(204).send();
  })
);

export default router;
