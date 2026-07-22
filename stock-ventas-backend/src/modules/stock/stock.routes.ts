import { Router } from "express";
import { z } from "zod";
import { TipoMovimientoStock } from "@prisma/client";
import { asyncHandler } from "../../utils/asyncHandler";
import { requireAuth } from "../../middleware/auth";
import * as service from "./stock.service";

const router = Router();

// Ver el historial de movimientos no requiere rol ADMIN — es información de
// consulta, igual que ver el listado de productos. Ajustar stock a mano sigue
// restringido a ADMIN en /productos/:id/ajuste-stock.
router.use(requireAuth);

const TIPOS_VALIDOS = ["venta", "compra", "ajuste", "devolucion", "ajuste_inicial"] as const;

router.get(
  "/movimientos",
  asyncHandler(async (req, res) => {
    const query = z
      .object({
        producto_id: z.coerce.number().optional(),
        tipo: z.enum(TIPOS_VALIDOS).optional(),
        desde: z.coerce.date().optional(),
        hasta: z.coerce.date().optional(),
        page: z.coerce.number().min(1).optional(),
        limit: z.coerce.number().min(1).max(100).optional(),
      })
      .parse(req.query);

    const result = await service.listarMovimientos({
      productoId: query.producto_id,
      tipo: query.tipo ? (query.tipo.toUpperCase() as TipoMovimientoStock) : undefined,
      desde: query.desde,
      hasta: query.hasta,
      page: query.page,
      limit: query.limit,
    });

    res.json(result);
  })
);

export default router;