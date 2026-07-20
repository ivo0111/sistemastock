import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../../utils/asyncHandler";
import { requireAuth, requireRole } from "../../middleware/auth";
import * as service from "./categorias.service";

const router = Router();

router.use(requireAuth);

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const categorias = await service.listarCategorias();
    res.json(categorias);
  })
);

const nombreSchema = z.object({ nombre: z.string().min(1) });

router.post(
  "/",
  requireRole("ADMIN"),
  asyncHandler(async (req, res) => {
    const { nombre } = nombreSchema.parse(req.body);
    const categoria = await service.crearCategoria(nombre);
    res.status(201).json(categoria);
  })
);

router.put(
  "/:id",
  requireRole("ADMIN"),
  asyncHandler(async (req, res) => {
    const { nombre } = nombreSchema.parse(req.body);
    const categoria = await service.actualizarCategoria(Number(req.params.id), nombre);
    res.json(categoria);
  })
);

router.delete(
  "/:id",
  requireRole("ADMIN"),
  asyncHandler(async (req, res) => {
    await service.eliminarCategoria(Number(req.params.id));
    res.status(204).send();
  })
);

export default router;