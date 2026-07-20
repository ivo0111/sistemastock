import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../../utils/asyncHandler";
import { requireAuth, requireRole } from "../../middleware/auth";
import * as service from "./proveedores.service";

const router = Router();

router.use(requireAuth);

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const proveedores = await service.listarProveedores();
    res.json(proveedores);
  })
);

router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const proveedor = await service.obtenerProveedor(Number(req.params.id));
    res.json(proveedor);
  })
);

const proveedorSchema = z.object({
  nombre: z.string().min(1),
  contacto: z.string().optional(),
  telefono: z.string().optional(),
  email: z.string().email().optional(),
});

router.post(
  "/",
  requireRole("ADMIN"),
  asyncHandler(async (req, res) => {
    const input = proveedorSchema.parse(req.body);
    const proveedor = await service.crearProveedor(input);
    res.status(201).json(proveedor);
  })
);

router.put(
  "/:id",
  requireRole("ADMIN"),
  asyncHandler(async (req, res) => {
    const input = proveedorSchema.partial().parse(req.body);
    const proveedor = await service.actualizarProveedor(Number(req.params.id), input);
    res.json(proveedor);
  })
);

router.delete(
  "/:id",
  requireRole("ADMIN"),
  asyncHandler(async (req, res) => {
    await service.eliminarProveedor(Number(req.params.id));
    res.status(204).send();
  })
);

export default router;