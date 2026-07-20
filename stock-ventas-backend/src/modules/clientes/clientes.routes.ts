import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../../utils/asyncHandler";
import { requireAuth, requireRole } from "../../middleware/auth";
import * as service from "./clientes.service";

const router = Router();

router.use(requireAuth);

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const busqueda = req.query.busqueda ? String(req.query.busqueda) : undefined;
    const clientes = await service.listarClientes(busqueda);
    res.json(clientes);
  })
);

router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const cliente = await service.obtenerCliente(Number(req.params.id));
    res.json(cliente);
  })
);

router.get(
  "/:id/historial",
  asyncHandler(async (req, res) => {
    const historial = await service.obtenerHistorial(Number(req.params.id));
    res.json(historial);
  })
);

router.get(
  "/:id/cuenta-corriente/movimientos",
  requireRole("ADMIN"),
  asyncHandler(async (req, res) => {
    const movimientos = await service.obtenerMovimientosCuentaCorriente(Number(req.params.id));
    res.json(movimientos);
  })
);

const clienteSchema = z.object({
  nombre: z.string().min(1),
  telefono: z.string().optional(),
  email: z.string().email().optional(),
});

router.post(
  "/",
  asyncHandler(async (req, res) => {
    const input = clienteSchema.parse(req.body);
    const cliente = await service.crearCliente(input);
    res.status(201).json(cliente);
  })
);

router.put(
  "/:id",
  asyncHandler(async (req, res) => {
    const input = clienteSchema.partial().parse(req.body);
    const cliente = await service.actualizarCliente(Number(req.params.id), input);
    res.json(cliente);
  })
);

router.delete(
  "/:id",
  requireRole("ADMIN"),
  asyncHandler(async (req, res) => {
    await service.eliminarCliente(Number(req.params.id));
    res.status(204).send();
  })
);

const ajusteSchema = z.object({
  monto: z.number().refine((v) => v !== 0, "El monto no puede ser 0"),
  motivo: z.string().min(1),
  tipo: z.enum(["CARGO", "PAGO", "AJUSTE"]).optional(),
});

// Solo ADMIN ajusta cuenta corriente manualmente (pagos, condonaciones, etc.)
router.post(
  "/:id/cuenta-corriente/ajuste",
  requireRole("ADMIN"),
  asyncHandler(async (req, res) => {
    const { monto, motivo, tipo } = ajusteSchema.parse(req.body);
    const cliente = await service.ajustarCuentaCorriente(
      Number(req.params.id),
      monto,
      motivo,
      req.auth!.id,
      tipo
    );
    res.json(cliente);
  })
);

export default router;