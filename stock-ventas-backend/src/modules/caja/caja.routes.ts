import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../../utils/asyncHandler";
import { zFechaDesde, zFechaHasta } from "../../utils/fechas";
import { requireAuth, requireRole } from "../../middleware/auth";
import * as service from "./caja.service";

const router = Router();

router.use(requireAuth);

router.get(
  "/actual",
  asyncHandler(async (req, res) => {
    // La caja "actual" es la del usuario que pregunta (una por cajero).
    const estado = await service.obtenerEstadoActual(req.auth!.id);
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
  // Opcional: solo ADMIN puede indicar una caja que no es suya para cerrarla.
  cajaId: z.number().int().positive().optional(),
});

router.post(
  "/cierre",
  asyncHandler(async (req, res) => {
    const { montoFinalContado, cajaId } = cierreSchema.parse(req.body);
    const caja = await service.cerrarCaja(req.auth!.id, montoFinalContado, {
      cajaId,
      esAdmin: req.auth!.rol === "ADMIN",
    });
    res.json(caja);
  })
);

router.get(
  "/historial",
  requireRole("ADMIN"),
  asyncHandler(async (req, res) => {
    const query = z
      .object({
        desde: zFechaDesde.optional(),
        hasta: zFechaHasta.optional(),
      })
      .parse(req.query);

    const historial = await service.listarHistorialCajas(query);
    res.json(historial);
  })
);

export default router;