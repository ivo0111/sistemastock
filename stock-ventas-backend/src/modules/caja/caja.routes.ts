import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../../utils/asyncHandler";
import { requireAuth, requireRole } from "../../middleware/auth";
import * as service from "./caja.service";

const router = Router();

router.use(requireAuth);

router.get(
  "/actual",
  asyncHandler(async (req, res) => {
    const estado = await service.obtenerEstadoActual();
    res.json(estado);
  })
);

const aperturaSchema = z.object({
  montoInicial: z.number().nonnegative(),
});

router.post(
  "/apertura",
  asyncHandler(async (req, res) => {
    const { montoInicial } = aperturaSchema.parse(req.body);
    const caja = await service.abrirCaja(req.auth!.id, montoInicial);
    res.status(201).json(caja);
  })
);

const cierreSchema = z.object({
  montoFinalContado: z.number().nonnegative(),
});

router.post(
  "/cierre",
  asyncHandler(async (req, res) => {
    const { montoFinalContado } = cierreSchema.parse(req.body);
    const caja = await service.cerrarCaja(req.auth!.id, montoFinalContado);
    res.json(caja);
  })
);

router.get(
  "/historial",
  requireRole("ADMIN"),
  asyncHandler(async (req, res) => {
    const query = z
      .object({
        desde: z.coerce.date().optional(),
        hasta: z.coerce.date().optional(),
      })
      .parse(req.query);

    const historial = await service.listarHistorialCajas(query);
    res.json(historial);
  })
);

export default router;