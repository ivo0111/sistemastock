import { Router } from "express";
import { z } from "zod";
import { EstadoVenta } from "@prisma/client";
import { asyncHandler } from "../../utils/asyncHandler";
import { requireAuth, requireRole } from "../../middleware/auth";
import * as service from "./ventas.service";
import { FormaPago } from "@prisma/client";

const router = Router();

router.use(requireAuth);

const crearVentaSchema = z.object({
  clienteId: z.number().optional(),
  items: z
    .array(
      z.object({
        productoId: z.number(),
        cantidad: z.number().int().positive(),
        precioUnitario: z.number().nonnegative(),
      })
    )
    .min(1),
  formaPago: z.nativeEnum(FormaPago),
  descuento: z.number().nonnegative().optional(),
});

router.post(
  "/",
  asyncHandler(async (req, res) => {
    const input = crearVentaSchema.parse(req.body);
    const venta = await service.crearVenta({ ...input, usuarioId: req.auth!.id });
    res.status(201).json(venta);
  })
);

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const query = z
      .object({
        desde: z.coerce.date().optional(),
        hasta: z.coerce.date().optional(),
        usuario_id: z.coerce.number().optional(),
        estado: z.string().optional(),
        page: z.coerce.number().min(1).optional(),
        limit: z.coerce.number().min(1).max(100).optional(),
      })
      .parse(req.query);

    const ventas = await service.listarVentas({
      desde: query.desde,
      hasta: query.hasta,
      usuarioId: query.usuario_id,
      estado: query.estado as EstadoVenta | undefined,
      page: query.page,
      limit: query.limit,
    });
    res.json(ventas);
  })
);

router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const venta = await service.obtenerVenta(Number(req.params.id));
    res.json(venta);
  })
);

const anularSchema = z.object({ motivo: z.string().min(1) });

// Solo ADMIN puede anular ventas (con un solo vendedor, decisión conservadora)
router.post(
  "/:id/anular",
  requireRole("ADMIN"),
  asyncHandler(async (req, res) => {
    const { motivo } = anularSchema.parse(req.body);
    const venta = await service.anularVenta(Number(req.params.id), motivo, req.auth!.id);
    res.json(venta);
  })
);

export default router;
