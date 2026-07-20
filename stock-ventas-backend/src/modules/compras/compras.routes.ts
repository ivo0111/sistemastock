import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../../utils/asyncHandler";
import { requireAuth, requireRole } from "../../middleware/auth";
import * as service from "./compras.service";

const router = Router();

router.use(requireAuth);

const crearCompraSchema = z.object({
  proveedorId: z.number(),
  items: z
    .array(
      z.object({
        productoId: z.number(),
        cantidad: z.number().int().positive(),
        precioUnitario: z.number().nonnegative(),
      })
    )
    .min(1),
  actualizarPrecioCosto: z.boolean().optional(),
});

// Solo ADMIN registra compras (reposición de stock), con un solo vendedor
// no tiene sentido que lo haga el rol VENDEDOR
router.post(
  "/",
  requireRole("ADMIN"),
  asyncHandler(async (req, res) => {
    const input = crearCompraSchema.parse(req.body);
    const compra = await service.crearCompra({ ...input, usuarioId: req.auth!.id });
    res.status(201).json(compra);
  })
);

router.get(
  "/",
  requireRole("ADMIN"),
  asyncHandler(async (req, res) => {
    const query = z
      .object({
        desde: z.coerce.date().optional(),
        hasta: z.coerce.date().optional(),
        proveedor_id: z.coerce.number().optional(),
        page: z.coerce.number().min(1).optional(),
        limit: z.coerce.number().min(1).max(100).optional(),
      })
      .parse(req.query);

    const compras = await service.listarCompras({
      desde: query.desde,
      hasta: query.hasta,
      proveedorId: query.proveedor_id,
      page: query.page,
      limit: query.limit,
    });
    res.json(compras);
  })
);

router.get(
  "/:id",
  requireRole("ADMIN"),
  asyncHandler(async (req, res) => {
    const compra = await service.obtenerCompra(Number(req.params.id));
    res.json(compra);
  })
);

export default router;