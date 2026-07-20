import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../../utils/asyncHandler";
import { requireAuth, requireRole } from "../../middleware/auth";
import * as service from "./reportes.service";

const router = Router();

// Todos los reportes son solo para ADMIN — con un solo vendedor, esta
// información (márgenes, costos) no debería estar expuesta a ese rol.
router.use(requireAuth, requireRole("ADMIN"));

const rangoSchema = z.object({
  desde: z.coerce.date().optional(),
  hasta: z.coerce.date().optional(),
});

function rangoPorDefecto(desde?: Date, hasta?: Date) {
  // Por defecto: últimos 30 días
  const hastaFinal = hasta ?? new Date();
  const desdeFinal = desde ?? new Date(hastaFinal.getTime() - 30 * 24 * 60 * 60 * 1000);
  return { desdeFinal, hastaFinal };
}

router.get(
  "/ventas",
  asyncHandler(async (req, res) => {
    const query = rangoSchema
      .extend({ agrupar_por: z.enum(["dia", "semana", "mes"]).optional() })
      .parse(req.query);
    const { desdeFinal, hastaFinal } = rangoPorDefecto(query.desde, query.hasta);

    const data = await service.reporteVentas(desdeFinal, hastaFinal, query.agrupar_por);
    res.json({ desde: desdeFinal, hasta: hastaFinal, data });
  })
);

router.get(
  "/productos-mas-vendidos",
  asyncHandler(async (req, res) => {
    const query = rangoSchema
      .extend({ limit: z.coerce.number().min(1).max(50).optional() })
      .parse(req.query);
    const { desdeFinal, hastaFinal } = rangoPorDefecto(query.desde, query.hasta);

    const data = await service.productosMasVendidos(desdeFinal, hastaFinal, query.limit);
    res.json({ desde: desdeFinal, hasta: hastaFinal, data });
  })
);

router.get(
  "/margen",
  asyncHandler(async (req, res) => {
    const query = rangoSchema.parse(req.query);
    const { desdeFinal, hastaFinal } = rangoPorDefecto(query.desde, query.hasta);

    const data = await service.reporteMargen(desdeFinal, hastaFinal);
    res.json({ desde: desdeFinal, hasta: hastaFinal, ...data });
  })
);

router.get(
  "/stock-bajo",
  asyncHandler(async (req, res) => {
    const data = await service.productosStockBajo();
    res.json(data);
  })
);

export default router;