import { Router } from "express";
import { z } from "zod";
import rateLimit from "express-rate-limit";
import { asyncHandler } from "../../utils/asyncHandler";
import { requireAuth } from "../../middleware/auth";
import { login } from "./auth.service";
import { cambiarPasswordPropia } from "../usuarios/usuarios.service";

const router = Router();

// Limita los intentos de login para dificultar fuerza bruta.
// La ventana es corta y el máximo bajo: en el uso normal del negocio
// (una pantalla de login, uno o dos usuarios) no se llega al límite.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: {
      code: "DEMASIADOS_INTENTOS",
      message: "Demasiados intentos de login. Probá de nuevo en unos minutos.",
    },
  },
});

const loginSchema = z.object({
  usuario: z.string().min(1),
  password: z.string().min(1),
});

router.post(
  "/login",
  loginLimiter,
  asyncHandler(async (req, res) => {
    const { usuario, password } = loginSchema.parse(req.body);
    const result = await login(usuario, password);
    res.json(result);
  })
);

const cambiarPasswordSchema = z.object({
  passwordActual: z.string().min(1),
  passwordNuevo: z.string().min(6, "La nueva contraseña debe tener al menos 6 caracteres"),
});

// Cualquier usuario logueado puede cambiar su propia contraseña
router.post(
  "/cambiar-password",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { passwordActual, passwordNuevo } = cambiarPasswordSchema.parse(req.body);
    await cambiarPasswordPropia(req.auth!.id, passwordActual, passwordNuevo);
    res.status(204).send();
  })
);

export default router;
