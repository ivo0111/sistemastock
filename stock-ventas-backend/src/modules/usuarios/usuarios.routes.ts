import { Router } from "express";
import { z } from "zod";
import { Rol } from "@prisma/client";
import { asyncHandler } from "../../utils/asyncHandler";
import { AppError } from "../../utils/AppError";
import { requireAuth, requireRole } from "../../middleware/auth";
import * as service from "./usuarios.service";

const router = Router();

// Gestión de usuarios: solo ADMIN
router.use(requireAuth, requireRole("ADMIN"));

const PASSWORD_MIN = 6;

const crearSchema = z.object({
  nombre: z.string().min(1),
  usuario: z.string().min(1),
  password: z.string().min(PASSWORD_MIN, `La contraseña debe tener al menos ${PASSWORD_MIN} caracteres`),
  rol: z.nativeEnum(Rol),
});

router.get(
  "/",
  asyncHandler(async (req, res) => {
    res.json(await service.listarUsuarios());
  })
);

router.post(
  "/",
  asyncHandler(async (req, res) => {
    const input = crearSchema.parse(req.body);
    res.status(201).json(await service.crearUsuario(input));
  })
);

const actualizarSchema = z.object({
  nombre: z.string().min(1).optional(),
  password: z.string().min(PASSWORD_MIN, `La contraseña debe tener al menos ${PASSWORD_MIN} caracteres`).optional(),
  rol: z.nativeEnum(Rol).optional(),
  activo: z.boolean().optional(),
});

router.put(
  "/:id",
  asyncHandler(async (req, res) => {
    const input = actualizarSchema.parse(req.body);
    const id = Number(req.params.id);

    // Guardas para no quedar sin admins: no puedes desactivarte ni sacarte el rol ADMIN
    if (id === req.auth!.id) {
      if (input.activo === false) {
        throw new AppError("AUTO_DESACTIVACION", "No podés desactivar tu propio usuario", 400);
      }
      if (input.rol !== undefined && input.rol !== Rol.ADMIN) {
        throw new AppError("AUTO_DEMOCION", "No podés quitar tu propio rol de ADMIN", 400);
      }
    }

    res.json(await service.actualizarUsuario(id, input));
  })
);

export default router;
